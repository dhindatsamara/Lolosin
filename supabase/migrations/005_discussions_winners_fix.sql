-- ============================================================================
-- Lolosin: migrasi 005, diskusi soal + perbaikan hadiah juara mingguan
-- ============================================================================
--
-- PRASYARAT: migrasi 004 HARUS sudah dijalankan dulu. Migrasi ini memakai
-- tabel codes dari 004 (untuk kode hadiah juara mingguan) dan menimpa
-- fungsi announce_weekly_winners yang dibuat di 004. Kalau 004 belum
-- jalan, jalankan dulu file 004_redeem_codes_progress.sql, baru file ini.
--
-- CARA PAKAI:
--   1. Buka dashboard Supabase proyek "lolosin".
--   2. Masuk ke SQL Editor, buat query baru.
--   3. Paste seluruh isi file ini, lalu klik Run.
--   4. Skrip ini aman di-run ulang: semua perintah memakai IF NOT EXISTS,
--      setiap policy di-drop dulu sebelum dibuat ulang, dan fungsi
--      memakai CREATE OR REPLACE.
--   5. BLOK pg_cron ke-2 di akhir file ini SENGAJA dikomentari. Jalankan
--      blok itu terpisah SETELAH ekstensi pg_net diaktifkan
--      (Dashboard > Database > Extensions) dan Edge Function
--      kirim-kode-pemenang sudah di-deploy. Lihat
--      docs/PANDUAN-MIGRASI-005.md untuk langkah lengkapnya.
--
-- YANG DITAMBAH / DIUBAH:
--   - discussions: kolom komentar per soal (threaded lewat parent_id).
--     RLS aktif: baca publik, tulis hanya penulis sendiri, hapus oleh
--     penulis sendiri atau Dhinda.
--   - weekly_winners.code: kode hadiah juara global (NULL untuk juara
--     per formasi).
--   - weekly_winners.email_sent_at: kapan email kode dikirim ke juara.
--   - announce_weekly_winners() DITULIS ULANG (nama + signature return
--     SAMA seperti 004, supaya jadwal pg_cron lama tetap jalan):
--     ranking + insert SAMA PERSIS seperti 004, TAPI pemberian premium
--     langsung ke profiles DIHAPUS. Sejak v2.8, premium juara HANYA
--     aktif lewat redeem kode: fungsi ini hanya membuat satu kode
--     single-use per juara global (7/5/3 hari sesuai rank, berlaku
--     30 hari) dan menyimpannya ke weekly_winners.code. premium_until
--     di weekly_winners selalu ditulis NULL. Ini menutup bug
--     double-grant v2.7: di 004, juara dapat premium langsung PLUS
--     satu kode, sehingga premium bertumpuk bila kodenya di-redeem.
--
-- CATATAN:
--   - Kode juara dibuat dengan alfabet + loop anti-duplikat yang SAMA
--     seperti 004 (10 karakter, tanpa huruf dan angka yang mirip).
--   - Idempotensi kode: minggu yang sudah diumumkan dilewati (cek
--     exists seperti 004), jadi tidak ada kode ganda. Sebagai jaring
--     pengaman, ada pass backfill di akhir fungsi yang hanya membuat
--     kode untuk baris juara global yang code-nya masih NULL
--     (misal run sebelumnya terpotong di tengah jalan).
--   - announce_weekly_winners bisa dijalankan manual dari SQL Editor.
--     Email kode dikirim Edge Function kirim-kode-pemenang, bukan
--     dari fungsi ini.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. discussions
-- ----------------------------------------------------------------------------
--
-- Komentar per soal, dengan balasan (parent_id menunjuk komentar lain
-- di tabel yang sama). question_id adalah id soal di app (text, bukan
-- foreign key: bank soal tinggal di client, bukan di database).
-- RLS aktif: baca publik (anon + authenticated), insert hanya dengan
-- user_id = auth.uid(), delete hanya penulis sendiri atau Dhinda.
-- Sengaja tidak ada policy update: komentar tidak bisa diedit,
-- hanya bisa dihapus.

