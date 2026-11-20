/**
 * Panel admin Lolosin (v2.14.1): halaman /admin khusus akun admin.
 *
 * Enam modul: Statistik singkat, Daftar user + aksi premium,
 * Kode redeem, Pembayaran (klaim QRIS manual), Juara mingguan +
 * kirim ulang email, Ringkasan bank soal. Kartu peringkat sendiri
 * (OwnRankCard) sudah ada dari v2.10 di halaman Peringkat dan
 * tidak dibangun ulang di sini.
 *
 * Tampilan v2.14.1: sidebar navigasi di kiri (desktop) atau drawer
 * (mobile), area konten utama di kanan. Modul Statistik memakai
 * grafik SVG (src/components/admin/AdminCharts.tsx): user baru per
 * hari, tryout selesai per hari (Kilat + Akbar), dan donat Gratis
 * vs Premium. Logika gate, pengecekan is_admin, dan pemanggilan
 * Edge Function admin-actions TIDAK berubah dari v2.14.
 *
 * v2.14.3: sidebar desktop FIXED (beku, tidak ikut scroll halaman)
 * dan bisa di-collapse jadi rel ikon sempit; pilihan collapse
 * disimpan di localStorage. Panel fixed diposisikan dari spacer
 * di flow supaya sejajar persis dengan kolomnya.
 *
 * v2.14.4: FULL ADMIN SHELL. Route /admin dipindah ke luar Layout
 * (lihat App.tsx), jadi halaman ini tidak memakai header nav dan
 * footer situs sama sekali. Sidebar full viewport height (top 0,
 * tinggi 100dvh, kiri 0) dengan logo Lolosin di atasnya; konten
 * kanan punya bar atas sendiri (judul modul + chip user admin).
 * Karena halaman ini bukan lagi bagian dari container Layout yang
 * terpusat, pengukuran posisi kiri panel (v2.14.3) tidak diperlukan
 * lagi: kiri panel selalu 0. Collapse, drawer mobile, gate, isi
 * modul, dan pemanggilan admin-actions tidak berubah.
 *
 * v2.15: modul ke-6 Pembayaran. Klaim "Saya sudah bayar" dari
 * halaman /premium tampil pending dulu; admin menyetujui (premium
 * aktif) atau menolak lewat Edge Function admin-actions. Modul
 * ini memakai aksi list_payments, approve_payment, dan
 * reject_payment; status klaim tidak bisa diubah dari client.
 *
 * Gate: halaman ini hanya untuk profiles.is_admin (migrasi 009).
 * Bukan admin berarti ditolak masuk; belum login berarti diarahkan
 * ke /auth. Pengecekan di sini HANYA untuk tampilan: semua aksi
 * admin dicek ulang is_admin-nya di sisi server oleh Edge Function
 * admin-actions, jadi menyembunyikan halaman ini bukan satu-satunya
 * pertahanan.
 *
 * Sumber data per modul:
 * - Statistik + Juara: query langsung ke tabel publik (profiles,
 *   tryout_results, weekly_winners) yang memang bisa dibaca publik.
 * - User + Kode + Pembayaran: Edge Function admin-actions (progress
 *   user, tabel codes, dan tabel payment_claims tidak bisa dibaca
 *   dari client).
 * - Bank soal: dihitung dari bank yang dibundel di app.
 */
import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuthUser } from '../lib/auth'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import {
  callAdminAction,
  currentWeekMondayMakassar,
  getAdminStatus,
  isPremiumRowActive,
  type AdminCodeRow,
  type AdminPaymentRow,
  type AdminStatus,
  type AdminUserRow,
} from '../lib/admin'
import { formatTanggalIndonesia } from '../lib/redeem'
import { formatRupiah, getPackage } from '../lib/pricing'
import { formatWeekRange } from '../lib/leaderboard'
import {
  MATERI_LIST,
  QUESTIONS,
  TOTAL_QUESTIONS,
  TOTAL_QUIZABLE,
} from '../lib/questions'
import { cx } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Mascot } from '../components/Mascot'
import { StickyBackButton } from '../components/belajar/StickyBackButton'
import { ConfirmModal } from '../components/quiz/ConfirmModal'
import {
  AreaLineChart,
  DonutChart,
  StackedBarChart,
  countPerDay,
  last7DaysMakassar,
  type LinePoint,
  type StackedDayPoint,
} from '../components/admin/AdminCharts'

type TabId = 'statistik' | 'user' | 'kode' | 'pembayaran' | 'juara' | 'bank'

/* Ikon sidebar: SVG garis sederhana, currentColor, tanpa emoji. */
function ChartIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3v18h18" />
      <path d="M7 15v-4M12 15V7M17 15v-6" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16.5 15.5c2.5.5 4.5 2.2 4.5 4.5" />
    </svg>
  )
}

function TicketIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" />
      <path d="M13 6v2M13 11v2M13 16v2" />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4" />
      <path d="M12 13v3M8 20h8M10 16h4" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2V4Z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7V4Z" />
    </svg>
  )
}

/** Ikon uang kertas (modul Pembayaran, v2.15). */
function PaymentIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function ArrowLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

/** Pilihan collapse sidebar desktop disimpan di localStorage (v2.14.3). */
const SIDEBAR_COLLAPSED_KEY = 'lolosin:admin-sidebar-collapsed'

