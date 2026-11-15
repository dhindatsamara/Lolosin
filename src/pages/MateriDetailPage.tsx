import { Link, Navigate, useParams } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { StickyBackButton } from '../components/belajar/StickyBackButton'
import { CheckIcon, ChevronRightIcon } from '../components/icons'
import {
  groupEntriesBySubtopik,
  groupNextUnreadSection,
  groupReadProgress,
  groupSections,
  resolveMateriView,
  type SectionEntry,
} from '../lib/materi'
import { MATERI_META } from '../lib/questions'
import { useStore } from '../lib/store'
import { cx } from '../lib/utils'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

/**
 * Kartu satu sub-materi: judul + indikator sudah dibaca. Kartu satu
 * tujuan (single-destination): satu Link membungkus satu <article>,
 * tanpa tombol atau tautan lain di dalamnya. Status baca ditandai
 * dengan ikon centang dan label teks, bukan warna saja.
 */
function SectionCard({
  entry,
  isRead,
}: {
  entry: SectionEntry
  isRead: boolean
}) {
  const { doc, section } = entry
  return (
    <Link to={`/belajar/${doc.id}/${section.id}`} className="block h-full">
      <article
        className={cx(
          'card-lift reveal flex h-full items-start gap-3 rounded-2xl border p-4 shadow-soft',
          isRead
            ? 'border-primary-200 bg-primary-50'
            : 'border-line bg-white',
        )}
      >
        <span
          className={cx(
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
            isRead
              ? 'border-primary-600 bg-primary-600 text-white'
              : 'border-ink/40 text-transparent',
          )}
          aria-label={isRead ? 'Sudah dibaca' : 'Belum dibaca'}
        >
          <CheckIcon width={14} height={14} />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={cx(
              'line-clamp-2 text-sm leading-snug font-bold',
              isRead && 'text-ink/70',
            )}
          >
            {section.judul}
          </h3>
          <p className="mt-1 text-xs font-semibold text-ink/50">
            {isRead ? 'Sudah dibaca' : 'Belum dibaca'}
          </p>
        </div>
        <ChevronRightIcon
          width={18}
          height={18}
          className="mt-0.5 shrink-0 text-ink/40"
        />
      </article>
    </Link>
  )
}

export function MateriDetailPage() {
  const { materiId } = useParams()
  const { readSections } = useStore()
  const view = resolveMateriView(materiId)

  if (!view) {
    return <Navigate to="/belajar" replace />
  }

  const progress = groupReadProgress(view, readSections)
  const nextEntry = groupNextUnreadSection(view, readSections)
  const entries = groupSections(view)
  const groups = groupEntriesBySubtopik(entries)
  const readSet = new Set(readSections)
  const semuaSelesai = progress.percent === 100

  return (
    <div className="flex flex-col gap-5">
      <StickyBackButton to="/belajar" />

      <header>
        <h1 className="font-display text-3xl leading-tight font-extrabold">
          {view.judul}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={MATERI_TONE[view.materi]}>{view.materi}</Badge>
          <span className="text-xs font-semibold text-ink/60">
            {MATERI_META[view.materi].nama}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink/60">
          {view.deskripsi}
        </p>
      </header>

      {/* Progres baca (visual, tanpa angka) + lanjut baca */}
      <Card>
        <div className="flex items-center gap-3">
          <ProgressBar
            value={progress.read}
            max={progress.total}
            tone={MATERI_TONE[view.materi]}
            label={`Progres baca ${view.judul}`}
            className="flex-1"
          />
          <span className="shrink-0 text-xs font-extrabold text-ink/60">
            {semuaSelesai
              ? 'Selesai dibaca'
              : progress.read > 0
                ? 'Lagi berjalan'
                : 'Belum mulai'}
          </span>
        </div>
        <div className="mt-4">
          {semuaSelesai ? (
            <p className="flex items-center justify-center gap-2 rounded-xl border border-primary-200 bg-primary-100 px-4 py-2.5 text-sm font-bold text-primary-700">
              <CheckIcon width={16} height={16} />
              Semua bagian di materi ini sudah kamu baca
            </p>
          ) : (
            nextEntry && (
              <Link
                to={`/belajar/${nextEntry.doc.id}/${nextEntry.section.id}`}
              >
                <Button fullWidth>
                  {progress.read === 0
                    ? 'Mulai membaca'
                    : `Lanjutkan: ${nextEntry.section.judul}`}
                  <ChevronRightIcon width={16} height={16} />
                </Button>
              </Link>
            )
          )}
        </div>
      </Card>

      {/* Daftar sub-materi sebagai kartu, per subtopik */}
      <div className="flex flex-col gap-6">
        {groups.map((group) => {
          const semuaDibaca = group.entries.every((e) =>
            readSet.has(e.section.id),
          )
          return (
            <section key={group.subtopik}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-extrabold leading-snug">
                  {group.subtopik}
                </h2>
                {semuaDibaca && (
                  <Badge tone="green">
                    <CheckIcon width={12} height={12} className="mr-1" />
                    Selesai
                  </Badge>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.entries.map((entry) => (
                  <SectionCard
                    key={entry.section.id}
                    entry={entry}
                    isRead={readSet.has(entry.section.id)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
