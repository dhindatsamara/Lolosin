/**
 * Leaderboard mingguan Lolosin (Supabase): pengiriman skor simulasi CAT,
 * antrean percobaan ulang, dan pengambilan ranking.
 *
 * Aturan main:
 * - Hanya simulasi CAT lengkap (mode 'full', 110 soal) yang masuk
 *   leaderboard. Tryout kilat (mode 'mini') tidak diranking.
 * - Email user harus sudah terkonfirmasi; skor dari user yang belum
 *   verifikasi tidak dikirim dan masuk antrean, lalu dicoba lagi
 *   otomatis setelah email terverifikasi.
 * - Satu user satu skor per minggu: skor TERBAIK yang tampil.
 * - Minggu berjalan Senin sampai Minggu, zona Asia/Makassar (WITA).
 * - Semua fungsi aman saat Supabase belum terkonfigurasi (client null):
 *   submit mengembalikan status 'not-configured', fetch mengembalikan [].
 * - Fungsi di sini tidak pernah melempar error ke pemanggil. Kegagalan
 *   dikembalikan sebagai hasil { ok: false } dengan pesan ramah.
 *
 * Skor yang gagal terkirim disimpan di localStorage key terpisah
 * `lolosin:pending-scores` (bukan key store `lolosin:v1`) lalu dicoba
 * lagi otomatis saat halaman leaderboard dibuka. Key antrean
 * di-namespace per user (v2.2.1, lihat lib/storage.ts):
 * `lolosin:pending-scores:<userId>` atau `:guest` untuk tamu, supaya
 * skor satu user tidak pernah ter-submit sebagai user lain. Sebagai
 * pertahanan tambahan, setiap entri antrean menyimpan userId
 * pemiliknya dan entri yang pemiliknya bukan user aktif dilewati
 * saat flush.
 */
import type { User } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { getCurrentUser } from './auth'
import { isSupabaseConfigured, supabase } from './supabase'
import { getScopedItem, migrateLegacyKey, setScopedItem } from './storage'
import {
  getStore,
  MAKASSAR_TIME_ZONE,
  markWeeklyWinsSeen,
  shiftDate,
  todayMakassar,
  unlockBadges,
  type TryoutRecord,
} from './store'

/**
 * Key dasar localStorage untuk skor yang gagal terkirim (terpisah dari
 * store). Key yang dipakai adalah scoped key per user
 * (`lolosin:pending-scores:<userId>` atau `:guest`); key dasar ini
 * juga key legacy pra-namespacing yang dimigrasi sekali saat load.
 */
export const PENDING_SCORES_KEY = 'lolosin:pending-scores'

/** Batas antrean skor tertunda, supaya tidak tumbuh tanpa batas. */
const PENDING_MAX = 20

/**
 * Status pengiriman skor:
 * - 'sent': skor sudah masuk leaderboard.
 * - 'failed': pengiriman gagal, skor masuk antrean percobaan ulang.
 * - 'not-logged-in': user belum login, skor masuk antrean.
 * - 'not-configured': Supabase belum terkonfigurasi.
 * - 'mini': tryout kilat, memang tidak dikirim.
 * - 'sending': pengiriman masih berjalan (status sementara di state
 *   navigasi; halaman hasil menyelesaikannya lewat getLastSubmitPromise).
 */
export type LeaderboardSubmitStatus =
  | 'sent'
  | 'failed'
  | 'not-logged-in'
  | 'not-configured'
  | 'mini'
  | 'sending'

/** Hasil satu percobaan pengiriman skor. */
export interface SubmitResult {
  ok: boolean
  status: LeaderboardSubmitStatus
  /** Pesan ramah untuk user bila pengiriman gagal. */
  error?: string
}

/** Satu baris ranking leaderboard. */
export interface LeaderboardEntry {
  rank: number
  userId: string
  username: string
  formasi: string | null
  total: number
  twk: number
  tiu: number
  tkp: number
  passed: boolean
}

/** Baris mentah dari tabel tryout_results (kolom yang kita select). */
export interface TryoutResultRow {
  user_id: string
  twk: number
  tiu: number
  tkp: number
  total: number
  passed: boolean
}

/** Baris mentah dari tabel profiles (kolom yang kita select). */
export interface ProfileRow {
  id: string
  username: string
  formasi: string | null
}

/* ------------------------------------------------------------------ */
/* Normalisasi formasi                                                 */
/* ------------------------------------------------------------------ */

