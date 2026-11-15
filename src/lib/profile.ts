/**
 * Foto profil dan avatar maskot (v2.2.1).
 *
 * Foto yang diunggah dan pilihan avatar disimpan di localStorage
 * dengan namespacing per user lewat helper di lib/storage.ts, jadi
 * dua akun yang login bergantian di browser yang sama tidak saling
 * melihat foto atau avatar satu sama lain:
 *
 * - foto:    `lolosin:profil-foto:<userId>` (atau `:guest` untuk tamu)
 * - avatar:  `lolosin:profil-avatar:<userId>` (atau `:guest`)
 *
 * Foto yang diunggah selalu didahulukan atas avatar maskot saat
 * ditampilkan (lihat ProfileAvatar).
 *
 * Reaktivitas mengikuti pola emit/subscribe di lib/store.ts: header
 * (AuthStatus) tidak me-remount saat navigasi, jadi perubahan foto
 * atau avatar di halaman Profil harus langsung tercermin di header
 * lewat hook useProfileAvatar().
 */
import { useSyncExternalStore } from 'react'
import { MASCOT_NAME } from './mascot'
import type { MascotMood } from '../components/Mascot'
import type { PetOutfit } from './pet'
import {
  getCurrentNamespace,
  migrateLegacyKey,
  scopedKey,
} from './storage'

/** Key dasar foto profil (ditambah namespace user lewat scopedKey). */
export const PROFILE_PHOTO_KEY = 'lolosin:profil-foto'

/** Key dasar pilihan avatar (ditambah namespace user lewat scopedKey). */
export const PROFILE_AVATAR_KEY = 'lolosin:profil-avatar'

/** Sisi terpanjang foto setelah di-resize, dalam px. */
export const PROFILE_PHOTO_MAX_SIDE = 256

/** Kualitas JPEG foto yang disimpan (0 sampai 1). */
export const PROFILE_PHOTO_JPEG_QUALITY = 0.8

/** Pesan saat penyimpanan browser penuh atau foto tidak muat. */
export const PHOTO_TOO_BIG_MESSAGE =
  'Fotonya kebesaran, coba foto lain yang lebih kecil ya.'

/** Pesan saat file yang dipilih bukan gambar. */
export const PHOTO_INVALID_MESSAGE =
  'File itu bukan gambar. Pilih file foto ya.'

/** Pesan saat foto gagal diproses. */
export const PHOTO_FAILED_MESSAGE =
  'Fotonya gagal diproses, coba foto lain ya.'

/** Id varian avatar maskot. */
export type AvatarVariantId =
  | 'wisuda'
  | 'kacamata'
  | 'mahkota'
  | 'syal'
  | 'musik'
  | 'polos'
  | 'wisudawan'

/**
 * Satu varian avatar: kombinasi mood, outfit, topi wisuda, dan
 * headphone dari art maskot yang sudah ada. Semua varian tetap cute:
 * tidak ada mood marah atau sedih di sini.
 */
export interface AvatarVariant {
  id: AvatarVariantId
  nama: string
  mood: MascotMood
  outfit: PetOutfit
  showCap: boolean
  headphones: boolean
}

/** Semua varian avatar yang bisa dipilih di halaman Profil. */
export const AVATAR_VARIANTS: AvatarVariant[] = [
  {
    id: 'wisuda',
    nama: `${MASCOT_NAME} Wisuda`,
    mood: 'senang',
    outfit: 'none',
    showCap: true,
    headphones: false,
  },
  {
    id: 'kacamata',
    nama: `${MASCOT_NAME} Kacamata`,
    mood: 'senang',
    outfit: 'kacamata',
    showCap: true,
    headphones: false,
  },
  {
    id: 'mahkota',
    nama: `${MASCOT_NAME} Mahkota`,
    mood: 'semangat',
    outfit: 'mahkota',
    showCap: true,
    headphones: false,
  },
  {
    id: 'syal',
    nama: `${MASCOT_NAME} Syal`,
    mood: 'senang',
    outfit: 'syal',
    showCap: true,
    headphones: false,
  },
  {
    id: 'musik',
    nama: `${MASCOT_NAME} Musik`,
    mood: 'semangat',
    outfit: 'none',
    showCap: false,
    headphones: true,
  },
  {
    id: 'polos',
    nama: `${MASCOT_NAME} Polos`,
    mood: 'senang',
    outfit: 'none',
    showCap: false,
    headphones: false,
  },
  {
    id: 'wisudawan',
    nama: `${MASCOT_NAME} Wisudawan`,
    mood: 'semangat',
    outfit: 'jubah',
    showCap: true,
    headphones: false,
  },
]

/** Varian default: topi wisuda. */
export const DEFAULT_AVATAR_VARIANT_ID: AvatarVariantId = 'wisuda'

/** Cari varian dari id-nya; id tidak dikenal kembali ke varian default. */
export function getAvatarVariant(id: AvatarVariantId): AvatarVariant {
  return (
    AVATAR_VARIANTS.find((variant) => variant.id === id) ??
    AVATAR_VARIANTS[0]!
  )
}

