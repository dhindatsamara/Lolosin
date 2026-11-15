-- ============================================================================
-- Lolosin: migrasi 002, battle 1v1 dan sesi ala Quizizz
-- ============================================================================
--
-- CARA PAKAI:
--   1. Buka dashboard Supabase proyek "lolosin".
--   2. Masuk ke SQL Editor, buat query baru.
--   3. Paste seluruh isi file ini, lalu klik Run.
--   4. Skrip ini aman di-run ulang: semua perintah memakai IF NOT EXISTS
--      dan setiap policy di-drop dulu sebelum dibuat ulang.
--   5. Pastikan migrasi 001 sudah jalan dulu (tabel profiles dipakai
--      sebagai foreign key di sini).
--
-- TABEL YANG DIBUAT:
--   - battle_sessions: satu baris per battle 1v1 (host lawan guest).
--   - game_sessions: satu baris per sesi ala Quizizz (satu host, banyak pemain).
--   - game_players: satu baris per pemain di satu sesi.
--
-- REALTIME:
--   Ketiga tabel ditambahkan ke publikasi supabase_realtime supaya
--   postgres changes bisa dipakai halaman host untuk leaderboard live.
--   Broadcast channel (progres battle, sinyal mulai/selesai) tidak
--   butuh publikasi ini, tapi tetap butuh Realtime aktif di proyek
--   (default aktif di proyek Supabase baru).
--
-- CATATAN VERSI 1:
--   Skor battle dan sesi dilaporkan client (tanpa validasi server-side).
--   RLS di bawah membatasi SIAPA yang boleh menulis baris mana, tapi
--   tidak bisa membuktikan skor itu jujur. Anti-cheat server-side
--   (mis. validasi jawaban lewat Edge Function) ditunda ke versi
--   berikut. Untuk pemakaian belajar santai ini bisa diterima.
--
-- CATATAN TEKNIS:
--   gen_random_uuid() dipakai sebagai default id. Fungsi ini tersedia
--   langsung di Postgres Supabase (Postgres 13 ke atas), tanpa perlu
--   extension tambahan.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. battle_sessions
-- ----------------------------------------------------------------------------
--
-- status: 'waiting' (host menunggu lawan), 'active' (lawan sudah gabung,
-- battle jalan), 'finished' (kedua pemain sudah kirim skor), 'cancelled'
-- (dibatalkan host atau ditinggal salah satu pemain).
-- question_ids: 10 id soal yang sama untuk kedua pemain, dipilih client
-- saat battle dibuat dari bank soal lokal.
-- host_time_ms / guest_time_ms: total waktu jawab dalam milidetik. Nilai
-- null berarti pemain itu belum kirim skor; ini dipakai sebagai penanda
-- "sudah selesai" karena skor 0 tetap skor yang sah.

create table if not exists public.battle_sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id uuid not null references public.profiles (id) on delete cascade,
  guest_id uuid references public.profiles (id) on delete set null,
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'finished', 'cancelled')),
  question_ids jsonb not null,
  host_score integer not null default 0 check (host_score >= 0),
  guest_score integer not null default 0 check (guest_score >= 0),
  host_time_ms bigint check (host_time_ms is null or host_time_ms >= 0),
  guest_time_ms bigint check (guest_time_ms is null or guest_time_ms >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Cari battle dari kode 6 karakter saat lawan gabung.
create index if not exists battle_sessions_code_idx
  on public.battle_sessions (code);

-- ----------------------------------------------------------------------------
-- 2. game_sessions
-- ----------------------------------------------------------------------------
--
-- status: 'lobby' (menunggu pemain, host belum mulai), 'active' (soal
-- sedang dijawab), 'finished' (host mengakhiri sesi).
-- question_ids: 10 id soal yang sama untuk semua pemain.
-- max_players: batas pemain per sesi, default 50.

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  host_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'lobby'
    check (status in ('lobby', 'active', 'finished')),
  question_ids jsonb not null,
  max_players integer not null default 50 check (max_players > 0),
  created_at timestamptz not null default now()
);

-- Cari sesi dari kode 6 karakter saat pemain gabung.
create index if not exists game_sessions_code_idx
  on public.game_sessions (code);

-- ----------------------------------------------------------------------------
-- 3. game_players
-- ----------------------------------------------------------------------------
--
-- Satu baris per pemain per sesi. unique(session_id, user_id) mencegah
-- satu user gabung dua kali ke sesi yang sama.
-- score: jumlah jawaban benar (maks 10). answered_count: jumlah soal
-- yang sudah dijawab (maks 10). display_name disalin dari username
-- profil saat gabung, supaya leaderboard tidak perlu join tiap baca.

create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  display_name text not null,
  score integer not null default 0 check (score >= 0),
  answered_count integer not null default 0 check (answered_count >= 0),
  joined_at timestamptz not null default now(),
  unique (session_id, user_id)
);

