/**
 * Sinkronisasi progres ke Supabase (v2.7).
 *
 * Masalah yang diselesaikan: progres (XP, streak, misi, lencana,
 * progres baca, antrean ulas, skor game) hanya tersimpan di
 * localStorage per-browser, jadi user yang pindah browser melihat
 * progres 0 padahal browser lain punya ratusan XP. Sekarang progres
 * user yang login disalin ke tabel `user_progress` (migrasi 004) dan
 * digabung saat login, sehingga progres mengikuti akun, bukan browser.
 *
 * Key yang disinkron (map base-key ke string mentah):
 * - 'lolosin:v1' (state utama), 'lolosin:profil-avatar',
 *   'lolosin:pet-outfit', 'lolosin:kuis-kilat-best',
 *   'lolosin:kartu-kilat:v1', 'lolosin:benar-salah-best'.
 * Sengaja TIDAK disinkron: 'lolosin:profil-foto' (base64 foto,
 * terlalu besar) dan 'lolosin:pending-scores' (transien, antrean
 * kirim skor yang memang per-browser).
 *
 * Bentuk data di kolom `user_progress.data` (jsonb):
 *   { version: 1,
 *     keys: { [baseKey]: string mentah },
 *     updatedAt: { [baseKey]: epoch ms terakhir key itu ditulis } }
 * Stempel per-key dipakai aturan last-write-wins untuk key pilihan
 * tunggal (avatar, outfit). Stempel lokal disimpan di key
 * 'lolosin:sync-meta' (per user, tidak ikut disinkron).
 *
 * Aturan gabung (prinsip: progres lokal yang dibuat offline TIDAK
 * PERNAH hilang):
 * - State utama ('lolosin:v1'): digabung per field. XP ambil max,
 *   streak dari sisi dengan tanggal belajar terakhir paling baru,
 *   lencana union, progres baca union, antrean ulas union per id
 *   soal, riwayat tryout union per tanggal, statistik ambil max,
 *   misi dari hari terbaru (bila harinya sama, progres per misi
 *   ambil max dan klaim di-union). Lihat mergeStoreStates.
 * - Skor terbaik game: skor tertinggi menang (seri: tanggal terbaru).
 * - Daftar hafal Kartu Kilat: union id soal.
 * - Avatar/outfit: last-write-wins per updatedAt. Bila kedua sisi
 *   belum punya stempel (sinkron pertama di browser ini), LOKAL
 *   menang, supaya pilihan lokal tidak tertimpa data lama server.
 *
 * Alur: App memanggil startSync(userId) setelah login, setelah alur
 * "Pindahkan progres lamamu?" selesai. Sinkron awal mengambil baris
 * server, menggabung dengan lokal, menulis gabungan ke lokal, lalu
 * mengunggah gabungan (debounce 2 detik). Setelah itu, setiap
 * perubahan key yang disinkron (lewat hook subscribeScopedWrites di
 * lib/storage.ts) menjadwalkan upload debounce yang sama.
 *
 * Tamu TIDAK pernah disinkron (progres tamu in-memory saja, v2.5).
 *
 * Toleransi (seperti pola premium.ts): bila migrasi 004 belum
 * dijalankan (tabel user_progress belum ada) atau Supabase belum
 * terkonfigurasi, sync mati diam-diam ke mode lokal saja dan app
 * tetap jalan normal. Gagal jaringan saat upload tidak mematikan
 * sync: status kembali 'pending' dan upload dicoba lagi saat ada
 * perubahan berikutnya.
 */
import { useSyncExternalStore } from 'react'
import { isSupabaseConfigured, supabase } from './supabase'
import {
  getScopedItem,
  removeScopedItem,
  setScopedItem,
  subscribeScopedWrites,
} from './storage'
import {
  ACTIVITY_HISTORY_LIMIT,
  getStore,
  parseStoreState,
  reloadStore,
  STORE_KEY,
  type ReviewEntry,
  type StoreState,
  type TopicStat,
  type TryoutRecord,
} from './store'
import {
  AVATAR_VARIANTS,
  PROFILE_AVATAR_KEY,
  setProfileAvatarVariant,
  type AvatarVariantId,
} from './profile'
import {
  OUTFIT_LABELS,
  PET_OUTFIT_KEY,
  setChosenOutfit,
  type PetOutfit,
} from './pet'

