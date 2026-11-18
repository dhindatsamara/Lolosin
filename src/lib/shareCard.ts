/**
 * Kartu berbagi bergambar untuk peliharaan (v2.3.2): gambar PNG
 * portrait 4:5 (1080x1350) yang dirangkai lewat canvas, berisi
 * maskot Osi (SVG yang sedang dirender di PetCard, diserialisasi
 * dari DOM supaya outfit pilihan ikut terbawa), streak, level, XP,
 * dan branding Lolosin. Tanpa dependensi npm baru: SVG murni +
 * canvas + font sistem.
 *
 * Jalur utama: Web Share API dengan files (bila browser mendukung,
 * mis. Chrome Android) supaya user bisa langsung kirim ke WhatsApp,
 * Instagram, TikTok, dan aplikasi lain. Fallback: unduh PNG, atau
 * buka PNG di tab baru di browser yang tidak mendukung atribut
 * download (mis. iOS Safari). Semua fungsi tidak pernah melempar
 * error ke pemanggil.
 */
import { MASCOT_NAME } from './mascot'
import { LOLOSIN_URL, SHARE_MIN_REALISTIC_MS, petShareText } from './share'

/** Data yang tampil di kartu berbagi. */
export interface PetShareCardData {
  streak: number
  xp: number
  level: number
  stageName: string
}

/**
 * Hasil berbagi foto: 'cancelled' saat user menutup sheet berbagi,
 * 'opened' saat PNG dibuka di tab baru (fallback iOS Safari, yang
 * tidak mendukung atribut download).
 */
export type SharePetPhotoResult =
  | 'shared'
  | 'downloaded'
  | 'opened'
  | 'cancelled'
  | 'failed'

const CARD_W = 1080
const CARD_H = 1350
const FILE_NAME = 'osi-streak-lolosin.png'

