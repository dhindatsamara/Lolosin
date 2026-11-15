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
 * lagi otomatis saat halaman leaderboard dibuka.
 */
import type { User } from '@supabase/supabase-js'
import { getCurrentUser } from './auth'
import { isSupabaseConfigured, supabase } from './supabase'
import {
  MAKASSAR_TIME_ZONE,
  shiftDate,
  todayMakassar,
  type TryoutRecord,
} from './store'

/** Key localStorage untuk skor yang gagal terkirim (terpisah dari store). */
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

function isPendingRecord(value: unknown): value is TryoutRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.date === 'string' &&
    r.mode === 'full' &&
    typeof r.twk === 'number' &&
    typeof r.tiu === 'number' &&
    typeof r.tkp === 'number' &&
    typeof r.passed === 'boolean'
  )
}

function loadPending(): TryoutRecord[] {
  try {
    const raw = localStorage.getItem(PENDING_SCORES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPendingRecord)
  } catch {
    return []
  }
}

function savePending(records: TryoutRecord[]): void {
  try {
    localStorage.setItem(PENDING_SCORES_KEY, JSON.stringify(records))
  } catch {
    // Penyimpanan penuh atau tidak tersedia: abaikan diam-diam.
  }
}

/** Masukkan record ke antrean (dedup berdasarkan tanggal selesai). */
function enqueuePending(record: TryoutRecord): void {
  const queue = loadPending()
  if (queue.some((r) => r.date === record.date)) return
  queue.push(record)
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
    enqueuePending(record)
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
      enqueuePending(record)
      return FAILED_RESULT(
        'Skormu belum kekirim, dicoba lagi otomatis nanti.',
      )
    }
    return { ok: true, status: 'sent' }
  } catch {
    enqueuePending(record)
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
  const remaining: TryoutRecord[] = []
  for (const record of pending) {
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
