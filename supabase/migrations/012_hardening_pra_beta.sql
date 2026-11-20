-- ============================================================================
-- Lolosin: migrasi 012, pengamanan pra-beta (v2.15.2)
-- ============================================================================
--
-- CARA PAKAI:
--   1. Buka dashboard Supabase proyek "lolosin".
--   2. Masuk ke SQL Editor, buat query baru.
--   3. Paste seluruh isi file ini, lalu klik Run.
--   4. Skrip ini aman di-run ulang: trigger di-drop dulu sebelum
--      dibuat ulang, REVOKE idempotent, fungsi memakai CREATE OR
--      REPLACE, dan jadwal pg_cron diperbarui bila sudah ada.
--
-- URUTAN: jalankan SETELAH migrasi 006-011. Tidak ada tenggat
-- Senin pagi seperti migrasi 010, tapi jalankan sebelum beta
-- berakhir (13 Desember 2026) supaya celah premium tertutup
-- sebelum premium berbayar jalan.
--
-- YANG DITAMBAH (3 bagian):
--
--   1. Trigger validasi skor tryout_results. Selama ini skor
--      (twk/tiu/tkp) dikirim dari client dan dipercaya begitu
--      saja: siapa pun bisa insert skor 150/175/225 lewat API
--      dan jadi juara mingguan. Trigger ini menolak insert yang
--      tidak masuk akal: skor di luar rentang mode-nya, TWK/TIU
--      bukan kelipatan 5, jumlah benar melebihi jumlah soal,
--      skor tidak cocok dengan jumlah benar (TWK/TIU = benar x 5),
--      status lulus tidak cocok dengan ambang mode-nya,
--      finished_at di masa depan, atau week_start bukan Senin
--      (WITA) dari finished_at. Batasan ini TIDAK menangkap skor
--      palsu yang masih masuk akal (mis. 140/160/200 dengan
--      jumlah benar yang cocok): validasi penuh butuh bank soal
--      di server, dan itu hardening lanjutan, bukan bagian
--      migrasi ini. Skor asli dari app selalu lolos karena
--      dihitung dari jawaban yang sama.
--
--   2. Kunci kolom premium di profiles. Policy
--      profiles_update_own (migrasi 001) mengizinkan user menulis
--      barisnya sendiri, termasuk is_premium dan premium_until:
--      siapa pun bisa menjadikan dirinya premium lewat API.
--      Perlindungan yang benar-benar jalan adalah TRIGGER PENJAGA
--      di bawah: ia menolak perubahan is_premium, premium_until,
--      dan is_admin bila request datang langsung dari client
--      (role anon/authenticated). REVOKE kolom saja TIDAK cukup
--      (ditemukan saat QA v2.15.2, diuji di Postgres lokal):
--      Supabase memberi GRANT UPDATE tingkat tabel ke role
--      authenticated, dan Postgres mengizinkan update kolom bila
--      role memegang hak tingkat tabel ATAU hak kolom itu, jadi
--      pencabutan kolom tidak memblokir apa pun selama hak
--      tingkat tabel masih ada. Itu berarti REVOKE is_admin di
--      migrasi 009 pun sebenarnya tidak memblokir apa pun;
--      trigger ini menutup celah itu juga. REVOKE tetap
--      dipertahankan sebagai lapisan tambahan (berlaku bila
--      suatu hari hak tingkat tabel diperketat) dan sebagai
--      dokumentasi niat.
--      Yang tetap bisa mengeset premium:
--        - Edge Function admin-actions (service role, tidak
--          dibatasi trigger karena current_user-nya service_role).
--        - RPC redeem_code dan announce_weekly_winners
--          (security definer: current_user di dalam fungsi adalah
--          pemilik fungsi, bukan pemanggil).
--        - Toggle "Premium Beta" di Profil, yang sejak v2.15.2
--          tidak lagi PATCH langsung melainkan memanggil RPC
--          set_beta_premium di bawah (security definer, hanya
--          berfungsi selama beta, sampai 13 Desember 2026).
--        - Dashboard SQL Editor (role postgres).
--      Policy tulis diskusi (migrasi 008) juga diperbarui:
--      is_premium hanya dihitung premium selama beta
--      berlangsung, supaya nilai is_premium yang tertinggal
--      setelah beta berakhir tidak lagi memberi akses tulis.
--      Sesudah beta berakhir, Dhinda bisa menjalankan
--      pembersihan satu kali (lihat panduan): update profiles
--      set is_premium = false. Itu langkah pertahanan ekstra,
--      bukan kewajiban, karena semua pengecekan sudah
--      mengabaikan is_premium setelah beta berakhir.
--
--   3. Keepalive pg_cron. Proyek free tier auto-pause setelah
--      sekitar 7 hari tanpa aktivitas, dan saat pause pg_cron
--      ikut berhenti (job juara mingguan yang terlewat tidak
--      jalan sendiri). Job harian ini menyentuh tabel profiles
--      supaya database selalu punya aktivitas. Catatan jujur:
--      pg_cron TIDAK dijamin dihitung Supabase sebagai aktivitas
--      eksternal, jadi job ini hanya pertahanan lapis pertama.
--      Mekanisme yang dijamin jalan adalah ping dari LUAR
--      (GitHub Actions atau cron-job.org ke endpoint PostgREST);
--      langkah manualnya ada di docs/PANDUAN-MIGRASI-012.md.
--      Job ini hanya dijadwalkan bila ekstensi pg_cron sudah
--      aktif (sudah aktif di proyek live, dipakai job juara
--      mingguan). Bila belum aktif, skrip hanya memberi notice
--      dan bagian lain tetap jalan.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Validasi skor tryout_results (trigger BEFORE INSERT)
-- ----------------------------------------------------------------------------
--
-- Rentang dan ambang mengikuti lib/quiz.ts persis:
--   full (110 soal: 30 TWK, 35 TIU, 45 TKP):
--     twk 0-150, tiu 0-175, tkp 0-225; lulus 65/80/156.
--   mini (30 soal: 10 per bagian):
--     tiap bagian 0-50; lulus 22/23/35 (passing grade mini).
-- TWK/TIU tiap soal bernilai 0 atau 5, jadi skornya selalu
-- kelipatan 5. TKP tiap soal bernilai 0 (tidak dijawab) atau 1-5,
-- jadi tidak ada aturan kelipatan. Soal yang tidak dijawab
-- bernilai 0 di semua bagian, jadi batas bawah semua skor adalah 0.

