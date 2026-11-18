/**
 * Sistem redeem code premium Lolosin (v2.7).
 *
 * User menukarkan kode (dari giveaway Dhinda) menjadi premium
 * sejumlah hari. Logika penukaran hidup di database (RPC
 * `redeem_code`, migrasi 004): kode dicek keberadaan, kedaluwarsa,
 * sisa pemakaian, dan riwayat redeem user, lalu
 * profiles.premium_until diperpanjang. (Kode hadiah juara mingguan
 * lewat email adalah pekerjaan lanjutan; di v2.7 pemenang menerima
 * premium langsung dari fungsi pengumuman.)
 * Dhinda membuat kode lewat RPC `create_redeem_code` (dicek server
 * dari username); generatornya hanya tampil di akun Dhinda.
 *
 * Semua fungsi aman saat Supabase belum terkonfigurasi dan tidak
 * pernah melempar error: kegagalan dikembalikan sebagai hasil
 * { ok: false } dengan pesan ramah.
 */
import { isSupabaseConfigured, supabase } from './supabase'

/** Username Dhinda (pemilik generator kode). */
export const DEV_REDEEM_USERNAME = 'dhindaimup'

/** Email Dhinda (pemilik generator kode). */
export const DEV_REDEEM_EMAIL = 'dindatsamara@gmail.com'

/** True bila profil yang login adalah Dhinda (boleh membuat kode). */
export function isDevRedeemUser(
  username: string | null | undefined,
  email: string | null | undefined,
): boolean {
  if (username === DEV_REDEEM_USERNAME) return true
  return (
    typeof email === 'string' &&
    email.trim().toLowerCase() === DEV_REDEEM_EMAIL
  )
}

/**
 * Kode error redeem: empat dari RPC, tiga dari client.
 * - 'not_found': kode tidak ada.
 * - 'expired': kode sudah lewat tanggal kedaluwarsa.
 * - 'used_up': kode sudah habis dipakai (batas pemakaian tercapai).
 * - 'already_redeemed': user ini sudah pernah menukarkan kode itu.
 * - 'not_configured': Supabase belum aktif.
 * - 'unavailable': RPC belum ada (migrasi 004 belum jalan).
 * - 'unknown': gagal lain (mis. jaringan).
 */
export type RedeemErrorCode =
  | 'not_found'
  | 'expired'
  | 'used_up'
  | 'already_redeemed'
  | 'not_configured'
  | 'unavailable'
  | 'unknown'

/** Pesan ramah per jenis error redeem. */
export const REDEEM_ERROR_MESSAGES: Record<RedeemErrorCode, string> = {
  not_found: 'Kode itu tidak ditemukan. Cek lagi penulisannya ya.',
  expired: 'Kode itu sudah kedaluwarsa.',
  used_up: 'Kode itu sudah habis dipakai.',
  already_redeemed: 'Kode itu sudah pernah kamu redeem.',
  not_configured: 'Fitur akun belum aktif.',
  unavailable: 'Fitur redeem belum aktif. Coba lagi nanti ya.',
  unknown: 'Ada yang salah, coba lagi ya.',
}

/** Hasil penukaran satu kode. */
export interface RedeemResult {
  ok: boolean
  /** Jumlah hari premium yang didapat (bila sukses). */
  days?: number
  /** Tanggal kedaluwarsa premium setelah redeem (bila sukses). */
  premiumUntil?: string | null
  error?: RedeemErrorCode
  /** Pesan ramah untuk user (bila gagal). */
  message?: string
}

/** Normalisasi kode: trim lalu huruf besar. */
export function normalizeRedeemCode(code: string): string {
  return code.trim().toUpperCase()
}

/** True bila error PostgREST menandakan RPC belum ada di database. */
function isFunctionMissingError(
  functionName: string,
  error: { code?: string; message?: string },
): boolean {
  if (error.code === '42883' || error.code === 'PGRST202') return true
  const message = (error.message ?? '').toLowerCase()
  return (
    message.includes(functionName) &&
    (message.includes('does not exist') || message.includes('could not find'))
  )
}

const UNKNOWN_RESULT: RedeemResult = {
  ok: false,
  error: 'unknown',
  message: REDEEM_ERROR_MESSAGES.unknown,
}

