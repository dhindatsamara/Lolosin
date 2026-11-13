import { Link } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { CheckIcon, ChevronRightIcon } from '../components/icons'
import {
  docReadProgress,
  estimasiBacaMenit,
  formatDurasi,
  formatKata,
  getDocumentsByMateri,
  materiReadProgress,
  TOTAL_DOKUMEN,
  TOTAL_KATA,
  TOTAL_SECTIONS,
  type MateriDoc,
} from '../lib/materi'
import { MATERI_LIST, MATERI_META, type Materi } from '../lib/questions'
import { useStore } from '../lib/store'
import { cx } from '../lib/utils'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

const MATERI_HEADER: Record<Materi, string> = {
  TWK: 'border-twk/25 bg-twk-soft',
  TIU: 'border-tiu/25 bg-tiu-soft',
  TKP: 'border-tkp/25 bg-tkp-soft',
}

const MATERI_TEXT: Record<Materi, string> = {
  TWK: 'text-twk',
  TIU: 'text-tiu',
  TKP: 'text-tkp',
}

function DocCard({ doc, readSections }: { doc: MateriDoc; readSections: string[] }) {
  const progress = docReadProgress(doc, readSections)
  const selesai = progress.percent === 100

  return (
    <Link to={`/belajar/${doc.id}`}>
      <Card className="transition-colors hover:border-primary-300">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display font-bold leading-snug">{doc.judul}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink/60">
              {doc.deskripsi}
            </p>
          </div>
          <ChevronRightIcon
            width={20}
            height={20}
            className="mt-0.5 shrink-0 text-ink/30"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-medium text-ink/50">
          <span>{doc.sections.length} seksi</span>
          <span aria-hidden="true">·</span>
          <span>{formatKata(doc.kata)}</span>
          <span aria-hidden="true">·</span>
          <span>{formatDurasi(estimasiBacaMenit(doc.kata))} baca</span>
          {selesai && (
            <Badge tone="green" className="ml-auto">
              <CheckIcon width={12} height={12} className="mr-1" />
              Selesai
            </Badge>
          )}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <ProgressBar
            value={progress.read}
            max={progress.total}
            tone={MATERI_TONE[doc.materi]}
            label={`Progres baca ${doc.judul}`}
          />
          <span className="shrink-0 text-xs font-bold text-ink/60">
            {progress.percent}%
          </span>
        </div>
      </Card>
    </Link>
  )
}

export function BelajarPage() {
  const { readSections } = useStore()

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Belajar</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          Materi SKD terstruktur per dokumen. Baca seksi materi untuk
          mengumpulkan XP — 5 XP per seksi yang selesai dibaca.
        </p>
        <p className="mt-2 text-xs font-semibold text-ink/50">
          {TOTAL_DOKUMEN} dokumen · {TOTAL_SECTIONS} seksi ·{' '}
          {TOTAL_KATA.toLocaleString('id-ID')} kata
        </p>
      </header>

      {MATERI_LIST.map((materi) => {
        const docs = getDocumentsByMateri(materi)
        const progress = materiReadProgress(materi, readSections)
        const totalKata = docs.reduce((n, doc) => n + doc.kata, 0)
        return (
          <section key={materi}>
            <div
              className={cx(
                'mb-3 rounded-2xl border p-4',
                MATERI_HEADER[materi],
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cx('font-display text-lg font-bold', MATERI_TEXT[materi])}
                  >
                    {materi}
                  </span>
                  <Badge tone={MATERI_TONE[materi]}>
                    {MATERI_META[materi].nama}
                  </Badge>
                </div>
                <span className="shrink-0 text-xs font-bold text-ink/60">
                  {progress.percent}% dibaca
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-ink/60">
                {MATERI_META[materi].deskripsi}
              </p>
              <p className="mt-2 text-xs font-medium text-ink/50">
                {docs.length} dokumen · {progress.total} seksi ·{' '}
                {formatKata(totalKata)}
              </p>
              <ProgressBar
                value={progress.read}
                max={progress.total}
                tone={MATERI_TONE[materi]}
                label={`Progres baca ${materi}`}
                className="mt-2.5"
              />
            </div>
            <div className="flex flex-col gap-3">
              {docs.map((doc) => (
                <DocCard key={doc.id} doc={doc} readSections={readSections} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
