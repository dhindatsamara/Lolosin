import { NavLink, Outlet } from 'react-router-dom'
import { getLevel, useStore } from '../lib/store'
import { cx } from '../lib/utils'
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
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 font-display text-lg font-bold text-white">
      L
      <span className="sr-only">Lolosin</span>
    </span>
  )
}

export function Layout() {
  const { xp, streak } = useStore()
  const level = getLevel(xp)

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2.5">
            <LogoMark />
            <span className="leading-tight">
              <span className="block font-display text-lg font-bold">
                Lolosin
              </span>
              <span className="block text-xs font-medium text-ink/50">
                Belajar CPNS, jadi menyenangkan
              </span>
            </span>
          </NavLink>

          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full bg-accent-100 px-2.5 py-1 text-xs font-bold text-accent-700"
              title="XP dan level"
            >
              <ZapIcon width={14} height={14} />
              {xp} XP · Lv {level}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-full bg-twk-soft px-2.5 py-1 text-xs font-bold text-twk"
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

      {/* Bottom nav (mobile-first) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-white/95 backdrop-blur">
        <div className="mx-auto grid w-full max-w-2xl grid-cols-4">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors',
                  isActive
                    ? 'text-primary-600'
                    : 'text-ink/45 hover:text-ink/70',
                )
              }
            >
              <Icon width={22} height={22} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
