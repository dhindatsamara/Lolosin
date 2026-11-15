import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { getLevel, useStore } from '../lib/store'
import { getRankTitle } from '../lib/ranks'
import { cx } from '../lib/utils'
import { Mascot } from './Mascot'
import { AuthStatus } from './AuthStatus'
import { CelebrationHost } from './gamifikasi/Celebration'
import {
  BookIcon,
  FlameIcon,
  GamepadIcon,
  HomeIcon,
  RankingIcon,
  TargetIcon,
  TrophyIcon,
  ZapIcon,
} from './icons'

const NAV_ITEMS = [
  { to: '/', label: 'Beranda', icon: HomeIcon, end: true },
  { to: '/belajar', label: 'Belajar', icon: BookIcon, end: false },
  { to: '/latihan', label: 'Latihan', icon: TargetIcon, end: false },
  { to: '/tryout', label: 'Tryout', icon: TrophyIcon, end: false },
  { to: '/main', label: 'Main', icon: GamepadIcon, end: false },
  { to: '/leaderboard', label: 'Peringkat', icon: RankingIcon, end: false },
]

function LogoMark() {
  return (
    <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-primary-100">
      {/* Mood senang eksplisit: wajah ramah, paling terbaca di ukuran kecil. */}
      <Mascot mood="senang" size={40} className="h-10 w-10" />
      <span className="sr-only">Lolosin</span>
    </span>
  )
}

const FOOTER_LINKS = [
  { to: '/belajar', label: 'Belajar' },
  { to: '/latihan', label: 'Latihan' },
  { to: '/tryout', label: 'Tryout' },
  { to: '/leaderboard', label: 'Peringkat' },
] as const

/** Ikon chevron atas/bawah inline (gaya Lucide, seperti icons.tsx):
    icons.tsx hanya punya ChevronRightIcon, dan file itu milik
    subagent lain. */
function ChevronUpIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="18 15 12 9 6 15" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

/**
 * Tombol melayang "ke atas" dan "ke bawah", berlaku di semua page
 * karena tinggal di Layout.
 *
 * Aturan tampil: tombol atas muncul setelah scroll >400px; tombol
 * bawah muncul setelah user mulai scroll dan hilang saat sudah dekat
 * dasar halaman (sisa <100px); keduanya sembunyi saat di paling atas
 * dan saat halaman tidak bisa di-scroll.
 *
 * Posisi: fixed kanan bawah, bottom-20 di mobile supaya tidak
 * bertumpuk dengan bottom nav (tingginya sekitar 72px), bottom-6 di
 * desktop (tanpa bottom nav). Scroll halus, kecuali user mengaktifkan
 * prefers-reduced-motion (langsung loncat).
 */
function JumpButtons() {
  const [showUp, setShowUp] = useState(false)
  const [showDown, setShowDown] = useState(false)

  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const y = window.scrollY
      const sisa =
        document.documentElement.scrollHeight - window.innerHeight - y
      setShowUp(y > 400)
      setShowDown(y > 0 && sisa > 100)
    }
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf !== 0) cancelAnimationFrame(raf)
    }
  }, [])

  const jump = (to: 'top' | 'bottom') => {
    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    window.scrollTo({
      top: to === 'top' ? 0 : document.documentElement.scrollHeight,
      behavior: reduce ? 'auto' : 'smooth',
    })
  }

  const btnClass = (visible: boolean) =>
    cx(
      'flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-primary-700 shadow-soft transition-all duration-200 hover:bg-primary-50 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 motion-reduce:transition-none',
      visible
        ? 'pointer-events-auto visible translate-y-0 opacity-100'
        : 'pointer-events-none invisible translate-y-2 opacity-0',
    )

  return (
    <div className="pointer-events-none fixed right-4 bottom-20 z-40 flex flex-col gap-2 lg:bottom-6">
      <button
        type="button"
        aria-label="Ke atas"
        onClick={() => jump('top')}
        className={btnClass(showUp)}
      >
        <ChevronUpIcon />
      </button>
      <button
        type="button"
        aria-label="Ke bawah"
        onClick={() => jump('bottom')}
        className={btnClass(showDown)}
      >
        <ChevronDownIcon />
      </button>
    </div>
  )
}