const NAV_ITEMS: Array<{
  id: TabId
  label: string
  description: string
  Icon: () => JSX.Element
}> = [
  {
    id: 'statistik',
    label: 'Statistik',
    description: 'Angka dan grafik pertumbuhan Lolosin.',
    Icon: ChartIcon,
  },
  {
    id: 'user',
    label: 'User',
    description: 'Daftar user dan kelola premium.',
    Icon: UsersIcon,
  },
  {
    id: 'kode',
    label: 'Kode',
    description: 'Buat dan lihat kode redeem premium.',
    Icon: TicketIcon,
  },
  {
    id: 'pembayaran',
    label: 'Pembayaran',
    description: 'Verifikasi klaim bayar QRIS dan aktifkan premium.',
    Icon: PaymentIcon,
  },
  {
    id: 'juara',
    label: 'Juara',
    description: 'Juara mingguan dan kirim ulang email hadiah.',
    Icon: TrophyIcon,
  },
  {
    id: 'bank',
    label: 'Bank soal',
    description: 'Ringkasan jumlah dan kesehatan bank soal.',
    Icon: BookIcon,
  },
]

/** Baris weekly_winners untuk modul Juara. */
interface WinnerRow {
  id: string
  week_start: string
  scope: string
  rank: number
  user_id: string
  total: number
  code: string | null
  email_sent_at: string | null
  badge_awarded: boolean
}