/** Key dasar skor terbaik Kuis Kilat (juga diekspor KuisKilatPage). */
const KUIS_KILAT_BEST_KEY = 'lolosin:kuis-kilat-best'

/** Key dasar daftar hafal Kartu Kilat (juga diekspor KartuKilatPage). */
const KARTU_KILAT_HAFAL_KEY = 'lolosin:kartu-kilat:v1'

/** Key dasar skor terbaik Benar/Salah Kilat (juga diekspor halamannya). */
const BENAR_SALAH_BEST_KEY = 'lolosin:benar-salah-best'

/** Semua key dasar per-user yang disinkron ke server. */
export const SYNC_BASE_KEYS = [
  STORE_KEY,
  PROFILE_AVATAR_KEY,
  PET_OUTFIT_KEY,
  KUIS_KILAT_BEST_KEY,
  KARTU_KILAT_HAFAL_KEY,
  BENAR_SALAH_BEST_KEY,
] as const

/** Key yang nilainya skor terbaik {score, correct, date}: skor tertinggi menang. */
const BEST_SCORE_KEYS: ReadonlySet<string> = new Set([
  KUIS_KILAT_BEST_KEY,
  BENAR_SALAH_BEST_KEY,
])

/** Key meta stempel tulis per-key (per user, hanya lokal, tidak disinkron). */
const SYNC_META_KEY = 'lolosin:sync-meta'

/** Jeda debounce sebelum mengunggah perubahan (ms). */
const UPLOAD_DEBOUNCE_MS = 2000

/** Isi kolom `user_progress.data` (jsonb). */
interface SyncedData {
  version: 1
  keys: Record<string, string>
  updatedAt: Record<string, number>
}

/** Stempel tulis lokal per key (epoch ms). */
type SyncMeta = Record<string, number>

/**
 * Status sinkronisasi untuk indikator di Profil:
 * - 'inactive': sync tidak jalan (tamu, Supabase belum aktif, atau
 *   tabel user_progress belum ada karena migrasi 004 belum jalan).
 * - 'pending': ada perubahan lokal yang belum terunggah, atau
 *   sinkron awal belum selesai.
 * - 'synced': lokal dan server sama (upload terakhir berhasil).
 */
export type SyncStatus = 'inactive' | 'pending' | 'synced'

let status: SyncStatus = 'inactive'
const statusListeners = new Set<() => void>()

function setStatus(next: SyncStatus): void {
  if (status === next) return
  status = next
  statusListeners.forEach((listener) => listener())
}

/** Status sinkronisasi saat ini. */
export function getSyncStatus(): SyncStatus {
  return status
}

export function subscribeSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

/** Hook React: status sinkronisasi yang reaktif terhadap perubahan. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus)
}

/* ------------------------------------------------------------------ */
/* Sesi sync                                                           */
/* ------------------------------------------------------------------ */

let activeUserId: string | null = null
let started = false
/** True bila tabel user_progress terbukti belum ada: sync mati sesi ini. */
let syncDisabled = false
let unsubscribeWrites: (() => void) | null = null
let uploadTimer: ReturnType<typeof setTimeout> | null = null
let uploading = false
let uploadQueued = false
/** Nilai terakhir yang diketahui sama dengan server, per key. */
let lastUploaded: Record<string, string | null> = {}
/** Token sesi: sinkron awal yang kedaluwarsa (ganti akun/logout) dibatalkan. */
let runToken = 0

/** True bila error PostgREST menandakan tabel user_progress belum ada. */
function isTableMissingError(error: {
  code?: string
  message?: string
}): boolean {
  if (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === '42703'
  ) {
    return true
  }
  const message = (error.message ?? '').toLowerCase()
  return (
    message.includes('user_progress') &&
    (message.includes('does not exist') ||
      message.includes('not found') ||
      message.includes('could not find'))
  )
}

