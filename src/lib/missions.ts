/**
 * Misi harian Lolosin: 3 misi per hari, dipilih DETERMINISTIK dari
 * tanggal WITA (seed dari tanggal), jadi semua pengguna mendapat set
 * misi yang sama di hari yang sama. Set berganti tiap tengah malam WITA.
 *
 * Progres misi disimpan di store (`missions`) dan di-reset saat tanggal
 * berganti. Reward XP diklaim manual lewat tombol klaim di dashboard
 * (lihat `claimMission` di `src/lib/gamification.ts`).
 */
import type { Materi } from './questions'
import type { MissionProgressState } from './store'

/** Jenis event yang menaikkan progres misi. */
export type MissionKind =
  | 'drill'
  | 'drillMateri'
  | 'baca'
  | 'bacaMateri'
  | 'benar'
  | 'tryout'

export interface MissionDef {
  /** Id stabil, dipakai sebagai kunci progres di store. */
  id: string
  kind: MissionKind
  /** Materi yang dituju (hanya untuk kind `drillMateri` / `bacaMateri`). */
  materi?: Materi
  /** Jumlah yang harus dicapai. */
  target: number
  /** Reward XP saat diklaim. */
  xp: number
  judul: string
  deskripsi: string
}

/** Jumlah misi yang tampil setiap hari. */
export const DAILY_MISSION_COUNT = 3

/** Pool misi yang dirotasi. */
export const MISSION_POOL: MissionDef[] = [
  {
    id: 'drill-1',
    kind: 'drill',
    target: 1,
    xp: 15,
    judul: 'Kerjakan 1 drill',
    deskripsi: 'Satu sesi drill aja, biar otak tetap panas.',
  },
  {
    id: 'baca-2',
    kind: 'baca',
    target: 2,
    xp: 20,
    judul: 'Baca 2 seksi materi',
    deskripsi: 'Dua seksi hari ini, besok terasa bedanya.',
  },
  {
    id: 'benar-10',
    kind: 'benar',
    target: 10,
    xp: 25,
    judul: 'Jawab 10 soal dengan benar',
    deskripsi: 'Sepuluh jawaban benar. Kamu bisa!',
  },
  {
    id: 'drill-tiu',
    kind: 'drillMateri',
    materi: 'TIU',
    target: 1,
    xp: 15,
    judul: 'Kerjakan 1 drill TIU',
    deskripsi: 'Asah logika dan hitung-hitunganmu.',
  },
  {
    id: 'baca-twk',
    kind: 'bacaMateri',
    materi: 'TWK',
    target: 1,
    xp: 15,
    judul: 'Baca 1 seksi TWK',
    deskripsi: 'Pancasila dan wawasan kebangsaan, gas!',
  },
  {
    id: 'benar-5',
    kind: 'benar',
    target: 5,
    xp: 15,
    judul: 'Jawab 5 soal dengan benar',
    deskripsi: 'Lima jawaban benar buat pemanasan.',
  },
  {
    id: 'drill-2',
    kind: 'drill',
    target: 2,
    xp: 25,
    judul: 'Kerjakan 2 drill',
    deskripsi: 'Dua sesi drill. Ambisius, suka!',
  },
  {
    id: 'baca-tkp',
    kind: 'bacaMateri',
    materi: 'TKP',
    target: 1,
    xp: 15,
    judul: 'Baca 1 seksi TKP',
    deskripsi: 'Latih karakter dan cara berpikir ASN.',
  },
  {
    id: 'tryout-1',
    kind: 'tryout',
    target: 1,
    xp: 25,
    judul: 'Selesaikan 1 tryout mini',
    deskripsi: 'Rasain deg-degan simulasi CAT 30 soal.',
  },
]

/** Hash FNV-1a 32-bit dari string tanggal, dipakai sebagai seed. */
function hashDate(date: string): number {
  let h = 2166136261
  for (let i = 0; i < date.length; i++) {
    h ^= date.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** PRNG kecil yang deterministik (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 3 misi untuk tanggal `YYYY-MM-DD` tertentu. Deterministik: tanggal
 * yang sama selalu menghasilkan set yang sama.
 */
export function getDailyMissions(date: string): MissionDef[] {
  const rand = mulberry32(hashDate(date))
  const pool = [...MISSION_POOL]
  // Fisher-Yates parsial: acak 3 posisi pertama saja.
  for (let i = 0; i < DAILY_MISSION_COUNT; i++) {
    const j = i + Math.floor(rand() * (pool.length - i))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }
  return pool.slice(0, DAILY_MISSION_COUNT)
}

export interface MissionStatus {
  def: MissionDef
  /** Progres tercapai hari ini (0 bila state misi sudah basi). */
  progress: number
  done: boolean
  claimed: boolean
}

/**
 * Status misi hari ini dari state store. Bila `missions.date` bukan
 * tanggal hari ini, progres dianggap kosong (reset terjadi saat event
 * berikutnya lewat `ensureMissionsToday`).
 */
export function getMissionStatuses(
  missions: MissionProgressState,
  date: string,
): MissionStatus[] {
  const fresh = missions.date === date
  return getDailyMissions(date).map((def) => {
    const progress = fresh ? (missions.progress[def.id] ?? 0) : 0
    return {
      def,
      progress,
      done: progress >= def.target,
      claimed: fresh && missions.claimed.includes(def.id),
    }
  })
}
