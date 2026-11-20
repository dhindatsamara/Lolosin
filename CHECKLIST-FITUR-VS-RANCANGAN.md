# Checklist Fitur Lolosin vs Rancangan Awal

Disusun: 2026-11-15 (Minggu, 19:35 WITA) — audit kode di repo `~/workspace/lolosin`,
branch master, HEAD `400eb4b` (sudah termasuk v2.5, **belum di-push ke live**).
Live terakhir = v2.4 + materi readability, remote `82210c08`.

Sumber rancangan yang dipakai: `~/workspace/cpns/KONSEP-DAN-AUDIT-MATERI.md`
(konsep dikunci 2026-11-13), `~/workspace/lolosin/REDESIGN-V2.md` (v1–v2.4),
`~/workspace/lolosin/supabase/WEEKLY-WINNERS-AUTOMATION.md` (draf),
dan keputusan-keputusan di `~/MEMORY.md`.

Legenda status: ✅ Sesuai · 🟡 Sebagian · ❌ Belum · ↔️ Menyimpang.
Kolom "Live?" menandai apakah fitur sudah ada di situs live (`lolosin.netlify.app`)
atau baru di master lokal (v2.5, menunggu push).

## 1. Ringkasan

Dari **53 item** yang dicek terhadap rancangan:

| Status | Jumlah | Artinya |
|---|---|---|
| ✅ Sesuai | 33 | Fitur ada dan jalan sesuai rancangan (beberapa melebihi rancangan) |
| 🟡 Sebagian | 9 | Ada, tapi belum penuh (data contoh, penegakan belum ada, cakupan belum lengkap) |
| ❌ Belum | 9 | Belum dibangun sama sekali |
| ↔️ Menyimpang | 2 | Sengaja diubah dari rancangan lewat putusan user |

Gambaran besarnya: **inti produk sudah sesuai rancangan** — materi, bank soal,
latihan, tryout CAT, gamifikasi dasar, battle, dan leaderboard semuanya ada dan
jalan. Yang belum: tiga diferensiasi Fase 3/MVP yang dijanjikan di konsep awal
(diskusi per soal, tryout live mingguan, juara mingguan otomatis), monetisasi
Fase 4, SKB (memang ditunda ke fase akhir), dan satu lubang teknis besar:
**progres tidak tersinkron antar perangkat**.

## 2. Tabel checklist

### A. Konten & Belajar

