# Fase 3 Lolosin: Fitur Belajar Personal

Spesifikasi siap bangun. Dipilih user 2026-11-13 (Jumat) pukul 15:37 WITA.
Ditulis 2026-11-13 pukul 15:44 WITA, berdasar kode yang ada di `workspace/lolosin/`.

Catatan penulisan: dokumen ini tidak memakai em-dash sama sekali, sesuai
keputusan user. Rentang angka ditulis dengan kata, contoh: 1 sampai 30.

## Status saat dokumen ini ditulis

Pembersihan em-dash di soal dan materi masih jalan di tangan Cupen utama.
Bukti yang dicek pukul 15:44 WITA:

- Backup kanonis `workspace/cpns/bank-soal/bank-soal-pre-emdash-clean.json`
  dibuat 2026-11-13 pukul 15:36 WITA, ukuran sama persis dengan kanonis.
- Em-dash yang masih ada: 146 di `workspace/cpns/bank-soal/bank-soal.json`,
  146 di chunk app `workspace/lolosin/src/data/questions/`, 539 di materi
  app `workspace/lolosin/src/data/materi/`. Jadi pembersihan belum
  diterapkan saat dokumen ini ditulis.
- Tidak ada file `workspace/lolosin` atau `workspace/cpns` yang berubah
  setelah pukul 15:37 WITA.

Aturan urutan: JANGAN mulai edit Fase 3 sebelum pembersihan em-dash
selesai, QA ulang lolos, dan ke-push. Dua pekerjaan ini menyentuh repo
yang sama. Setelah push em-dash beres, Fase 3 boleh jalan, lalu deploy
Netlify (deploy ditunda user sampai Fase 3 beres).

## Tiga fitur yang dibangun

1. Ulas soal salah, soal yang pernah salah dijawab muncul lagi terjadwal.
2. Rencana belajar personal, app menyarankan fokus belajar hari ini dari
   topik yang paling lemah.
3. Prediksi kelolosan, perkiraan peluang lolos per subtes dari skor
   tryout, ditulis jujur sebagai perkiraan, bukan jaminan.

Semua jalan tanpa backend. Semua data di localStorage, kunci yang sama
`lolosin:v1`. Tanggal memakai zona Asia/Makassar, format `YYYY-MM-DD`,
mengikuti pola yang sudah ada di `src/lib/store.ts`.

## Fakta kode yang dipakai sebagai fondasi

Dicek langsung dari kode, bukan dari ingatan:

- Store ada di `src/lib/store.ts`. Isinya sekarang: `xp`, `streak`,
  `lastActivityDate`, `seenQuestionIds`, `readSections`, `tryoutHistory`,
  `activityDates`, `badges`, `missions`, `stats`. Pola load-nya
  backward-compatible, field baru yang tidak ada di data lama diabaikan
  dengan aman. Field baru Fase 3 wajib ikut pola yang sama.
- `TryoutRecord` sudah menyimpan skor mini per seksi (maks 50),
  `passed`, dan `correct` per seksi (TWK, TIU, TKP). Ini cukup untuk
  prediksi, tidak perlu ubah bentuk riwayat tryout.
- Penskoran ada di `src/lib/quiz.ts`. Tryout mini 30 soal, skor mini
  maks 50 per seksi. Passing grade mini TWK 22, TIU 23, TKP 35.
  Passing grade asli KepmenPANRB 406/2026: TWK 65 dari 150, TIU 80 dari
  175, TKP 156 dari 225. Faktor skala mini ke asli: TWK 3, TIU 3,5,
  TKP 4,5. Konstanta `ORIGINAL_PASSING`, `ORIGINAL_MAX`, dan
  `TRYOUT_SCALE_TO_ORIGINAL` sudah tersedia, pakai itu, jangan tulis
  ulang angkanya di tempat lain.
- Soal punya field `materi`, `subtopik`, `soal`, `pilihan`, `kunci`,
  `pembahasan`, `sumber`, dan `bobot` opsional untuk TKP
  (`src/lib/questions.ts`). Ada helper `getQuestions(materi, subtopik)`
  dan `getTopics(materi)`. Total soal di chunk app terverifikasi 9.072,
  yang bisa kuis 8.451 (621 tanpa kunci difilter).
