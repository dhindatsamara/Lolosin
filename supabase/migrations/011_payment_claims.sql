-- ============================================================================
-- Lolosin: migrasi 011, tabel klaim pembayaran premium (bayar QRIS v2.15)
-- ============================================================================
--
-- CARA PAKAI:
--   1. Buka dashboard Supabase proyek "lolosin".
--   2. Masuk ke SQL Editor, buat query baru.
--   3. Paste seluruh isi file ini, lalu klik Run.
--   4. Skrip ini aman di-run ulang: tabel dan policy memakai
--      IF NOT EXISTS / DROP IF EXISTS.
--
-- YANG DITAMBAH:
--   - payment_claims: satu baris per klaim "Saya sudah bayar" dari
--     user setelah membayar lewat QRIS. Status awal pending; admin
--     menyetujui atau menolak lewat Edge Function admin-actions
--     (service role). Premium aktif hanya setelah disetujui.
--     Kolom: id, user_id (ke profiles), package ('skd' atau
--     'monthly'), amount (rupiah), status ('pending', 'approved',
--     'rejected'), created_at, verified_at, verified_by, note.
--
-- KEAMANAN (RLS):
--   - User bisa INSERT baris miliknya sendiri (with check
--     auth.uid() = user_id) dan SELECT baris miliknya sendiri.
--   - Admin (profiles.is_admin) bisa SELECT semua klaim, supaya
--     modul Pembayaran di panel admin bisa menampilkan daftarnya.
--   - TIDAK ADA policy UPDATE atau DELETE dari client: status
--     klaim hanya bisa diubah lewat Edge Function admin-actions
--     (service role, yang melewati RLS), jadi user tidak bisa
--     menyetujui klaimnya sendiri lewat API.
--   - GRANT hanya select + insert ke role authenticated; anon
--     tidak dapat apa-apa (tamu tidak bisa membuat klaim).
--
-- CATATAN:
--   - App tetap jalan bila migrasi ini belum dijalankan: halaman
--     /premium menampilkan pesan "pembayaran belum siap" saat user
--     tap "Saya sudah bayar", dan modul Pembayaran di panel admin
--     menampilkan pesan function yang sesuai.
--   - Harga paket BUKAN disimpan di database: satu-satunya sumber
--     harga adalah src/lib/pricing.ts. Kolom amount mencatat
--     nominal yang diklaim user, dan admin memverifikasi nominal
--     itu cocok dengan harga paket sebelum menyetujui.
--
-- ============================================================================

create table if not exists public.payment_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  package text not null check (package in ('skd', 'monthly')),
  amount integer not null check (amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete set null,
  note text
);

-- Indeks untuk daftar klaim admin (pending dulu, terbaru dulu)
-- dan pencarian klaim pending milik satu user.
create index if not exists payment_claims_status_created_idx
  on public.payment_claims (status, created_at desc);
create index if not exists payment_claims_user_status_idx
  on public.payment_claims (user_id, status);

alter table public.payment_claims enable row level security;

-- User hanya bisa insert klaim miliknya sendiri.
drop policy if exists payment_claims_insert_own on public.payment_claims;
create policy payment_claims_insert_own
  on public.payment_claims
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- User hanya bisa membaca klaim miliknya sendiri.
drop policy if exists payment_claims_select_own on public.payment_claims;
create policy payment_claims_select_own
  on public.payment_claims
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Admin bisa membaca semua klaim (untuk modul Pembayaran).
drop policy if exists payment_claims_select_admin on public.payment_claims;
create policy payment_claims_select_admin
  on public.payment_claims
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.is_admin = true
    )
  );

-- TIDAK ADA policy update/delete: status hanya diubah lewat Edge
-- Function admin-actions (service role). Sengaja tidak dibuat.

-- Hak akses tabel: select + insert untuk user login saja.
grant select, insert on public.payment_claims to authenticated;
