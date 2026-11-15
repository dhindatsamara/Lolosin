/**
 * Store progres pengguna di localStorage, di-namespace per user
 * (v2.2.1, lihat lib/storage.ts): login memakai key
 * `lolosin:v1:<userId>`, tamu memakai `lolosin:v1:guest`. Key lama
 * tanpa namespace (`lolosin:v1`) dimigrasi sekali ke namespace aktif
 * saat store dimuat (lihat migrateLegacyKey).
 *
 * Semua tanggal aktivitas memakai zona waktu Asia/Makassar (WITA),
 * diformat `YYYY-MM-DD` lewat Intl.DateTimeFormat.
 *
 * Aturan XP:
 * - +10 per jawaban benar saat drill        (XP_DRILL_CORRECT)
 * - +50 menyelesaikan satu sesi drill       (XP_DRILL_COMPLETE)
 * - +100 menyelesaikan satu tryout          (XP_TRYOUT_COMPLETE)
 * - +300 menyelesaikan satu simulasi CAT    (XP_SIMULASI_COMPLETE)
 * - +5 per seksi materi yang dibaca         (XP_SECTION_READ, sekali per seksi)
 *
 * Level: level = floor(sqrt(xp / 50)) + 1
 *
 * Streak putus bisa dibujuk kembali (mekanik "Bujuk Osi", v2.2.1):
 * saat store dimuat dan aktivitas terakhir sudah 2+ hari lalu,
 * streak yang putus disimpan di `streakBroken` (bukan hilang begitu
 * saja) supaya user bisa memulihkannya dengan menyelesaikan 1 drill
 * atau membaca 1 seksi materi setelah mengetuk "Bujuk Osi".
 * Lihat `normalizeStreak`, `armRevive`, dan `maybeReviveStreak`.
 *
 * Komponen React memakai hook `useStore()` agar tampilan (mis. top bar)
 * ikut berubah saat store berubah.
 */
import { useSyncExternalStore } from 'react'
import { canonicalTopicDisplay, type Materi } from './questions'
import type { TryoutMode } from './quiz'
import {
  getCurrentUserId,
  migrateLegacyKey,
  scopedKey,
  setCurrentUserId,
} from './storage'

/**
 * Key dasar store. Key yang dipakai di localStorage adalah scoped key
 * (`lolosin:v1:guest` atau `lolosin:v1:<userId>`); key dasar ini juga
 * key legacy pra-namespacing yang dimigrasi sekali saat load.
 */
export const STORE_KEY = 'lolosin:v1'
export const MAKASSAR_TIME_ZONE = 'Asia/Makassar'

export const XP_DRILL_CORRECT = 10
export const XP_DRILL_COMPLETE = 50
export const XP_TRYOUT_COMPLETE = 100
export const XP_SIMULASI_COMPLETE = 300
export const XP_SECTION_READ = 5
export const LEVEL_DIVISOR = 50

/** Riwayat tanggal aktivitas yang disimpan (maks 60 hari terakhir). */
export const ACTIVITY_HISTORY_LIMIT = 60

export interface TryoutRecord {
  /** Timestamp ISO saat tryout selesai. */
  date: string
  /** Mode tryout: 'mini' atau simulasi lengkap 'full'. Riwayat lama tidak punya (dianggap mini). */
  mode?: TryoutMode
  /** Skor per seksi: mini maks 50, simulasi maks asli (150/175/225). */
  twk: number
  tiu: number
  tkp: number
  /** Lulus keseluruhan (ketiga seksi melewati passing grade mode-nya). */
  passed: boolean
  /** Jumlah jawaban benar per seksi (opsional; riwayat lama tidak punya). */
  correct?: { TWK: number; TIU: number; TKP: number }
}

/** Satu lencana yang sudah diraih beserta tanggal raihnya. */
export interface EarnedBadge {
  /** Id lencana (lihat `BADGES` di `lib/badges.ts`). */
  id: string
  /** Tanggal diraih, `YYYY-MM-DD` (Asia/Makassar). */
  date: string
}

