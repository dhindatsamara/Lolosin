/**
 * Batas gratis tryout (v2.15.2): penegakan aturan di
 * DRAF-BATASAN-FREE-PREMIUM.md, yang selama ini hanya tertulis
 * tanpa ditegakkan di kode.
 *
 * - Tryout kilat: maks 10x per bulan kalender (WITA) untuk user
 *   gratis. Dihitung dari riwayat lokal (store tryoutHistory):
 *   kilat tidak punya baris tryout_results (tidak dikirim ke
 *   leaderboard, lihat lib/attempts.ts), jadi tidak ada sumber
 *   server untuk dihitung. Konsekuensinya batas ini per perangkat
 *   dan bisa dihindari dengan menghapus data lokal; itu batasan
 *   yang diketahui, bukan bug. Premium tanpa batas.
 * - Tryout Akbar: maks 2x seumur akun untuk user gratis.
 *   Dihitung dari tryout_results mode 'full' (fetchMyAkbarCount,
 *   dipakai juga gate di halaman Akbar). Premium tanpa batas.
 *   Tamu tidak dibatasi di sini: tanpa akun tidak ada yang bisa
 *   dihitung dari tryout_results, dan skor tamu tidak pernah
 *   sampai ke leaderboard (submit butuh login). Pintu masuk
 *   resmi Akbar (halaman Akbar) tetap mewajibkan login; backstop
 *   ini hanya menutup celah bypass gate untuk akun gratis.
 *
 * Penegakan ini client-side saja, konsisten dengan cek premium
 * client-side yang sudah ada. Penegakan server-side (trigger
 * yang menolak insert ke-3 mode 'full' untuk user gratis)
 * adalah hardening lanjutan: trigger tidak bisa membedakan user
 * premium tanpa membaca profiles, dan itu menambah beban tiap
 * insert leaderboard.
 *
 * Fail-open: bila pengecekan gagal (jaringan / Supabase belum
 * aktif), user diizinkan mulai supaya tidak terkunci karena
 * kegagalan baca. Pola yang sama dipakai fetchMyAkbarCount.
 */
import { getPremiumStatus } from './premium'
import { todayMakassar, type TryoutRecord } from './store'
import type { TryoutMode } from './quiz'
import { fetchMyAkbarCount, FREE_AKBAR_LIMIT } from './tryoutAkbar'

/** Jatah tryout kilat gratis per bulan kalender (WITA). */
export const FREE_KILAT_LIMIT_MONTH = 10

/**
 * Hitung tryout kilat yang selesai di bulan kalender berjalan
 * (zona Asia/Makassar) dari riwayat lokal. Riwayat tanpa mode
 * dianggap mini (riwayat lama, sama seperti di TryoutPage).
 * Fungsi murni: mudah dites tanpa Supabase.
 */
export function countKilatThisMonth(
  history: readonly TryoutRecord[],
  now = new Date(),
): number {
  const month = todayMakassar(now).slice(0, 7)
  let count = 0
  for (const record of history) {
    if ((record.mode ?? 'mini') !== 'mini') continue
    const date = new Date(record.date)
    if (Number.isNaN(date.getTime())) continue
    if (todayMakassar(date).slice(0, 7) === month) count += 1
  }
  return count
}

/** Alasan tryout tidak bisa dimulai. */
export type TryoutLimitReason = 'kilat-limit' | 'akbar-limit'

/** Hasil cek akses mulai tryout. */
export interface TryoutAccess {
  /** True bila user boleh memulai tryout mode itu. */
  allowed: boolean
  /** Alasan penolakan, hanya bila allowed false. */
  reason?: TryoutLimitReason
  /** Jumlah pemakaian yang sudah terhitung (kilat bulan ini / Akbar seumur akun). */
  used: number
  /** Batas mode itu (10 kilat/bulan, 2 Akbar seumur akun). */
  limit: number
}

/**
 * Cek apakah user boleh memulai tryout mode itu. Premium selalu
 * boleh. Tidak pernah melempar error: kegagalan baca berarti
 * diizinkan (fail-open). `userId` null berarti tamu: tamu boleh
 * kilat sampai batas bulanan (dari riwayat lokal), dan boleh
 * Akbar tanpa batas hitungan (tidak ada akun untuk dihitung,
 * dan skornya tidak masuk leaderboard).
 */
export async function checkTryoutAccess(
  mode: TryoutMode,
  opts: { userId: string | null; history: readonly TryoutRecord[] },
): Promise<TryoutAccess> {
  const limit =
    mode === 'mini' ? FREE_KILAT_LIMIT_MONTH : FREE_AKBAR_LIMIT

  if (opts.userId) {
    let premium = false
    try {
      premium = (await getPremiumStatus(opts.userId)).premium
    } catch {
      premium = false
    }
    if (premium) return { allowed: true, used: 0, limit }
  }

  if (mode === 'mini') {
    const used = countKilatThisMonth(opts.history)
    if (used >= FREE_KILAT_LIMIT_MONTH) {
      return {
        allowed: false,
        reason: 'kilat-limit',
        used,
        limit: FREE_KILAT_LIMIT_MONTH,
      }
    }
    return { allowed: true, used, limit: FREE_KILAT_LIMIT_MONTH }
  }

  const used = opts.userId ? await fetchMyAkbarCount(opts.userId) : 0
  if (used >= FREE_AKBAR_LIMIT) {
    return {
      allowed: false,
      reason: 'akbar-limit',
      used,
      limit: FREE_AKBAR_LIMIT,
    }
  }
  return { allowed: true, used, limit: FREE_AKBAR_LIMIT }
}