/**
 * Normalisasi nama formasi untuk perbandingan: trim, huruf kecil,
 * dan spasi ganda dirapikan. "Analis Kebijakan" sama dengan
 * "analis  kebijakan".
 */
export function normalizeFormasi(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/* ------------------------------------------------------------------ */
/* Minggu (Senin awal minggu, zona Asia/Makassar)                      */
/* ------------------------------------------------------------------ */

/**
 * Senin minggu dari tanggal tersebut, format YYYY-MM-DD, zona
 * Asia/Makassar. Senin adalah awal minggu. Menerima Date atau string
 * ISO (misal record.date dari TryoutRecord).
 */
export function getMondayWITA(date: Date | string): string {
  const parsed = date instanceof Date ? date : new Date(date)
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  const iso = todayMakassar(base)
  const [y, m, d] = iso.split('-').map(Number)
  // getUTCDay: 0 = Minggu, 1 = Senin, ..., 6 = Sabtu.
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const daysSinceMonday = (dayOfWeek + 6) % 7
  return shiftDate(iso, -daysSinceMonday)
}

/** Senin minggu berjalan (Asia/Makassar). */
export function getCurrentWeekStart(): string {
  return getMondayWITA(new Date())
}

/** Senin minggu lalu (Asia/Makassar). */
export function getPreviousWeekStart(): string {
  return shiftDate(getCurrentWeekStart(), -7)
}

/* ------------------------------------------------------------------ */
/* Antrean skor tertunda (localStorage, key terpisah dari store)       */
/* ------------------------------------------------------------------ */

/**
 * Satu skor tertunda: TryoutRecord ditambah id user pemiliknya.
 * `userId` tidak ada pada antrean lama (sebelum v2.2.1); entri tanpa
 * userId dianggap milik namespace tempat antrean itu tersimpan.
 */
export interface PendingScoreRecord extends TryoutRecord {
  /** Id user Supabase pemilik skor. */
  userId?: string
}

function isPendingRecord(value: unknown): value is PendingScoreRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.date === 'string' &&
    r.mode === 'full' &&
    typeof r.twk === 'number' &&
    typeof r.tiu === 'number' &&
    typeof r.tkp === 'number' &&
    typeof r.passed === 'boolean' &&
    (r.userId === undefined || typeof r.userId === 'string')
  )
}

function loadPending(): PendingScoreRecord[] {
  try {
    // Migrasi sekali: antrean lama di key tanpa namespace pindah ke
    // namespace aktif sebelum dibaca.
    migrateLegacyKey(PENDING_SCORES_KEY)
    const raw = getScopedItem(PENDING_SCORES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPendingRecord)
  } catch {
    return []
  }
}

function savePending(records: PendingScoreRecord[]): void {
  try {
    setScopedItem(PENDING_SCORES_KEY, JSON.stringify(records))
  } catch {
    // Penyimpanan penuh atau tidak tersedia: abaikan diam-diam.
  }
}

/**
 * Masukkan record ke antrean (dedup berdasarkan tanggal selesai).
 * `userId` dicap bila pemiliknya diketahui (user yang login);
 * entri tamu atau yang pemiliknya tidak diketahui tidak dicap.
 */
function enqueuePending(record: TryoutRecord, userId?: string | null): void {
  const queue = loadPending()
  if (queue.some((r) => r.date === record.date)) return
  const entry: PendingScoreRecord =
    userId ? { ...record, userId } : { ...record }
  queue.push(entry)
  savePending(queue.slice(-PENDING_MAX))
}

/** Jumlah skor tertunda yang menunggu dikirim ulang. */
export function getPendingCount(): number {
  return loadPending().length
}

/* ------------------------------------------------------------------ */
/* Pengiriman skor                                                     */
/* ------------------------------------------------------------------ */

/** Promise pengiriman terakhir, dipakai halaman hasil untuk membaca
 *  hasil akhir dari pengiriman fire-and-forget di TryoutPage. */
let lastSubmitPromise: Promise<SubmitResult> | null = null

/** Promise pengiriman skor terakhir, atau null bila belum pernah ada. */
export function getLastSubmitPromise(): Promise<SubmitResult> | null {
  return lastSubmitPromise
}

const FAILED_RESULT = (
  error: string,
): SubmitResult => ({ ok: false, status: 'failed', error })

/**
 * Inti pengiriman satu record. Bila `knownUser` diberikan, dipakai
 * langsung (dipakai retry agar tidak memanggil getCurrentUser berulang).
 * Tidak pernah melempar error. Bila gagal, record masuk antrean.
 */
