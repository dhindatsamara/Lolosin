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

/** Hasil berbagi: 'cancelled' saat user menutup sheet berbagi. */
export type SharePetResult = 'shared' | 'copied' | 'cancelled' | 'failed'

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
 * Bagikan peliharaan. Coba navigator.share dulu, lalu clipboard.
 * Mengembalikan 'cancelled' bila user menutup sheet berbagi tanpa
 * memilih tujuan (bukan kegagalan, jadi tidak perlu pesan error).
 */
export async function sharePet(streak: number): Promise<SharePetResult> {
  const text = petShareText(streak)
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    try {
      await navigator.share({ title: 'Lolosin', text, url: LOLOSIN_URL })
      return 'shared'
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
