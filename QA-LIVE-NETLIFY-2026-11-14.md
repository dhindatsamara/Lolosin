# QA Live Lolosin (Netlify) — 2026-11-14

**Target:** https://lolosin.netlify.app/ (deploy Netlify dari repo dhindatsamara/Lolosin, commit 55d468b7, base path "/")

## Verdict: DEPLOY TERVERIFIKASI — QA INTERAKTIF TERBLOKIR (bukan cacat app)

- **Verifikasi HTTP-level live: 30/30 PASS.** Situs live melayani app shell dengan benar, manifest PWA benar (`start_url`/`scope` `/`), semua asset termuat, env Supabase terpasang di bundle (project ref + publishable key terdeteksi, tanpa nilai secret key), service worker + ikon PWA ada, endpoint Supabase merespons.
- **QA interaktif Playwright (216 cek): TIDAK DAPAT DIJALANKAN dari VM ini.** Chromium Playwright diblokir proxy egress VM untuk koneksi internet apa pun (bukti diagnostik di section 4). Ini batasan lingkungan sandbox, BUKAN cacat app: proxy menerima byte request yang persis sama dari curl/Python/Node, tapi menolak koneksi dari proses Chromium.
- **Skrip QA live sudah disiapkan:** `~/workspace/qa-lolosin/qa-live.mjs` (disalin dari `qa.mjs`, 202 call sites → 216 cek, sudah lolos `node --check`), siap dijalankan saat ada browser yang bisa mencapai situs live. `qa.mjs` asli tidak diubah; laporan lokal `QA-LOCAL-2026-11-13.md` (216/216 PASS) tidak disentuh.
- **Situs live siap dipakai user untuk tes akun asli** (daftar → konfirmasi email → masuk → 1 simulasi full → cek leaderboard). Satu-satunya yang belum terverifikasi dari sini adalah perilaku interaktif di browser live; kode yang sama sudah lolos 216/216 di QA lokal, dan satu-satunya perbedaan live vs lokal (base path + env Supabase) sudah terverifikasi benar di level HTTP.

## 1. Verifikasi HTTP live: 30/30 PASS

Script: `~/workspace/qa-lolosin/verify-live-http.mjs` (Node fetch lewat proxy egress VM, user-agent browser). Tidak ada penulisan data ke Supabase.

| Cek | Hasil | Bukti |
|---|---|---|
| Homepage HTTP 200 | ✅ PASS | status 200, 1551 bytes |
| HTML lang="id" | ✅ PASS | |
| Root div ada | ✅ PASS | |
| Title ada | ✅ PASS | Lolosin \| Belajar CPNS Jadi Menyenangkan |
| Tidak ada prefix /Lolosin/ di HTML | ✅ PASS | |
| Asset root-relative (/assets/...) | ✅ PASS | /favicon.svg, /assets/index-BYVUHTly.js, /assets/rolldown-runtime-XKyaHtl9.js, /assets/questions-C8dl4d03.js, /assets/index-CTapZo0C.css, /manifest.webmanifest |
| manifest.webmanifest HTTP 200 | ✅ PASS | status 200 |
| manifest start_url = / | ✅ PASS | start_url=/ |
| manifest scope = / | ✅ PASS | scope=/ |
| manifest icons ada (SVG) | ✅ PASS | ["icons/icon.svg","icons/maskable.svg"] |
| manifest name/description ada | ✅ PASS | Lolosin |
| Asset /favicon.svg HTTP 200 | ✅ PASS | status 200, 298 bytes |
| Asset /assets/index-BYVUHTly.js HTTP 200 | ✅ PASS | status 200 (bundle utama 1,6 MB) |
| Asset /assets/rolldown-runtime-XKyaHtl9.js HTTP 200 | ✅ PASS | status 200, 726 bytes |
| Asset /assets/questions-C8dl4d03.js HTTP 200 | ✅ PASS | status 200 (chunk bank soal 7,3 MB) |
| Asset /assets/index-CTapZo0C.css HTTP 200 | ✅ PASS | status 200 |
| Asset /manifest.webmanifest HTTP 200 | ✅ PASS | status 200, 459 bytes |
| Asset /.netlify/scripts/hud HTTP 200 | ✅ PASS | status 200 (skrip HUD Netlify, bukan bagian app) |
| Bundle memuat project ref Supabase (rhoyeloqiorbspsucljt) | ✅ PASS | |
| Bundle memuat URL Supabase https://rhoyeloqiorbspsucljt.supabase.co | ✅ PASS | |
| Bundle memuat publishable key (sb_publishable_...) | ✅ PASS | keberadaan dicek tanpa mencetak nilai key |
| Bundle TIDAK memuat nilai secret key (sb_secret_ + 20+ karakter kunci) | ✅ PASS | string prefix `sb_secret_` saja ada di kode library supabase-js (deteksi tipe key), bukan nilai kunci — lihat section 3 |
| Bundle TIDAK memuat prefix /Lolosin/ | ✅ PASS | |
| Semua chunk JS termuat (200) | ✅ PASS | 0/0 chunk dinamis (bank soal dimuat statis dari index.html, sudah dicek 200 di atas) |
| Service worker /sw.js HTTP 200 | ✅ PASS | status 200 |
| SW berisi precache Workbox | ✅ PASS | |
| Ikon /icons/icon.svg HTTP 200 | ✅ PASS | status 200 |
| Ikon /icons/maskable.svg HTTP 200 | ✅ PASS | status 200 |
| Endpoint REST Supabase merespons (tanpa apikey -> 401, proyek hidup) | ✅ PASS | status 401 |
| Endpoint Auth Supabase merespons (tanpa apikey -> 401, gateway hidup + menegakkan auth) | ✅ PASS | status 401 (dengan apikey: 200 GoTrue v2.197.0, terverifikasi parent 2026-11-14) |

