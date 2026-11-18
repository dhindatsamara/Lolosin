import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  countByTopic,
  countNewByTopic,
  getTopics,
  MATERI_LIST,
  MATERI_META,
  type Materi,
} from '../lib/questions'
import { DRILL_DEFAULT_COUNT } from '../lib/quiz'
import { reviewCountDue } from '../lib/review'
import { useStore } from '../lib/store'
import { cx } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { GuestProgressWarning } from '../components/GuestProgressWarning'
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  CrownIcon,
  TargetIcon,
} from '../components/icons'

const MATERI_BUTTON: Record<Materi, string> = {
  TWK: 'border-twk bg-twk-soft text-twk',
  TIU: 'border-tiu bg-tiu-soft text-tiu',
  TKP: 'border-tkp bg-tkp-soft text-tkp',
}

const MATERI_FEATURED: Record<Materi, string> = {
  TWK: 'border-l-4 border-l-twk',
  TIU: 'border-l-4 border-l-tiu',
  TKP: 'border-l-4 border-l-tkp',
}

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

/**
 * Halaman pemilih drill: pilih materi (TWK/TIU/TKP) lalu topik.
 * Tiap topik menampilkan jumlah soal total, yang sudah dijawab, dan yang
 * masih baru. Satu sesi = 10 soal, soal baru selalu didahulukan.
 * Kartu topik dibuat padat (judul + tombol sebaris, progres di bawah)
 * supaya daftarnya tidak banyak scroll.
 */