/**
 * Tukarkan satu kode menjadi premium. Tidak pernah melempar error.
 * Kode kosong langsung dianggap tidak ditemukan (tanpa panggilan RPC).
 */
export async function redeemCode(rawCode: string): Promise<RedeemResult> {
  const code = normalizeRedeemCode(rawCode)
  if (!code) {
    return {
      ok: false,
      error: 'not_found',
      message: REDEEM_ERROR_MESSAGES.not_found,
    }
  }
  if (!isSupabaseConfigured() || !supabase) {
    return {
      ok: false,
      error: 'not_configured',
      message: REDEEM_ERROR_MESSAGES.not_configured,
    }
  }
  try {
    const { data, error } = await supabase.rpc('redeem_code', {
      p_code: code,
    })
    if (error) {
      if (isFunctionMissingError('redeem_code', error)) {
        return {
          ok: false,
          error: 'unavailable',
          message: REDEEM_ERROR_MESSAGES.unavailable,
        }
      }
      return UNKNOWN_RESULT
    }
    const result = data as {
      ok?: unknown
      days?: unknown
      premium_until?: unknown
      error?: unknown
    } | null
    if (!result || typeof result !== 'object') return UNKNOWN_RESULT
    if (result.ok === true) {
      return {
        ok: true,
        days: typeof result.days === 'number' ? result.days : 0,
        premiumUntil:
          typeof result.premium_until === 'string'
            ? result.premium_until
            : null,
      }
    }
    const errorCode =
      typeof result.error === 'string' ? result.error : 'unknown'
    const known: RedeemErrorCode[] = [
      'not_found',
      'expired',
      'used_up',
      'already_redeemed',
    ]
    const mapped = (
      known as string[]
    ).includes(errorCode)
      ? (errorCode as RedeemErrorCode)
      : 'unknown'
    return {
      ok: false,
      error: mapped,
      message: REDEEM_ERROR_MESSAGES[mapped],
    }
  } catch {
    return UNKNOWN_RESULT
  }
}

/** Masukan pembuatan kode baru (generator dev). */
export interface CreateRedeemCodeInput {
  /** Durasi premium dalam hari (minimal 1). */
  days: number
  /** Maksimal jumlah pemakaian kode (minimal 1). */
  maxUses: number
  /** Tanggal kedaluwarsa (YYYY-MM-DD) atau null bila tanpa batas waktu. */
  expiresAt: string | null
}

/** Hasil pembuatan kode baru. */
export interface CreateRedeemCodeResult {
  ok: boolean
  /** Kode yang dibuat (bila sukses). */
  code?: string
  /** Pesan ramah untuk user (bila gagal). */
  error?: string
}

/**
 * Buat satu kode redeem baru (hanya Dhinda; server memverifikasi
 * dari username). Tidak pernah melempar error.
 */
export async function createRedeemCode(
  input: CreateRedeemCodeInput,
): Promise<CreateRedeemCodeResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Fitur akun belum aktif.' }
  }
  const days = Math.floor(input.days)
  const maxUses = Math.floor(input.maxUses)
  if (!(days >= 1)) {
    return { ok: false, error: 'Durasi premium minimal 1 hari ya.' }
  }
  if (!(maxUses >= 1)) {
    return { ok: false, error: 'Maksimal pemakaian minimal 1 ya.' }
  }
  try {
    const { data, error } = await supabase.rpc('create_redeem_code', {
      p_premium_days: days,
      p_max_uses: maxUses,
      p_expires_at: input.expiresAt,
    })
    if (error) {
      if (isFunctionMissingError('create_redeem_code', error)) {
        return { ok: false, error: 'Fitur redeem belum aktif.' }
      }
      return { ok: false, error: 'Kode gagal dibuat, coba lagi ya.' }
    }
    if (typeof data !== 'string' || data === '') {
      return { ok: false, error: 'Kode gagal dibuat, coba lagi ya.' }
    }
    return { ok: true, code: data }
  } catch {
    return { ok: false, error: 'Kode gagal dibuat, coba lagi ya.' }
  }
}

/** Format tanggal ISO menjadi "12 Des 2026" (WITA). */
export function formatTanggalIndonesia(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
