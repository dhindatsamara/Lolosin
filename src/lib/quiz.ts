/**
 * Mesin kuis Lolosin: pemilihan soal drill & tryout, dan penskoran.
 *
 * Semua pool berasal dari `getQuestions()`. Soal tanpa kunci sudah
 * dikecualikan di lapisan itu.
 *
 * Penskoran tryout mini (30 soal, maks 50 per seksi):
 * - TWK/TIU: jawaban benar = 5 poin, salah/kosong = 0.
 * - TKP: nilai = bobot opsi (1–5). Kalau bobot tidak ada, fallback:
 *   opsi terbaik (kunci) = 5, opsi lain = 1, kosong = 0.
 *
 * Simulasi CAT lengkap (110 soal, 100 menit) memakai aturan penskoran
 * yang sama, tapi skornya sudah skala asli CAT (maks 150/175/225) dan
 * lulusnya dinilai langsung dengan passing grade asli, tanpa penskalaan.
 *
 * Passing grade mini diturunkan proporsional dari passing grade asli
 * (KepmenPANRB 406/2026: TWK 65/150, TIU 80/175, TKP 156/225):
 * - TWK: 65/150 × 50 ≈ 21,7 → 22
 * - TIU: 80/175 × 50 ≈ 22,9 → 23
 * - TKP: 156/225 × 50 ≈ 34,7 → 35
 * Lulus keseluruhan = ketiga seksi lulus.
 */
import {
  getQuestions,
  MATERI_LIST,
  type Materi,
  type Opsi,
  type Question,
} from './questions'
import type { TryoutRecord } from './store'

/* ------------------------------------------------------------------ */
/* Konstanta (diekspor agar halaman UI memakai nilai yang sama)         */
/* ------------------------------------------------------------------ */

/** Jumlah soal per seksi dalam satu tryout mini. */
export const TRYOUT_QUESTIONS_PER_SECTION = 10
/** Total soal tryout mini (10 TWK + 10 TIU + 10 TKP). */
export const TRYOUT_TOTAL_QUESTIONS = 30
/** Batas waktu tryout mini. */
export const TRYOUT_TIME_LIMIT_MINUTES = 27
export const TRYOUT_TIME_LIMIT_SECONDS = TRYOUT_TIME_LIMIT_MINUTES * 60
/** Jumlah soal per seksi dalam satu simulasi CAT lengkap. */
export const SIMULASI_QUESTIONS_PER_SECTION: Record<Materi, number> = {
  TWK: 30,
  TIU: 35,
  TKP: 45,
}
/** Total soal simulasi CAT lengkap (30 TWK + 35 TIU + 45 TKP). */
export const SIMULASI_TOTAL_QUESTIONS = 110
/** Batas waktu simulasi CAT lengkap. */
export const SIMULASI_TIME_LIMIT_MINUTES = 100
export const SIMULASI_TIME_LIMIT_SECONDS = SIMULASI_TIME_LIMIT_MINUTES * 60
/** Jumlah soal default satu sesi drill. */
export const DRILL_DEFAULT_COUNT = 10
/** Skor maksimum per seksi dalam skala mini. */
export const TRYOUT_MAX_PER_SECTION = 50
/** Passing grade mini per seksi (skala maks 50). */
export const TRYOUT_PASSING_MINI: Record<Materi, number> = {
  TWK: 22,
  TIU: 23,
  TKP: 35,
}
/** Faktor penskalaan skor mini → skor skala asli CAT. */
export const TRYOUT_SCALE_TO_ORIGINAL: Record<Materi, number> = {
  TWK: 3,
  TIU: 3.5,
  TKP: 4.5,
}
/** Passing grade asli CAT (KepmenPANRB 406/2026). */
export const ORIGINAL_PASSING: Record<Materi, number> = {
  TWK: 65,
  TIU: 80,
  TKP: 156,
}
/** Skor maksimum asli CAT per seksi. */
export const ORIGINAL_MAX: Record<Materi, number> = {
  TWK: 150,
  TIU: 175,
  TKP: 225,
}
/** Poin jawaban benar TWK/TIU. */
export const TWK_TIU_CORRECT_POINTS = 5
/** Fallback TKP tanpa bobot: opsi terbaik. */
export const TKP_FALLBACK_CORRECT = 5
/** Fallback TKP tanpa bobot: opsi lain. */
export const TKP_FALLBACK_WRONG = 1

/* ------------------------------------------------------------------ */
/* Tipe                                                                */
/* ------------------------------------------------------------------ */

/** Mode tryout: mini (30 soal) atau simulasi CAT lengkap (110 soal). */
export type TryoutMode = 'mini' | 'full'

