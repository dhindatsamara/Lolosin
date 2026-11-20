import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { BadgeShowcase } from '../components/gamifikasi/BadgeShowcase'
import { DailyMissions } from '../components/gamifikasi/DailyMissions'
import { WeekStreak } from '../components/gamifikasi/WeekStreak'
import { Mascot } from '../components/Mascot'
import { InteractiveMascot } from '../components/InteractiveMascot'
import { PetCard } from '../components/PetCard'
import { PredictionPanel } from '../components/PredictionPanel'
import { LandingPage } from './LandingPage'
import {
  BookIcon,
  BriefcaseIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  FlameIcon,
  GamepadIcon,
  TargetIcon,
  TrophyIcon,
  ZapIcon,
} from '../components/icons'
import { materiReadProgress } from '../lib/materi'
import {
  countSeenByMateri,
  countTotalByMateri,
  MATERI_LIST,
  MATERI_META,
} from '../lib/questions'
import {
  DRILL_DEFAULT_COUNT,
  ORIGINAL_MAX,
  ORIGINAL_PASSING,
  SIMULASI_QUESTIONS_PER_SECTION,
  SIMULASI_TOTAL_QUESTIONS,
  TRYOUT_MAX_PER_SECTION,
  TRYOUT_PASSING_MINI,
  TRYOUT_QUESTIONS_PER_SECTION,
  TRYOUT_TOTAL_QUESTIONS,
} from '../lib/quiz'
import { todayFocus } from '../lib/plan'
import { REVIEW_SESSION_MAX, reviewCountDue } from '../lib/review'
import {
  armRevive,
  getLevel,
  MAKASSAR_TIME_ZONE,
  todayMakassar,
  useStore,
  xpProgress,
  type TryoutRecord,
} from '../lib/store'
import { getRankTitle } from '../lib/ranks'
import { MASCOT_NAME } from '../lib/mascot'
import { useAuthUser } from '../lib/auth'
import { resolveAvatarVariant, useProfileAvatar } from '../lib/profile'
import { isSupabaseConfigured } from '../lib/supabase'
import { cx } from '../lib/utils'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