/** True bila string adalah id varian yang dikenal. */
function isAvatarVariantId(value: string | null): value is AvatarVariantId {
  return (
    value !== null &&
    AVATAR_VARIANTS.some((variant) => variant.id === value)
  )
}

/** State avatar profil: foto (data URL) dan id varian yang dipilih. */
export interface ProfileAvatarState {
  photo: string | null
  variantId: AvatarVariantId
}

const listeners = new Set<() => void>()

/**
 * Snapshot yang di-cache, supaya getSnapshot mengembalikan referensi
 * yang sama selama tidak ada perubahan (syarat useSyncExternalStore).
 * Cache ikut mengingat namespace-nya: saat user berubah (login,
 * logout, ganti akun), snapshot dimuat ulang dari namespace baru.
 */
let cachedSnapshot: ProfileAvatarState | null = null
let cachedNamespace: string | null = null

/** Kosongkan cache lalu beri tahu semua subscriber. */
function emit(): void {
  cachedSnapshot = null
  listeners.forEach((listener) => listener())
}

/** Daftarkan listener perubahan avatar, mengembalikan unsubscribe. */
export function subscribeProfileAvatar(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Baca foto dan pilihan avatar dari localStorage (namespace aktif). */
function loadFromStorage(): ProfileAvatarState {
  let photo: string | null = null
  let variantId: AvatarVariantId = DEFAULT_AVATAR_VARIANT_ID
  try {
    migrateLegacyKey(PROFILE_PHOTO_KEY)
    migrateLegacyKey(PROFILE_AVATAR_KEY)
    const rawPhoto = localStorage.getItem(scopedKey(PROFILE_PHOTO_KEY))
    if (rawPhoto && rawPhoto.startsWith('data:image/')) {
      photo = rawPhoto
    }
    const rawVariant = localStorage.getItem(scopedKey(PROFILE_AVATAR_KEY))
    if (isAvatarVariantId(rawVariant)) {
      variantId = rawVariant
    }
  } catch {
    // localStorage tidak tersedia: pakai default (tanpa foto, avatar wisuda).
  }
  return { photo, variantId }
}

/** Baca state avatar saat ini (dari cache, dimuat malas dari localStorage). */
export function getProfileAvatar(): ProfileAvatarState {
  const namespace = getCurrentNamespace()
  if (cachedSnapshot && cachedNamespace === namespace) {
    return cachedSnapshot
  }
  cachedNamespace = namespace
  cachedSnapshot = loadFromStorage()
  return cachedSnapshot
}

/** Hook React: state avatar profil yang reaktif terhadap perubahan. */
export function useProfileAvatar(): ProfileAvatarState {
  return useSyncExternalStore(
    subscribeProfileAvatar,
    getProfileAvatar,
    getProfileAvatar,
  )
}

/** Simpan pilihan avatar, lalu beri tahu semua subscriber. */
export function setProfileAvatarVariant(variantId: AvatarVariantId): void {
  try {
    localStorage.setItem(scopedKey(PROFILE_AVATAR_KEY), variantId)
  } catch {
    // Gagal simpan (penyimpanan penuh atau tidak tersedia): pilihan
    // tetap tampil sampai reload, jangan crash.
  }
  emit()
}

/**
 * Simpan foto profil (data URL yang sudah di-resize). Melempar Error
 * ramah bila penyimpanan penuh (QuotaExceededError).
 */
export function setProfilePhoto(dataUrl: string): void {
  try {
    localStorage.setItem(scopedKey(PROFILE_PHOTO_KEY), dataUrl)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      throw new Error(PHOTO_TOO_BIG_MESSAGE)
    }
    throw new Error(PHOTO_FAILED_MESSAGE)
  }
  emit()
}

/** Hapus foto profil, kembali ke avatar maskot. */
export function removeProfilePhoto(): void {
  try {
    localStorage.removeItem(scopedKey(PROFILE_PHOTO_KEY))
  } catch {
    // Abaikan, foto sudah tidak terbaca juga.
  }
  emit()
}

/**
 * Resize dan kompres foto di client lewat canvas sebelum disimpan:
 * sisi terpanjang maksimal 256px, JPEG kualitas 0.8, latar putih
 * (supaya gambar transparan tidak jadi berlatar hitam). Mengembalikan
 * data URL siap simpan. Melempar Error ramah bila file bukan gambar
 * atau gagal diproses.
 */
export function processProfilePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error(PHOTO_INVALID_MESSAGE))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(PHOTO_FAILED_MESSAGE))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error(PHOTO_FAILED_MESSAGE))
      img.onload = () => {
        try {
          const longest = Math.max(img.naturalWidth, img.naturalHeight)
          const scale = Math.min(
            1,
            PROFILE_PHOTO_MAX_SIDE / Math.max(1, longest),
          )
          const width = Math.max(1, Math.round(img.naturalWidth * scale))
          const height = Math.max(1, Math.round(img.naturalHeight * scale))
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error(PHOTO_FAILED_MESSAGE))
            return
          }
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, 0, width, height)
          ctx.drawImage(img, 0, 0, width, height)
          resolve(
            canvas.toDataURL('image/jpeg', PROFILE_PHOTO_JPEG_QUALITY),
          )
        } catch {
          reject(new Error(PHOTO_FAILED_MESSAGE))
        }
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
