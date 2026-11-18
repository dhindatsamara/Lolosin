-- ============================================================================
-- Lolosin: migrasi 004, kode redeem + sinkron progress + juara mingguan
-- ============================================================================
--
-- CARA PAKAI:
--   1. Buka dashboard Supabase proyek "lolosin".
--   2. Masuk ke SQL Editor, buat query baru.
--   3. Paste seluruh isi file ini, lalu klik Run.
--   4. Skrip ini aman di-run ulang: semua perintah memakai IF NOT EXISTS,
--      setiap policy di-drop dulu sebelum dibuat ulang, dan semua fungsi
--      memakai CREATE OR REPLACE.
--   5. BLOK pg_cron di akhir file ini SENGAJA dikomentari. Jalankan blok
--      itu terpisah SETELAH ekstensi pg_cron diaktifkan
--      (Dashboard > Database > Extensions). Lihat
--      docs/PANDUAN-MIGRASI-004.md untuk langkah lengkapnya.
--
-- YANG DITAMBAH:
--   - profiles.premium_until: timestamptz, akhir masa premium user.
--     NULL berarti tidak premium.
--   - codes: kode redeem premium (dibuat Dhinda, atau otomatis untuk
--     juara mingguan). RLS aktif TANPA policy client: hanya fungsi
--     security definer di bawah dan service role yang bisa akses.
--   - code_redemptions: jejak siapa redeem kode apa (mencegah klaim
--     ganda). RLS aktif, tanpa policy client.
--   - user_progress: progress belajar per user (JSONB) untuk sinkron
--     antar perangkat. RLS aktif, owner-only.
--   - redeem_code(p_code): RPC untuk klaim kode dari app.
--   - create_redeem_code(...): RPC khusus Dhinda untuk membuat kode.
--   - announce_weekly_winners(): pengumuman juara mingguan (dari
--     supabase/WEEKLY-WINNERS-AUTOMATION.md, ditambah pemberian
--     premium langsung ke profil juara global dan satu kode klaim
--     per juara global).
--
-- CATATAN:
--   - premium_until di weekly_winners (migrasi 001) tetap dihitung
--     dari jam pengumuman (now() + 7/5/3 hari). premium_until di
--     profiles dihitung dari tanggal aktif terjauh, supaya sisa
--     premium user tidak hangus kalau masih aktif saat menang.
--     Keduanya bisa berbeda, dan itu disengaja.
--   - Kode juara mingguan kedaluwarsa di tanggal premium_until
--     profil yang baru diberikan.
--   - Fungsi redeem_code dan create_redeem_code memakai auth.uid(),
--     jadi hanya bisa dipanggil dari app oleh user yang login.
--     Dari SQL Editor keduanya tidak bisa dites (tidak ada user
--     login di SQL Editor). announce_weekly_winners bisa dijalankan
--     manual dari SQL Editor.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles.premium_until
-- ----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists premium_until timestamptz;

-- ----------------------------------------------------------------------------
-- 2. codes
-- ----------------------------------------------------------------------------
--
-- Kode redeem premium. Alfabet kode: 10 karakter dari
-- ABCDEFGHJKMNPQRSTUVWXYZ23456789 (tanpa huruf dan angka yang mirip:
-- I, L, O, 0, 1). Kode disimpan huruf besar; redeem_code menerima
-- input huruf kecil juga (diubah ke huruf besar dulu).
-- RLS aktif TANPA policy client: baca tulis hanya lewat fungsi
-- security definer di bawah (dan service role, yang melewati RLS).

