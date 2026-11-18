/**
 * Peta petualangan kelemahan (v2.8.1): geometri peta SVG + kalimat
 * pemandu Osi. File ini murni logika (tanpa JSX) supaya gampang
 * dites dan dipakai ulang.
 *
 * Peta digambar di viewBox selebar 360 unit dan memanjang ke bawah
 * mengikuti jumlah subtopik. Tiap subtopik jadi satu node di
 * sepanjang jalur berliku: node tersebar kiri-kanan bergantian,
 * paling lemah di paling atas (urutan rows sudah paling lemah dulu
 * dari weaknessRowsFromStats). Osi berdiri di atas node pertama dan
 * jalur putus-putus mengalir dari kakinya ke node pertama.
 *
 * ATURAN TEKS: tanpa em-dash, pakai "bagian" bukan kata terlarang
 * user untuk sub-bagian, nama maskot hanya lewat MASCOT_NAME
 * (jangan hardcode).
 */
import { MASCOT_NAME } from './mascot'
import type { MascotMood } from '../components/Mascot'
import type { WeaknessRow } from './weakness'

/** Lebar viewBox peta (unit SVG, diskalakan CSS ke lebar container). */
export const ADVENTURE_MAP_WIDTH = 360

/** Jarak vertikal antar node (unit viewBox). */
export const ADVENTURE_NODE_STEP_Y = 148

/** Posisi y node pertama: memberi ruang untuk Osi + bubble di atas. */
export const ADVENTURE_TOP_PAD = 170

/** Ruang di bawah node terakhir untuk labelnya. */
export const ADVENTURE_BOTTOM_PAD = 80

/** Posisi y tengah Osi di zona atas peta. */
export const ADVENTURE_OSI_Y = 52

/** Posisi y awal jalur (di bawah kaki Osi) menuju node pertama. */
const PATH_START_Y = 94

/**
 * Posisi x node sebagai fraksi lebar peta. Genap di kiri, ganjil di
 * kanan, dengan sedikit variasi supaya jalurnya terasa organik dan
 * tidak seperti zigzag mesin. Pola berulang tiap 6 node.
 */
const X_FRACS = [0.27, 0.73, 0.23, 0.77, 0.3, 0.7]

/** Posisi satu node dalam unit viewBox. */
export function adventureNodePosition(index: number): {
  x: number
  y: number
} {
  return {
    x: X_FRACS[index % X_FRACS.length] * ADVENTURE_MAP_WIDTH,
    y: ADVENTURE_TOP_PAD + index * ADVENTURE_NODE_STEP_Y,
  }
}

/** Fraksi x node (0 sampai 1), dipakai overlay HTML berbasis persen. */
export function adventureNodeXFrac(index: number): number {
  return X_FRACS[index % X_FRACS.length]
}

/** Tinggi viewBox peta untuk jumlah node tertentu. */
export function adventureMapHeight(count: number): number {
  if (count <= 0) return ADVENTURE_TOP_PAD + ADVENTURE_BOTTOM_PAD
  return (
    ADVENTURE_TOP_PAD + (count - 1) * ADVENTURE_NODE_STEP_Y +
    ADVENTURE_BOTTOM_PAD
  )
}

/**
 * Path jalur petualangan (atribut `d` SVG): garis lurus dari kaki
 * Osi ke node pertama, lalu kurva-S halus antar node. Kurva dibuat
 * dari dua titik kontrol di titik tengah vertikal antar node,
 * sehingga tangennya selalu vertikal di tiap node dan jalurnya
 * mengalir mulus.
 */
export function adventurePathD(count: number): string {
  if (count <= 0) return ''
  const first = adventureNodePosition(0)
  let d = `M ${first.x} ${PATH_START_Y} L ${first.x} ${first.y}`
  for (let i = 1; i < count; i += 1) {
    const prev = adventureNodePosition(i - 1)
    const curr = adventureNodePosition(i)
    const midY = (prev.y + curr.y) / 2
    d += ` C ${prev.x} ${midY} ${curr.x} ${midY} ${curr.x} ${curr.y}`
  }
  return d
}

/** Kunci unik satu baris subtopik, dipakai state node terpilih. */
export function adventureNodeKey(row: WeaknessRow): string {
  return `${row.materi}|${row.subtopik}`
}

/**
 * Kalimat pemandu Osi. Dipilih dari daftar variasi berdasarkan hari
 * (rotasi harian, deterministik), supaya tiap kunjungan di hari yang
 * berbeda terasa segar tanpa perlu state tambahan.
 */
export function guideMessage(args: {
  /** Mode terkunci (akun free): tanpa nama subtopik, tanpa angka. */
  locked: boolean
  /** True bila semua subtopik sudah level kuat. */
  allStrong: boolean
  /** Subtopik terlemah (null di mode terkunci). */
  weakest: WeaknessRow | null
}): { mood: MascotMood; text: string } {
  const { locked, allStrong, weakest } = args
  const dayIndex = Math.floor(Date.now() / 86_400_000)
  const pick = (variants: string[]) =>
    variants[dayIndex % variants.length]

  if (locked) {
    return {
      mood: 'senang',
      text: pick([
        `Peta petualanganmu udah kebentuk! Buka Premium biar ${MASCOT_NAME} bisa nunjukin jalan.`,
        `Jalannya masih terkunci nih. Buka Premium biar ${MASCOT_NAME} bisa nemenin.`,
      ]),
    }
  }

  if (allStrong) {
    return {
      mood: 'kagum',
      text: pick([
        `Wah, semua bagianmu udah kuat! ${MASCOT_NAME} bangga banget.`,
        `Keren! Semua bagian udah kuat, pertahanin terus ya.`,
        `Hebat, petanya hijau semua! ${MASCOT_NAME} ikut senang.`,
      ]),
    }
  }

  const sub = weakest?.subtopik ?? ''
  if (weakest?.level === 'lemah') {
    return {
      mood: 'semangat',
      text: pick([
        `Ayo, ${sub} kita asah bareng!`,
        `Tenang, ${MASCOT_NAME} temenin sampai ${sub} naik.`,
        `Mulai dari ${sub} dulu yuk, pelan-pelan pasti bisa.`,
        `Jangan takut sama ${sub}, kita taklukin bareng!`,
      ]),
    }
  }

  // Terlemah levelnya cukup: tinggal dikit lagi menuju kuat.
  return {
    mood: 'semangat',
    text: pick([
      `${sub} tinggal dikit lagi menuju kuat, gas terus!`,
      `Dikit lagi ${sub} naik level, ${MASCOT_NAME} yakin kamu bisa.`,
      `Ayo push ${sub} sampai kuat, udah deket banget!`,
    ]),
  }
}