| Fitur | Rancangan awal | Status | Live? | Catatan bukti |
|---|---|---|---|---|
| Materi SKD lengkap (Belajar) | Semua materi SKD, 22 materi unik dari audit | ✅ Sesuai | Ya (v2.4; v2.5 ada tambahan) | 19 dokumen, 284 seksi, 78.393 kata (`src/data/materi/index.json`); mode baca full-screen + Poin inti (`SectionDetailPage.tsx`, `PoinIntiCard.tsx`); v2.5 tambah renderer matematika, 49 tabel, 3 diagram SVG |
| Bank soal | 1.400+ soal berkunci + pembahasan (Fase 1), lalu diperbesar dari sumber free-access | ✅ Sesuai | Ya | 8.972 soal, 8.353 berkunci (`src/data/questions/*.json`). Catatan kualitas: 619 soal tanpa kunci, 17 temuan kunci meragukan menunggu putusan user (lihat GAP #7) |
| OCR modul scan | 6 PDF scan (274 hal) di-OCR dulu baru parsing | ✅ Sesuai | Ya | Selesai 2026-11-13, output di `~/workspace/cpns/materi/ocr/` |
| SKB | Kisi-kisi resmi ada, bank soal SKB 0; ditunda ke fase akhir | ❌ Belum | — | 0 hasil grep "skb" di `src/`. Ini penundaan sesuai rancangan, bukan kelalaian |
| Validasi kebenaran materi & soal | Materi harus benar (user belajar pakai ini sendiri) | 🟡 Sebagian | Ya | Audit readability 2026-11-15 memperbaiki puluhan fakta/rumus + 4 perbaikan audit matematika v2.5. Tapi: 17 temuan kunci belum diputuskan, 35 soal slideshare belum dikonversi bobotnya, 2 item meragukan dipertahankan dari sumber |

### B. Latihan & Tryout (termasuk 7 diferensiasi)

| Fitur | Rancangan awal | Status | Live? | Catatan bukti |
|---|---|---|---|---|
| Latihan per topik (drill 10 soal) | Drill per sub-materi, pembahasan mudah dicerna | ✅ Sesuai | Ya | `LatihanPage.tsx`, `LatihanJalanPage.tsx`; pilih lalu tekan "Jawab" (anti salah pencet) |
| Tryout mini CAT | 30 soal, 27 menit | ✅ Sesuai | Ya | `TryoutPage.tsx` mode kilat |
| Simulasi CAT lengkap | 110 soal, 100 menit, passing grade asli KepmenPANRB 406/2026 | ✅ Sesuai | Ya | `ORIGINAL_PASSING` TWK 65 / TIU 80 / TKP 156, `ORIGINAL_MAX` 150/175/225 (`src/lib/quiz.ts`) |
| Tampilan CAT mirip ujian asli | Timer + tampilan semirip ujian | ✅ Sesuai | Ya | `TimerDisplay.tsx`, `TryoutPalette.tsx` (navigator + tandai ragu-ragu), kartu aturan + modal konfirmasi mulai |
| (1) Soal tidak pernah berulang | Tracking soal per user (MVP) | ✅ Sesuai | Ya | `remainingQuestions()` / `seenIds` di `src/lib/questions.ts`; drill mengutamakan soal belum dilihat |
| (7a) Pembahasan per opsi | Pembahasan tiap opsi jawaban (MVP) | ✅ Sesuai | Ya | `ExplanationPanel.tsx` ("Panel pembahasan per opsi"); TKP pakai bobot per opsi. Catatan: 245 soal quizable belum punya pembahasan |
| (7b) Diskusi per soal | Diskusi tiap soal (MVP, satu paket dengan 7a) | ❌ Belum | — | 0 hasil grep "diskusi" di `src/`. Satu-satunya item MVP yang belum dibangun |
| (2) Spaced repetition soal salah | Ulas soal salah terjadwal (Fase 3) | ✅ Sesuai | Ya | `REVIEW_INTERVALS = [1, 3, 7, 14, 30]` hari (`src/lib/review.ts`); seksi "Ulas soal salah" di beranda |
| (3) Battle 1v1 | Duel realtime lawan teman (Fase 3) | ✅ Sesuai | Ya | `battle.ts` + `BattlePage.tsx`: 10 soal, pilih kategori (TWK/TIU/TKP/campur), undang via kode/link/username, Realtime + polling fallback, lonceng undangan. Catatan: belum pernah dites live dengan 2 akun; tanpa anti-cheat server-side |
| (4) Tryout live mingguan serentak | Semua peserta mulai bersamaan tiap minggu (Fase 3) | ❌ Belum | — | 0 kode. Varian besarnya ("tryout akbar") juga baru sebatas permintaan, belum dirancang |
| (5) Prediksi kelolosan | Prediksi peluang lolos per formasi (Fase 3) | 🟡 Sebagian | Ya | `prediction.ts` + `PredictionPanel.tsx`: prediksi per subtes dari riwayat tryout, label pita ("Aman, pertahankan" dst). Belum dikaitkan ke formasi (tidak ada data passing grade per formasi) |
| (6) Rencana belajar personal | Rencana belajar dari hasil belajar user (Fase 3) | ✅ Sesuai | Ya | `plan.ts` (`weakestTopics`, `untriedTopics`, `todayFocus`); seksi "Fokus hari ini" di beranda |
| Jalur belajar adaptif | Jalur belajar adaptif dari hasil tryout (pembeda #1 konsep awal) | 🟡 Sebagian | Ya | Baru rekomendasi fokus harian + daftar topik terlemah; belum jadi jalur/roadmap adaptif berurutan yang memandu user langkah demi langkah |

### C. Game & sosial

| Fitur | Rancangan awal | Status | Live? | Catatan bukti |
|---|---|---|---|---|
| Sesi ala Quizizz | Host buat sesi, pemain gabung pakai kode (tambahan v2.2) | ✅ Sesuai | Ya | `session.ts`, `SessionHostPage.tsx`, `SessionJoinPage.tsx`; maks 50 pemain, leaderboard live, host wajib premium (saat beta gratis via toggle Premium Beta). Catatan: host harus tetap online, cap di sisi klien |
| Kuis Kilat | Game tambahan (v2.2) | ✅ Sesuai | Ya | `KuisKilatPage.tsx`: solo 60 detik, kombo pengganda XP |
| Kartu Kilat | Game tambahan (v2.2.1) | ✅ Sesuai | Ya | `KartuKilatPage.tsx`: flashcard 20 kartu, tandai Hafal/Belum |
| Benar/Salah Kilat | Game tambahan (v2.2.1) | ✅ Sesuai | Ya | `BenarSalahKilatPage.tsx`: 60 detik, 50% klaim benar / 50% pengecoh |
| Game ditonjolkan sebagai marketing | Gamifikasi adalah pembeda utama yang menjual (konsep awal + v2.1) | ↔️ Menyimpang | Belum (v2.5) | v2.5 memindahkan "Main" ke dropdown "Lainnya" di header; beranda hanya tile kecil. User protes 2026-11-15 19:33 ("game itu hal yang menjual") — masuk feedback v2.6, belum dibangun |

### D. Gamifikasi & leaderboard

| Fitur | Rancangan awal | Status | Live? | Catatan bukti |
|---|---|---|---|---|
| XP + level + gelar | XP, level, gelar ala game | ✅ Sesuai | Ya | `store.ts` (XP_DRILL_CORRECT 10, XP_DRILL_COMPLETE 50, dst); `ranks.ts` 15 gelar bernama + generik di atas level 15 |
| Lencana / badge | Badge koleksi | ✅ Sesuai | Ya | 13 lencana (`src/lib/badges.ts`); tampil ringkas di beranda (v2.4) |
| Misi harian | Misi harian + hadiah XP | ✅ Sesuai | Ya | 10 template misi (`src/lib/missions.ts`); `DailyMissions.tsx` |
| Streak + Osi peliharaan | Streak harian; maskot jadi peliharaan (v2.2) | ✅ Sesuai | Ya | `pet.ts` (tangga 0/3/7/14/30 hari), `PetCard.tsx` (picker outfit + bagikan kartu foto PNG), mekanik revive "Bujuk Osi" |
| Leaderboard mingguan global | Ranking mingguan semua user, hanya simulasi CAT lengkap | ✅ Sesuai | Ya | `leaderboard.ts` (`fetchLeaderboard`, skor terbaik per user, minggu Senin–Minggu WITA); `LeaderboardPage.tsx` |
| Leaderboard per formasi | Ranking per formasi yang dipilih user | ✅ Sesuai | Ya | `filterEntriesByFormasi()` + dropdown "Semua formasi" di `LeaderboardPage.tsx`; ada tampilan formasi sendiri |
| Peringkat sendiri di halaman Peringkat | Melihat posisi sendiri di ranking | ❌ Belum | — | Belum dibangun; user bilang "nanti" (2026-11-15) |
| Juara mingguan + hadiah premium | Juara 1 premium 7 hari, juara 2 lima hari, juara 3 tiga hari, semua + badge prestise; per formasi badge saja | 🟡 Sebagian | Sebagian | Copy hadiah ada di landing ("Papan Peringkat", v2.5, belum live) + halaman Peringkat; "tiga besar minggu lalu" dihitung live (`fetchLastWeekTop3`). TAPI: tabel `weekly_winners` tidak pernah diisi, tidak ada cron/fungsi pengumuman, tidak ada pemberian premium/badge. Draf lengkap ada di `supabase/WEEKLY-WINNERS-AUTOMATION.md`; pembangunan ditunda sampai diskusi aturan seri + pengajaran ke user |
| Hadiah sebagai gift via notifikasi | Juara menerima hadiah sebagai gift di akunnya | ❌ Belum | — | Baru permintaan user (2026-11-15), belum dirancang |
| Kode klaim premium (dev) | Dev bisa bagi-bagi kode premium | ❌ Belum | — | Baru permintaan user (2026-11-15), belum dirancang |

### E. Formasi

| Fitur | Rancangan awal | Status | Live? | Catatan bukti |
|---|---|---|---|---|
| Browser formasi CPNS | Menu formasi, user bisa cari jabatan (v2.3) | 🟡 Sebagian | Ya (v2.3; v2.5 compact + pagination belum live) | `FormasiPage.tsx`: 6 filter, kartu compact, pagination 18/halaman (v2.5). Data masih 34 contoh (`IS_DATA_CONTOH = true`, `formasi-contoh.ts`), tanpa kolom batas waktu; data resmi 2026 (~160 ribu formasi) belum diumumkan BKN |
| Pilih formasi di Profil | User memilih formasi di web (konsep awal) | ✅ Sesuai | Ya | Formasi bisa diedit di `ProfilPage.tsx`; dipakai untuk leaderboard per formasi |

### F. Profil, auth, notifikasi

| Fitur | Rancangan awal | Status | Live? | Catatan bukti |
|---|---|---|---|---|
| Profil + avatar Osi | Profil lengkap, avatar maskot 7 varian dengan gating streak | ✅ Sesuai | Sebagian | v2.5 (belum live): full-width max-w-7xl, 2 kolom, mode draft + Simpan/Batalkan, cek username unik saat simpan; gating avatar streak 0/3/7/14/30 (`profile.ts`, `AvatarPicker.tsx`). Live masih versi lama (tengah, sempit). Feedback terbaru user: profil sebaiknya muat 1 halaman tanpa scroll (v2.6) |
| Foto profil upload | Upload foto profil sendiri | 🟡 Sebagian | Ya | Upload + resize 256px JPEG di client jalan; tapi tersimpan di localStorage browser saja ("sinkronisasi ke server menyusul") — tidak ikut pindah perangkat |
| Auth email + password + username | Daftar hanya email/password/username | ✅ Sesuai | Ya | `AuthPage.tsx`, `auth.ts`; username unik sejak migrasi 001 |
| Login Google | Masuk dengan Google | ✅ Sesuai | Ya | `signInWithOAuth` (`auth.ts`); bug redirect hash diperbaiki v2.2.3. Catatan: consent screen Google masih mode Testing — hanya user yang didaftarkan sebagai test user bisa login sampai aplikasinya dipublish (langkah user) |
| Gate verifikasi email | User belum verifikasi tidak bisa pakai app | ✅ Sesuai | Ya | Gate di `App.tsx` ("Cek emailmu" + kirim ulang, cooldown 60 detik); profil tidak dibuat sebelum terverifikasi |
| Custom SMTP + branding email | Email verifikasi atas nama Lolosin (bukan Supabase) | 🟡 Sebagian | — | Template konfirmasi + logo PNG siap di `email-assets/`; user sedang mengisi SMTP di dashboard Supabase (2026-11-15 19:33: toggle ON, sender Lolosin, port 587; masih perlu host/username/password lalu Save, baru tab Templates terbuka) |
| Lonceng notifikasi battle | Undangan battle terlihat di header | ✅ Sesuai | Ya | `NotificationBell.tsx`: badge + dropdown Terima/Tolak, polling 3 detik. Catatan: belum dites live 2 akun |

### G. Teknis, desain, monetisasi

| Fitur | Rancangan awal | Status | Live? | Catatan bukti |
|---|---|---|---|---|
| PWA + offline | PWA dirancang dari awal | ✅ Sesuai | Ya | `vite-plugin-pwa` (`registerType: 'autoUpdate'`, precache termasuk chunk soal ~7 MB). Catatan: chunk soal yang besar bikin bandwidth gede; lazy-load per subtes direncanakan |
| Repo GitHub dari awal | Repo GitHub sejak Fase 2 | ✅ Sesuai | Ya | `dhindatsamara/Lolosin` (privat, main) |
| Deploy gratis | Deploy gratis (rencana awal: Vercel + DB gratis) | ✅ Sesuai | Ya | Dipakai Netlify (bukan Vercel — setara, putusan praktis). Catatan: kuota gratis Netlify sudah 75% (300 kredit/bulan, 15 per deploy) — aturan baru: push hanya kalau versi sudah beres + QA lolos |
| Desain orisinal, bukan AI slop | Modern, menarik, tidak meniru LolosPNS/Pejuang NIP | ✅ Sesuai | Ya | Bahasa "Lapang" (`REDESIGN-V2.md`): tanpa font script, tanpa tekstur grid, tanpa kartu sticker neo-brutalist; 0 em-dash di `src/`; copy santai; "seksi" sudah jadi "bagian" (v2.5) |
| Freemium: gratis vs premium | Gratis = materi dasar + tryout terbatas/hari/minggu; premium = semua tryout + analisis kelemahan detail + bank soal lengkap | 🟡 Sebagian | Ya | Seksi Free vs Premium ada di landing ("segera hadir", tanpa harga, tanpa paywall); `is_premium` hanya mengunci host sesi; toggle "Premium Beta" gratis. Tidak ada batas tryout untuk user gratis, tidak ada penegakan premium |
| Harga + pembayaran | Rp10–25 ribu/bulan (usulan disetujui) | ❌ Belum | — | Tidak ada harga tampil, tidak ada alur pembayaran (Fase 4 belum dimulai) |
| Analisis kelemahan detail | Peta kelemahan untuk user premium | 🟡 Sebagian | Ya | Analisis dasar ada untuk SEMUA user (akurasi per subtopik di `plan.ts` + Fokus hari ini); belum ada peta kelemahan visual detail ala LolosPNS dan belum jadi fitur premium |
| Marketing TikTok | Marketing lewat konten TikTok Dhinda | ❌ Belum | — | Di luar kode: belum ada konten/strategi TikTok untuk Lolosin (kartu share Osi sudah siap sebagai bahan) |
| Mode tamu: bisa coba tanpa daftar | Tamu bisa coba drill/tryout/game solo | ✅ Sesuai | Ya | Tamu bisa main drill, tryout, Kuis/Kartu/Benar-Salah Kilat; Battle + Sesi wajib login |
| Progres tamu tersimpan | Progres tamu tersimpan di browser + peringatan dini (v2.2) | ↔️ Menyimpang | Belum (v2.5) | v2.5: progres tamu hanya in-memory, hilang saat refresh — putusan user yang disengaja untuk mendorong pendaftaran. Banner + tombol Daftar sudah ada; tawaran migrasi progres lama saat login tetap jalan |
| Sinkronisasi progres antar perangkat | (Implisit dari sistem akun: progres mengikuti akun, bukan browser) | ❌ Belum | — | XP/streak/misi/lencana hanya di localStorage per browser (`store.ts`); hanya skor tryout yang dikirim ke Supabase. Bukti nyata: akun Dhinda tampil 0 XP di Brave sementara browser lain 894 XP. Ini lubang terbesar untuk user testing |

## 3. GAP prioritas (diurutkan dari dampak terbesar ke pengguna)

1. **Progres tidak tersinkron antar perangkat.** Akun yang sama tampil beda di tiap browser/HP (Dhinda sendiri: 0 XP vs 894 XP) — user testing akan langsung menemukan ini dan menganggap akunnya rusak.
2. **Diskusi per soal belum ada.** Satu-satunya item MVP yang belum dibangun; padahal ini pembeda dari kompetitor yang pembahasannya statis, dan ini yang bikin user betah balik (komunitas, bukan sekadar bank soal).
3. **Tryout live mingguan / tryout akbar belum ada.** Diferensiasi Fase 3 yang paling menciptakan kebiasaan mingguan dan rasa event; tanpa ini, Lolosin belum punya alasan kuat buat user kembali tiap minggu selain streak.
4. **Juara mingguan dijanjikan di landing tapi hadiahnya tidak pernah diberikan.** Copy hadiah 7/5/3 hari sudah tampil sebagai marketing, tapi tidak ada pengumuman, premium, atau badge yang benar-benar jalan — janji yang belum ditepati ini berisiko mengecewakan user pertama.
5. **Data formasi masih contoh (34 formasi).** Menu Formasi sudah bagus UI-nya, tapi isinya contoh; tanpa data resmi 2026, fitur ini terasa seperti demo dan belum bisa jadi alasan orang datang.
6. **Kunci jawaban + pembahasan belum sepenuhnya tervalidasi.** 619 soal tanpa kunci, 17 temuan kunci meragukan belum diputuskan, 245 soal tanpa pembahasan — satu kunci salah yang ketahuan user saat testing bisa meruntuhkan kepercayaan ke seluruh bank soal.
7. **Freemium belum ditegakkan (tidak ada pembayaran, tidak ada batas gratis).** Semua fitur gratis untuk semua orang; tidak ada jalur pendapatan dan tidak ada alasan upgrade — Fase 4 belum dimulai sama sekali.
8. **Email verifikasi masih atas nama Supabase.** Custom SMTP sedang diisi user; sampai selesai, email pertama yang diterima user baru terlihat tidak profesional dan membingungkan.

## 4. Penyimpangan yang disengaja (putusan user — bukan kelalaian)

Ini perubahan dari rancangan awal yang diputuskan sadar oleh Dhinda, jadi jangan
dibaca sebagai kekurangan:

- **Progres tamu in-memory (v2.5).** Rancangan v2.2 menyimpan progres tamu di
  browser; user memutuskan progres tamu hilang saat refresh supaya orang
  terdorong daftar. Banner penjelas + tombol Daftar sudah ada.
- **Otomatisasi juara mingguan ditunda.** Draf SQL + pg_cron sudah lengkap, tapi
  user minta dibahas dan diajari dulu soal aturan seri ("nanti bahas ini dan
  ajari aku") — jangan dibangun sebelum diskusi itu.
- **Peringkat sendiri ditunda.** User bilang "nanti" (2026-11-15).
- **SKB ditunda ke fase akhir.** Keputusan sejak konsep awal (2026-11-13).
- **Hadiah juara diperbarui.** Rancangan awal: juara 1 premium 1 minggu, juara
  2–3 tiga hari. Keputusan 2026-11-15: 7/5/3 hari + badge; juara per formasi
  badge saja tanpa premium.
- **Premium Beta gratis selama beta.** Host sesi yang seharusnya premium bisa
  diaktifkan gratis dari Profil — sengaja selama masa beta.
- **Netlify, bukan Vercel.** Rancangan awal menyebut Vercel; yang dipakai
  Netlify (gratis, setara). Konsekuensi: kuota 300 kredit/bulan, 15 per deploy.
- **Avatar profil dan outfit pet belum disatukan.** Sengaja tidak disatukan di
  v2.4; menunggu keputusan user berikutnya.

Penyimpangan yang TIDAK disengaja (sudah masuk feedback v2.6, belum dibangun):
game "Main" tersembunyi di dropdown "Lainnya" (v2.5) padahal game adalah daya
jual utama; seksi streak terlalu besar sehingga kartu misi membengkak; tombol
back/next masih pakai teks ("Sebelumnya"/"Berikutnya") padahal user mau ikon
saja; profil v2.5 belum tentu muat satu halaman tanpa scroll.

## 5. Saran penyempurnaan (supaya bisa bersaing dengan Pejuang NIP, LolosPNS, JadiASN)

1. **Sinkronkan progres ke Supabase sebelum user testing.** Ini fondasi
   kepercayaan: XP, streak, misi, lencana, dan progres baca harus mengikuti
   akun, bukan browser. Tanpa ini, semua gamifikasi terasa rapuh begitu user
   ganti HP atau browser — dan kompetitor tidak punya masalah ini.
2. **Bangun diskusi per soal, mulai dari yang sederhana.** Thread komentar
   per soal (tabel Supabase + RLS, tampil di bawah pembahasan) sudah cukup
   untuk versi pertama. Ini pembeda nyata: Pejuang NIP dan LolosPNS
   pembahasannya satu arah; Lolosin bisa jadi tempat user saling menjelaskan.
3. **Jadwalkan tryout akbar mingguan sebagai event tetap.** Satu jadwal tetap
   tiap minggu (misal Minggu malam) + hitung mundur + leaderboard live saat
   event. Event terjadwal menciptakan alasan kembali yang tidak dimiliki
   kompetitor — dan memberi bahan konten TikTok tiap minggu.
4. **Ubah analisis yang sudah ada jadi "peta kelemahan" visual.** Data akurasi
   per subtopik sudah dihitung (`plan.ts`); tinggal ditampilkan sebagai peta
   kelemahan per subtes yang jelas (kuat/lemah, tren naik/turun). Ini menyamai
   fitur unggulan LolosPNS sekaligus jadi kandidat fitur premium pertama yang
   masuk akal.
5. **Perkuat loop coba → daftar → share.** Tamu sudah bisa coba dan progresnya
   hilang saat refresh (dorongan daftar sudah ada); pasangkan dengan login
   Google satu ketuk + perayaan "first win" yang jelas (drill pertama selesai,
   XP langsung masuk, Osi merayakan) + kartu share hasil tryout. Lalu dorong
   lewat TikTok Dhinda — kontennya sudah tersedia dari kartu share dan event
   tryout akbar.

---
*Audit dilakukan dari kode + dokumen, tanpa menjalankan QA Playwright penuh.
Item yang ditandai "belum live" ada di master lokal (HEAD 400eb4b) dan akan
ikut dalam push v2.5 berikutnya (1 batch, 1,55 MB).*
