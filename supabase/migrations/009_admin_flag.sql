-- ============================================================================
-- Lolosin: migrasi 009, kolom admin di profiles (admin panel v1)
-- ============================================================================
--
-- CARA PAKAI:
--   1. Buka dashboard Supabase proyek "lolosin".
--   2. Masuk ke SQL Editor, buat query baru.
--   3. Paste seluruh isi file ini, lalu klik Run.
--   4. Skrip ini aman di-run ulang: kolom memakai IF NOT EXISTS,
--      REVOKE idempotent, dan UPDATE admin hanya mengubah baris
--      Dhinda bila ada.
--
-- YANG DITAMBAH:
--   - profiles.is_admin: boolean, default false. Menandai akun yang
--     boleh membuka halaman /admin dan memanggil Edge Function
--     admin-actions. Pengecekan admin SELALU di sisi server (Edge
--     Function membaca kolom ini lewat service role); client hanya
--     memakai kolom ini untuk menampilkan atau menyembunyikan
--     halaman admin.
--
-- YANG DIKUNCI (penting):
--   - Policy profiles_update_own dan profiles_insert_own dari
--     migrasi 001 mengizinkan user menulis barisnya sendiri,
--     termasuk kolom baru apa pun. Tanpa penguncian, user mana pun
--     bisa menjadikan dirinya admin dengan update is_admin = true
--     lewat API. Karena itu skrip ini MENCABUT hak update dan
--     insert kolom is_admin dari role anon dan authenticated.
--     Service role (Edge Function admin-actions) TIDAK terpengaruh
--     pencabutan ini dan tetap bisa membaca kolom ini.
--   - Pencabutan ini HANYA untuk kolom is_admin. Celah premium
--     (user bisa set is_premium/premium_until sendiri) tetap ada
--     dan ditutup terpisah sebelum beta berakhir (lihat
--     DRAF-BATASAN-FREE-PREMIUM.md, bukan bagian migrasi ini).
--
-- YANG DIUBAH:
--   - Baris profiles username 'dhindaimup' dijadikan admin
--     (is_admin = true). Bila baris itu belum ada (misal Dhinda
--     belum daftar di database ini), perintah ini tidak mengubah
--     apa-apa; jalankan manual setelah daftar, lihat
--     docs/PANDUAN-MIGRASI-009.md langkah 3.
--
-- CATATAN:
--   - App tetap jalan bila migrasi ini belum dijalankan: halaman
--     /admin menampilkan pesan "migrasi 009 belum dijalankan"
--     dan tidak ada user yang dianggap admin.
--   - Membaca is_admin tetap memakai policy profiles_select_public
--     (baca publik): siapa admin bukan rahasia, yang dilindungi
--     adalah aksi admin, dan itu dicek di sisi server.
--
-- ============================================================================

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Kunci kolom is_admin dari tulis client (lihat penjelasan di atas).
-- Service role tidak terpengaruh.
revoke update (is_admin) on public.profiles from authenticated, anon;
revoke insert (is_admin) on public.profiles from authenticated, anon;

-- Jadikan Dhinda admin (no-op bila barisnya belum ada).
update public.profiles
set is_admin = true
where username = 'dhindaimup';
