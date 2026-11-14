import { NavLink, Outlet } from 'react-router-dom'
import { getLevel, useStore } from '../lib/store'
import { getRankTitle } from '../lib/ranks'
import { cx } from '../lib/utils'
import { AuthStatus } from './AuthStatus'
import { CelebrationHost } from './gamifikasi/Celebration'
import {
  BookIcon,
  FlameIcon,
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
  { to: '/leaderboard', label: 'Peringkat', icon: RankingIcon, end: false },
]

function LogoMark() {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 font-display text-xl font-extrabold text-white">
      L
      <span className="sr-only">Lolosin</span>
    </span>
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

      {/* Footer kecil (desktop) */}
      <footer className="mx-auto hidden w-full max-w-7xl px-8 pt-2 pb-8 lg:block">
        <p className="border-t border-line pt-5 text-sm font-medium text-ink/50">
          Lolosin · Belajar CPNS jadi menyenangkan.
        </p>
      </footer>

      {/* Bottom nav (mobile saja) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur lg:hidden">
        <div className="mx-auto grid w-full max-w-2xl grid-cols-5 gap-1 px-2 py-2">
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
      {/* Host perayaan gamifikasi (naik level, lencana, milestone streak) */}
      <CelebrationHost />
    </div>
  )
}
