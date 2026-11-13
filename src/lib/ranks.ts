/**
 * Gelar level Lolosin: tiap level punya sebutan seru berbahasa Indonesia.
 *
 * Gelar ditampilkan di samping level di dashboard, dan disebut saat
 * perayaan naik level. Di atas level 15 dipakai gelar generik yang tetap
 * menyebut levelnya, supaya selalu ada gelar baru untuk dikejar.
 */

export const RANK_TITLES: Record<number, string> = {
  1: 'Calon Pejuang',
  2: 'Pejuang Pemula',
  3: 'Pembelajar Tekun',
  4: 'Pejuang Rajin',
  5: 'Pemburu Soal',
  6: 'Penantang Ujian',
  7: 'Ksatria SKD',
  8: 'Master Materi',
  9: 'Pemburu NIP',
  10: 'Calon Abdi Negara',
  11: 'Pejuang Elite',
  12: 'Master CPNS',
  13: 'Legenda SKD',
  14: 'Penakluk CAT',
  15: 'Bintang ASN',
}

/** Level tertinggi yang punya gelar khusus. */
export const MAX_NAMED_RANK = 15

/** Gelar untuk `level` (generik di atas level 15). */
export function getRankTitle(level: number): string {
  const named = RANK_TITLES[Math.max(1, level)]
  if (named) return named
  return `Legenda Level ${level}`
}
