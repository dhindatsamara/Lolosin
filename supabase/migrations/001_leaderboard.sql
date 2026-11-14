-- ============================================================================
-- Lolosin: migrasi 001, fondasi leaderboard mingguan
-- ============================================================================
--
-- CARA PAKAI:
--   1. Buka dashboard Supabase proyek "lolosin".
--   2. Masuk ke SQL Editor, buat query baru.
--   3. Paste seluruh isi file ini, lalu klik Run.
--   4. Skrip ini aman di-run ulang: semua perintah memakai IF NOT EXISTS
--      dan setiap policy di-drop dulu sebelum dibuat ulang.
--
-- TABEL YANG DIBUAT:
--   - profiles: satu baris per user, id sama dengan auth.users.id.
--   - tryout_results: satu baris per simulasi/tryout yang selesai.
--   - weekly_winners: juara mingguan (global dan per formasi).
--
-- CATATAN VERSI 1:
--   Tabel weekly_winners dibuat di sini tapi TIDAK diisi otomatis.
--   Pengisian juara (peringkat 1-3 per minggu, global dan per formasi)
--   akan diotomatisasi di langkah berikut lewat Edge Function terjadwal.
--   Sampai saat itu, tabel ini tetap kosong dan itu normal.
--
-- CATATAN TEKNIS:
--   gen_random_uuid() dipakai sebagai default id. Fungsi ini tersedia
--   langsung di Postgres Supabase (Postgres 13 ke atas), tanpa perlu
--   extension tambahan.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. profiles
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  formasi text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. tryout_results
-- ----------------------------------------------------------------------------
--
-- KOREKSI PENTING DARI DRAFT: week_start adalah kolom date BIASA, bukan
-- generated column. Nilai week_start adalah Senin minggu dari finished_at
-- dalam zona Asia/Makassar. Konversi zona waktu (AT TIME ZONE) bukan
-- fungsi immutable, jadi Postgres menolaknya di generated column.
-- Sebagai gantinya, client menghitung week_start saat insert dan
-- mengirimkannya bersama finished_at.
--
-- Leaderboard mingguan HANYA memakai mode 'full' (simulasi CAT 110 soal).
-- Mode 'mini' tetap disimpan di sini untuk riwayat, tapi tidak diranking.

create table if not exists public.tryout_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('mini', 'full')),
  twk integer not null check (twk >= 0),
  tiu integer not null check (tiu >= 0),
  tkp integer not null check (tkp >= 0),
  total integer generated always as (twk + tiu + tkp) stored,
  passed boolean not null default false,
  correct_twk integer,
  correct_tiu integer,
  correct_tkp integer,
  finished_at timestamptz not null,
  week_start date not null
);

-- Ranking mingguan: filter per minggu, urut total tertinggi.
create index if not exists tryout_results_week_total_idx
  on public.tryout_results (week_start, total desc);

-- Riwayat satu user per minggu (skor terbaik per user per minggu).
create index if not exists tryout_results_user_week_idx
  on public.tryout_results (user_id, week_start);

-- ----------------------------------------------------------------------------
-- 3. weekly_winners
-- ----------------------------------------------------------------------------
--
-- Dibuat di v1, diisi otomatis di langkah berikut (lihat catatan header).
-- scope: 'global' untuk ranking global, atau nama formasi untuk ranking
-- per formasi. premium_until: juara 1 plus 7 hari, juara 2-3 plus 3 hari
-- dari pengumuman. badge_awarded: true bila badge prestise sudah diberikan.

create table if not exists public.weekly_winners (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  scope text not null,
  rank integer not null check (rank between 1 and 3),
  user_id uuid not null references public.profiles (id),
  total integer not null,
  premium_until timestamptz,
  badge_awarded boolean not null default false,
  unique (week_start, scope, rank)
);

-- ----------------------------------------------------------------------------
-- 4. Row Level Security (RLS)
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.tryout_results enable row level security;
alter table public.weekly_winners enable row level security;

-- profiles: baca publik (anon dan authenticated) supaya username bisa
-- tampil di leaderboard. Tulis hanya pemilik barisnya sendiri.
drop policy if exists profiles_select_public on public.profiles;
create policy profiles_select_public
  on public.profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own
  on public.profiles
  for delete
  to authenticated
  using (auth.uid() = id);

-- tryout_results: baca publik untuk leaderboard. Insert hanya oleh pemilik
-- (auth.uid() harus sama dengan user_id). Sengaja tidak ada policy update
-- atau delete untuk anon/authenticated, jadi skor yang sudah terkirim
-- tidak bisa diubah atau dihapus dari client.
drop policy if exists tryout_results_select_public on public.tryout_results;
create policy tryout_results_select_public
  on public.tryout_results
  for select
  to anon, authenticated
  using (true);

drop policy if exists tryout_results_insert_own on public.tryout_results;
create policy tryout_results_insert_own
  on public.tryout_results
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- weekly_winners: baca publik, tanpa policy tulis untuk anon/authenticated.
-- Hanya service role (Edge Function terjadwal) yang bisa menulis tabel ini.
drop policy if exists weekly_winners_select_public on public.weekly_winners;
create policy weekly_winners_select_public
  on public.weekly_winners
  for select
  to anon, authenticated
  using (true);
