/**
 * Helper auth untuk Lolosin: daftar, masuk, keluar, profil, dan
 * listener perubahan status auth.
 *
 * Semua fungsi aman dipakai saat Supabase belum terkonfigurasi (client
 * null): fungsi baca mengembalikan null, fungsi tulis melempar Error
 * dengan pesan ramah. Modul ini tidak pernah me-log key atau password.
 *
 * Catatan alur daftar: proyek Supabase baru secara default mengharuskan
 * konfirmasi email, jadi signUp bisa sukses TANPA session. Dalam kasus
 * itu profil belum bisa dibuat (RLS insert profiles mensyaratkan user
 * terautentikasi), jadi pembuatan profil ditunda sampai user pertama
 * kali masuk, lewat ensureMyProfile(). Username disimpan di
 * user_metadata saat signUp agar bisa dipakai nanti. Formasi TIDAK
 * lagi ditanya saat daftar (sejak v2.2); user mengisinya di halaman
 * Profil. Metadata lama yang masih punya formasi tetap dibaca
 * ensureMyProfile supaya pendaftaran lama tidak rusak.
 *
 * Catatan redirect: semua email auth dan login Google memakai
 * AUTH_REDIRECT_URL di bawah. Supabase tetap memakai Site URL dari
 * dashboard sebagai fallback, jadi Site URL harus diatur ke domain
 * produksi (lihat docs/PANDUAN-GOOGLE-OAUTH.md). Tanpa itu, tautan
 * verifikasi email bisa mengarah ke localhost.
 */
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabase'

/** Baris tabel public.profiles. */
export interface Profile {
  id: string
  username: string
  formasi: string | null
  created_at: string
  /** Premium Beta (migrasi 003). Undefined bila kolom belum ada di DB. */
  is_premium?: boolean
}

/** URL kembali setelah verifikasi email dan login Google. */
export const AUTH_REDIRECT_URL = 'https://lolosin.netlify.app/#/auth'

/** Pesan saat Supabase belum terkonfigurasi. */
export const AUTH_NOT_CONFIGURED_MESSAGE = 'Fitur akun belum aktif'

/** Pesan saat username sudah dipakai user lain. */
export const USERNAME_TAKEN_MESSAGE =
  'Username itu udah dipakai orang, coba yang lain ya'

/** Pesan saat kolom is_premium belum ada (migrasi 003 belum dijalankan). */
export const PREMIUM_COLUMN_MISSING_MESSAGE =
  'Jalankan dulu migrasi 003 di SQL Editor'

/** Aturan username: 3-20 karakter, huruf kecil, angka, underscore. */
export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20
export const USERNAME_PATTERN = /^[a-z0-9_]+$/

/** Pesan format username, dipakai form daftar dan lengkapi profil. */
export const USERNAME_FORMAT_MESSAGE = `Username ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} karakter, huruf, angka, atau underscore aja ya`

/** Normalisasi username: trim lalu huruf kecil, agar unik tanpa peduli kapital. */
function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

/** True bila username memenuhi aturan format (panjang dan karakter). */
export function isValidUsername(username: string): boolean {
  const clean = normalizeUsername(username)
  return (
    clean.length >= USERNAME_MIN_LENGTH &&
    clean.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(clean)
  )
}

/** True bila email user sudah terkonfirmasi (email_confirmed_at terisi). */
export function isEmailVerified(user: User | null): boolean {
  return Boolean(user?.email_confirmed_at)
}