Tambahan (terverifikasi parent 2026-11-14, bukan oleh run ini): 3 tabel Supabase (`tryout_results`, `profiles`, `weekly_winners`) menjawab HTTP 200 dan kosong setelah user menjalankan migrasi SQL.

## 2. Bukti build live adalah build terbaru (integrasi Supabase)

String khas integrasi Supabase ditemukan di bundle live (`/assets/index-BYVUHTly.js`), membuktikan deploy memakai kode commit 55d468b7, bukan build lama:

| String di bundle | Jumlah |
|---|---|
| Peringkat (label nav leaderboard) | 1 |
| Leaderboard | 2 |
| lolosin:pending-scores (key antrean skor) | 1 |
| Login dulu biar skormu masuk leaderboard (catatan not-logged-in) | 2 |
| Simulasi CAT | 2 |
| Mulai simulasi CAT (CTA empty state leaderboard) | 2 |
| Belum ada skor minggu ini (empty state ranking) | 1 |
| Kamu lagi lihat sebagai tamu (banner tamu) | 1 |

## 3. Temuan: tidak ada cacat

Dua FAIL awal saat verifikasi HTTP ternyata keduanya positif palsu dari ceknya sendiri, bukan cacat app — sudah diselidiki dan ceknya diperbaiki (rerun 30/30 PASS):

1. **`sb_secret_` di bundle (awal: FAIL).** Satu-satunya kemunculan ada di kode library supabase-js: `e.startsWith('sb_publishable_') || e.startsWith('sb_secret_')` — deteksi tipe key, bukan nilai kunci. Source app (`src/`) tidak mengandung `sb_secret_` sama sekali. Tidak ada kebocoran secret key.
2. **Auth `/auth/v1/health` 401 tanpa apikey (awal: FAIL).** Gateway Supabase mewajibkan header `apikey` untuk semua request termasuk health check; 401 tanpa apikey adalah perilaku yang benar. Dengan apikey, endpoint menjawab 200 (GoTrue v2.197.0, terverifikasi parent).

## 4. Blocker: Playwright tidak dapat mencapai situs live dari VM ini

Upaya menjalankan `qa-live.mjs` gagal di `page.goto` pertama: `net::ERR_TUNNEL_CONNECTION_FAILED` (HTTPS) dan `net::ERR_EMPTY_RESPONSE` (HTTP). Diagnosis yang dilakukan (skrip di `~/workspace/qa-lolosin/probe-*.mjs`, `capture-*.mjs`):