/** Matikan sync untuk sesi ini (tabel belum ada): mode lokal saja. */
function disableSync(): void {
  syncDisabled = true
  if (uploadTimer) {
    clearTimeout(uploadTimer)
    uploadTimer = null
  }
  if (unsubscribeWrites) {
    unsubscribeWrites()
    unsubscribeWrites = null
  }
  setStatus('inactive')
}

/**
 * Mulai sinkronisasi untuk user yang login. Idempotent: memanggil
 * ulang dengan userId yang sama tidak mengulang sinkron awal. Ganti
 * akun menghentikan sesi lama lalu memulai yang baru. Tamu (userId
 * null) tidak pernah disinkron: panggil stopSync lewat jalur ini.
 */
export function startSync(userId: string | null): void {
  if (!userId) {
    stopSync()
    return
  }
  if (syncDisabled) return
  if (!isSupabaseConfigured() || !supabase) return
  if (started && activeUserId === userId) return
  stopSync()
  activeUserId = userId
  started = true
  setStatus('pending')
  unsubscribeWrites = subscribeScopedWrites((base) => {
    if ((SYNC_BASE_KEYS as readonly string[]).includes(base)) {
      scheduleUpload()
    }
  })
  const token = ++runToken
  void initialSync(token)
}

/** Hentikan sinkronisasi (logout / ganti akun): timer dan listener dibersihkan. */
export function stopSync(): void {
  runToken += 1
  activeUserId = null
  started = false
  if (uploadTimer) {
    clearTimeout(uploadTimer)
    uploadTimer = null
  }
  uploading = false
  uploadQueued = false
  if (unsubscribeWrites) {
    unsubscribeWrites()
    unsubscribeWrites = null
  }
  lastUploaded = {}
  setStatus('inactive')
}

/* ------------------------------------------------------------------ */
/* Meta stempel tulis lokal                                            */
/* ------------------------------------------------------------------ */

function loadMeta(): SyncMeta {
  try {
    const raw = getScopedItem(SYNC_META_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const meta: SyncMeta = {}
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        meta[key] = value
      }
    }
    return meta
  } catch {
    return {}
  }
}

function saveMeta(meta: SyncMeta): void {
  try {
    setScopedItem(SYNC_META_KEY, JSON.stringify(meta))
  } catch {
    // Penyimpanan tidak tersedia: abaikan, stempel dihitung ulang nanti.
  }
}

/* ------------------------------------------------------------------ */
/* Parse data server                                                   */
/* ------------------------------------------------------------------ */

/** Validasi isi kolom data dari server; data rusak dianggap kosong. */
function parseSyncedData(raw: unknown): SyncedData | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (obj.version !== 1) return null
  const keys: Record<string, string> = {}
  if (typeof obj.keys === 'object' && obj.keys !== null) {
    for (const [key, value] of Object.entries(
      obj.keys as Record<string, unknown>,
    )) {
      if (
        typeof value === 'string' &&
        (SYNC_BASE_KEYS as readonly string[]).includes(key)
      ) {
        keys[key] = value
      }
    }
  }
  const updatedAt: Record<string, number> = {}
  if (typeof obj.updatedAt === 'object' && obj.updatedAt !== null) {
    for (const [key, value] of Object.entries(
      obj.updatedAt as Record<string, unknown>,
    )) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        updatedAt[key] = value
      }
    }
  }
  return { version: 1, keys, updatedAt }
}

/* ------------------------------------------------------------------ */
/* Gabung state utama (lolosin:v1)                                     */
/* ------------------------------------------------------------------ */

