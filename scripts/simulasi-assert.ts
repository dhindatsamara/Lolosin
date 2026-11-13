/**
 * Skrip asersi logika simulasi CAT lengkap (110 soal, 100 menit).
 *
 * Dijalankan dengan vite-node supaya `import.meta.glob` di loader bank
 * soal ikut jalan (tsx/tsc polos tidak bisa):
 *   npx vite-node scripts/simulasi-assert.ts
 *   (dari root repo, perlu koneksi npm saat pertama kali mengunduh
 *   vite-node; setelah itu tersimpan di cache npx)
 *
 * Keluar dengan kode 1 bila ada asersi yang gagal.
 */

// localStorage tidak ada di Node: tiruan in-memory. Modul store hanya
// menyentuh localStorage di dalam fungsi (bukan di level modul), jadi
// tiruan ini cukup dipasang sebelum pemanggilan pertama.
const memory = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, String(value))
  },
  removeItem: (key: string) => {
    memory.delete(key)
  },
  clear: () => {
    memory.clear()
  },
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size
  },
} as Storage

import { checkNewBadges, getBadgeDef } from '../src/lib/badges'
import { completeTryout } from '../src/lib/gamification'
import { getDailyMissions, MISSION_POOL } from '../src/lib/missions'
import { predictFromHistory } from '../src/lib/prediction'
import type { Materi, Opsi, Question } from '../src/lib/questions'
import {
  ORIGINAL_MAX,
  ORIGINAL_PASSING,
  pickTryoutQuestions,
  scoreFromRecord,
  scoreTryout,
  SIMULASI_QUESTIONS_PER_SECTION,
  SIMULASI_TIME_LIMIT_MINUTES,
  SIMULASI_TIME_LIMIT_SECONDS,
  SIMULASI_TOTAL_QUESTIONS,
  TRYOUT_PASSING_MINI,
  TRYOUT_QUESTIONS_PER_SECTION,
  TRYOUT_SCALE_TO_ORIGINAL,
  TRYOUT_TIME_LIMIT_MINUTES,
  TRYOUT_TOTAL_QUESTIONS,
  type TryoutAnswers,
  type TryoutScore,
} from '../src/lib/quiz'
import {
  getStore,
  recordTryout,
  resetStore,
  XP_SIMULASI_COMPLETE,
  XP_TRYOUT_COMPLETE,
  type TryoutRecord,
} from '../src/lib/store'

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    passed += 1
  } else {
    failed += 1
    failures.push(
      `${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function checkTrue(name: string, value: boolean): void {
  check(name, value, true)
}

function fakeQuestion(
  id: string,
  materi: Materi,
  subtopik: string,
  bobot?: Partial<Record<Opsi, number>>,
): Question {
  return {
    id,
    materi,
    subtopik,
    soal: 'Soal tes',
    pilihan: { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e' },
    kunci: 'A',
    pembahasan: '',
    sumber: 'tes',
    ...(bobot !== undefined ? { bobot } : {}),
  }
}

/** Bobot TKP standar: A terbaik (5) sampai E terendah (1). */
const BOBOT_TKP: Partial<Record<Opsi, number>> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
}

function countByMateri(questions: readonly Question[]): Record<Materi, number> {
  const counts: Record<Materi, number> = { TWK: 0, TIU: 0, TKP: 0 }
  for (const q of questions) counts[q.materi] += 1
  return counts
}

/** Set soal palsu simulasi lengkap: 30 TWK + 35 TIU + 45 TKP. */
function fakeFullSet(): Question[] {
  const questions: Question[] = []
  for (let i = 0; i < 30; i++) {
    questions.push(fakeQuestion(`ftwk${i}`, 'TWK', 'Pancasila'))
  }
  for (let i = 0; i < 35; i++) {
    questions.push(fakeQuestion(`ftiu${i}`, 'TIU', 'Deret Angka'))
  }
  for (let i = 0; i < 45; i++) {
    // 40 soal berbobot, 5 soal tanpa bobot (uji fallback).
    questions.push(
      fakeQuestion(
        `ftkp${i}`,
        'TKP',
        'Integritas',
        i < 40 ? BOBOT_TKP : undefined,
      ),
    )
  }
  return questions
}

/** Set soal palsu tryout mini: 10 TWK + 10 TIU + 10 TKP. */
function fakeMiniSet(): Question[] {
  const questions: Question[] = []
  for (let i = 0; i < 10; i++) {
    questions.push(fakeQuestion(`mtwk${i}`, 'TWK', 'Pancasila'))
  }
  for (let i = 0; i < 10; i++) {
    questions.push(fakeQuestion(`mtiu${i}`, 'TIU', 'Deret Angka'))
  }
  for (let i = 0; i < 10; i++) {
    questions.push(fakeQuestion(`mtkp${i}`, 'TKP', 'Integritas', BOBOT_TKP))
  }
  return questions
}

/** Jawab semua soal dengan opsi yang sama. */
function answerAll(
  questions: readonly Question[],
  opsi: Opsi,
): TryoutAnswers {
  const answers: TryoutAnswers = {}
  for (const q of questions) answers[q.id] = opsi
  return answers
}

function record(
  date: string,
  twk: number,
  tiu: number,
  tkp: number,
  passedValue: boolean,
  mode?: 'mini' | 'full',
): TryoutRecord {
  return {
    date,
    ...(mode !== undefined ? { mode } : {}),
    twk,
    tiu,
    tkp,
    passed: passedValue,
  }
}

/* ------------------------------------------------------------------ */
/* Konstanta                                                           */
/* ------------------------------------------------------------------ */

check('konstanta: soal per seksi simulasi', SIMULASI_QUESTIONS_PER_SECTION, {
  TWK: 30,
  TIU: 35,
  TKP: 45,
})
check('konstanta: total simulasi 110', SIMULASI_TOTAL_QUESTIONS, 110)
check('konstanta: waktu simulasi 100 menit', SIMULASI_TIME_LIMIT_MINUTES, 100)
check('konstanta: waktu simulasi 6000 detik', SIMULASI_TIME_LIMIT_SECONDS, 6000)
check('konstanta: mini tetap 30 soal', TRYOUT_TOTAL_QUESTIONS, 30)
check('konstanta: mini tetap 10 per seksi', TRYOUT_QUESTIONS_PER_SECTION, 10)
check('konstanta: mini tetap 27 menit', TRYOUT_TIME_LIMIT_MINUTES, 27)
check('konstanta: passing mini tetap', TRYOUT_PASSING_MINI, {
  TWK: 22,
  TIU: 23,
  TKP: 35,
})
check('konstanta: passing asli', ORIGINAL_PASSING, {
  TWK: 65,
  TIU: 80,
  TKP: 156,
})
check('konstanta: maks asli', ORIGINAL_MAX, {
  TWK: 150,
  TIU: 175,
  TKP: 225,
})
check('konstanta: XP simulasi 300', XP_SIMULASI_COMPLETE, 300)
check('konstanta: XP mini tetap 100', XP_TRYOUT_COMPLETE, 100)

/* ------------------------------------------------------------------ */
/* pickTryoutQuestions (bank soal asli)                                */
/* ------------------------------------------------------------------ */

const fullPick = pickTryoutQuestions([], 'full')
check('pick full: 110 soal', fullPick.questions.length, 110)
check('pick full: 30/35/45', countByMateri(fullPick.questions), {
  TWK: 30,
  TIU: 35,
  TKP: 45,
})
checkTrue(
  'pick full: 30 pertama TWK',
  fullPick.questions.slice(0, 30).every((q) => q.materi === 'TWK'),
)
checkTrue(
  'pick full: 35 berikutnya TIU',
  fullPick.questions.slice(30, 65).every((q) => q.materi === 'TIU'),
)
checkTrue(
  'pick full: 45 terakhir TKP',
  fullPick.questions.slice(65).every((q) => q.materi === 'TKP'),
)
check(
  'pick full: id unik',
  new Set(fullPick.questions.map((q) => q.id)).size,
  110,
)
check('pick full: tidak rotasi (pool cukup)', fullPick.rotated, false)

const miniPick = pickTryoutQuestions([], 'mini')
check('pick mini: 30 soal', miniPick.questions.length, 30)
check('pick mini: 10/10/10', countByMateri(miniPick.questions), {
  TWK: 10,
  TIU: 10,
  TKP: 10,
})

// Panggilan lama tanpa argumen mode tetap jalan dan menghasilkan mini.
const defaultPick = pickTryoutQuestions()
check('pick default: 30 soal (mini)', defaultPick.questions.length, 30)
check('pick default: 10/10/10', countByMateri(defaultPick.questions), {
  TWK: 10,
  TIU: 10,
  TKP: 10,
})

// Soal yang sudah dilihat dihindari bila pool baru masih cukup.
const seenIds = new Set(fullPick.questions.map((q) => q.id))
const fullPick2 = pickTryoutQuestions(seenIds, 'full')
check('pick full kedua: tetap 110 soal', fullPick2.questions.length, 110)
checkTrue(
  'pick full kedua: tidak ada soal yang sama dengan pick pertama',
  fullPick2.questions.every((q) => !seenIds.has(q.id)),
)

/* ------------------------------------------------------------------ */
/* scoreTryout mode full                                               */
/* ------------------------------------------------------------------ */

const fullSet = fakeFullSet()
const fullAllCorrect = scoreTryout(fullSet, answerAll(fullSet, 'A'), 'full')
check('skor full: mode full', fullAllCorrect.mode, 'full')
check('skor full: semua benar 150/175/225', fullAllCorrect.scores, {
  TWK: 150,
  TIU: 175,
  TKP: 225,
})
check('skor full: scaled sama dengan scores', fullAllCorrect.scaled, {
  TWK: 150,
  TIU: 175,
  TKP: 225,
})
check('skor full: total 550', fullAllCorrect.total, 550)
check('skor full: scaledTotal 550', fullAllCorrect.scaledTotal, 550)
check('skor full: lulus semua seksi', fullAllCorrect.passed, {
  TWK: true,
  TIU: true,
  TKP: true,
})
check('skor full: lulus keseluruhan', fullAllCorrect.passedOverall, true)
check('skor full: benar 30/35/45', fullAllCorrect.correct, {
  TWK: 30,
  TIU: 35,
  TKP: 45,
})

// Batas lulus persis di passing grade asli: TWK 13 benar (65),
// TIU 16 benar (80), TKP 30x5 + 6x1 = 156.
const boundaryAnswers: TryoutAnswers = {}
for (let i = 0; i < 13; i++) boundaryAnswers[`ftwk${i}`] = 'A'
for (let i = 0; i < 16; i++) boundaryAnswers[`ftiu${i}`] = 'A'
for (let i = 0; i < 30; i++) boundaryAnswers[`ftkp${i}`] = 'A'
for (let i = 30; i < 36; i++) boundaryAnswers[`ftkp${i}`] = 'E'
const fullBoundary = scoreTryout(fullSet, boundaryAnswers, 'full')
check('skor full batas: 65/80/156', fullBoundary.scores, {
  TWK: 65,
  TIU: 80,
  TKP: 156,
})
check('skor full batas: lulus semua', fullBoundary.passed, {
  TWK: true,
  TIU: true,
  TKP: true,
})
check('skor full batas: lulus keseluruhan', fullBoundary.passedOverall, true)
check('skor full batas: total 301', fullBoundary.total, 301)
check('skor full batas: scaledTotal sama', fullBoundary.scaledTotal, 301)

// Satu poin di bawah passing di tiap seksi: TWK 60, TIU 75, TKP 155.
const belowAnswers: TryoutAnswers = {}
for (let i = 0; i < 12; i++) belowAnswers[`ftwk${i}`] = 'A'
for (let i = 0; i < 15; i++) belowAnswers[`ftiu${i}`] = 'A'
for (let i = 0; i < 30; i++) belowAnswers[`ftkp${i}`] = 'A'
for (let i = 30; i < 35; i++) belowAnswers[`ftkp${i}`] = 'E'
const fullBelow = scoreTryout(fullSet, belowAnswers, 'full')
check('skor full bawah: 60/75/155', fullBelow.scores, {
  TWK: 60,
  TIU: 75,
  TKP: 155,
})
check('skor full bawah: tidak lulus semua', fullBelow.passed, {
  TWK: false,
  TIU: false,
  TKP: false,
})
check('skor full bawah: tidak lulus', fullBelow.passedOverall, false)

// Satu seksi gagal saja sudah membuat keseluruhan tidak lulus.
const oneFailAnswers: TryoutAnswers = { ...answerAll(fullSet, 'A') }
for (let i = 12; i < 30; i++) delete oneFailAnswers[`ftwk${i}`]
const fullOneFail = scoreTryout(fullSet, oneFailAnswers, 'full')
check('skor full: TWK 60 tidak lulus', fullOneFail.passed.TWK, false)
check('skor full: TIU tetap lulus', fullOneFail.passed.TIU, true)
check('skor full: TKP tetap lulus', fullOneFail.passed.TKP, true)
check('skor full: satu seksi gagal, keseluruhan gagal', fullOneFail.passedOverall, false)

// TKP fallback tanpa bobot: kunci = 5, opsi lain = 1, kosong = 0.
const tkpNoBobot = [fakeQuestion('nb1', 'TKP', 'Integritas')]
check(
  'skor TKP fallback: kunci 5',
  scoreTryout(tkpNoBobot, { nb1: 'A' }, 'full').scores.TKP,
  5,
)
check(
  'skor TKP fallback: opsi lain 1',
  scoreTryout(tkpNoBobot, { nb1: 'B' }, 'full').scores.TKP,
  1,
)
check(
  'skor TKP fallback: kosong 0',
  scoreTryout(tkpNoBobot, {}, 'full').scores.TKP,
  0,
)
check(
  'skor TKP fallback: opsi lain bukan benar',
  scoreTryout(tkpNoBobot, { nb1: 'B' }, 'full').correct?.TKP,
  0,
)

// TKP berbobot: nilai bobot dipakai, dijepit ke 1-5.
const tkpBobot = [
  fakeQuestion('b1', 'TKP', 'Integritas', { A: 9, B: 0, C: 3 }),
]
check(
  'skor TKP bobot: dijepit ke 5',
  scoreTryout(tkpBobot, { b1: 'A' }, 'full').scores.TKP,
  5,
)
check(
  'skor TKP bobot: dijepit ke 1',
  scoreTryout(tkpBobot, { b1: 'B' }, 'full').scores.TKP,
  1,
)
check(
  'skor TKP bobot: bobot 3 dipakai',
  scoreTryout(tkpBobot, { b1: 'C' }, 'full').scores.TKP,
  3,
)

// Kosong semua di simulasi: nol dan tidak lulus.
const fullEmpty = scoreTryout(fullSet, {}, 'full')
check('skor full kosong: 0/0/0', fullEmpty.scores, {
  TWK: 0,
  TIU: 0,
  TKP: 0,
})
check('skor full kosong: tidak lulus', fullEmpty.passedOverall, false)

/* ------------------------------------------------------------------ */
/* scoreTryout mode mini (perilaku lama tidak berubah)                 */
/* ------------------------------------------------------------------ */

const miniSet = fakeMiniSet()
const miniAllCorrect = scoreTryout(miniSet, answerAll(miniSet, 'A'), 'mini')
check('skor mini: mode mini', miniAllCorrect.mode, 'mini')
check('skor mini: semua benar 50/50/50', miniAllCorrect.scores, {
  TWK: 50,
  TIU: 50,
  TKP: 50,
})
check('skor mini: scaled 150/175/225', miniAllCorrect.scaled, {
  TWK: 150,
  TIU: 175,
  TKP: 225,
})
check('skor mini: total 150', miniAllCorrect.total, 150)
check('skor mini: scaledTotal 550', miniAllCorrect.scaledTotal, 550)
check('skor mini: lulus keseluruhan', miniAllCorrect.passedOverall, true)

// Tanpa argumen mode, default tetap mini.
const miniDefault = scoreTryout(miniSet, answerAll(miniSet, 'A'))
check('skor mini default: mode mini', miniDefault.mode, 'mini')
check('skor mini default: skor sama', miniDefault.scores, {
  TWK: 50,
  TIU: 50,
  TKP: 50,
})
check('skor mini default: scaled sama', miniDefault.scaled, {
  TWK: 150,
  TIU: 175,
  TKP: 225,
})

// Batas passing mini: TWK 20 gagal, 25 lulus; TIU 20 gagal, 25 lulus;
// TKP 34 gagal, 35 lulus.
const miniBoundary: TryoutAnswers = {}
for (let i = 0; i < 4; i++) miniBoundary[`mtwk${i}`] = 'A'
for (let i = 0; i < 4; i++) miniBoundary[`mtiu${i}`] = 'A'
for (let i = 0; i < 6; i++) miniBoundary[`mtkp${i}`] = 'A'
for (let i = 6; i < 10; i++) miniBoundary[`mtkp${i}`] = 'E'
const miniBelow = scoreTryout(miniSet, miniBoundary, 'mini')
check('skor mini bawah: 20/20/34', miniBelow.scores, {
  TWK: 20,
  TIU: 20,
  TKP: 34,
})
check('skor mini bawah: scaled 60/70/153', miniBelow.scaled, {
  TWK: 60,
  TIU: 70,
  TKP: 153,
})
check('skor mini bawah: tidak lulus semua', miniBelow.passed, {
  TWK: false,
  TIU: false,
  TKP: false,
})
const miniPass: TryoutAnswers = {}
for (let i = 0; i < 5; i++) miniPass[`mtwk${i}`] = 'A'
for (let i = 0; i < 5; i++) miniPass[`mtiu${i}`] = 'A'
for (let i = 0; i < 7; i++) miniPass[`mtkp${i}`] = 'A'
const miniAbove = scoreTryout(miniSet, miniPass, 'mini')
check('skor mini lulus: 25/25/35', miniAbove.scores, {
  TWK: 25,
  TIU: 25,
  TKP: 35,
})
check('skor mini lulus: lulus semua', miniAbove.passed, {
  TWK: true,
  TIU: true,
  TKP: true,
})
check('skor mini lulus: lulus keseluruhan', miniAbove.passedOverall, true)

// Skala mini memakai konstanta yang sama seperti sebelumnya.
check(
  'skor mini: skala TWK x3',
  miniBelow.scaled.TWK,
  20 * TRYOUT_SCALE_TO_ORIGINAL.TWK,
)
check(
  'skor mini: skala TIU x3.5',
  miniBelow.scaled.TIU,
  20 * TRYOUT_SCALE_TO_ORIGINAL.TIU,
)
check(
  'skor mini: skala TKP x4.5',
  miniBelow.scaled.TKP,
  34 * TRYOUT_SCALE_TO_ORIGINAL.TKP,
)

/* ------------------------------------------------------------------ */
/* scoreFromRecord (pindahan dari TryoutPage)                          */
/* ------------------------------------------------------------------ */

const fromFull = scoreFromRecord(
  record('2026-11-13T00:00:00.000Z', 65, 80, 156, true, 'full'),
)
check('fromRecord full: mode full', fromFull.mode, 'full')
check('fromRecord full: skor mentah', fromFull.scores, {
  TWK: 65,
  TIU: 80,
  TKP: 156,
})
check('fromRecord full: scaled sama', fromFull.scaled, {
  TWK: 65,
  TIU: 80,
  TKP: 156,
})
check('fromRecord full: lulus semua', fromFull.passed, {
  TWK: true,
  TIU: true,
  TKP: true,
})
check('fromRecord full: passedOverall dari rekaman', fromFull.passedOverall, true)
check('fromRecord full: total 301', fromFull.total, 301)
check('fromRecord full: scaledTotal 301', fromFull.scaledTotal, 301)

const fromFullFail = scoreFromRecord(
  record('2026-11-13T00:00:00.000Z', 60, 80, 156, false, 'full'),
)
check('fromRecord full gagal: TWK tidak lulus', fromFullFail.passed.TWK, false)
check('fromRecord full gagal: TIU lulus', fromFullFail.passed.TIU, true)
check(
  'fromRecord full gagal: passedOverall false',
  fromFullFail.passedOverall,
  false,
)
check('fromRecord full gagal: scaled mentah', fromFullFail.scaled.TWK, 60)

const fromMini = scoreFromRecord(
  record('2026-11-13T00:00:00.000Z', 22, 23, 35, true, 'mini'),
)
check('fromRecord mini: mode mini', fromMini.mode, 'mini')
check('fromRecord mini: skor mentah mini', fromMini.scores, {
  TWK: 22,
  TIU: 23,
  TKP: 35,
})
check('fromRecord mini: scaled 66/80.5/157.5', fromMini.scaled, {
  TWK: 66,
  TIU: 80.5,
  TKP: 157.5,
})
check('fromRecord mini: lulus semua (passing mini)', fromMini.passed, {
  TWK: true,
  TIU: true,
  TKP: true,
})
check('fromRecord mini: total 80', fromMini.total, 80)
check('fromRecord mini: scaledTotal 304', fromMini.scaledTotal, 304)

// Riwayat lama tanpa mode diperlakukan seperti mini.
const fromLegacy = scoreFromRecord(
  record('2026-11-13T00:00:00.000Z', 22, 23, 35, true),
)
check('fromRecord lama: mode mini', fromLegacy.mode, 'mini')
check('fromRecord lama: scaled sama dengan mini', fromLegacy.scaled, {
  TWK: 66,
  TIU: 80.5,
  TKP: 157.5,
})
check('fromRecord lama: lulus semua', fromLegacy.passed, {
  TWK: true,
  TIU: true,
  TKP: true,
})

// Breakdown benar ikut terbawa bila ada di rekaman.
const fromWithCorrect = scoreFromRecord({
  date: '2026-11-13T00:00:00.000Z',
  mode: 'full',
  twk: 100,
  tiu: 100,
  tkp: 180,
  passed: true,
  correct: { TWK: 20, TIU: 20, TKP: 36 },
})
check('fromRecord: correct terbawa', fromWithCorrect.correct, {
  TWK: 20,
  TIU: 20,
  TKP: 36,
})

/* ------------------------------------------------------------------ */
/* prediction.ts (mode-aware)                                          */
/* ------------------------------------------------------------------ */

const predFull = predictFromHistory([
  record('2026-11-10T00:00:00.000Z', 100, 100, 180, true, 'full'),
])
check('prediksi full: sumber simulasi', predFull?.source, 'simulasi')
check('prediksi full: simulasiCount 1', predFull?.simulasiCount, 1)
check('prediksi full: tryoutCount 1', predFull?.tryoutCount, 1)
check('prediksi full: TWK mentah 100', predFull?.sections.TWK.scaled, 100)
check('prediksi full: TIU mentah 100', predFull?.sections.TIU.scaled, 100)
check('prediksi full: TKP mentah 180', predFull?.sections.TKP.scaled, 180)
check('prediksi full: TWK diff 35', predFull?.sections.TWK.diff, 35)
check('prediksi full: TWK pita aman', predFull?.sections.TWK.band, 'aman')
check('prediksi full: passing asli', predFull?.sections.TWK.passing, 65)
check('prediksi full: tren null', predFull?.sections.TWK.trend, null)

const predMini = predictFromHistory([
  record('2026-11-10T00:00:00.000Z', 22, 23, 35, true, 'mini'),
])
check('prediksi mini: sumber mini', predMini?.source, 'mini')
check('prediksi mini: simulasiCount 0', predMini?.simulasiCount, 0)
check('prediksi mini: TWK terskala 66', predMini?.sections.TWK.scaled, 66)
check('prediksi mini: TIU terskala 80.5', predMini?.sections.TIU.scaled, 80.5)
check('prediksi mini: TKP terskala 157.5', predMini?.sections.TKP.scaled, 157.5)

// Riwayat lama tanpa mode tetap diskalakan seperti mini.
const predLegacy = predictFromHistory([
  record('2026-11-10T00:00:00.000Z', 22, 23, 35, true),
])
check('prediksi lama: sumber mini', predLegacy?.source, 'mini')
check('prediksi lama: simulasiCount 0', predLegacy?.simulasiCount, 0)
check('prediksi lama: TWK terskala 66', predLegacy?.sections.TWK.scaled, 66)

// Campuran mini lalu simulasi: tren membandingkan satu skala asli.
const predMixed = predictFromHistory([
  record('2026-11-08T00:00:00.000Z', 20, 20, 30, false, 'mini'),
  record('2026-11-10T00:00:00.000Z', 70, 90, 170, true, 'full'),
])
check('prediksi campur: sumber simulasi', predMixed?.source, 'simulasi')
check('prediksi campur: simulasiCount 1', predMixed?.simulasiCount, 1)
check('prediksi campur: tryoutCount 2', predMixed?.tryoutCount, 2)
check('prediksi campur: TWK terakhir mentah 70', predMixed?.sections.TWK.scaled, 70)
check('prediksi campur: tren TWK 10 (70 vs 60)', predMixed?.sections.TWK.trend, 10)
check('prediksi campur: tren TIU 20 (90 vs 70)', predMixed?.sections.TIU.trend, 20)
check('prediksi campur: tren TKP 35 (170 vs 135)', predMixed?.sections.TKP.trend, 35)
check('prediksi campur: recent TWK [60, 70]', predMixed?.sections.TWK.recent, [60, 70])

// Campuran simulasi lalu mini: sumber ikut rekaman terakhir.
const predMixed2 = predictFromHistory([
  record('2026-11-08T00:00:00.000Z', 70, 90, 170, true, 'full'),
  record('2026-11-10T00:00:00.000Z', 25, 25, 35, true, 'mini'),
])
check('prediksi campur 2: sumber mini', predMixed2?.source, 'mini')
check('prediksi campur 2: simulasiCount 1', predMixed2?.simulasiCount, 1)
check('prediksi campur 2: tren TWK 5 (75 vs 70)', predMixed2?.sections.TWK.trend, 5)
check(
  'prediksi campur 2: recent TWK [70, 75]',
  predMixed2?.sections.TWK.recent,
  [70, 75],
)

/* ------------------------------------------------------------------ */
/* Lencana baru + perbaikan Lolos Mini                                 */
/* ------------------------------------------------------------------ */

check('lencana: definisi Pejuang CAT', getBadgeDef('pejuang-cat')?.nama, 'Pejuang CAT')
check('lencana: ikon Pejuang CAT', getBadgeDef('pejuang-cat')?.ikon, '🏅')
check(
  'lencana: deskripsi Pejuang CAT',
  getBadgeDef('pejuang-cat')?.deskripsi,
  'Selesaikan satu simulasi CAT lengkap.',
)
check('lencana: definisi Lolos Simulasi', getBadgeDef('lolos-simulasi')?.nama, 'Lolos Simulasi')
check('lencana: ikon Lolos Simulasi', getBadgeDef('lolos-simulasi')?.ikon, '👑')
check(
  'lencana: deskripsi Lolos Simulasi',
  getBadgeDef('lolos-simulasi')?.deskripsi,
  'Lulus satu simulasi CAT lengkap.',
)

// Simulasi selesai tapi tidak lulus: Pejuang CAT saja.
resetStore()
recordTryout({ mode: 'full', twk: 60, tiu: 70, tkp: 150, passed: false })
check(
  'lencana: simulasi tidak lulus buka Pejuang CAT',
  checkNewBadges(getStore()).some((b) => b.id === 'pejuang-cat'),
  true,
)
check(
  'lencana: simulasi tidak lulus belum buka Lolos Simulasi',
  checkNewBadges(getStore()).some((b) => b.id === 'lolos-simulasi'),
  false,
)
check(
  'lencana: simulasi tidak lulus tidak buka Lolos Mini',
  checkNewBadges(getStore()).some((b) => b.id === 'lulus-tryout'),
  false,
)

// Simulasi lulus: Pejuang CAT + Lolos Simulasi, tapi BUKAN Lolos Mini.
resetStore()
recordTryout({ mode: 'full', twk: 100, tiu: 100, tkp: 180, passed: true })
check(
  'lencana: simulasi lulus buka Pejuang CAT',
  checkNewBadges(getStore()).some((b) => b.id === 'pejuang-cat'),
  true,
)
check(
  'lencana: simulasi lulus buka Lolos Simulasi',
  checkNewBadges(getStore()).some((b) => b.id === 'lolos-simulasi'),
  true,
)
check(
  'lencana: simulasi lulus TIDAK buka Lolos Mini',
  checkNewBadges(getStore()).some((b) => b.id === 'lulus-tryout'),
  false,
)

// Mini lulus: Lolos Mini saja, bukan lencana simulasi.
resetStore()
recordTryout({ mode: 'mini', twk: 25, tiu: 25, tkp: 40, passed: true })
check(
  'lencana: mini lulus buka Lolos Mini',
  checkNewBadges(getStore()).some((b) => b.id === 'lulus-tryout'),
  true,
)
check(
  'lencana: mini lulus tidak buka Pejuang CAT',
  checkNewBadges(getStore()).some((b) => b.id === 'pejuang-cat'),
  false,
)
check(
  'lencana: mini lulus tidak buka Lolos Simulasi',
  checkNewBadges(getStore()).some((b) => b.id === 'lolos-simulasi'),
  false,
)

// Riwayat lama (tanpa mode) yang lulus tetap membuka Lolos Mini.
resetStore()
recordTryout({ twk: 25, tiu: 25, tkp: 40, passed: true })
check(
  'lencana: riwayat lama lulus buka Lolos Mini',
  checkNewBadges(getStore()).some((b) => b.id === 'lulus-tryout'),
  true,
)

/* ------------------------------------------------------------------ */
/* Misi simulasi                                                       */
/* ------------------------------------------------------------------ */

const simulasiMission = MISSION_POOL.find((m) => m.id === 'simulasi-1')
check('misi: simulasi-1 ada di pool', simulasiMission !== undefined, true)
check('misi: kind simulasi', simulasiMission?.kind, 'simulasi')
check('misi: target 1', simulasiMission?.target, 1)
check('misi: xp 40', simulasiMission?.xp, 40)
check('misi: judul', simulasiMission?.judul, 'Selesaikan 1 simulasi CAT')
check(
  'misi: deskripsi',
  simulasiMission?.deskripsi,
  '110 soal, 100 menit. Rasain ujian beneran.',
)
check('misi: pool sekarang 10 misi', MISSION_POOL.length, 10)
check(
  'misi: misi lama tryout-1 tetap ada',
  MISSION_POOL.some((m) => m.id === 'tryout-1'),
  true,
)
check('misi: harian tetap 3 misi', getDailyMissions('2026-11-13').length, 3)

/* ------------------------------------------------------------------ */
/* completeTryout (gamifikasi mode-aware)                              */
/* ------------------------------------------------------------------ */

resetStore()
const fullScore: TryoutScore = scoreTryout(fullSet, answerAll(fullSet, 'A'), 'full')
completeTryout(fullScore)
check('gamifikasi full: XP +300', getStore().xp, 300)
check('gamifikasi full: 1 riwayat', getStore().tryoutHistory.length, 1)
check('gamifikasi full: mode tersimpan', getStore().tryoutHistory[0].mode, 'full')
check('gamifikasi full: skor tersimpan', getStore().tryoutHistory[0].twk, 150)
check('gamifikasi full: lulus tersimpan', getStore().tryoutHistory[0].passed, true)
check('gamifikasi full: jawaban benar 110', getStore().stats.correctAnswers, 110)
check(
  'gamifikasi full: Pejuang CAT terkunci',
  getStore().badges.some((b) => b.id === 'pejuang-cat'),
  true,
)
check(
  'gamifikasi full: Lolos Simulasi terkunci',
  getStore().badges.some((b) => b.id === 'lolos-simulasi'),
  true,
)
check(
  'gamifikasi full: Lolos Mini TIDAK terkunci',
  getStore().badges.some((b) => b.id === 'lulus-tryout'),
  false,
)

resetStore()
const miniScore: TryoutScore = scoreTryout(miniSet, answerAll(miniSet, 'A'), 'mini')
completeTryout(miniScore)
check('gamifikasi mini: XP +100', getStore().xp, 100)
check('gamifikasi mini: mode tersimpan', getStore().tryoutHistory[0].mode, 'mini')
check('gamifikasi mini: jawaban benar 30', getStore().stats.correctAnswers, 30)
check(
  'gamifikasi mini: Lolos Mini terkunci',
  getStore().badges.some((b) => b.id === 'lulus-tryout'),
  true,
)
check(
  'gamifikasi mini: Pejuang CAT TIDAK terkunci',
  getStore().badges.some((b) => b.id === 'pejuang-cat'),
  false,
)

/* ------------------------------------------------------------------ */
/* Ringkasan                                                           */
/* ------------------------------------------------------------------ */

console.log(`\nSimulasi CAT asersi: ${passed} lolos, ${failed} gagal`)
if (failures.length > 0) {
  for (const f of failures) console.log(`  GAGAL: ${f}`)
  process.exit(1)
}
console.log('Semua asersi lolos.')
