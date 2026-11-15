# QA Lokal — Dashboard v2.4 (perombakan beranda login)

Tanggal: 2026-11-15 (sore WITA)
Commit yang diuji: kerja v2.4 di atas `f7f157f` (belum commit saat QA;
laporan ini ikut commit yang sama)
Hasil akhir: **393/393 PASS, 0 FAIL** (run ke-4, EXIT=0)

## Cara QA dijalankan

- Build placeholder (`VITE_SUPABASE_URL=https://placeholder.supabase.co`)
  dan build fake (`https://fake-lolosin-qa.supabase.co`), disalin ke
  `/tmp/lolosin-qa-v24/main/Lolosin` dan `/tmp/lolosin-qa-v24/fake/Lolosin`,
  disajikan python http.server port **4199** (main) dan **4200** (fake).
  Salinan dist dipakai supaya rebuild di repo utama tidak mengganggu QA
  yang sedang berjalan (pelajaran v2.2.3).
- Skrip: `~/workspace/qa-lolosin/qa.mjs` (+ seksi 16 baru) dijalankan
  lewat salinan `qa-v24.mjs` (BASE port 4199/4200). Log:
  `~/workspace/qa-lolosin/qa-run-v24.log`.
- Catatan: /tmp sempat dibersihkan runtime di antara run (direktori
  serve hilang, server mati) — build + server dibuat ulang sebelum
  run ke-4. Bukan masalah aplikasi.

## Yang diuji (seksi 16 baru, 24 cek — semua PASS)

- Urutan seksi: hero (107px), streak (595), pintasan (1316), fokus
  (1441), progres (1793), ulas (2077), riwayat (2210), lencana (2599).
  Lencana benar-benar seksi paling bawah.
- Kolom streak/misi sama tinggi: selisih **0px** (guest default:
  pet 1282 = misi 1282; streak 30: pet 1240 = misi 1240). Kriteria
  terima maksimal 16px.
- Lencana ringkas: strip tertutup tinggi 81px (guest 0 lencana maupun
  seed 5 lencana), tanpa grid; "Lihat semua" mengembang ke grid 13
  lencana + tombol "Tutup"; "Tutup" mengembalikan strip. Helper
  lencana seksi 6b tetap bekerja (mengembang dulu lewat helper).
- Gating avatar lewat hero: streak 0 + kacamata terkunci jatuh ke
  wisuda (topi, tanpa kacamata); streak 7 + kacamata terbuka tampil
  kacamata; streak 7 + mahkota terkunci jatuh ke kacamata; streak 30
  + wisudawan terbuka tampil bermahkota (jubah + topi).
- "Lihat peringkat" ada di halaman Tryout, di bawah info passing
  grade, mengarah ke #/leaderboard.
- Footer: kolom "Tautan resmi" 3 tautan benar (SSCASN, BKN,
  KemenPANRB) + target _blank + rel noopener noreferrer; disclaimer
  "bukan situs resmi pemerintah" ada; "Kirim saran ke pengembang"
  mailto `lolosin.app@gmail.com?subject=Saran%20untuk%20Lolosin`;
  Jelajahi tetap punya Peringkat ke /leaderboard.
- Mobile 390px: dashboard tanpa overflow; tile pintasan 2 kolom;
  misi menumpuk di bawah PetCard dengan celah 20px; footer tanpa
  overflow.

## Seksi lama yang disesuaikan (semua PASS)

- §1: cek tile pintasan 4 item + konten terhapus (teaser game/formasi/
  peringkat, kartu profil, "Mau ngapain hari ini?", "Progres bacamu").
- §6b: helper `lencanaDiraihDiShowcase` mengembang dulu sebelum baca grid.
- §10: nav desktop 6 item (tanpa Peringkat), bottom nav mobile 5 item;
  Peringkat dicapai lewat footer.
- §13 Formasi: cek teaser dashboard diganti cek tile Formasi BETA.
- §14: cek grid teaser diganti cek grid pintasan 4 kolom di lg.
- §15: tes "mood marah menang" memakai varian musik (kacamata terkunci
  di streak 0 setelah gating v2.4); fallback kacamata diuji di §16.

## Verifikasi visual (screenshot)

- `screenshots/v24-dashboard-full.png`: urutan seksi benar, kolom
  streak/misi sejajar, 4 tile sebaris, lencana paling bawah, footer
  3 kolom rapi.
- `screenshots/v24-dashboard-mobile-full.png`: tile 2x2 vertikal,
  tumpukan tanpa celah besar, footer menumpuk rapi, tanpa overflow.
- `screenshots/v24-hero-wisudawan-streak30.png`: Osi hero bermahkota +
  jubah di streak 30.
- `screenshots/v24-dashboard-default.png`: strip lencana + footer
  (tautan resmi, disclaimer, kirim saran).

## Bug yang ditemukan dan diperbaiki selama QA

