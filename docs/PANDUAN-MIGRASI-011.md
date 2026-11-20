# Panduan migrasi 011: tabel klaim pembayaran premium (bayar QRIS v2.15)

Migrasi ini (v2.15) menambah satu tabel di database Supabase proyek
"lolosin": `payment_claims`. Tabel ini menyimpan klaim "Saya sudah
bayar" dari user setelah membayar paket premium lewat QRIS. Klaim
baru berstatus `pending`; admin menyetujui atau menolaknya dari
modul Pembayaran di panel admin, dan premium aktif hanya setelah
disetujui.

File SQL-nya: `supabase/migrations/011_payment_claims.sql`. Semua
perintah SQL di dalamnya aman di-run ulang, jadi kalau ada error di
tengah jalan, perbaiki penyebabnya lalu Run ulang file yang sama.

## Langkah 1: jalankan migrasi 011

1. Buka dashboard Supabase proyek "lolosin".
2. Masuk ke SQL Editor, buat query baru.
3. Buka file `supabase/migrations/011_payment_claims.sql`, salin
   seluruh isinya, paste ke query baru itu, lalu klik Run.
4. Tunggu sampai muncul pesan sukses ("Success. No rows returned").

Yang seharusnya terjadi setelah Run:

- Tabel `payment_claims` muncul, lengkap dengan indeks dan RLS.
- User bisa membuat klaim miliknya sendiri dan membaca klaim
  miliknya sendiri, tapi TIDAK bisa mengubah status klaim lewat
  API (tidak ada policy update/delete dari client).
- Admin bisa membaca semua klaim untuk modul Pembayaran.

## Langkah 2: verifikasi

Jalankan query ini di SQL Editor:

```sql
-- Harus muncul 1 baris: payment_claims, RLS aktif (rowsecurity true).
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'payment_claims';
```

```sql
-- Harus muncul 3 policy: insert_own, select_own, select_admin.
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'payment_claims'
order by policyname;
```

Kalau tabel belum muncul, kemungkinan file SQL belum ter-Run
penuh; paste ulang seluruh isi file dan Run lagi.

## Catatan penting

- Jalankan migrasi ini SETELAH migrasi 009 (kolom `is_admin`
  dipakai policy `payment_claims_select_admin`). Urutan jalankan
  yang benar: 006, 007, 008, 009, 010, 011.
- Setelah migrasi ini jalan, deploy ulang Edge Function
  `admin-actions` (lihat `docs/PANDUAN-REDEPLOY-EDGE-ADMIN.md`)
  supaya tiga aksi barunya (list_payments, approve_payment,
  reject_payment) tersedia untuk modul Pembayaran.
- Gambar QRIS di `public/qris-lolosin.png` adalah kode QR asli
  Lolosin (GoPay Merchant, di-crop hanya kode QR-nya saja tanpa
  nama pemilik atau branding). Kode QR-nya sudah diverifikasi
  bisa di-scan dan payload-nya identik dengan poster aslinya.
