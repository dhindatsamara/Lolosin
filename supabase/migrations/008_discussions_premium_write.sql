-- ============================================================================
-- Migrasi 008: Menulis diskusi hanya untuk user Premium
-- ============================================================================
--
-- Prasyarat: migrasi 003 (kolom profiles.is_premium) dan 004 (kolom
-- profiles.premium_until) sudah dijalankan. Keduanya sudah jalan di
-- proyek live (terverifikasi 2026-11-15).
--
-- Isi migrasi ini (v2.13, keputusan Dhinda 19 Nov 2026, menggantikan
-- keputusan lama "komunitas harus terbuka"): policy insert tabel
-- discussions diubah supaya hanya user Premium yang bisa menulis
-- komentar dan balasan. Alasan Dhinda: kalau menulis gratis untuk
-- semua, volume diskusi bisa membludak dan sulit dijaga.
--
-- Yang TIDAK berubah:
--   - Membaca tetap publik (anon + authenticated), termasuk tamu.
--   - Menghapus tetap penulis sendiri atau Dhinda (moderasi).
--   - Tidak ada tabel atau kolom baru.
--
-- Definisi Premium di policy ini SAMA dengan di app
-- (lib/premium.ts): is_premium true ATAU premium_until masih di
-- masa depan. Toggle "Premium Beta" di Profil mengatur is_premium,
-- jadi selama beta, user yang mengaktifkannya tetap bisa menulis.
--
-- Subquery ke profiles aman: policy profiles_select_public
-- (migrasi 001) mengizinkan baca publik, jadi RLS tidak memblokir
-- pengecekan ini.
--
-- Aman di-run ulang (drop if exists + create).

-- ----------------------------------------------------------------------------
-- 1. Insert discussions: hanya pemilik yang Premium
-- ----------------------------------------------------------------------------

drop policy if exists discussions_insert_own on public.discussions;
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
          is_premium is true
          or (premium_until is not null and premium_until > now())
        )
    )
  );
