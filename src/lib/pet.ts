/**
 * Streak sebagai peliharaan: maskot tumbuh dan dapat outfit baru
 * seiring streak belajar. Tangga evolusi di sini satu-satunya sumber
 * aturan stage, dipakai PetCard (dashboard) dan teaser di landing.
 *
 * Stage (syarat streak, outfit yang dirender Mascot):
 * - 0 hari: tanpa aksesori
 * - 3 hari: syal amber
 * - 7 hari: kacamata keren
 * - 14 hari: mahkota kecil
 * - 30 hari: jubah wisuda + mahkota
 */
import { useSyncExternalStore } from 'react'
import { MASCOT_NAME } from './mascot'
import { getCurrentNamespace, getScopedItem, setScopedItem } from './storage'

/** Aksesori yang bisa dipakai maskot (dirender Mascot lewat prop outfit). */
export type PetOutfit = 'none' | 'syal' | 'kacamata' | 'mahkota' | 'jubah'

/** Satu tahap evolusi peliharaan. */
export interface PetStage {
  id: string
  /** Streak minimum (hari) untuk mencapai stage ini. */
  minStreak: number
  nama: string
  outfit: PetOutfit
  deskripsi: string
}

export const PET_STAGES: PetStage[] = [
  {
    id: 'teman-baru',
    minStreak: 0,
    nama: 'Teman Baru',
    outfit: 'none',
    deskripsi: `${MASCOT_NAME} masih polos tanpa aksesori. Jaga streak biar dia tumbuh.`,
  },
  {
    id: 'sahabat-bersyal',
    minStreak: 3,
    nama: 'Sahabat Bersyal',
    outfit: 'syal',
    deskripsi: `${MASCOT_NAME} dapat syal amber hangat dari streak 3 harimu.`,
  },
  {
    id: 'si-kacamata-keren',
    minStreak: 7,
    nama: 'Si Kacamata Keren',
    outfit: 'kacamata',
    deskripsi: `${MASCOT_NAME} pakai kacamata hitam. Gayanya makin pede.`,
  },
  {
    id: 'raja-kecil',
    minStreak: 14,
    nama: 'Raja Kecil',
    outfit: 'mahkota',
    deskripsi: `Mahkota kecil bertengger di topi ${MASCOT_NAME}. Streak 2 minggu, bukan main.`,
  },
  {
    id: 'wisudawan-agung',
    minStreak: 30,
    nama: 'Wisudawan Agung',
    outfit: 'jubah',
    deskripsi: `${MASCOT_NAME} pakai jubah wisuda lengkap dengan mahkota. Tahap tertinggi.`,
  },
]

/** Progres peliharaan pada streak tertentu. */
export interface PetProgress {
  /** Stage saat ini (stage tertinggi yang syaratnya terpenuhi). */
  stage: PetStage
  /** Stage berikut, atau null bila sudah di tahap tertinggi. */
  next: PetStage | null
  /** Progres menuju stage berikut, 0 sampai 1 (1 bila sudah mentok). */
  progress: number
  /** Sisa hari streak menuju stage berikut (0 bila sudah mentok). */
  remaining: number
}

/**
 * Stage dan progres peliharaan dari streak (hari). Streak negatif
 * dianggap 0. Murni, gampang diuji tanpa store.
 */
export function getPetStage(streak: number): PetProgress {
  const safe = Math.max(0, Math.floor(streak))
  let index = 0
  for (let i = 0; i < PET_STAGES.length; i += 1) {
    if (safe >= PET_STAGES[i]!.minStreak) index = i
  }
  const stage = PET_STAGES[index]!
  const next = PET_STAGES[index + 1] ?? null
  if (!next) {
    return { stage, next: null, progress: 1, remaining: 0 }
  }
  const span = next.minStreak - stage.minStreak
  const done = safe - stage.minStreak
  return {
    stage,
    next,
    progress: span > 0 ? Math.min(1, Math.max(0, done / span)) : 1,
    remaining: next.minStreak - safe,
  }
}

/* ------------------------------------------------------------------ */
/* Pilihan outfit (picker "Gaya Osi", v2.3.2)                          */
/* ------------------------------------------------------------------ */

/** Key dasar pilihan outfit (ditambah namespace user lewat scopedKey). */
export const PET_OUTFIT_KEY = 'lolosin:pet-outfit'

/** Label pendek tiap outfit untuk picker. */
export const OUTFIT_LABELS: Record<PetOutfit, string> = {
  none: 'Polos',
  syal: 'Syal',
  kacamata: 'Kacamata',
  mahkota: 'Mahkota',
  jubah: 'Jubah',
}

const OUTFIT_VALUES: PetOutfit[] = [
  'none',
  'syal',
  'kacamata',
  'mahkota',
  'jubah',
]

function isPetOutfit(value: unknown): value is PetOutfit {
  return (
    typeof value === 'string' &&
    (OUTFIT_VALUES as string[]).includes(value)
  )
}

/** Outfit yang sudah terbuka pada streak tertentu. */
export function getUnlockedOutfits(streak: number): PetOutfit[] {
  const safe = Math.max(0, Math.floor(streak))
  return PET_STAGES.filter((s) => safe >= s.minStreak).map(
    (s) => s.outfit,
  )
}

/**
 * Outfit yang dirender: pilihan user bila masih terbuka, kalau tidak
 * (mis. streak putus lalu outfitnya terkunci lagi) jatuh ke outfit
 * tertinggi yang terbuka. Pilihan null berarti "pakai default".
 */
export function resolveOutfit(
  streak: number,
  chosen: PetOutfit | null,
): PetOutfit {
  const unlocked = getUnlockedOutfits(streak)
  if (chosen !== null && unlocked.includes(chosen)) return chosen
  return unlocked[unlocked.length - 1] ?? 'none'
}

const outfitListeners = new Set<() => void>()
let cachedOutfitNamespace: string | null = null
let cachedOutfit: PetOutfit | null = null

function loadChosenOutfit(): PetOutfit | null {
  try {
    const raw = getScopedItem(PET_OUTFIT_KEY)
    return isPetOutfit(raw) ? raw : null
  } catch {
    return null
  }
}

/** Baca pilihan outfit tersimpan (null = belum pernah memilih). */
export function getChosenOutfit(): PetOutfit | null {
  const namespace = getCurrentNamespace()
  if (cachedOutfitNamespace === namespace) return cachedOutfit
  cachedOutfitNamespace = namespace
  cachedOutfit = loadChosenOutfit()
  return cachedOutfit
}

function subscribeChosenOutfit(listener: () => void): () => void {
  outfitListeners.add(listener)
  return () => {
    outfitListeners.delete(listener)
  }
}

/** Hook React: pilihan outfit yang reaktif terhadap perubahan. */
export function useChosenOutfit(): PetOutfit | null {
  return useSyncExternalStore(
    subscribeChosenOutfit,
    getChosenOutfit,
    getChosenOutfit,
  )
}

/** Simpan pilihan outfit, lalu beri tahu semua subscriber. */
export function setChosenOutfit(outfit: PetOutfit): void {
  try {
    setScopedItem(PET_OUTFIT_KEY, outfit)
  } catch {
    // Gagal simpan (penyimpanan penuh atau tidak tersedia): pilihan
    // tetap tampil sampai reload, jangan crash.
  }
  cachedOutfit = outfit
  cachedOutfitNamespace = getCurrentNamespace()
  outfitListeners.forEach((listener) => listener())
}