/**
 * Gabung dua state store per field, tanpa pernah menghilangkan
 * progres dari sisi mana pun. Fungsi murni (bisa diuji tanpa
 * Supabase). Aturannya:
 * - XP: max. Streak: dari sisi dengan lastActivityDate terbaru
 *   (seri: streak terbesar); streakBroken/reviveArmed mengikuti
 *   sisi yang sama, kecuali tanggalnya seri (kesempatan revive
 *   terbesar dipertahankan).
 * - seenQuestionIds, readSections, activityDates, seenWeeklyWins:
 *   union. activityDates dipotong 60 terakhir.
 * - tryoutHistory: union per tanggal selesai (bila tanggal sama,
 *   entri yang paling lengkap menang: yang punya jawaban attempt
 *   mengalahkan yang hanya punya rincian benar; kalau tidak, sisi
 *   lokal dipertahankan).
 * - badges: union per id, tanggal raih paling awal dipertahankan.
 * - missions: hari terbaru menang utuh; bila harinya sama, progres
 *   per misi ambil max dan klaim di-union.
 * - stats: angka ambil max, materiTried union.
 * - reviewQueue: union per questionId; bentrok dimenangkan entri
 *   dengan due terbaru (seri: interval lalu streakCorrect terbesar).
 * - topicStats: per subtopik, entri dengan total terbesar menang
 *   (seri: correct terbesar), supaya correct tidak pernah melebihi
 *   total pasangannya.
 * - premiumUntil: tanggal terjauh menang.
 */
export function mergeStoreStates(
  local: StoreState,
  server: StoreState,
): StoreState {
  const localDate = local.lastActivityDate ?? ''
  const serverDate = server.lastActivityDate ?? ''
  const serverNewer = serverDate > localDate
  const sameDate = localDate === serverDate

  const streak = sameDate
    ? Math.max(local.streak, server.streak)
    : serverNewer
      ? server.streak
      : local.streak

  let streakBroken: StoreState['streakBroken'] = null
  let reviveArmed = false
  if (sameDate) {
    const localLost = local.streakBroken?.lostStreak ?? 0
    const serverLost = server.streakBroken?.lostStreak ?? 0
    const side = localLost >= serverLost ? local : server
    streakBroken = side.streakBroken
    reviveArmed = side.streakBroken ? side.reviveArmed : false
  } else {
    const side = serverNewer ? server : local
    streakBroken = side.streakBroken
    reviveArmed = side.streakBroken ? side.reviveArmed : false
  }

  const tryoutByDate = new Map<string, TryoutRecord>()
  // Kelengkapan entri riwayat (v2.12.1): jawaban attempt lebih
  // berharga dari rincian benar, karena tanpanya pembahasan per
  // soal dari riwayat tidak bisa dibuka.
  const tryoutCompleteness = (r: TryoutRecord): number =>
    (r.attempt ? 2 : 0) + (r.correct ? 1 : 0)
  for (const record of [...local.tryoutHistory, ...server.tryoutHistory]) {
    const prev = tryoutByDate.get(record.date)
    if (!prev) {
      tryoutByDate.set(record.date, record)
    } else if (tryoutCompleteness(record) > tryoutCompleteness(prev)) {
      // Tanggal sama: entri yang lebih lengkap menang.
      tryoutByDate.set(record.date, record)
    }
  }
  const tryoutHistory = [...tryoutByDate.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )

  const badgeById = new Map<string, string>()
  for (const badge of [...local.badges, ...server.badges]) {
    const prev = badgeById.get(badge.id)
    if (!prev || badge.date < prev) badgeById.set(badge.id, badge.date)
  }

  const missions =
    local.missions.date === server.missions.date
      ? {
          date: local.missions.date,
          progress: mergeMissionProgress(
            local.missions.progress,
            server.missions.progress,
          ),
          claimed: [
            ...new Set([...local.missions.claimed, ...server.missions.claimed]),
          ],
        }
      : local.missions.date > server.missions.date
        ? local.missions
        : server.missions

  const reviewById = new Map<string, ReviewEntry>()
  for (const entry of [...local.reviewQueue, ...server.reviewQueue]) {
    const prev = reviewById.get(entry.questionId)
    if (!prev) {
      reviewById.set(entry.questionId, entry)
      continue
    }
    // Bentrok: due terbaru menang (tanggal ISO bisa dibandingkan
    // sebagai string); seri diputus interval lalu streakCorrect.
    const prevWins =
      prev.due > entry.due ||
      (prev.due === entry.due &&
        (prev.intervalDays > entry.intervalDays ||
          (prev.intervalDays === entry.intervalDays &&
            prev.streakCorrect >= entry.streakCorrect)))
    if (!prevWins) reviewById.set(entry.questionId, entry)
  }

  const topicStats: Record<string, TopicStat> = {}
  for (const key of new Set([
    ...Object.keys(local.topicStats),
    ...Object.keys(server.topicStats),
  ])) {
    const a = local.topicStats[key]
    const b = server.topicStats[key]
    if (!a) topicStats[key] = b!
    else if (!b) topicStats[key] = a
    else if (
      b.total > a.total ||
      (b.total === a.total && b.correct > a.correct)
    ) {
      topicStats[key] = b
    } else {
      topicStats[key] = a
    }
  }

  const localPremium = local.premiumUntil
    ? Date.parse(local.premiumUntil)
    : NaN
  const serverPremium = server.premiumUntil
    ? Date.parse(server.premiumUntil)
    : NaN
  const premiumUntil = !Number.isNaN(serverPremium) &&
    (Number.isNaN(localPremium) || serverPremium > localPremium)
    ? server.premiumUntil
    : local.premiumUntil

  return {
    xp: Math.max(local.xp, server.xp),
    streak,
    lastActivityDate:
      localDate === '' && serverDate === ''
        ? null
        : localDate >= serverDate
          ? local.lastActivityDate
          : server.lastActivityDate,
    streakBroken,
    reviveArmed,
    premiumUntil,
    seenWeeklyWins: [
      ...new Set([...local.seenWeeklyWins, ...server.seenWeeklyWins]),
    ],
    seenQuestionIds: [
      ...new Set([...local.seenQuestionIds, ...server.seenQuestionIds]),
    ],
    readSections: [
      ...new Set([...local.readSections, ...server.readSections]),
    ],
    tryoutHistory,
    activityDates: [
      ...new Set([...local.activityDates, ...server.activityDates]),
    ]
      .sort()
      .slice(-ACTIVITY_HISTORY_LIMIT),
    badges: [...badgeById.entries()].map(([id, date]) => ({ id, date })),
    missions,
    stats: {
      drillsCompleted: Math.max(
        local.stats.drillsCompleted,
        server.stats.drillsCompleted,
      ),
      drillsPerfect: Math.max(
        local.stats.drillsPerfect,
        server.stats.drillsPerfect,
      ),
      correctAnswers: Math.max(
        local.stats.correctAnswers,
        server.stats.correctAnswers,
      ),
      materiTried: [
        ...new Set([
          ...local.stats.materiTried,
          ...server.stats.materiTried,
        ]),
      ],
      reviewsCorrect: Math.max(
        local.stats.reviewsCorrect,
        server.stats.reviewsCorrect,
      ),
    },
    reviewQueue: [...reviewById.values()],
    topicStats,
  }
}

