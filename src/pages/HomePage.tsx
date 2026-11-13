import { Link } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ProgressRing } from '../components/belajar/ProgressRing'
import {
  BookIcon,
  CheckIcon,
  ChevronRightIcon,
  FlameIcon,
  TargetIcon,
  TrophyIcon,
  ZapIcon,
} from '../components/icons'
import {
  getDocuments,
  getNextUnreadSection,
  materiReadProgress,
  overallReadProgress,
  TOTAL_SECTIONS,
  type MateriDoc,
  type MateriSection,
} from '../lib/materi'
import {
  countSeenByMateri,
  countTotalByMateri,
  MATERI_LIST,
  MATERI_META,
  TOTAL_QUIZABLE,
} from '../lib/questions'
import {
  TRYOUT_MAX_PER_SECTION,
  TRYOUT_PASSING_MINI,
  TRYOUT_QUESTIONS_PER_SECTION,
} from '../lib/quiz'
import {
  getLevel,
  MAKASSAR_TIME_ZONE,
  todayMakassar,
  useStore,
  xpProgress,
} from '../lib/store'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

function sapaan(): string {
  const hour = Number(
    new Intl.DateTimeFormat('id-ID', {
      timeZone: MAKASSAR_TIME_ZONE,
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  )
  if (hour < 11) return 'Selamat pagi'
  if (hour < 15) return 'Selamat siang'
  if (hour < 19) return 'Selamat sore'
  return 'Selamat malam'
}

function tanggalHariIni(): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: MAKASSAR_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

function formatTanggalTryout(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: MAKASSAR_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

const AKSI_CEPAT = [
  {
    to: '/belajar',
    label: 'Belajar',
    deskripsi: 'Baca materi SKD',
    icon: BookIcon,
    tone: 'bg-primary-100 text-primary-700',
  },
  {
    to: '/latihan',
    label: 'Latihan',
    deskripsi: 'Drill per topik',
    icon: TargetIcon,
    tone: 'bg-accent-100 text-accent-700',
  },
  {
    to: '/tryout',
    label: 'Tryout',
    deskripsi: 'Simulasi CAT 30 soal',
    icon: TrophyIcon,
    tone: 'bg-tkp-soft text-tkp',
  },
] as const

export function HomePage() {
  const { xp, streak, lastActivityDate, seenQuestionIds, readSections, tryoutHistory } =
    useStore()
  const level = getLevel(xp)
  const progress = xpProgress(xp)
  const seenByMateri = countSeenByMateri(seenQuestionIds)
  const bacaKeseluruhan = overallReadProgress(readSections)
  const streakAmanHariIni = lastActivityDate === todayMakassar()
  const tryoutTerakhir = tryoutHistory[tryoutHistory.length - 1]

  // Seksi pertama yang belum dibaca (urut katalog) untuk kartu "Lanjutkan".
  let lanjutBelajar: { doc: MateriDoc; section: MateriSection } | null = null
  for (const doc of getDocuments()) {
    const section = getNextUnreadSection(doc, readSections)
    if (section) {
      lanjutBelajar = { doc, section }
      break
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Sapaan + tanggal */}
      <header>
        <p className="text-sm font-medium text-ink/50">{tanggalHariIni()}</p>
        <h1 className="mt-0.5 text-2xl font-bold leading-snug">
          {sapaan()}! Siap lolos CPNS?
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          {TOTAL_QUIZABLE.toLocaleString('id-ID')} soal latihan,{' '}
          {TOTAL_SECTIONS} seksi materi, dan tryout mini — semuanya bisa
          dipakai offline.
        </p>
      </header>

      {/* XP + level dan streak */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-100 text-accent-700">
              <ZapIcon width={18} height={18} />
            </span>
            <p className="text-xs font-semibold text-ink/50">Level {level}</p>
          </div>
          <p className="mt-2 font-display text-2xl font-bold">
            {xp.toLocaleString('id-ID')}{' '}
            <span className="text-sm font-semibold text-ink/50">XP</span>
          </p>
          <ProgressBar
            value={progress.current}
            max={progress.needed}
            tone="amber"
            label="Progres menuju level berikutnya"
            className="mt-2"
          />
          <p className="mt-1.5 text-[11px] leading-snug text-ink/50">
            {progress.needed - progress.current} XP lagi ke Level {level + 1}
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-twk-soft text-twk">
              <FlameIcon width={18} height={18} />
            </span>
            <p className="text-xs font-semibold text-ink/50">Streak harian</p>
          </div>
          <p className="mt-2 font-display text-2xl font-bold">
            {streak}{' '}
            <span className="text-sm font-semibold text-ink/50">hari</span>
          </p>
          <p className="mt-1.5 flex items-start gap-1 text-[11px] leading-snug text-ink/50">
            {streakAmanHariIni ? (
              <>
                <CheckIcon width={13} height={13} className="mt-px shrink-0 text-primary-600" />
                Streak aman — kamu sudah belajar hari ini.
              </>
            ) : (
              'Belajar hari ini untuk menjaga streak-mu.'
            )}
          </p>
        </Card>
      </div>

      {/* Lanjutkan belajar */}
      <Card className="border-primary-800 bg-primary-600 p-5 text-white">
        <div className="flex items-center gap-4">
          <ProgressRing
            value={bacaKeseluruhan.read}
            max={bacaKeseluruhan.total}
            size={72}
            tone="amber"
            label={`${bacaKeseluruhan.percent}%`}
            trackClassName="stroke-white/20"
            className="text-white"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-primary-200">
              Progres membaca materi
            </p>
            <p className="mt-0.5 font-display text-lg font-bold leading-snug">
              {bacaKeseluruhan.read} dari {bacaKeseluruhan.total} seksi sudah
              dibaca
            </p>
            {lanjutBelajar ? (
              <p className="mt-1 truncate text-sm text-primary-100">
                Berikutnya: {lanjutBelajar.section.judul}
              </p>
            ) : (
              <p className="mt-1 text-sm text-primary-100">
                Semua materi sudah kamu baca. Luar biasa!
              </p>
            )}
          </div>
        </div>
        {lanjutBelajar && (
          <Link
            to={`/belajar/${lanjutBelajar.doc.id}/${lanjutBelajar.section.id}`}
            className="mt-4 block"
          >
            <Button variant="secondary" fullWidth>
              Lanjutkan membaca
              <ChevronRightIcon width={16} height={16} />
            </Button>
          </Link>
        )}
      </Card>

      {/* Aksi cepat */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Mau ngapain hari ini?</h2>
        <div className="grid grid-cols-3 gap-3">
          {AKSI_CEPAT.map(({ to, label, deskripsi, icon: Icon, tone }) => (
            <Link key={to} to={to}>
              <Card className="flex h-full flex-col items-center gap-1.5 py-4 text-center transition-colors hover:border-primary-300">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}
                >
                  <Icon width={20} height={20} />
                </span>
                <span className="font-display text-sm font-bold">{label}</span>
                <span className="text-[11px] leading-tight text-ink/50">
                  {deskripsi}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Progres per materi */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Progres per materi</h2>
        <div className="flex flex-col gap-3">
          {MATERI_LIST.map((materi) => {
            const totalSoal = countTotalByMateri(materi)
            const seen = seenByMateri[materi]
            const baca = materiReadProgress(materi, readSections)
            return (
              <Link key={materi} to="/belajar">
                <Card className="transition-colors hover:border-primary-300">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold">{materi}</span>
                      <Badge tone={MATERI_TONE[materi]}>
                        {MATERI_META[materi].nama}
                      </Badge>
                    </div>
                    <ChevronRightIcon
                      width={20}
                      height={20}
                      className="shrink-0 text-ink/30"
                    />
                  </div>
                  <div className="mt-3 space-y-2.5">
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-medium text-ink/60">
                          Materi dibaca
                        </span>
                        <span className="font-bold">
                          {baca.read}/{baca.total} seksi · {baca.percent}%
                        </span>
                      </div>
                      <ProgressBar
                        value={baca.read}
                        max={baca.total}
                        tone={MATERI_TONE[materi]}
                        label={`Progres baca ${materi}`}
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-medium text-ink/60">
                          Soal dilihat
                        </span>
                        <span className="font-bold">
                          {seen}/{totalSoal} soal ·{' '}
                          {totalSoal - seen} soal baru tersisa
                        </span>
                      </div>
                      <ProgressBar
                        value={seen}
                        max={totalSoal}
                        tone={MATERI_TONE[materi]}
                        label={`Progres soal ${materi}`}
                      />
                    </div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Tryout terakhir */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Tryout terakhir</h2>
        {tryoutTerakhir ? (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-bold">
                  {(tryoutTerakhir.twk + tryoutTerakhir.tiu + tryoutTerakhir.tkp).toLocaleString('id-ID')}
                  <span className="text-sm font-semibold text-ink/50">
                    {' '}
                    / {TRYOUT_MAX_PER_SECTION * 3}
                  </span>
                </p>
                <p className="text-xs text-ink/50">
                  {formatTanggalTryout(tryoutTerakhir.date)} · Tryout mini 30
                  soal
                </p>
              </div>
              <Badge tone={tryoutTerakhir.passed ? 'green' : 'neutral'}>
                {tryoutTerakhir.passed ? 'Lulus' : 'Belum lulus'}
              </Badge>
            </div>
            <div className="mt-4 space-y-2.5">
              {MATERI_LIST.map((materi) => {
                const skor =
                  materi === 'TWK'
                    ? tryoutTerakhir.twk
                    : materi === 'TIU'
                      ? tryoutTerakhir.tiu
                      : tryoutTerakhir.tkp
                const lulus = skor >= TRYOUT_PASSING_MINI[materi]
                const benar = tryoutTerakhir.correct?.[materi]
                return (
                  <div key={materi}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-ink/60">
                        {materi}
                        {benar !== undefined &&
                          ` · ${benar}/${TRYOUT_QUESTIONS_PER_SECTION} benar`}
                      </span>
                      <span className="font-bold">
                        {skor}/{TRYOUT_MAX_PER_SECTION}
                        {lulus ? ' · Lulus' : ` · PG ${TRYOUT_PASSING_MINI[materi]}`}
                      </span>
                    </div>
                    <ProgressBar
                      value={skor}
                      max={TRYOUT_MAX_PER_SECTION}
                      tone={MATERI_TONE[materi]}
                      label={`Skor ${materi} tryout terakhir`}
                    />
                  </div>
                )
              })}
            </div>
            <Link to="/tryout" className="mt-4 block">
              <Button variant="outline" fullWidth>
                Coba tryout lagi
              </Button>
            </Link>
          </Card>
        ) : (
          <Card className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-tkp-soft text-tkp">
              <TrophyIcon width={24} height={24} />
            </span>
            <p className="mt-3 font-display text-lg font-bold">
              Belum ada tryout yang diselesaikan
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink/60">
              Uji kesiapanmu dengan tryout mini: 30 soal (10 TWK, 10 TIU, 10
              TKP) dalam 27 menit, lengkap dengan skor dan prediksi kelolosan.
            </p>
            <Link to="/tryout" className="mt-4 inline-block">
              <Button>Mulai tryout mini</Button>
            </Link>
          </Card>
        )}
      </section>
    </div>
  )
}
