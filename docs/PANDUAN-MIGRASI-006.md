# Panduan migrasi 006: juara mingguan dari Tryout Akbar + papan live

Migrasi ini (v2.11) melakukan dua hal ke database Supabase proyek
"lolosin":

1. Fungsi `announce_weekly_winners` ditulis ulang: juara mingguan
   kini HANYA dihitung dari hasil Tryout Akbar, yaitu hasil mode
   'full' yang `finished_at`-nya jatuh di dalam jendela event
   Akbar minggu itu (Minggu 09:00-11:00 WIB = Minggu 02:00-04:00
   UTC). Simulasi CAT mandiri dihapus di v2.11, jadi semua hasil
   'full' baru memang berasal dari Akbar; filter jendela ini
   menjaga supaya hasil di luar jam event (misal sesi yang
   selesai telat, atau hasil lama sebelum v2.11) tidak ikut
   diranking. Aturan seri TIDAK berubah: total tertinggi, lalu
   yang lolos semua ambang batas, lalu yang paling dulu selesai.
   Perilaku code-only dari 005 juga TIDAK berubah (kode klaim
   untuk juara global, badge saja untuk juara per formasi).
2. Tabel `tryout_results` ditambahkan ke publikasi
   `supabase_realtime`, supaya papan live premium di halaman
   Tryout Akbar dan Peringkat bisa berlangganan skor baru selama
   event berlangsung.

File SQL-nya: `supabase/migrations/006_akbar_winners.sql`.
Semua perintah SQL di dalamnya aman di-run ulang, jadi kalau ada
error di tengah jalan, perbaiki penyebabnya lalu Run ulang file
yang sama.

Jadwal pg_cron 'umumkan-juara-mingguan' (Senin 01:00 UTC) TIDAK
berubah: event Minggu berakhir 04:00 UTC, jadi Senin 01:00 UTC
tetap sesudah event. Nama + signature return fungsi juga SAMA,
jadi cron lama tetap jalan tanpa diubah.

## Langkah 1: jalankan migrasi 005 dulu bila belum

Migrasi 006 PRASYARATNYA migrasi 005: fungsi yang ditimpa 006
dibuat di 004 dan diperbaiki di 005, dan tabel `codes` serta
kolom `weekly_winners.code` dibuat di 004/005. Kalau 005 belum
pernah dijalankan ke proyek live, jalankan dulu dengan mengikuti
`docs/PANDUAN-MIGRASI-005.md`.

Cek cepat apakah 005 sudah jalan:

```sql
-- Harus muncul 1 baris: kolom code sudah ada di weekly_winners.
select column_name from information_schema.columns
where table_schema = 'public'
  and table_name = 'weekly_winners'
  and column_name = 'code';
```

Kalau tidak muncul, jalankan dulu file 005, baru lanjut ke sini.

## Langkah 2: jalankan migrasi 006

1. Buka dashboard Supabase proyek "lolosin".
2. Masuk ke SQL Editor, buat query baru.
3. Buka file `supabase/migrations/006_akbar_winners.sql`,
   salin seluruh isinya, paste ke query baru itu, lalu klik Run.
4. Tunggu sampai muncul pesan sukses ("Success. No rows returned").

Yang seharusnya terjadi setelah Run:

- Tabel `tryout_results` masuk publikasi `supabase_realtime`.
- Fungsi `announce_weekly_winners` tertimpa versi Akbar
  (nama + hasil return sama seperti 005, jadi jadwal pg_cron
  'umumkan-juara-mingguan' tetap jalan tanpa diubah).
- Tidak ada tabel atau kolom baru.

## Langkah 3: verifikasi

Jalankan query-query ini di SQL Editor (boleh di query baru yang
sama):

```sql
-- tryout_results ada di publikasi realtime, harus muncul 1 baris.
select pubname, schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'tryout_results';
```

```sql
-- Fungsi announce_weekly_winners ada, harus muncul 1 baris.
select routine_name from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'announce_weekly_winners';
```

```sql
-- Jadwal cron tidak berubah: harus muncul dua baris.
select jobname, schedule from cron.job;
```

Dua baris yang diharapkan: `umumkan-juara-mingguan`
(`0 1 * * 1`) dan `kirim-email-pemenang` (`5 1 * * 1`).

Kalau ada yang tidak muncul, Run ulang file 006 dari Langkah 2
(aman di-run ulang), lalu cek lagi.

## Langkah 4: tes manual

### Tes 1: cek hasil Akbar minggu lalu

Query ini menunjukkan berapa hasil 'full' minggu lalu yang
masuk jendela Akbar dan berapa yang di luar jendela:

```sql
-- Ganti '2026-11-16' dengan Senin minggu yang mau dicek.
select
  count(*) filter (
    where finished_at >= (('2026-11-16'::date + interval '6 days')::timestamp + interval '2 hours') at time zone 'UTC'
      and finished_at < (('2026-11-16'::date + interval '6 days')::timestamp + interval '4 hours') at time zone 'UTC'
  ) as di_dalam_jendela,
  count(*) filter (
    where finished_at < (('2026-11-16'::date + interval '6 days')::timestamp + interval '2 hours') at time zone 'UTC'
       or finished_at >= (('2026-11-16'::date + interval '6 days')::timestamp + interval '4 hours') at time zone 'UTC'
  ) as di_luar_jendela
from public.tryout_results
where mode = 'full'
  and week_start = '2026-11-16';
```

`di_dalam_jendela` adalah hasil yang ikut diranking juara
mingguan; `di_luar_jendela` tidak ikut.

### Tes 2: pengumuman + kode dibuat

Jalankan pengumuman manual dari SQL Editor (perintah ini
mengumumkan semua minggu yang sudah selesai tapi belum
diumumkan; aman dijalankan ulang):

```sql
select public.announce_weekly_winners();
```

Lalu cek juaranya:

```sql
-- Juara global minggu terbaru: code terisi, premium_until NULL,
-- email_sent_at masih NULL (email belum dikirim).
select week_start, scope, rank, user_id, total, code,
  premium_until, email_sent_at
from public.weekly_winners
where scope = 'global'
order by week_start desc, rank
limit 10;
```

Kalau belum ada yang menyelesaikan Tryout Akbar minggu lalu,
tidak ada juara yang diumumkan dan itu normal. Untuk tes
end-to-end, perlu minimal satu skor Akbar (`mode = 'full'`,
`finished_at` di dalam jendela Minggu 02:00-04:00 UTC) di
minggu yang sudah selesai.

### Tes 3: papan live di app

1. Login di app sebagai akun premium, buka halaman Tryout
   Akbar saat event sedang berlangsung (Minggu 09:00-11:00
   WIB). Badge "Live" muncul di atas papan peringkat.
2. Dari akun lain, selesaikan satu Tryout Akbar. Skor baru
   muncul di papan akun premium tanpa perlu menekan
   "Muat ulang" (paling lambat 15 detik, lewat polling
   fallback, bila Realtime tidak tersambung).
3. Login sebagai akun gratis di jam yang sama: papan
   menampilkan "Papan peringkat terbuka jam 16:00 WIB".
   Setelah jam 16:00 WIB, papan terbuka untuk semua.

## Catatan penting

- **Minggu yang sudah diumumkan sebelum 006 tidak diumumkan
  ulang.** Guard `not exists` di fungsi melewati minggu yang
  juara globalnya sudah ada. Jadi juara minggu-minggu lama
  tetap seperti semula; aturan Akbar berlaku mulai minggu
  pertama yang diumumkan setelah 006 dijalankan.
- **Proyek free tier bisa pause.** Sama seperti di panduan
  005: setelah sekitar 7 hari tanpa aktivitas API, proyek
  auto-pause dan `pg_cron` berhenti. `announce_weekly_winners`
  mengumumkan semua minggu yang tertinggal begitu jalan lagi,
  jadi tidak ada juara yang hilang, hanya tertunda. Kalau
  Senin pagi terlewat, jalankan pengumuman manual (Tes 2)
  lalu panggil Edge Function email manual (lihat panduan 005
  langkah 8 Tes 2).

## Troubleshooting

- **Query verifikasi realtime tidak muncul**: migrasi 006
  mungkin belum jalan, atau tabel sudah masuk publikasi dengan
  nama skema berbeda. Cek semua anggota publikasi:
  ```sql
  select * from pg_publication_tables
  where pubname = 'supabase_realtime';
  ```
  Lalu Run ulang file 006 (aman di-run ulang).
- **Papan live tidak update otomatis**: cek dulu apakah
  `tryout_results` ada di publikasi (query di atas). Bila ada
  tapi papan tetap tidak update, polling fallback 15 detik
  seharusnya tetap memuat skor baru; bila itu pun tidak jalan,
  cek log browser untuk error koneksi Realtime dan pastikan
  proyek tidak sedang pause.
- **Juara minggu lalu kosong padahal ada yang ikut Akbar**:
  cek Tes 1: mungkin `finished_at`-nya di luar jendela
  (sesi selesai setelah 11:00 WIB). Itu perilaku yang
  dirancang: hanya hasil di dalam jendela event yang
  diranking. Cek juga apakah minggu itu sudah diumumkan
  sebelum 006 (lihat catatan di atas).
- **Fungsi menjawab error saat dijalankan manual**: pastikan
  migrasi 005 sudah jalan (Langkah 1). Error yang menyebut
  tabel `codes` atau kolom `code` berarti 005 belum dijalankan.