function mergeMissionProgress(
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...a }
  for (const [key, value] of Object.entries(b)) {
    merged[key] = Math.max(merged[key] ?? 0, value)
  }
  return merged
}

/* ------------------------------------------------------------------ */
/* Gabung key non-state                                                */
/* ------------------------------------------------------------------ */

/** Bentuk nilai skor terbaik game: {score, correct, date}. */
interface BestScore {
  score: number
  correct: number
  date: string
}

function parseBestScore(raw: string): BestScore | null {
  try {
    const parsed = JSON.parse(raw) as Partial<BestScore>
    if (
      typeof parsed.score !== 'number' ||
      typeof parsed.correct !== 'number' ||
      typeof parsed.date !== 'string'
    ) {
      return null
    }
    return {
      score: parsed.score,
      correct: parsed.correct,
      date: parsed.date,
    }
  } catch {
    return null
  }
}

function parseHafal(raw: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed.filter((id): id is string => typeof id === 'string'),
    )
  } catch {
    return new Set()
  }
}

/**
 * Gabung satu key non-state. Mengembalikan nilai gabung dan stempel
 * tulisnya. Bila salah satu sisi kosong, sisi yang ada menang.
 * Skor terbaik: skor tertinggi (seri: tanggal terbaru). Daftar
 * hafal: union. Avatar/outfit: last-write-wins per updatedAt; bila
 * kedua sisi belum punya stempel, lokal menang.
 */