/** Progres misi harian. `date` menandai hari berlakunya (reset tiap hari). */
export interface MissionProgressState {
  date: string
  /** Progres tercapai per id misi. */
  progress: Record<string, number>
  /** Id misi yang reward-nya sudah diklaim. */
  claimed: string[]
}

/** Statistik kumulatif untuk syarat lencana. */
export interface GameStats {
  /** Jumlah sesi drill yang diselesaikan. */
  drillsCompleted: number
  /** Jumlah drill sempurna (semua jawaban benar). */
  drillsPerfect: number
  /** Jumlah jawaban benar (drill + tryout). */
  correctAnswers: number
  /** Materi yang pernah dicoba lewat drill atau baca: TWK/TIU/TKP. */
  materiTried: string[]
  /** Jumlah jawaban benar saat ulasan (drill biasa yang menjawab soal antrean ikut terhitung). */
  reviewsCorrect: number
}

/** Satu soal yang masuk antrean ulas (spaced repetition). */
export interface ReviewEntry {
  questionId: string
  materi: Materi
  subtopik: string
  /** Tanggal jatuh tempo ulasan, YYYY-MM-DD (Asia/Makassar). */
  due: string
  /** Interval saat ini dalam hari: 1, 3, 7, 14, atau 30. */
  intervalDays: number
  /** Jumlah jawaban benar beruntun di ulasan. */
  streakCorrect: number
}

/** Tally jawaban per subtopik: kunci gabungan "MATERI|Subtopik". */
export interface TopicStat {
  correct: number
  total: number
}

export interface StoreState {
  xp: number
  streak: number
  /** Tanggal aktivitas terakhir, `YYYY-MM-DD` (Asia/Makassar) atau null. */
  lastActivityDate: string | null
  /**
   * Streak yang putus dan masih bisa dibujuk kembali (mekanik
   * "Bujuk Osi"): angka streak sebelum putus. Null bila tidak ada
   * streak putus yang pending. Store lama tidak punya field ini
   * (default null, backward compatible).
   */
  streakBroken: { lostStreak: number } | null
  /**
   * User sudah mengetuk "Bujuk Osi" untuk kejadian putus ini.
   * Hanya bermakna bila `streakBroken` tidak null; tanpa broken
   * state yang pending, field ini dinormalisasi ke false.
   */
  reviveArmed: boolean
  seenQuestionIds: string[]
  readSections: string[]
  tryoutHistory: TryoutRecord[]
  /** Tanggal-tanggal aktivitas, `YYYY-MM-DD`, maks 60 terakhir. */
  activityDates: string[]
  /** Lencana yang sudah diraih. */
  badges: EarnedBadge[]
  /** Progres misi harian. */
  missions: MissionProgressState
  /** Statistik kumulatif gamifikasi. */
  stats: GameStats
  /** Antrean ulas soal yang pernah salah (Fase 3). */
  reviewQueue: ReviewEntry[]
  /** Tally benar/total per subtopik (Fase 3). */
  topicStats: Record<string, TopicStat>
}