create or replace function public.validate_tryout_result()
returns trigger
language plpgsql
as $$
declare
  v_max_twk int;
  v_max_tiu int;
  v_max_tkp int;
  v_max_ctwk int;
  v_max_ctiu int;
  v_max_ctkp int;
  v_pass_twk int;
  v_pass_tiu int;
  v_pass_tkp int;
  v_expected_passed boolean;
  v_monday date;
begin
  if NEW.mode = 'full' then
    v_max_twk := 150; v_max_tiu := 175; v_max_tkp := 225;
    v_max_ctwk := 30; v_max_ctiu := 35; v_max_ctkp := 45;
    v_pass_twk := 65; v_pass_tiu := 80; v_pass_tkp := 156;
  else
    -- mini
    v_max_twk := 50; v_max_tiu := 50; v_max_tkp := 50;
    v_max_ctwk := 10; v_max_ctiu := 10; v_max_ctkp := 10;
    v_pass_twk := 22; v_pass_tiu := 23; v_pass_tkp := 35;
  end if;

  if NEW.twk < 0 or NEW.twk > v_max_twk then
    raise exception 'twk % di luar rentang 0-% (mode %)', NEW.twk, v_max_twk, NEW.mode;
  end if;
  if NEW.tiu < 0 or NEW.tiu > v_max_tiu then
    raise exception 'tiu % di luar rentang 0-% (mode %)', NEW.tiu, v_max_tiu, NEW.mode;
  end if;
  if NEW.tkp < 0 or NEW.tkp > v_max_tkp then
    raise exception 'tkp % di luar rentang 0-% (mode %)', NEW.tkp, v_max_tkp, NEW.mode;
  end if;

  -- TWK/TIU: tiap soal 0 atau 5 poin.
  if NEW.twk % 5 <> 0 then
    raise exception 'twk % bukan kelipatan 5', NEW.twk;
  end if;
  if NEW.tiu % 5 <> 0 then
    raise exception 'tiu % bukan kelipatan 5', NEW.tiu;
  end if;

  -- Jumlah benar tidak boleh melebihi jumlah soal bagian itu.
  if NEW.correct_twk is not null
    and (NEW.correct_twk < 0 or NEW.correct_twk > v_max_ctwk) then
    raise exception 'correct_twk % di luar rentang 0-%', NEW.correct_twk, v_max_ctwk;
  end if;
  if NEW.correct_tiu is not null
    and (NEW.correct_tiu < 0 or NEW.correct_tiu > v_max_ctiu) then
    raise exception 'correct_tiu % di luar rentang 0-%', NEW.correct_tiu, v_max_ctiu;
  end if;
  if NEW.correct_tkp is not null
    and (NEW.correct_tkp < 0 or NEW.correct_tkp > v_max_ctkp) then
    raise exception 'correct_tkp % di luar rentang 0-%', NEW.correct_tkp, v_max_ctkp;
  end if;

  -- Skor TWK/TIU harus cocok dengan jumlah benar (benar x 5).
  if NEW.correct_twk is not null and NEW.twk <> NEW.correct_twk * 5 then
    raise exception 'twk % tidak cocok dengan correct_twk %', NEW.twk, NEW.correct_twk;
  end if;
  if NEW.correct_tiu is not null and NEW.tiu <> NEW.correct_tiu * 5 then
    raise exception 'tiu % tidak cocok dengan correct_tiu %', NEW.tiu, NEW.correct_tiu;
  end if;

  -- Status lulus harus cocok dengan ambang mode itu.
  v_expected_passed :=
    NEW.twk >= v_pass_twk
    and NEW.tiu >= v_pass_tiu
    and NEW.tkp >= v_pass_tkp;
  if NEW.passed <> v_expected_passed then
    raise exception 'passed % tidak cocok dengan skor %/%/% (mode %)', NEW.passed, NEW.twk, NEW.tiu, NEW.tkp, NEW.mode;
  end if;

  -- finished_at tidak boleh di masa depan (toleransi 5 menit
  -- untuk beda jam antara perangkat user dan server). Skor lama
  -- dari antrean percobaan ulang tetap boleh masuk.
  if NEW.finished_at > now() + interval '5 minutes' then
    raise exception 'finished_at di masa depan';
  end if;

  -- week_start harus Senin (WITA) dari finished_at. Rumus yang
  -- sama dipakai announce_weekly_winners (migrasi 004) dan
  -- getMondayWITA di app (lib/leaderboard.ts).
  v_monday := (NEW.finished_at at time zone 'Asia/Makassar')::date
    - ((extract(isodow from (NEW.finished_at at time zone 'Asia/Makassar')::date)::int - 1));
  if NEW.week_start <> v_monday then
    raise exception 'week_start % bukan Senin dari finished_at %', NEW.week_start, NEW.finished_at;
  end if;

  return NEW;