/** Jawaban pengguna: id soal → opsi yang dipilih. */
export type TryoutAnswers = Record<string, Opsi>

export interface DrillPick {
  questions: Question[]
  /** `true` bila pool soal baru habis sehingga ada soal lama yang dirotasi. */
  rotated: boolean
}

export interface TryoutPick {
  questions: Question[]
  /** `true` bila ada seksi yang pool soal barunya habis. */
  rotated: boolean
}

export interface TryoutScore {
  /** Mode tryout: 'mini' atau simulasi lengkap 'full'. */
  mode: TryoutMode
  /** Skor per seksi: mini maks 50, simulasi maks asli (150/175/225). */
  scores: Record<Materi, number>
  /** Skor terskala ke nilai asli CAT (simulasi: sama dengan `scores`). */
  scaled: Record<Materi, number>
  /** Lulus per seksi (mini: passing grade mini, simulasi: passing asli). */
  passed: Record<Materi, boolean>
  /** Lulus keseluruhan: ketiga seksi lulus. */
  passedOverall: boolean
  /** Jumlah jawaban benar (TKP: opsi terbaik) per seksi. Opsional saat skor direkonstruksi dari riwayat lama. */
  correct?: Record<Materi, number>
  /** Total skor (mini maks 150, simulasi maks 550). */
  total: number
  /** Total skor terskala (maks 550; simulasi: sama dengan `total`). */
  scaledTotal: number
}

/* ------------------------------------------------------------------ */
/* Util                                                                */
/* ------------------------------------------------------------------ */

/** Daftar huruf opsi lengkap (A–E). */
export const OPSI_LIST: Opsi[] = ['A', 'B', 'C', 'D', 'E']

/**
 * Opsi yang punya isi (teksnya bukan kosong/whitespace), urutan huruf
 * tetap A–E. Dipakai di SATU tempat (QuestionCard) untuk menyembunyikan
 * opsi kosong di drill, ulas, dan tryout, jadi soal 4 opsi hanya
 * menampilkan 4 tombol. Ini hanya filter tampilan: huruf kunci dan
 * pemetaan bobot TKP tidak berubah.
 */
export function visibleOptions(question: Question): Opsi[] {
  return OPSI_LIST.filter((opsi) => {
    // Bank soal berisi entri pilihan null/undefined (519 soal, mis. opsi E
    // tidak ada): tanpa cek tipe, .trim() melempar dan halaman jadi blank.
    const teks = question.pilihan[opsi]
    return typeof teks === 'string' && teks.trim().length > 0
  })
}

/** Acak (Fisher–Yates), mengembalikan array baru. */
export function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

function toSeenSet(seenIds: Iterable<string>): ReadonlySet<string> {
  return seenIds instanceof Set ? seenIds : new Set(seenIds)
}

/**
 * Ambil `n` soal dari pool: utamakan yang belum dilihat; kalau soal baru
 * tidak cukup, lengkapi dengan soal lama (diacak) dan tandai `rotated`.
 */
function pickFromPool(
  pool: Question[],
  n: number,
  seen: ReadonlySet<string>,
): DrillPick {
  const unseen = shuffle(pool.filter((q) => !seen.has(q.id)))
  if (unseen.length >= n) {
    return { questions: unseen.slice(0, n), rotated: false }
  }
  const seenPool = shuffle(pool.filter((q) => seen.has(q.id)))
  return { questions: [...unseen, ...seenPool].slice(0, n), rotated: true }
}

/* ------------------------------------------------------------------ */
/* Pemilihan soal                                                      */
/* ------------------------------------------------------------------ */

/**
 * Pilih soal untuk satu sesi drill.
 * @param materi - TWK | TIU | TKP
 * @param subtopik - subtopik tertentu, atau null untuk semua subtopik
 * @param n - jumlah soal (default 10)
 * @param seenIds - id soal yang sudah pernah dilihat
 */
export function pickDrillQuestions(
  materi: Materi,
  subtopik: string | null,
  n: number = DRILL_DEFAULT_COUNT,
  seenIds: Iterable<string> = [],
): DrillPick {
  const pool = getQuestions(materi, subtopik)
  return pickFromPool(pool, n, toSeenSet(seenIds))
}

/**
 * Pilih soal tryout: mini 30 soal (10 TWK + 10 TIU + 10 TKP) atau
 * simulasi lengkap 110 soal (30 TWK + 35 TIU + 45 TKP), urutan per seksi.
 * Mengutamakan soal yang belum dilihat di tiap seksi.
 * @param mode - 'mini' (default) atau 'full'
 */
