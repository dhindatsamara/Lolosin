import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ProgressBar } from '../components/ui/ProgressBar'
import { MarkdownLite } from '../components/belajar/MarkdownLite'
import { PangkatTable } from '../components/belajar/PangkatTable'
import { PoinIntiCard } from '../components/belajar/PoinIntiCard'
import { StickyBackButton } from '../components/belajar/StickyBackButton'
import { CheckIcon, ChevronRightIcon } from '../components/icons'
import {
  cleanJudul,
  docReadProgress,
  getDocument,
  getGroupForDocument,
  getSection,
  getSectionNav,
  getTabelForSection,
  stripTabelContoh,
} from '../lib/materi'
import { useStore, XP_SECTION_READ } from '../lib/store'
import { resolveGambarSrc } from '../lib/materiGambar'
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

  // Kembali ke atas setiap pindah bagian.
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
  const gambarSrc = section.gambar
    ? resolveGambarSrc(section.gambar)
    : null
  const tabel = getTabelForSection(doc, section)
  const konten = tabel ? stripTabelContoh(section.konten) : section.konten
  // Kembali ke tampilan grup materi (judul sudah tanpa atribusi sumber).
  const group = getGroupForDocument(doc.id)
  const backTarget = group ? `/belajar/${group.id}` : `/belajar/${doc.id}`

  function handleMarkRead() {
    if (completeSectionRead(section!.id, doc!.materi)) {
      setShowToast(true)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <StickyBackButton to={backTarget} />

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={MATERI_TONE[doc.materi]}>{doc.materi}</Badge>
          <Badge tone="neutral">{section.subtopik}</Badge>
          {isRead && (
            <Badge tone="green">
              <CheckIcon width={12} height={12} className="mr-1" />
              Sudah dibaca
            </Badge>
          )}
        </div>
        <h1 className="mt-2 font-display text-3xl leading-tight font-extrabold sm:text-4xl">
          {section.judul}
        </h1>
        <p className="mt-1 text-sm font-medium text-ink/60">
          Bagian {nav.index + 1} dari {nav.total}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar
            value={progress.read}
            max={progress.total}
            tone={MATERI_TONE[doc.materi]}
            label={`Progres baca ${cleanJudul(doc.judul)}`}
            className="flex-1"
          />
        </div>
      </header>

      <div className="border-t border-line" aria-hidden="true" />

      {/*
        Mode baca layar penuh (v2.5): isi memakai lebar viewport penuh
        (tanpa kolom sempit di tengah). Di layar lebar, kartu Poin Inti
        menempel di kolom samping; di HP ia tampil di atas isi.
      */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-10">
        <article className="min-w-0">
          {section.poin_inti && section.poin_inti.length > 0 && (
            <div className="mb-8 lg:hidden">
              <PoinIntiCard poinInti={section.poin_inti} />
            </div>
          )}

          {gambarSrc && (
            <figure className="mb-8">
              <img
                src={gambarSrc}
                alt={`Diagram untuk ${section.judul}`}
                className="mx-auto w-full max-w-md rounded-2xl border border-line bg-white p-3 shadow-soft"
                loading="lazy"
              />
            </figure>
          )}

          <MarkdownLite konten={konten} />
          {tabel && (
            <div className="mt-8">
              <PangkatTable pangkat={tabel.pangkat} rows={tabel.rows} />
            </div>
          )}

          {/* Tandai selesai dibaca */}
          <div className="mt-10">
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

          {/* Navigasi bagian (v2.6): label teks arah diganti chevron
              ikon saja; judul bagian tujuan tetap tampil karena itu
              isi navigasinya, bukan teks tombol. Aria-label
              menjelaskan arah + tujuan. */}
          <nav
            aria-label="Navigasi bagian"
            className="mt-6 grid grid-cols-2 gap-3"
          >
            {nav.prev ? (
              <Link
                to={`/belajar/${doc.id}/${nav.prev.id}`}
                aria-label={`Bagian sebelumnya: ${nav.prev.judul}`}
                className="flex items-center gap-1.5 rounded-2xl border border-line bg-white p-3 shadow-soft transition-transform hover:-translate-y-px"
              >
                <span aria-hidden="true" className="text-lg leading-none font-extrabold text-ink/60">
                  ‹
                </span>
                <span className="min-w-0 truncate text-sm font-extrabold">
                  {nav.prev.judul}
                </span>
              </Link>
            ) : (
              <span className="rounded-2xl border border-dashed border-line-strong bg-paper p-3 text-xs font-semibold text-ink/60">
                Ini bagian pertama
              </span>
            )}
            {nav.next ? (
              <Link
                to={`/belajar/${doc.id}/${nav.next.id}`}
                aria-label={`Bagian berikutnya: ${nav.next.judul}`}
                className="flex items-center justify-end gap-1.5 rounded-2xl border border-line bg-white p-3 text-right shadow-soft transition-transform hover:-translate-y-px"
              >
                <span className="min-w-0 truncate text-sm font-extrabold">
                  {nav.next.judul}
                </span>
                <span aria-hidden="true" className="text-lg leading-none font-extrabold text-ink/60">
                  ›
                </span>
              </Link>
            ) : (
              <span className="rounded-2xl border border-dashed border-line-strong bg-paper p-3 text-right text-xs font-semibold text-ink/60">
                Ini bagian terakhir
              </span>
            )}
          </nav>

          <Link to={backTarget} className="mt-6 block">
            <Button variant="outline" fullWidth>
              Kembali ke materi
              <ChevronRightIcon width={16} height={16} />
            </Button>
          </Link>
        </article>

        {/* Kolom samping: Poin Inti menempel saat menggulir (desktop). */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            {section.poin_inti && section.poin_inti.length > 0 && (
              <PoinIntiCard poinInti={section.poin_inti} />
            )}
          </div>
        </aside>
      </div>

      {/* Toast +XP */}
      <div
        aria-live="polite"
        className={cx(
          'pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 transition-all duration-300',
          showToast ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        )}
      >
        <p className="rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white shadow-soft-lg">
          +{XP_SECTION_READ} XP! Bagian ini sudah kamu baca
        </p>
      </div>
    </div>
  )
}
