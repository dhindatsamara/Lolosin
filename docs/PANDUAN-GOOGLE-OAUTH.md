# Panduan Google OAuth dan Perbaikan Redirect Email Lolosin

Kode di app sudah siap: tombol "Masuk dengan Google" ada di halaman
masuk/daftar, dan semua email auth sudah mengarah balik ke
`https://lolosin.netlify.app/#/auth`. Tapi fitur ini baru jalan setelah
langkah dashboard di bawah selesai. Sampai langkah (c) dilakukan,
tautan verifikasi email tetap mengarah ke localhost dan login Google
belum bisa dipakai.

Proyek Supabase Lolosin:

- Project ref: `rhoyeloqiorbspsucljt`
- Project URL: `https://rhoyeloqiorbspsucljt.supabase.co`
- Callback OAuth: `https://rhoyeloqiorbspsucljt.supabase.co/auth/v1/callback`
- Domain app: `https://lolosin.netlify.app`

## (a) Google Cloud Console: buat OAuth client ID

1. Buka [Google Cloud Console](https://console.cloud.google.com/) dan
   pilih atau buat satu project (mis. "Lolosin").
2. Buka menu **APIs and Services** lalu **OAuth consent screen**.
   Isi nama aplikasi `Lolosin`, email support, dan email developer.
   Untuk pemakaian awal, pilih audience **External** dan biarkan status
   **Testing**. Catatan: dalam mode Testing, hanya email yang
   ditambahkan di daftar **Test users** yang bisa login Google. Tambahkan
   emailmu sendiri di sana. Bila nanti mau dibuka untuk semua orang,
   klik **Publish app** di halaman yang sama.
3. Buka **APIs and Services** lalu **Credentials**, klik **Create
   Credentials** lalu **OAuth client ID**.
4. Pilih **Application type: Web application**, beri nama mis.
   "Lolosin web".
5. Di **Authorized redirect URIs**, tambahkan persis:
   `https://rhoyeloqiorbspsucljt.supabase.co/auth/v1/callback`
6. Klik **Create**, lalu salin **Client ID** dan **Client Secret**
   yang muncul. Jangan dibagikan ke siapa pun.

## (b) Dashboard Supabase: aktifkan provider Google

1. Buka dashboard Supabase proyek "lolosin".
2. Masuk ke **Authentication** lalu **Providers**.
3. Cari **Google**, aktifkan, lalu paste **Client ID** dan
   **Client Secret** dari langkah (a).
4. Klik **Save**.

## (c) Dashboard Supabase: atur Site URL dan Redirect URL

Langkah ini penting dua kali: selain untuk login Google, ini JUGA
memperbaiki tautan verifikasi email yang saat ini mengarah ke
`localhost:3000`. Penyebabnya: Site URL proyek masih berisi nilai
default localhost.

1. Di dashboard Supabase proyek "lolosin", masuk ke
   **Authentication** lalu **URL Configuration**.
2. Atur **Site URL** menjadi: `https://lolosin.netlify.app`
3. Di **Redirect URLs**, tambahkan: `https://lolosin.netlify.app/#/auth`
4. Klik **Save**.

Setelah langkah ini, email konfirmasi baru akan berisi tautan ke
domain produksi, bukan localhost lagi. Email konfirmasi lama yang
sudah terkirim sebelumnya tetap mengarah ke localhost dan tidak bisa
dipakai; minta tautan baru lewat tombol "Kirim ulang verifikasi" di
app setelah langkah ini selesai.

## (d) Branding email: custom SMTP dulu, baru template bisa diubah

KOREKSI 2026-11-15: di dashboard Supabase sekarang, template email
TIDAK BISA diubah sebelum custom SMTP dipasang ("Set up custom SMTP
to edit templates"). Jadi urutannya: pasang SMTP dulu, baru subjek
dan isi template bisa diedit. Template siap pakai ada di
`email-assets/template-konfirmasi-email.html` + logo PNG
`email-assets/lolosin-logo-email.png`.

### (d1) Pasang custom SMTP pakai Gmail (tanpa email baru)

1. Di akun Google yang mau dipakai, aktifkan verifikasi 2 langkah
   (Google Account lalu Security lalu 2-Step Verification).
2. Masih di Security, buat **App password** (pilih Mail), salin
   sandi 16 karakter yang muncul. Ini BUKAN sandi Gmail biasa, dan
   jangan dibagikan ke siapa pun.
3. Di dashboard Supabase proyek "lolosin", masuk ke **Authentication**
   lalu **Emails**, klik **Set up SMTP** (atau **SMTP Settings**).
4. Isi: Sender email = alamat Gmail-mu; Sender name = `Lolosin`;
   Host = `smtp.gmail.com`; Port = `587`; Username = alamat
   Gmail-mu; Password = app password 16 karakter tadi.
5. Klik **Save**. Mulai sekarang email dikirim lewat Gmail-mu dengan
   nama pengirim Lolosin (limit Gmail gratis sekitar 500 email/hari,
   cukup untuk sekarang). Email khusus (mis. lolosin.app@gmail.com)
   boleh dipakai supaya lebih rapi, tapi tidak wajib.
6. Catatan limit: Supabase membatasi email auth (anti-spam; tanpa
   batas, bot bisa menyalahgunakan form daftar untuk mengirim spam).
   Setelah custom SMTP aktif, limitnya naik jadi 30 email/jam, dan
   bisa diubah kapan pun di **Authentication** lalu **Rate Limits**.
   Untuk tahap beta sekarang, 30/jam sudah lebih dari cukup.

### (d2) Ubah template konfirmasi jadi Lolosin

1. Setelah SMTP aktif, kolom Subject dan Body di halaman yang sama
   sudah bisa diedit. Pilih template **Confirm signup**.
2. Ubah **Subject** jadi `Konfirmasi emailmu di Lolosin`.
3. Ubah isi email: salin seluruh isi
   `email-assets/template-konfirmasi-email.html` ke kolom Body
   (tab Source). Jangan hapus variabel tautan
   `{{ .ConfirmationURL }}` karena itu tautan konfirmasinya.
4. Logo: di dalam template ada `LOGO_URL` yang harus diganti dengan
   URL publik logo PNG. Caranya: upload
   `email-assets/lolosin-logo-email.png` ke Supabase Storage (buat
   bucket public, mis. "assets"), salin Public URL-nya, lalu ganti
   `LOGO_URL` di template. Alternatif cepat: pakai
   `https://lolosin.netlify.app/icons/icon.svg`, tapi Gmail kadang
   tidak menampilkan gambar SVG, jadi PNG lebih aman.
5. Klik **Save**.

## (e) Cara mengetes

### Tes verifikasi email (setelah langkah c)

1. Daftar akun baru di `https://lolosin.netlify.app/#/auth?mode=daftar`
   dengan email yang bisa kamu akses.
2. Buka inbox, klik tautan konfirmasi. Tautan harus mengarah ke
   `lolosin.netlify.app`, bukan localhost.
3. Setelah klik, kamu mendarat di app dan bisa masuk. Coba juga skenario
   gagal: daftar lalu langsung masuk tanpa klik tautan, app harus
   menampilkan layar "Cek emailmu" dan tidak bisa dipakai sampai email
   dikonfirmasi.

### Tes login Google (setelah langkah a dan b)

1. Buka `https://lolosin.netlify.app/#/auth`, klik
   **Masuk dengan Google**.
2. Pilih akun Google. Setelah kembali ke app, isi username di form
   "Lengkapi profilmu".
3. Pastikan username tampil di header (bukan email), dan halaman
   Profil bisa dibuka lewat pill username di header.

### Bila ada masalah

- Tombol Google menampilkan "Login Google belum diaktifkan":
  provider Google belum aktif di dashboard, ulangi langkah (b).
- Tautan email masih mengarah ke localhost: Site URL belum diubah,
  ulangi langkah (c), lalu minta tautan baru.
- Tautan email menampilkan "otp_expired": tautan sudah kedaluwarsa,
  minta tautan baru lewat tombol kirim ulang di app.
