/**
 * Klaim pembayaran Premium Lolosin (v2.15).
 *
 * Alur bayar MANUAL (tanpa gateway): user bayar nominal pas lewat
 * QRIS, lalu tap "Saya sudah bayar". Tap itu membuat satu baris di
 * tabel payment_claims (migrasi 011) berstatus pending; admin
 * memverifikasi (nominal + waktu) di panel admin lalu menyetujui
 * atau menolak lewat Edge Function admin-actions. Premium aktif
 * hanya setelah admin menyetujui.
 *
 * Semua fungsi aman saat Supabase belum terkonfigurasi dan tidak
 * pernah melempar error: bila tabel payment_claims belum ada
 * (migrasi 011 belum jalan), hasilnya tableMissing, bukan crash.
 */
import { isSupabaseConfigured, supabase } from './supabase'
import type { PackageId } from './pricing'

/** Status satu klaim pembayaran. */
export type PaymentClaimStatus = 'pending' | 'approved' | 'rejected'

/** Satu baris payment_claims (milik user sendiri). */
export interface PaymentClaim {
  id: string
  user_id: string
  package: PackageId
  amount: number
  status: PaymentClaimStatus
  created_at: string
  verified_at: string | null
  verified_by: string | null
  note: string | null
}

/** Hasil pembuatan klaim. */
export interface CreateClaimResult {
  ok: boolean
  claim?: PaymentClaim
  /** Pesan ramah saat gagal. */
  message?: string
  /** True bila tabel payment_claims belum ada (migrasi 011 belum jalan). */
  tableMissing?: boolean
}

/** True bila error Postgres menandakan tabel payment_claims belum ada. */
function isMissingTableError(error: { code?: string; message?: string }): boolean {
  if (error.code === '42P01') return true
  const message = (error.message ?? '').toLowerCase()
  return message.includes('payment_claims') && message.includes('relation')
}

/**
 * Buat klaim pembayaran baru (status pending). Dipanggil saat user
 * tap "Saya sudah bayar" setelah membayar lewat QRIS. Tidak pernah
 * melempar error.
 */
export async function createPaymentClaim(
  userId: string | null | undefined,
  packageId: PackageId,
  amount: number,
): Promise<CreateClaimResult> {
  if (!userId) {
    return { ok: false, message: 'Masuk dulu ya sebelum membeli.' }
  }
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, message: 'Fitur akun belum aktif' }
  }
  try {
    const { data, error } = await supabase
      .from('payment_claims')
      .insert({ user_id: userId, package: packageId, amount })
      .select('id, user_id, package, amount, status, created_at, verified_at, verified_by, note')
      .single()
    if (error) {
      if (isMissingTableError(error)) {
        return {
          ok: false,
          tableMissing: true,
          message: 'Pembayaran belum siap di server (migrasi 011 belum jalan).',
        }
      }
      return { ok: false, message: 'Klaim gagal dibuat, coba lagi ya.' }
    }
    return { ok: true, claim: data as PaymentClaim }
  } catch {
    return { ok: false, message: 'Klaim gagal dibuat, coba lagi ya.' }
  }
}

/** Hasil pembacaan klaim pending milik user. */
export interface PendingClaimResult {
  /** Klaim pending terbaru, atau null bila tidak ada. */
  claim: PaymentClaim | null
  /** True bila tabel payment_claims belum ada (migrasi 011 belum jalan). */
  tableMissing: boolean
}

/**
 * Ambil klaim pending terbaru milik user (dipakai halaman /premium
 * dan Profil supaya user tahu pembayarannya sedang diverifikasi).
 * Tidak pernah melempar error.
 */
export async function getMyPendingClaim(
  userId: string | null | undefined,
): Promise<PendingClaimResult> {
  const empty: PendingClaimResult = { claim: null, tableMissing: false }
  if (!userId) return empty
  if (!isSupabaseConfigured() || !supabase) return empty
  try {
    const { data, error } = await supabase
      .from('payment_claims')
      .select('id, user_id, package, amount, status, created_at, verified_at, verified_by, note')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      if (isMissingTableError(error)) {
        return { claim: null, tableMissing: true }
      }
      return empty
    }
    return { claim: (data as PaymentClaim | null) ?? null, tableMissing: false }
  } catch {
    return empty
  }
}
