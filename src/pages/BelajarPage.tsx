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
  TWK: 'border-ink bg-twk text-white',
  TIU: 'border-ink bg-tiu text-white',
  TKP: 'border-ink bg-tkp text-white',
}

const MATERI_CHIP: Record<Materi, string> = {
  TWK: 'bg-twk',
  TIU: 'bg-tiu',
  TKP: 'bg-tkp',
}

function DocCard({ doc, readSections }: { doc: MateriDoc; readSections: string[] }) {
  const progress = docReadProgress(doc, readSections)
  const selesai = progress.percent === 100

  return (
    <Link to={`/belajar/${doc.id}`}>
      <Card className="transition-transform hover:-translate-y-0.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink font-display text-xs font-extrabold text-white shadow-sticker-sm',
                MATERI_CHIP[doc.materi],
              )}
              aria-hidden="true"
            >
              {doc.materi}
            </span>
            <div className="min-w-0">
              <h3 className="font-display font-extrabold leading-snug">{doc.judul}</h3>
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink/60">
                {doc.deskripsi}
              </p>
            </div>
          </div>
          <ChevronRightIcon
            width={20}
            height={20}
            className="mt-0.5 shrink-0 text-ink/50"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-ink/60">
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
          <span className="shrink-0 text-xs font-extrabold text-ink/60">
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
        <p className="font-script text-2xl leading-none text-primary-700">
          baca dikit-dikit, lama-lama lolos
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Belajar</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          Materi SKD terstruktur per dokumen. Baca seksi materi untuk
          mengumpulkan XP — 5 XP per seksi yang selesai dibaca.
        </p>
        <p className="mt-2 text-xs font-bold text-ink/60">
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
                'mb-3 rounded-3xl border-2 p-4 shadow-sticker',
                MATERI_HEADER[materi],
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-display text-xl font-extrabold">
                    {materi}
                  </span>
                  <Badge tone={MATERI_TONE[materi]}>
                    {MATERI_META[materi].nama}
                  </Badge>
                </div>
                <span className="shrink-0 rounded-full border-2 border-white/40 bg-white/15 px-2.5 py-0.5 text-xs font-extrabold">
                  {progress.percent}% dibaca
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-white/85">
                {MATERI_META[materi].deskripsi}
              </p>
              <p className="mt-2 text-xs font-semibold text-white/75">
                {docs.length} dokumen · {progress.total} seksi ·{' '}
                {formatKata(totalKata)}
              </p>
              <ProgressBar
                value={progress.read}
                max={progress.total}
                tone="amber"
                label={`Progres baca ${materi}`}
                className="mt-2.5 bg-white/25"
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
