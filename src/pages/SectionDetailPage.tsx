import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { MarkdownLite } from '../components/belajar/MarkdownLite'
import { PangkatTable } from '../components/belajar/PangkatTable'
import { CheckIcon, ChevronRightIcon } from '../components/icons'
import {
  docReadProgress,
  estimasiBacaMenit,
  formatDurasi,
  formatKata,
  getDocument,
  getSection,
  getSectionNav,
  getTabelForSection,
  stripTabelContoh,
} from '../lib/materi'
import { useStore, XP_SECTION_READ } from '../lib/store'
import { completeSectionRead } from '../lib/gamification'
import { cx } from '../lib/utils'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

export function SectionDetailPage() {
  const { materiId, sectionId } = useParams()
  const { readSections } = useStore()
  const [showToast, setShowToast] = useState(false)

  const doc = getDocument(materiId)
  const section = getSection(materiId, sectionId)
  const nav = getSectionNav(materiId, sectionId)

  // Kembali ke atas setiap pindah seksi.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [sectionId])

  // Toast +5 XP hilang sendiri setelah 3 detik.
  useEffect(() => {
    if (!showToast) return
    const timer = setTimeout(() => setShowToast(false), 3000)
    return () => clearTimeout(timer)
  }, [showToast])

  if (!doc || !section) {
    return <Navigate to={doc ? `/belajar/${doc.id}` : '/belajar'} replace />
  }

  const isRead = readSections.includes(section.id)
  const progress = docReadProgress(doc, readSections)
  const tabel = getTabelForSection(doc, section)
  const konten = tabel ? stripTabelContoh(section.konten) : section.konten

  function handleMarkRead() {
    if (completeSectionRead(section!.id, doc!.materi)) {
      setShowToast(true)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link
          to={`/belajar/${doc.id}`}
          className="text-sm font-semibold text-primary-700 hover:underline"
        >
          ← {doc.judul}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={MATERI_TONE[doc.materi]}>{doc.materi}</Badge>
          <Badge tone="neutral">{section.subtopik}</Badge>
          {isRead && (
            <Badge tone="green">
              <CheckIcon width={12} height={12} className="mr-1" />
              Sudah dibaca
            </Badge>
          )}
        </div>
        <h1 className="mt-2 font-display text-3xl leading-tight font-extrabold">
          {section.judul}
        </h1>
        <p className="mt-1 text-sm font-medium text-ink/60">
          Seksi {nav.index + 1} dari {nav.total} · {formatKata(section.kata)}{' '}
          · {formatDurasi(estimasiBacaMenit(section.kata))} baca
        </p>
        <div className="mt-3 flex items-center gap-2">
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
      </header>

      {/* Isi seksi */}
      <Card className="p-5 sm:p-6">
        <div className="mx-auto max-w-prose">
          <MarkdownLite konten={konten} />
          {tabel && <PangkatTable pangkat={tabel.pangkat} rows={tabel.rows} />}
        </div>
      </Card>

      {/* Tandai selesai dibaca */}
      <div>
        {isRead ? (
          <p className="flex items-center justify-center gap-2 rounded-xl border border-primary-200 bg-primary-100 px-4 py-3 text-sm font-bold text-primary-700">
            <CheckIcon width={16} height={16} />
            Sudah dibaca · +{XP_SECTION_READ} XP buatmu
          </p>
        ) : (
          <Button size="lg" fullWidth onClick={handleMarkRead}>
            <CheckIcon width={18} height={18} />
            Tandai selesai dibaca (+{XP_SECTION_READ} XP)
          </Button>
        )}
      </div>

      {/* Navigasi seksi */}
      <nav
        aria-label="Navigasi seksi"
        className="grid grid-cols-2 gap-3"
      >
        {nav.prev ? (
          <Link
            to={`/belajar/${doc.id}/${nav.prev.id}`}
            className="rounded-2xl border border-line bg-white p-3 shadow-soft transition-transform hover:-translate-y-px"
          >
            <span className="text-xs font-bold text-ink/60">
              ← Sebelumnya
            </span>
            <span className="mt-0.5 block truncate text-sm font-extrabold">
              {nav.prev.judul}
            </span>
          </Link>
        ) : (
          <span className="rounded-2xl border border-dashed border-line-strong bg-paper p-3 text-xs font-semibold text-ink/60">
            Ini seksi pertama
          </span>
        )}
        {nav.next ? (
          <Link
            to={`/belajar/${doc.id}/${nav.next.id}`}
            className="rounded-2xl border border-line bg-white p-3 text-right shadow-soft transition-transform hover:-translate-y-px"
          >
            <span className="text-xs font-bold text-ink/60">
              Berikutnya →
            </span>
            <span className="mt-0.5 block truncate text-sm font-extrabold">
              {nav.next.judul}
            </span>
          </Link>
        ) : (
          <span className="rounded-2xl border border-dashed border-line-strong bg-paper p-3 text-right text-xs font-semibold text-ink/60">
            Ini seksi terakhir
          </span>
        )}
      </nav>

      <Link to={`/belajar/${doc.id}`} className="block">
        <Button variant="outline" fullWidth>
          Kembali ke dokumen
          <ChevronRightIcon width={16} height={16} />
        </Button>
      </Link>

      {/* Toast +XP */}
      <div
        aria-live="polite"
        className={cx(
          'pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 transition-all duration-300',
          showToast ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        )}
      >
        <p className="rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white shadow-soft-lg">
          +{XP_SECTION_READ} XP! Seksi ini sudah kamu baca
        </p>
      </div>
    </div>
  )
}
