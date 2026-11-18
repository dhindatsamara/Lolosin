# Panduan migrasi 005: diskusi soal, perbaikan hadiah juara, email kode pemenang

Migrasi ini (v2.8) melakukan tiga hal ke database Supabase proyek
"lolosin", plus satu Edge Function baru:

1. Tabel `discussions` untuk kolom komentar per soal (dipakai fitur
   diskusi v2.8).
2. Perbaikan hadiah juara mingguan: migrasi 004 memberi premium
   LANGSUNG ke profil juara global PLUS satu kode klaim, sehingga
   premium bertumpuk bila kodenya di-redeem (double-grant). Sejak
   v2.8, fungsi `announce_weekly_winners` HANYA membuat kode hadiah
   (7/5/3 hari sesuai rank, berlaku 30 hari) dan menyimpannya ke
   kolom baru `weekly_winners.code`. Premium juara HANYA aktif saat
   kode ditebus di app (Profil, bagian Premium). Kolom baru kedua,
   `weekly_winners.email_sent_at`, mencatat kapan email kode sudah
   dikirim ke juara.
3. Edge Function `kirim-kode-pemenang` yang mengirim email berisi
   kode hadiah ke juara global lewat Resend API, dijadwalkan tiap
   Senin 09:05 WITA (5 menit setelah pengumuman juara).

File SQL-nya: `supabase/migrations/005_discussions_winners_fix.sql`.
File function-nya: `supabase/functions/kirim-kode-pemenang/index.ts`.
Semua perintah SQL di dalamnya aman di-run ulang, jadi kalau ada
error di tengah jalan, perbaiki penyebabnya lalu Run ulang file
yang sama.

## Langkah 1: jalankan migrasi 004 dulu bila belum

Migrasi 005 PRASYARATNYA migrasi 004: tabel `codes` yang dipakai
kode hadiah dibuat di 004, dan fungsi yang ditimpa 005 juga dibuat
di 004. Kalau 004 belum pernah dijalankan ke proyek live, jalankan
dulu dengan mengikuti `docs/PANDUAN-MIGRASI-004.md` (langkah 1 dan
2 saja cukup untuk prasyarat ini; jadwal pg_cron 004 tetap perlu
dijalankan, lihat langkah 7 di bawah).

Cek cepat apakah 004 sudah jalan:

```sql
-- Harus muncul 1 baris: tabel codes sudah ada.
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name = 'codes';
```

Kalau tidak muncul, jalankan dulu file 004, baru lanjut ke sini.

## Langkah 2: jalankan migrasi 005

1. Buka dashboard Supabase proyek "lolosin".
2. Masuk ke SQL Editor, buat query baru.
3. Buka file `supabase/migrations/005_discussions_winners_fix.sql`,
   salin seluruh isinya, paste ke query baru itu, lalu klik Run.
4. Tunggu sampai muncul pesan sukses ("Success. No rows returned").

Yang seharusnya terjadi setelah Run:

- Tabel baru: `discussions`.
- Kolom baru: `code` dan `email_sent_at` di tabel `weekly_winners`.
- Fungsi `announce_weekly_winners` tertimpa versi code-only
  (nama + hasil return sama seperti 004, jadi jadwal pg_cron
  'umumkan-juara-mingguan' dari 004 tetap jalan tanpa diubah).
- Blok `pg_cron` ke-2 di akhir file SENGAJA dikomentari, jadi tidak
  ikut jalan di langkah ini. Itu normal, blok itu dijalankan di
  Langkah 7 setelah Edge Function di-deploy.

## Langkah 3: verifikasi

Jalankan query-query ini di SQL Editor (boleh di query baru yang
sama):

```sql
-- Tabel discussions ada, harus muncul 1 baris.
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name = 'discussions';
```

```sql
-- Kolom code + email_sent_at ada, harus muncul 2 baris.
select column_name, data_type from information_schema.columns
where table_schema = 'public'
  and table_name = 'weekly_winners'
  and column_name in ('code', 'email_sent_at');
```

```sql
-- Policy discussions ada, harus muncul 3 baris.
select policyname from pg_policies
where schemaname = 'public'
  and tablename = 'discussions';
```

```sql
-- Fungsi announce_weekly_winners ada, harus muncul 1 baris.
select routine_name from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'announce_weekly_winners';
```

Kalau ada yang tidak muncul, Run ulang file 005 dari Langkah 2
(aman di-run ulang), lalu cek lagi.

## Langkah 4: setup Resend

