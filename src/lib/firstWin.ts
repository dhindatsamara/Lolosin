/**
 * Loop try, register, share (v2.8): kartu perayaan kemenangan
 * pertama. Kemenangan pertama adalah drill pertama yang mencapai
 * skor minimal 70% ATAU tryout pertama yang selesai (mini atau
 * full). Kartu hanya tampil sekali per user, lalu ditandai sudah
 * dirayakan.
 *
 * Penanda memakai key per-user lewat storage.ts (pola yang sama
 * seperti antrean skor pending): user login tersimpan di
 * localStorage, tamu hanya di memori sesi berjalan.
 *
 * Catatan kejujuran: untuk tryout, "pertama" bisa dicek pasti dari
 * panjang riwayat tryout. Untuk drill, store tidak menyimpan skor
 * tiap drill lama, jadi syaratnya hanya "drill ini >= 70% dan belum
 * pernah dirayakan": drill pertama yang mencapai 70% adalah
 * kemenangan pertama user itu.
 */
import { LOLOSIN_URL } from './share'
import { getScopedItem, setScopedItem } from './storage'
import type { Materi } from './questions'
import type { TryoutMode } from './quiz'

/** Skor minimum drill supaya dihitung kemenangan (70%). */
export const DRILL_WIN_MIN_SCORE = 0.7

/** Key dasar penanda kemenangan pertama sudah dirayakan. */
export const FIRST_WIN_CELEBRATED_KEY = 'lolosin:first-win-celebrated'

/** True bila kemenangan pertama user ini sudah pernah dirayakan. */
export function hasCelebratedFirstWin(): boolean {
  return getScopedItem(FIRST_WIN_CELEBRATED_KEY) === '1'
}

/** Tandai kemenangan pertama sudah dirayakan (sekali saja). */
export function markFirstWinCelebrated(): void {
  setScopedItem(FIRST_WIN_CELEBRATED_KEY, '1')
}

/** True bila skor drill ini memenuhi syarat kemenangan pertama. */
export function isDrillWin(correct: number, total: number): boolean {
  if (total <= 0) return false
  return correct / total >= DRILL_WIN_MIN_SCORE
}

/** Teks berbagi hasil drill (dipakai jalur berbagi teks share.ts). */
export function drillShareText(
  materi: Materi,
  correct: number,
  total: number,
): string {
  return (
    `Aku baru selesai drill ${materi} di Lolosin, ${correct} dari ` +
    `${total} jawaban benar! Yuk latihan CPNS bareng: ${LOLOSIN_URL}`
  )
}

/**
 * Teks berbagi hasil tryout. Mini memakai total mini (/150),
 * simulasi CAT memakai total asli (/550).
 */
export function tryoutShareText(mode: TryoutMode, total: number): string {
  if (mode === 'full') {
    return (
      `Aku baru selesai simulasi CAT di Lolosin dengan total ` +
      `${total}/550! Yuk coba juga: ${LOLOSIN_URL}`
    )
  }
  return (
    `Aku baru selesai tryout kilat di Lolosin dengan total ` +
    `${total}/150! Yuk coba juga: ${LOLOSIN_URL}`
  )
}