end;
$$;

drop trigger if exists tryout_results_validate on public.tryout_results;
create trigger tryout_results_validate
  before insert on public.tryout_results
  for each row execute function public.validate_tryout_result();

-- ----------------------------------------------------------------------------
-- 2. Kunci kolom premium di profiles (trigger penjaga)
-- ----------------------------------------------------------------------------
--
-- Trigger ini adalah perlindungan yang benar-benar jalan (lihat
-- catatan di header file tentang kenapa REVOKE kolom saja tidak
-- cukup). Ia menolak perubahan is_premium, premium_until, dan
-- is_admin bila pernyataan datang langsung dari client (role anon
-- atau authenticated). Service role, fungsi security definer, dan
-- dashboard tidak dibatasi: di dalam fungsi security definer,
-- current_user adalah pemilik fungsi (postgres), bukan pemanggil.
--
-- Insert profil dari app (auth.ts) tidak pernah mengisi ketiga
-- kolom ini (hanya id, username, formasi), jadi penjaga insert
-- aman: nilai default false/null/false selalu lolos.

create or replace function public.guard_profiles_protected_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if TG_OP = 'INSERT' then
      if NEW.is_premium is distinct from false
        or NEW.premium_until is not null
        or NEW.is_admin is distinct from false then
        raise exception 'kolom premium dan admin hanya bisa diubah dari server';
      end if;
    elsif TG_OP = 'UPDATE' then
      if NEW.is_premium is distinct from OLD.is_premium
        or NEW.premium_until is distinct from OLD.premium_until
        or NEW.is_admin is distinct from OLD.is_admin then
        raise exception 'kolom premium dan admin hanya bisa diubah dari server';
      end if;
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_guard_protected_columns on public.profiles;
create trigger profiles_guard_protected_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profiles_protected_columns();