- Yang BELUM ada dan wajib dibuat Fase 3: pencatatan hasil per soal.
  Hari ini drill hanya memanggil `markSeen` di
  `src/pages/LatihanJalanPage.tsx` baris 130, dan tryout hanya
  `markSeen` di `src/pages/TryoutPage.tsx` baris 132. Jawaban benar
  atau salah per soal tidak disimpan. Tanpa ini, ulas soal salah dan
  rencana belajar tidak bisa jalan.
- Jumlah label subtopik terverifikasi 235, dan banyak yang nyaris
  duplikat, contoh: Analogi, Analogi Verbal, Analogi Kata, Analogi Dua
  Kata. Rencana belajar wajib memperhitungkan ini (lihat bagian
  rencana belajar).

## Fitur 1: Ulas soal salah

Cara kerja:

- Setiap jawaban drill dan tryout dicatat per soal: benar atau salah,
  beserta `materi` dan `subtopik` soal itu. Titik catatnya di
  `LatihanJalanPage.tsx` (saat jawaban dinilai) dan `TryoutPage.tsx`
  (saat tryout selesai dinilai). TKP dinilai benar bila opsi yang
  dipilih adalah kunci (opsi terbaik), mengikuti `scoreQuestion`.
- Soal yang dijawab salah masuk antrean ulas dengan jadwal:
  besok (1 hari), lalu 3 hari, lalu 7 hari, lalu 14 hari, lalu 30 hari.
  Setiap jawaban benar saat ulasan memajukan jadwal ke interval
  berikutnya. Setiap jawaban salah saat ulasan mengulang dari 1 hari.
  Setelah 5 kali benar beruntun, soal keluar dari antrean (dianggap
  sudah nempel).
- Soal yang dijawab benar di drill atau tryout biasa tidak masuk
  antrean. Soal yang sudah ada di antrean lalu dijawab benar di drill
  biasa ikut dihitung sebagai satu ulasan benar (jangan dobel catat).

Data baru di store, tambah ke `StoreState`:

```ts
export interface ReviewEntry {
  questionId: string
  materi: Materi
  subtopik: string
  /** Tanggal jatuh tempo ulasan, YYYY-MM-DD (Asia/Makassar). */
  due: string
  /** Interval saat ini dalam hari: 1, 3, 7, 14, atau 30. */
  intervalDays: number
  /** Jumlah jawaban benar beruntun di ulasan. */
  streakCorrect: number
}
```

Simpan sebagai `reviewQueue: ReviewEntry[]` di `StoreState`, dengan
`freshState` berisi array kosong dan guard load mengikuti pola
`seenQuestionIds` yang sudah ada. Helper baru di `src/lib/review.ts`:
`recordAnswer(question, correct)`, `dueReviews(today)`,
`answerReview(questionId, correct)`, dan `reviewCountDue(today)`.

UI yang dibuat:

- Kartu baru di dashboard (`src/pages/HomePage.tsx`), di atas atau di
  bawah kartu misi harian: "Soal yang perlu diulas hari ini: N soal".
  Kalau N sama dengan 0, tampilkan "Belum ada yang perlu diulas,
  lanjutkan belajarmu." Tombolnya membuka mode ulas.
- Mode ulas memakai ulang `LatihanJalanPage` dengan sumber soal dari
  antrean yang jatuh tempo, bukan dari `pickDrillQuestions`. Jumlah
  per sesi maksimal 10, urut dari yang paling lama jatuh tempo.
  Tampilan soal, pembahasan per opsi, dan XP memakai komponen yang
  sudah ada supaya konsisten.
- Perayaan kecil saat antrean hari ini habis, memakai komponen
  `Celebration` dan maskot Lolo yang sudah ada. Jangan buat komponen
  perayaan baru.