function mergeOtherKey(
  base: string,
  localRaw: string | null,
  serverRaw: string | null,
  localTs: number,
  serverTs: number,
): { value: string | null; ts: number } {
  if (localRaw === serverRaw) {
    return { value: localRaw, ts: Math.max(localTs, serverTs) }
  }
  if (localRaw === null) return { value: serverRaw, ts: serverTs }
  if (serverRaw === null) {
    return {
      value: localRaw,
      ts: localTs > 0 ? localTs : Date.now(),
    }
  }
  if (BEST_SCORE_KEYS.has(base)) {
    const localBest = parseBestScore(localRaw)
    const serverBest = parseBestScore(serverRaw)
    if (!localBest) return { value: serverRaw, ts: serverTs }
    if (!serverBest) return { value: localRaw, ts: localTs }
    const serverWins =
      serverBest.score > localBest.score ||
      (serverBest.score === localBest.score &&
        serverBest.date > localBest.date)
    return serverWins
      ? { value: serverRaw, ts: serverTs }
      : { value: localRaw, ts: localTs }
  }
  if (base === KARTU_KILAT_HAFAL_KEY) {
    const merged = new Set([
      ...parseHafal(localRaw),
      ...parseHafal(serverRaw),
    ])
    return {
      value: JSON.stringify([...merged]),
      ts: Math.max(localTs, serverTs),
    }
  }
  // Avatar / outfit: last-write-wins; tanpa stempel, lokal menang.
  if (localTs === 0 && serverTs === 0) {
    return { value: localRaw, ts: Date.now() }
  }
  return localTs >= serverTs
    ? { value: localRaw, ts: localTs }
    : { value: serverRaw, ts: serverTs }
}

/* ------------------------------------------------------------------ */
/* Sinkron awal                                                        */
/* ------------------------------------------------------------------ */

/** Baca nilai lokal mentah semua key yang disinkron. */
function readLocalValues(): Record<string, string | null> {
  const values: Record<string, string | null> = {}
  for (const base of SYNC_BASE_KEYS) {
    values[base] = getScopedItem(base)
  }
  return values
}

/**
 * Gabung lokal dengan server untuk semua key. State utama digabung
 * per field dari store lokal (kebenaran in-memory) dan state server
 * yang sudah divalidasi; key lain lewat mergeOtherKey.
 */
function mergeAll(server: SyncedData | null): {
  values: Record<string, string | null>
  updatedAt: Record<string, number>
} {
  const meta = loadMeta()
  const values: Record<string, string | null> = {}
  const updatedAt: Record<string, number> = {}

  const localRaw = getScopedItem(STORE_KEY)
  const serverRaw = server?.keys[STORE_KEY] ?? null
  if (localRaw === serverRaw) {
    values[STORE_KEY] = localRaw
    updatedAt[STORE_KEY] = Math.max(
      meta[STORE_KEY] ?? 0,
      server?.updatedAt[STORE_KEY] ?? 0,
    )
  } else if (localRaw === null) {
    values[STORE_KEY] = serverRaw
    updatedAt[STORE_KEY] = server?.updatedAt[STORE_KEY] ?? 0
  } else if (serverRaw === null) {
    values[STORE_KEY] = localRaw
    updatedAt[STORE_KEY] =
      (meta[STORE_KEY] ?? 0) > 0 ? meta[STORE_KEY]! : Date.now()
  } else {
    const merged = mergeStoreStates(
      getStore(),
      parseStoreState(serverRaw),
    )
    values[STORE_KEY] = JSON.stringify(merged)
    updatedAt[STORE_KEY] = Date.now()
  }

  for (const base of SYNC_BASE_KEYS) {
    if (base === STORE_KEY) continue
    const merged = mergeOtherKey(
      base,
      getScopedItem(base),
      server?.keys[base] ?? null,
      meta[base] ?? 0,
      server?.updatedAt[base] ?? 0,
    )
    values[base] = merged.value
    updatedAt[base] = merged.ts
  }
  return { values, updatedAt }
}

/**
 * Terapkan nilai gabung ke penyimpanan lokal (hanya key yang berubah).
 * Avatar dan outfit ditulis lewat setter masing-masing supaya cache
 * in-memory modul itu ikut segar; state utama memicu reloadStore
 * supaya UI langsung me-render data gabungan.
 */