-- Lapisan tambahan: cabut hak tulis kolom dari role client.
-- Ini TIDAK cukup sendirian selama hak UPDATE/INSERT tingkat
-- tabel masih dipegang role tersebut (lihat header), tapi berlaku
-- bila hak tingkat tabel diperketat di masa depan, dan
-- mendokumentasikan niat. is_admin ikut dicabut di sini (selain
-- di migrasi 009) supaya ketiga kolom terkunci di satu tempat.
revoke update (is_premium, premium_until, is_admin) on public.profiles from authenticated, anon;
revoke insert (is_premium, premium_until, is_admin) on public.profiles from authenticated, anon;

-- ----------------------------------------------------------------------------
-- 2a. RPC set_beta_premium: toggle Premium Beta lewat server
-- ----------------------------------------------------------------------------
--
-- Menggantikan PATCH langsung dari app (yang ditolak trigger
-- penjaga di atas). Hanya berfungsi selama beta (sampai 13
-- Desember 2026, cutoff Senin 14 Desember 2026 00:00 WITA). Sesudah itu
-- mengembalikan {ok: false, error: 'beta_ended'} dan app
-- menampilkan pesan ramah. Mengembalikan jsonb seperti
-- redeem_code: sukses {ok: true, is_premium: ...}, gagal
-- {ok: false, error: 'not_signed_in' | 'beta_ended' |
-- 'no_profile'}.

create or replace function public.set_beta_premium(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cutoff timestamptz := '2026-12-14 00:00:00+08'::timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;

  if now() >= v_cutoff then
    return jsonb_build_object('ok', false, 'error', 'beta_ended');
  end if;

  if not exists (
    select 1 from public.profiles where id = v_user
  ) then
    return jsonb_build_object('ok', false, 'error', 'no_profile');
  end if;

  update public.profiles
  set is_premium = coalesce(p_enabled, false)
  where id = v_user;

  return jsonb_build_object(
    'ok', true,
    'is_premium', coalesce(p_enabled, false)
  );
end;
$$;

-- Hanya user login yang boleh memanggil (revoke dari public
-- supaya anon tidak bisa, pola yang sama seperti redeem_code).
revoke all on function public.set_beta_premium(boolean) from public;
grant execute on function public.set_beta_premium(boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 2b. Policy tulis diskusi: is_premium hanya premium selama beta
-- ----------------------------------------------------------------------------
--
-- Definisi Premium di policy ini disamakan dengan app
-- (lib/premium.ts v2.15.2): is_premium true HANYA dihitung
-- selama beta berlangsung, premium_until tetap dihitung selama
-- masih di masa depan. Tanpa perubahan ini, nilai is_premium
-- yang tertinggal setelah beta berakhir tetap memberi akses
-- tulis diskusi selamanya.

drop policy if exists discussions_insert_premium_own on public.discussions;
create policy discussions_insert_premium_own
  on public.discussions
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and (
          (is_premium is true
            and now() < '2026-12-14 00:00:00+08'::timestamptz)
          or (premium_until is not null and premium_until > now())
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Keepalive pg_cron (harian, pertahanan lapis pertama)
-- ----------------------------------------------------------------------------
--
-- Job ini menyentuh tabel profiles sekali sehari supaya database
-- selalu punya aktivitas. Dijadwalkan ulang dengan nama yang
-- sama bila sudah ada (cron.schedule memperbarui, bukan duplikat).
-- Bila ekstensi pg_cron belum aktif, bagian ini hanya memberi
-- notice; aktifkan dulu di Dashboard > Database > Extensions
-- lalu run ulang file ini.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'keepalive-supabase',
      '0 3 * * *',
      'select count(*) from public.profiles'
    );
    raise notice 'pg_cron keepalive dijadwalkan (harian 03:00 UTC).';
  else
    raise notice 'pg_cron belum aktif; lewati penjadwalan keepalive.';
  end if;
end $$;