export function Layout() {
  const { xp, streak } = useStore()
  const level = getLevel(xp)
  const rankTitle = getRankTitle(level)

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <NavLink to="/" className="flex shrink-0 items-center gap-2.5">
            <LogoMark />
            <span className="leading-tight">
              <span className="block font-display text-lg font-extrabold lg:text-xl">
                Lolosin
              </span>
              <span className="hidden text-xs font-medium text-ink/60 md:block">
                Belajar CPNS, jadi menyenangkan
              </span>
            </span>
          </NavLink>

          {/* Navigasi atas (desktop) */}
          <nav
            aria-label="Navigasi utama"
            className="hidden items-center gap-1 lg:flex"
          >
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'rounded-lg px-3 py-2 text-[15px] font-semibold transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-ink/65 hover:bg-ink/5 hover:text-ink',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span
              className="hidden items-center gap-1.5 rounded-full bg-accent-100 px-3 py-2 text-sm font-bold whitespace-nowrap text-accent-800 sm:inline-flex"
              title={`XP dan level. Gelar: ${rankTitle}`}
            >
              <ZapIcon width={15} height={15} />
              {xp} XP · Lv {level}
            </span>
            <span
              className="hidden items-center gap-1.5 rounded-full bg-twk-soft px-3 py-2 text-sm font-bold whitespace-nowrap text-twk md:inline-flex"
              title="Streak harian"
            >
              <FlameIcon width={15} height={15} />
              {streak} hari
            </span>
            <AuthStatus />
          </div>
        </div>
      </header>

      {/* Konten halaman */}
      <main className="mx-auto w-full max-w-7xl px-4 pt-5 pb-28 lg:px-8 lg:pt-8 lg:pb-16">
        <Outlet />
      </main>

      {/* Footer lengkap, tampil di semua viewport. Identitas visual
          sendiri (hijau sangat tua + garis atas amber) supaya header,
          body, dan footer terlihat jelas bedanya. */}
      <footer className="border-t-4 border-accent-500 bg-primary-900 pb-24 text-white lg:pb-8">
        <div className="mx-auto w-full max-w-7xl px-4 pt-8 lg:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-sm">
              <span className="flex items-center gap-2.5">
                <LogoMark />
                <span className="font-display text-lg font-extrabold">
                  Lolosin
                </span>
              </span>
              <p className="mt-3 text-sm leading-relaxed font-medium text-white/70">
                Belajar CPNS jadi menyenangkan: materi SKD, latihan per
                topik, tryout mini, dan simulasi CAT dalam satu aplikasi,
                ditemani maskot yang ikut tumbuh bareng streak-mu.
              </p>
            </div>
            <nav aria-label="Navigasi footer">
              <p className="text-xs font-extrabold tracking-[0.14em] text-accent-300 uppercase">
                Jelajahi
              </p>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 sm:flex-col sm:gap-2">
                {FOOTER_LINKS.map(({ to, label }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      className="text-sm font-semibold text-white/80 hover:text-accent-300"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <p className="mt-6 border-t border-white/15 pt-4 text-xs leading-relaxed font-medium text-white/50">
            © 2026 Lolosin. Dibuat untuk pejuang CPNS.
          </p>
        </div>
      </footer>

      {/* Bottom nav (mobile saja) */}
      <nav
        aria-label="Navigasi bawah"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur lg:hidden"
      >
        <div className="mx-auto grid w-full max-w-2xl grid-cols-6 gap-1 px-2 py-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-bold transition-colors',
                  isActive
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-ink/60 hover:bg-paper hover:text-ink',
                )
              }
            >
              <Icon width={22} height={22} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
      {/* Tombol jump ke atas/bawah, tampil di semua page */}
      <JumpButtons />
      {/* Host perayaan gamifikasi (naik level, lencana, milestone streak) */}
      <CelebrationHost />
    </div>
  )
}
