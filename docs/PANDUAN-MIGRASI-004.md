# Panduan migrasi 004: kode redeem, sinkron progress, juara mingguan

Migrasi ini (v2.7) menambahkan tiga hal ke database Supabase proyek
"lolosin":

1. Sistem kode redeem premium: tabel `codes` dan `code_redemptions`,
   plus fungsi `redeem_code` (klaim kode dari app) dan
   `create_redeem_code` (Dhinda membuat kode dari halaman Profil).
2. Sinkron progress antar perangkat: tabel `user_progress` dan kolom
   `profiles.premium_until`.
3. Pengumuman juara mingguan otomatis: fungsi
   `announce_weekly_winners` yang dijadwalkan tiap Senin pagi lewat
   `pg_cron`.

File SQL-nya: `supabase/migrations/004_redeem_codes_progress.sql`.
Semua perintah di dalamnya aman di-run ulang, jadi kalau ada error di
tengah jalan, perbaiki penyebabnya lalu Run ulang file yang sama.

## Langkah 1: jalankan migrasi 004

1. Buka dashboard Supabase proyek "lolosin".
2. Masuk ke SQL Editor, buat query baru.
3. Buka file `supabase/migrations/004_redeem_codes_progress.sql`,
   salin seluruh isinya, paste ke query baru itu, lalu klik Run.
4. Tunggu sampai muncul pesan sukses ("Success. No rows returned").

Yang seharusnya terjadi setelah Run:

- Tabel baru: `codes`, `code_redemptions`, `user_progress`.
- Kolom baru: `premium_until` di tabel `profiles`.
- Fungsi baru: `redeem_code`, `create_redeem_code`,
  `announce_weekly_winners`.
- Blok `pg_cron` di akhir file SENGAJA dikomentari, jadi tidak ikut
  jalan di langkah ini. Itu normal, blok itu dijalankan di Langkah 4.

## Langkah 2: verifikasi

Jalankan tiga query ini di SQL Editor (boleh di query baru yang sama):

```sql
-- Tabel baru ada, harus muncul 3 baris.
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('codes', 'code_redemptions', 'user_progress');
```

```sql
-- Kolom premium_until ada, harus muncul 1 baris bertipe timestamptz.
select column_name, data_type from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'premium_until';
```

```sql
-- Fungsi ada, harus muncul 3 baris.
select routine_name from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('redeem_code', 'create_redeem_code', 'announce_weekly_winners');
```

Kalau ada yang tidak muncul, Run ulang file 004 dari Langkah 1
(aman di-run ulang), lalu cek lagi.

## Langkah 3: aktifkan ekstensi pg_cron

1. Di dashboard Supabase, masuk ke Database, lalu Extensions.
2. Cari `pg_cron`, lalu klik Enable.
3. `pg_cron` diaktifkan dari dashboard, bukan dari SQL Editor.

## Langkah 4: jadwalkan pengumuman juara mingguan

Setelah ekstensi aktif, jalankan perintah ini di SQL Editor
(sama dengan blok yang dikomentari di akhir file 004):

```sql
select cron.schedule(
  'umumkan-juara-mingguan',
  '0 1 * * 1',
  'select public.announce_weekly_winners();'
);
```

Jadwal `0 1 * * 1` artinya setiap Senin pukul 01:00 UTC, sama dengan
09:00 WITA. Pengumuman jalan tiap Senin pagi untuk minggu yang baru
selesai, plus minggu mana pun yang tertinggal.

Cek jadwalnya:

```sql
select * from cron.job;
```

Harus muncul satu baris dengan jobname `umumkan-juara-mingguan`
dan schedule `0 1 * * 1`. Menjalankan `cron.schedule` lagi dengan
nama job yang sama akan memperbarui jadwal yang sudah ada, bukan
membuat duplikat, jadi aman di-run ulang.

Cek riwayat jalan (setelah Senin pertama):

```sql
select * from cron.job_run_details order by start_time desc limit 10;
```

## Menjalankan pengumuman secara manual

Kapan pun, pengumuman bisa dijalankan manual dari SQL Editor:

```sql
select public.announce_weekly_winners();
```

Perintah ini mengumumkan semua minggu yang sudah selesai tapi belum
diumumkan, lalu menampilkan seluruh daftar juara. Aman dijalankan
ulang: minggu yang sudah diumumkan akan dilewati.

## Catatan penting: proyek free tier bisa pause

Proyek Supabase free tier auto-pause setelah sekitar 7 hari tanpa
aktivitas API. Saat pause, `pg_cron` berhenti dan job yang terlewat
tidak jalan sendiri. Kabar baiknya, fungsi
`announce_weekly_winners` dirancang mengejar semua minggu yang
tertinggal begitu jalan lagi, jadi tidak ada juara yang hilang,
hanya tertunda pengumumannya.

Selagi ada user yang mengirim skor simulasi, aktivitas itu sendiri
menjaga proyek tetap bangun. Kalau seminggu penuh tidak ada satu pun
simulasi dan Senin pagi terlewat, jalankan saja perintah manual di
atas sekali dari SQL Editor.

## Yang belum bisa di v2.7: email otomatis kode pemenang

Terus terang, pengiriman email berisi kode hadiah ke pemenang secara
otomatis belum bisa dilakukan dari SQL. SMTP custom di Supabase hanya
dipakai untuk email auth (verifikasi dan reset password), bukan
untuk email bebas dari dalam database.

Di v2.7, pemenang melihat hadiahnya sebagai gift notice di dalam app
saat login: premium sudah aktif langsung dan lencana Juara Mingguan
diberikan. Kode hadiahnya belum ditampilkan di app (premiumnya sudah
aktif tanpa perlu klaim); kode itu menjadi artefak untuk pengiriman
email nanti. Email otomatis butuh Edge Function, dan itu pekerjaan
lanjutan di luar migrasi ini.

## Catatan tes

- `redeem_code` dan `create_redeem_code` hanya bisa dites dari app
  saat login, karena keduanya memakai `auth.uid()` untuk tahu siapa
  yang memanggil. Dari SQL Editor keduanya tidak bisa dites:
  `create_redeem_code` akan gagal dengan error `forbidden` karena
  tidak ada user login di SQL Editor. Untuk mengetes pembuatan kode,
  login di app sebagai `dhindaimup`, lalu pakai generator kode di
  halaman Profil.
- `announce_weekly_winners` bisa dijalankan manual dari SQL Editor
  (lihat perintah di atas), karena fungsi ini tidak memakai
  `auth.uid()`.
