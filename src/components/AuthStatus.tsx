import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import {
  getCurrentUser,
  getMyProfile,
  onAuthChange,
  signOut,
  type Profile,
} from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'

/**
 * Widget status akun untuk top bar (dipasang koordinator di Layout).
 *
 * - Login: pill username + tombol Keluar.
 * - Belum login: tautan pill "Masuk" ke /auth.
 * - Supabase belum terkonfigurasi: tidak menampilkan apa-apa.
 *
 * Mendengarkan perubahan auth lewat onAuthChange, jadi status ter-update
 * tanpa reload. Gaya pill mengikuti pill XP dan streak yang sudah ada.
 */
export function AuthStatus() {
  const configured = isSupabaseConfigured()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (!configured) return
    let cancelled = false

    async function refresh() {
      const current = await getCurrentUser()
      if (cancelled) return
      setUser(current)
      setProfile(current ? await getMyProfile() : null)
      if (!cancelled) setLoading(false)
    }
    refresh()

    const unsubscribe = onAuthChange((_event, session) => {
      if (cancelled) return
      const nextUser = session?.user ?? null
      setUser(nextUser)
      if (!nextUser) {
        setProfile(null)
        setLoading(false)
        return
      }
      getMyProfile().then((nextProfile) => {
        if (cancelled) return
        setProfile(nextProfile)
        setLoading(false)
      })
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [configured])

  if (!configured || loading) return null

  if (!user) {
    return (
      <Link
        to="/auth"
        className="inline-flex items-center rounded-full border-2 border-ink bg-white px-2.5 py-1 text-xs font-extrabold whitespace-nowrap text-ink shadow-sticker-sm transition-all hover:bg-primary-50 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        Masuk
      </Link>
    )
  }

  const displayName = profile?.username ?? user.email?.split('@')[0] ?? 'Akun'

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
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex max-w-28 items-center truncate rounded-full border-2 border-ink bg-primary-100 px-2.5 py-1 text-xs font-extrabold whitespace-nowrap text-primary-700 shadow-sticker-sm"
        title={displayName}
      >
        {displayName}
      </span>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="inline-flex items-center rounded-full border-2 border-ink bg-white px-2.5 py-1 text-xs font-extrabold whitespace-nowrap text-ink shadow-sticker-sm transition-all hover:bg-primary-50 disabled:opacity-50"
      >
        Keluar
      </button>
    </span>
  )
}
