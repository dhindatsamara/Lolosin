import { Link } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { GuestProgressWarning } from '../components/GuestProgressWarning'
import { CheckIcon } from '../components/icons'
import {
  getMateriGroupsByMateri,
  groupReadProgress,
  materiReadProgress,
  type MateriGroup,
} from '../lib/materi'
import { MATERI_LIST, MATERI_META, type Materi } from '../lib/questions'
import { useStore } from '../lib/store'
import { cx } from '../lib/utils'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

const MATERI_CHIP: Record<Materi, string> = {
  TWK: 'bg-twk-soft text-twk',
  TIU: 'bg-tiu-soft text-tiu',
  TKP: 'bg-tkp-soft text-tkp',
}

/**
 * Motif aksen tiap subtes (aksen kecil, bukan kartu full-color):
 * TWK merah putih, TIU logika dan angka, TKP karakter dan kerja sama.
 */
const MATERI_MOTIF: Record<
  Materi,
  { pill: string; pillClass: string }
> = {
  TWK: { pill: 'Merah Putih', pillClass: 'bg-red-50 text-red-700' },
  TIU: { pill: 'Logika & Angka', pillClass: 'bg-tiu-soft text-tiu' },
  TKP: {
    pill: 'Karakter & Kerja Sama',
    pillClass: 'bg-tkp-soft text-tkp',
  },
}

/** Deskripsi singkat statis per grup materi: satu baris, tanpa angka. */
const DESKRIPSI_GRUP: Record<string, string> = {
  'twk-bang-arya':
    'Pembahasan TWK yang enak dibaca, dari dasar sampai paham.',
  'twk-cheat-sheet': 'Kartu ringkas TWK buat hafalan kilat sebelum ujian.',
  'twk-ringkasan':
    'Ringkasan lengkap TWK: Pancasila, UUD 1945, sampai sejarah nasional.',
  'tiu-verbal':
    'Analogi, silogisme, dan penalaran bahasa, plus trik eliminasi.',
  'tiu-handbook-figural':
    'Pola gambar dan bentuk, dilatih sampai mata jeli.',
  'tiu-numerik':
    'Berhitung, deret angka, dan soal cerita, plus hitung cepat.',
  'tiu-modul':
    'Ringkasan TIU dari semua kemampuan, buat pengulangan cepat.',
  'tiu-tabel-pangkat': 'Hafalan pangkat biar hitung cepatmu makin ngebut.',
  'tkp-cheat-sheet':
    'Kartu ringkas TKP: ciri soal dan petunjuk per aspek.',
  'tkp-ringkasan':
    'Ringkasan TKP per aspek, lengkap dengan contoh situasional.',
}

const DESKRIPSI_DEFAULT =
  'Materi buat persiapan SKD, baca dikit-dikit tiap hari.'

/** Status baca dalam bentuk teks, bukan angka. */
function statusBaca(percent: number): string {
  if (percent >= 100) return 'Selesai dibaca'
  if (percent > 0) return 'Lagi berjalan'
  return 'Belum mulai'
}

/** Strip aksen subtes: TWK merah putih, TIU biru, TKP ungu. */
function MotifStrip({ materi }: { materi: Materi }) {
  if (materi === 'TWK') {
    return (
      <span
        className="flex h-3.5 w-12 flex-col overflow-hidden rounded-full border border-line"
        aria-hidden="true"
      >
        <span className="h-1/2 bg-red-600" />
        <span className="h-1/2 bg-white" />
      </span>
    )
  }
  return (
    <span
      className={cx(
        'block h-1.5 w-12 rounded-full',
        materi === 'TIU' ? 'bg-tiu' : 'bg-tkp',
      )}
      aria-hidden="true"
    />
  )
}

/**
 * Kartu satu grup materi: nama + satu baris deskripsi + bar progres
 * visual tanpa angka. Kartu satu tujuan (single-destination): satu
 * Link membungkus satu <article>, tanpa tombol atau tautan lain di
 * dalamnya.
 */
function GroupCard({
  group,
  readSections,
}: {
  group: MateriGroup
  readSections: string[]
}) {
  const progress = groupReadProgress(group, readSections)
  const selesai = progress.percent === 100
  const deskripsi = DESKRIPSI_GRUP[group.id] ?? DESKRIPSI_DEFAULT

  return (
    <Link to={`/belajar/${group.id}`} className="block h-full">
      <article className="card-lift reveal flex h-full flex-col rounded-2xl border border-line bg-white p-4 shadow-soft lg:p-5">
        <div className="flex items-start justify-between gap-3">
          <span
            className={cx(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-xs font-extrabold',
              MATERI_CHIP[group.materi],
            )}
            aria-hidden="true"
          >
            {group.materi}
          </span>
          {selesai ? (
            <Badge tone="green">
              <CheckIcon width={12} height={12} className="mr-1" />
              Selesai
            </Badge>
          ) : (
            <span className="mt-1 shrink-0 text-xs font-bold text-ink/50">
              {progress.read > 0 ? 'Lanjut baca' : 'Mulai baca'}
            </span>
          )}
        </div>
        <h3 className="mt-3 font-display font-extrabold leading-snug">
          {group.judul}
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          {deskripsi}
        </p>
        <div className="mt-auto pt-4">
          <ProgressBar
            value={progress.read}
            max={progress.total}
            tone={MATERI_TONE[group.materi]}
            label={`Progres baca ${group.judul}`}
          />
        </div>
      </article>
    </Link>
  )
}

export function BelajarPage() {
  const { readSections } = useStore()

  return (
    <div className="flex flex-col gap-6">
      <GuestProgressWarning />

      <header>
        <p className="kicker">baca dikit-dikit, lama-lama lolos</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Belajar</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          Materi SKD yang sudah dirapikan per topik. Tiap bagian yang
          selesai dibaca dapat 5 XP.
        </p>
      </header>

      {MATERI_LIST.map((materi) => {
        const groups = getMateriGroupsByMateri(materi)
        const progress = materiReadProgress(materi, readSections)
        const motif = MATERI_MOTIF[materi]
        return (
          <section key={materi} aria-label={MATERI_META[materi].nama}>
            <Card className="reveal mb-3">
              <MotifStrip materi={materi} />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="font-display text-xl font-extrabold">
                  {materi}
                </span>
                <Badge tone={MATERI_TONE[materi]}>
                  {MATERI_META[materi].nama}
                </Badge>
                <span
                  className={cx(
                    'rounded-full px-2.5 py-0.5 text-xs font-extrabold',
                    motif.pillClass,
                  )}
                >
                  {motif.pill}
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/60">
                {MATERI_META[materi].deskripsi}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <ProgressBar
                  value={progress.read}
                  max={progress.total}
                  tone={MATERI_TONE[materi]}
                  label={`Progres baca ${materi}`}
                  className="flex-1"
                />
                <span className="shrink-0 text-xs font-extrabold text-ink/60">
                  {statusBaca(progress.percent)}
                </span>
              </div>
            </Card>
            <div className="grid gap-3 lg:grid-cols-2">
              {groups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  readSections={readSections}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
