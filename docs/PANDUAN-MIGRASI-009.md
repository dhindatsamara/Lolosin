# Panduan migrasi 009: kolom admin di profiles (admin panel v1)

Migrasi ini (v2.14) menambah satu kolom di database Supabase proyek
"lolosin": `profiles.is_admin`. Kolom ini menandai akun yang boleh
membuka halaman `/admin` dan memakai Edge Function admin-actions.
Bukan admin berarti halaman `/admin` tertutup dan semua aksi admin
ditolak di sisi server.

File SQL-nya: `supabase/migrations/009_admin_flag.sql`. Semua
perintah SQL di dalamnya aman di-run ulang, jadi kalau ada error di
tengah jalan, perbaiki penyebabnya lalu Run ulang file yang sama.

## Langkah 1: jalankan migrasi 009

1. Buka dashboard Supabase proyek "lolosin".
2. Masuk ke SQL Editor, buat query baru.
3. Buka file `supabase/migrations/009_admin_flag.sql`, salin
   seluruh isinya, paste ke query baru itu, lalu klik Run.
4. Tunggu sampai muncul pesan sukses ("Success. No rows returned").

Yang seharusnya terjadi setelah Run:

- Kolom `is_admin` muncul di tabel `profiles`, semua user lama
  otomatis `false`.
- Hak update dan insert kolom `is_admin` dicabut dari user biasa,
  jadi tidak ada yang bisa menjadikan dirinya admin lewat API.
  (Service role untuk Edge Function tidak terpengaruh.)
- Akun `dhindaimup` otomatis dijadikan admin.

## Langkah 2: verifikasi

Jalankan query ini di SQL Editor:

```sql
-- Harus muncul 1 baris: is_admin, boolean, default false.
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'is_admin';
```

```sql
-- Harus muncul 1 baris: dhindaimup, is_admin true.
select username, is_admin from public.profiles
where username = 'dhindaimup';
```

Kalau baris `dhindaimup` tidak muncul di query kedua, berarti akun
itu belum punya baris profiles di database ini (misal belum pernah
login ke app). Daftar atau login dulu lewat app, lalu jalankan:

```sql
update public.profiles set is_admin = true
where username = 'dhindaimup';
```

Lalu ulangi query verifikasi di atas.

## Langkah 3: tes manual (setelah push v2.14 live)

1. Login dengan akun `dhindaimup`: buka Profil, tombol
   "Buka panel admin" muncul. Buka `/admin`: 5 modul tampil
   (Statistik, User, Kode, Juara, Bank soal).
2. Login dengan akun biasa (bukan admin): buka `/admin`
   langsung dari address bar. Halaman menolak masuk dan
   menampilkan pesan khusus admin.
3. Tamu (logout): buka `/admin` langsung, app mengarahkan
   ke halaman login.

## Menambah admin lain (opsional)

Jalankan di SQL Editor, ganti username-nya:

```sql
update public.profiles set is_admin = true
where username = 'username-admin-baru';
```

Untuk mencabut admin, ganti `true` jadi `false`. Tidak ada cara
menambah admin dari dalam app v1, sengaja begitu supaya tidak
ada jalan pintas promosi diri.