function freshState(): StoreState {
  return {
    xp: 0,
    streak: 0,
    lastActivityDate: null,
    streakBroken: null,
    reviveArmed: false,
    seenQuestionIds: [],
    readSections: [],
    tryoutHistory: [],
    activityDates: [],
    badges: [],
    missions: { date: '', progress: {}, claimed: [] },
    stats: {
      drillsCompleted: 0,
      drillsPerfect: 0,
      correctAnswers: 0,
      materiTried: [],
      reviewsCorrect: 0,
    },
    reviewQueue: [],
    topicStats: {},
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
    // Migrasi sekali: progres lama di key tanpa namespace pindah ke
    // namespace aktif (user yang login atau tamu) sebelum dibaca.
    migrateLegacyKey(STORE_KEY)
    const raw = localStorage.getItem(scopedKey(STORE_KEY))
    if (!raw) return state
    const parsed = JSON.parse(raw) as Partial<StoreState>
    if (typeof parsed.xp === 'number') state.xp = parsed.xp
    if (typeof parsed.streak === 'number') state.streak = parsed.streak
    if (typeof parsed.lastActivityDate === 'string' || parsed.lastActivityDate === null) {
      state.lastActivityDate = parsed.lastActivityDate
    }
    if (
      typeof parsed.streakBroken === 'object' &&
      parsed.streakBroken !== null &&
      typeof parsed.streakBroken.lostStreak === 'number' &&
      parsed.streakBroken.lostStreak > 0
    ) {
      state.streakBroken = {
        lostStreak: Math.floor(parsed.streakBroken.lostStreak),
      }
    }
    if (parsed.reviveArmed === true) state.reviveArmed = true
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
          (r.mode === undefined || r.mode === 'mini' || r.mode === 'full') &&
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
    if (Array.isArray(parsed.activityDates)) {
      state.activityDates = parsed.activityDates
        .filter((d): d is string => typeof d === 'string')
        .slice(-ACTIVITY_HISTORY_LIMIT)
    }
    if (Array.isArray(parsed.badges)) {
      state.badges = parsed.badges.filter(
        (b): b is EarnedBadge =>
          typeof b === 'object' &&
          b !== null &&
          typeof b.id === 'string' &&
          typeof b.date === 'string',
      )
    }
    if (
      typeof parsed.missions === 'object' &&
      parsed.missions !== null
    ) {
      const m = parsed.missions
      if (typeof m.date === 'string') state.missions.date = m.date
      if (typeof m.progress === 'object' && m.progress !== null) {
        const progress: Record<string, number> = {}
        for (const [k, v] of Object.entries(m.progress)) {
          if (typeof v === 'number') progress[k] = v
        }
        state.missions.progress = progress
      }
      if (Array.isArray(m.claimed)) {
        state.missions.claimed = m.claimed.filter(
          (id): id is string => typeof id === 'string',
        )
      }
    }
    if (typeof parsed.stats === 'object' && parsed.stats !== null) {
      const s = parsed.stats
      if (typeof s.drillsCompleted === 'number') {
        state.stats.drillsCompleted = s.drillsCompleted
      }
      if (typeof s.drillsPerfect === 'number') {
        state.stats.drillsPerfect = s.drillsPerfect
      }
      if (typeof s.correctAnswers === 'number') {
        state.stats.correctAnswers = s.correctAnswers
      }
      if (typeof s.reviewsCorrect === 'number') {
        state.stats.reviewsCorrect = s.reviewsCorrect
      }
      if (Array.isArray(s.materiTried)) {
        state.stats.materiTried = s.materiTried.filter(
          (m): m is string => typeof m === 'string',
        )
      }
    }
    if (Array.isArray(parsed.reviewQueue)) {
      state.reviewQueue = parsed.reviewQueue.filter(
        (e): e is ReviewEntry =>
          typeof e === 'object' &&
          e !== null &&
          typeof e.questionId === 'string' &&
          (e.materi === 'TWK' || e.materi === 'TIU' || e.materi === 'TKP') &&
          typeof e.subtopik === 'string' &&
          typeof e.due === 'string' &&
          typeof e.intervalDays === 'number' &&
          typeof e.streakCorrect === 'number',
      )
    }
    if (
      typeof parsed.topicStats === 'object' &&
      parsed.topicStats !== null
    ) {
      const topicStats: Record<string, TopicStat> = {}
      for (const [k, v] of Object.entries(parsed.topicStats)) {
        if (
          typeof v === 'object' &&
          v !== null &&
          typeof v.correct === 'number' &&
          typeof v.total === 'number'
        ) {
          topicStats[k] = { correct: v.correct, total: v.total }
        }
      }
      state.topicStats = topicStats
    }
  } catch {
    // localStorage tidak tersedia / data rusak: mulai dari state kosong.
  }
  return state
}