async function submitInner(
  record: TryoutRecord,
  knownUser?: User | null,
): Promise<SubmitResult> {
  if ((record.mode ?? 'mini') !== 'full') {
    return {
      ok: false,
      status: 'mini',
      error: 'Tryout kilat tidak masuk leaderboard.',
    }
  }
  if (!isSupabaseConfigured() || !supabase) {
    return {
      ok: false,
      status: 'not-configured',
      error: 'Leaderboard online belum aktif.',
    }
  }

  let user: User | null
  if (knownUser !== undefined) {
    user = knownUser
  } else {
    try {
      user = await getCurrentUser()
    } catch {
      enqueuePending(record)
      return FAILED_RESULT(
        'Skormu belum kekirim, dicoba lagi otomatis nanti.',
      )
    }
  }
  if (!user) {
    enqueuePending(record)
    return {
      ok: false,
      status: 'not-logged-in',
      error: 'Login dulu biar skormu masuk leaderboard.',
    }
  }

  // Email belum terverifikasi: jangan kirim skor. Skor masuk antrean
  // supaya bisa terkirim otomatis setelah user verifikasi email.
  // Status 'failed' dipakai supaya halaman hasil tetap menampilkan
  // pesan percobaan ulang yang sudah ada (tanpa status baru).
  if (!user.email_confirmed_at) {
    enqueuePending(record, user.id)
    return FAILED_RESULT(
      'Konfirmasi dulu emailmu biar skormu masuk leaderboard.',
    )
  }

  try {
    // Kolom total sengaja tidak dikirim: generated di database.
    const { error } = await supabase.from('tryout_results').insert({
      user_id: user.id,
      mode: 'full',
      twk: record.twk,
      tiu: record.tiu,
      tkp: record.tkp,
      passed: record.passed,
      correct_twk: record.correct?.TWK ?? null,
      correct_tiu: record.correct?.TIU ?? null,
      correct_tkp: record.correct?.TKP ?? null,
      finished_at: record.date,
      week_start: getMondayWITA(record.date),
    })
    if (error) {
      enqueuePending(record, user.id)
      return FAILED_RESULT(
        'Skormu belum kekirim, dicoba lagi otomatis nanti.',
      )
    }
    return { ok: true, status: 'sent' }
  } catch {
    enqueuePending(record, user.id)
    return FAILED_RESULT('Skormu belum kekirim, dicoba lagi otomatis nanti.')
  }
}

/**
 * Kirim satu hasil tryout ke leaderboard. Hanya mode 'full' yang
 * dikirim; mode mini langsung dikembalikan sebagai status 'mini'
 * tanpa insert. Tidak pernah melempar error. Promise-nya disimpan
 * sebagai pengiriman terakhir (lihat getLastSubmitPromise).
 */
export function submitTryoutResult(
  record: TryoutRecord,
): Promise<SubmitResult> {
  const promise = submitInner(record)
  lastSubmitPromise = promise
  return promise
}

/**
 * Coba kirim ulang semua skor tertunda. Hanya berjalan bila Supabase
 * terkonfigurasi dan user sudah login; bila tidak, tidak ada yang
 * dicoba dan antrean dibiarkan utuh. Yang berhasil dikirim dihapus
 * dari antrean, yang gagal tetap menunggu percobaan berikutnya.
 * Entri yang userId-nya bukan user aktif dilewati (tidak dicoba,
 * tetap di antrean): pertahanan supaya skor satu user tidak pernah
 * ter-submit sebagai user lain.
 */
export async function retryPendingSubmissions(): Promise<{
  sent: number
  failed: number
}> {
  const pending = loadPending()
  if (pending.length === 0) return { sent: 0, failed: 0 }
  if (!isSupabaseConfigured() || !supabase) return { sent: 0, failed: 0 }

  let user: User | null
  try {
    user = await getCurrentUser()
  } catch {
    return { sent: 0, failed: 0 }
  }
  if (!user) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  const remaining: PendingScoreRecord[] = []
  for (const record of pending) {
    // Skor milik user lain (mis. antrean legacy yang termigrasi ke
    // namespace ini): jangan pernah kirim sebagai user aktif.
    if (record.userId !== undefined && record.userId !== user.id) {
      remaining.push(record)
      continue
    }
    const result = await submitInner(record, user)
    if (result.ok) {
      sent += 1
    } else {
      failed += 1
      remaining.push(record)
    }
  }
  savePending(remaining)
  return { sent, failed }
}

/* ------------------------------------------------------------------ */
/* Pengambilan ranking                                                 */
/* ------------------------------------------------------------------ */