XP: jawaban benar saat ulasan mendapat +10, sama seperti drill biasa
(`XP_DRILL_CORRECT`). Ini rekomendasi, bukan keputusan final. Alasannya:
sederhana, konsisten dengan aturan XP yang sudah ada, dan tidak
mengubah rumus level. Kalau user khawatir XP bisa difarming dari soal
yang sama, alternatifnya: XP ulasan hanya +5. Tanyakan ke user saat
mulai bangun, jangan diam-diam memilih.

Lencana baru (opsional, tawarkan ke user): "Pantang Menyerah",
diraih setelah menyelesaikan 10 ulasan benar. Definisi lencana ada di
`src/lib/badges.ts`, mengikuti pola 10 lencana yang sudah ada.

## Fitur 2: Rencana belajar personal

Cara kerja:

- Dari hasil per soal yang dicatat Fitur 1, hitung akurasi per subtopik:
  benar dibagi total jawaban untuk subtopik itu. Simpan sebagai tally
  ringan di store, contoh `topicStats: Record<string, { correct: number,
  total: number }>`, dengan kunci gabungan materi dan subtopik,
  contoh `TIU|Analogi Verbal`. Tally ini diperbarui di tempat yang
  sama dengan pencatatan jawaban, supaya drill, tryout, dan ulasan
  semuanya terhitung.
- Subtopik terlemah adalah akurasi terendah di antara subtopik yang
  sudah dijawab minimal 5 kali. Batas minimal 5 penting supaya satu
  jawaban salah tidak langsung jadi "terlemah". Subtopik yang belum
  pernah dicoba tidak masuk daftar lemah, tapi ditampilkan terpisah
  sebagai "Belum dicoba".
- Masalah 235 label subtopik: banyak label nyaris sama. Sebelum
  menampilkan daftar, normalisasi ringan: samakan huruf besar kecil
  dan spasi, lalu gabungkan label yang hanya beda kata penghubung
  atau tanda baca, contoh "Analogi Verbal" dan "Analogi Verbal ".
  Jangan ubah data soal, normalisasi hanya di lapisan hitung dan
  tampil. Kalau dua label tetap terpisah setelah normalisasi, biarkan,
  jangan dipaksa gabung manual satu per satu.
- Kartu "Fokus hari ini" di dashboard, berisi:
  1. Satu subtopik terlemah, lengkap dengan akurasinya, contoh:
     "TIU, Deret Tabel: 4 benar dari 10".
  2. Satu aksi: tombol drill 10 soal khusus subtopik itu, memakai
     `pickDrillQuestions` yang sudah ada.
  3. Satu saran baca: tautan ke seksi materi dari materi yang sama
     (TWK, TIU, atau TKP), memakai daftar materi yang sudah ada.
     Pemetaan subtopik ke seksi materi spesifik bersifat perkiraan,
     jadi tautannya boleh ke halaman Belajar materi tersebut, bukan
     ke seksi yang dipaksakan cocok.
- Kalau belum ada data sama sekali (pengguna baru), kartu menampilkan
  "Ikut drill atau tryout mini dulu, nanti aku susun fokus
  belajarmu." Jangan tampilkan rencana kosong atau angka nol yang
  menyesatkan.
- Versi pertama ini TIDAK meminta tanggal target SKD dan menit belajar
  per hari. Itu ide dari diskusi awal (user masukin tanggal target
  plus waktu belajar, sistem bikinin jadwal harian), tapi butuh input
  user dan menambah scope. Tawarkan sebagai langkah berikut setelah
  versi pertama jalan, jangan selipkan diam-diam.

Helper baru di `src/lib/plan.ts`: `weakestTopics(limit)`,
`untriedTopics()`, dan `todayFocus()`. Semua hitung dari store,
tanpa state baru di luar tally di atas.

## Fitur 3: Prediksi kelolosan

Cara kerja:

- Sumber data: `tryoutHistory` yang sudah ada. Ambil tryout terakhir,
  dan tren dari maksimal 3 tryout terakhir.
