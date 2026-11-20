/**
 * Lencana pencapaian Lolosin.
 *
 * Tiap lencana punya syarat unlock yang dicek dari state store
 * (lihat `checkNewBadges`). Pengecekan hanya dilakukan di titik-titik
 * aktivitas (selesai drill, selesai tryout, tandai baca, aktivitas
 * harian, klaim misi) lewat `src/lib/gamification.ts`, bukan di render.
 *
 * Pengecualian: `juara-mingguan` (lencana ke-14) TIDAK bisa dicek dari
 * state lokal, karena juaranya ditentukan server. Syaratnya selalu
 * false di sini; pemberiannya dipicu dari hasil baca
 * `weekly_winners` lewat `checkWeeklyWins` di `lib/leaderboard.ts`.
 */
import type { StoreState } from './store'

export interface BadgeDef {
  /** Id stabil, disimpan di store saat lencana diraih. */
  id: string
  nama: string
  /** Syarat unlock, ditulis dengan nada santai. */
  deskripsi: string
  /** Ikon emoji yang tampil di showcase. */
  ikon: string
  /** `true` bila syarat sudah terpenuhi di `state`. */
  check: (state: StoreState) => boolean
}

export const BADGES: BadgeDef[] = [
  {
    id: 'langkah-pertama',
    nama: 'Langkah Pertama',
    deskripsi: 'Selesaikan drill pertamamu.',
    ikon: '🚀',
    check: (s) => s.stats.drillsCompleted >= 1,
  },
  {
    id: 'penantang-tryout',
    nama: 'Penantang Tryout',
    deskripsi: 'Selesaikan tryout pertamamu.',
    ikon: '🏆',
    check: (s) => s.tryoutHistory.length >= 1,
  },
  {
    id: 'konsisten-7',
    nama: 'Seminggu Konsisten',
    deskripsi: 'Belajar 7 hari berturut-turut.',
    ikon: '🔥',
    check: (s) => s.streak >= 7,
  },
  {
    id: 'pemburu-100',
    nama: 'Pemburu 100',
    deskripsi: 'Jawab 100 soal dengan benar.',
    ikon: '🎯',
    check: (s) => s.stats.correctAnswers >= 100,
  },
  {
    id: 'sempurna',
    nama: 'Tanpa Cela',
    deskripsi: 'Drill sempurna, 10 dari 10 benar.',
    ikon: '💎',
    check: (s) => s.stats.drillsPerfect >= 1,
  },
  {
    id: 'lulus-tryout',
    nama: 'Lolos Kilat',
    deskripsi: 'Lulus satu Tryout Kilat.',
    ikon: '🎓',
    check: (s) => s.tryoutHistory.some((r) => r.passed && r.mode !== 'full'),
  },
  {
    id: 'penjelajah',
    nama: 'Penjelajah SKD',
    deskripsi: 'Coba ketiga materi: TWK, TIU, dan TKP.',
    ikon: '🗺️',
    check: (s) =>
      ['TWK', 'TIU', 'TKP'].every((m) => s.stats.materiTried.includes(m)),
  },
  {
    id: 'kutu-buku',
    nama: 'Kutu Buku',
    deskripsi: 'Baca 50 bagian materi.',
    ikon: '📚',
    check: (s) => s.readSections.length >= 50,
  },
  {
    id: 'api-abadi',
    nama: 'Api Abadi',
    deskripsi: 'Belajar 30 hari berturut-turut.',
    ikon: '🌋',
    check: (s) => s.streak >= 30,
  },
  {
    id: 'seribu-xp',
    nama: 'Ribuan XP',
    deskripsi: 'Kumpulkan 1.000 XP.',
    ikon: '⭐',
    check: (s) => s.xp >= 1000,
  },
  {
    id: 'pantang-menyerah',
    nama: 'Pantang Menyerah',
    deskripsi: 'Jawab 10 ulasan dengan benar.',
    ikon: '💪',
    check: (s) => s.stats.reviewsCorrect >= 10,
  },
  {
    id: 'pejuang-cat',
    nama: 'Pejuang CAT',
    deskripsi: 'Selesaikan satu Tryout Akbar.',
    ikon: '🏅',
    check: (s) => s.tryoutHistory.some((r) => r.mode === 'full'),
  },
  {
    id: 'lolos-simulasi',
    nama: 'Lolos Simulasi',
    deskripsi: 'Lulus satu Tryout Akbar.',
    ikon: '👑',
    check: (s) =>
      s.tryoutHistory.some((r) => r.mode === 'full' && r.passed),
  },
  {
    id: 'juara-mingguan',
    nama: 'Juara Mingguan',
    deskripsi: 'Jadi juara 1-3 mingguan di leaderboard.',
    ikon: '🥇',
    // Diberikan server lewat weekly_winners, bukan dari state lokal.
    check: () => false,
  },
]

/** Cari definisi lencana berdasarkan id. */
export function getBadgeDef(id: string): BadgeDef | undefined {
  return BADGES.find((b) => b.id === id)
}

/**
 * Lencana yang syaratnya sudah terpenuhi tapi belum pernah diraih.
 * Dipanggil hanya di titik-titik aktivitas, bukan di render.
 */
export function checkNewBadges(state: StoreState): BadgeDef[] {
  const owned = new Set(state.badges.map((b) => b.id))
  return BADGES.filter((badge) => !owned.has(badge.id) && badge.check(state))
}
