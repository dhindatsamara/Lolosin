import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthUser } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'
import { InfoIcon } from './icons'

/**
 * Key dismiss peringatan tamu. Sengaja TETAP global (tanpa namespace
 * per user): ini preferensi UI per-browser, dan peringatannya hanya
 * relevan saat logout (tamu). Tidak ikut namespacing v2.2.1.
 */
const DISMISS_KEY = 'lolosin:dismiss-guest-warning'

/**
 * Peringatan untuk tamu (belum login): sejak v2.5 progres tamu TIDAK
 * lagi disimpan di mana pun, hanya hidup di memori selama halaman
 * terbuka. Refresh atau tutup tab, progres hilang. Bisa di-dismiss,
 * sekali tutup tidak muncul lagi di browser itu.
 *
 * Hanya tampil saat Supabase terkonfigurasi dan user belum login.
 * Saat mode lokal (Supabase belum aktif) tidak ada sistem akun, jadi
 * peringatan ini tidak ditampilkan. Dipasang di halaman tempat tamu
 * bisa berprogres: Beranda, Belajar, Latihan, Tryout.
 */
export function GuestProgressWarning() {
  const configured = isSupabaseConfigured()
  const { user, loading } = useAuthUser()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (!dismissed) return
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // localStorage tidak tersedia: abaikan, peringatan tampil lagi
      // di kunjungan berikutnya.
    }
  }, [dismissed])

  if (!configured || loading || user || dismissed) return null

  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-2xl border border-accent-200 bg-accent-50 px-4 py-3.5"
    >
      <InfoIcon
        width={20}
        height={20}
        className="mt-0.5 shrink-0 text-accent-700"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed font-bold text-ink">
          Kamu lagi mode tamu
        </p>
        <p className="mt-0.5 text-sm leading-relaxed font-medium text-ink/70">
          Progresmu tidak tersimpan. Daftar gratis biar progresmu aman.
        </p>
        <Link
          to="/auth?mode=daftar"
          className="mt-2 inline-block rounded-full bg-primary-600 px-3.5 py-1.5 text-sm font-extrabold text-white transition-colors hover:bg-primary-700"
        >
          Daftar
        </Link>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Tutup peringatan"
        className="shrink-0 rounded-lg px-2 py-1 text-sm font-extrabold text-ink/50 transition-colors hover:bg-accent-100 hover:text-ink"
      >
        Tutup
      </button>
    </div>
  )
}
