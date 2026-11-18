/**
 * Status Premium Lolosin: dibaca dari kolom profiles.is_premium dan
 * profiles.premium_until.
 *
 * Kolom is_premium ditambahkan worker lain di migrasi 003, dan kolom
 * premium_until di migrasi 004, jadi kode di sini harus toleran bila
 * salah satu kolom belum ada: bila query select gagal karena kolom
 * belum dikenal Postgres (kode 42703), kolom yang hilang dianggap
 * tidak ada (bukan premium dari jalur itu) dan pemanggil menampilkan
 * pesan ramah, bukan crash.
 *
 * Premium = is_premium true ATAU premium_until masih di masa depan.
 * is_premium diatur toggle "Premium Beta" di halaman Profil (gratis
 * selama beta); premium_until diisi redeem code dan hadiah juara
 * mingguan. Toggle beta tidak pernah menyentuh premium_until.
 *
 * Selama beta, Premium diaktifkan manual dari halaman Profil
 * ("Premium Beta", gratis). Host sesi ala Quizizz wajib premium,
 * pemain yang ikut sesi tidak wajib.
 */
import { isSupabaseConfigured, supabase } from './supabase'

/** Pesan ramah saat host sesi belum premium. */
export const PREMIUM_BETA_MESSAGE =
  'Aktifkan Premium Beta dulu dari halaman Profil'

/** Hasil cek status premium satu user. */
export interface PremiumStatus {
  /** True bila is_premium true atau premium_until masih di masa depan. */
  premium: boolean
  /** Tanggal kedaluwarsa premium (ISO timestamptz) atau null bila tidak ada. */
  premiumUntil: string | null
  /** True bila kolom is_premium belum ada di database (migrasi 003 belum jalan). */
  columnMissing: boolean
  /** True bila pengecekan berhasil dibaca (bukan gagal total). */
  checked: boolean
}

const NOT_PREMIUM: PremiumStatus = {
  premium: false,
  premiumUntil: null,
  columnMissing: false,
  checked: false,
}

/** True bila error Postgres menandakan kolom is_premium belum ada. */
function isMissingColumnError(error: {
  code?: string
  message?: string
}): boolean {
  if (error.code === '42703') return true
  const message = (error.message ?? '').toLowerCase()
  return message.includes('is_premium') && message.includes('column')
}

/** True bila pesan error menyebut kolom tertentu. */
function mentionsColumn(
  error: { message?: string },
  column: string,
): boolean {
  return (error.message ?? '').toLowerCase().includes(column)
}

/** True bila tanggal premium_until masih di masa depan (nilai tidak valid = tidak). */
function isPremiumUntilActive(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const time = Date.parse(value)
  return !Number.isNaN(time) && time > Date.now()
}

/**
 * Cek apakah user ini premium. Tidak pernah melempar error.
 * Bila Supabase belum terkonfigurasi atau userId kosong, hasilnya
 * bukan premium dengan checked false. Bila kolom premium_until belum
 * ada (migrasi 004 belum jalan), cek diulang tanpa kolom itu dan
 * premiumUntil dianggap null; bila is_premium belum ada, hasilnya
 * columnMissing seperti dulu.
 */
export async function getPremiumStatus(
  userId: string | null | undefined,
): Promise<PremiumStatus> {
  if (!userId) return NOT_PREMIUM
  if (!isSupabaseConfigured() || !supabase) return NOT_PREMIUM
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_premium, premium_until')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      // Kolom premium_until belum ada tapi is_premium ada: ulangi
      // select tanpa premium_until (pola yang sama seperti
      // selectProfileById di lib/auth.ts untuk is_premium).
      if (
        error.code === '42703' &&
        mentionsColumn(error, 'premium_until') &&
        !mentionsColumn(error, 'is_premium')
      ) {
        const retry = await supabase
          .from('profiles')
          .select('is_premium')
          .eq('id', userId)
          .maybeSingle()
        if (retry.error) {
          if (isMissingColumnError(retry.error)) {
            return {
              premium: false,
              premiumUntil: null,
              columnMissing: true,
              checked: true,
            }
          }
          return NOT_PREMIUM
        }
        const retryRow = retry.data as { is_premium?: unknown } | null
        return {
          premium: retryRow?.is_premium === true,
          premiumUntil: null,
          columnMissing: false,
          checked: true,
        }
      }
      if (isMissingColumnError(error)) {
        return {
          premium: false,
          premiumUntil: null,
          columnMissing: true,
          checked: true,
        }
      }
      return NOT_PREMIUM
    }
    const row = data as {
      is_premium?: unknown
      premium_until?: unknown
    } | null
    const premiumUntil = isPremiumUntilActive(row?.premium_until)
      ? (row?.premium_until as string)
      : null
    return {
      premium: row?.is_premium === true || premiumUntil !== null,
      premiumUntil,
      columnMissing: false,
      checked: true,
    }
  } catch {
    return NOT_PREMIUM
  }
}
