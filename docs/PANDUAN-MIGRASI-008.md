# Panduan migrasi 008: menulis diskusi hanya untuk Premium

Migrasi ini (v2.13) mengubah satu hal di database Supabase proyek
"lolosin": policy insert tabel `discussions` diperketat supaya hanya
user Premium yang bisa menulis komentar dan balasan. Membaca diskusi
tetap gratis untuk semua, termasuk tamu, dan menghapus tetap hanya
penulis sendiri atau Dhinda.

Definisi Premium di policy ini sama dengan di app: `is_premium`
true ATAU `premium_until` masih di masa depan. Selama beta, toggle
"Premium Beta" di Profil mengatur `is_premium`, jadi user yang
mengaktifkannya tetap bisa menulis.

File SQL-nya: `supabase/migrations/008_discussions_premium_write.sql`.
Semua perintah SQL di dalamnya aman di-run ulang, jadi kalau ada
error di tengah jalan, perbaiki penyebabnya lalu Run ulang file
yang sama.

## Langkah 1: pastikan migrasi 003 dan 004 sudah jalan

Migrasi 008 PRASYARATNYA migrasi 003 (kolom `profiles.is_premium`)
dan 004 (kolom `profiles.premium_until`). Keduanya sudah dijalankan
ke proyek live (terverifikasi 2026-11-15), tapi cek cepat dulu:

```sql
-- Harus muncul 2 baris: is_premium dan premium_until.
select column_name from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in ('is_premium', 'premium_until');
```

Kalau ada yang tidak muncul, jalankan dulu migrasi yang kurang
(003 lalu 004), baru lanjut ke sini.

## Langkah 2: jalankan migrasi 008

1. Buka dashboard Supabase proyek "lolosin".
2. Masuk ke SQL Editor, buat query baru.
3. Buka file `supabase/migrations/008_discussions_premium_write.sql`,
   salin seluruh isinya, paste ke query baru itu, lalu klik Run.
4. Tunggu sampai muncul pesan sukses ("Success. No rows returned").

Yang seharusnya terjadi setelah Run:

- Policy `discussions_insert_own` yang lama hilang, diganti
  `discussions_insert_premium_own`.
- Policy baca publik dan hapus tidak berubah.
- Tidak ada tabel atau kolom baru.

## Langkah 3: verifikasi

Jalankan query ini di SQL Editor:

```sql
-- Policy INSERT discussions: harus muncul 1 baris,
-- discussions_insert_premium_own. Policy lama sudah tidak ada.
select policyname, cmd, roles from pg_policies
where schemaname = 'public'
  and tablename = 'discussions'
  and cmd = 'INSERT';
```

```sql
-- Semua policy discussions: harus muncul 3 baris (SELECT publik,
-- INSERT premium, DELETE penulis atau admin).
select policyname, cmd from pg_policies
where schemaname = 'public'
  and tablename = 'discussions'
order by cmd, policyname;
```

Kalau ada yang tidak muncul, Run ulang file 008 dari Langkah 2
(aman di-run ulang), lalu cek lagi.

## Langkah 4: tes manual (setelah push v2.13 live)

1. Login dengan akun gratis (bukan Premium Beta): buka satu soal
   di Latihan, jawab, lalu lihat thread diskusinya. Komentar yang
   sudah ada tetap terbaca, tombol "Balas" tidak ada, dan form
   tulis diganti catatan "Menulis di diskusi itu fitur Premium"
   dengan tombol "Lihat Premium".
2. Aktifkan Premium Beta dari Profil, lalu buka lagi thread yang
   sama: form tulis dan tombol "Balas" muncul kembali.
3. Tamu (logout): thread tetap bisa dibaca, form tulis diganti
   ajakan login seperti sebelumnya.
