/**
 * Ulas soal salah (spaced repetition, Fase 3).
 *
 * Setiap jawaban drill dan tryout dicatat lewat `recordAnswer`:
 * - Soal yang dijawab salah masuk antrean ulas, jatuh tempo besok.
 * - Soal yang dijawab benar tidak masuk antrean, kecuali soal itu
 *   sudah ada di antrean: jawaban benar di drill biasa ikut dihitung
 *   sebagai satu ulasan benar (jadwalnya maju, tidak dobel catat).
 *
 * Jadwal ulas: 1, 3, 7, 14, lalu 30 hari. Jawaban benar memajukan ke
 * interval berikutnya, jawaban salah mengulang dari 1 hari. Setelah
 * 5 kali benar beruntun, soal keluar dari antrean (dianggap nempel).
 *
 * Semua tanggal memakai zona Asia/Makassar, format YYYY-MM-DD.
 * Parameter `today` di tiap fungsi opsional (default hari ini) supaya
 * logikanya gampang diuji tanpa memalsukan jam sistem.
 */
import type { Question } from './questions'
import {
  bumpTopicStat,
  getStore,
  setReviewQueue,
  shiftDate,
  todayMakassar,
  updateStats,
  type ReviewEntry,
} from './store'

/** Jadwal interval ulasan dalam hari. */
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30] as const

/** Jumlah jawaban benar beruntun sampai soal keluar antrean. */
export const REVIEW_MASTERY_STREAK = 5

/** Jumlah soal maksimal per sesi ulas. */
export const REVIEW_SESSION_MAX = 10

/** Interval berikutnya setelah `current` (mentok di interval terakhir). */
function nextInterval(current: number): number {
  const idx = REVIEW_INTERVALS.indexOf(
    current as (typeof REVIEW_INTERVALS)[number],
  )
  if (idx === -1) return REVIEW_INTERVALS[0]
  return REVIEW_INTERVALS[Math.min(idx + 1, REVIEW_INTERVALS.length - 1)]
}

/**
 * Majukan satu entri antrean setelah jawaban benar.
 * Mengembalikan entri baru, atau null bila sudah 5x benar beruntun
 * (soal keluar antrean).
 */
function advanceEntry(entry: ReviewEntry, today: string): ReviewEntry | null {
  const streakCorrect = entry.streakCorrect + 1
  if (streakCorrect >= REVIEW_MASTERY_STREAK) return null
  const intervalDays = nextInterval(entry.intervalDays)
  return {
    ...entry,
    intervalDays,
    streakCorrect,
    due: shiftDate(today, intervalDays),
  }
}

/** Reset satu entri antrean setelah jawaban salah: ulang dari 1 hari. */
function resetEntry(entry: ReviewEntry, today: string): ReviewEntry {
  return {
    ...entry,
    intervalDays: REVIEW_INTERVALS[0],
    streakCorrect: 0,
    due: shiftDate(today, REVIEW_INTERVALS[0]),
  }
}

/** Tambah hitungan ulasan benar kumulatif (syarat lencana Pantang Menyerah). */
function bumpReviewsCorrect(): void {
  const { stats } = getStore()
  updateStats({ reviewsCorrect: stats.reviewsCorrect + 1 })
}

/**
 * Catat satu jawaban yang sudah dinilai (drill atau tryout).
 * "Benar" mengikuti `scoreQuestion`: untuk TKP berarti opsi yang dipilih
 * adalah kunci (opsi terbaik). Memperbarui tally per subtopik dan antrean
 * ulas sekaligus, jadi pemanggil cukup memanggil fungsi ini saja.
 */
export function recordAnswer(
  question: Question,
  correct: boolean,
  today: string = todayMakassar(),
): void {
  bumpTopicStat(question.materi, question.subtopik, correct)
  const queue = getStore().reviewQueue
  const idx = queue.findIndex((e) => e.questionId === question.id)
  if (correct) {
    // Benar dan belum di antrean: tidak masuk antrean.
    if (idx === -1) return
    // Benar dan sudah di antrean: hitung sebagai satu ulasan benar.
    const next = advanceEntry(queue[idx], today)
    bumpReviewsCorrect()
    setReviewQueue(
      next === null
        ? queue.filter((_, i) => i !== idx)
        : queue.map((e, i) => (i === idx ? next : e)),
    )
    return
  }
  if (idx === -1) {
    setReviewQueue([
      ...queue,
      {
        questionId: question.id,
        materi: question.materi,
        subtopik: question.subtopik,
        due: shiftDate(today, REVIEW_INTERVALS[0]),
        intervalDays: REVIEW_INTERVALS[0],
        streakCorrect: 0,
      },
    ])
    return
  }
  // Salah lagi padahal sudah di antrean: jadwal mengulang dari 1 hari.
  setReviewQueue(queue.map((e, i) => (i === idx ? resetEntry(e, today) : e)))
}

/**
 * Jawab satu soal di mode ulas. Mengembalikan `true` bila soal memang
 * ada di antrean. Tally per subtopik ikut diperbarui.
 */
export function answerReview(
  questionId: string,
  correct: boolean,
  today: string = todayMakassar(),
): boolean {
  const queue = getStore().reviewQueue
  const idx = queue.findIndex((e) => e.questionId === questionId)
  if (idx === -1) return false
  const entry = queue[idx]
  bumpTopicStat(entry.materi, entry.subtopik, correct)
  if (correct) {
    const next = advanceEntry(entry, today)
    bumpReviewsCorrect()
    setReviewQueue(
      next === null
        ? queue.filter((_, i) => i !== idx)
        : queue.map((e, i) => (i === idx ? next : e)),
    )
    return true
  }
  setReviewQueue(queue.map((e, i) => (i === idx ? resetEntry(e, today) : e)))
  return true
}

/**
 * Entri antrean yang sudah jatuh tempo pada `today` (due <= today),
 * diurutkan dari yang paling lama jatuh tempo.
 */
export function dueReviews(today: string = todayMakassar()): ReviewEntry[] {
  return getStore()
    .reviewQueue.filter((e) => e.due <= today)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0))
}

/** Jumlah soal yang perlu diulas pada `today`. */
export function reviewCountDue(today: string = todayMakassar()): number {
  return dueReviews(today).length
}