/** Font tebal sistem untuk teks canvas (tanpa font eksternal). */
function font(px: number, weight = 800): string {
  return `${weight} ${px}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
}

/** Jalur persegi membulat (tanpa ctx.roundRect, biar aman di browser lama). */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** Muat elemen SVG menjadi gambar raster (untuk digambar ke canvas). */
function svgToImage(svg: SVGSVGElement, size: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true) as SVGSVGElement
    // Rasterisasi tajam di ukuran target: tanpa width/height eksplisit
    // browser meraster di ukuran atribut aslinya (120px) lalu diskalakan
    // sehingga gambar jadi buram.
    clone.setAttribute('width', String(size))
    clone.setAttribute('height', String(size))
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const markup = new XMLSerializer().serializeToString(clone)
    const url = URL.createObjectURL(
      new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }),
    )
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Gagal memuat gambar maskot'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Gagal membuat gambar'))
      },
      'image/png',
    )
  })
}

/**
 * Rangkai kartu PNG. Melempar Error bila ada langkah yang gagal
 * (pemanggil sharePetPhoto menangkapnya jadi 'failed').
 */
export async function renderPetShareCard(
  mascotSvg: SVGSVGElement,
  data: PetShareCardData,
): Promise<Blob> {
  const safe = {
    streak: Math.max(0, Math.floor(data.streak)),
    xp: Math.max(0, Math.floor(data.xp)),
    level: Math.max(1, Math.floor(data.level)),
  }
  const mascotImg = await svgToImage(mascotSvg, 640)

  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas tidak tersedia')

  // Latar: gradasi hijau gelap khas Lolosin + lingkaran dekorasi.
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H)
  bg.addColorStop(0, '#0E5C43')
  bg.addColorStop(1, '#0B4A36')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, CARD_W, CARD_H)
  ctx.fillStyle = 'rgba(47, 191, 113, 0.18)'
  ctx.beginPath()
  ctx.arc(980, 180, 260, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(245, 158, 11, 0.14)'
  ctx.beginPath()
  ctx.arc(80, 1150, 300, 0, Math.PI * 2)
  ctx.fill()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Wordmark Lolosin.
  ctx.fillStyle = '#F59E0B'
  ctx.font = font(64, 900)
  ctx.fillText('LOLOSIN', CARD_W / 2, 110)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
  ctx.font = font(32, 600)
  ctx.fillText('Belajar CPNS jadi menyenangkan', CARD_W / 2, 175)

  // Lingkaran putih di belakang maskot + maskot.
  ctx.fillStyle = '#FFFFFF'
  ctx.beginPath()
  ctx.arc(CARD_W / 2, 520, 290, 0, Math.PI * 2)
  ctx.fill()
  ctx.drawImage(mascotImg, CARD_W / 2 - 260, 260, 520, 520)

  // Pil nama stage.
  ctx.font = font(36, 800)
  const stageText = data.stageName
  const stageW = ctx.measureText(stageText).width + 72
  ctx.fillStyle = '#F59E0B'
  roundedRect(ctx, CARD_W / 2 - stageW / 2, 838, stageW, 64, 32)
  ctx.fill()
  ctx.fillStyle = '#1B1E1C'
  ctx.fillText(stageText, CARD_W / 2, 871)

  // Angka streak besar.
  ctx.fillStyle = '#FFFFFF'
  ctx.font = font(150, 900)
  ctx.fillText(`${safe.streak} hari`, CARD_W / 2, 1010)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.font = font(38, 600)
  ctx.fillText(`streak belajar bareng ${MASCOT_NAME}`, CARD_W / 2, 1100)

  // Dua pil statistik: level dan XP.
  const stats = [
    `Level ${safe.level}`,
    `${safe.xp.toLocaleString('id-ID')} XP`,
  ]
  ctx.font = font(34, 800)
  const pillW = 300
  const gap = 32
  const totalW = pillW * 2 + gap
  stats.forEach((label, i) => {
    const x = CARD_W / 2 - totalW / 2 + i * (pillW + gap)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)'
    roundedRect(ctx, x, 1150, pillW, 64, 32)
    ctx.fill()
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(label, x + pillW / 2, 1183)
  })

  // Footer: tautan + ajakan.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.font = font(30, 600)
  ctx.fillText('lolosin.netlify.app', CARD_W / 2, 1280)

  return canvasToBlob(canvas)
}

/** Fallback unduh: simpan blob sebagai file lewat tautan sementara. */
function downloadBlob(blob: Blob): boolean {
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = FILE_NAME
    document.body.append(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch {
    return false
  }
}

/** iOS Safari tidak mendukung atribut download pada anchor. */
function supportsDownloadAttribute(): boolean {
  try {
    return 'download' in document.createElement('a')
  } catch {
    return false
  }
}

/**
 * Fallback tab baru (iOS Safari): buka PNG di tab baru supaya user
 * bisa simpan manual dari sana. Mengembalikan false bila window.open
 * diblokir (return null) atau melempar.
 */
function openBlobInNewTab(blob: Blob): boolean {
  try {
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (!win) {
      URL.revokeObjectURL(url)
      return false
    }
    // Revoke ditunda: tab baru butuh URL-nya masih hidup saat memuat.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return true
  } catch {
    return false
  }
}

/**
 * Fallback setelah Web Share tidak dipakai atau gagal: unduh PNG bila
 * atribut download didukung, kalau tidak buka di tab baru. Bila
 * unduh gagal, buka-tab dicoba sebagai jalan terakhir.
 */
function fallbackDeliver(blob: Blob): SharePetPhotoResult {
  if (supportsDownloadAttribute()) {
    if (downloadBlob(blob)) return 'downloaded'
    return openBlobInNewTab(blob) ? 'opened' : 'failed'
  }
  return openBlobInNewTab(blob) ? 'opened' : 'failed'
}

/**
 * Putuskan apakah Web Share API layak dicoba. canShare dibungkus
 * try/catch: di beberapa browser/HP canShare melempar exception, dan
 * itu tidak boleh menggagalkan berbagi tanpa feedback. Bila canShare
 * tidak ada sebagai fungsi tapi navigator.share ada, coba share
 * langsung (ketiadaan canShare bukan alasan gagal).
 */
function shouldTryWebShare(file: File): boolean {
  if (typeof navigator === 'undefined') return false
  if (typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare !== 'function') return true
  try {
    return navigator.canShare({ files: [file] })
  } catch {
    // canShare melempar: coba share langsung, kegagalannya ditangkap
    // pemanggil dan dilanjutkan ke fallback unduh/buka-tab.
    return true
  }
}

/**
 * Bagikan kartu foto peliharaan. Coba Web Share API dengan files
 * dulu, lalu fallback unduh PNG (atau buka di tab baru di iOS).
 * Mengembalikan 'cancelled' bila user menutup sheet berbagi tanpa
 * memilih tujuan (bukan kegagalan).
 */
export async function sharePetPhoto(
  mascotSvg: SVGSVGElement | null,
  data: PetShareCardData,
): Promise<SharePetPhotoResult> {
  if (!mascotSvg) return 'failed'
  let blob: Blob
  try {
    blob = await renderPetShareCard(mascotSvg, data)
  } catch {
    return 'failed'
  }
  const file = new File([blob], FILE_NAME, { type: 'image/png' })
  if (shouldTryWebShare(file)) {
    try {
      const startedAt = performance.now()
      await navigator.share({
        title: 'Lolosin',
        text: petShareText(data.streak),
        url: LOLOSIN_URL,
        files: [file],
      })
      // Resolve instan = no-op (sheet tidak tampil, pola Brave/Chrome
      // tertentu): jangan pernah laporkan 'shared', lanjut ke
      // fallback unduh/buka-tab di bawah.
      if (performance.now() - startedAt >= SHARE_MIN_REALISTIC_MS) {
        return 'shared'
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled'
      }
      // Gagal berbagi (mis. tujuan tidak mendukung file): lanjut ke
      // fallback unduh/buka-tab di bawah, bukan langsung 'failed'.
    }
  }
  return fallbackDeliver(blob)
}
