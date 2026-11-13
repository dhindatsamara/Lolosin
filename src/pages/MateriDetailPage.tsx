import { Link, Navigate, useParams } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { CheckIcon, ChevronRightIcon } from '../components/icons'
import {
  docReadProgress,
  estimasiBacaMenit,
  formatDurasi,
  formatKata,
  getDocument,
  getNextUnreadSection,
  groupSectionsBySubtopik,
  type MateriSection,
} from '../lib/materi'
import { MATERI_META } from '../lib/questions'
import { useStore } from '../lib/store'
import { cx } from '../lib/utils'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

function SectionRow({
  docId,
  section,
  isRead,
}: {
  docId: string
  section: MateriSection
  isRead: boolean
}) {
  return (
    <Link to={`/belajar/${docId}/${section.id}`}>
      <div
        className={cx(
          'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
          isRead
            ? 'border-primary-200 bg-primary-50/60'
            : 'border-ink/10 bg-white hover:border-primary-300',
        )}
      >
        <span
          className={cx(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
            isRead
              ? 'border-primary-600 bg-primary-600 text-white'
              : 'border-ink/20 text-transparent',
          )}
          aria-label={isRead ? 'Sudah dibaca' : 'Belum dibaca'}
        >
          <CheckIcon width={14} height={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cx(
              'truncate text-sm font-semibold',
              isRead && 'text-ink/60',
            )}
          >
            {section.judul}
          </p>
          <p className="text-xs text-ink/50">
            {formatKata(section.kata)} ·{' '}
            {formatDurasi(estimasiBacaMenit(section.kata))}
          </p>
        </div>
        <ChevronRightIcon
          width={18}
          height={18}
          className="shrink-0 text-ink/30"
        />
      </div>
    </Link>
  )
}

export function MateriDetailPage() {
  const { materiId } = useParams()
  const { readSections } = useStore()
  const doc = getDocument(materiId)

  if (!doc) {
    return <Navigate to="/belajar" replace />
  }

  const progress = docReadProgress(doc, readSections)
  const nextSection = getNextUnreadSection(doc, readSections)
  const groups = groupSectionsBySubtopik(doc)
  const readSet = new Set(readSections)
  const semuaSelesai = progress.percent === 100

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
          <h1 className="text-2xl font-bold leading-snug">{doc.judul}</h1>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={MATERI_TONE[doc.materi]}>{doc.materi}</Badge>
          <span className="text-xs font-medium text-ink/50">
            {MATERI_META[doc.materi].nama}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink/60">
          {doc.deskripsi}
        </p>
      </header>

      {/* Info dokumen + progres */}
      <Card>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-ink/60">
            <span className="font-semibold text-ink">{doc.sections.length}</span>{' '}
            seksi
          </span>
          <span className="text-ink/60">
            <span className="font-semibold text-ink">
              {doc.halaman.toLocaleString('id-ID')}
            </span>{' '}
            halaman
          </span>
          <span className="text-ink/60">
            <span className="font-semibold text-ink">
              {doc.kata.toLocaleString('id-ID')}
            </span>{' '}
            kata
          </span>
          <span className="text-ink/60">
            {formatDurasi(estimasiBacaMenit(doc.kata))} baca
          </span>
        </div>
        <p className="mt-2 truncate text-xs text-ink/40">
          Sumber: {doc.sumber}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <ProgressBar
            value={progress.read}
            max={progress.total}
            tone={MATERI_TONE[doc.materi]}
            label={`Progres baca ${doc.judul}`}
          />
          <span className="shrink-0 text-xs font-bold text-ink/60">
            {progress.read}/{progress.total} · {progress.percent}%
          </span>
        </div>
        {doc.catatan_kualitas && (
          <p className="mt-3 rounded-xl bg-accent-50 px-3 py-2 text-xs leading-relaxed text-accent-800">
            <span className="font-bold">Catatan kualitas: </span>
            {doc.catatan_kualitas}
          </p>
        )}
        <div className="mt-4">
          {semuaSelesai ? (
            <p className="flex items-center justify-center gap-2 rounded-xl bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary-700">
              <CheckIcon width={16} height={16} />
              Semua seksi dokumen ini sudah dibaca
            </p>
          ) : (
            nextSection && (
              <Link to={`/belajar/${doc.id}/${nextSection.id}`}>
                <Button fullWidth>
                  {progress.read === 0
                    ? 'Mulai membaca'
                    : `Lanjutkan: ${nextSection.judul}`}
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
          const readInGroup = group.sections.filter((s) =>
            readSet.has(s.id),
          ).length
          return (
            <section key={group.subtopik}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="font-display font-bold leading-snug">
                  {group.subtopik}
                </h2>
                <span className="shrink-0 text-xs font-medium text-ink/50">
                  {readInGroup}/{group.sections.length} dibaca
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {group.sections.map((section) => (
                  <SectionRow
                    key={section.id}
                    docId={doc.id}
                    section={section}
                    isRead={readSet.has(section.id)}
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