- Per seksi, tampilkan: skor terskala terakhir (contoh: TWK 66 dari
  150), passing grade asli (TWK 65, TIU 80, TKP 156), dan selisihnya
  (contoh: "6 poin di atas passing grade" atau "9 poin lagi").
  Pakai `TRYOUT_SCALE_TO_ORIGINAL` dan `ORIGINAL_PASSING` dari
  `src/lib/quiz.ts`, jangan hardcode angka di komponen.
- Label peluang memakai pita (band), bukan satu angka persen yang
  terkesan pasti. Rekomendasi pita, dihitung dari selisih skor
  terskala terhadap passing grade:
  - Selisih 15 atau lebih di atas passing grade: "Aman, pertahankan".
  - Selisih 0 sampai 14 di atas passing grade: "Hampir aman, sedikit
    lagi".
  - Selisih 1 sampai 14 di bawah passing grade: "Butuh kejar, sudah
    dekat".
  - Selisih 15 atau lebih di bawah passing grade: "Masih jauh, fokus
    di sini dulu".
  Pita ini rekomendasi, user boleh ubah angkanya saat pembangunan.
- Tren: bandingkan skor terskala tryout terakhir dengan tryout
  sebelumnya, tampilkan "naik 9 poin" atau "turun 6 poin" per seksi.
  Kalau baru ada 1 tryout, tampilkan "Belum ada tren, ikut tryout
  lagi untuk melihat perkembanganmu."
- Kalimat jujur wajib ada di bawah panel, contoh: "Ini perkiraan dari
  tryout minimu, bukan jaminan lolos. Tryout mini hanya 30 soal,
  jadi angkanya masih kasar."
- Kalau belum pernah tryout, panel menampilkan empty state:
  "Ikut tryout mini dulu, nanti aku hitung perkiraan kelolosanmu."
  Jangan tampilkan prediksi dari nol data.
- Tempat: panel baru di `src/pages/TryoutHasilPage.tsx` (setelah
  hasil tryout) dan ringkasannya di dashboard. Satu komponen
  `PredictionPanel`, dipakai di dua tempat, jangan duplikasi logika.

Helper baru di `src/lib/prediction.ts`: `predictFromHistory(history)`,
mengembalikan per seksi skor terskala terakhir, selisih, pita, dan
tren. Fungsi ini murni hitung-hitungan, gampang diuji tanpa render.

## Urutan pembangunan

1. Tunggu push pembersihan em-dash, lalu tarik repo terbaru.
2. Store dan lib dulu: `reviewQueue` dan `topicStats` di `store.ts`,
   lalu `src/lib/review.ts`, `src/lib/plan.ts`, `src/lib/prediction.ts`.
   Pastikan data lama (sebelum Fase 3) tetap kebaca, mengikuti guard
   load yang sudah ada.
3. Catat jawaban per soal di `LatihanJalanPage.tsx` dan
   `TryoutPage.tsx`.
4. UI: kartu ulasan dan kartu fokus di dashboard, mode ulas, panel
   prediksi di halaman hasil tryout.
5. QA penuh memakai `qa.mjs` yang sudah ada (63 cek), tambah cek baru:
   soal salah masuk antrean, jadwal maju setelah benar dan reset
   setelah salah, kartu fokus menampilkan subtopik terlemah yang benar,
   panel prediksi memakai skor terskala yang benar, dan empty state
   saat belum ada data. QA wajib 63 cek lama plus cek baru, nol error.
6. Push ke repo `dhindatsamara/Lolosin`, lalu kabari user dengan format
   notifikasi yang diminta: "[nama task] udah selesai bos dhinda".
7. Setelah itu baru deploy Netlify, sesuai pilihan user: deploy
   ditunda sampai Fase 3 beres.

## Keputusan yang masih butuh user

Tanyakan tiga hal ini saat mulai bangun, jangan ditebak:

1. XP ulasan: +10 seperti drill biasa, atau +5 supaya tidak bisa
   difarming dari soal yang sama.
2. Lencana baru "Pantang Menyerah": setuju ditambah atau tidak.
3. Input tanggal target SKD dan menit belajar per hari: masuk versi
   pertama ini, atau jadi langkah berikut setelah versi pertama jalan.
