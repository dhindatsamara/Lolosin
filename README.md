# Lolosin — Belajar CPNS Jadi Menyenangkan

Web app belajar CPNS all-in-one: materi SKD terstruktur, latihan soal
anti-ulang, dan tryout mini bergaya CAT. Dibangun sebagai PWA
offline-first — sekali dimuat, bisa dipakai tanpa internet.

**Stack:** Vite + React 19 + TypeScript + Tailwind CSS v4 + PWA
(`vite-plugin-pwa`). Routing memakai `HashRouter` agar aman di hosting
statis apa pun. UI berbahasa Indonesia.

## Menjalankan lokal

```bash
npm install
npm run dev        # server dev di http://localhost:5173
```

## Build & preview

```bash
npm run build      # type-check (tsc) + build production ke dist/
npm run preview    # sajikan hasil build lokal
```

## Struktur proyek

```
src/
  data/
    questions/       # bank soal, dipecah jadi chunk maks 1,5 MB
                     # (lihat "Update bank soal")
    materi/          # 17 dokumen materi belajar, 319 seksi, 124.163 kata
                     # (index.json, inventaris.json, SCHEMA.md, build_materi.py)
  lib/
    questions.ts     # loader & filter bank soal
    materi.ts        # loader konten materi (index + dokumen)
    quiz.ts          # mesin kuis: pick drill/tryout + penskoran
    store.ts         # progres pengguna (localStorage, key "lolosin:v1")
    utils.ts         # helper kecil (cx)
  components/
    Layout.tsx       # top bar (XP/level/streak) + bottom nav mobile
    icons.tsx        # ikon SVG garis
    ui/              # primitif bersama: Button, Card, ProgressBar, Badge
    belajar/         # MarkdownLite, ProgressRing, PangkatTable
    quiz/            # QuestionCard, OptionButton, ExplanationPanel,
                     # TryoutPalette, TimerDisplay
  pages/             # Home, Belajar, MateriDetail, SectionDetail,
                     # Latihan, LatihanJalan, Tryout, TryoutHasil
  App.tsx            # definisi rute
  main.tsx           # HashRouter + registrasi service worker
public/
  icons/             # ikon PWA (192/512 + maskable 512)
```

Rute: `/` (Beranda), `/belajar`, `/belajar/:materiId`,
`/belajar/:materiId/:sectionId`, `/latihan`, `/latihan/jalan`, `/tryout`,
`/tryout/hasil`.

## Update bank soal

Bank soal disimpan sebagai chunk-chunk kecil di `src/data/questions/`
(maks 1,5 MB per file — satu file 7,9 MB tidak bisa di-push lewat
konektor GitHub). Untuk memperbarui, jalankan script pemecah dari root
repo, lalu `npm run build`:

```bash
python3 scripts/split-questions.py [path/bank-soal.json]
```

Loader (`src/lib/questions.ts`) memakai `import.meta.glob` sehingga
jumlah dan nama chunk boleh berubah tanpa mengubah kode. Bank soal
dibundel ke chunk terpisah (`questions-[hash].js`) dan di-precache oleh
service worker, jadi pengguna mendapat data baru begitu service worker
memperbarui diri (`registerType: autoUpdate`).

Skema soal:

```json
{
  "id": "hots-1",
  "materi": "TWK",
  "subtopik": "Pancasila",
  "soal": "...",
  "pilihan": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." },
  "kunci": "D",
  "pembahasan": "...",
  "sumber": "...",
  "bobot": { "A": 1, "B": 2, "C": 3, "D": 4, "E": 5 }
}
```

`bobot` opsional (hanya sebagian soal TKP). `kunci` boleh `null` —
soal seperti itu otomatis dikecualikan dari kuis (lihat caveat di bawah).

## API singkat untuk pengembang UI

### `src/lib/questions.ts`

