/**
 * Prediksi kelolosan (Fase 3): perkiraan peluang lolos per subtes dari
 * riwayat tryout mini. Murni hitung-hitungan, tanpa akses store.
 *
 * Skor mini per seksi (maks 50) diskalakan ke nilai CAT asli memakai
 * `TRYOUT_SCALE_TO_ORIGINAL`, lalu dibandingkan dengan passing grade
 * asli `ORIGINAL_PASSING`. Semua angka berasal dari `lib/quiz.ts`,
 * tidak ada angka passing grade atau skala yang ditulis ulang di sini.
 *
 * Label peluang memakai pita (band), bukan satu angka persen yang
 * terkesan pasti, dihitung dari selisih skor terskala terhadap
 * passing grade:
 * - 15 atau lebih di atas passing grade: "Aman, pertahankan".
 * - 0 sampai 14 di atas passing grade: "Hampir aman, sedikit lagi".
 * - 1 sampai 14 di bawah passing grade: "Butuh kejar, sudah dekat".
 * - 15 atau lebih di bawah passing grade: "Masih jauh, fokus di sini
 *   dulu".
 *
 * Ini perkiraan dari tryout mini (hanya 30 soal), bukan jaminan lolos.
 */
import type { Materi } from './questions'
import {
  ORIGINAL_MAX,
  ORIGINAL_PASSING,
  TRYOUT_SCALE_TO_ORIGINAL,
} from './quiz'
import type { TryoutRecord } from './store'

/** Ambang selisih (poin skala asli) untuk pita terluar. */
export const PREDICTION_BAND_THRESHOLD = 15

/** Jumlah tryout terakhir yang dipakai untuk tren. */
export const PREDICTION_TREND_COUNT = 3

export type PredictionBand =
  | 'aman'
  | 'hampir-aman'
  | 'butuh-kejar'
  | 'masih-jauh'

/** Label pita yang tampil di UI. */
export const PREDICTION_BAND_LABELS: Record<PredictionBand, string> = {
  aman: 'Aman, pertahankan',
  'hampir-aman': 'Hampir aman, sedikit lagi',
  'butuh-kejar': 'Butuh kejar, sudah dekat',
  'masih-jauh': 'Masih jauh, fokus di sini dulu',
}

export interface SectionPrediction {
  materi: Materi
  /** Skor terskala tryout terakhir (skala asli CAT). */
  scaled: number
  /** Skor maksimum asli CAT per seksi. */
  max: number
  /** Passing grade asli CAT. */
  passing: number
  /** Selisih skor terskala terhadap passing grade (bisa negatif). */
  diff: number
  band: PredictionBand
  /** Label pita yang tampil di UI. */
  bandLabel: string
  /**
   * Tren: selisih skor terskala tryout terakhir vs sebelumnya.
   * `null` bila baru ada 1 tryout.
   */
  trend: number | null
  /** Skor terskala maks 3 tryout terakhir, urut dari yang terlama. */
  recent: number[]
}

export interface Prediction {
  sections: Record<Materi, SectionPrediction>
  /** Jumlah tryout di riwayat. */
  tryoutCount: number
  /** Tanggal ISO tryout terakhir. */
  lastDate: string
}

/** Pita dari selisih skor terskala terhadap passing grade. */
export function bandFromDiff(diff: number): PredictionBand {
  if (diff >= PREDICTION_BAND_THRESHOLD) return 'aman'
  if (diff >= 0) return 'hampir-aman'
  if (diff > -PREDICTION_BAND_THRESHOLD) return 'butuh-kejar'
  return 'masih-jauh'
}

function scaledScore(record: TryoutRecord, materi: Materi): number {
  const mini =
    materi === 'TWK' ? record.twk : materi === 'TIU' ? record.tiu : record.tkp
  return mini * TRYOUT_SCALE_TO_ORIGINAL[materi]
}

/**
 * Prediksi kelolosan dari riwayat tryout. Mengembalikan `null` bila
 * belum pernah tryout (jangan tampilkan prediksi dari nol data).
 * Riwayat boleh dalam urutan apa pun, diurutkan berdasarkan tanggal.
 */
export function predictFromHistory(
  history: readonly TryoutRecord[],
): Prediction | null {
  if (history.length === 0) return null
  const sorted = [...history].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )
  const last = sorted[sorted.length - 1]
  const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null
  const recentRecords = sorted.slice(-PREDICTION_TREND_COUNT)

  const sections = {} as Record<Materi, SectionPrediction>
  for (const materi of ['TWK', 'TIU', 'TKP'] as const) {
    const scaled = scaledScore(last, materi)
    const diff = scaled - ORIGINAL_PASSING[materi]
    const band = bandFromDiff(diff)
    sections[materi] = {
      materi,
      scaled,
      max: ORIGINAL_MAX[materi],
      passing: ORIGINAL_PASSING[materi],
      diff,
      band,
      bandLabel: PREDICTION_BAND_LABELS[band],
      trend: previous === null ? null : scaled - scaledScore(previous, materi),
      recent: recentRecords.map((r) => scaledScore(r, materi)),
    }
  }

  return {
    sections,
    tryoutCount: history.length,
    lastDate: last.date,
  }
}
