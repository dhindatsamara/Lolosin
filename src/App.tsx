import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { Layout } from './components/Layout'
import { Button } from './components/ui/Button'
import { Card } from './components/ui/Card'
import { CheckIcon } from './components/icons'
import {
  isEmailVerified,
  resendConfirmation,
  signOut,
  useAuthUser,
} from './lib/auth'
import AuthPage from './pages/AuthPage'
import { BattlePage } from './pages/BattlePage'
import { BelajarPage } from './pages/BelajarPage'
import { HomePage } from './pages/HomePage'
import { KuisKilatPage } from './pages/KuisKilatPage'
import { LatihanJalanPage } from './pages/LatihanJalanPage'
import { LatihanPage } from './pages/LatihanPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { MainHubPage } from './pages/MainHubPage'
import { MateriDetailPage } from './pages/MateriDetailPage'
import ProfilPage from './pages/ProfilPage'
import { SectionDetailPage } from './pages/SectionDetailPage'
import { SessionHostPage } from './pages/SessionHostPage'
import { SessionJoinPage } from './pages/SessionJoinPage'
import { TryoutHasilPage } from './pages/TryoutHasilPage'
import { TryoutPage } from './pages/TryoutPage'

/**
 * Gulir ke atas setiap pindah halaman. React Router tidak mereset
 * posisi gulir sendiri, jadi tanpa ini pengguna yang mengetuk tautan
 * dari bagian bawah halaman panjang (misal tombol Mulai ulas di
 * dashboard) mendarat di halaman baru dalam keadaan sudah tergulir,
 * dan judul halaman tertutup header sticky. Ketemu saat QA Fase 3.
 */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/**
 * Layar blokir untuk user yang sudah login tapi emailnya belum
 * terverifikasi: app tidak bisa dipakai sampai tautan konfirmasi di
 * email diklik. Menyediakan tombol kirim ulang (cooldown 60 detik)
 * dan tombol keluar.
 */
function VerifyGate({ user }: { user: User }) {
  const [cooldown, setCooldown] = useState(0)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  async function handleResend() {
    if (sending || cooldown > 0) return
    const email = user.email
    if (!email) {
      setError('Email akunmu tidak ketemu, coba keluar lalu masuk lagi ya.')
      return
    }
    setError('')
    setSending(true)
    try {
      await resendConfirmation(email)
      setSent(true)
      setCooldown(60)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Ada yang salah, coba lagi ya.',
      )
    } finally {
      setSending(false)
    }
  }

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      setSigningOut(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <header>
        <p className="kicker">satu langkah lagi</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">
          Cek emailmu
        </h1>
      </header>
      <Card padding="lg" className="flex flex-col gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-primary-700">
          <CheckIcon width={22} height={22} />
        </span>
        <p className="text-sm leading-relaxed text-ink/70">
          Akunmu udah dibuat, tapi emailnya belum dikonfirmasi. Klik tautan
          konfirmasi di inbox{' '}
          <span className="font-extrabold text-ink">{user.email}</span>{' '}
          biar bisa mulai pakai Lolosin.
        </p>
        <p className="text-sm leading-relaxed text-ink/70">
          Nggak nemu emailnya? Cek folder spam atau promosi, atau kirim
          ulang tautannya.
        </p>
        {sent && (
          <p className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-sm font-semibold text-primary-700">
            Email terkirim, cek inbox ya.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={handleResend}
            disabled={sending || cooldown > 0}
          >
            {cooldown > 0
              ? `Kirim ulang dalam ${cooldown} dtk`
              : sending
                ? 'Mengirim...'
                : 'Kirim ulang verifikasi'}
          </Button>
          <Button
            variant="outline"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? 'Sebentar ya...' : 'Keluar'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuthUser()
  const { pathname } = useLocation()

  // Gate verifikasi email: user login yang emailnya belum terkonfirmasi
  // tidak bisa memakai app apa pun kecuali halaman /auth (supaya tetap
  // bisa keluar atau ganti akun). Tamu belum login dan mode placeholder
  // (Supabase belum aktif, user null) tidak terpengaruh.
  const unverifiedUser =
    !loading && user && !isEmailVerified(user) ? user : null
  const gateActive = unverifiedUser !== null && pathname !== '/auth'

  return (
    <>
      <ScrollToTop />
      {gateActive && unverifiedUser ? (
        <Routes>
          <Route element={<Layout />}>
            <Route path="*" element={<VerifyGate user={unverifiedUser} />} />
          </Route>
        </Routes>
      ) : (
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="belajar" element={<BelajarPage />} />
            <Route path="belajar/:materiId" element={<MateriDetailPage />} />
            <Route
              path="belajar/:materiId/:sectionId"
              element={<SectionDetailPage />}
            />
            <Route path="latihan" element={<LatihanPage />} />
            <Route path="latihan/jalan" element={<LatihanJalanPage />} />
            <Route
              path="latihan/ulas"
              element={<LatihanJalanPage mode="review" />}
            />
            <Route path="tryout" element={<TryoutPage />} />
            <Route path="tryout/hasil" element={<TryoutHasilPage />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="auth" element={<AuthPage />} />
            <Route path="profil" element={<ProfilPage />} />
            <Route path="main" element={<MainHubPage />} />
            <Route path="main/battle" element={<BattlePage />} />
            <Route path="main/battle/:code" element={<BattlePage />} />
            <Route path="main/sesi" element={<SessionJoinPage />} />
            <Route path="main/sesi/host" element={<SessionHostPage />} />
            <Route
              path="main/sesi/host/:code"
              element={<SessionHostPage />}
            />
            <Route path="main/kuis-kilat" element={<KuisKilatPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </>
  )
}
