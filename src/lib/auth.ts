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
 * kali masuk, lewat ensureMyProfile(). Username dan formasi disimpan
 * di user_metadata saat signUp agar bisa dipakai nanti.
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
}

/** Pesan saat Supabase belum terkonfigurasi. */
export const AUTH_NOT_CONFIGURED_MESSAGE = 'Fitur akun belum aktif'

/** Pesan saat username sudah dipakai user lain. */
export const USERNAME_TAKEN_MESSAGE =
  'Username itu udah dipakai orang, coba yang lain ya'

/** Aturan username: 3-20 karakter, huruf kecil, angka, underscore. */
export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20
export const USERNAME_PATTERN = /^[a-z0-9_]+$/

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
  return 'Ada yang salah, coba lagi ya.'
}

/** True bila error Postgres adalah pelanggaran unique constraint. */
function isUniqueViolation(error: { code?: string }): boolean {
  return error.code === '23505'
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
 * Daftar akun baru.
 *
 * - Cek dulu username belum dipakai, lalu auth.signUp.
 * - Bila session langsung ada (konfirmasi email nonaktif), baris
 *   profiles langsung dibuat.
 * - Bila needsConfirmation true (session null karena email wajib
 *   dikonfirmasi), profil TIDAK dibuat sekarang. Profil dibuat nanti
 *   saat user pertama kali masuk, lewat ensureMyProfile() yang dipanggil
 *   signIn(). Username dan formasi tersimpan di user_metadata.
 *
 * Kegagalan insert profil tidak menggagalkan pendaftaran: user sudah
 * terdaftar di Auth, dan ensureMyProfile() akan mencoba lagi saat masuk.
 */
export async function signUp(
  email: string,
  password: string,
  username: string,
  formasi?: string,
): Promise<{ user: User | null; needsConfirmation: boolean }> {
  if (!supabase) throw new Error(AUTH_NOT_CONFIGURED_MESSAGE)
  const cleanUsername = normalizeUsername(username)
  const cleanFormasi = formasi?.trim() || null

  const available = await isUsernameAvailable(cleanUsername)
  if (!available) throw new Error(USERNAME_TAKEN_MESSAGE)

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { username: cleanUsername, formasi: cleanFormasi },
    },
  })
  if (error) throw new Error(friendlyAuthError(error.message))

  const user = data.user
  const needsConfirmation = data.session === null

  if (user && !needsConfirmation) {
    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      username: cleanUsername,
      formasi: cleanFormasi,
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
 * belum dibuat saat signUp).
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
  await ensureMyProfile()
  return { user: data.user, session: data.session }
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
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, formasi, created_at')
    .eq('id', user.id)
    .maybeSingle()
  if (error) return null
  return data as Profile | null
}

/**
 * Pastikan user yang sedang login punya baris profiles. Bila belum ada,
 * buat dari username dan formasi yang tersimpan di user_metadata saat
 * signUp. Mengembalikan profil yang ada atau yang baru dibuat, atau
 * null bila tidak bisa dibuat (mis. username tidak tersimpan).
 */
export async function ensureMyProfile(): Promise<Profile | null> {
  if (!supabase) return null
  const existing = await getMyProfile()
  if (existing) return existing

  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return null

  const rawUsername = user.user_metadata?.username
  const username =
    typeof rawUsername === 'string' ? normalizeUsername(rawUsername) : ''
  if (!isValidUsername(username)) return null
  const rawFormasi = user.user_metadata?.formasi
  const formasi = typeof rawFormasi === 'string' ? rawFormasi.trim() : ''
  const { data, error } = await supabase
    .from('profiles')
    .insert({ id: user.id, username, formasi: formasi || null })
    .select('id, username, formasi, created_at')
    .single()
  if (error) return null
  return data as Profile
}

/** Kirim ulang email konfirmasi pendaftaran ke alamat email tersebut. */
export async function resendConfirmation(email: string): Promise<void> {
  if (!supabase) throw new Error(AUTH_NOT_CONFIGURED_MESSAGE)
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
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
