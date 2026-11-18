/**
 * Berbagi peliharaan (streak + maskot) dari PetCard.
 *
 * Jalur utama: Web Share API (navigator.share) bila tersedia, supaya
 * user bisa langsung kirim ke WhatsApp, TikTok, dan aplikasi lain.
 * Fallback: salin teks + tautan ke clipboard (Async Clipboard API,
 * dengan fallback execCommand lama bila clipboard tidak tersedia).
 * Tidak pernah melempar error ke pemanggil.
 */
import { MASCOT_NAME } from './mascot'

/** Tautan Lolosin yang disertakan di setiap teks berbagi. */
export const LOLOSIN_URL = 'https://lolosin.netlify.app/'

/**
 * Durasi minimum share yang sungguhan (v2.7): share sheet butuh user
 * memilih tujuan, jadi selalu butuh waktu. Bila navigator.share()
 * resolve lebih cepat dari ini, sheet tidak pernah tampil (pola
 * Brave/Chrome tertentu yang me-resolve janji share secara instan)
 * dan hasilnya dianggap no-op, bukan 'shared'. Dipakai share.ts dan
 * shareCard.ts.
 */
export const SHARE_MIN_REALISTIC_MS = 800

/** Hasil berbagi: 'cancelled' saat user menutup sheet berbagi. */
export type SharePetResult = 'shared' | 'copied' | 'cancelled' | 'failed'

/** Hasil berbagi teks apa pun (hasil yang sama seperti sharePet). */
export type ShareTextResult = SharePetResult

/** Teks berbagi: menyebut streak, nama maskot, dan tautan Lolosin. */
export function petShareText(streak: number): string {
  const safe = Math.max(0, Math.floor(streak))
  if (safe <= 0) {
    return (
      `Aku lagi ngerawat ${MASCOT_NAME}, maskotku di Lolosin. ` +
      `Yuk ikut belajar CPNS bareng: ${LOLOSIN_URL}`
    )
  }
  return (
    `Streak belajarku sudah ${safe} hari bareng ${MASCOT_NAME} di Lolosin. ` +
    `Yuk ikut belajar CPNS bareng: ${LOLOSIN_URL}`
  )
}

/** Fallback salin terakhir (execCommand, sinkron di dalam klik user). */
function legacyCopy(text: string): boolean {
  try {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.cssText = 'position:fixed;top:0;opacity:0'
    document.body.append(field)
    field.select()
    try {
      return document.execCommand('copy')
    } finally {
      field.remove()
    }
  } catch {
    return false
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard tidak tersedia (konteks tidak aman / izin ditolak):
    // coba cara lama sebelum menyerah.
    return legacyCopy(text)
  }
}

/**
 * Bagikan teks apa pun (v2.8, dipakai kartu perayaan kemenangan
 * pertama untuk berbagi hasil). Jalur yang sama seperti sharePet:
 * coba navigator.share dulu (dengan heuristik waktu v2.7 supaya
 * resolve instan tidak pernah dilaporkan 'shared'), lalu clipboard.
 * Mengembalikan 'cancelled' bila user menutup sheet berbagi tanpa
 * memilih tujuan (bukan kegagalan, jadi tidak perlu pesan error).
 */
export async function shareText(text: string): Promise<ShareTextResult> {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    try {
      const startedAt = performance.now()
      await navigator.share({ title: 'Lolosin', text, url: LOLOSIN_URL })
      // Resolve instan = no-op (sheet tidak tampil): lanjut ke
      // clipboard, jangan pernah laporkan 'shared'.
      if (performance.now() - startedAt >= SHARE_MIN_REALISTIC_MS) {
        return 'shared'
      }
    } catch (error) {
      // User membatalkan sheet berbagi: bukan kegagalan.
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled'
      }
      // Gagal berbagi (mis. tujuan tidak mendukung): lanjut ke clipboard.
    }
  }
  try {
    return (await copyText(text)) ? 'copied' : 'failed'
  } catch {
    return 'failed'
  }
}

/**
 * Bagikan peliharaan. Coba navigator.share dulu, lalu clipboard.
 * Mengembalikan 'cancelled' bila user menutup sheet berbagi tanpa
 * memilih tujuan (bukan kegagalan, jadi tidak perlu pesan error).
 */
export async function sharePet(streak: number): Promise<SharePetResult> {
  return shareText(petShareText(streak))
}