/**
 * Gabung baris tryout_results dengan profiles menjadi ranking: skor
 * TERBAIK per user (baris pertama per user, karena rows sudah urut
 * total desc), filter per formasi bila diminta, lalu peringkat 1..n.
 * Fungsi murni, dipakai fetchLeaderboard dan bisa diuji tanpa Supabase.
 */
export function buildLeaderboardEntries(
  rows: readonly TryoutResultRow[],
  profiles: readonly ProfileRow[],
  formasi?: string,
): LeaderboardEntry[] {
  const profileMap = new Map<string, ProfileRow>()
  for (const p of profiles) {
    profileMap.set(p.id, p)
  }
  const wanted = formasi ? normalizeFormasi(formasi) : ''
  const bestByUser = new Map<string, LeaderboardEntry>()
  for (const row of rows) {
    if (bestByUser.has(row.user_id)) continue
    const profile = profileMap.get(row.user_id)
    const entryFormasi = profile?.formasi ?? null
    if (wanted && normalizeFormasi(entryFormasi ?? '') !== wanted) continue
    bestByUser.set(row.user_id, {
      rank: 0,
      userId: row.user_id,
      username: profile?.username ?? 'Pejuang',
      formasi: entryFormasi,
      total: row.total,
      twk: row.twk,
      tiu: row.tiu,
      tkp: row.tkp,
      passed: row.passed,
    })
  }
  return [...bestByUser.values()].map((entry, i) => ({
    ...entry,
    rank: i + 1,
  }))
}

/**
 * Ranking satu minggu (skor terbaik per user, total tertinggi dulu).
 * Bila `formasi` diisi, hanya entri formasi itu yang tampil.
 * Aman saat Supabase belum terkonfigurasi: mengembalikan [].
 * Panggil isSupabaseConfigured() untuk membedakan "belum
 * terkonfigurasi" dari "belum ada data".
 */
export async function fetchLeaderboard(
  weekStart: string,
  formasi?: string,
): Promise<LeaderboardEntry[]> {
  if (!isSupabaseConfigured() || !supabase) return []
  try {
    const { data: rows, error } = await supabase
      .from('tryout_results')
      .select('user_id, twk, tiu, tkp, total, passed')
      .eq('week_start', weekStart)
      .eq('mode', 'full')
      .order('total', { ascending: false })
      .limit(500)
    if (error || !rows) return []
    const typedRows = rows as TryoutResultRow[]
    if (typedRows.length === 0) return []

    const userIds = [...new Set(typedRows.map((r) => r.user_id))]
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, formasi')
      .in('id', userIds)
    const typedProfiles =
      !profileError && profiles ? (profiles as ProfileRow[]) : []
    return buildLeaderboardEntries(typedRows, typedProfiles, formasi)
  } catch {
    return []
  }
}

/**
 * Tiga besar minggu lalu (global, skor terbaik per user). Dihitung
 * live dari tryout_results, tanpa cron atau tabel weekly_winners.
 */
export async function fetchLastWeekTop3(): Promise<LeaderboardEntry[]> {
  const entries = await fetchLeaderboard(getPreviousWeekStart())
  return entries.slice(0, 3)
}

/* ------------------------------------------------------------------ */
/* Juara mingguan: baca hadiah dari weekly_winners (v2.7, diperbaiki  */
/* v2.8 jadi code-only: premium HANYA aktif lewat redeem kode, tidak  */
/* lagi diberikan langsung saat membaca. Lencana juara mingguan       */
/* tetap diberikan saat membaca, seperti v2.7.)                       */
/* ------------------------------------------------------------------ */

/** Hadiah premium juara global per peringkat (hari). */
export function weeklyWinnerPremiumDays(rank: number): number {
  if (rank === 1) return 7
  if (rank === 2) return 5
  return 3
}

/** Satu baris kemenangan user dari tabel weekly_winners. */
export interface WeeklyWin {
  /** Senin minggu kemenangan, YYYY-MM-DD. */
  weekStart: string
  /** 'global' atau nama formasi. */
  scope: string
  /** Peringkat 1-3. */
  rank: number
  /** Skor total kemenangan. */
  total: number
  /**
   * Kode hadiah premium juara global (null untuk juara per formasi).
   * Ditebus di Profil, bagian Premium; premium aktif lewat redeem.
   */
  code: string | null
  /**
   * Tanggal kedaluwarsa premium (null untuk juara per formasi).
   * LEGACY v2.7: sejak v2.8 (migrasi 005) kolom ini selalu NULL,
   * karena premium tidak lagi diberikan langsung. Dipertahankan di
   * tipe supaya baris lama tetap terbaca; jangan dipakai untuk
   * mengaktifkan premium.
   */
  premiumUntil: string | null
}

