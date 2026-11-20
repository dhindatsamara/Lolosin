# Panduan deploy Edge Function admin-actions (v2.14)

Panel admin (`/admin`) memanggil Edge Function baru
`admin-actions` untuk semua aksi sensitif: daftar user, kasih
dan cabut premium, daftar dan buat kode redeem, kirim ulang
email kode juara. Function ini belum ada di Supabase, jadi harus
dibuat dulu lewat dashboard (Cupen tidak punya akses deploy Edge
Function). Tanpa function ini, modul User dan Kode di panel admin
menampilkan pesan belum terpasang; modul Statistik, Juara, dan
Bank soal tetap jalan karena membaca data publik langsung.

Kode function-nya: `supabase/functions/admin-actions/index.ts`
(cabang master, sesudah merge v2.14).

## Langkah 1: buat function baru

1. Buka dashboard Supabase proyek "lolosin".
2. Menu Edge Functions, klik "Create a new function" (atau
   "Deploy a new function").
3. Nama function: `admin-actions`.
4. Di editor kode, hapus seluruh isi `index.ts` bawaan.
5. Buka file `supabase/functions/admin-actions/index.ts` dari
   repo, salin seluruh isinya, paste ke editor, lalu klik
   Deploy. Tunggu sampai statusnya sukses.

## Langkah 2: set secret kirim ulang email (penting)

Tombol "Kirim ulang" di modul Juara memanggil function
kirim-kode-pemenang. Di produksi, function itu ter-deploy dengan
slug acak `clever-action`, bukan namanya. Supaya pemanggilan
antar function sampai ke alamat yang benar, set secret ini di
function `admin-actions` (menu Edge Functions, buka
admin-actions, bagian Secrets):

- `WINNER_EMAIL_FUNCTION_SLUG` = `clever-action`

Bila function kirim-kode-pemenang memakai secret
`FUNCTION_SECRET`, set juga yang sama di sini:

- `WINNER_EMAIL_FUNCTION_SECRET` = (nilai yang sama seperti
  FUNCTION_SECRET di kirim-kode-pemenang)

Tanpa slug yang benar, tombol kirim ulang tetap mereset status
email sehingga cron Senin mengirimnya, tapi email tidak langsung
terkirim saat tombol ditekan.

## Langkah 3: verifikasi

1. Pastikan migrasi 009 sudah dijalankan (kolom `is_admin` ada
   dan akun `dhindaimup` sudah admin). Tanpa itu, function
   menolak semua request dengan `forbidden`.
2. Login ke app sebagai `dhindaimup`, buka `/admin`:
   modul User menampilkan daftar user, modul Kode menampilkan
   daftar kode.
3. Tes aksi: buat satu kode baru dari modul Kode (misal 7 hari,
   maks 1 pakai), lalu lihat kodenya muncul di daftar.
4. Tes kirim ulang (bila ada juara yang emailnya belum terkirim):
   tekan "Kirim ulang" di modul Juara, email harus terkirim
   dan statusnya berubah jadi terkirim.

## Catatan keamanan

- verify_jwt untuk function ini HARUS tetap aktif (default saat
  membuat function baru). Tanpa itu, siapa pun bisa memanggil
  function tanpa login; dengan verify_jwt aktif, Supabase
  menolak request tanpa JWT yang sah sebelum kode function jalan.
- Function ini memakai service role key di sisi server saja.
  Key itu tidak pernah dikirim ke browser dan tidak pernah
  ditulis di kode app.
- Bila suatu hari function ini tidak lagi dipakai, hapus
  function-nya dari dashboard; panel admin akan menampilkan
  pesan belum terpasang, bukan error.