/** Terjemahkan pesan error Supabase Auth ke bahasa santai yang ramah. */
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('user already registered')) {
    return 'Email itu udah terdaftar. Coba masuk aja ya.'
  }
  if (lower.includes('invalid login credentials')) {
    return 'Email atau password-nya salah. Coba lagi ya.'
  }
  if (lower.includes('email not confirmed')) {
    return 'Emailmu belum dikonfirmasi. Cek inbox dan klik tautan konfirmasinya dulu ya.'
  }
  if (lower.includes('password should be at least 6 characters')) {
    return 'Password minimal 6 karakter ya.'
  }
  if (lower.includes('invalid email') || lower.includes('email address')) {
    return 'Format email-nya belum benar ya.'
  }
  if (
    lower.includes('too many requests') ||
    lower.includes('rate limit') ||
    lower.includes('email rate limit')
  ) {
    return 'Kebanyakan percobaan, tunggu sebentar lalu coba lagi ya.'
  }
  if (lower.includes('same password')) {
    return 'Password barunya sama kayak yang lama. Coba yang beda ya.'
  }
  if (lower.includes('expired')) {
    return 'Tautan itu sudah kedaluwarsa. Minta tautan baru lewat tombol kirim ulang ya.'
  }
  if (lower.includes('provider')) {
    return 'Login Google belum diaktifkan. Coba daftar pakai email dulu ya.'
  }
  return 'Ada yang salah, coba lagi ya.'
}

/** True bila error Postgres adalah pelanggaran unique constraint. */
function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === '23505'
}

/** Kolom profiles yang dibaca, termasuk is_premium (migrasi 003). */
const PROFILE_COLUMNS = 'id, username, formasi, created_at, is_premium'

/** Kolom profiles sebelum migrasi 003 (tanpa is_premium). */
const PROFILE_COLUMNS_LEGACY = 'id, username, formasi, created_at'

/** True bila error PostgREST menandakan kolom belum ada di tabel. */
function isMissingColumnError(error: {
  code?: string
  message?: string
}): boolean {
  return (
    error.code === '42703' ||
    (typeof error.message === 'string' &&
      error.message.includes('is_premium'))
  )
}

/**
 * Baca satu baris profiles berdasarkan id user. Bila select dengan
 * is_premium gagal karena kolomnya belum ada (migrasi 003 belum
 * jalan), ulangi select tanpa kolom itu. Error lain langsung
 * mengembalikan null.
 */
async function selectProfileById(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle()
  if (!error) return data as Profile | null
  if (!isMissingColumnError(error)) return null
  const retry = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS_LEGACY)
    .eq('id', userId)
    .maybeSingle()
  if (retry.error) return null
  return retry.data as Profile | null
}

/** User yang sedang login, atau null bila belum login / Supabase belum aktif. */
export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}

/** Session aktif, atau null bila belum login / Supabase belum aktif. */
export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  return data.session
}

/**
 * True bila username belum dipakai user lain.
 * Melempar Error ramah bila Supabase belum aktif atau query gagal.
 */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  if (!supabase) throw new Error(AUTH_NOT_CONFIGURED_MESSAGE)
  const clean = normalizeUsername(username)
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', clean)
    .maybeSingle()
  if (error) throw new Error(friendlyAuthError(error.message))
  return data === null
}

/**
 * Daftar akun baru (hanya email, password, dan username).
 *
 * - Cek dulu username belum dipakai, lalu auth.signUp.
 * - Bila session langsung ada (konfirmasi email nonaktif), baris
 *   profiles langsung dibuat.
 * - Bila needsConfirmation true (session null karena email wajib
 *   dikonfirmasi), profil TIDAK dibuat sekarang. Profil dibuat nanti
 *   saat user pertama kali masuk, lewat ensureMyProfile() yang dipanggil
 *   signIn(). Username tersimpan di user_metadata.
 *
 * Kegagalan insert profil tidak menggagalkan pendaftaran: user sudah
 * terdaftar di Auth, dan ensureMyProfile() akan mencoba lagi saat masuk.
 */
