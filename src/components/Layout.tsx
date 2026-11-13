import { NavLink, Outlet } from 'react-router-dom'
import { getLevel, useStore } from '../lib/store'
import { getRankTitle } from '../lib/ranks'
import { cx } from '../lib/utils'
import { CelebrationHost } from './gamifikasi/Celebration'
import {
  BookIcon,
  FlameIcon,
  HomeIcon,
  TargetIcon,
  TrophyIcon,
  ZapIcon,
} from './icons'

const NAV_ITEMS = [
  { to: '/', label: 'Beranda', icon: HomeIcon, end: true },
  { to: '/belajar', label: 'Belajar', icon: BookIcon, end: false },
  { to: '/latihan', label: 'Latihan', icon: TargetIcon, end: false },
  { to: '/tryout', label: 'Tryout', icon: TrophyIcon, end: false },
]

function LogoMark() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink bg-primary-600 font-display text-lg font-extrabold text-white shadow-sticker-sm">
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
    <div className="bg-dot-paper min-h-dvh">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2.5">
            <LogoMark />
            <span className="leading-tight">
              <span className="block font-display text-lg font-extrabold">
                Lolosin
              </span>
              <span className="block text-xs font-medium text-ink/60">
                Belajar CPNS, jadi menyenangkan
              </span>
            </span>
          </NavLink>

          <div className="flex shrink-0 items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-accent-100 px-2.5 py-1 text-xs font-extrabold whitespace-nowrap text-accent-700 shadow-sticker-sm"
              title={`XP dan level. Gelar: ${rankTitle}`}
            >
              <ZapIcon width={14} height={14} />
              {xp} XP · Lv {level}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full border-2 border-ink bg-twk-soft px-2.5 py-1 text-xs font-extrabold whitespace-nowrap text-twk shadow-sticker-sm"
              title="Streak harian"
            >
              <FlameIcon width={14} height={14} />
              {streak} hari
            </span>
          </div>
        </div>
      </header>

      {/* Konten halaman */}
      <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-5">
        <Outlet />
      </main>

      {/* Bottom nav (mobile-first): bilah sticker, item aktif jadi pill */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-white">
        <div className="mx-auto grid w-full max-w-2xl grid-cols-4 gap-1 px-2 py-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-0.5 rounded-2xl border-2 py-2 text-[11px] font-bold transition-all',
                  isActive
                    ? 'border-ink bg-primary-600 text-white shadow-sticker-sm'
                    : 'border-transparent text-ink/60 hover:bg-paper hover:text-ink',
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
