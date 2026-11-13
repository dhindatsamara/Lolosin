import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MATERI_LIST, MATERI_META } from '../lib/questions'
import {
  predictFromHistory,
  type PredictionBand,
  type SectionPrediction,
} from '../lib/prediction'
import { MAKASSAR_TIME_ZONE, type TryoutRecord } from '../lib/store'
import { cx } from '../lib/utils'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { ProgressBar } from './ui/ProgressBar'
import { Mascot } from './Mascot'
import { ChevronRightIcon } from './icons'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

const MATERI_CARD = {
  TWK: 'border-ink bg-twk text-white',
  TIU: 'border-ink bg-tiu text-white',
  TKP: 'border-ink bg-tkp text-white',
} as const

const BAND_PILL: Record<PredictionBand, string> = {
  aman: 'bg-primary-100 text-primary-700',
  'hampir-aman': 'bg-accent-100 text-accent-700',
  'butuh-kejar': 'bg-orange-100 text-orange-700',
  'masih-jauh': 'bg-red-100 text-red-700',
}

const KALIMAT_JUJUR_MINI =
  'Ini perkiraan dari tryout minimu, bukan jaminan lolos. Tryout mini hanya 30 soal, jadi angkanya masih kasar.'

const KALIMAT_JUJUR_SIMULASI =
  'Ini perkiraan dari simulasi CAT-mu, bukan jaminan lolos. Simulasi CAT pakai 110 soal dan passing grade asli, jadi angkanya lebih dekat ke ujian beneran.'

const BELUM_ADA_TREN =
  'Belum ada tren, ikut tryout lagi untuk melihat perkembanganmu.'

/** Angka tampil: skor TIU dan TKP bisa setengah poin (80,5). */
function fmt(n: number): string {
  return n.toLocaleString('id-ID')
}

/** Selisih terhadap passing grade, misal "6 poin di atas passing grade". */
function teksSelisih(diff: number): string {
  if (diff > 0) return `${fmt(diff)} poin di atas passing grade`
  if (diff === 0) return 'Pas di passing grade'
  return `${fmt(Math.abs(diff))} poin lagi`
}

/** Tren per seksi, atau null bila baru ada 1 tryout. */
function teksTren(trend: number | null): string | null {
  if (trend === null) return null
  if (trend > 0) return `Naik ${fmt(trend)} poin dari tryout sebelumnya.`
  if (trend < 0)
    return `Turun ${fmt(Math.abs(trend))} poin dari tryout sebelumnya.`
  return 'Skornya sama seperti tryout sebelumnya.'
}

