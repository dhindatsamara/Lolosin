# Panduan migrasi 007: jawaban attempt Akbar tersimpan permanen

Migrasi ini (v2.12.1) menambahkan satu kolom ke database Supabase
proyek "lolosin": kolom JSONB `answers` di tabel `tryout_results`.
Kolom ini menyimpan jawaban tiap attempt Tryout Akbar (id soal +
opsi yang dipilih), supaya riwayat "Lihat hasil" bisa membuka
halaman hasil lengkap dengan pembahasan per soal kapan saja,
bukan cuma skor.

Sebelum v2.12.1, jawaban hanya hidup di halaman hasil segar dalam
sesi yang sama. Akibatnya unlock Senin 00:00 WIB untuk user
gratis (v2.12) hampir tidak terjangkau: user yang menutup halaman
Minggu lalu balik Senin lewat riwayat tetap tidak bisa membaca
pembahasan. Mulai v2.12.1:

- Jawaban Akbar tersimpan di server (kolom baru ini) untuk user
  login, permanen, dan bisa dibuka dari perangkat mana saja.
- Jawaban juga tersimpan lokal di riwayat (30 attempt terakhir,
  ikut tersinkron ke user_progress). Tryout kilat hanya memakai
  jalur lokal karena kilat tidak dikirim ke tryout_results.
- Peringkat per event Akbar ("Peringkat #5 dari 128 peserta" di
  riwayat) TIDAK butuh kolom/tabel baru: peringkat diturunkan di
  app dari kolom yang sudah ada (total, passed, finished_at).

File SQL-nya: `supabase/migrations/007_attempt_answers.sql`.
Semua perintah SQL di dalamnya aman di-run ulang, jadi kalau ada
error di tengah jalan, perbaiki penyebabnya lalu Run ulang file
yang sama.

Tidak ada prasyarat khusus selain migrasi 001 (tabel
`tryout_results` sudah ada sejak awal). Jalankan berurutan saja:
006 dulu bila belum, lalu 007.

## Langkah 1: jalankan migrasi 007

1. Buka dashboard Supabase proyek "lolosin".
2. Masuk ke SQL Editor, buat query baru.
3. Buka file `supabase/migrations/007_attempt_answers.sql`,
   salin seluruh isinya, paste ke query baru itu, lalu klik Run.
4. Tunggu sampai muncul pesan sukses ("Success. No rows returned").

Yang seharusnya terjadi setelah Run:

- Kolom `answers` (jsonb, nullable) ada di `tryout_results`.
- Index `tryout_results_user_finished_idx` dibuat.
- Baris lama tidak berubah: kolom `answers`-nya NULL, dan
  riwayat lama tetap tampil skor saja (tanpa crash).
- Tidak ada tabel atau policy RLS baru.

## Langkah 2: verifikasi

Jalankan query-query ini di SQL Editor (boleh di query baru yang
sama):

```sql
-- Kolom answers ada, harus muncul 1 baris.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'tryout_results'
  and column_name = 'answers';
```

```sql
-- Index ada, harus muncul 1 baris.
select indexname from pg_indexes
where schemaname = 'public'
  and tablename = 'tryout_results'
  and indexname = 'tryout_results_user_finished_idx';
```

Kalau ada yang tidak muncul, Run ulang file 007 dari Langkah 1
(aman di-run ulang), lalu cek lagi.

## Langkah 3: tes manual

### Tes 1: jawaban tersimpan saat Akbar selesai

1. Login di app, selesaikan satu Tryout Akbar (atau tunggu
   event Minggu berikutnya).
2. Cek di SQL Editor:

```sql
-- Baris terbaru user itu: answers terisi JSON questionIds + answers.
select finished_at, total, answers
from public.tryout_results
where mode = 'full'
order by finished_at desc
limit 3;
```

`answers` harus berisi objek seperti
`{"questionIds": ["...", ...], "answers": {"...": "B"}}`.
Kalau NULL padahal attempt-nya dari app v2.12.1, cek
troubleshooting di bawah.

### Tes 2: riwayat membuka pembahasan

1. Di app, buka halaman Tryout, cari attempt Akbar tadi di
   riwayat, ketuk "Lihat hasil".
2. Halaman hasil menampilkan breakdown per soal lengkap
   (bukan cuma skor). Untuk akun gratis sebelum Senin 00:00
   WIB, kartu kunci tampil ("Pembahasan lengkap kebuka hari
   Senin"); setelah Senin 00:00 WIB, pembahasan kebuka.
3. Di riwayat, tiap attempt Akbar menampilkan peringkatnya
   di event itu ("Peringkat #N dari M peserta").

### Tes 3: attempt lama tetap aman

Buka "Lihat hasil" untuk attempt sebelum v2.12.1 (bila ada):
halaman tampil skor saja seperti dulu, tanpa error.

## Catatan penting

- **App tetap jalan bila migrasi ini belum dijalankan.**
  Insert skor yang gagal karena kolom belum ada dikirim ulang
  otomatis tanpa jawaban, jadi skor tetap masuk leaderboard.
  Yang hilang hanya penyimpanan jawaban server untuk attempt
  itu (jawaban tetap tersimpan lokal di riwayat, 30 attempt
  terakhir). Jalankan migrasi ini secepatnya supaya riwayat
  Akbar permanen.
- **Kolom `answers` terbaca publik**, sama seperti skor:
  policy select tryout_results yang sudah ada bersifat
  publik (untuk leaderboard). Isinya hanya id soal + opsi
  yang dipilih, tanpa data pribadi. Bila nanti jawaban
  dianggap perlu dibatasi hanya untuk pemiliknya, perlu tabel
  terpisah dengan policy select-own.
- **Tryout kilat tidak masuk tabel ini.** Kilat hanya
  tersimpan lokal (30 attempt terakhir, ikut tersinkron ke
  user_progress untuk user login). Attempt kilat yang lebih
  lama dari 30 terakhir kehilangan pembahasannya, skornya
  tetap ada.

## Troubleshooting

- **Kolom answers NULL untuk attempt baru**: pastikan app
  yang dipakai sudah v2.12.1 (cek riwayat di app: attempt
  baru harus bisa membuka pembahasan dari "Lihat hasil"
  walau tanpa server, lewat jawaban lokal). Bila jawaban
  lokal jalan tapi kolom server NULL, kemungkinan insert
  pertama gagal lalu dikirim ulang tanpa jawaban (lihat
  catatan di atas); cek apakah migrasi 007 sudah jalan
  (Langkah 2), lalu coba selesaikan satu Akbar lagi.
- **"Lihat hasil" attempt Akbar baru hanya tampil skor**:
  jawaban lokal mungkin sudah dipangkas (di luar 30 attempt
  terakhir) DAN jawaban server tidak ada. Cek Tes 1: bila
  kolom server terisi tapi halaman tetap skor saja, cek log
  browser untuk error baca Supabase.
- **Peringkat per event tidak muncul di riwayat**: peringkat
  hanya muncul untuk attempt Akbar yang `finished_at`-nya
  jatuh di dalam jendela event (Minggu 09:00-11:00 WIB).
  Attempt yang selesai di luar jendela tidak diranking di
  event itu (sama seperti leaderboard). Cek juga apakah user
  login dan Supabase terkonfigurasi (tamu tidak punya
  peringkat).
