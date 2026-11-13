/**
 * Store progres pengguna di localStorage (key `lolosin:v1`).
 *
 * Semua tanggal aktivitas memakai zona waktu Asia/Makassar (WITA),
 * diformat `YYYY-MM-DD` lewat Intl.DateTimeFormat.
 *
 * Aturan XP:
 * - +10 per jawaban benar saat drill        (XP_DRILL_CORRECT)
 * - +50 menyelesaikan satu sesi drill       (XP_DRILL_COMPLETE)
 * - +100 menyelesaikan satu tryout          (XP_TRYOUT_COMPLETE)
 * - +5 per seksi materi yang dibaca         (XP_SECTION_READ, sekali per seksi)
 *
 * Level: level = floor(sqrt(xp / 50)) + 1
 *
 * Komponen React memakai hook `useStore()` agar tampilan (mis. top bar)
 * ikut berubah saat store berubah.
 */
import { useSyncExternalStore } from 'react'

export const STORE_KEY = 'lolosin:v1'
export const MAKASSAR_TIME_ZONE = 'Asia/Makassar'

export const XP_DRILL_CORRECT = 10
export const XP_DRILL_COMPLETE = 50
export const XP_TRYOUT_COMPLETE = 100
export const XP_SECTION_READ = 5
export const LEVEL_DIVISOR = 50

export interface TryoutRecord {
  /** Timestamp ISO saat tryout selesai. */
  date: string
  /** Skor mini per seksi (maks 50). */
  twk: number
  tiu: number
  tkp: number
  /** Lulus keseluruhan (ketiga seksi melewati passing grade mini). */
  passed: boolean
  /** Jumlah jawaban benar per seksi (opsional; riwayat lama tidak punya). */
  correct?: { TWK: number; TIU: number; TKP: number }
}

export interface StoreState {
  xp: number
  streak: number
  /** Tanggal aktivitas terakhir, `YYYY-MM-DD` (Asia/Makassar) atau null. */
  lastActivityDate: string | null
  seenQuestionIds: string[]
  readSections: string[]
  tryoutHistory: TryoutRecord[]
}

function freshState(): StoreState {
  return {
    xp: 0,
    streak: 0,
    lastActivityDate: null,
    seenQuestionIds: [],
    readSections: [],
    tryoutHistory: [],
  }
}

/* ------------------------------------------------------------------ */
/* Tanggal (Asia/Makassar)                                             */
/* ------------------------------------------------------------------ */

/** Tanggal hari ini dalam format `YYYY-MM-DD` zona Asia/Makassar. */
export function todayMakassar(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MAKASSAR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** Geser tanggal ISO `YYYY-MM-DD` sejauh `days` hari. */
export function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/* ------------------------------------------------------------------ */
/* Level                                                               */
/* ------------------------------------------------------------------ */

/** level = floor(sqrt(xp / 50)) + 1 */
export function getLevel(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / LEVEL_DIVISOR)) + 1
}

/** Total XP minimum untuk mencapai `level`. */
export function xpForLevel(level: number): number {
  const l = Math.max(1, level)
  return LEVEL_DIVISOR * (l - 1) ** 2
}

/** Progres menuju level berikutnya. */
export function xpProgress(xp: number): {
  level: number
  current: number
  needed: number
} {
  const level = getLevel(xp)
  const base = xpForLevel(level)
  const next = xpForLevel(level + 1)
  return { level, current: xp - base, needed: next - base }
}

/* ------------------------------------------------------------------ */
/* Penyimpanan + reaktivitas                                            */
/* ------------------------------------------------------------------ */

let cached: StoreState | null = null
const listeners = new Set<() => void>()

