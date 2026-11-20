/**
 * Helper panel admin Lolosin (v2.14).
 *
 * - getAdminStatus: cek apakah user ini admin (kolom
 *   profiles.is_admin, migrasi 009). Toleran bila kolom belum ada:
 *   hasilnya columnMissing, bukan crash. Pengecekan ini HANYA untuk
 *   tampilan; penegakan sesungguhnya ada di Edge Function
 *   admin-actions yang mengecek is_admin di sisi server.
 * - callAdminAction: panggil Edge Function admin-actions dengan
 *   JWT user yang login (lewat supabase.functions.invoke).
 * - currentWeekMondayMakassar: Senin minggu berjalan zona
 *   Asia/Makassar (YYYY-MM-DD), dipakai modul Statistik.
 *
 * Semua fungsi aman saat Supabase belum terkonfigurasi dan tidak
 * pernah melempar error: kegagalan dikembalikan sebagai hasil
 * { ok: false } dengan pesan ramah.
 */
import { isSupabaseConfigured, supabase } from './supabase'

/** Hasil cek status admin satu user. */
export interface AdminStatus {
  /** True bila profiles.is_admin true. */
  isAdmin: boolean
  /** True bila kolom is_admin belum ada (migrasi 009 belum jalan). */
  columnMissing: boolean
  /** True bila pengecekan berhasil dibaca (bukan gagal total). */
  checked: boolean
}

const NOT_ADMIN: AdminStatus = {
  isAdmin: false,
  columnMissing: false,
  checked: false,
}

/** True bila error Postgres menandakan kolom is_admin belum ada. */
function isMissingColumnError(error: {
  code?: string
  message?: string
}): boolean {
  if (error.code === '42703') return true
  const message = (error.message ?? '').toLowerCase()
  return message.includes('is_admin') && message.includes('column')
}

/**
 * Cek apakah user ini admin. Tidak pernah melempar error.
 * Bila Supabase belum terkonfigurasi atau userId kosong, hasilnya
 * bukan admin dengan checked false.
 */
export async function getAdminStatus(
  userId: string | null | undefined,
): Promise<AdminStatus> {
  if (!userId) return NOT_ADMIN
  if (!isSupabaseConfigured() || !supabase) return NOT_ADMIN
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      if (isMissingColumnError(error)) {
        return { isAdmin: false, columnMissing: true, checked: true }
      }
      return NOT_ADMIN
    }
    const row = data as { is_admin?: unknown } | null
    return {
      isAdmin: row?.is_admin === true,
      columnMissing: false,
      checked: true,
    }
  } catch {
    return NOT_ADMIN
  }
}

/** Satu user dari aksi list_users Edge Function admin-actions. */
export interface AdminUserRow {
  id: string
  username: string
  formasi: string | null
  created_at: string
  is_premium: boolean
  premium_until: string | null
  is_admin: boolean
  xp: number
  streak: number
  last_tryout: {
    finished_at: string
    total: number
    mode: string
  } | null
}

/** Satu penebusan kode (siapa + kapan). */
export interface AdminCodeRedemption {
  username: string | null
  redeemed_at: string
}

/** Satu kode dari aksi list_codes Edge Function admin-actions. */
export interface AdminCodeRow {
  code: string
  premium_days: number
  max_uses: number
  uses: number
  expires_at: string | null
  note: string | null
  created_at: string
  redemptions: AdminCodeRedemption[]
}

/** Satu klaim pembayaran dari aksi list_payments Edge Function admin-actions. */
export interface AdminPaymentRow {
  id: string
  user_id: string
  username: string | null
  package: string
  amount: number
  status: string
  created_at: string
  verified_at: string | null
  verified_by: string | null
  note: string | null
}

/** Hasil generik pemanggilan admin-actions. */
export interface AdminActionResult<T = Record<string, unknown>> {
  ok: boolean
  data?: T
  /** Pesan ramah saat gagal. */
  message?: string
  /** True bila function belum ter-deploy (404 / Failed to fetch). */
  notDeployed?: boolean
}

/** True bila error invoke menandakan function belum ter-deploy. */
function isNotDeployedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const lower = message.toLowerCase()
  return (
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('failed to fetch') ||
    lower.includes('network')
  )
}

/**
 * Panggil satu aksi Edge Function admin-actions. Mengembalikan
 * data apa adanya bila sukses. Bila function mengembalikan
 * { ok: false, error }, message diisi error itu.
 */
export async function callAdminAction<T = Record<string, unknown>>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<AdminActionResult<T>> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, message: 'Fitur akun belum aktif' }
  }
  try {
    const { data, error } = await supabase.functions.invoke(
      'admin-actions',
      { body: { action, ...params } },
    )
    if (error) {
      return {
        ok: false,
        message: 'Panel admin belum terpasang di server.',
        notDeployed: isNotDeployedError(error),
      }
    }
    const payload = (data ?? {}) as {
      ok?: unknown
      error?: unknown
      [key: string]: unknown
    }
    if (payload.ok === false) {
      return {
        ok: false,
        message:
          typeof payload.error === 'string'
            ? payload.error
            : 'Aksi gagal, coba lagi ya.',
      }
    }
    return { ok: true, data: payload as T }
  } catch (err) {
    return {
      ok: false,
      message: 'Panel admin belum terpasang di server.',
      notDeployed: isNotDeployedError(err),
    }
  }
}

/** True bila baris premium masih aktif (is_premium atau until di depan). */
export function isPremiumRowActive(
  isPremium: boolean,
  premiumUntil: string | null | undefined,
): boolean {
  if (isPremium) return true
  if (typeof premiumUntil !== 'string') return false
  const time = Date.parse(premiumUntil)
  return !Number.isNaN(time) && time > Date.now()
}

/**
 * Senin minggu berjalan dalam zona Asia/Makassar (YYYY-MM-DD).
 * Dipakai modul Statistik untuk "minggu ini" (konsisten dengan
 * week_start leaderboard yang juga Senin Asia/Makassar).
 */
export function currentWeekMondayMakassar(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now)
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? ''
  const year = Number(get('year'))
  const month = Number(get('month'))
  const day = Number(get('day'))
  const weekday = get('weekday')
  // Nomor hari ISO (Senin 1 sampai Minggu 7).
  const isoDay =
    weekday === 'Mon'
      ? 1
      : weekday === 'Tue'
        ? 2
        : weekday === 'Wed'
          ? 3
          : weekday === 'Thu'
            ? 4
            : weekday === 'Fri'
              ? 5
              : weekday === 'Sat'
                ? 6
                : 7
  const monday = new Date(Date.UTC(year, month - 1, day))
  monday.setUTCDate(monday.getUTCDate() - (isoDay - 1))
  return monday.toISOString().slice(0, 10)
}
