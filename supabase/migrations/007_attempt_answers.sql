-- ============================================================================
-- Lolosin: migrasi 007, jawaban attempt Akbar tersimpan permanen
-- ============================================================================
--
-- CARA PAKAI:
--   1. Buka dashboard Supabase proyek "lolosin".
--   2. Masuk ke SQL Editor, buat query baru.
--   3. Paste seluruh isi file ini, lalu klik Run.
--   4. Skrip ini aman di-run ulang: semua perintah memakai IF NOT EXISTS.
--
-- APA YANG BERUBAH (v2.12.1):
--   - Kolom JSONB `answers` ditambahkan ke `tryout_results`.
--     Bentuk isinya: {"questionIds": ["id-soal-1", ...], "answers":
--     {"id-soal-1": "B", ...}} (hanya id soal + opsi yang dipilih;
--     teks soal, kunci, dan pembahasan diambil lagi dari bank soal
--     di app). Kolom ini nullable: baris lama (sebelum v2.12.1)
--     bernilai NULL dan tetap tampil skor saja di riwayat.
--   - Index (user_id, finished_at) untuk mengambil jawaban satu
--     attempt milik user dari halaman hasil riwayat.
--
-- APA YANG TIDAK BERUBAH:
--   - Tidak ada tabel baru, tidak ada policy RLS baru. Kolom
--     `answers` ikut terbaca lewat policy select publik
--     tryout_results yang sudah ada (sama seperti skor
--     twk/tiu/tkp/total yang memang tampil di leaderboard).
--     Isinya hanya id soal + opsi yang dipilih, tanpa data
--     pribadi. Bila nanti jawaban dianggap perlu dibatasi hanya
--     untuk pemiliknya, perlu tabel terpisah dengan policy
--     select-own (policy RLS tidak bisa membatasi per kolom).
--   - Peringkat per event Akbar TIDAK butuh kolom/tabel baru:
--     peringkat diturunkan di app dari kolom yang sudah ada
--     (total, passed, finished_at) dengan aturan seri yang sama
--     dengan leaderboard mingguan.
--   - App tetap jalan bila migrasi ini belum dijalankan: insert
--     skor yang gagal karena kolom belum ada dikirim ulang
--     otomatis tanpa jawaban (skor tetap masuk leaderboard;
--     jawaban attempt itu hanya tersimpan lokal di riwayat).
--
-- ============================================================================

-- Jawaban attempt (JSONB, nullable): baris lama tetap NULL.
alter table public.tryout_results
  add column if not exists answers jsonb;

comment on column public.tryout_results.answers is
  'Jawaban attempt (v2.12.1): {"questionIds": [...], "answers": {"id-soal": "A"}}. Hanya id soal + opsi yang dipilih; teks soal diambil lagi dari bank soal di app. NULL untuk baris sebelum v2.12.1. Terbaca lewat policy select publik yang sama dengan skor.';

-- Ambil jawaban satu attempt milik user dari finished_at-nya.
create index if not exists tryout_results_user_finished_idx
  on public.tryout_results (user_id, finished_at);