-- Daftar pemain satu sesi (leaderboard live, urut skor di query).
create index if not exists game_players_session_score_idx
  on public.game_players (session_id, score desc);

-- ----------------------------------------------------------------------------
-- 4. Row Level Security (RLS)
-- ----------------------------------------------------------------------------

alter table public.battle_sessions enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_players enable row level security;

-- battle_sessions: baca untuk user login (lookup by code saat gabung,
-- dan kedua pemain perlu membaca baris yang sama selama battle).
-- Trade-off: user login bisa membaca battle orang lain bila tahu id
-- atau code-nya. Ini diterima di v1 karena kode battle memang dibagikan
-- bebas, dan tidak ada data sensitif di baris battle.
drop policy if exists battle_sessions_select_auth on public.battle_sessions;
create policy battle_sessions_select_auth
  on public.battle_sessions
  for select
  to authenticated
  using (true);

-- Insert hanya sebagai host diri sendiri.
drop policy if exists battle_sessions_insert_host on public.battle_sessions;
create policy battle_sessions_insert_host
  on public.battle_sessions
  for insert
  to authenticated
  with check (auth.uid() = host_id);

-- Update hanya host atau guest battle itu. Ini mencakup: guest gabung
-- (isi guest_id), kedua pemain kirim skor akhir, dan pembatalan.
drop policy if exists battle_sessions_update_players on public.battle_sessions;
create policy battle_sessions_update_players
  on public.battle_sessions
  for update
  to authenticated
  using (auth.uid() = host_id or auth.uid() = guest_id)
  with check (auth.uid() = host_id or auth.uid() = guest_id);

-- Sengaja tidak ada policy delete untuk client: battle dibatalkan
-- lewat status 'cancelled', bukan dihapus.

-- game_sessions: baca untuk user login (lookup by code saat gabung).
drop policy if exists game_sessions_select_auth on public.game_sessions;
create policy game_sessions_select_auth
  on public.game_sessions
  for select
  to authenticated
  using (true);

-- Insert hanya sebagai host diri sendiri. Gate premium (profiles
-- .is_premium) dicek di client saat membuka halaman host, bukan di
-- policy ini, supaya pesan "Aktifkan Premium Beta" bisa tampil ramah.
drop policy if exists game_sessions_insert_host on public.game_sessions;
create policy game_sessions_insert_host
  on public.game_sessions
  for insert
  to authenticated
  with check (auth.uid() = host_id);

-- Update hanya host sesi itu (memulai dan mengakhiri sesi).
drop policy if exists game_sessions_update_host on public.game_sessions;
create policy game_sessions_update_host
  on public.game_sessions
  for update
  to authenticated
  using (auth.uid() = host_id)
  with check (auth.uid() = host_id);

-- Sengaja tidak ada policy delete untuk client.

-- game_players: baca untuk user login (leaderboard live perlu melihat
-- semua pemain satu sesi).
drop policy if exists game_players_select_auth on public.game_players;
create policy game_players_select_auth
  on public.game_players
  for select
  to authenticated
  using (true);

-- Insert hanya baris diri sendiri (gabung sesi).
drop policy if exists game_players_insert_own on public.game_players;
create policy game_players_insert_own
  on public.game_players
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Update hanya baris diri sendiri (mengirim jawaban menaikkan skor
-- dan answered_count milik sendiri).
-- Trade-off: skor dilaporkan client, jadi pemain nakal bisa mengubah
-- skornya sendiri lewat API. Ini batasan v1 yang dicatat di header.
drop policy if exists game_players_update_own on public.game_players;
create policy game_players_update_own
  on public.game_players
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Delete hanya baris diri sendiri (keluar dari sesi).
drop policy if exists game_players_delete_own on public.game_players;
create policy game_players_delete_own
  on public.game_players
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 5. Publikasi Realtime (postgres changes)
-- ----------------------------------------------------------------------------
--
-- Tambahkan ketiga tabel ke publikasi supabase_realtime supaya halaman
-- host bisa berlangganan perubahan game_players (leaderboard live).
-- Blok DO di bawah aman di-run ulang: tabel yang sudah jadi anggota
-- publikasi dilewati.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'battle_sessions'
  ) then
    alter publication supabase_realtime add table public.battle_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_sessions'
  ) then
    alter publication supabase_realtime add table public.game_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_players'
  ) then
    alter publication supabase_realtime add table public.game_players;
  end if;
end $$;

-- Replica identity full supaya payload postgres changes selalu membawa
-- baris lengkap (berguna untuk update skor pemain di leaderboard live).
alter table public.battle_sessions replica identity full;
alter table public.game_sessions replica identity full;
alter table public.game_players replica identity full;