function applyMerged(values: Record<string, string | null>): void {
  let storeChanged = false
  for (const base of SYNC_BASE_KEYS) {
    const next = values[base] ?? null
    const current = getScopedItem(base)
    if (next === current) continue
    if (base === STORE_KEY) {
      // Hasil gabung tidak pernah null bila lokal/server ada isinya;
      // jaga-jaga: jangan pernah menghapus state lokal.
      if (next === null) continue
      setScopedItem(base, next)
      storeChanged = true
      continue
    }
    if (
      base === PROFILE_AVATAR_KEY &&
      next !== null &&
      AVATAR_VARIANTS.some((variant) => variant.id === next)
    ) {
      setProfileAvatarVariant(next as AvatarVariantId)
      continue
    }
    if (
      base === PET_OUTFIT_KEY &&
      next !== null &&
      next in OUTFIT_LABELS
    ) {
      setChosenOutfit(next as PetOutfit)
      continue
    }
    if (next === null) removeScopedItem(base)
    else setScopedItem(base, next)
  }
  if (storeChanged) reloadStore()
}

async function initialSync(token: number): Promise<void> {
  const userId = activeUserId
  if (!userId || !supabase) return
  let server: SyncedData | null = null
  try {
    const { data, error } = await supabase
      .from('user_progress')
      .select('data')
      .eq('user_id', userId)
      .maybeSingle()
    if (token !== runToken) return
    if (error) {
      if (isTableMissingError(error)) {
        disableSync()
        return
      }
      // Error lain (mis. jaringan): tetap mode lokal, upload dicoba
      // lagi saat ada perubahan berikutnya.
      setStatus('pending')
      return
    }
    server = parseSyncedData((data as { data?: unknown } | null)?.data)
  } catch {
    if (token !== runToken) return
    setStatus('pending')
    return
  }

  const merged = mergeAll(server)
  applyMerged(merged.values)
  saveMeta(merged.updatedAt)
  // Snapshot "sudah sama dengan server" = nilai server sebelum gabung,
  // supaya upload berikutnya hanya mengirim key yang berubah karena
  // kontribusi lokal (bila tidak ada, upload dilewati).
  lastUploaded = {}
  for (const base of SYNC_BASE_KEYS) {
    lastUploaded[base] = server?.keys[base] ?? null
  }
  scheduleUpload()
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

function scheduleUpload(): void {
  if (!started || syncDisabled) return
  setStatus('pending')
  if (uploadTimer) clearTimeout(uploadTimer)
  uploadTimer = setTimeout(() => {
    uploadTimer = null
    void uploadNow()
  }, UPLOAD_DEBOUNCE_MS)
}

async function uploadNow(): Promise<void> {
  if (!started || syncDisabled) return
  const userId = activeUserId
  if (!userId || !supabase) return
  if (uploading) {
    uploadQueued = true
    return
  }
  uploading = true
  try {
    const current = readLocalValues()
    const changed = SYNC_BASE_KEYS.filter(
      (base) => (current[base] ?? null) !== (lastUploaded[base] ?? null),
    )
    if (changed.length === 0) {
      setStatus('synced')
      return
    }
    const meta = loadMeta()
    const now = Date.now()
    for (const base of changed) meta[base] = now
    saveMeta(meta)
    const keys: Record<string, string> = {}
    for (const base of SYNC_BASE_KEYS) {
      const value = current[base]
      if (value !== null) keys[base] = value
    }
    const payload: SyncedData = {
      version: 1,
      keys,
      updatedAt: { ...meta },
    }
    const { error } = await supabase.from('user_progress').upsert(
      {
        user_id: userId,
        data: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    // Sesi berganti saat upload berjalan: abaikan hasilnya.
    if (!started || activeUserId !== userId) return
    if (error) {
      if (isTableMissingError(error)) {
        disableSync()
        return
      }
      setStatus('pending')
      return
    }
    lastUploaded = { ...current }
    setStatus('synced')
  } catch {
    setStatus('pending')
  } finally {
    uploading = false
    if (uploadQueued) {
      uploadQueued = false
      scheduleUpload()
    }
  }
}
