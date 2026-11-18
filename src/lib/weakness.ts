/**
 * Peta kelemahan (v2.8, fitur Premium): model tampil di atas akurasi
 * per subtopik dari lib/plan.ts (tally topicStats di store, sudah
 * mencakup drill, tryout, dan ulasan).
 *
 * Level akurasi: lemah di bawah 50%, cukup 50% sampai di bawah 75%,
 * kuat 75% ke atas. Subtopik dengan jawaban di bawah
 * WEAKEST_MIN_ANSWERS ditandai datanya masih sedikit, supaya user
 * tidak salah baca dari sampel kecil.
 */
import {
  allTopicAccuraciesFromStats,
  WEAKEST_MIN_ANSWERS,
  type TopicAccuracy,
} from './plan'
import { getStore, type TopicStat } from './store'

/** Batas bawah akurasi "cukup" (0,5) dan "kuat" (0,75). */
export const WEAKNESS_ENOUGH = 0.5
export const WEAKNESS_STRONG = 0.75

/** Level penguasaan satu subtopik. */
export type WeaknessLevel = 'lemah' | 'cukup' | 'kuat'

/** Satu baris peta kelemahan: akurasi + level + penanda sampel kecil. */
export interface WeaknessRow extends TopicAccuracy {
  level: WeaknessLevel
  /** True bila total jawaban di bawah minimum (datanya masih sedikit). */
  sampleSmall: boolean
}

/** Level dari akurasi 0 sampai 1. */
export function levelOf(accuracy: number): WeaknessLevel {
  if (accuracy < WEAKNESS_ENOUGH) return 'lemah'
  if (accuracy < WEAKNESS_STRONG) return 'cukup'
  return 'kuat'
}

/** Label level yang tampil di UI. */
export const WEAKNESS_LEVEL_LABEL: Record<WeaknessLevel, string> = {
  lemah: 'Perlu diasah',
  cukup: 'Lumayan',
  kuat: 'Kuat',
}

/**
 * Semua baris peta kelemahan dari tally yang diberikan, paling lemah
 * dulu (urutan dari allTopicAccuraciesFromStats). Baris kosong
 * berarti belum ada data latihan sama sekali.
 */
export function weaknessRowsFromStats(
  stats: Record<string, TopicStat>,
): WeaknessRow[] {
  return allTopicAccuraciesFromStats(stats).map((row) => ({
    ...row,
    level: levelOf(row.accuracy),
    sampleSmall: row.total < WEAKEST_MIN_ANSWERS,
  }))
}

/** Semua baris peta kelemahan dari store, paling lemah dulu. */
export function weaknessRows(): WeaknessRow[] {
  return weaknessRowsFromStats(getStore().topicStats)
}

/**
 * Area terlemah: baris pertama dengan data yang cukup (min 5
 * jawaban). Bila semua baris sampelnya masih kecil, baris pertama
 * tetap dipakai supaya sorotan tidak kosong, dan komponen penampil
 * menandai datanya masih sedikit.
 */
export function weakestRow(rows: readonly WeaknessRow[]): WeaknessRow | null {
  if (rows.length === 0) return null
  return rows.find((row) => !row.sampleSmall) ?? rows[0]
}

/** Subtopik level lemah saja, untuk tombol latihan yang disarankan. */
export function weakRows(rows: readonly WeaknessRow[]): WeaknessRow[] {
  return rows.filter((row) => row.level === 'lemah')
}
