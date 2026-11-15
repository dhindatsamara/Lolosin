import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getMyProfile,
  signOut,
  useAuthUser,
  type Profile,
} from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'

/**
 * Widget status akun untuk top bar (dipasang di Layout).
 *
 * - Belum login: tombol "Masuk" (outline) + "Daftar" (hijau solid).
 * - Login: pill username + tombol Keluar.
 * - Supabase belum terkonfigurasi: tidak menampilkan apa-apa.
 *
 * Status login dibaca lewat useAuthUser, jadi ter-update tanpa reload.
 */
export function AuthStatus() {
  const configured = isSupabaseConfigured()
  const { user, loading } = useAuthUser()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (!configured || !user) {
      setProfile(null)
      return
    }
    let cancelled = false
    getMyProfile().then((nextProfile) => {
      if (!cancelled) setProfile(nextProfile)
    })
    return () => {
      cancelled = true
    }
  }, [configured, user])

  if (!configured || loading) return null

  if (!user) {
    return (
      <span className="inline-flex shrink-0 items-center gap-2">
        <Link
          to="/auth"
          className="inline-flex items-center rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold whitespace-nowrap text-ink transition-colors hover:border-primary-300 hover:text-primary-700"
        >
          Masuk
        </Link>
        <Link
          to="/auth?mode=daftar"
          className="inline-flex items-center rounded-xl bg-primary-600 px-3 py-2 text-sm font-bold whitespace-nowrap text-white transition-colors hover:bg-primary-700"
        >
          Daftar
        </Link>
      </span>
    )
  }

  const displayName = profile?.username ?? 'Akun'

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      // Gagal keluar: biarkan user mencoba lagi, jangan crash.
      setSigningOut(false)
    }
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <Link
        to="/profil"
        className="inline-flex max-w-28 items-center truncate rounded-full bg-primary-100 px-3 py-2 text-sm font-bold whitespace-nowrap text-primary-700 transition-colors hover:bg-primary-200"
        title={displayName}
      >
        {displayName}
      </Link>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="inline-flex items-center rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold whitespace-nowrap text-ink transition-colors hover:border-primary-300 hover:text-primary-700 disabled:opacity-50"
      >
        Keluar
      </button>
    </span>
  )
}