export function pickTryoutQuestions(
  seenIds: Iterable<string> = [],
  mode: TryoutMode = 'mini',
): TryoutPick {
  const seen = toSeenSet(seenIds)
  const questions: Question[] = []
  let rotated = false
  for (const materi of MATERI_LIST) {
    const n =
      mode === 'full'
        ? SIMULASI_QUESTIONS_PER_SECTION[materi]
        : TRYOUT_QUESTIONS_PER_SECTION
    const pick = pickFromPool(getQuestions(materi), n, seen)
    questions.push(...pick.questions)
    rotated = rotated || pick.rotated
  }
  return { questions, rotated }
}

/* ------------------------------------------------------------------ */
/* Penskoran                                                           */
/* ------------------------------------------------------------------ */

/** Skor satu soal untuk satu jawaban (`undefined` = tidak dijawab → 0). */
export function scoreQuestion(
  question: Question,
  answer: Opsi | undefined,
): number {
  if (answer === undefined) return 0
  if (question.materi === 'TKP') {
    const bobot = question.bobot?.[answer]
    if (typeof bobot === 'number') {
      return Math.min(5, Math.max(1, bobot))
    }
    return answer === question.kunci ? TKP_FALLBACK_CORRECT : TKP_FALLBACK_WRONG
  }
  return answer === question.kunci ? TWK_TIU_CORRECT_POINTS : 0
}

/**
 * Nilai satu set jawaban tryout.
 * - Mini (default): skor maks 50 per seksi, diskalakan ke nilai asli,
 *   lulus per seksi vs passing grade mini.
 * - Simulasi ('full'): skor sudah skala asli (maks 150/175/225),
 *   `scaled` sama dengan `scores`, lulus vs passing grade asli.
 */
export function scoreTryout(
  questions: readonly Question[],
  answers: TryoutAnswers,
  mode: TryoutMode = 'mini',
): TryoutScore {
  const scores: Record<Materi, number> = { TWK: 0, TIU: 0, TKP: 0 }
  const correct: Record<Materi, number> = { TWK: 0, TIU: 0, TKP: 0 }

  for (const q of questions) {
    const answer = answers[q.id]
    scores[q.materi] += scoreQuestion(q, answer)
    if (answer !== undefined && answer === q.kunci) {
      correct[q.materi] += 1
    }
  }

  const full = mode === 'full'
  const scaled: Record<Materi, number> = full
    ? { ...scores }
    : {
        TWK: scores.TWK * TRYOUT_SCALE_TO_ORIGINAL.TWK,
        TIU: scores.TIU * TRYOUT_SCALE_TO_ORIGINAL.TIU,
        TKP: scores.TKP * TRYOUT_SCALE_TO_ORIGINAL.TKP,
      }
  const passing = full ? ORIGINAL_PASSING : TRYOUT_PASSING_MINI
  const passed: Record<Materi, boolean> = {
    TWK: scores.TWK >= passing.TWK,
    TIU: scores.TIU >= passing.TIU,
    TKP: scores.TKP >= passing.TKP,
  }

  return {
    mode,
    scores,
    scaled,
    passed,
    passedOverall: passed.TWK && passed.TIU && passed.TKP,
    correct,
    total: scores.TWK + scores.TIU + scores.TKP,
    scaledTotal: scaled.TWK + scaled.TIU + scaled.TKP,
  }
}

/**
 * Rekonstruksi TryoutScore dari satu entri riwayat (tanpa breakdown soal).
 * Rekaman simulasi ('full') memakai skor mentah tanpa skala + passing
 * grade asli; rekaman mini atau lama (tanpa mode) diskalakan seperti dulu.
 */
export function scoreFromRecord(record: TryoutRecord): TryoutScore {
  const mode: TryoutMode = record.mode ?? 'mini'
  const full = mode === 'full'
  const scores: Record<Materi, number> = {
    TWK: record.twk,
    TIU: record.tiu,
    TKP: record.tkp,
  }
  const scaled: Record<Materi, number> = full
    ? { ...scores }
    : {
        TWK: record.twk * TRYOUT_SCALE_TO_ORIGINAL.TWK,
        TIU: record.tiu * TRYOUT_SCALE_TO_ORIGINAL.TIU,
        TKP: record.tkp * TRYOUT_SCALE_TO_ORIGINAL.TKP,
      }
  const passing = full ? ORIGINAL_PASSING : TRYOUT_PASSING_MINI
  const passed: Record<Materi, boolean> = {
    TWK: record.twk >= passing.TWK,
    TIU: record.tiu >= passing.TIU,
    TKP: record.tkp >= passing.TKP,
  }
  return {
    mode,
    scores,
    scaled,
    passed,
    passedOverall: record.passed,
    correct: record.correct,
    total: record.twk + record.tiu + record.tkp,
    scaledTotal: scaled.TWK + scaled.TIU + scaled.TKP,
  }
}