create table if not exists public.codes (
  code text primary key,
  premium_days integer not null check (premium_days > 0),
  max_uses integer not null default 1 check (max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz,
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.codes enable row level security;

-- ----------------------------------------------------------------------------
-- 3. code_redemptions
-- ----------------------------------------------------------------------------
--
-- Satu baris per klaim. Primary key (user_id, code) mencegah user
-- yang sama redeem kode yang sama dua kali, bahkan tanpa cek di app.
-- RLS aktif, tanpa policy client (sama seperti codes).

create table if not exists public.code_redemptions (
  user_id uuid references public.profiles (id),
  code text references public.codes (code),
  redeemed_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.code_redemptions enable row level security;

-- ----------------------------------------------------------------------------
-- 4. user_progress
-- ----------------------------------------------------------------------------
--
-- Progress belajar per user (XP, streak, materi selesai, dan lain-lain)
-- dalam satu dokumen JSONB, supaya progress tersinkron antar perangkat
-- dan tidak lagi hanya di localStorage browser. updated_at diisi app
-- saat menyimpan (dipakai untuk menentukan salinan terbaru).

create table if not exists public.user_progress (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_progress enable row level security;

-- Owner-only: user hanya bisa baca tulis barisnya sendiri.
drop policy if exists user_progress_select_own on public.user_progress;
create policy user_progress_select_own
  on public.user_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_progress_insert_own on public.user_progress;
create policy user_progress_insert_own
  on public.user_progress
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_progress_update_own on public.user_progress;
create policy user_progress_update_own
  on public.user_progress
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists user_progress_delete_own on public.user_progress;
create policy user_progress_delete_own
  on public.user_progress
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. redeem_code(p_code)
-- ----------------------------------------------------------------------------
--
-- Klaim kode dari app. Mengembalikan jsonb:
--   sukses: {"ok": true, "days": 7, "premium_until": "..."}
--   gagal:  {"ok": false, "error": "not_found" | "expired" | "used_up"
--            | "already_redeemed" | "not_signed_in" | "no_profile"}
-- Atomik: satu transaksi, baris codes dikunci (FOR UPDATE) supaya dua
-- klaim bersamaan tidak bisa menghabiskan jatah yang sama.
-- Premium diperpanjang dari tanggal aktif terjauh (bukan dari now()
-- bila premium masih aktif), supaya sisa premium tidak hangus.

create or replace function public.redeem_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_row public.codes%rowtype;
  v_user uuid := auth.uid();
  v_new_until timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  if not exists (
    select 1 from public.profiles where id = v_user
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  select * into v_row
  from public.codes
  where code = v_code
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_row.expires_at is not null and v_row.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  if exists (
    select 1
    from public.code_redemptions r
    where r.user_id = v_user
      and r.code = v_row.code
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_redeemed');
  end if;

  if v_row.uses >= v_row.max_uses then
    return jsonb_build_object('ok', false, 'error', 'used_up');
  end if;

  insert into public.code_redemptions (user_id, code)
  values (v_user, v_row.code);

  update public.codes
  set uses = uses + 1
  where code = v_row.code;

  update public.profiles
  set premium_until = greatest(coalesce(premium_until, now()), now())
    + make_interval(days => v_row.premium_days)
  where id = v_user
  returning premium_until into v_new_until;

  return jsonb_build_object(
    'ok', true,
    'days', v_row.premium_days,
    'premium_until', v_new_until
  );
end;
$$;

-- Hanya user login yang boleh memanggil. (Secara default Postgres
-- memberi execute ke public; revoke dulu supaya anon tidak bisa.)
revoke all on function public.redeem_code(text) from public;
grant execute on function public.redeem_code(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. create_redeem_code(...)
-- ----------------------------------------------------------------------------
--
-- Hanya Dhinda (username 'dhindaimup') yang boleh membuat kode.
-- Dipanggil dari app saat Dhinda login; dari SQL Editor selalu
-- gagal ('forbidden') karena tidak ada user login di sana.
-- Mengembalikan kode 10 karakter yang baru dibuat.

create or replace function public.create_redeem_code(
  p_premium_days int,
  p_max_uses int,
  p_expires_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_i int;
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and username = 'dhindaimup'
  ) then
    raise exception 'forbidden';
  end if;

  if p_premium_days is null or p_premium_days <= 0 then
    raise exception 'premium_days harus lebih dari 0';
  end if;

  if p_max_uses is null or p_max_uses <= 0 then
    raise exception 'max_uses harus lebih dari 0';
  end if;

  -- Generate sampai dapat kode yang belum dipakai.
  loop
    v_code := '';
    for v_i in 1..10 loop
      v_code := v_code || substr(
        v_alphabet,
        floor(random() * length(v_alphabet) + 1)::int,
        1
      );
    end loop;
    exit when not exists (
      select 1 from public.codes where code = v_code
    );
  end loop;

  insert into public.codes
    (code, premium_days, max_uses, expires_at, created_by)
  values
    (v_code, p_premium_days, p_max_uses, p_expires_at, auth.uid());

  return v_code;
end;
$$;

-- Hanya user login yang boleh memanggil; cek "hanya Dhinda" ada di
-- dalam fungsi (revoke dari public supaya anon tidak bisa).
revoke all on function public.create_redeem_code(int, int, timestamptz) from public;
grant execute on function public.create_redeem_code(int, int, timestamptz) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. announce_weekly_winners()
-- ----------------------------------------------------------------------------
--
-- Disalin dari supabase/WEEKLY-WINNERS-AUTOMATION.md, ditambah:
--   (a) premium langsung ke profiles.premium_until tiap juara global
--       (diperpanjang dari tanggal aktif terjauh);
--   (b) satu kode klaim single-use per juara global di tabel codes
--       (kedaluwarsa di premium_until yang baru diberikan).
-- Juara per formasi tetap badge saja (premium_until NULL).
-- badge_awarded tetap false: lencana diberikan app saat membaca
-- weekly_winners.
-- Aman dijalankan ulang: minggu yang sudah diumumkan dilewati, dan
-- insert memakai ON CONFLICT DO NOTHING. Fungsi memproses SEMUA
-- minggu yang sudah selesai tapi belum diumumkan, jadi bisa mengejar
-- minggu yang tertinggal.

create or replace function public.announce_weekly_winners()
returns table (
  week_start date,
  scope text,
  rank int,
  user_id uuid,
  total int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week date;
  v_monday_now date;
  v_winner record;
  v_days int;
  v_new_until timestamptz;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_i int;
begin
  -- Senin minggu berjalan, zona Asia/Makassar. Minggu yang diumumkan
  -- harus sudah selesai, jadi hanya minggu sebelum Senin ini.
  v_monday_now := (now() at time zone 'Asia/Makassar')::date
    - ((extract(isodow from (now() at time zone 'Asia/Makassar')::date)::int - 1));

  for v_week in
    select distinct w.week_start
    from public.tryout_results w
    where w.mode = 'full'
      and w.week_start < v_monday_now
      and not exists (
        select 1 from public.weekly_winners ww
        where ww.week_start = w.week_start and ww.scope = 'global'
      )
    order by w.week_start
  loop
    -- Juara global: skor terbaik per user, seri diputus aturan
    -- Dhinda 2026-11-15: total tertinggi, lalu yang lolos semua
    -- ambang batas, lalu yang paling dulu selesai.
    insert into public.weekly_winners
      (week_start, scope, rank, user_id, total, premium_until, badge_awarded)
    select
      v_week, 'global', ranked.rn, ranked.user_id, ranked.total,
      case ranked.rn
        when 1 then now() + interval '7 days'
        when 2 then now() + interval '5 days'
        else now() + interval '3 days' end,
      false
    from (
      select
        b.user_id, b.total, b.finished_at,
        row_number() over (
          order by b.total desc, b.passed desc, b.finished_at asc
        ) as rn
      from (
        select distinct on (t.user_id)
          t.user_id, t.total, t.passed, t.finished_at
        from public.tryout_results t
        where t.mode = 'full' and t.week_start = v_week
        order by t.user_id, t.total desc, t.passed desc, t.finished_at asc
      ) b
    ) ranked
    where ranked.rn <= 3
    on conflict (week_start, scope, rank) do nothing;

    -- (a) dan (b) Hadiah juara global: premium langsung ke profil
    -- plus satu kode klaim single-use per juara. premium_until
    -- profil diperpanjang dari tanggal aktif terjauh, jadi bisa
    -- lebih jauh dari premium_until di weekly_winners bila user
    -- masih punya sisa premium; kode kedaluwarsa di tanggal
    -- premium_until profil yang baru diberikan itu.
    for v_winner in
      select ww.user_id, ww.rank
      from public.weekly_winners ww
      where ww.week_start = v_week
        and ww.scope = 'global'
    loop
      v_days := case v_winner.rank
        when 1 then 7
        when 2 then 5
        else 3 end;

      update public.profiles
      set premium_until = greatest(coalesce(premium_until, now()), now())
        + make_interval(days => v_days)
      where id = v_winner.user_id
      returning premium_until into v_new_until;

      -- Kode klaim 10 karakter, unik. Alfabet sama seperti
      -- create_redeem_code (tanpa huruf dan angka yang mirip).
      loop
        v_code := '';
        for v_i in 1..10 loop
          v_code := v_code || substr(
            v_alphabet,
            floor(random() * length(v_alphabet) + 1)::int,
            1
          );
        end loop;
        exit when not exists (
          select 1 from public.codes where code = v_code
        );
      end loop;

      insert into public.codes
        (code, premium_days, max_uses, expires_at, note)
      values (
        v_code,
        v_days,
        1,
        v_new_until,
        'Juara mingguan ' || v_week::text || ' rank ' || v_winner.rank
      );
    end loop;

    -- Juara per formasi: scope per formasi yang diikuti minggu itu.
    -- Pengelompokan memakai formasi yang dinormalisasi (huruf kecil,
    -- spasi dirapikan), supaya "Analis Kebijakan" dan
    -- "analis kebijakan" jadi satu ranking. Nama scope yang disimpan
    -- adalah ejaan asli pertama (alfabetis) dari varian itu.
    -- Juara per formasi hanya dapat badge, TANPA premium
    -- (keputusan 2026-11-15): premium_until NULL.
    insert into public.weekly_winners
      (week_start, scope, rank, user_id, total, premium_until, badge_awarded)
    select
      v_week, ranked.scope_display, ranked.rn, ranked.user_id, ranked.total,
      null,
      false
    from (
      select
        b.scope_norm,
        min(b.scope_raw) over (partition by b.scope_norm) as scope_display,
        b.user_id, b.total, b.finished_at,
        row_number() over (
          partition by b.scope_norm
          order by b.total desc, b.passed desc, b.finished_at asc
        ) as rn
      from (
        select distinct on (t.user_id)
          lower(btrim(regexp_replace(p.formasi, '\s+', ' ', 'g'))) as scope_norm,
          btrim(p.formasi) as scope_raw,
          t.user_id, t.total, t.passed, t.finished_at
        from public.tryout_results t
        join public.profiles p on p.id = t.user_id
        where t.mode = 'full'
          and t.week_start = v_week
          and p.formasi is not null
          and btrim(p.formasi) <> ''
        order by t.user_id, t.total desc, t.passed desc, t.finished_at asc
      ) b
    ) ranked
    where ranked.rn <= 3
    on conflict (week_start, scope, rank) do nothing;
  end loop;

  return query
    select ww.week_start, ww.scope, ww.rank, ww.user_id, ww.total
    from public.weekly_winners ww
    order by ww.week_start desc, ww.scope, ww.rank;
end;
$$;

-- Hanya dipanggil dari pg_cron (jalan sebagai postgres) dan SQL Editor.
-- Client app tidak boleh memicu pengumuman.
revoke all on function public.announce_weekly_winners() from public;

-- ============================================================================
-- BLOK TERPISAH: jadwal pg_cron
-- ============================================================================
--
-- JANGAN jalankan blok ini bersama migrasi di atas. Blok ini hanya boleh
-- dijalankan SETELAH ekstensi pg_cron diaktifkan di
-- Dashboard > Database > Extensions. (Di Supabase, pg_cron diaktifkan
-- dari dashboard, bukan dari SQL Editor.)
--
-- Setelah ekstensi aktif, jalankan dua perintah di bawah ini (hapus
-- tanda -- di depannya) di SQL Editor:
--
-- -- Setiap Senin 01:00 UTC = 09:00 WITA, umumkan juara minggu lalu
-- -- (plus minggu mana pun yang tertinggal).
-- create extension if not exists pg_cron;
-- select cron.schedule(
--   'umumkan-juara-mingguan',
--   '0 1 * * 1',
--   'select public.announce_weekly_winners();'
-- );
--
-- Cek jadwal: select * from cron.job;
-- Cek riwayat jalan:
--   select * from cron.job_run_details order by start_time desc limit 10;
-- Menjalankan ulang cron.schedule dengan nama job yang sama akan
-- memperbarui jadwal yang sudah ada, bukan membuat duplikat.
--
-- PERINGATAN FREE TIER: proyek free tier auto-pause setelah sekitar
-- 7 hari tanpa aktivitas API. Saat pause, pg_cron berhenti dan job
-- yang terlewat tidak jalan sendiri. Fungsi announce_weekly_winners
-- mengejar semua minggu tertinggal saat jalan lagi, jadi tidak ada
-- juara yang hilang, hanya tertunda. Kalau perlu, jalankan manual:
-- select public.announce_weekly_winners();
--
-- ============================================================================
