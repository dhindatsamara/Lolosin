import { useState } from 'react'
import { Badge, type BadgeTone } from '../components/ui/Badge'
import { Mascot } from '../components/Mascot'
import { StickyBackButton } from '../components/belajar/StickyBackButton'
import { TIPS_TRIK, type TipsKategori, type TipsTrik } from '../data/tips-trik'
import { MASCOT_NAME } from '../lib/mascot'
import { cx } from '../lib/utils'

/** Pilihan filter: semua kategori + satu per kategori tips. */
const FILTERS = ['Semua', 'TWK', 'TIU', 'TKP', 'Umum'] as const
type Filter = (typeof FILTERS)[number]

/** Warna badge per kategori (mengikuti tone subtes yang sudah ada). */
const KATEGORI_BADGE: Record<TipsKategori, BadgeTone> = {
  TWK: 'twk',
  TIU: 'tiu',
  TKP: 'tkp',
  Umum: 'amber',
}

/** Warna chip filter saat aktif, seirama dengan badge kategorinya. */
const FILTER_AKTIF: Record<Filter, string> = {
  Semua: 'border-primary-600 bg-primary-600 text-white',
  TWK: 'border-twk bg-twk-soft text-twk',
  TIU: 'border-tiu bg-tiu-soft text-tiu',
  TKP: 'border-tkp bg-tkp-soft text-tkp',
  Umum: 'border-accent-400 bg-accent-100 text-accent-700',
}

/**
 * Kartu satu tips: Osi dengan mood yang cocok di tiap kartu (wajib,
 * permintaan user), badge kategori, judul, dan isi tips.
 */
function TipsCard({ tips }: { tips: TipsTrik }) {
  return (
    <article className="card-lift reveal flex h-full flex-col rounded-2xl border border-line bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <Mascot mood={tips.mood} size={64} />
        <Badge tone={KATEGORI_BADGE[tips.kategori]}>{tips.kategori}</Badge>
      </div>
      <h2 className="mt-3 font-display text-lg font-extrabold leading-snug">
        {tips.judul}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
        {tips.isi}
      </p>
    </article>
  )
}

/**
 * Halaman Tips & Trik Jawab (v2.8.2): kartu-kartu strategi menjawab
 * soal SKD, dengan filter kategori. Masuk dari banner di halaman
 * Belajar. Osi tampil di tiap kartu dengan mood yang cocok.
 */
export function TipsTrikPage() {
  const [filter, setFilter] = useState<Filter>('Semua')

  const tipsTampil =
    filter === 'Semua'
      ? TIPS_TRIK
      : TIPS_TRIK.filter((t) => t.kategori === filter)

  return (
    <div className="flex flex-col gap-6">
      <StickyBackButton to="/belajar" />

      <header>
        <p className="kicker">trik menjawab, bukan bocoran soal</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">
          Tips &amp; Trik Jawab
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          Strategi menjawab soal SKD yang praktis dan bisa langsung
          dipakai. {MASCOT_NAME} menemani di tiap kartu dengan ekspresi
          yang cocok.
        </p>
      </header>

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Filter kategori tips"
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cx(
              'rounded-full border px-4 py-1.5 text-sm font-bold transition-all active:scale-[0.98]',
              filter === f
                ? FILTER_AKTIF[f]
                : 'border-line bg-white text-ink/70 shadow-soft hover:bg-paper',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tipsTampil.map((tips) => (
          <TipsCard key={tips.id} tips={tips} />
        ))}
      </div>
    </div>
  )
}