function formatTanggalTryout(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: MAKASSAR_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

interface PredictionPanelProps {
  /** Riwayat tryout dari store; panel menghitung sendiri lewat predictFromHistory. */
  history: readonly TryoutRecord[]
  /** Varian ringkas untuk dashboard: satu kartu, satu baris per seksi. */
  compact?: boolean
}

/**
 * Panel prediksi kelolosan, dipakai di halaman hasil tryout (penuh)
 * dan di dashboard (ringkas). Semua angka berasal dari
 * `predictFromHistory`, komponen ini hanya menampilkan, tidak
 * menghitung skala atau passing grade sendiri.
 */
export function PredictionPanel({
  history,
  compact = false,
}: PredictionPanelProps) {
  const prediction = useMemo(() => predictFromHistory(history), [history])

  if (!prediction) {
    return (
      <section aria-label="Perkiraan kelolosan">
        {!compact && (
          <div className="mb-3">
            <p className="font-script text-2xl leading-none text-primary-700">
              kira kira peluangmu
            </p>
            <h2 className="mt-1 font-display text-xl font-extrabold">
              Perkiraan kelolosan
            </h2>
          </div>
        )}
        <Card className="p-5 text-center">
          <Mascot
            mood="semangat"
            size={compact ? 56 : 72}
            className="mx-auto"
          />
          {compact && (
            <p className="mt-2 font-display text-base font-extrabold">
              Perkiraan kelolosan
            </p>
          )}
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink/60">
            Ikut tryout kilat atau simulasi CAT dulu, nanti aku hitung
            perkiraan kelolosanmu.
          </p>
          <Link to="/tryout" className="mt-4 inline-block">
            <Button size="sm">
              Mulai tryout
              <ChevronRightIcon width={16} height={16} />
            </Button>
          </Link>
        </Card>
      </section>
    )
  }

  const sections = MATERI_LIST.map((m) => prediction.sections[m])
  // Ringkasan sumber riwayat: simulasi saja, campuran, atau mini saja.
  const simulasiCount = prediction.simulasiCount ?? 0
  const miniCount = prediction.tryoutCount - simulasiCount
  const tanggalTerakhir = formatTanggalTryout(prediction.lastDate)
  const ringkasanRiwayat =
    simulasiCount > 0 && miniCount > 0
      ? `Dari ${simulasiCount} simulasi CAT dan ${miniCount} tryout mini, terakhir ${tanggalTerakhir}`
      : simulasiCount > 0
        ? `Dari ${simulasiCount} simulasi CAT, terakhir ${tanggalTerakhir}`
        : `Dari ${prediction.tryoutCount} tryout mini, terakhir ${tanggalTerakhir}`
  const kalimatJujur =
    prediction.source === 'simulasi'
      ? KALIMAT_JUJUR_SIMULASI
      : KALIMAT_JUJUR_MINI

  if (compact) {
    return (
      <section aria-label="Perkiraan kelolosan">
        <div className="mb-3">
          <p className="font-script text-2xl leading-none text-primary-700">
            kira kira peluangmu
          </p>
          <h2 className="mt-1 font-display text-xl font-extrabold">
            Perkiraan kelolosan
          </h2>
          <p className="mt-0.5 text-xs font-medium text-ink/60">
            {ringkasanRiwayat}
          </p>
        </div>
        <Card className="p-5">
          <div className="flex flex-col gap-4">
            {sections.map((s) => (
              <CompactRow key={s.materi} section={s} />
            ))}
          </div>
          {prediction.tryoutCount === 1 && (
            <p className="mt-4 border-t-2 border-dashed border-ink/10 pt-3 text-xs leading-relaxed font-medium text-ink/60">
              {BELUM_ADA_TREN}
            </p>
          )}
          <p className="mt-3 border-t-2 border-dashed border-ink/10 pt-3 text-xs leading-relaxed font-medium text-ink/60">
            {kalimatJujur}
          </p>
        </Card>
      </section>
    )
  }

  return (
    <section aria-label="Perkiraan kelolosan">
      <div className="mb-3">
        <p className="font-script text-2xl leading-none text-primary-700">
          kira kira peluangmu
        </p>
        <h2 className="mt-1 font-display text-xl font-extrabold">
          Perkiraan kelolosan
        </h2>
        <p className="mt-0.5 text-xs font-medium text-ink/60">
          {ringkasanRiwayat}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {sections.map((s) => (
          <FullCard key={s.materi} section={s} />
        ))}
      </div>
      {prediction.tryoutCount === 1 && (
        <p className="mt-3 rounded-2xl border-2 border-ink bg-white px-4 py-3 text-center text-sm font-bold text-ink/70 shadow-sticker-sm">
          {BELUM_ADA_TREN}
        </p>
      )}
      <p className="mt-3 rounded-2xl border-2 border-dashed border-ink/40 bg-paper px-4 py-3 text-sm leading-relaxed font-medium text-ink/70">
        {kalimatJujur}
      </p>
    </section>
  )
}

/** Satu seksi versi penuh: kartu berwarna seperti breakdown hasil tryout. */
function FullCard({ section: s }: { section: SectionPrediction }) {
  const tren = teksTren(s.trend)
  return (
    <Card className={MATERI_CARD[s.materi]}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={MATERI_TONE[s.materi]}>{s.materi}</Badge>
          <span className="text-sm font-semibold">
            {MATERI_META[s.materi].nama}
          </span>
        </div>
        <span
          className={cx(
            'shrink-0 rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-bold',
            BAND_PILL[s.band],
          )}
        >
          {s.bandLabel}
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-bold">
        {s.materi} {fmt(s.scaled)}
        <span className="text-sm font-semibold text-white/75">
          {' '}
          dari {fmt(s.max)}
        </span>
      </p>
      <ProgressBar
        value={s.scaled}
        max={s.max}
        tone="amber"
        label={`Skor CAT ${s.materi}`}
        className="mt-2 bg-white/25"
      />
      <p className="mt-1.5 text-xs font-semibold text-white/85">
        Passing grade: {fmt(s.passing)} · {teksSelisih(s.diff)}
      </p>
      {tren && (
        <p className="mt-1 text-xs font-semibold text-white/85">{tren}</p>
      )}
    </Card>
  )
}

/** Satu seksi versi ringkas: satu baris di dalam kartu dashboard. */
function CompactRow({ section: s }: { section: SectionPrediction }) {
  const tren = teksTren(s.trend)
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-extrabold">
          {s.materi} {fmt(s.scaled)} dari {fmt(s.max)}
        </p>
        <span
          className={cx(
            'shrink-0 rounded-full border-2 border-ink px-2 py-0.5 text-[11px] font-bold',
            BAND_PILL[s.band],
          )}
        >
          {s.bandLabel}
        </span>
      </div>
      <p className="mt-0.5 text-xs font-medium text-ink/60">
        Passing grade {fmt(s.passing)} · {teksSelisih(s.diff)}
      </p>
      {tren && (
        <p className="mt-0.5 text-xs font-medium text-ink/60">{tren}</p>
      )}
      <ProgressBar
        value={s.scaled}
        max={s.max}
        tone={MATERI_TONE[s.materi]}
        label={`Skor CAT ${s.materi}`}
        className="mt-1.5"
      />
    </div>
  )
}
