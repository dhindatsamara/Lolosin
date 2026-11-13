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
  /** Skor mini per seksi (maks 50). */
  scores: Record<Materi, number>
  /** Skor terskala ke nilai asli CAT. */
  scaled: Record<Materi, number>
  /** Lulus per seksi (passing grade mini). */
  passed: Record<Materi, boolean>
  /** Lulus keseluruhan: ketiga seksi lulus. */
  passedOverall: boolean
  /** Jumlah jawaban benar (TKP: opsi terbaik) per seksi. Opsional saat skor direkonstruksi dari riwayat lama. */
  correct?: Record<Materi, number>
  /** Total skor mini (maks 150). */
  total: number
  /** Total skor terskala (maks 550). */
  scaledTotal: number
}

/* ------------------------------------------------------------------ */
/* Util                                                                */
/* ------------------------------------------------------------------ */

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
 * Pilih 30 soal tryout mini: 10 TWK + 10 TIU + 10 TKP, urutan per seksi.
 * Mengutamakan soal yang belum dilihat di tiap seksi.
 */
export function pickTryoutQuestions(
  seenIds: Iterable<string> = [],
): TryoutPick {
  const seen = toSeenSet(seenIds)
  const questions: Question[] = []
  let rotated = false
  for (const materi of MATERI_LIST) {
    const pick = pickFromPool(
      getQuestions(materi),
      TRYOUT_QUESTIONS_PER_SECTION,
      seen,
    )
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

/** Nilai satu set jawaban tryout. */
export function scoreTryout(
  questions: readonly Question[],
  answers: TryoutAnswers,
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

  const scaled: Record<Materi, number> = {
    TWK: scores.TWK * TRYOUT_SCALE_TO_ORIGINAL.TWK,
    TIU: scores.TIU * TRYOUT_SCALE_TO_ORIGINAL.TIU,
    TKP: scores.TKP * TRYOUT_SCALE_TO_ORIGINAL.TKP,
  }
  const passed: Record<Materi, boolean> = {
    TWK: scores.TWK >= TRYOUT_PASSING_MINI.TWK,
    TIU: scores.TIU >= TRYOUT_PASSING_MINI.TIU,
    TKP: scores.TKP >= TRYOUT_PASSING_MINI.TKP,
  }

  return {
    scores,
    scaled,
    passed,
    passedOverall: passed.TWK && passed.TIU && passed.TKP,
    correct,
    total: scores.TWK + scores.TIU + scores.TKP,
    scaledTotal: scaled.TWK + scaled.TIU + scaled.TKP,
  }
}