- `getQuestions(materi, subtopik?)` → soal kuis (selalu berkunci)
- `getTopics(materi)` → daftar subtopik terurut
- `countByTopic(materi)` → jumlah soal per subtopik
- `countNewByTopic(materi, seenIds)` → sisa soal baru per subtopik
- `countTotalByMateri(materi)`, `countSeenByMateri(seenIds)`
- `TOTAL_QUESTIONS`, `TOTAL_QUIZABLE`, `MATERI_META`, `isMateri()`

### `src/lib/quiz.ts`

- `pickDrillQuestions(materi, subtopik | null, n = 10, seenIds)` →
  `{ questions, rotated }` (utamakan soal baru; `rotated=true` bila pool
  baru habis)
- `pickTryoutQuestions(seenIds)` → 30 soal (10 TWK + 10 TIU + 10 TKP)
- `scoreTryout(questions, answers)` → `{ scores, scaled, passed,
  passedOverall, correct, total, scaledTotal }`
- `scoreQuestion(question, answer)` → skor satu soal
- Konstanta: `TRYOUT_TIME_LIMIT_MINUTES` (27),
  `TRYOUT_PASSING_MINI` ({ TWK: 22, TIU: 23, TKP: 35 }),
  `TRYOUT_SCALE_TO_ORIGINAL` ({ TWK: 3, TIU: 3.5, TKP: 4.5 }),
  `ORIGINAL_PASSING` ({ TWK: 65, TIU: 80, TKP: 156 })

### `src/lib/store.ts` (localStorage key `lolosin:v1`)

- `useStore()` — hook React reaktif (dipakai top bar & halaman)
- `getStore()` — baca state mentah
- `addXp(n)` — tambah XP
- `recordActivity()` — catat aktivitas hari ini, perbarui streak
  (zona Asia/Makassar)
- `markSeen(ids)` / `isSeen(id)` — soal sudah dilihat
- `markRead(sectionId)` — tandai seksi dibaca (+5 XP, sekali per seksi)
- `recordTryout({ twk, tiu, tkp, passed, correct? })` — simpan hasil
- `getLevel(xp)`, `xpProgress(xp)` — level = floor(sqrt(xp/50)) + 1
- Aturan XP: benar drill +10, selesai drill +50, selesai tryout +100,
  baca seksi +5

## Caveat data

- **621 soal tanpa kunci** (`kunci: null`) difilter dari semua
  pool kuis: CATBKN 2024 (102), CATBKN.com (422), Portal CASN (85),
  komunitasbelajar (11), kidocp (1). Soal-soal itu tetap ada di
  `questions.json` dan tidak pernah muncul di drill/tryout.
  Soal yang bisa dipakai kuis: 8.451 dari 9.072.
- **2 kunci HOTS Konstitusi ditentukan dari analisis isi, belum
  terverifikasi manual:** Q13 = C, Q50 = A. Perlu dicek manusia sebelum
  dipakai sebagai acuan.
- **Bank soal akan membesar.** Jalur update sudah terdokumentasi di
  atas (ganti satu file + rebuild). Chunk soal saat ini ~7,9 MB
  (bank 9.072 soal, update 2026-11-13) dan batas precache workbox
  dinaikkan ke 10 MB di `vite.config.ts` — kalau bank soal melewati
  itu, naikkan `maximumFileSizeToCacheInBytes`.

## Berikutnya (Fase 3 — jangan dibangun sekarang)

- Leaderboard mingguan + badge prestise juara 1–3
- Spaced repetition (pengulangan soal yang salah)
- Battle 1v1
- Tryout live mingguan
- Prediksi kelolosan
- Rencana belajar personal
- Diskusi per soal

## Desain

Token desain di `src/index.css` (`@theme` Tailwind v4): font
Plus Jakarta Sans (UI) + Sora (display), latar kertas hangat `#FAF7F2`,
tinta `#1B1E1C`, primer hijau tua `#0E5C43`, aksen amber `#F2A900`,
warna seksi TWK terracotta `#C2410C`, TIU biru `#1E40AF`, TKP plum
`#7E22CE`. Tanpa gradient ungu generik.
