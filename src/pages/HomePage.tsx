import { Link } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ProgressRing } from '../components/belajar/ProgressRing'
import { BadgeShowcase } from '../components/gamifikasi/BadgeShowcase'
import { DailyMissions } from '../components/gamifikasi/DailyMissions'
import { WeekStreak } from '../components/gamifikasi/WeekStreak'
import { Mascot } from '../components/Mascot'
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
import { getRankTitle } from '../lib/ranks'
import { cx } from '../lib/utils'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

const MATERI_CARD = {
  TWK: 'border-ink bg-twk text-white',
  TIU: 'border-ink bg-tiu text-white',
  TKP: 'border-ink bg-tkp text-white',
} as const

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
  const rankTitle = getRankTitle(level)
  const progress = xpProgress(xp)
  const seenByMateri = countSeenByMateri(seenQuestionIds)
  const totalSoalDilihat =
    seenByMateri.TWK + seenByMateri.TIU + seenByMateri.TKP
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
      {/* Hero hijau tua bertekstur grid: sapaan + XP/streak + angka kunci */}
      <section className="bg-grid-dark rounded-3xl border-2 border-ink bg-primary-800 p-5 text-white shadow-sticker-lg">
        <p className="font-script text-2xl leading-none text-accent-300">
          semangat belajarnya!
        </p>
        <p className="mt-1 text-sm font-medium text-primary-100">
          {tanggalHariIni()}
        </p>
        <h1 className="mt-1 font-display text-3xl leading-tight font-extrabold">
          {sapaan()}! Siap lolos CPNS?
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-primary-100">
          {TOTAL_QUIZABLE.toLocaleString('id-ID')} soal latihan,{' '}
          {TOTAL_SECTIONS} seksi materi, dan tryout mini. Semuanya bisa
          dipakai offline.
        </p>

        {/* Pill XP/level + streak */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-accent-400 px-3 py-1.5 text-sm font-extrabold whitespace-nowrap text-ink shadow-sticker-sm">
            <ZapIcon width={16} height={16} />
            {xp.toLocaleString('id-ID')} XP · Level {level}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-white px-3 py-1.5 text-sm font-extrabold whitespace-nowrap text-ink shadow-sticker-sm">
            <FlameIcon width={16} height={16} className="text-twk" />
            Streak harian · {streak} hari
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-primary-100 px-3 py-1.5 text-sm font-extrabold whitespace-nowrap text-primary-800 shadow-sticker-sm">
            <span aria-hidden="true">🏅</span>
            {rankTitle}
          </span>
        </div>

        {/* Progres menuju level berikutnya + status streak */}
        <div className="mt-4">
          <ProgressBar
            value={progress.current}
            max={progress.needed}
            tone="amber"
            label="Menuju level berikutnya"
            className="bg-white/25"
          />
          <p className="mt-1.5 text-xs font-medium text-primary-100">
            {progress.needed - progress.current} XP lagi ke Level {level + 1}
          </p>
          <p className="mt-1 flex items-start gap-1 text-xs leading-snug font-medium text-primary-100">
            {streakAmanHariIni ? (
              <>
                <CheckIcon width={13} height={13} className="mt-px shrink-0 text-accent-300" />
                Streak aman, kamu sudah belajar hari ini.
              </>
            ) : (
              'Yuk belajar hari ini biar streak-mu tetap nyala.'
            )}
          </p>
        </div>

        {/* Strip angka spesifik */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border-2 border-white/25 bg-white/10 p-3 text-center">
            <p className="font-display text-xl leading-none font-extrabold">
              <span className="hl-marker">110</span>
            </p>
            <p className="mt-1 text-[11px] leading-tight font-semibold text-primary-100">
              soal SKD asli
            </p>
          </div>
          <div className="rounded-2xl border-2 border-white/25 bg-white/10 p-3 text-center">
            <p className="font-display text-xl leading-none font-extrabold">
              {bacaKeseluruhan.percent}%
            </p>
            <p className="mt-1 text-[11px] leading-tight font-semibold text-primary-100">
              materi dibaca
            </p>
          </div>
          <div className="rounded-2xl border-2 border-white/25 bg-white/10 p-3 text-center">
            <p className="font-display text-xl leading-none font-extrabold">
              {totalSoalDilihat.toLocaleString('id-ID')}
            </p>
            <p className="mt-1 text-[11px] leading-tight font-semibold text-primary-100">
              soal sudah dilihat
            </p>
          </div>
        </div>
        <p className="mt-3 border-t-2 border-dashed border-white/25 pt-3 text-xs leading-relaxed font-semibold text-primary-100">
          Passing grade mini:{' '}
          <span className="text-white">
            TWK ≥{TRYOUT_PASSING_MINI.TWK} · TIU ≥{TRYOUT_PASSING_MINI.TIU} ·
            TKP ≥{TRYOUT_PASSING_MINI.TKP}
          </span>
        </p>
      </section>

      {/* Streak mingguan + misi harian */}
      <WeekStreak />
      <DailyMissions />

      {/* Lanjutkan belajar: kartu amber kontras tinggi (teks gelap) */}
      <Card className="border-ink bg-accent-400 p-5 text-ink">
        <div className="flex items-center gap-4">
          <ProgressRing
            value={bacaKeseluruhan.read}
            max={bacaKeseluruhan.total}
            size={72}
            tone="primary"
            label={`${bacaKeseluruhan.percent}%`}
            trackClassName="stroke-ink/15"
            className="text-ink"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink/70">
              Progres bacamu
            </p>
            <p className="mt-0.5 font-display text-lg leading-snug font-extrabold">
              {bacaKeseluruhan.read} dari {bacaKeseluruhan.total} seksi sudah
              dibaca
            </p>
            {lanjutBelajar ? (
              <p className="mt-1 truncate text-sm font-medium text-ink/80">
                Berikutnya: {lanjutBelajar.section.judul}
              </p>
            ) : (
              <p className="mt-1 text-sm font-medium text-ink/80">
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
            <Button fullWidth>
              Lanjutkan membaca
              <ChevronRightIcon width={16} height={16} />
            </Button>
          </Link>
        )}
      </Card>

      {/* Aksi cepat */}
      <section>
        <h2 className="mb-3 font-display text-xl font-extrabold">
          Mau ngapain hari ini?
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {AKSI_CEPAT.map(({ to, label, deskripsi, icon: Icon, tone }) => (
            <Link key={to} to={to}>
              <Card className="flex h-full flex-col items-center gap-1.5 py-4 text-center transition-transform hover:-translate-y-0.5">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl border-2 border-ink ${tone}`}
                >
                  <Icon width={20} height={20} />
                </span>
                <span className="font-display text-sm font-extrabold">{label}</span>
                <span className="text-[11px] leading-tight font-medium text-ink/60">
                  {deskripsi}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Progres per materi: kartu berwarna penuh per subtes */}
      <section>
        <h2 className="mb-3 font-display text-xl font-extrabold">
          Progres per materi
        </h2>
        <div className="flex flex-col gap-3">
          {MATERI_LIST.map((materi) => {
            const totalSoal = countTotalByMateri(materi)
            const seen = seenByMateri[materi]
            const baca = materiReadProgress(materi, readSections)
            return (
              <Link key={materi} to="/belajar">
                <Card
                  className={cx(
                    'transition-transform hover:-translate-y-0.5',
                    MATERI_CARD[materi],
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-lg font-extrabold">
                        {materi}
                      </span>
                      <Badge tone={MATERI_TONE[materi]}>
                        {MATERI_META[materi].nama}
                      </Badge>
                    </div>
                    <ChevronRightIcon
                      width={20}
                      height={20}
                      className="shrink-0 text-white/70"
                    />
                  </div>
                  <div className="mt-3 space-y-2.5">
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-semibold text-white/80">
                          Materi dibaca
                        </span>
                        <span className="font-extrabold">
                          {baca.read}/{baca.total} seksi · {baca.percent}%
                        </span>
                      </div>
                      <ProgressBar
                        value={baca.read}
                        max={baca.total}
                        tone="amber"
                        label={`Progres baca ${materi}`}
                        className="bg-white/25"
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-semibold text-white/80">
                          Soal dilihat
                        </span>
                        <span className="font-extrabold">
                          {seen}/{totalSoal} soal ·{' '}
                          {totalSoal - seen} soal baru tersisa
                        </span>
                      </div>
                      <ProgressBar
                        value={seen}
                        max={totalSoal}
                        tone="amber"
                        label={`Progres soal ${materi}`}
                        className="bg-white/25"
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
        <h2 className="mb-3 font-display text-xl font-extrabold">
          Tryout terakhir
        </h2>
        {tryoutTerakhir ? (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-extrabold">
                  {(tryoutTerakhir.twk + tryoutTerakhir.tiu + tryoutTerakhir.tkp).toLocaleString('id-ID')}
                  <span className="text-sm font-semibold text-ink/60">
                    {' '}
                    / {TRYOUT_MAX_PER_SECTION * 3}
                  </span>
                </p>
                <p className="text-xs font-medium text-ink/60">
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
                      <span className="font-semibold text-ink/70">
                        {materi}
                        {benar !== undefined &&
                          ` · ${benar}/${TRYOUT_QUESTIONS_PER_SECTION} benar`}
                      </span>
                      <span className="font-extrabold">
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
            <Mascot mood="semangat" size={72} className="mx-auto" />
            <p className="mt-2 font-display text-lg font-extrabold">
              Kamu belum pernah tryout nih
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink/60">
              Coba tryout mini dulu yuk: 30 soal (10 TWK, 10 TIU, 10
              TKP) dalam 27 menit, lengkap dengan skor dan prediksi kelolosanmu.
            </p>
            <Link to="/tryout" className="mt-4 inline-block">
              <Button>Mulai tryout mini</Button>
            </Link>
          </Card>
        )}
      </section>

      {/* Lencana pencapaian */}
      <BadgeShowcase />
    </div>
  )
}