export async function signUp(
  email: string,
  password: string,
  username: string,
): Promise<{ user: User | null; needsConfirmation: boolean }> {
  if (!supabase) throw new Error(AUTH_NOT_CONFIGURED_MESSAGE)
  const cleanUsername = normalizeUsername(username)

  const available = await isUsernameAvailable(cleanUsername)
  if (!available) throw new Error(USERNAME_TAKEN_MESSAGE)

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { username: cleanUsername },
      emailRedirectTo: AUTH_REDIRECT_URL,
    },
  })
  if (error) throw new Error(friendlyAuthError(error.message))

  const user = data.user
  const needsConfirmation = data.session === null

  if (user && !needsConfirmation) {
    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      username: cleanUsername,
      formasi: null,
    })
    if (insertError) {
      if (isUniqueViolation(insertError)) {
        throw new Error(USERNAME_TAKEN_MESSAGE)
      }
      console.warn(
        'Gagal membuat profil setelah daftar, akan dicoba lagi saat masuk:',
        insertError.message,
      )
    }
  }

  return { user, needsConfirmation }
}

/**
 * Masuk dengan email dan password. Setelah berhasil, pastikan profil
 * ada (menutupi kasus daftar lalu konfirmasi email, di mana profil
 * belum dibuat saat signUp). Profil HANYA dibuat bila email sudah
 * terkonfirmasi; user yang belum verifikasi tidak dapat profil dan
 * diblokir gate verifikasi di App.
 */
export async function signIn(
  email: string,
  password: string,
): Promise<{ user: User | null; session: Session | null }> {
  if (!supabase) throw new Error(AUTH_NOT_CONFIGURED_MESSAGE)
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw new Error(friendlyAuthError(error.message))
  if (data.user && isEmailVerified(data.user)) {
    await ensureMyProfile()
  }
  return { user: data.user, session: data.session }
}

/**
 * Masuk dengan Google (OAuth). Browser dialihkan ke Google, lalu
 * kembali ke AUTH_REDIRECT_URL; Supabase menukar code jadi session
 * secara otomatis dan onAuthStateChange memberi tahu app.
 *
 * Provider Google harus diaktifkan dulu di dashboard Supabase
 * (lihat docs/PANDUAN-GOOGLE-OAUTH.md). Bila belum aktif, Supabase
 * mengembalikan error dan fungsi ini melempar pesan ramah.
 */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error(AUTH_NOT_CONFIGURED_MESSAGE)
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: AUTH_REDIRECT_URL },
  })
  if (error) throw new Error(friendlyAuthError(error.message))
}

/**
 * Buat profil untuk user yang sudah login tapi belum punya baris
 * profiles (kasus utama: login Google, yang tidak melewati form
 * daftar). Username dicek dulu ketersediaannya, lalu profil dibuat
 * dengan formasi kosong; formasi bisa diisi nanti di halaman Profil.
 */
export async function completeProfile(username: string): Promise<Profile> {
  if (!supabase) throw new Error(AUTH_NOT_CONFIGURED_MESSAGE)
  const cleanUsername = normalizeUsername(username)
  if (!isValidUsername(cleanUsername)) {
    throw new Error(USERNAME_FORMAT_MESSAGE)
  }
  const available = await isUsernameAvailable(cleanUsername)
  if (!available) throw new Error(USERNAME_TAKEN_MESSAGE)
  const user = await getCurrentUser()
  if (!user) throw new Error('Sesi loginmu habis, masuk lagi ya.')
  const { error } = await supabase.from('profiles').insert({
    id: user.id,
    username: cleanUsername,
    formasi: null,
  })
  if (error) {
    if (isUniqueViolation(error)) throw new Error(USERNAME_TAKEN_MESSAGE)
    throw new Error(friendlyAuthError(error.message))
  }
  const profile = await selectProfileById(user.id)
  if (!profile) throw new Error('Profilmu belum kebuat, coba lagi ya.')
  return profile
}

/**
 * Perbarui profil user yang sedang login (formasi dan/atau Premium
 * Beta). Formasi dinormalisasi: trim, huruf kecil, spasi ganda
 * dirapikan; string kosong disimpan sebagai null.
 *
 * Bila update is_premium gagal karena kolomnya belum ada (migrasi
 * 003 belum dijalankan), melempar PREMIUM_COLUMN_MISSING_MESSAGE
 * supaya halaman Profil bisa menampilkan petunjuk yang jelas.
 */
