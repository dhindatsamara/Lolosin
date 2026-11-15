import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthUser } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'
import { InfoIcon } from './icons'

const DISMISS_KEY = 'lolosin:dismiss-guest-warning'

/**
 * Peringatan dini untuk tamu (belum login): progres belajar hanya
 * tersimpan di browser ini (localStorage), hilang kalau ganti device
 * atau hapus data browser. Bisa di-dismiss, sekali tutup tidak muncul
 * lagi di browser itu.
 *
 * Hanya tampil saat Supabase terkonfigurasi dan user belum login.
 * Saat mode lokal (Supabase belum aktif) tidak ada sistem akun, jadi
 * peringatan ini tidak ditampilkan. Dipasang di halaman tempat tamu
 * bisa berprogres: Belajar, Latihan, Tryout.
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
          Kamu lagi belajar tanpa akun
        </p>
        <p className="mt-0.5 text-sm leading-relaxed font-medium text-ink/70">
          Progresmu cuma tersimpan di browser ini, dan hilang kalau kamu
          ganti HP atau laptop. Masuk biar progresmu kesimpen di akunmu.
        </p>
        <Link
          to="/auth?mode=daftar"
          className="mt-2 inline-block text-sm font-extrabold text-primary-700 underline-offset-2 hover:underline"
        >
          Daftar gratis, cuma semenit
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