function persist(state: StoreState): void {
  try {
    localStorage.setItem(scopedKey(STORE_KEY), JSON.stringify(state))
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

/**
 * Normalisasi streak saat store dimuat (mekanik "Bujuk Osi").
 * Bila aktivitas terakhir sudah 2+ hari lalu (lebih lama dari kemarin)
 * dan streak masih lebih dari 0, streak dianggap putus: angkanya
 * disimpan di `streakBroken` supaya masih bisa dibujuk kembali, lalu
 * streak direset ke 0. Hanya berjalan pada transisi: broken state yang
 * sudah pending tidak pernah ditimpa, dan user baru dengan streak 0
 * tidak mendapat broken state. Mengembalikan true bila state berubah.
 */
function normalizeStreak(state: StoreState): boolean {
  let changed = false
  // reviveArmed tanpa broken state yang pending tidak valid: matikan.
  if (state.reviveArmed && !state.streakBroken) {
    state.reviveArmed = false
    changed = true
  }
  if (
    !state.streakBroken &&
    state.streak > 0 &&
    state.lastActivityDate !== null
  ) {
    const yesterday = shiftDate(todayMakassar(), -1)
    if (state.lastActivityDate < yesterday) {
      state.streakBroken = { lostStreak: state.streak }
      state.streak = 0
      changed = true
    }
  }
  return changed
}

/** Baca state saat ini (dari cache memori, dimuat malas dari localStorage). */
export function getStore(): StoreState {
  if (!cached) {
    cached = loadFromStorage()
    // Normalisasi streak putus jalan sekali saat load; simpan bila berubah.
    if (normalizeStreak(cached)) persist(cached)
  }
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

/**
 * Ganti namespace progres aktif saat user berubah (login, logout,
 * ganti akun). Dipanggil dari App lewat efek yang memantau auth user.
 * Cache memori dibersihkan supaya load berikutnya membaca namespace
 * baru, lalu semua listener useStore diberi tahu agar UI (header
 * XP/streak, dashboard) langsung me-render data user yang baru tanpa
 * reload. Bila userId sama dengan yang aktif, tidak ngapa-ngapain
 * (menutupi event refresh token Supabase yang mengirim user yang sama).
 */
export function setStoreUserId(userId: string | null): void {
  if (getCurrentUserId() === userId) return
  setCurrentUserId(userId)
  cached = null
  emit()
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
 * Hari ini juga dicatat di `activityDates` (maks 60 hari terakhir,
 * tanpa duplikat) untuk tampilan streak mingguan.
 *
 * Bila ada streak putus yang pending (mekanik "Bujuk Osi") dan user
 * belum membujuk, aktivitas ini menghabiskan kesempatan: broken state
 * dibersihkan dan streak mulai dari 1. Bila user sudah membujuk,
 * broken state dibiarkan supaya `maybeReviveStreak` di akhir drill
 * atau baca seksi bisa memulihkan streak.
 */
export function recordActivity(date = new Date()): {
  streak: number
  isNewDay: boolean
} {
  const today = todayMakassar(date)
  const state = getStore()
  if (state.lastActivityDate === today) {
    // State lama bisa belum punya hari ini di activityDates: lengkapi.
    if (!state.activityDates.includes(today)) {
      update({
        activityDates: [...state.activityDates, today].slice(
          -ACTIVITY_HISTORY_LIMIT,
        ),
      })
    }
    return { streak: state.streak, isNewDay: false }
  }
  const yesterday = shiftDate(today, -1)
  const streak = state.lastActivityDate === yesterday ? state.streak + 1 : 1
  const consumeBreak = state.streakBroken !== null && !state.reviveArmed
  update({
    streak,
    lastActivityDate: today,
    activityDates: [...state.activityDates, today].slice(
      -ACTIVITY_HISTORY_LIMIT,
    ),
    ...(consumeBreak ? { streakBroken: null, reviveArmed: false } : {}),
  })
  return { streak, isNewDay: true }
}

/**
 * Persenjatai revive ("Bujuk Osi"): hanya berlaku bila ada streak
 * putus yang masih pending. Mengembalikan true bila revive berhasil
 * dipersenjatai (atau sudah dipersenjatai sebelumnya).
 */
export function armRevive(): boolean {
  const state = getStore()
  if (!state.streakBroken) return false
  if (state.reviveArmed) return true
  update({ reviveArmed: true })
  return true
}

/**
 * Pulihkan streak putus bila revive sudah dipersenjatai ("Bujuk Osi").
 * Dipanggil dari `completeDrill` dan `completeSectionRead` di
 * `lib/gamification.ts` saat user menyelesaikan 1 sesi drill atau
 * selesai membaca 1 seksi materi. Bila berhasil: streak kembali ke
 * angka sebelum putus, hari ini ditandai aktif, dan broken state
 * beserta flag armed dibersihkan (satu revive per kejadian putus,
 * tidak bisa di-farm). Bila tidak ada broken state pending atau
 * revive belum dipersenjatai, tidak melakukan apa-apa.
 */
export function maybeReviveStreak(): { revived: boolean; streak: number } {
  const state = getStore()
  const broken = state.streakBroken
  if (!broken || !state.reviveArmed) {
    return { revived: false, streak: state.streak }
  }
  const today = todayMakassar()
  const activityDates = state.activityDates.includes(today)
    ? state.activityDates
    : [...state.activityDates, today].slice(-ACTIVITY_HISTORY_LIMIT)
  const next = update({
    streak: broken.lostStreak,
    lastActivityDate: today,
    activityDates,
    streakBroken: null,
    reviveArmed: false,
  })
  return { revived: true, streak: next.streak }
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
 * Mengembalikan `true` hanya saat pertama kali ditandai. XP +5
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

/** Perbarui sebagian statistik gamifikasi. */
export function updateStats(patch: Partial<GameStats>): GameStats {
  const state = getStore()
  return update({ stats: { ...state.stats, ...patch } }).stats
}

/** Ganti seluruh antrean ulas (dipakai `lib/review.ts`). */
export function setReviewQueue(queue: ReviewEntry[]): ReviewEntry[] {
  return update({ reviewQueue: queue }).reviewQueue
}

/**
 * Tambah satu hasil jawaban ke tally per subtopik. Kunci gabungan
 * "MATERI|Subtopik", dipanggil dari pencatatan jawaban (drill, tryout,
 * dan ulasan) supaya ketiganya terhitung. Subtopik dikanonisasi dulu
 * (tanpa peduli huruf) supaya varian ejaan ("Analogi Verbal" vs
 * "analogi verbal") tidak memecah tally menjadi dua kunci.
 */
export function bumpTopicStat(
  materi: Materi,
  subtopik: string,
  correct: boolean,
): void {
  const state = getStore()
  const key = `${materi}|${canonicalTopicDisplay(materi, subtopik)}`
  const prev = state.topicStats[key] ?? { correct: 0, total: 0 }
  update({
    topicStats: {
      ...state.topicStats,
      [key]: {
        correct: prev.correct + (correct ? 1 : 0),
        total: prev.total + 1,
      },
    },
  })
}

/**
 * Tandai lencana-lencana sebagai diraih hari ini.
 * Mengembalikan id yang baru ditambahkan (yang sudah dimiliki dilewati).
 */
export function unlockBadges(ids: string[]): string[] {
  const state = getStore()
  const owned = new Set(state.badges.map((b) => b.id))
  const added = ids.filter((id) => !owned.has(id))
  if (added.length === 0) return []
  const today = todayMakassar()
  update({
    badges: [
      ...state.badges,
      ...added.map((id) => ({ id, date: today })),
    ],
  })
  return added
}

/** Perbarui sebagian progres misi harian. */
export function updateMissions(
  patch: Partial<MissionProgressState>,
): MissionProgressState {
  const state = getStore()
  return update({ missions: { ...state.missions, ...patch } }).missions
}

/** Hapus seluruh progres (dipakai untuk debugging / reset akun). */
export function resetStore(): void {
  cached = freshState()
  persist(cached)
  emit()
}