Email hadiah dikirim lewat Resend (https://resend.com), bukan
lewat SMTP Supabase: SMTP custom di Supabase hanya dipakai untuk
email auth (verifikasi dan reset password), bukan untuk email bebas
dari dalam database. Paket gratis Resend (3.000 email per bulan,
maksimal 100 per hari) jauh lebih dari cukup: email juara hanya
3 per minggu.

1. Buat akun di https://resend.com (gratis, tanpa kartu).
2. Verifikasi domain pengirim, ATAU pakai alamat onboarding untuk
   tes dulu:
   - Opsi A (untuk produksi): di dashboard Resend, masuk ke
     Domains, tambahkan domain yang kamu kuasai DNS-nya
     (misal `lolosin.app`), lalu salin record DNS yang diminta
     Resend (SPF, DKIM, MX) ke penyedia DNS-mu. Verifikasi
     biasanya selesai dalam 15 menit, tapi propagasi DNS bisa
     sampai 72 jam. Setelah terverifikasi, function mengirim
     dari `Lolosin <hadiah@lolosin.app>` (alamat default di
     kode). Kalau domainmu bukan `lolosin.app`, set secret
     `RESEND_FROM` di Langkah 5 ke alamat di domainmu, misal
     `Lolosin <hadiah@domainmu.com>`.
   - Opsi B (untuk tes saja): tidak perlu verifikasi domain.
     Set secret `RESEND_FROM` di Langkah 5 ke
     `Lolosin <onboarding@resend.dev>`. Batasnya: Resend hanya
     mengantar email tes ke alamat email akun Resend-mu
     sendiri. Email ke alamat lain ditolak dengan error 403.
     Jadi opsi ini hanya cukup untuk memastikan function jalan,
     bukan untuk mengirim ke juara beneran.
3. Buat API key: di dashboard Resend, masuk ke API Keys, klik
   Create API Key, beri nama misal `lolosin-pemenang`, pilih
   permission "Sending access", lalu salin key-nya (diawali
   `re_`). Key hanya tampil sekali, jadi simpan baik-baik.

## Langkah 5: set function secret

Secret disimpan di proyek Supabase, bukan di kode. Yang wajib
hanya `RESEND_API_KEY`; dua lainnya opsional.

Cara 1, lewat CLI (dari folder repo, setelah `supabase link`
ke proyek):

```bash
supabase secrets set RESEND_API_KEY=re_xxxkuncimu
```

Cara 2, lewat dashboard: masuk ke Edge Functions, lalu Secrets,
tambah secret `RESEND_API_KEY` dengan nilai API key dari
Langkah 4.

Opsional:

- `RESEND_FROM`: alamat pengirim. Bila tidak diset, function
  memakai `Lolosin <hadiah@lolosin.app>`. Set ini bila domainmu
  berbeda, atau ke `Lolosin <onboarding@resend.dev>` untuk tes
  (lihat Langkah 4 opsi B).
- `FUNCTION_SECRET`: secret tambahan. Bila diset, setiap panggilan
  ke function harus membawa header `x-function-secret` dengan
  nilai yang sama, sebagai lapisan tambahan di atas verifikasi
  JWT default Supabase (yang tetap aktif). Bila kamu menyet ini,
  tambahkan juga header itu ke perintah pg_cron di Langkah 7
  (baris opsionalnya sudah ditulis di blok SQL).

## Langkah 6: deploy Edge Function

Cara 1, lewat CLI (dari folder repo, setelah `supabase link`
ke proyek):

```bash
supabase functions deploy kirim-kode-pemenang
```

Cara 2, lewat dashboard: masuk ke Edge Functions, klik
Deploy a new function (atau Create function), beri nama
`kirim-kode-pemenang`, lalu paste isi file
`supabase/functions/kirim-kode-pemenang/index.ts` sebagai
kode function-nya dan deploy. Cara CLI lebih disarankan
supaya yang ter-deploy persis sama dengan file di repo.

Setelah deploy, function bisa dipanggil di URL:

```
https://<PROJECT_REF>.supabase.co/functions/v1/kirim-kode-pemenang
```

`<PROJECT_REF>` adalah bagian depan URL proyekmu, misal
`abcdefghijklm` di `https://abcdefghijklm.supabase.co`.

## Langkah 7: aktifkan pg_net + jadwalkan pengiriman email

Job pengumuman juara ('umumkan-juara-mingguan', Senin 09:00 WITA)
tetap seperti di panduan 004. Di v2.8 ada job kedua yang
mengirim emailnya, 5 menit kemudian.

1. Di dashboard Supabase, masuk ke Database, lalu Extensions.
2. Cari `pg_net`, lalu klik Enable. (`pg_net` tersedia di semua
   paket Supabase termasuk free tier; ini ekstensi resmi yang
   dipakai Supabase sendiri untuk webhook database. `pg_cron`
   juga harus sudah aktif, lihat panduan 004 langkah 3.)
3. Setelah `pg_net` aktif dan function sudah di-deploy (Langkah
   6), jalankan perintah ini di SQL Editor (sama dengan blok
   yang dikomentari di akhir file 005; ganti `<PROJECT_REF>`
   dan `<ANON_KEY>` dengan nilai proyekmu, anon key ada di
   Dashboard > Settings > API):

```sql
select cron.schedule(
  'kirim-email-pemenang',
  '5 1 * * 1',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/kirim-kode-pemenang',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', '<ANON_KEY>',
      'Authorization', 'Bearer <ANON_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Jadwal `5 1 * * 1` artinya setiap Senin pukul 01:05 UTC, sama
dengan 09:05 WITA. Jeda 5 menit dari pengumuman memberi waktu
fungsi `announce_weekly_winners` selesai membuat kode dulu.

Cek jadwalnya:

```sql
select * from cron.job;
```

Harus muncul dua baris: `umumkan-juara-mingguan` (`0 1 * * 1`)
dan `kirim-email-pemenang` (`5 1 * * 1`). Menjalankan
`cron.schedule` lagi dengan nama job yang sama akan memperbarui
jadwal yang sudah ada, bukan membuat duplikat, jadi aman
di-run ulang.

Catatan keamanan: anon key di perintah cron tersimpan di tabel
job pg_cron dan terlihat di antrean `pg_net` sampai request
terkirim. Itu pola yang didokumentasikan Supabase untuk
memanggil Edge Function dari pg_cron, dan anon key memang
dirancang untuk dipakai di client publik. Kalau mau lebih
rapi, simpan key di Supabase Vault dan baca dari
`vault.decrypted_secrets` di perintah cron (lihat dokumentasi
Supabase "Scheduling Edge Functions"). Function-nya sendiri
idempotent dan hanya mengirim email ke juara yang belum
dikirim, jadi pemanggilan ekstra pun tidak mengirim email
ganda.

## Langkah 8: tes manual

### Tes 1: pengumuman + kode dibuat

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

Kalau belum ada simulasi yang selesai minggu lalu, tidak ada
juara yang diumumkan dan itu normal. Untuk tes end-to-end,
perlu minimal satu skor simulasi (`mode = 'full'`) di minggu
yang sudah selesai.

### Tes 2: panggil Edge Function lewat curl

Ganti `<PROJECT_REF>` dan `<ANON_KEY>` dengan nilai proyekmu:

```bash
curl -X POST \
  https://<PROJECT_REF>.supabase.co/functions/v1/kirim-kode-pemenang \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Respons yang diharapkan (contoh, 1 juara terkirim):

```json
{"sent": 1, "failed": 0, "skipped": 0, "results": [{"user_id": "...", "week_start": "2026-11-09", "rank": 1, "status": "sent"}]}
```

Bila `FUNCTION_SECRET` diset (Langkah 5), tambahkan header
`-H "x-function-secret: <FUNCTION_SECRET>"`, kalau tidak
function menjawab 401.

Setelah tes, cek lagi tabelnya: baris juara yang terkirim
sekarang `email_sent_at`-nya terisi. Panggil curl yang sama
sekali lagi: responsnya harus `{"sent": 0, ...}` karena tidak
ada lagi juara yang belum dikirimi email. Itulah bukti
function idempotent.

### Tes 3: gift notice + redeem di app

1. Login di app sebagai akun juara, buka halaman mana pun:
   gift notice muncul di bawah layar dengan kode hadiah,
   tombol Salin, dan tombol "Tebus di Profil".
2. Ketuk "Tebus di Profil", masukkan kode di bagian Premium,
   lalu tebus. Premium aktif sesuai rank (7/5/3 hari) dan
   terlihat di halaman Profil.
3. Cek email juara: email berisi kode yang sama sudah masuk
   (cek juga folder spam saat pertama kali).

## Menjalankan pengiriman email secara manual

Kapan pun, pengiriman email bisa dipicu manual dengan curl
di Tes 2, atau dengan memanggil function dari dashboard
(Edge Functions > kirim-kode-pemenang > Invoke). Aman
dijalankan ulang: hanya juara yang `email_sent_at`-nya masih
NULL yang dikirimi.

## Catatan penting: proyek free tier bisa pause

Proyek Supabase free tier auto-pause setelah sekitar 7 hari
tanpa aktivitas API. Saat pause, `pg_cron` berhenti dan job
yang terlewat tidak jalan sendiri. Kabar baiknya, kedua sisi
dirancang mengejar ketertinggalan:

- `announce_weekly_winners` mengumumkan semua minggu yang
  tertinggal begitu jalan lagi, jadi tidak ada juara yang
  hilang, hanya tertunda.
- `kirim-kode-pemenang` mengirim email ke SEMUA juara yang
  `email_sent_at`-nya masih NULL, jadi email yang tertunda
  terkirim di run berikutnya, bukan hilang.

Selagi ada user yang mengirim skor simulasi, aktivitas itu
sendiri menjaga proyek tetap bangun. Kalau seminggu penuh
tidak ada satu pun simulasi dan Senin pagi terlewat, jalankan
saja pengumuman manual (Tes 1) lalu panggil function manual
(Tes 2) dari SQL Editor dan terminal.

## Troubleshooting

- **Function menjawab 500 "RESEND_API_KEY belum diset"**: secret
  belum diset atau salah nama. Cek di dashboard (Edge Functions
  > Secrets) atau `supabase secrets list`. Nama harus persis
  `RESEND_API_KEY`. Setelah mengubah secret, tidak perlu
  deploy ulang, tapi tunggu sebentar sebelum tes lagi.
- **Resend 403 "You can only send testing emails to your own
  email address"**: function mengirim dari `onboarding@resend.dev`
  (atau domain belum terverifikasi) ke alamat yang bukan alamat
  akun Resend. Untuk kirim ke juara beneran, verifikasi domain
  dulu (Langkah 4 opsi A) dan pastikan `RESEND_FROM` memakai
  alamat di domain terverifikasi itu.
- **Resend 403 "domain is not verified"**: domain sudah
  ditambahkan tapi record DNS belum terverifikasi. Cek status
  domain di dashboard Resend dan pastikan record DNS sudah
  benar (perhatikan: di Cloudflare, matikan proxy/oranye untuk
  record verifikasi).
- **Resend 429 `daily_quota_exceeded`**: jatah harian paket
  gratis (100 email per hari) habis. Untuk Lolosin ini hampir
  tidak mungkin terjadi (hanya 3 email per minggu); bila
  terjadi, tunggu reset harian, email yang gagal dicoba lagi
  otomatis di run berikutnya karena `email_sent_at`-nya tetap
  NULL.
- **Hasil `skipped` dengan alasan "email tidak ditemukan"**:
  user juara tidak punya email di `auth.users` (misal akun
  dibuat tanpa email, atau user dihapus). Juara itu tetap bisa
  melihat kodenya di gift notice dalam app, jadi hadiahnya
  tidak hilang, hanya emailnya yang tidak terkirim.
- **Job cron jalan tapi email tidak terkirim**: cek respons
  HTTP yang disimpan `pg_net`:
  ```sql
  select * from net._http_response order by created desc limit 10;
  ```
  Kolom `status_code` dan `content` menunjukkan jawaban Edge
  Function. Cek juga riwayat job:
  ```sql
  select * from cron.job_run_details order by start_time desc limit 10;
  ```
  Dan log function di dashboard (Edge Functions >
  kirim-kode-pemenang > Logs).
- **Kode juara tidak muncul di gift notice tapi email terkirim**:
  cek kolom `code` di `weekly_winners` untuk juara itu. Bila
  NULL, migrasi 005 mungkin belum jalan (fungsi lama dari 004
  tidak menyimpan kode ke `weekly_winners`). Jalankan migrasi
  005, lalu jalankan `select public.announce_weekly_winners();`
  sekali: pass backfill di fungsi v2.8 akan membuat kode untuk
  baris juara global yang code-nya masih NULL.
- **Pengumuman sudah jalan di bawah 004 sebelum 005 dijalankan**:
  juara minggu itu sudah mendapat premium langsung dari fungsi
  004, dan backfill 005 akan memberi mereka satu kode tambahan.
  Itu satu-satunya kasus premium bisa bertumpuk, dan hanya
  terjadi bila 004 sempat mengumumkan sebelum 005 dijalankan.
  Di proyek live hal ini tidak terjadi, karena 004 belum pernah
  dijalankan sebelum 005 dibuat. Bila ragu, cek
  `profiles.premium_until` juara minggu tersebut.
- **Alternatif bila pg_net tidak bisa dipakai**: bila suatu saat
  `pg_net` tidak tersedia, gantinya adalah database webhook
  (Dashboard > Database > Webhooks): buat webhook pada event
  INSERT ke `weekly_winners` yang memanggil URL Edge Function
  yang sama. Webhook memanggil function sekali per baris juara
  yang dibuat (bukan sekali per minggu seperti pg_cron), tapi
  function-nya idempotent sehingga panggilan ekstra aman.
  pg_cron + pg_net tetap cara utama karena jadwalnya eksplisit,
  sekali jalan per minggu, dan selaras dengan job pengumuman
  yang sudah ada.

## Catatan tes

- `announce_weekly_winners` bisa dijalankan manual dari SQL
  Editor (lihat Tes 1), karena fungsi ini tidak memakai
  `auth.uid()`.
- Edge Function hanya bisa dites setelah di-deploy dan secret
  diset; tes lokal membutuhkan Supabase CLI + Deno dan di luar
  cakupan panduan ini.
- Redeem kode hanya bisa dites dari app saat login, karena
  `redeem_code` memakai `auth.uid()`. Untuk mengetes, login
  sebagai akun juara lalu tebus kode dari gift notice atau
  dari email.