1. Chromium + proxy egress (dengan kredensial env, tanpa kredensial, alamat IPv4 langsung, `--ignore-certificate-errors`, `ignoreHTTPSErrors`, channel `chromium` penuh): semua gagal dengan error yang sama, ke `lolosin.netlify.app` maupun `example.com`.
2. curl / Python / Node fetch ke URL yang sama lewat proxy yang sama: HTTP 200.
3. Byte CONNECT dan GET mentah dari Chromium ditangkap lewat dummy proxy lokal, lalu di-replay persis sama via Python ke proxy asli: `200 Connection Established` dan `HTTP/1.1 200 OK`. Proxy tidak memblokir isi request.
4. User-Agent bukan faktor (curl dengan UA `HeadlessChrome` → 200). Autentikasi proxy bukan faktor (curl tanpa kredensial apa pun → 200).
5. Kesimpulan: proxy egress membedakan klien berdasarkan proses — koneksi dari proses Chromium ditolak, sementara klien CLI diterima. Runtime juga mengarahkan agar browsing dilakukan lewat browser tools, bukan Chromium via exec. Membangun shim proxy lokal untuk mengakali pembatasan ini sengaja TIDAK dilakukan (mengakali kontrol sandbox).
6. Batasan yang sama sudah dikenal dari QA lokal: request Google Fonts di Chromium VM selalu gagal dengan `ERR_TUNNEL_CONNECTION_FAILED` yang sama (dicatat sebagai artefak lingkungan di laporan lokal).

## 5. Yang belum terverifikasi (butuh browser)

- 216 cek interaktif Playwright (dashboard, belajar, drill, anti-ulang, Fase 3, tryout mini, simulasi CAT 110 soal, mobile, state seeded, form auth, leaderboard terkonfigurasi) — skripnya sudah siap di `qa-live.mjs` tapi belum bisa dieksekusi dari VM ini.
- Screenshot `live-*.png` (dashboard desktop, leaderboard, halaman auth, bottom nav mobile, dll.) — belum ada, karena tidak ada browser yang bisa memuat situs live dari VM ini.
- Mitigasi: kode yang sama lolos 216/216 di QA lokal (build yang sama, commit yang sama). Perbedaan live vs lokal hanya base path (terverifikasi benar: manifest `/`, asset root-relative, tanpa `/Lolosin/`) dan env Supabase (terverifikasi terpasang di bundle + tabel terjangkau + RLS mengizinkan SELECT anon ke ketiga tabel).

## 6. Langkah berikut

1. **User: tes akun asli** — daftar → konfirmasi email → masuk → selesaikan 1 simulasi CAT full → cek skor muncul di leaderboard. Ini sekaligus verifikasi end-to-end pertama alur auth nyata (belum pernah dites di mana pun; QA lokal hanya memakai env palsu dengan network diblokir).
2. **Parent (opsional, pengaman tambahan):** smoke test live via browser task — muat dashboard, cek pill "Masuk" di top bar, buka `/auth` (form tampil), buka `/leaderboard` (banner tamu + empty state), cek tidak ada error terlihat.
3. **QA live penuh:** jalankan `node qa-live.mjs` dari `~/workspace/qa-lolosin/` begitu ada lingkungan browser yang bisa mencapai situs live. Skrip menulis laporannya ke file ini (akan menimpa laporan ini dengan hasil 216 cek).

## File terkait

- Skrip QA live (siap jalan, belum dieksekusi): `~/workspace/qa-lolosin/qa-live.mjs`
- Verifikasi HTTP live (30/30 PASS): `~/workspace/qa-lolosin/verify-live-http.mjs`
- Diagnosis blocker: `~/workspace/qa-lolosin/probe-live.mjs`, `probe-proxy.mjs`, `capture-connect.mjs`, `capture-get.mjs`, `dummy-proxy.mjs`
- Transformasi qa.mjs → qa-live.mjs: `/tmp/transform-qa-live.py` (scratch, tidak permanen)
- Laporan lokal (tidak disentuh): `~/workspace/lolosin/QA-LOCAL-2026-11-13.md` (216/216 PASS)
