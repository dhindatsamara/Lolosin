/**
 * Misi harian Lolosin: 3 misi per hari, dipilih DETERMINISTIK dari
 * tanggal WITA (seed dari tanggal), jadi semua pengguna mendapat set
 * misi yang sama di hari yang sama. Set berganti tiap tengah malam WITA.
 *
 * Di hari Minggu, satu slot diisi misi Tryout Akbar (MISI_AKBAR_MINGGU,
 * bukan bagian pool rotasi) supaya misi harian selalu bisa dikerjakan:
 * Akbar hanya ada tiap Minggu 09:00-11:00 WIB, jadi misi Akbar tidak
 * boleh muncul di hari lain (v2.11; sebelumnya misi 'simulasi-1'
 * masuk rotasi harian padahal eventnya mingguan).
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
  | 'simulasi'

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
    judul: 'Baca 2 bagian materi',
    deskripsi: 'Dua bagian hari ini, besok terasa bedanya.',
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
    judul: 'Baca 1 bagian TWK',
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
    judul: 'Baca 1 bagian TKP',
    deskripsi: 'Latih karakter dan cara berpikir ASN.',
  },
  {
    id: 'tryout-1',
    kind: 'tryout',
    target: 1,
    xp: 25,
    judul: 'Selesaikan 1 Tryout Kilat',
    deskripsi: 'Rasain deg-degan Tryout Kilat 30 soal.',
  },
  {
    id: 'kilat-2',
    kind: 'tryout',
    target: 2,
    xp: 40,
    judul: 'Selesaikan 2 Tryout Kilat',
    deskripsi: 'Dua sesi Tryout Kilat 30 soal. Sehari dua kali, makin tajam.',
  },
]

/**
 * Misi Tryout Akbar, HANYA tampil di hari Minggu (bukan bagian pool
 * rotasi). Kind 'simulasi' naik saat satu tryout mode 'full' selesai
 * (lihat `completeTryout` di gamification.ts); karena mode 'full'
 * hanya bisa dimulai lewat Tryout Akbar sejak v2.11, misi ini
 * otomatis berarti "ikut Tryout Akbar".
 */
export const MISI_AKBAR_MINGGU: MissionDef = {
  id: 'akbar-minggu',
  kind: 'simulasi',
  target: 1,
  xp: 40,
  judul: 'Ikut Tryout Akbar',
  deskripsi: '110 soal bareng semua pejuang, Minggu 09:00-11:00 WIB.',
}

/**
 * Tujuan tiap jenis misi (deep-link kartu misi di dashboard):
 * drill/benar ke Latihan, baca ke Belajar (per subtes bila ada),
 * tryout kilat ke Tryout, simulasi (Akbar) ke halaman Akbar.
 */
export function missionRoute(def: MissionDef): string {
  switch (def.kind) {
    case 'drill':
    case 'drillMateri':
    case 'benar':
      return '/latihan'
    case 'baca':
      return '/belajar'
    case 'bacaMateri':
      return `/belajar?subtes=${(def.materi ?? '').toLowerCase()}`
    case 'tryout':
      return '/tryout'
    case 'simulasi':
      return '/tryout-akbar'
  }
}

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
 * yang sama selalu menghasilkan set yang sama. Di hari Minggu, misi
 * Tryout Akbar mengisi slot pertama dan 2 slot sisanya dari rotasi
 * pool (jadi total tetap 3).
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
  const picked = pool.slice(0, DAILY_MISSION_COUNT)
  // Minggu (getUTCDay 0 atas tanggal kalender): misi Akbar di slot
  // pertama. Tanggal diparse sebagai UTC murni supaya hari dalam
  // minggu tidak bergeser zona waktu.
  const [y, m, d] = date.split('-').map(Number)
  const isSunday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0
  if (isSunday) {
    return [MISI_AKBAR_MINGGU, ...picked.slice(0, DAILY_MISSION_COUNT - 1)]
  }
  return picked
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