function loadFromStorage(): StoreState {
  const state = freshState()
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return state
    const parsed = JSON.parse(raw) as Partial<StoreState>
    if (typeof parsed.xp === 'number') state.xp = parsed.xp
    if (typeof parsed.streak === 'number') state.streak = parsed.streak
    if (typeof parsed.lastActivityDate === 'string' || parsed.lastActivityDate === null) {
      state.lastActivityDate = parsed.lastActivityDate
    }
    if (Array.isArray(parsed.seenQuestionIds)) {
      state.seenQuestionIds = parsed.seenQuestionIds.filter(
        (id): id is string => typeof id === 'string',
      )
    }
    if (Array.isArray(parsed.readSections)) {
      state.readSections = parsed.readSections.filter(
        (id): id is string => typeof id === 'string',
      )
    }
    if (Array.isArray(parsed.tryoutHistory)) {
      state.tryoutHistory = parsed.tryoutHistory.filter(
        (r): r is TryoutRecord =>
          typeof r === 'object' &&
          r !== null &&
          typeof r.date === 'string' &&
          typeof r.twk === 'number' &&
          typeof r.tiu === 'number' &&
          typeof r.tkp === 'number' &&
          typeof r.passed === 'boolean' &&
          (r.correct === undefined ||
            (typeof r.correct === 'object' &&
              r.correct !== null &&
              typeof r.correct.TWK === 'number' &&
              typeof r.correct.TIU === 'number' &&
              typeof r.correct.TKP === 'number')),
      )
    }
  } catch {
    // localStorage tidak tersedia / data rusak: mulai dari state kosong.
  }
  return state
}

function persist(state: StoreState): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state))
  } catch {
    // Penyimpanan penuh atau tidak tersedia: abaikan diam-diam.
  }
}

function emit(): void {
  listeners.forEach((listener) => listener())
}

function update(patch: Partial<StoreState>): StoreState {
  const next: StoreState = { ...getStore(), ...patch }
  cached = next
  persist(next)
  emit()
  return next
}

/** Baca state saat ini (dari cache memori, dimuat malas dari localStorage). */
export function getStore(): StoreState {
  if (!cached) cached = loadFromStorage()
  return cached
}

export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Hook React: state store yang reaktif terhadap perubahan. */
export function useStore(): StoreState {
  return useSyncExternalStore(subscribeStore, getStore, getStore)
}

/* ------------------------------------------------------------------ */
/* Aksi                                                                */
/* ------------------------------------------------------------------ */

/** Tambah XP (nilai negatif mengurangi, tidak pernah di bawah 0). */
export function addXp(n: number): number {
  const state = getStore()
  return update({ xp: Math.max(0, state.xp + n) }).xp
}

/**
 * Catat aktivitas hari ini dan perbarui streak.
 * - Hari yang sama: streak tidak berubah.
 * - Hari baru & kemarin aktif: streak +1.
 * - Jeda lebih dari 1 hari: streak reset ke 1.
 */
export function recordActivity(date = new Date()): {
  streak: number
  isNewDay: boolean
} {
  const today = todayMakassar(date)
  const state = getStore()
  if (state.lastActivityDate === today) {
    return { streak: state.streak, isNewDay: false }
  }
  const yesterday = shiftDate(today, -1)
  const streak = state.lastActivityDate === yesterday ? state.streak + 1 : 1
  update({ streak, lastActivityDate: today })
  return { streak, isNewDay: true }
}

/** Tandai soal-soal sebagai sudah dilihat. Mengembalikan jumlah id baru. */
export function markSeen(ids: Iterable<string>): number {
  const state = getStore()
  const set = new Set(state.seenQuestionIds)
  let added = 0
  for (const id of ids) {
    if (!set.has(id)) {
      set.add(id)
      added += 1
    }
  }
  if (added > 0) update({ seenQuestionIds: [...set] })
  return added
}

/** Apakah soal ini sudah pernah dilihat? */
export function isSeen(id: string): boolean {
  return getStore().seenQuestionIds.includes(id)
}

/**
 * Tandai seksi materi sebagai sudah dibaca.
 * Mengembalikan `true` hanya saat pertama kali ditandai — XP +5
 * (`XP_SECTION_READ`) hanya diberikan sekali per seksi.
 */
export function markRead(sectionId: string): boolean {
  const state = getStore()
  if (state.readSections.includes(sectionId)) return false
  update({
    readSections: [...state.readSections, sectionId],
    xp: state.xp + XP_SECTION_READ,
  })
  return true
}

/** Simpan satu hasil tryout ke riwayat. */
export function recordTryout(
  record: Omit<TryoutRecord, 'date'> & { date?: string },
): TryoutRecord {
  const entry: TryoutRecord = {
    ...record,
    date: record.date ?? new Date().toISOString(),
  }
  const state = getStore()
  update({ tryoutHistory: [...state.tryoutHistory, entry] })
  return entry
}

/** Hapus seluruh progres (dipakai untuk debugging / reset akun). */
export function resetStore(): void {
  cached = freshState()
  persist(cached)
  emit()
}
