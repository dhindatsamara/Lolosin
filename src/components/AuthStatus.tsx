import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getMyProfile,
  signOut,
  useAuthUser,
  type Profile,
} from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'
import { ConfirmModal } from './quiz/ConfirmModal'
import { ProfileAvatar } from './ProfileAvatar'
import { XIcon } from './icons'

/**
 * Widget status akun untuk top bar (dipasang di Layout).
 *
 * - Belum login: tombol "Masuk" (outline) + "Daftar" (hijau solid).
 * - Login: pill avatar + username + tombol Keluar.
 * - Supabase belum terkonfigurasi: tidak menampilkan apa-apa.
 *
 * Status login dibaca lewat useAuthUser, jadi ter-update tanpa reload.
 * Avatar dibaca lewat ProfileAvatar (hook useProfileAvatar), jadi
 * perubahan foto atau avatar di halaman Profil langsung tercermin
 * di header tanpa reload. Keluar selalu minta konfirmasi dulu (v2.2.1).
 */
export function AuthStatus() {
  const configured = isSupabaseConfigured()
  const { user, loading } = useAuthUser()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

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
    <>
      <span className="inline-flex shrink-0 items-center gap-2">
        {/* Pill avatar + username. Lebar fleksibel (dulu max-w-28 yang
            memotong username panjang jadi "dhindalolosc..."):
            max-w-44 di layar sempit, max-w-56 di sm, max-w-64 di
            desktop. Username 15 karakter (text-sm font-bold, sekitar
            130px) muat penuh di desktop: ruang teks sekitar 202px
            (256px dikurangi avatar 28px, gap 8px, padding 18px).
            Ellipsis hanya fallback terakhir; title selalu menampilkan
            username lengkap. */}
        <Link
          to="/profil"
          className="inline-flex max-w-44 items-center gap-2 rounded-full bg-primary-100 py-1 pr-3 pl-1 text-sm font-bold whitespace-nowrap text-primary-700 transition-colors hover:bg-primary-200 sm:max-w-56 lg:max-w-64"
          title={displayName}
        >
          <ProfileAvatar size={28} />
          <span className="min-w-0 truncate">{displayName}</span>
        </Link>
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          disabled={signingOut}
          className="inline-flex items-center rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold whitespace-nowrap text-ink transition-colors hover:border-primary-300 hover:text-primary-700 disabled:opacity-50"
        >
          Keluar
        </button>
      </span>
      <ConfirmModal
        open={showLogoutConfirm}
        title="Yakin mau keluar?"
        body="Progres belajar di akunmu tetap tersimpan. Kamu bisa masuk lagi kapan pun."
        confirmLabel="Ya, keluar"
        cancelLabel="Tetap masuk"
        icon={<XIcon width={22} height={22} />}
        onConfirm={() => {
          setShowLogoutConfirm(false)
          void handleSignOut()
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </>
  )
}
