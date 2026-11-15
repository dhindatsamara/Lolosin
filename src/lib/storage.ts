/**
 * Namespacing localStorage per user (v2.2.1).
 *
 * Bug yang diperbaiki: progres disimpan dengan key global per-browser
 * (`lolosin:v1`), jadi dua akun yang login bergantian di browser yang
 * sama saling melihat progres satu sama lain. Sekarang setiap key
 * per-user di-scope ke namespace user yang aktif:
 *
 * - login: `lolosin:v1:<userId>` (userId = id user Supabase, UUID stabil)
 * - tamu:  `lolosin:v1:guest`
 *
 * Pola yang sama berlaku untuk semua key per-user lain (antrean skor
 * pending, skor terbaik game, daftar hafal Kartu Kilat): key dasarnya
 * tetap, namespace ditambahkan di belakang.
 *
 * Modul ini tidak tahu apa-apa soal auth (tanpa import dari lib/auth)
 * supaya tidak ada circular dependency: App yang memberi tahu modul
 * ini saat status auth sudah diketahui, lewat resolveAuth di lib/store.
 *
 * PENTING (v2.2.3): migrasi legacy HANYA boleh jalan setelah status
 * auth diketahui. Sebelumnya migrasi jalan saat store pertama dimuat,
 * padahal auth Supabase masih loading (user masih null), sehingga
 * progres akun lama tersalin ke namespace TAMU dan key legacy-nya
 * terhapus. Akibatnya: akun yang login mulai dari 0, sementara tampilan
 * tamu (belum login) masih menunjukkan progres lama. Gate
 * `authResolved` di bawah mencegah itu: migrateLegacyKey tidak
 * ngapa-ngapain sampai resolveAuth dipanggil App setelah loading auth
 * selesai.
 *
 * Key Supabase sendiri (`sb-<ref>-auth-token`) tidak pernah disentuh
 * modul ini.
 */

/** Namespace untuk tamu (belum login). */
export const GUEST_NAMESPACE = 'guest'

/** Id user Supabase yang aktif, atau null untuk tamu. Default tamu. */
let currentUserId: string | null = null

/**
 * Apakah status auth sudah diketahui (loading Supabase selesai).
 * Selama false, migrasi legacy ditahan (lihat migrateLegacyKey).
 */
let authResolved = false

/** Tandai status auth sudah diketahui (dipanggil resolveAuth). */
export function setAuthResolved(): void {
  authResolved = true
}

/** Apakah status auth sudah diketahui. */
export function isAuthResolved(): boolean {
  return authResolved
}

/** Ganti user aktif (dipanggil resolveAuth saat login/logout/ganti akun). */
export function setCurrentUserId(userId: string | null): void {
  currentUserId = userId
}

/** Id user aktif, atau null bila tamu. */
export function getCurrentUserId(): string | null {
  return currentUserId
}

/** Namespace aktif: id user saat login, 'guest' saat tamu. */
export function getCurrentNamespace(): string {
  return currentUserId ?? GUEST_NAMESPACE
}

/**
 * Key scoped untuk sebuah key dasar per-user, misal
 * scopedKey('lolosin:v1') jadi 'lolosin:v1:guest' atau
 * 'lolosin:v1:<userId>'.
 */
export function scopedKey(base: string): string {
  return `${base}:${getCurrentNamespace()}`
}

/**
 * Migrasi sekali dari key legacy tanpa namespace (misal `lolosin:v1`)
 * ke scoped key aktif. Bila legacy ada dan scoped key belum berisi
 * data, isi legacy disalin ke scoped key; legacy lalu selalu dihapus
 * supaya migrasi tidak terulang. Bila scoped key sudah berisi data,
 * legacy dibuang sebagai stale (tidak menimpa data yang sudah ada).
 * Aman dipanggil berulang: setelah migrasi pertama, legacy sudah
 * tidak ada lagi.
 */
export function migrateLegacyKey(base: string): void {
  // Tahan migrasi sampai status auth diketahui, supaya progres lama
  // tidak tersalin ke namespace yang salah (v2.2.3). Pemanggilan
  // berikutnya (setelah resolveAuth) akan menjalankan migrasi.
  if (!authResolved) return
  try {
    const legacy = localStorage.getItem(base)
    if (legacy === null) return
    const scoped = scopedKey(base)
    if (localStorage.getItem(scoped) === null) {
      localStorage.setItem(scoped, legacy)
    }
    localStorage.removeItem(base)
  } catch {
    // localStorage tidak tersedia: abaikan, migrasi dicoba lagi saat load berikutnya.
  }
}

/**
 * Semua key dasar per-user (tanpa namespace). Dipakai perbaikan
 * progres (moveGuestDataToUser). Nilainya diduplikasi dari konstanta
 * di masing-masing modul supaya modul ini tetap tanpa dependensi.
 */
const PER_USER_BASE_KEYS = [
  'lolosin:v1',
  'lolosin:pending-scores',
  'lolosin:profil-foto',
  'lolosin:profil-avatar',
  'lolosin:kuis-kilat-best',
  'lolosin:kartu-kilat:v1',
  'lolosin:benar-salah-best',
  'lolosin:pet-outfit',
]

/**
 * Pindahkan data tamu ke namespace user (perbaikan untuk korban bug
 * migrasi v2.2.1: progres akun lama tersalin ke namespace tamu).
 * Hanya key yang namespace user-nya masih kosong yang dipindah;
 * salinan tamu lalu dihapus supaya tamu mulai dari nol. Skor pending
 * aman dipindah karena flush hanya mengirim entri milik user aktif.
 */
export function moveGuestDataToUser(userId: string): void {
  try {
    for (const base of PER_USER_BASE_KEYS) {
      const guestKey = `${base}:${GUEST_NAMESPACE}`
      const userKey = `${base}:${userId}`
      const guestValue = localStorage.getItem(guestKey)
      if (guestValue === null) continue
      if (localStorage.getItem(userKey) === null) {
        localStorage.setItem(userKey, guestValue)
      }
      localStorage.removeItem(guestKey)
    }
  } catch {
    // localStorage tidak tersedia: abaikan, perbaikan bisa dicoba lagi.
  }
}

/** Key penanda user sudah menolak tawaran pindah progres (per user). */
function repairDeclinedKey(userId: string): string {
  return `lolosin:repair-declined:${userId}`
}

/** Apakah user sudah menolak tawaran pindah progres. */
export function hasDeclinedProgressRepair(userId: string): boolean {
  try {
    return localStorage.getItem(repairDeclinedKey(userId)) !== null
  } catch {
    return false
  }
}

/** Catat user menolak tawaran pindah progres (tidak ditanya lagi). */
export function declineProgressRepair(userId: string): void {
  try {
    localStorage.setItem(repairDeclinedKey(userId), '1')
  } catch {
    // localStorage tidak tersedia: abaikan.
  }
}
