import { useEffect, useRef, useState } from 'react'
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
 * Widget status akun untuk top bar (dipasang di Layout, v2.5).
 *
 * Menggantikan AuthStatus: tombol "Keluar" tidak lagi berdiri
 * sendiri di header, tapi pindah ke menu dropdown avatar.
 *
 * - Belum login: tombol "Masuk" (outline) + "Daftar" (hijau solid).
 * - Login: pill avatar + username. Klik pill membuka dropdown berisi
 *   "Profil" (ke /profil) dan "Keluar" (tetap minta konfirmasi dulu
 *   lewat ConfirmModal, seperti sebelumnya).
 * - Supabase belum terkonfigurasi: tidak menampilkan apa-apa.
 *
 * Dropdown tertutup saat klik di luar, tekan Escape, atau setelah
 * memilih item. Tombol pill memakai aria-expanded dan aria-haspopup
 * supaya bisa diakses keyboard dan pembaca layar.
 *
 * Status login dibaca lewat useAuthUser, jadi ter-update tanpa reload.
 * Avatar dibaca lewat ProfileAvatar (hook useProfileAvatar), jadi
 * perubahan foto atau avatar di halaman Profil langsung tercermin
 * di header tanpa reload.
 */
export function AccountMenu() {
  const configured = isSupabaseConfigured()
  const { user, loading } = useAuthUser()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

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

  /* Klik di luar menu atau tombol Escape menutup menu (pola yang sama
     seperti NotificationBell). */
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

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
      <div ref={wrapRef} className="relative shrink-0">
        {/* Pill avatar + username, sekarang tombol pembuka menu (bukan
            lagi Link langsung ke /profil). Lebar fleksibel: max-w-44
            di layar sempit, max-w-56 di sm, max-w-64 di desktop.
            Ellipsis hanya fallback terakhir; title selalu menampilkan
            username lengkap. */}
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-expanded={menuOpen}
          aria-haspopup="true"
          aria-label={`Menu akun ${displayName}`}
          title={displayName}
          className="inline-flex max-w-44 items-center gap-2 rounded-full bg-primary-100 py-1 pr-2.5 pl-1 text-sm font-bold whitespace-nowrap text-primary-700 transition-colors hover:bg-primary-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 sm:max-w-56 lg:max-w-64"
        >
          <ProfileAvatar size={28} />
          <span className="min-w-0 truncate">{displayName}</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {menuOpen && (
          <div
            role="menu"
            aria-label="Menu akun"
            className="absolute top-full right-0 z-50 mt-2 w-48 rounded-2xl border border-line bg-white p-1.5 shadow-soft"
          >
            <Link
              to="/profil"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="block rounded-xl px-3 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-primary-50 hover:text-primary-700"
            >
              Profil
            </Link>
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={() => {
                setMenuOpen(false)
                setShowLogoutConfirm(true)
              }}
              className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              Keluar
            </button>
          </div>
        )}
      </div>
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
