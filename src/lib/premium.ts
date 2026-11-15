/**
 * Status Premium Lolosin: dibaca dari kolom profiles.is_premium.
 *
 * Kolom is_premium ditambahkan worker lain di migrasi 003, jadi kode di
 * sini harus toleran bila kolom itu belum ada: bila query select
 * is_premium gagal karena kolom belum dikenal Postgres (kode 42703),
 * user dianggap bukan premium dan pemanggil menampilkan pesan ramah,
 * bukan crash.
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
  /** True bila profiles.is_premium bernilai true. */
  premium: boolean
  /** True bila kolom is_premium belum ada di database (migrasi 003 belum jalan). */
  columnMissing: boolean
  /** True bila pengecekan berhasil dibaca (bukan gagal total). */
  checked: boolean
}

const NOT_PREMIUM: PremiumStatus = {
  premium: false,
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

/**
 * Cek apakah user ini premium. Tidak pernah melempar error.
 * Bila Supabase belum terkonfigurasi atau userId kosong, hasilnya
 * bukan premium dengan checked false.
 */
export async function getPremiumStatus(
  userId: string | null | undefined,
): Promise<PremiumStatus> {
  if (!userId) return NOT_PREMIUM
  if (!isSupabaseConfigured() || !supabase) return NOT_PREMIUM
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('is_premium')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      if (isMissingColumnError(error)) {
        return { premium: false, columnMissing: true, checked: true }
      }
      return NOT_PREMIUM
    }
    const row = data as { is_premium?: unknown } | null
    return {
      premium: row?.is_premium === true,
      columnMissing: false,
      checked: true,
    }
  } catch {
    return NOT_PREMIUM
  }
}