/**
 * Kemenangan mingguan user yang login, urut minggu terbaru dulu.
 * Sengaja TANPA filter premium_until: juara per formasi punya
 * premium_until NULL (hanya badge) dan tetap harus terbaca. Aman
 * saat Supabase belum terkonfigurasi: mengembalikan [].
 */
export async function fetchMyWins(): Promise<WeeklyWin[]> {
  if (!isSupabaseConfigured() || !supabase) return []
  let user: User | null
  try {
    user = await getCurrentUser()
  } catch {
    return []
  }
  if (!user) return []
  try {
    const { data, error } = await supabase
      .from('weekly_winners')
      .select('week_start, scope, rank, total, code, premium_until')
      .eq('user_id', user.id)
      .order('week_start', { ascending: false })
    if (error || !data) return []
    const rows = data as Array<{
      week_start?: unknown
      scope?: unknown
      rank?: unknown
      total?: unknown
      code?: unknown
      premium_until?: unknown
    }>
    const wins: WeeklyWin[] = []
    for (const row of rows) {
      if (
        typeof row.week_start !== 'string' ||
        typeof row.scope !== 'string' ||
        typeof row.rank !== 'number'
      ) {
        continue
      }
      wins.push({
        weekStart: row.week_start,
        scope: row.scope,
        rank: row.rank,
        total: typeof row.total === 'number' ? row.total : 0,
        code: typeof row.code === 'string' ? row.code : null,
        premiumUntil:
          typeof row.premium_until === 'string' ? row.premium_until : null,
      })
    }
    return wins
  } catch {
    return []
  }
}

/** Kunci pelacak kemenangan yang sudah diproses: "week_start|scope". */
function winKey(win: WeeklyWin): string {
  return `${win.weekStart}|${win.scope}`
}

/**
 * Pesan gift untuk satu kemenangan. Juara global mendapat kode hadiah
 * (ditampilkan beserta tombol salin di banner, lihat App.tsx): pesan
 * ini menyebut peringkat, minggu, jumlah hari premium dari rank
 * (1 jadi 7 hari, 2 jadi 5 hari, 3 jadi 3 hari), dan mengingatkan
 * untuk cek email. Juara per formasi (tanpa kode) hanya mendapat
 * lencana. Sengaja TIDAK ada kalimat "Premium sudah aktif": sejak
 * v2.8 premium baru aktif setelah kode ditebus di Profil.
 */
function giftMessage(win: WeeklyWin): string {
  const minggu = formatWeekRange(win.weekStart)
  const scopePart = win.scope === 'global' ? '' : ` di formasi ${win.scope}`
  if (win.scope !== 'global' || !win.code) {
    return `Kamu juara ${win.rank} minggu ${minggu}${scopePart}! Lencana Juara Mingguan sudah aktif.`
  }
  const days = weeklyWinnerPremiumDays(win.rank)
  return `Kamu juara ${win.rank} minggu ${minggu}! Tebus kode hadiahmu di bawah untuk premium ${days} hari, dan cek email kamu untuk salinan kodenya.`
}

/* ------------------------------------------------------------------ */
/* Gift notice (banner hadiah yang bisa ditutup)                       */
/* ------------------------------------------------------------------ */

/** Satu pemberitahuan hadiah juara mingguan yang belum ditutup. */
export interface GiftNotice {
  /** Kunci kemenangan ("week_start|scope"). */
  id: string
  /** Pesan gift yang tampil di banner. */
  message: string
  /**
   * Kode hadiah premium juara global (null untuk juara per formasi).
   * Banner menampilkannya dengan tombol salin + CTA tebus di Profil.
   */
  code: string | null
}

const giftNotices: GiftNotice[] = []
let giftSnapshot: GiftNotice[] = []
const giftListeners = new Set<() => void>()

function refreshGiftSnapshot(): void {
  giftSnapshot = [...giftNotices]
}

function emitGiftNotices(): void {
  giftListeners.forEach((listener) => listener())
}

export function subscribeGiftNotices(listener: () => void): () => void {
  giftListeners.add(listener)
  return () => {
    giftListeners.delete(listener)
  }
}

/** Daftar gift notice yang belum ditutup (snapshot stabil untuk hook). */
export function getGiftNotices(): GiftNotice[] {
  return giftSnapshot
}