export function LatihanPage() {
  const navigate = useNavigate()
  const { seenQuestionIds, reviewQueue } = useStore()
  const [materi, setMateri] = useState<Materi>('TIU')

  const topics = useMemo(() => getTopics(materi), [materi])
  const counts = useMemo(() => countByTopic(materi), [materi])
  const newCounts = useMemo(
    () => countNewByTopic(materi, seenQuestionIds),
    [materi, seenQuestionIds],
  )
  const jumlahUlas = useMemo(() => reviewCountDue(), [reviewQueue])

  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0)
  const newAll = Object.values(newCounts).reduce((a, b) => a + b, 0)

  function startDrill(subtopik: string | null) {
    navigate('/latihan/jalan', { state: { materi, subtopik } })
  }

  return (
    <div className="flex flex-col gap-5">
      <GuestProgressWarning />

      <header>
        <p className="kicker">latihan terus, biar makin jago</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Latihan</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          Drill {DRILL_DEFAULT_COUNT} soal per sesi, pembahasannya langsung
          keluar. Soal baru selalu didahulukan, jadi nggak gampang ketemu
          soal yang sama.
        </p>
      </header>

      {/* Ulas soal salah: selalu gampang ditemukan di atas daftar topik */}
      <Card padding="none" className="flex items-center gap-3 p-3">
        <span
          className={cx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            jumlahUlas > 0
              ? 'bg-accent-100 text-accent-700'
              : 'bg-primary-100 text-primary-700',
          )}
        >
          {jumlahUlas > 0 ? (
            <ClockIcon width={20} height={20} />
          ) : (
            <CheckIcon width={20} height={20} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold">Ulas soal salah</p>
          <p className="mt-0.5 text-xs leading-relaxed font-medium text-ink/60">
            {jumlahUlas > 0
              ? `${jumlahUlas} soal perlu diulas hari ini, biar makin nempel.`
              : 'Belum ada yang perlu diulas hari ini.'}
          </p>
        </div>
        <Link to="/latihan/ulas" className="shrink-0">
          <Button
            size="sm"
            variant={jumlahUlas > 0 ? 'secondary' : 'outline'}
          >
            Mulai ulas
            <ChevronRightIcon width={16} height={16} />
          </Button>
        </Link>
      </Card>

      {/* Peta Kelemahan (v2.8, Premium): akurasi per subtopik + latihan
          yang disarankan untuk bagian yang paling lemah. */}
      <Link to="/peta-kelemahan" className="block">
        <Card
          padding="none"
          className="flex items-center gap-3 border-accent-200 bg-accent-50 p-3 transition-all hover:shadow-soft-lg active:scale-[0.98]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-400 text-ink">
            <CrownIcon width={20} height={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold">Peta Kelemahan</p>
            <p className="mt-0.5 text-xs leading-relaxed font-medium text-ink/60">
              Lihat bagian mana yang paling perlu diasah, plus latihan
              yang disarankan. Fitur Premium.
            </p>
          </div>
          <ChevronRightIcon
            width={18}
            height={18}
            className="shrink-0 text-ink/60"
          />
        </Card>
      </Link>

      <section aria-label="Pilih materi">
        <h2 className="mb-2 font-display text-base font-extrabold">Pilih materi</h2>
        <div className="grid grid-cols-3 gap-2">
          {MATERI_LIST.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMateri(m)}
              aria-pressed={materi === m}
              className={cx(
                'rounded-2xl border px-2 py-2.5 text-center transition-all active:scale-[0.98]',
                materi === m
                  ? MATERI_BUTTON[m]
                  : 'border-line bg-white text-ink/70 shadow-soft hover:bg-paper',
              )}
            >
              <span className="block font-display font-extrabold">{m}</span>
              <span className="mt-0.5 block text-[11px] leading-tight font-semibold">
                {MATERI_META[m].nama}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed font-medium text-ink/60">
          {MATERI_META[materi].deskripsi}
        </p>
      </section>

      <section aria-label="Pilih topik">
        <h2 className="mb-2 font-display text-base font-extrabold">
          Pilih topik {materi}
        </h2>
        <div className="grid gap-2 lg:grid-cols-2">
          {/* Semua topik */}
          <TopicRow
            title={`Semua topik ${materi}`}
            subtitle="Campuran dari seluruh topik"
            total={totalAll}
            baru={newAll}
            materi={materi}
            featured
            onStart={() => startDrill(null)}
          />

          {topics.map((topic) => (
            <TopicRow
              key={topic}
              title={topic}
              total={counts[topic] ?? 0}
              baru={newCounts[topic] ?? 0}
              materi={materi}
              onStart={() => startDrill(topic)}
            />
          ))}
        </div>

        {topics.length === 0 && (
          <p className="mt-2 text-sm text-ink/60">
            Waduh, soal {materi} belum ada di bank soal.
          </p>
        )}
      </section>
    </div>
  )
}

interface TopicRowProps {
  title: string
  subtitle?: string
  total: number
  baru: number
  materi: Materi
  featured?: boolean
  onStart: () => void
}

function TopicRow({
  title,
  subtitle,
  total,
  baru,
  materi,
  featured = false,
  onStart,
}: TopicRowProps) {
  const dijawab = total - baru
  return (
    <Card
      padding="none"
      className={cx(
        'flex flex-col gap-2 p-3',
        featured && MATERI_FEATURED[materi],
        featured && 'lg:col-span-2',
      )}
    >
      <div className="flex items-center gap-2">
        <TargetIcon
          width={16}
          height={16}
          className={cx(
            'shrink-0',
            materi === 'TWK'
              ? 'text-twk'
              : materi === 'TIU'
                ? 'text-tiu'
                : 'text-tkp',
          )}
        />
        <p className="min-w-0 flex-1 text-sm leading-snug font-extrabold">
          {title}
          {subtitle && (
            <span className="mt-0.5 block text-xs font-medium text-ink/60">
              {subtitle}
            </span>
          )}
        </p>
        <Button
          size="sm"
          variant={featured ? 'secondary' : 'outline'}
          onClick={onStart}
          disabled={total === 0}
          className="shrink-0"
        >
          Mulai latihan
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <ProgressBar
          value={dijawab}
          max={total}
          tone={MATERI_TONE[materi]}
          label={`Progres ${title}`}
          className="flex-1"
        />
        <p className="shrink-0 text-[11px] font-medium whitespace-nowrap text-ink/60">
          {dijawab}/{total} dijawab
        </p>
        {baru > 0 && (
          <Badge tone={MATERI_TONE[materi]} className="shrink-0">
            {baru} baru
          </Badge>
        )}
      </div>
    </Card>
  )
}