/** Format tanggal + jam singkat, mis. "20 Nov 2026, 10:15". */
function formatTanggalJam(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** Label status premium satu user. */
function premiumLabel(user: AdminUserRow): string {
  if (!isPremiumRowActive(user.is_premium, user.premium_until)) {
    return 'Gratis'
  }
  if (user.premium_until) {
    return `Premium sampai ${formatTanggalIndonesia(user.premium_until)}`
  }
  return 'Premium'
}

/* ------------------------------------------------------------------ */
/* Isi sidebar (dipakai desktop + drawer mobile)                       */
/* ------------------------------------------------------------------ */

function SidebarContent({
  tab,
  onNavigate,
  onClose,
  collapsed = false,
  onToggleCollapse,
}: {
  tab: TabId
  onNavigate: (id: TabId) => void
  /** Tombol tutup, hanya di drawer mobile. */
  onClose?: () => void
  /** Mode rel ikon sempit (desktop, saat sidebar di-collapse). */
  collapsed?: boolean
  /** Toggle collapse, hanya di sidebar desktop. */
  onToggleCollapse?: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <div
        className={cx(
          'border-b border-white/10 px-5 py-5',
          collapsed && 'flex flex-col items-center gap-3 px-3 py-4',
        )}
      >
        {collapsed ? (
          <>
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-white/10">
              {/* Mood senang eksplisit: wajah ramah, paling terbaca di
                  ukuran kecil. */}
              <Mascot mood="senang" size={36} className="h-9 w-9" />
              <span className="sr-only">Lolosin</span>
            </span>
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Tampilkan sidebar"
              title="Tampilkan sidebar"
              className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ChevronRightIcon />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-white/10">
                  <Mascot mood="senang" size={36} className="h-9 w-9" />
                  <span className="sr-only">Lolosin</span>
                </span>
                <span className="font-display text-lg font-extrabold">
                  Lolosin
                </span>
              </div>
              {onToggleCollapse && (
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  aria-label="Sembunyikan sidebar"
                  title="Sembunyikan sidebar"
                  className="shrink-0 rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <ChevronLeftIcon />
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Tutup menu admin"
                  className="shrink-0 rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-white/50">
              Panel admin
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-white/70">
              Kelola user, premium, kode, pembayaran, juara, dan bank
              soal Lolosin.
            </p>
          </>
        )}
      </div>
      <nav
        aria-label="Modul panel admin"
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3"
      >
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            aria-current={tab === id ? 'page' : undefined}
            aria-label={collapsed ? label : undefined}
            title={collapsed ? label : undefined}
            className={cx(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors',
              collapsed && 'justify-center px-0',
              tab === id
                ? 'bg-white text-primary-900'
                : 'text-white/80 hover:bg-white/10 hover:text-white',
            )}
          >
            <Icon />
            {!collapsed && label}
          </button>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <Link
          to="/"
          aria-label={collapsed ? 'Kembali ke aplikasi' : undefined}
          title={collapsed ? 'Kembali ke aplikasi' : undefined}
          className={cx(
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white',
            collapsed && 'justify-center px-0',
          )}
        >
          <ArrowLeftIcon />
          {!collapsed && 'Kembali ke aplikasi'}
        </Link>
      </div>
    </div>
  )
}

export function AdminPage() {
  const { user, loading: authLoading } = useAuthUser()
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null)
  const [tab, setTab] = useState<TabId>('statistik')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  /* v2.14.3: sidebar desktop bisa di-collapse jadi rel ikon; pilihan
     disimpan di localStorage supaya bertahan antar kunjungan. */
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  /* v2.14.4: panel sidebar fixed di kiri 0 (full admin shell, bukan
     lagi bagian dari container Layout yang terpusat), jadi tidak
     ada lagi pengukuran posisi kiri dari spacer seperti v2.14.3. */

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(
          SIDEBAR_COLLAPSED_KEY,
          next ? '1' : '0',
        )
      } catch {
        /* localStorage tidak tersedia: pilihan tidak disimpan. */
      }
      return next
    })
  }

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setAdminStatus(null)
    getAdminStatus(user.id).then((status) => {
      if (!cancelled) setAdminStatus(status)
    })
    return () => {
      cancelled = true
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-center text-ink/60">Memuat...</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/auth" replace />
  if (!adminStatus) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-center text-ink/60">Memeriksa akses admin...</p>
      </div>
    )
  }
  if (adminStatus.columnMissing) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <StickyBackButton to="/" />
        <Card className="mt-4">
          <h1 className="text-xl font-bold">Panel admin belum siap</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Migrasi 009 belum dijalankan di database, jadi belum ada
            yang bisa masuk panel admin. Jalankan dulu file
            supabase/migrations/009_admin_flag.sql di SQL Editor
            (lihat docs/PANDUAN-MIGRASI-009.md), lalu buka lagi
            halaman ini.
          </p>
        </Card>
      </div>
    )
  }
  if (!adminStatus.isAdmin) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <StickyBackButton to="/" />
        <Card className="mt-4">
          <h1 className="text-xl font-bold">Halaman khusus admin</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Akunmu bukan admin, jadi tidak bisa membuka panel ini.
            Kalau kamu seharusnya admin, minta admin lain untuk
            mengaktifkan akunmu dulu.
          </p>
          <div className="mt-4">
            <Link to="/">
              <Button variant="outline">Kembali ke beranda</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  const activeNav = NAV_ITEMS.find((n) => n.id === tab) ?? NAV_ITEMS[0]

  /* Chip user di bar atas: username dari user_metadata (disimpan
     saat signUp); jatuh ke "Admin" bila tidak ada. */
  const rawUsername = user.user_metadata?.username
  const username =
    typeof rawUsername === 'string' && rawUsername ? rawUsername : 'Admin'

  function goTo(id: TabId) {
    setTab(id)
    setSidebarOpen(false)
  }

  return (
    /* v2.14.4: FULL ADMIN SHELL. Halaman ini dirender di luar Layout
       (App.tsx), jadi tidak ada header nav dan footer situs di sini.
       Sidebar desktop FIXED full viewport height (kiri 0, atas 0,
       tinggi 100dvh, tanpa sudut membulat karena menempel ke tepi
       layar) dan beku saat halaman di-scroll, jadi tautan "Kembali
       ke aplikasi" di ujung bawahnya selalu terlihat tanpa scroll,
       di konten pendek maupun panjang. Spacer <aside> di flow hanya
       menahan lebar kolom. Konten kanan punya bar atas sendiri
       (sticky): judul modul + chip user admin; di mobile, bar atas
       ini juga memuat tombol hamburger pembuka drawer. */
    <div className="flex min-h-[100dvh] bg-paper">
      {/* Spacer kolom sidebar (in-flow, tak terlihat): menahan lebar
          kolom supaya konten tidak tertutup panel fixed. */}
      <aside
        aria-hidden="true"
        className={cx(
          'hidden shrink-0 transition-[width] duration-200 lg:block',
          /* Lebar dalam px, bukan w-64: font-size root di desktop
             adalah 17px, jadi w-64 (16rem) jadi 272px dan tidak
             sejajar dengan panel yang lebarnya 256px. */
          sidebarCollapsed ? 'lg:w-[76px]' : 'lg:w-[256px]',
        )}
      />

      {/* Panel sidebar desktop: FIXED full height, beku saat halaman
          di-scroll. */}
      <div
        data-admin-sidebar-panel
        className="fixed left-0 top-0 z-30 hidden h-[100dvh] transition-[width] duration-200 lg:block"
        style={{ width: sidebarCollapsed ? 76 : 256 }}
      >
        <div className="h-full bg-primary-900 text-white">
          <SidebarContent
            tab={tab}
            onNavigate={goTo}
            collapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebarCollapsed}
          />
        </div>
      </div>

      {/* Drawer mobile: sidebar jadi panel geser dari kiri. */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/50"
            aria-hidden="true"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-primary-900 text-white shadow-soft-lg">
            <SidebarContent
              tab={tab}
              onNavigate={goTo}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Area konten utama + bar atasnya sendiri. */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Buka menu admin"
                className="shrink-0 rounded-xl border border-line bg-white p-2 text-ink shadow-soft lg:hidden"
              >
                <MenuIcon />
              </button>
              <h1 className="truncate text-lg font-bold lg:text-xl">
                {activeNav.label}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 shadow-soft">
              <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-primary-100">
                <Mascot mood="senang" size={28} className="h-7 w-7" />
              </span>
              <span className="max-w-[120px] truncate text-sm font-semibold sm:max-w-none">
                {username}
              </span>
              <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-bold text-primary-800">
                Admin
              </span>
            </div>
          </div>
        </header>

        <div className="px-4 py-5 lg:px-8 lg:py-6">
          <p className="text-sm text-ink/60">{activeNav.description}</p>
          <div className="mt-5">
            {tab === 'statistik' && <StatistikModule />}
            {tab === 'user' && <UserModule />}
            {tab === 'kode' && <KodeModule />}
            {tab === 'pembayaran' && <PaymentModule />}
            {tab === 'juara' && <JuaraModule />}
            {tab === 'bank' && <BankModule />}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modul 1: Statistik singkat + grafik                                 */
/* ------------------------------------------------------------------ */

interface Stats {
  totalUser: number
  userBaruMingguIni: number
  tryoutMingguIni: number
  akbarMingguIni: number
}

/** Data tiga grafik modul Statistik. */
interface ChartData {
  newUsers: LinePoint[]
  newUsersTotal: number
  tryouts: StackedDayPoint[]
  tryoutsTotal: number
  tryoutsKilat: number
  tryoutsAkbar: number
  premium: number
  gratis: number
}

function StatistikModule() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [charts, setCharts] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chartError, setChartError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!isSupabaseConfigured() || !supabase) {
        setError('Fitur akun belum aktif.')
        setLoading(false)
        return
      }
      const monday = currentWeekMondayMakassar()
      const mondayStart = `${monday}T00:00:00+08:00`
      const days = last7DaysMakassar()
      const weekAgoStart = `${days[0].key}T00:00:00+08:00`
      try {
        const [total, baru, tryout, akbar] = await Promise.all([
          supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true }),
          supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', mondayStart),
          supabase
            .from('tryout_results')
            .select('*', { count: 'exact', head: true })
            .eq('week_start', monday),
          supabase
            .from('tryout_results')
            .select('*', { count: 'exact', head: true })
            .eq('week_start', monday)
            .eq('mode', 'full'),
        ])
        if (cancelled) return
        if (total.error || baru.error || tryout.error || akbar.error) {
          setError('Statistik gagal dimuat, coba muat ulang ya.')
          setLoading(false)
          return
        }
        setStats({
          totalUser: total.count ?? 0,
          userBaruMingguIni: baru.count ?? 0,
          tryoutMingguIni: tryout.count ?? 0,
          akbarMingguIni: akbar.count ?? 0,
        })
        // Grafik dimuat terpisah: bila gagal, kartu angka di atas
        // tetap tampil dan hanya grafik yang diganti catatan.
        try {
          const [profilesNew, tryoutsRecent, premiumRows] =
            await Promise.all([
              supabase
                .from('profiles')
                .select('created_at')
                .gte('created_at', weekAgoStart)
                .order('created_at', { ascending: true })
                .limit(1000),
              supabase
                .from('tryout_results')
                .select('finished_at, mode')
                .gte('finished_at', weekAgoStart)
                .order('finished_at', { ascending: true })
                .limit(1000),
              // Pembagian gratis vs premium dibaca dari 1000 profil
              // terbaru. Cukup untuk skala beta; bila user sudah
              // ribuan, ganti dengan hitungan berbasis count.
              supabase
                .from('profiles')
                .select('is_premium, premium_until')
                .limit(1000),
            ])
          if (cancelled) return
          if (
            profilesNew.error ||
            tryoutsRecent.error ||
            premiumRows.error
          ) {
            setChartError(true)
          } else {
            const keys = days.map((d) => d.key)
            const newUsersCounts = countPerDay(
              (profilesNew.data ?? []).map(
                (r) => (r as { created_at: string }).created_at,
              ),
              keys,
            )
            const tryoutRows = (tryoutsRecent.data ?? []) as Array<{
              finished_at: string
              mode: string
            }>
            const kilatCounts = countPerDay(
              tryoutRows
                .filter((r) => r.mode !== 'full')
                .map((r) => r.finished_at),
              keys,
            )
            const akbarCounts = countPerDay(
              tryoutRows
                .filter((r) => r.mode === 'full')
                .map((r) => r.finished_at),
              keys,
            )
            const premiumCount = (premiumRows.data ?? []).filter((r) => {
              const row = r as {
                is_premium: boolean
                premium_until: string | null
              }
              return isPremiumRowActive(row.is_premium, row.premium_until)
            }).length
            const gratisCount = (premiumRows.data ?? []).length - premiumCount
            const tryoutsKilat = kilatCounts.reduce((a, b) => a + b, 0)
            const tryoutsAkbar = akbarCounts.reduce((a, b) => a + b, 0)
            setCharts({
              newUsers: days.map((d, i) => ({
                label: d.label,
                value: newUsersCounts[i],
              })),
              newUsersTotal: newUsersCounts.reduce((a, b) => a + b, 0),
              tryouts: days.map((d, i) => ({
                label: d.label,
                kilat: kilatCounts[i],
                akbar: akbarCounts[i],
              })),
              tryoutsTotal: tryoutsKilat + tryoutsAkbar,
              tryoutsKilat,
              tryoutsAkbar,
              premium: premiumCount,
              gratis: gratisCount,
            })
          }
        } catch {
          if (!cancelled) setChartError(true)
        }
        setLoading(false)
      } catch {
        if (!cancelled) {
          setError('Statistik gagal dimuat, coba muat ulang ya.')
          setLoading(false)
        }
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <p className="text-sm text-ink/60">Memuat statistik...</p>
  }
  if (error) {
    return <p className="text-sm text-red-700">{error}</p>
  }
  if (!stats) return null

  const cards: Array<{ label: string; value: number; note: string }> = [
    {
      label: 'Total user',
      value: stats.totalUser,
      note: 'Akun terdaftar sejak awal.',
    },
    {
      label: 'User baru minggu ini',
      value: stats.userBaruMingguIni,
      note: 'Daftar sejak Senin minggu ini.',
    },
    {
      label: 'Tryout minggu ini',
      value: stats.tryoutMingguIni,
      note: 'Kilat + Akbar yang selesai minggu ini.',
    },
    {
      label: 'Akbar selesai minggu ini',
      value: stats.akbarMingguIni,
      note: 'Simulasi CAT 110 soal yang selesai.',
    },
  ]
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <p className="text-sm font-medium text-ink/60">{card.label}</p>
            <p className="mt-1 text-3xl font-bold">{card.value}</p>
            <p className="mt-1 text-xs text-ink/50">{card.note}</p>
          </Card>
        ))}
      </div>

      {chartError ? (
        <p className="text-sm text-ink/60">
          Grafik gagal dimuat, angka di atas tetap bisa dipakai.
        </p>
      ) : charts ? (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card>
              <h2 className="text-base font-bold">
                User baru, 7 hari terakhir
              </h2>
              <p className="mt-0.5 text-xs text-ink/50">
                Total {charts.newUsersTotal} user baru dalam 7 hari
                terakhir.
              </p>
              <div className="mt-3">
                <AreaLineChart
                  data={charts.newUsers}
                  caption={`Total ${charts.newUsersTotal} user baru.`}
                />
              </div>
            </Card>
            <Card>
              <h2 className="text-base font-bold">
                Tryout selesai, 7 hari terakhir
              </h2>
              <p className="mt-0.5 text-xs text-ink/50">
                Total {charts.tryoutsTotal} tryout: {charts.tryoutsKilat}{' '}
                Kilat dan {charts.tryoutsAkbar} Akbar.
              </p>
              <div className="mt-3">
                <StackedBarChart
                  data={charts.tryouts}
                  caption={`Total ${charts.tryoutsTotal} tryout, ${charts.tryoutsKilat} Kilat dan ${charts.tryoutsAkbar} Akbar.`}
                />
              </div>
            </Card>
          </div>
          <Card>
            <h2 className="text-base font-bold">Gratis vs premium</h2>
            <p className="mt-0.5 text-xs text-ink/50">
              Pembagian user berdasarkan status premium saat ini.
            </p>
            <div className="mt-3">
              <DonutChart premium={charts.premium} gratis={charts.gratis} />
            </div>
          </Card>
        </>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modul 2: Daftar user + aksi premium                                 */
/* ------------------------------------------------------------------ */

const USER_PAGE_SIZE = 20

function UserModule() {
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [grantTarget, setGrantTarget] = useState<AdminUserRow | null>(null)
  const [grantDays, setGrantDays] = useState<Record<string, string>>({})
  const [revokeTarget, setRevokeTarget] = useState<AdminUserRow | null>(null)
  const [acting, setActing] = useState(false)

  /** Jumlah hari premium untuk satu user (default 30). */
  function daysFor(userId: string): string {
    return grantDays[userId] ?? '30'
  }

  async function loadUsers(search: string, start: number, append: boolean) {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError('')
    const result = await callAdminAction<{
      users: AdminUserRow[]
      total: number
    }>('list_users', { q: search, limit: USER_PAGE_SIZE, offset: start })
    if (!result.ok || !result.data) {
      setError(result.message ?? 'Daftar user gagal dimuat.')
      setLoading(false)
      setLoadingMore(false)
      return
    }
    setUsers((prev) =>
      append ? [...prev, ...result.data!.users] : result.data!.users,
    )
    setTotal(result.data.total)
    setOffset(start + result.data.users.length)
    setLoading(false)
    setLoadingMore(false)
  }

  useEffect(() => {
    loadUsers('', 0, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearch() {
    setUsers([])
    setOffset(0)
    loadUsers(query, 0, false)
  }

  async function handleGrant() {
    if (!grantTarget || acting) return
    const days = Number(daysFor(grantTarget.id))
    if (!Number.isInteger(days) || days <= 0) {
      setError('Jumlah hari harus angka lebih dari 0.')
      return
    }
    setActing(true)
    setError('')
    const result = await callAdminAction<{ premium_until: string }>(
      'grant_premium',
      { user_id: grantTarget.id, days },
    )
    setActing(false)
    if (!result.ok || !result.data) {
      setError(result.message ?? 'Gagal memberi premium.')
      return
    }
    setNotice(
      `Premium ${grantTarget.username} aktif sampai ${formatTanggalIndonesia(result.data.premium_until)}.`,
    )
    setGrantTarget(null)
    loadUsers(query, 0, false)
  }

  async function handleRevoke() {
    if (!revokeTarget || acting) return
    setActing(true)
    setError('')
    const result = await callAdminAction('revoke_premium', {
      user_id: revokeTarget.id,
    })
    setActing(false)
    if (!result.ok) {
      setError(result.message ?? 'Gagal mencabut premium.')
      return
    }
    setNotice(`Premium ${revokeTarget.username} sudah dicabut.`)
    setRevokeTarget(null)
    loadUsers(query, 0, false)
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch()
          }}
          placeholder="Cari username..."
          aria-label="Cari username"
          className="w-full rounded-xl border border-line bg-white px-4 py-2 text-sm outline-none focus:border-primary-400 sm:flex-1"
        />
        <Button onClick={handleSearch} disabled={loading}>
          Cari
        </Button>
      </div>
      <p className="mt-2 text-xs text-ink/50">
        Pencarian berdasarkan username. Email tidak bisa dicari karena
        tidak tersimpan di profil.
      </p>

      {notice && (
        <p className="mt-3 rounded-xl bg-primary-50 px-4 py-2 text-sm text-primary-800">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-ink/60">Memuat daftar user...</p>
      ) : users.length === 0 ? (
        <p className="mt-4 text-sm text-ink/60">
          Tidak ada user yang cocok.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-ink/60">
            Menampilkan {users.length} dari {total} user.
          </p>
          {users.map((u) => (
            <Card key={u.id} padding="md">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold">
                    {u.username}
                    {u.is_admin && (
                      <Badge className="ml-2">Admin</Badge>
                    )}
                  </p>
                  <p className="text-xs text-ink/50">
                    {u.formasi || 'Formasi belum diisi'} · Gabung{' '}
                    {formatTanggalIndonesia(u.created_at)}
                  </p>
                  <p className="mt-1 text-sm text-ink/70">
                    {u.xp} XP · Streak {u.streak} hari · Tryout
                    terakhir:{' '}
                    {u.last_tryout
                      ? `${formatTanggalIndonesia(u.last_tryout.finished_at)} (skor ${u.last_tryout.total})`
                      : 'belum pernah'}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {premiumLabel(u)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={daysFor(u.id)}
                    aria-label={`Jumlah hari premium untuk ${u.username}`}
                    className="w-20 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary-400"
                    onChange={(e) => {
                      const value = e.target.value
                      setGrantDays((prev) => ({ ...prev, [u.id]: value }))
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => setGrantTarget(u)}
                  >
                    Kasih premium
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRevokeTarget(u)}
                  >
                    Cabut premium
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {users.length < total && (
            <Button
              variant="outline"
              onClick={() => loadUsers(query, offset, true)}
              disabled={loadingMore}
              className="w-full"
            >
              {loadingMore ? 'Memuat...' : 'Muat lagi'}
            </Button>
          )}
        </div>
      )}

      <ConfirmModal
        open={grantTarget !== null}
        title="Kasih premium?"
        body={
          grantTarget
            ? `${grantTarget.username} dapat premium ${daysFor(grantTarget.id)} hari, ditambahkan ke masa premiumnya yang masih aktif bila ada.`
            : undefined
        }
        confirmLabel="Ya, kasih premium"
        onConfirm={handleGrant}
        onCancel={() => setGrantTarget(null)}
      />
      <ConfirmModal
        open={revokeTarget !== null}
        title="Cabut premium?"
        body={
          revokeTarget
            ? `Premium ${revokeTarget.username} langsung nonaktif dan masa premiumnya yang tersisa hangus.`
            : undefined
        }
        confirmLabel="Ya, cabut premium"
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modul 3: Kode redeem                                                */
/* ------------------------------------------------------------------ */

function KodeModule() {
  const [codes, setCodes] = useState<AdminCodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [days, setDays] = useState('30')
  const [maxUses, setMaxUses] = useState('1')
  const [expires, setExpires] = useState('')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdCode, setCreatedCode] = useState('')
  const [copied, setCopied] = useState(false)

  async function loadCodes() {
    setLoading(true)
    setError('')
    const result = await callAdminAction<{ codes: AdminCodeRow[] }>(
      'list_codes',
      { limit: 50 },
    )
    if (!result.ok || !result.data) {
      setError(result.message ?? 'Daftar kode gagal dimuat.')
      setLoading(false)
      return
    }
    setCodes(result.data.codes)
    setLoading(false)
  }

  useEffect(() => {
    loadCodes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate() {
    if (creating) return
    const daysNum = Number(days)
    const maxUsesNum = Number(maxUses)
    if (!Number.isInteger(daysNum) || daysNum <= 0) {
      setError('Jumlah hari harus angka lebih dari 0.')
      return
    }
    if (!Number.isInteger(maxUsesNum) || maxUsesNum <= 0) {
      setError('Maksimal pakai harus angka lebih dari 0.')
      return
    }
    setCreating(true)
    setError('')
    setNotice('')
    setCreatedCode('')
    setCopied(false)
    const result = await callAdminAction<{ code: string }>('create_code', {
      premium_days: daysNum,
      max_uses: maxUsesNum,
      expires_at: expires ? new Date(`${expires}T23:59:59+08:00`).toISOString() : null,
      note: note.trim() || null,
    })
    setCreating(false)
    if (!result.ok || !result.data) {
      setError(result.message ?? 'Kode gagal dibuat.')
      return
    }
    setCreatedCode(result.data.code)
    setNotice('Kode baru sudah dibuat.')
    loadCodes()
  }

  async function handleCopy() {
    if (!createdCode) return
    try {
      await navigator.clipboard.writeText(createdCode)
      setCopied(true)
    } catch {
      setError('Gagal menyalin, salin manual aja ya.')
    }
  }

  return (
    <div>
      <Card>
        <h2 className="text-base font-bold">Buat kode baru</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Hari premium</span>
            <input
              type="number"
              min={1}
              max={3650}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              aria-label="Hari premium kode baru"
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary-400"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Maksimal pakai</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              aria-label="Maksimal pakai kode baru"
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary-400"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">
              Kedaluwarsa (opsional)
            </span>
            <input
              type="date"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              aria-label="Tanggal kedaluwarsa kode baru"
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary-400"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Catatan (opsional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Misal: giveaway Instagram"
              aria-label="Catatan kode baru"
              className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary-400"
            />
          </label>
        </div>
        <div className="mt-3">
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? 'Membuat...' : 'Buat kode'}
          </Button>
        </div>
        {createdCode && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-primary-50 px-4 py-3">
            <span className="text-lg font-bold tracking-widest">
              {createdCode}
            </span>
            <Button size="sm" variant="outline" onClick={handleCopy}>
              {copied ? 'Disalin' : 'Salin'}
            </Button>
          </div>
        )}
      </Card>

      {notice && (
        <p className="mt-3 rounded-xl bg-primary-50 px-4 py-2 text-sm text-primary-800">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <h2 className="mt-5 text-base font-bold">Daftar kode</h2>
      {loading ? (
        <p className="mt-2 text-sm text-ink/60">Memuat daftar kode...</p>
      ) : codes.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60">Belum ada kode.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {codes.map((c) => (
            <Card key={c.code} padding="md">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-mono text-base font-bold tracking-wider">
                  {c.code}
                </p>
                <Badge>
                  {c.uses}/{c.max_uses} dipakai
                </Badge>
              </div>
              <p className="mt-1 text-sm text-ink/70">
                {c.premium_days} hari premium
                {c.expires_at
                  ? ` · Berlaku sampai ${formatTanggalIndonesia(c.expires_at)}`
                  : ' · Tanpa kedaluwarsa'}
                {c.note ? ` · ${c.note}` : ''}
              </p>
              <p className="mt-1 text-xs text-ink/50">
                Dibuat {formatTanggalJam(c.created_at)}
              </p>
              {c.redemptions.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-ink/70">
                  {c.redemptions.map((r, i) => (
                    <li key={`${r.username ?? 'anon'}-${i}`}>
                      Ditebus oleh {r.username ?? 'user yang sudah dihapus'}{' '}
                      pada {formatTanggalJam(r.redeemed_at)}.
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modul 4: Pembayaran (klaim QRIS manual, v2.15)                      */
/* ------------------------------------------------------------------ */

/** Label status klaim pembayaran. */
function paymentStatusLabel(status: string): string {
  if (status === 'approved') return 'Disetujui'
  if (status === 'rejected') return 'Ditolak'
  return 'Menunggu verifikasi'
}

function PaymentModule() {
  const [payments, setPayments] = useState<AdminPaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [approveTarget, setApproveTarget] =
    useState<AdminPaymentRow | null>(null)
  const [rejectTarget, setRejectTarget] =
    useState<AdminPaymentRow | null>(null)
  const [acting, setActing] = useState(false)

  async function loadPayments() {
    setLoading(true)
    setError('')
    const result = await callAdminAction<{ payments: AdminPaymentRow[] }>(
      'list_payments',
      { limit: 50 },
    )
    if (!result.ok || !result.data) {
      setError(result.message ?? 'Daftar pembayaran gagal dimuat.')
      setLoading(false)
      return
    }
    setPayments(result.data.payments)
    setLoading(false)
  }

  useEffect(() => {
    loadPayments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Klaim pending dulu (terbaru di atas), lalu yang sudah diproses. */
  const sorted = useMemo(() => {
    const rank = (status: string) => (status === 'pending' ? 0 : 1)
    return [...payments].sort((a, b) => {
      const byStatus = rank(a.status) - rank(b.status)
      if (byStatus !== 0) return byStatus
      return b.created_at.localeCompare(a.created_at)
    })
  }, [payments])

  async function handleApprove() {
    if (!approveTarget || acting) return
    setActing(true)
    setError('')
    setNotice('')
    const result = await callAdminAction<{ premium_until: string }>(
      'approve_payment',
      { payment_id: approveTarget.id },
    )
    setActing(false)
    if (!result.ok || !result.data) {
      setError(result.message ?? 'Gagal menyetujui pembayaran.')
      return
    }
    const name = approveTarget.username ?? 'user'
    setNotice(
      `Pembayaran ${name} disetujui. Premium aktif sampai ${formatTanggalIndonesia(result.data.premium_until)}.`,
    )
    setApproveTarget(null)
    loadPayments()
  }

  async function handleReject() {
    if (!rejectTarget || acting) return
    setActing(true)
    setError('')
    setNotice('')
    const result = await callAdminAction('reject_payment', {
      payment_id: rejectTarget.id,
    })
    setActing(false)
    if (!result.ok) {
      setError(result.message ?? 'Gagal menolak pembayaran.')
      return
    }
    const name = rejectTarget.username ?? 'user'
    setNotice(`Pembayaran ${name} ditolak.`)
    setRejectTarget(null)
    loadPayments()
  }

  return (
    <div>
      <p className="text-sm leading-relaxed text-ink/70">
        Sebelum menyetujui, cocokkan nominal dan waktu klaim dengan
        mutasi QRIS yang masuk. Menyetujui langsung mengaktifkan
        premium untuk user itu.
      </p>

      {notice && (
        <p className="mt-3 rounded-xl bg-primary-50 px-4 py-2 text-sm text-primary-800">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-ink/60">
          Memuat daftar pembayaran...
        </p>
      ) : sorted.length === 0 ? (
        <p className="mt-4 text-sm text-ink/60">
          Belum ada klaim pembayaran.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {sorted.map((p) => {
            const pkg = getPackage(p.package)
            const pending = p.status === 'pending'
            return (
              <Card key={p.id} padding="md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">
                      {p.username ?? 'user yang sudah dihapus'}
                    </p>
                    <p className="text-sm text-ink/70">
                      {pkg?.label ?? p.package} ·{' '}
                      {formatRupiah(p.amount)}
                    </p>
                    <p className="mt-1 text-xs text-ink/50">
                      Diklaim {formatTanggalJam(p.created_at)}
                      {p.verified_at
                        ? ` · Diproses ${formatTanggalJam(p.verified_at)}`
                        : ''}
                      {p.note ? ` · Catatan: ${p.note}` : ''}
                    </p>
                    <p className="mt-1">
                      <Badge>{paymentStatusLabel(p.status)}</Badge>
                    </p>
                  </div>
                  {pending && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => setApproveTarget(p)}
                      >
                        Setujui
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectTarget(p)}
                      >
                        Tolak
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmModal
        open={approveTarget !== null}
        title="Setujui pembayaran ini?"
        body={
          approveTarget
            ? `${approveTarget.username ?? 'User'} mendapat premium ${getPackage(approveTarget.package)?.label ?? approveTarget.package} (${formatRupiah(approveTarget.amount)}). Pastikan nominal dan waktunya cocok dengan mutasi QRIS yang masuk.`
            : undefined
        }
        confirmLabel="Ya, setujui"
        onConfirm={handleApprove}
        onCancel={() => setApproveTarget(null)}
      />
      <ConfirmModal
        open={rejectTarget !== null}
        title="Tolak pembayaran ini?"
        body={
          rejectTarget
            ? `Klaim ${getPackage(rejectTarget.package)?.label ?? rejectTarget.package} (${formatRupiah(rejectTarget.amount)}) dari ${rejectTarget.username ?? 'user'} ditolak. User bisa membuat klaim baru setelah membayar lagi.`
            : undefined
        }
        confirmLabel="Ya, tolak"
        onConfirm={handleReject}
        onCancel={() => setRejectTarget(null)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modul 5: Juara mingguan + kirim ulang email                         */
/* ------------------------------------------------------------------ */

function JuaraModule() {
  const [winners, setWinners] = useState<WinnerRow[]>([])
  const [usernames, setUsernames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resendTarget, setResendTarget] = useState<WinnerRow | null>(null)
  const [resending, setResending] = useState(false)

  async function loadWinners() {
    if (!isSupabaseConfigured() || !supabase) {
      setError('Fitur akun belum aktif.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const { data, error: winnersError } = await supabase
      .from('weekly_winners')
      .select(
        'id, week_start, scope, rank, user_id, total, code, email_sent_at, badge_awarded',
      )
      .order('week_start', { ascending: false })
      .order('scope', { ascending: true })
      .order('rank', { ascending: true })
      .limit(100)
    if (winnersError) {
      setError('Daftar juara gagal dimuat, coba muat ulang ya.')
      setLoading(false)
      return
    }
    const rows = (data ?? []) as WinnerRow[]
    setWinners(rows)
    const ids = [...new Set(rows.map((r) => r.user_id))]
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', ids)
      const map: Record<string, string> = {}
      for (const p of (profiles ?? []) as Array<{
        id: string
        username: string
      }>) {
        map[p.id] = p.username
      }
      setUsernames(map)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadWinners()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const weeks = useMemo(() => {
    const grouped = new Map<string, WinnerRow[]>()
    for (const w of winners) {
      const list = grouped.get(w.week_start) ?? []
      list.push(w)
      grouped.set(w.week_start, list)
    }
    return [...grouped.entries()].sort((a, b) =>
      b[0].localeCompare(a[0]),
    )
  }, [winners])

  async function handleResend() {
    if (!resendTarget || resending) return
    setResending(true)
    setError('')
    setNotice('')
    const result = await callAdminAction<{
      resent: boolean
      detail: string
    }>('resend_winner_email', { winner_id: resendTarget.id })
    setResending(false)
    if (!result.ok || !result.data) {
      setError(result.message ?? 'Kirim ulang gagal.')
      return
    }
    setNotice(result.data.detail)
    setResendTarget(null)
    loadWinners()
  }

  return (
    <div>
      {notice && (
        <p className="rounded-xl bg-primary-50 px-4 py-2 text-sm text-primary-800">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p className="mt-2 text-sm text-ink/60">Memuat daftar juara...</p>
      ) : weeks.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60">
          Belum ada juara mingguan.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {weeks.map(([weekStart, rows]) => (
            <div key={weekStart}>
              <h2 className="text-base font-bold">
                Minggu {formatWeekRange(weekStart)}
              </h2>
              <div className="mt-2 space-y-3">
                {rows.map((w) => (
                  <Card key={w.id} padding="md">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">
                          Juara {w.rank} · {usernames[w.user_id] ?? 'user'}
                          {w.scope !== 'global' && (
                            <span className="font-normal text-ink/60">
                              {' '}
                              ({w.scope})
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-ink/70">
                          Total skor {w.total}
                          {w.scope === 'global' && w.code
                            ? ` · Kode: ${w.code}`
                            : ''}
                        </p>
                        <p className="mt-1 text-sm text-ink/70">
                          {w.scope === 'global'
                            ? w.email_sent_at
                              ? `Email terkirim ${formatTanggalJam(w.email_sent_at)}.`
                              : 'Email belum terkirim.'
                            : 'Juara formasi hanya dapat lencana, tanpa email kode.'}
                        </p>
                      </div>
                      {w.scope === 'global' && w.code && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setResendTarget(w)}
                        >
                          Kirim ulang
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={resendTarget !== null}
        title="Kirim ulang email kode?"
        body={
          resendTarget
            ? `Email berisi kode hadiah dikirim ulang ke juara ${resendTarget.rank} minggu ${formatWeekRange(resendTarget.week_start)}.`
            : undefined
        }
        confirmLabel="Ya, kirim ulang"
        onConfirm={handleResend}
        onCancel={() => setResendTarget(null)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Modul 6: Ringkasan bank soal                                        */
/* ------------------------------------------------------------------ */

function BankModule() {
  const summary = useMemo(() => {
    const perMateri = MATERI_LIST.map((materi) => {
      const all = QUESTIONS.filter((q) => q.materi === materi)
      const keyless = all.filter((q) => q.kunci === null).length
      const noPembahasan = all.filter(
        (q) => (q.pembahasan ?? '').trim() === '',
      ).length
      return {
        materi,
        total: all.length,
        quizable: all.length - keyless,
        keyless,
        noPembahasan,
      }
    })
    const keylessTotal = QUESTIONS.filter((q) => q.kunci === null).length
    const noPembahasanTotal = QUESTIONS.filter(
      (q) => (q.pembahasan ?? '').trim() === '',
    ).length
    return { perMateri, keylessTotal, noPembahasanTotal }
  }, [])

  const cards: Array<{ label: string; value: number; note: string }> = [
    {
      label: 'Total soal',
      value: TOTAL_QUESTIONS,
      note: 'Semua soal di bank, termasuk tanpa kunci.',
    },
    {
      label: 'Bisa dipakai kuis',
      value: TOTAL_QUIZABLE,
      note: 'Soal yang punya kunci jawaban.',
    },
    {
      label: 'Soal tanpa kunci',
      value: summary.keylessTotal,
      note: 'Tidak pernah masuk kuis sampai punya kunci.',
    },
    {
      label: 'Soal tanpa pembahasan',
      value: summary.noPembahasanTotal,
      note: 'Perlu ditulis pembahasannya.',
    },
  ]
  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <p className="text-sm font-medium text-ink/60">{card.label}</p>
            <p className="mt-1 text-3xl font-bold">{card.value}</p>
            <p className="mt-1 text-xs text-ink/50">{card.note}</p>
          </Card>
        ))}
      </div>
      <h2 className="mt-5 text-base font-bold">Per bagian tes</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink/60">
              <th className="py-2 pr-3 font-medium">Bagian</th>
              <th className="py-2 pr-3 font-medium">Total</th>
              <th className="py-2 pr-3 font-medium">Bisa kuis</th>
              <th className="py-2 pr-3 font-medium">Tanpa kunci</th>
              <th className="py-2 font-medium">Tanpa pembahasan</th>
            </tr>
          </thead>
          <tbody>
            {summary.perMateri.map((row) => (
              <tr key={row.materi} className="border-b border-line/60">
                <td className="py-2 pr-3 font-semibold">{row.materi}</td>
                <td className="py-2 pr-3">{row.total}</td>
                <td className="py-2 pr-3">{row.quizable}</td>
                <td className="py-2 pr-3">{row.keyless}</td>
                <td className="py-2">{row.noPembahasan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink/50">
        Angka dihitung dari bank soal yang dibundel di aplikasi ini.
        Modul ini hanya ringkasan, belum bisa mengedit soal.
      </p>
    </div>
  )
}