const MATERI_AKSEN = {
  TWK: 'bg-twk',
  TIU: 'bg-tiu',
  TKP: 'bg-tkp',
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

/**
 * Pintasan beranda (v2.4): 4 tile navigasi ringkas ke menu yang sudah
 * ada. Tiap tile hanya ikon + judul + satu baris pendek + panah, tanpa
 * konten di dalamnya. Menggantikan kartu teaser besar (game, formasi,
 * peringkat) dan bagian "Mau ngapain hari ini?" supaya beranda tidak
 * lagi terasa penuh. Tile Formasi tetap membawa label BETA karena
 * datanya masih contoh (lihat halaman Formasi).
 */
const NAV_TILES = [
  {
    to: '/main',
    label: 'Main',
    deskripsi: 'Battle, sesi, kuis kilat',
    icon: GamepadIcon,
    tone: 'bg-primary-100 text-primary-700',
    beta: false,
    // Sorot (v2.6): game adalah daya jual utama app, jadi tile Main
    // dibuat paling menonjol di antara tile pintasan (badge "Seru!"
    // + aksen hijau lembut, tanpa kartu warna penuh).
    sorot: true,
  },
  {
    to: '/formasi',
    label: 'Formasi',
    deskripsi: 'Cari jabatan CPNS 2026',
    icon: BriefcaseIcon,
    tone: 'bg-tiu-soft text-tiu',
    beta: true,
    sorot: false,
  },
  {
    to: '/latihan',
    label: 'Latihan',
    deskripsi: 'Drill per topik',
    icon: TargetIcon,
    tone: 'bg-accent-100 text-accent-700',
    beta: false,
    sorot: false,
  },
  {
    to: '/tryout',
    label: 'Tryout',
    deskripsi: 'Kilat dan Tryout Akbar',
    icon: TrophyIcon,
    tone: 'bg-tkp-soft text-tkp',
    beta: false,
    sorot: false,
  },
] as const

/**
 * Kartu tryout terakhir, mode-aware. Tryout Akbar: total /550, label
 * "Tryout Akbar 110 soal", passing grade asli, penyebut benar 30/35/45,
 * dan ProgressBar maks 150/175/225. Tryout mini / riwayat lama: seperti
 * sebelumnya (total /150, passing grade mini, penyebut 10, maks 50).
 */
function TryoutTerakhirCard({ record }: { record: TryoutRecord }) {
  const isFull = record.mode === 'full'
  const total = record.twk + record.tiu + record.tkp
  const maxTotal = isFull
    ? ORIGINAL_MAX.TWK + ORIGINAL_MAX.TIU + ORIGINAL_MAX.TKP
    : TRYOUT_MAX_PER_SECTION * 3
  // flex-1 + flex-col: kartu mengisi tinggi bagian supaya tepi bawahnya
  // sejajar dengan kartu Perkiraan di sebelahnya (poin 1, v2.5).
  // Tombol didorong ke bawah (mt-auto) biar tidak mengambang.
  return (
    <Card className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-lg font-extrabold">
            {total.toLocaleString('id-ID')}
            <span className="text-sm font-semibold text-ink/60">
              {' '}
              / {maxTotal}
            </span>
          </p>
          <p className="text-xs font-medium text-ink/60">
            {formatTanggalTryout(record.date)} ·{' '}
            {isFull
              ? `Tryout Akbar ${SIMULASI_TOTAL_QUESTIONS} soal`
              : `Tryout kilat ${TRYOUT_TOTAL_QUESTIONS} soal`}
          </p>
        </div>
        <Badge tone={record.passed ? 'green' : 'neutral'}>
          {record.passed ? 'Lulus' : 'Belum lulus'}
        </Badge>
      </div>
      <div className="mt-4 space-y-2.5">
        {MATERI_LIST.map((materi) => {
          const skor =
            materi === 'TWK'
              ? record.twk
              : materi === 'TIU'
                ? record.tiu
                : record.tkp
          const passing = isFull
            ? ORIGINAL_PASSING[materi]
            : TRYOUT_PASSING_MINI[materi]
          const max = isFull ? ORIGINAL_MAX[materi] : TRYOUT_MAX_PER_SECTION
          const benarMax = isFull
            ? SIMULASI_QUESTIONS_PER_SECTION[materi]
            : TRYOUT_QUESTIONS_PER_SECTION
          const lulus = skor >= passing
          const benar = record.correct?.[materi]
          return (
            <div key={materi}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold text-ink/70">
                  {materi}
                  {benar !== undefined && ` · ${benar}/${benarMax} benar`}
                </span>
                <span className="font-extrabold">
                  {skor}/{max}
                  {lulus ? ' · Lulus' : ` · PG ${passing}`}
                </span>
              </div>
              <ProgressBar
                value={skor}
                max={max}
                tone={MATERI_TONE[materi]}
                label={`Skor ${materi} tryout terakhir`}
              />
            </div>
          )
        })}
      </div>
      <Link to="/tryout" className="mt-auto block pt-4">
        <Button variant="outline" fullWidth>
          Coba tryout lagi
        </Button>
      </Link>
    </Card>
  )
}

/**
 * Kartu "Bujuk Osi": tampil saat streak putus dan masih bisa dibujuk
 * kembali (mekanik "Bujuk Osi", v2.2.1). Sebelum dibujuk: jelaskan
 * streak yang putus dan tawarkan tombol Bujuk Osi (persenjatai revive
 * lalu arahkan ke Latihan; user juga boleh baca materi, flag armed
 * berlaku untuk keduanya). Sesudah dibujuk: ingatkan tinggal
 * selesaikan 1 drill atau baca 1 bagian materi. Sembunyi bila tidak
 * ada streak putus yang pending.
 */
function BujukOsiCard() {
  const { streakBroken, reviveArmed } = useStore()
  const navigate = useNavigate()

  if (!streakBroken) return null
  const lostStreak = streakBroken.lostStreak

  function handleBujuk() {
    if (armRevive()) navigate('/latihan')
  }

  return (
    <Card className="border-accent-200 bg-accent-50 p-5 lg:p-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-5">
        <Mascot
          mood="marah"
          size={88}
          className="h-auto w-20 shrink-0 sm:w-24"
        />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 className="font-display text-xl font-extrabold">
            Bujuk {MASCOT_NAME}
          </h2>
          {reviveArmed ? (
            <>
              <p className="mt-1 text-sm leading-relaxed font-medium text-ink/70">
                {MASCOT_NAME} udah dibujuk. Tinggal selesaikan 1 drill atau
                baca 1 bagian materi, streak {lostStreak} hari balik lagi.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                <Button size="sm" onClick={() => navigate('/latihan')}>
                  Mulai drill
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate('/belajar')}
                >
                  Baca materi
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm leading-relaxed font-medium text-ink/70">
                Streak {lostStreak} hari putus karena kemarin kamu nggak
                belajar, dan {MASCOT_NAME} lagi ngambek. Ketuk tombol di
                bawah, lalu selesaikan 1 drill atau baca 1 bagian materi
                buat balikin streak ke {lostStreak} hari. Kesempatan ini
                cuma ada sekali tiap streak putus. Kalau belajar biasa
                tanpa membujuk, streak mulai lagi dari 1.
              </p>
              <Button size="sm" className="mt-3" onClick={handleBujuk}>
                Bujuk {MASCOT_NAME}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

function DashboardPage() {
  const {
    xp,
    streak,
    lastActivityDate,
    streakBroken,
    seenQuestionIds,
    readSections,
    tryoutHistory,
    reviewQueue,
    topicStats,
  } = useStore()
  const navigate = useNavigate()
  // reviewCountDue dan todayFocus membaca store langsung, jadi
  // dihitung ulang hanya saat antrean atau tally berubah.
  const jumlahUlas = useMemo(() => reviewCountDue(), [reviewQueue])
  const fokus = useMemo(() => todayFocus(), [topicStats])
  const terlemah = fokus.weakest
  const belumDicoba = fokus.untried[0]
  const level = getLevel(xp)
  const rankTitle = getRankTitle(level)
  const progress = xpProgress(xp)
  const seenByMateri = countSeenByMateri(seenQuestionIds)
  const streakAmanHariIni = lastActivityDate === todayMakassar()
  const tryoutTerakhir = tryoutHistory[tryoutHistory.length - 1]
  // Streak putus yang masih bisa dibujuk kembali: Osi ngambek di hero
  // dan kartu Bujuk Osi tampil di bawah hero.
  const streakPutus = streakBroken !== null
  const lostStreak = streakBroken?.lostStreak ?? 0

  // Avatar Osi yang dipilih di Profil (v2.3.4): Osi di hero memakai
  // varian yang sama, supaya tampilannya konsisten dengan avatar akun.
  // Foto profil yang diunggah TIDAK dipakai di sini, foto hanya untuk
  // foto profil; varian avatar tetap yang dipakai. Hook ini reaktif,
  // jadi ganti varian di Profil langsung tercermin saat kembali ke
  // beranda tanpa reload. Gating streak (v2.4): varian di-resolve
  // terhadap streak saat ini, jadi varian yang terkunci karena streak
  // putus jatuh ke varian tertinggi yang masih terbuka.
  const { variantId } = useProfileAvatar()
  const avatarVariant = resolveAvatarVariant(streak, variantId)

  return (
    <div className="flex flex-col gap-5 lg:gap-8">
      {/* Hero hijau (v2.5, poin 7): panel hijau solid seperti hero
          landing logged-out (bg-primary-800, teks putih), bukan lagi
          kartu putih polos. Isinya tetap: sapaan besar + XP/streak +
          progres level, ditemani maskot. */}
      <section className="flex flex-col gap-6 overflow-hidden rounded-3xl bg-primary-800 p-6 text-white shadow-soft-lg lg:flex-row lg:items-start lg:justify-between lg:p-10">
        <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary-200">
          {tanggalHariIni()}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] font-extrabold lg:text-5xl">
          {sapaan()}! Siap lolos CPNS?
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-primary-100 lg:text-lg">
          Materi, latihan, dan tryoutmu udah siap. Lanjutin dari tempatmu
          berhenti.
        </p>

        {/* Pill XP/level + streak + gelar */}
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-100 px-3 py-1.5 text-sm font-extrabold whitespace-nowrap text-accent-800">
            <ZapIcon width={16} height={16} />
            {xp.toLocaleString('id-ID')} XP · Level {level}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-twk-soft px-3 py-1.5 text-sm font-extrabold whitespace-nowrap text-twk">
            <FlameIcon width={16} height={16} />
            Streak harian · {streak} hari
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-3 py-1.5 text-sm font-extrabold whitespace-nowrap text-primary-800">
            <span aria-hidden="true">🏅</span>
            {rankTitle}
          </span>
        </div>

        {/* Progres menuju level berikutnya + status streak */}
        <div className="mt-6 max-w-xl">
          <ProgressBar
            value={progress.current}
            max={progress.needed}
            tone="amber"
            label="Menuju level berikutnya"
            className="bg-white/20"
          />
          <p className="mt-1.5 text-sm font-medium text-primary-200">
            {progress.needed - progress.current} XP lagi ke Level {level + 1}
          </p>
          <p className="mt-1 flex items-start gap-1 text-sm leading-snug font-medium text-primary-200">
            {streakAmanHariIni ? (
              <>
                <CheckIcon width={14} height={14} className="mt-0.5 shrink-0 text-accent-300" />
                Streak aman, kamu sudah belajar hari ini.
              </>
            ) : streakPutus ? (
              `Streak-mu putus. Bujuk ${MASCOT_NAME} di bawah biar balik lagi.`
            ) : (
              'Yuk belajar hari ini biar streak-mu tetap nyala.'
            )}
          </p>
        </div>

        <p className="mt-6 border-t border-dashed border-white/20 pt-4 text-sm leading-relaxed font-semibold text-primary-200">
          Passing grade mini:{' '}
          <span className="text-white">
            TWK ≥{TRYOUT_PASSING_MINI.TWK} · TIU ≥{TRYOUT_PASSING_MINI.TIU} ·
            TKP ≥{TRYOUT_PASSING_MINI.TKP}
          </span>
        </p>
        </div>

        {/* Osi, teman belajarmu: bisa ditekan, balon ucapannya berganti.
            Kalimat pertama kontekstual (streak hari ini), sisanya
            penyemangat yang berputar. Tampilannya mengikuti varian
            avatar yang dipilih di Profil (v2.3.4): mood, outfit, topi,
            dan headphone dari varian itu. Saat streak putus, Osi
            ngambek (mood marah + kalimat sewot-lucu): mood marah tetap
            menang atas mood varian, tapi outfit varian tetap dipakai.
            Key memaksa remount saat status putus atau varian berubah,
            karena InteractiveMascot menyimpan mood dasar di state
            internalnya. */}
        {/* Panggung maskot: blob lembut seperti hero landing, supaya
            Osi tidak mengambang di atas hijau polos. */}
        <div className="relative shrink-0 lg:w-52">
          <div
            className="blob-soft absolute inset-x-2 top-6 bottom-2 bg-primary-700/70"
            aria-hidden="true"
          />
          <div
            className="blob-soft absolute inset-x-8 top-2 bottom-8 bg-accent-400/25"
            aria-hidden="true"
          />
        <InteractiveMascot
          key={streakPutus ? 'marah' : `normal-${variantId}`}
          baseMood={streakPutus ? 'marah' : avatarVariant.mood}
          outfit={avatarVariant.outfit}
          showCap={avatarVariant.showCap}
          headphones={avatarVariant.headphones}
          size={160}
          phrases={
            streakPutus
              ? [
                  'Hmph! Kemarin kamu nggak belajar.',
                  `Streak ${lostStreak} hari putus, aku ngambek nih.`,
                  'Bujuk aku dulu, baru streak-mu balik.',
                  'Satu drill aja, aku maafin kok.',
                ]
              : [
                  streakAmanHariIni
                    ? 'Streak aman! Kamu keren.'
                    : 'Aku nemenin kamu belajar hari ini!',
                  'Kamu bisa, gas terus!',
                  'Satu soal lagi, satu langkah ke NIP.',
                  'Streak-mu keren, jangan sampai padam ya.',
                  'Aku bangga sama progresmu!',
                  'Belajar bentar tiap hari, hasilnya besar.',
                ]
          }
          mascotClassName="float-soft h-auto w-32 lg:w-40"
          className="relative shrink-0 lg:w-52"
        />
        </div>
      </section>

      {/* Bujuk Osi: tampil hanya saat streak putus dan masih bisa dibujuk */}
      <BujukOsiCard />

      {/* Streak mingguan + peliharaan (kolom kiri) dan misi harian
          (kolom kanan). Dipadatkan (v2.6): forced equal-height dari
          v2.4 dilepas (grid items-start, tanpa flex-1 di PetCard dan
          daftar misi) supaya section tidak meregang dan jelas lebih
          pendek; tepi bawah kedua kolom boleh tidak sejajar. */}
      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-5">
        <div className="flex flex-col gap-4 lg:gap-5">
          <WeekStreak />
          <PetCard />
        </div>
        <DailyMissions />
      </div>

      {/* Pintasan: 4 tile navigasi ringkas ke menu yang sudah ada.
          Menggantikan kartu teaser besar dan bagian "Mau ngapain hari
          ini?" (v2.4). */}
      <nav
        aria-label="Pintasan"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4"
      >
        {NAV_TILES.map(
          ({ to, label, deskripsi, icon: Icon, tone, beta, sorot }) => (
            <Link key={to} to={to}>
              {/* Vertikal di mobile (tile 2 kolom sempit: judul + badge
                  BETA tidak muat sebaris dengan ikon), horizontal mulai
                  sm. Baris judul boleh membungkus supaya badge tidak
                  pernah meluber keluar tile. Tile yang disorot (Main)
                  memakai border hijau + latar hijau sangat muda,
                  tanpa kartu warna penuh (aturan Lapang). */}
              <Card
                className={cx(
                  'flex h-full flex-col gap-2 p-3.5 transition-transform hover:-translate-y-0.5 sm:flex-row sm:items-center sm:gap-3 sm:p-4',
                  sorot && 'border-primary-300 bg-primary-50/60',
                )}
              >
                <span
                  className={cx(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11',
                    tone,
                  )}
                >
                  <Icon width={22} height={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 font-display text-base font-extrabold">
                    {label}
                    {beta && <Badge tone="amber">BETA</Badge>}
                    {sorot && <Badge tone="green">Seru!</Badge>}
                  </span>
                  <span className="block truncate text-xs leading-snug font-medium text-ink/60">
                    {deskripsi}
                  </span>
                </span>
                <ChevronRightIcon
                  width={18}
                  height={18}
                  className="hidden shrink-0 text-ink/40 sm:block"
                />
              </Card>
            </Link>
          ),
        )}
      </nav>

      {/* Ajakan main game (v2.6): satu baris singkat di bawah tile
          pintasan, karena game adalah daya jual utama app. */}
      <p className="-mt-2 text-center text-sm font-medium text-ink/60 lg:-mt-5">
        Bosen baca materi?{' '}
        <Link
          to="/main"
          className="font-bold text-primary-700 underline decoration-primary-300 underline-offset-2 hover:text-primary-800"
        >
          Main game dulu
        </Link>
        , XP-nya tetap jalan.
      </p>

      {/* Fokus hari ini: subtopik terlemah + aksi drill dan saran baca */}
      <section aria-label="Fokus hari ini">
        <div className="mb-3">
          <p className="kicker">Rencana belajarmu</p>
          <h2 className="mt-1 font-display text-xl font-extrabold">
            Fokus hari ini
          </h2>
        </div>
        <Card className="p-5">
          {terlemah ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={MATERI_TONE[terlemah.materi]}>
                  {terlemah.materi}
                </Badge>
                <span className="text-sm font-semibold text-ink/70">
                  {MATERI_META[terlemah.materi].nama}
                </span>
              </div>
              <p className="mt-2 font-display text-lg leading-snug font-extrabold">
                {terlemah.subtopik}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed font-medium text-ink/70">
                {terlemah.correct} benar dari {terlemah.total} soal (
                {Math.round(terlemah.accuracy * 100)}%). Topik ini yang
                paling sering bikin kamu salah, gas kejar yuk.
              </p>
              <ProgressBar
                value={terlemah.correct}
                max={terlemah.total}
                tone={MATERI_TONE[terlemah.materi]}
                label={`Akurasi ${terlemah.subtopik}`}
                className="mt-2"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    navigate('/latihan/jalan', {
                      state: {
                        materi: terlemah.materi,
                        subtopik: terlemah.subtopik,
                      },
                    })
                  }
                >
                  <TargetIcon width={16} height={16} />
                  Drill {DRILL_DEFAULT_COUNT} soal topik ini
                </Button>
                <Link to="/belajar">
                  <Button size="sm" variant="outline">
                    <BookIcon width={16} height={16} />
                    Baca materi {terlemah.materi}
                  </Button>
                </Link>
              </div>
              {belumDicoba && (
                <p className="mt-3 border-t border-dashed border-line pt-3 text-xs leading-relaxed font-medium text-ink/60">
                  Belum dicoba: {belumDicoba.materi}{' '}
                  {belumDicoba.subtopik} ({belumDicoba.questionCount}{' '}
                  soal). Siapa tahu jadi andalanmu berikutnya.
                </p>
              )}
            </>
          ) : (
            <div className="text-center">
              <Mascot mood="semangat" size={64} className="mx-auto" />
              <p className="mt-1 text-xs font-extrabold text-ink/50">
                {MASCOT_NAME}
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed font-medium text-ink/70">
                Ikut drill atau tryout kilat dulu, nanti aku susun fokus
                belajarmu.
              </p>
              <Link to="/latihan" className="mt-3 inline-block">
                <Button size="sm">
                  Mulai latihan
                  <ChevronRightIcon width={16} height={16} />
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </section>

      {/* Progres per materi: kartu putih dengan aksen warna subtes */}
      <section>
        <p className="kicker">Perkembanganmu</p>
        <h2 className="mt-1 mb-3 font-display text-xl font-extrabold">
          Progres per materi
        </h2>
        <div className="grid gap-3 lg:grid-cols-3 lg:gap-4">
          {MATERI_LIST.map((materi) => {
            const totalSoal = countTotalByMateri(materi)
            const seen = seenByMateri[materi]
            const baca = materiReadProgress(materi, readSections)
            return (
              <Link key={materi} to="/belajar">
                <Card className="h-full transition-transform hover:-translate-y-0.5">
                  <span
                    className={`mb-3 block h-1.5 w-12 rounded-full ${MATERI_AKSEN[materi]}`}
                  />
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
                      className="shrink-0 text-ink/40"
                    />
                  </div>
                  <div className="mt-3 space-y-2.5">
                    <div>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-semibold text-ink/70">
                          Materi dibaca
                        </span>
                        <span className="font-extrabold">
                          {baca.read}/{baca.total} bagian · {baca.percent}%
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
                        <span className="font-semibold text-ink/70">
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

      {/* Ulas soal salah: soal yang jatuh tempo hari ini */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
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
            <h2 className="font-display text-lg font-extrabold">
              Ulas soal salah
            </h2>
            {jumlahUlas > 0 ? (
              <>
                <p className="mt-0.5 text-sm leading-relaxed font-medium text-ink/70">
                  Soal yang perlu diulas hari ini:{' '}
                  <span className="font-extrabold text-ink">
                    {jumlahUlas} soal
                  </span>
                </p>
                <p className="mt-0.5 text-xs leading-relaxed font-medium text-ink/60">
                  Soal yang pernah salah dijawab, muncul lagi biar makin
                  nempel. Satu sesi ulas {REVIEW_SESSION_MAX} soal.
                </p>
                <Link to="/latihan/ulas" className="mt-3 inline-block">
                  <Button size="sm" variant="secondary">
                    Mulai ulas
                    <ChevronRightIcon width={16} height={16} />
                  </Button>
                </Link>
              </>
            ) : (
              <p className="mt-0.5 text-sm leading-relaxed font-medium text-ink/70">
                Belum ada yang perlu diulas, lanjutkan belajarmu.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Tryout terakhir + perkiraan kelolosan, dibuat sama tinggi
          (poin 1, v2.5): grid meregang ke baris yang sama, tiap bagian
          flex-col dan kartunya flex-1, jadi tepi bawah kedua kartu
          sejajar. Dulu kartu Perkiraan lebih pendek karena
          isinya lebih sedikit dan tidak ada yang meregangkannya.
          Di mobile tetap menumpuk 1 kolom. */}
      <div className="grid items-stretch gap-5 lg:grid-cols-2 lg:gap-6">
        <section className="flex flex-col">
          <p className="kicker">Riwayat</p>
          <h2 className="mt-1 mb-3 font-display text-xl font-extrabold">
            Tryout terakhir
          </h2>
          {tryoutTerakhir ? (
            <TryoutTerakhirCard record={tryoutTerakhir} />
          ) : (
            <Card className="flex flex-1 flex-col justify-center text-center">
              <Mascot mood="semangat" size={72} className="mx-auto" />
              <p className="mt-1 text-xs font-extrabold text-ink/50">
                {MASCOT_NAME}
              </p>
              <p className="mt-2 font-display text-lg font-extrabold">
                Kamu belum pernah tryout nih
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink/60">
                Coba tryout kilat dulu yuk: 30 soal (10 TWK, 10 TIU, 10
                TKP) dalam 27 menit, lengkap dengan skor dan prediksi kelolosanmu.
              </p>
              <Link to="/tryout" className="mt-4 inline-block">
                <Button>Mulai tryout kilat</Button>
              </Link>
            </Card>
          )}
        </section>

        {/* Perkiraan kelolosan, ringkas (empty state bila belum tryout) */}
        <PredictionPanel history={tryoutHistory} compact />
      </div>

      {/* Lencana pencapaian */}
      <BadgeShowcase />
    </div>
  )
}

/**
 * Beranda kondisional (redesign v2):
 * - Supabase terkonfigurasi + belum login: landing page marketing.
 * - Sudah login, atau Supabase belum terkonfigurasi (mode lokal):
 *   dashboard seperti biasa.
 * Selama status login masih dimuat, tampilkan placeholder singkat agar
 * tidak ada kilatan konten yang salah.
 */
export function HomePage() {
  const configured = isSupabaseConfigured()
  const { user, loading } = useAuthUser()

  if (configured && loading) {
    return (
      <div className="py-24 text-center">
        <p className="text-base font-medium text-ink/60">Memuat...</p>
      </div>
    )
  }

  if (configured && !user) {
    return <LandingPage />
  }

  return <DashboardPage />
}