/** Hook React: gift notice yang reaktif terhadap perubahan. */
export function useGiftNotices(): GiftNotice[] {
  return useSyncExternalStore(
    subscribeGiftNotices,
    getGiftNotices,
    getGiftNotices,
  )
}

/** Tutup satu gift notice (hadiahnya tetap tersimpan). */
export function dismissGiftNotice(id: string): void {
  const index = giftNotices.findIndex((notice) => notice.id === id)
  if (index === -1) return
  giftNotices.splice(index, 1)
  refreshGiftSnapshot()
  emitGiftNotices()
}

/* ------------------------------------------------------------------ */
/* Cek kemenangan baru dan berikan hadiahnya                            */
/* ------------------------------------------------------------------ */

let checkWinsPromise: Promise<{ newWins: number }> | null = null

async function checkWeeklyWinsInner(): Promise<{ newWins: number }> {
  const wins = await fetchMyWins()
  if (wins.length === 0) return { newWins: 0 }
  const seen = new Set(getStore().seenWeeklyWins)
  const fresh = wins.filter((win) => !seen.has(winKey(win)))
  if (fresh.length === 0) return { newWins: 0 }
  // Berikan hadiah: lencana sekali untuk semua kemenangan baru,
  // lalu tandai sudah diproses supaya gift tidak muncul dua kali
  // (pemberian idempotent: unlockBadges melewati lencana yang sudah
  // dimiliki). Sejak v2.8, premium TIDAK lagi diatur dari sini:
  // premium juara hanya aktif saat user menebus kodenya di Profil
  // (redeem_code). Kode hadiah ikut dibawa di gift notice supaya
  // user bisa menyalin dan menebusnya.
  unlockBadges(['juara-mingguan'])
  markWeeklyWinsSeen(fresh.map(winKey))
  for (const win of fresh) {
    const id = winKey(win)
    if (giftNotices.some((notice) => notice.id === id)) continue
    giftNotices.push({ id, message: giftMessage(win), code: win.code })
  }
  refreshGiftSnapshot()
  emitGiftNotices()
  return { newWins: fresh.length }
}

/**
 * Cek kemenangan mingguan baru dan berikan hadiahnya (lencana
 * Juara Mingguan + gift notice berisi kode hadiah untuk juara
 * global). Premium TIDAK diberikan di sini: juara menebus kodenya
 * sendiri di Profil. Dipanggil saat login dan saat halaman
 * Peringkat dibuka. Panggilan bersamaan digabung jadi satu; tidak
 * pernah melempar error.
 */
export function checkWeeklyWins(): Promise<{ newWins: number }> {
  if (!checkWinsPromise) {
    checkWinsPromise = checkWeeklyWinsInner()
      .catch(() => ({ newWins: 0 }))
      .finally(() => {
        checkWinsPromise = null
      })
  }
  return checkWinsPromise
}

/* ------------------------------------------------------------------ */
/* Helper tampilan (client-side, tanpa query tambahan)                 */
/* ------------------------------------------------------------------ */

/** Filter entri per formasi lalu beri peringkat ulang dari 1. */
export function filterEntriesByFormasi(
  entries: readonly LeaderboardEntry[],
  formasi: string,
): LeaderboardEntry[] {
  const wanted = normalizeFormasi(formasi)
  return entries
    .filter((e) => normalizeFormasi(e.formasi ?? '') === wanted)
    .map((entry, i) => ({ ...entry, rank: i + 1 }))
}

/** Daftar formasi unik yang ada di entri, urut abjad (tampilan asli). */
export function listFormasi(entries: readonly LeaderboardEntry[]): string[] {
  const seen = new Map<string, string>()
  for (const entry of entries) {
    if (!entry.formasi) continue
    const key = normalizeFormasi(entry.formasi)
    if (!seen.has(key)) seen.set(key, entry.formasi.trim())
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'id-ID'))
}

/** Label rentang minggu, misal "10 Nov - 16 Nov 2026" (WITA). */
export function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`)
  const end = new Date(`${shiftDate(weekStart, 6)}T00:00:00Z`)
  const dayMonth = new Intl.DateTimeFormat('id-ID', {
    timeZone: MAKASSAR_TIME_ZONE,
    day: 'numeric',
    month: 'short',
  })
  const dayMonthYear = new Intl.DateTimeFormat('id-ID', {
    timeZone: MAKASSAR_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${dayMonth.format(start)} - ${dayMonthYear.format(end)}`
}