export async function updateMyProfile(patch: {
  formasi?: string | null
  is_premium?: boolean
}): Promise<Profile> {
  if (!supabase) throw new Error(AUTH_NOT_CONFIGURED_MESSAGE)
  const user = await getCurrentUser()
  if (!user) throw new Error('Sesi loginmu habis, masuk lagi ya.')
  const updates: { formasi?: string | null; is_premium?: boolean } = {}
  if (patch.formasi !== undefined) {
    const clean =
      patch.formasi === null
        ? null
        : patch.formasi.trim().toLowerCase().replace(/\s+/g, ' ') || null
    updates.formasi = clean
  }
  if (patch.is_premium !== undefined) updates.is_premium = patch.is_premium
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error(PREMIUM_COLUMN_MISSING_MESSAGE)
    }
    throw new Error(friendlyAuthError(error.message))
  }
  const profile = await selectProfileById(user.id)
  if (!profile) throw new Error('Profilmu belum ketemu, coba lagi ya.')
  return profile
}

/** Keluar. Aman dipanggil saat Supabase belum aktif (tidak ngapa-ngapain). */
export async function signOut(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(friendlyAuthError(error.message))
}

/** Profil user yang sedang login, atau null bila belum login / belum ada profil. */
export async function getMyProfile(): Promise<Profile | null> {
  if (!supabase) return null
  const user = await getCurrentUser()
  if (!user) return null
  return selectProfileById(user.id)
}

/**
 * Pastikan user yang sedang login punya baris profiles. Bila belum ada,
 * buat dari username yang tersimpan di user_metadata saat signUp.
 * Mengembalikan profil yang ada atau yang baru dibuat, atau null bila
 * tidak bisa dibuat (mis. username tidak tersimpan, seperti login
 * Google yang belum melengkapi profil).
 */
export async function ensureMyProfile(): Promise<Profile | null> {
  if (!supabase) return null
  const existing = await getMyProfile()
  if (existing) return existing

  const user = await getCurrentUser()
  if (!user) return null

  const rawUsername = user.user_metadata?.username
  const username =
    typeof rawUsername === 'string' ? normalizeUsername(rawUsername) : ''
  if (!isValidUsername(username)) return null
  // Metadata lama masih bisa punya formasi (pendaftaran sebelum v2.2):
  // tetap dipakai, tapi pendaftaran baru tidak mengisinya lagi.
  const rawFormasi = user.user_metadata?.formasi
  const formasi = typeof rawFormasi === 'string' ? rawFormasi.trim() : ''
  const { error } = await supabase
    .from('profiles')
    .insert({ id: user.id, username, formasi: formasi || null })
  if (error) return null
  return selectProfileById(user.id)
}

/** Kirim ulang email konfirmasi pendaftaran ke alamat email tersebut. */
export async function resendConfirmation(email: string): Promise<void> {
  if (!supabase) throw new Error(AUTH_NOT_CONFIGURED_MESSAGE)
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: AUTH_REDIRECT_URL },
  })
  if (error) throw new Error(friendlyAuthError(error.message))
}

/**
 * Dengarkan perubahan status auth (masuk, keluar, refresh token).
 * Mengembalikan fungsi unsubscribe. Aman saat Supabase belum aktif
 * (mengembalikan fungsi kosong).
 */
export function onAuthChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange(callback)
  return () => {
    data.subscription.unsubscribe()
  }
}

/**
 * Hook status login: user yang sedang masuk + apakah statusnya masih
 * dimuat. Dipakai beranda (landing vs dashboard) dan widget akun.
 *
 * Saat Supabase belum terkonfigurasi, langsung mengembalikan user null
 * dan loading false (mode lokal: tidak ada sistem akun).
 */
export function useAuthUser(): { user: User | null; loading: boolean } {
  const configured = isSupabaseConfigured()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(configured)

  useEffect(() => {
    if (!configured) return
    let cancelled = false

    getCurrentUser().then((current) => {
      if (cancelled) return
      setUser(current)
      setLoading(false)
    })

    const unsubscribe = onAuthChange((_event, session) => {
      if (cancelled) return
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [configured])

  return { user, loading }
}
