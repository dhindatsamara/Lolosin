import { Link, Navigate, useParams } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { CheckIcon, ChevronRightIcon } from '../components/icons'
import {
  estimasiBacaMenit,
  formatDurasi,
  formatKata,
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

function SectionRow({
  entry,
  isRead,
}: {
  entry: SectionEntry
  isRead: boolean
}) {
  const { doc, section } = entry
  return (
    <Link to={`/belajar/${doc.id}/${section.id}`}>
      <div
        className={cx(
          'flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition-all',
          isRead
            ? 'border-primary-200 bg-primary-50'
            : 'border-line bg-white hover:-translate-y-px hover:border-line-strong hover:shadow-soft',
        )}
      >
        <span
          className={cx(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
            isRead
              ? 'border-primary-600 bg-primary-600 text-white'
              : 'border-ink/40 text-transparent',
          )}
          aria-label={isRead ? 'Sudah dibaca' : 'Belum dibaca'}
        >
          <CheckIcon width={14} height={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cx(
              'truncate text-sm font-bold',
              isRead && 'text-ink/70',
            )}
          >
            {section.judul}
          </p>
          <p className="text-xs font-medium text-ink/60">
            {formatKata(section.kata)} ·{' '}
            {formatDurasi(estimasiBacaMenit(section.kata))}
          </p>
        </div>
        <ChevronRightIcon
          width={18}
          height={18}
          className="shrink-0 text-ink/50"
        />
      </div>
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
  const totalHalaman = view.docs.reduce((n, doc) => n + doc.halaman, 0)
  const totalKata = view.docs.reduce((n, doc) => n + doc.kata, 0)
  const catatan = view.docs
    .map((doc) => doc.catatan_kualitas)
    .filter((c): c is string => Boolean(c))

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link
          to="/belajar"
          className="text-sm font-semibold text-primary-700 hover:underline"
        >
          ← Semua materi
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl leading-tight font-extrabold">{view.judul}</h1>
        </div>
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

      {/* Info materi + progres */}
      <Card>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="font-medium text-ink/70">
            <span className="font-bold text-ink">{entries.length}</span>{' '}
            seksi
          </span>
          <span className="font-medium text-ink/70">
            <span className="font-bold text-ink">
              {totalHalaman.toLocaleString('id-ID')}
            </span>{' '}
            halaman
          </span>
          <span className="font-medium text-ink/70">
            <span className="font-bold text-ink">
              {totalKata.toLocaleString('id-ID')}
            </span>{' '}
            kata
          </span>
          <span className="font-medium text-ink/70">
            {formatDurasi(estimasiBacaMenit(totalKata))} baca
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <ProgressBar
            value={progress.read}
            max={progress.total}
            tone={MATERI_TONE[view.materi]}
            label={`Progres baca ${view.judul}`}
          />
          <span className="shrink-0 text-xs font-extrabold text-ink/60">
            {progress.read}/{progress.total} · {progress.percent}%
          </span>
        </div>
        {catatan.map((c, i) => (
          <p
            key={i}
            className="mt-3 rounded-xl border border-accent-200 bg-accent-100 px-3 py-2 text-xs leading-relaxed font-medium text-accent-800"
          >
            <span className="font-extrabold">Catatan kualitas: </span>
            {c}
          </p>
        ))}
        <div className="mt-4">
          {semuaSelesai ? (
            <p className="flex items-center justify-center gap-2 rounded-xl border border-primary-200 bg-primary-100 px-4 py-2.5 text-sm font-bold text-primary-700">
              <CheckIcon width={16} height={16} />
              Semua seksi di materi ini sudah kamu baca
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

      {/* Daftar seksi per subtopik */}
      <div className="flex flex-col gap-5">
        {groups.map((group) => {
          const readInGroup = group.entries.filter((e) =>
            readSet.has(e.section.id),
          ).length
          return (
            <section key={group.subtopik}>
              <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-dashed border-line-strong pb-2">
                <h2 className="font-display text-lg font-extrabold leading-snug">
                  {group.subtopik}
                </h2>
                <span className="shrink-0 text-xs font-bold text-ink/60">
                  {readInGroup}/{group.entries.length} dibaca
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {group.entries.map((entry) => (
                  <SectionRow
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