1. **Overflow horizontal mobile 15px** (scrollW 405 vs 390): badge BETA
   di tile Formasi meluber keluar tile di grid 2 kolom mobile. Perbaiki:
   tile vertikal di mobile (ikon di atas, judul + deskripsi di bawah),
   horizontal mulai sm; baris judul boleh membungkus. Setelah perbaikan,
   semua cek overflow mobile PASS.
2. **Klik "Mulai ulas" mobile terhalang** (run 1, TimeoutError): hilang
   setelah overflow diperbaiki — kemungkinan efek samping lebar halaman
   405px saat scroll-into-view. Tidak ada perubahan kode khusus.
3. **§13 Formasi menunggu kartu teaser "Cari formasi CPNS"** yang sudah
   dihapus v2.4 (run 2 crash): cek diganti ke tile Formasi BETA.
4. **§16 memakai `SEED_FRESH` yang tidak ada** (run 3 crash
   ReferenceError): seed didefinisikan di §16 (streak 0, aktif hari ini).

## Kegagalan flaky di luar v2.4 (TIDAK diperbaiki di sini)

Run 3: 10 FAIL di Simulasi CAT (TKP tampil 221/225, benar 44/45).
Penyebab: bank soal punya **57 stem duplikat**, termasuk pasangan TKP
`komunitas-553` (kunci B) vs `komunitas-1137` (kunci E) yang isinya
identik (stem + 5 opsi sama, hanya typo "kebengkel" vs "ke bengkel" di
opsi E) tapi kuncinya bertentangan. Seleksi soal simulasi acak; run 3
mengambil si kembar dan lookup tes berbasis stem memilih kembar yang
salah, sehingga satu jawaban TKP dinilai 1 poin bukan 5. Run 2 (build
sama persis) dan run 4 lolos 0 FAIL — membuktikan ini flaky, bukan
regresi v2.4 (v2.4 tidak menyentuh logika kuis, seleksi soal, atau bank
soal). Perbaikan yang benar ada di data bank (hapus/perbaiki salah satu
si kembar) — di luar cakupan v2.4, dilaporkan ke parent sebagai
follow-up. Peluang kena lagi per run sekitar 4% (45 soal TKP dari
~2.024, 2 soal bermasalah).

## Yang TIDAK bisa diuji lokal (butuh verifikasi manual user)

- UI AvatarPicker terkunci di halaman Profil (butuh akun login; mode QA
  placeholder adalah tamu dan /profil mengarah ke /auth). Logika
  gating yang sama (`resolveAvatarVariant` + streak yang sama) sudah
  terbukti lewat hero di 4 skenario streak. Verifikasi manual: login,
  buka Profil, cek varian terkunci abu-abu + syaratnya, dan hero
  beranda mengikuti varian yang dipilih.
- Lonceng notifikasi battle (v2.3.4, butuh 2 akun + Supabase live) —
  tidak berubah di v2.4, tetap menunggu tes manual user seperti
  sebelumnya.
- Alamat mailto saran (lolosin.app@gmail.com) terverifikasi sebagai
  atribut href; pengiriman email sungguhan tergantung aplikasi email
  perangkat user.

## File yang berubah (v2.4)

- `src/pages/HomePage.tsx`: restrukturisasi urutan + tile NAV_TILES,
  hapus ProfileCard/LeaderboardTeaser/GameTeaserCard/FormasiTeaserCard/
  "Mau ngapain hari ini?"/"Lanjutkan belajar".
- `src/lib/profile.ts`: `minStreak` per varian + `getUnlockedAvatarVariants`
  + `resolveAvatarVariant`.
- `src/components/AvatarPicker.tsx`: varian terkunci abu-abu + syarat,
  tidak bisa dipilih; indikator memakai varian ter-resolve.
- `src/components/ProfileAvatar.tsx`: memakai `resolveAvatarVariant`.
- `src/components/PetCard.tsx`: dipadatkan + prop `className` (flex-1).
- `src/components/gamifikasi/DailyMissions.tsx`: meregang setinggi kolom.
- `src/components/gamifikasi/BadgeShowcase.tsx`: strip ringkas +
  "Lihat semua"/"Tutup".
- `src/components/Layout.tsx`: Peringkat keluar dari nav (6 desktop /
  5 mobile); footer kolom "Tautan resmi" + disclaimer + tautan saran
  (baris footer pindah ke breakpoint lg).
- `src/lib/site.ts` (baru): `OFFICIAL_LINKS`, `FEEDBACK_EMAIL`
  (lolosin.app@gmail.com), `FEEDBACK_SUBJECT`.
- `src/pages/TryoutPage.tsx`: tombol "Lihat peringkat" ke /leaderboard.
- `src/pages/ProfilPage.tsx`: salinan avatar ("Gaya baru terbuka
  seiring streak belajar-mu.").
- `REDESIGN-V2.md`: seksi v2.4.
- `~/workspace/qa-lolosin/qa.mjs`: seksi 16 baru + penyesuaian §1/§6b/
  §10/§13/§14/§15 (di luar repo aplikasi).