create table if not exists public.discussions (
  id uuid primary key default gen_random_uuid(),
  question_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  parent_id uuid references public.discussions (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists discussions_question_created_idx
  on public.discussions (question_id, created_at desc);

alter table public.discussions enable row level security;

-- Baca publik: siapa pun bisa membaca diskusi, termasuk tamu.
drop policy if exists discussions_select_public on public.discussions;
create policy discussions_select_public
  on public.discussions
  for select
  to anon, authenticated
  using (true);

-- Tulis hanya sebagai diri sendiri.
drop policy if exists discussions_insert_own on public.discussions;
create policy discussions_insert_own
  on public.discussions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Hapus oleh penulis sendiri, atau oleh Dhinda (moderasi).
drop policy if exists discussions_delete_own_or_admin on public.discussions;
create policy discussions_delete_own_or_admin
  on public.discussions
  for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and username = 'dhindaimup'
    )
  );

-- ----------------------------------------------------------------------------
-- 2. weekly_winners.code + weekly_winners.email_sent_at
-- ----------------------------------------------------------------------------

alter table public.weekly_winners
  add column if not exists code text;

alter table public.weekly_winners
  add column if not exists email_sent_at timestamptz;

-- ----------------------------------------------------------------------------
-- 3. announce_weekly_winners() (definisi ulang, code-only)
-- ----------------------------------------------------------------------------
--
-- Ranking + insert SAMA PERSIS seperti 004 (global + per formasi,
-- aturan seri total desc / passed desc / finished_at asc, idempotent,
-- mengejar minggu tertinggal). Yang BERUBAH dari 004:
--   (i)   TIDAK ADA lagi update profiles.premium_until di fungsi ini.
--   (ii)  premium_until di weekly_winners selalu ditulis NULL, untuk
--         juara global maupun per formasi.
--   (iii) Tiap juara global mendapat SATU kode single-use di tabel
--         codes (premium_days 7/5/3 sesuai rank, max_uses 1,
--         expires_at now() + 30 hari), dan kode itu disimpan ke
--         weekly_winners.code baris juara tersebut. Juara per formasi:
--         code NULL.
-- Nama + signature return SAMA seperti 004, jadi jadwal pg_cron
-- 'umumkan-juara-mingguan' dari 004 tetap jalan tanpa diubah.

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
    -- v2.8: premium_until selalu NULL. Premium juara TIDAK lagi
    -- diberikan langsung dari sini; juara menebus kode hadiahnya
    -- di app (Profil, bagian Premium) dan premium aktif lewat
    -- redeem_code.
    insert into public.weekly_winners
      (week_start, scope, rank, user_id, total, premium_until, badge_awarded)
    select
      v_week, 'global', ranked.rn, ranked.user_id, ranked.total,
      null,
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

    -- Hadiah juara global v2.8: SATU kode klaim single-use per juara.
    -- Kode berlaku 30 hari sejak dibuat, lalu disimpan ke
    -- weekly_winners.code supaya app dan Edge Function email bisa
    -- menampilkannya. Guard "code is null" menjaga supaya tidak ada
    -- kode ganda bila fungsi jalan ulang untuk minggu yang sama.
    for v_winner in
      select ww.user_id, ww.rank
      from public.weekly_winners ww
      where ww.week_start = v_week
        and ww.scope = 'global'
        and ww.code is null
    loop
      v_days := case v_winner.rank
        when 1 then 7
        when 2 then 5
        else 3 end;

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
        now() + interval '30 days',
        'Juara mingguan ' || v_week::text || ' rank ' || v_winner.rank
      );

      update public.weekly_winners
      set code = v_code
      where week_start = v_week
        and scope = 'global'
        and rank = v_winner.rank;
    end loop;

    -- Juara per formasi: scope per formasi yang diikuti minggu itu.
    -- Pengelompokan memakai formasi yang dinormalisasi (huruf kecil,
    -- spasi dirapikan), supaya "Analis Kebijakan" dan
    -- "analis kebijakan" jadi satu ranking. Nama scope yang disimpan
    -- adalah ejaan asli pertama (alfabetis) dari varian itu.
    -- Juara per formasi hanya dapat badge, TANPA premium
    -- (keputusan 2026-11-15): premium_until NULL, code NULL.
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

  -- Backfill (jaring pengaman): juara global mana pun yang code-nya
  -- masih NULL mendapat kode, satu per baris. Ini hanya terjadi bila
  -- sebuah run terpotong di tengah jalan (misal database restart
  -- setelah insert juara tapi sebelum kode dibuat): minggu itu sudah
  -- dianggap diumumkan sehingga loop utama melewatinya, dan tanpa
  -- backfill ini juaranya tidak pernah mendapat kode. Baris yang
  -- sudah punya kode tidak disentuh, jadi tidak ada kode ganda.
  for v_winner in
    select ww.week_start, ww.rank
    from public.weekly_winners ww
    where ww.scope = 'global'
      and ww.code is null
    order by ww.week_start, ww.rank
  loop
    v_week := v_winner.week_start;
    v_days := case v_winner.rank
      when 1 then 7
      when 2 then 5
      else 3 end;

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
      now() + interval '30 days',
      'Juara mingguan ' || v_week::text || ' rank ' || v_winner.rank
    );

    update public.weekly_winners
    set code = v_code
    where week_start = v_week
      and scope = 'global'
      and rank = v_winner.rank
      and code is null;
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
-- BLOK TERPISAH: jadwal pg_cron ke-2 (kirim email kode pemenang)
-- ============================================================================
--
-- JANGAN jalankan blok ini bersama migrasi di atas. Blok ini hanya boleh
-- dijalankan SETELAH:
--   1. ekstensi pg_net diaktifkan di Dashboard > Database > Extensions
--      (sama seperti pg_cron, diaktifkan dari dashboard, bukan dari
--      SQL Editor), dan
--   2. Edge Function kirim-kode-pemenang sudah di-deploy dan secret
--      RESEND_API_KEY sudah diset (lihat docs/PANDUAN-MIGRASI-005.md
--      langkah 5 dan 6).
--
-- Ganti <PROJECT_REF> dengan ref proyek Supabase (bagian depan URL
-- proyek, misal abcdefghijklm di https://abcdefghijklm.supabase.co)
-- dan <ANON_KEY> dengan anon key proyek (Dashboard > Settings > API).
-- Jadwal 5 menit setelah pengumuman (Senin 01:05 UTC = 09:05 WITA),
-- supaya kode sudah dibuat dulu oleh job 'umumkan-juara-mingguan'
-- sebelum email dikirim.
--
-- Setelah siap, jalankan perintah di bawah ini (hapus tanda -- di
-- depannya) di SQL Editor:
--
-- -- Setiap Senin 01:05 UTC = 09:05 WITA, panggil Edge Function yang
-- -- mengirim email kode hadiah ke juara global yang belum dikirimi.
-- create extension if not exists pg_net;
-- select cron.schedule(
--   'kirim-email-pemenang',
--   '5 1 * * 1',
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/kirim-kode-pemenang',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'apikey', '<ANON_KEY>',
--       'Authorization', 'Bearer <ANON_KEY>'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
--
-- OPSIONAL (hanya bila secret FUNCTION_SECRET diset di Edge Function,
-- lihat PANDUAN-MIGRASI-005.md langkah 5): tambahkan header ini di
-- dalam jsonb_build_object di atas, dengan nilai yang sama seperti
-- secret-nya:
-- --       'x-function-secret', '<FUNCTION_SECRET>'
--
-- Cek jadwal: select * from cron.job;
-- Cek riwayat jalan:
--   select * from cron.job_run_details order by start_time desc limit 10;
-- Cek respons HTTP dari Edge Function (disimpan pg_net):
--   select * from net._http_response order by created desc limit 10;
-- Menjalankan ulang cron.schedule dengan nama job yang sama akan
-- memperbarui jadwal yang sudah ada, bukan membuat duplikat.
--
-- PERINGATAN FREE TIER: proyek free tier auto-pause setelah sekitar
-- 7 hari tanpa aktivitas API. Saat pause, pg_cron berhenti dan job
-- yang terlewat tidak jalan sendiri. Edge Function-nya idempotent
-- (hanya memproses juara yang email_sent_at-nya masih NULL), jadi
-- email yang tertunda terkirim di run berikutnya, hanya tertunda,
-- bukan hilang. Kalau perlu, panggil manual (lihat panduan langkah 8).
--
-- ============================================================================
