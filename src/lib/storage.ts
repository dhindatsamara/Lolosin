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
 * ini saat user berubah, lewat setStoreUserId di lib/store.ts.
 *
 * Key Supabase sendiri (`sb-<ref>-auth-token`) tidak pernah disentuh
 * modul ini.
 */

/** Namespace untuk tamu (belum login). */
export const GUEST_NAMESPACE = 'guest'

/** Id user Supabase yang aktif, atau null untuk tamu. Default tamu. */
let currentUserId: string | null = null

/** Ganti user aktif (dipanggil setStoreUserId saat login/logout/ganti akun). */
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
