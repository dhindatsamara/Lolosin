# Supabase Lolosin: skema + rencana integrasi (DRAFT)

Disusun 2026-11-13 sore (WITA) sebagai persiapan, supaya integrasi bisa langsung jalan
begitu Dhinda mengirim Project URL + anon key Supabase. Belum diterapkan ke app,
belum butuh kredensial apa pun. Semua angka dan nama lapangan di bawah diambil dari
kode app yang sudah ada, bukan karangan.

## Yang sudah dikunci user

- Leaderboard mingguan, ranking global + per formasi.
- Juara 1 mingguan: akses premium 1 minggu + badge prestise yang bisa dipamerin/dishare.
- Juara 2-3 mingguan: akses premium 3 hari + badge prestise.
- Login/daftar akun, skor tryout terkirim otomatis ke leaderboard.
- Project Supabase: nama `lolosin`, region Singapore, free tier.
- Urutan kerja: Simulasi CAT dulu (SELESAI, QA 181/181, sudah push remote `c89ef3fe`),
  lalu Supabase, lalu deploy Netlify.

## Model data app saat ini (sumber: `src/lib/store.ts`, `src/lib/quiz.ts`)

- Store lokal: key `lolosin:v1` (localStorage), tanggal aktivitas zona Asia/Makassar.
- `TryoutRecord`: `date` (ISO), `mode` (`mini` | `full`), skor `twk`/`tiu`/`tkp`,
  `passed` (boolean), `correct` per seksi (opsional).
- Passing grade asli: TWK 65, TIU 80, TKP 156. Skor maks: 150/175/225, total 550.
- Mode mini: 30 soal, 27 menit, passing grade mini TWK 22 / TIU 23 / TKP 35.
- Mode full (Simulasi CAT): 110 soal (TWK 30, TIU 35, TKP 45), 100 menit, +300 XP.
- XP: drill benar +10, drill selesai +50, tryout selesai +100, simulasi +300,
  seksi materi dibaca +5. Level = floor(sqrt(xp/50)) + 1.
- Lencana sudah ada 13 (termasuk "Pejuang CAT" dan "Lolos Simulasi").

## Tabel yang diusulkan

### 1. `profiles` (satu baris per user, `id` = `auth.users.id`)

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK, FK ke `auth.users` | dibuat otomatis saat daftar |
| `username` | text, unique, not null | tampil di leaderboard, pilih saat daftar |
| `formasi` | text, nullable | diisi user di profil; kosong berarti ikut ranking global saja |
| `created_at` | timestamptz, default now() | |

Keputusan yang masih perlu Dhinda: apakah `formasi` teks bebas atau pilihan dari
daftar formasi CPNS. Teks bebas paling cepat, tapi ranking per formasi jadi berantakan
kalau ejaannya beda-beda ("Analis Kebijakan" vs "analis kebijakan").

### 2. `tryout_results` (satu baris per simulasi/tryout yang selesai)

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | uuid PK, default gen_random_uuid() | |
| `user_id` | uuid, FK ke `profiles.id` | |
| `mode` | text, check `mini`/`full` | leaderboard mingguan HANYA dari `full` |
| `twk` | int | skor asli, maks 150 (full) |
| `tiu` | int | skor asli, maks 175 (full) |
| `tkp` | int | skor asli, maks 225 (full) |
| `total` | int, generated `twk + tiu + tkp` | maks 550, kunci urutan ranking |
| `passed` | boolean | ketiga seksi lolos passing grade |
| `correct_twk` / `correct_tiu` / `correct_tkp` | int, nullable | dari `TryoutRecord.correct` |
| `finished_at` | timestamptz, not null | pakai `date` dari `TryoutRecord` |
| `week_start` | date, generated | Senin minggu itu (zona Asia/Makassar), kunci ranking mingguan |

Aturan anti-curang yang murah: satu user hanya boleh mengirim satu skor per sesi
selesai (insert dari client setelah layar hasil), dan ranking mingguan memakai skor
TERBAIK per user per minggu, bukan jumlah percobaan. Jadi spam simulasi tidak menaikkan
peringkat.

### 3. `weekly_winners` (dihitung server, bukan dari client)

| Kolom | Tipe | Catatan |
|---|---|---|
| `week_start` | date | Senin minggu itu |
| `scope` | text | `global` atau nama formasi |
| `rank` | int, 1-3 | |
| `user_id` | uuid, FK ke `profiles.id` | |
| `total` | int | skor terbaik minggu itu |
| `premium_until` | timestamptz | juara 1: +7 hari, juara 2-3: +3 hari dari pengumuman |
| `badge_awarded` | boolean | badge prestise mingguan |

Dihitung terjadwal tiap Senin pagi WITA (Supabase Edge Function + pg_cron, atau
dihitung manual dulu di awal sambil menunggu otomatisasi). Premium di app masih
berupa flag lokal, jadi `premium_until` perlu dibaca app saat login dan disimpan
di store.

## Row Level Security (garis besar)

- `profiles`: siapa pun yang login bisa baca (untuk leaderboard); hanya pemilik
  yang bisa ubah barisnya sendiri.
- `tryout_results`: insert hanya oleh pemilik (`auth.uid() = user_id`); baca
  publik untuk leaderboard (kolom skor + username saja, tanpa data lain).
- `weekly_winners`: hanya dibaca publik, ditulis oleh service role (Edge Function).
- Anon key HANYA untuk baca publik + auth. JANGAN pernah pakai service role key
  di kode app.

## Urutan implementasi saat kredensial tiba

1. Dhinda kirim Project URL + anon key lewat form aman (bukan di chat).
2. Pasang `@supabase/supabase-js`, simpan kredensial di `.env` (bukan di repo).
3. Buat tabel + RLS di atas lewat SQL Editor Supabase, verifikasi dengan satu
   insert percobaan.
4. Auth: daftar/login dengan email + username + formasi (opsional).
5. Kirim otomatis `TryoutRecord` mode `full` ke `tryout_results` saat simulasi
   selesai. Mode mini TIDAK masuk leaderboard (sesuai keputusan: leaderboard
   dari simulasi beneran).
6. Halaman leaderboard: ranking mingguan global + per formasi, juara minggu lalu.
7. Badge prestise + flag premium dari `weekly_winners`.
8. QA ulang + push, lalu lanjut deploy Netlify.

## Yang sengaja TIDAK masuk tahap ini

- Battle 1v1 dan tryout live mingguan: butuh realtime + penjadwalan, fase berikut.
- Migrasi progres lama (XP, lencana, streak dari `lolosin:v1`): tetap lokal dulu,
  dipindah bertahap supaya tidak merusak data belajar Dhinda yang sudah ada.
- SKB: tetap fase akhir, sesuai keputusan 2026-11-13.
