import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ProgressRing } from '../components/belajar/ProgressRing'
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
  CrownIcon,
  FlameIcon,
  GamepadIcon,
  RankingIcon,
  SwordsIcon,
  TargetIcon,
  TrophyIcon,
  UsersIcon,
  ZapIcon,
} from '../components/icons'
import {
  getDocuments,
  getNextUnreadSection,
  materiReadProgress,
  overallReadProgress,
  type MateriDoc,
  type MateriSection,
} from '../lib/materi'
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
import {
  fetchLeaderboard,
  getCurrentWeekStart,
  type LeaderboardEntry,
} from '../lib/leaderboard'
import { getMyProfile, useAuthUser, type Profile } from '../lib/auth'
import { getAvatarVariant, useProfileAvatar } from '../lib/profile'
import { ProfileAvatar } from '../components/ProfileAvatar'
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
    deskripsi: 'Tryout kilat & simulasi CAT',
    icon: TrophyIcon,
    tone: 'bg-tkp-soft text-tkp',
  },
] as const

/**
 * Kartu tryout terakhir, mode-aware. Simulasi CAT: total /550, label
 * "Simulasi CAT 110 soal", passing grade asli, penyebut benar 30/35/45,
 * dan ProgressBar maks 150/175/225. Tryout mini / riwayat lama: seperti
 * sebelumnya (total /150, passing grade mini, penyebut 10, maks 50).
 */
function TryoutTerakhirCard({ record }: { record: TryoutRecord }) {
  const isFull = record.mode === 'full'
  const total = record.twk + record.tiu + record.tkp
  const maxTotal = isFull
    ? ORIGINAL_MAX.TWK + ORIGINAL_MAX.TIU + ORIGINAL_MAX.TKP
    : TRYOUT_MAX_PER_SECTION * 3
  return (
    <Card>
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
              ? `Simulasi CAT ${SIMULASI_TOTAL_QUESTIONS} soal`
              : `Tryout mini ${TRYOUT_TOTAL_QUESTIONS} soal`}
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
      <Link to="/tryout" className="mt-4 block">
        <Button variant="outline" fullWidth>
          Coba tryout lagi
        </Button>
      </Link>
    </Card>
  )
}

/**
 * Teaser leaderboard mini: 3 besar minggu berjalan. Tampil hanya saat
 * login (dashboard memang hanya tampil saat login) dan hanya bila ada
 * data. Gagal fetch atau belum ada skor minggu ini: sembunyi
 * diam-diam, tanpa error dan tanpa empty state.
 */
function LeaderboardTeaser() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])

  useEffect(() => {
    let cancelled = false
    fetchLeaderboard(getCurrentWeekStart())
      .then((list) => {
        if (!cancelled) setEntries(list.slice(0, 3))
      })
      .catch(() => {
        // Gagal fetch: sembunyikan diam-diam.
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (entries.length === 0) return null

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tkp-soft text-tkp">
          <RankingIcon width={20} height={20} />
        </span>
        <h2 className="font-display text-lg font-extrabold">
          Peringkat minggu ini
        </h2>
      </div>
      <ol className="mt-4 space-y-2">
        {entries.map((entry, i) => (
          <li
            key={entry.userId}
            className={cx(
              'flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5',
              i === 0 ? 'bg-accent-50' : 'bg-paper',
            )}
          >
            <span className="flex min-w-0 items-center gap-2 text-sm font-extrabold">
              <span
                className={cx(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs',
                  i === 0
                    ? 'bg-accent-400 text-ink'
                    : 'bg-ink/5 text-ink/60',
                )}
              >
                {i === 0 ? (
                  <CrownIcon width={14} height={14} />
                ) : (
                  entry.rank
                )}
              </span>
              <span className="truncate">{entry.username}</span>
            </span>
            <span className="shrink-0 text-sm font-extrabold">
              {entry.total.toLocaleString('id-ID')}
            </span>
          </li>
        ))}
      </ol>
      <Link to="/leaderboard" className="mt-4 block">
        <Button variant="outline" fullWidth>
          Lihat semua peringkat
          <ChevronRightIcon width={16} height={16} />
        </Button>
      </Link>
    </Card>
  )
}

const GAME_ITEMS = [
  {
    icon: SwordsIcon,
    judul: 'Battle 1v1',
    deskripsi: 'Duel cepat, yang benar dan cepat yang menang.',
    tone: 'bg-twk-soft text-twk',
  },
  {
    icon: UsersIcon,
    judul: 'Sesi',
    deskripsi: 'Main bareng sampai 50 orang pakai kode.',
    tone: 'bg-tiu-soft text-tiu',
  },
  {
    icon: ZapIcon,
    judul: 'Kuis Kilat',
    deskripsi: 'Soal cepat buat pemanasan sebelum drill.',
    tone: 'bg-accent-100 text-accent-700',
  },
] as const

/** Teaser game: Battle 1v1, Sesi, dan Kuis Kilat di halaman Main. */
function GameTeaserCard() {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
          <GamepadIcon width={20} height={20} />
        </span>
        <h2 className="font-display text-lg font-extrabold">
          Main, biar nggak jenuh
        </h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink/70">
        Belajar terus-terusan bikin jenuh. Selingi dengan game, tetap
        latihan soal, tapi rasanya main.
      </p>
      <ul className="mt-4 space-y-2.5">
        {GAME_ITEMS.map(({ icon: Icon, judul, deskripsi, tone }) => (
          <li key={judul} className="flex items-start gap-3 rounded-2xl bg-paper p-3">
            <span
              className={cx(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                tone,
              )}
            >
              <Icon width={18} height={18} />
            </span>
            <span>
              <span className="block text-sm font-extrabold">{judul}</span>
              <span className="block text-xs leading-relaxed font-medium text-ink/60">
                {deskripsi}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <Link to="/main" className="mt-4 block">
        <Button fullWidth>
          Main sekarang
          <ChevronRightIcon width={16} height={16} />
        </Button>
      </Link>
    </Card>
  )
}

/**
 * Teaser formasi CPNS (v2.3): CPNS 2026 dibuka November ini. Kartu
 * mengarah ke menu browser formasi. Label BETA + "Data contoh"
 * ditampilkan jujur di sini juga, bukan cuma di halaman formasinya.
 */
function FormasiTeaserCard() {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tiu-soft text-tiu">
          <BriefcaseIcon width={20} height={20} />
        </span>
        <h2 className="font-display text-lg font-extrabold">
          Cari formasi CPNS
        </h2>
        <Badge tone="amber">BETA</Badge>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink/70">
        CPNS 2026 dibuka November ini, sekitar 160 ribu formasi. Intip
        jabatan yang cocok dengan jurusanmu, filter berdasarkan wilayah,
        gaji, dan instansi.
      </p>
      <p className="mt-2 text-xs leading-relaxed font-semibold text-ink/50">
        Menu masih beta, datanya masih contoh. Data resmi menyusul begitu
        BKN mengumumkan.
      </p>
      <Link to="/formasi" className="mt-4 block">
        <Button fullWidth variant="outline">
          Lihat formasi
          <ChevronRightIcon width={16} height={16} />
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
 * selesaikan 1 drill atau baca 1 seksi materi. Sembunyi bila tidak
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
                baca 1 seksi materi, streak {lostStreak} hari balik lagi.
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
                bawah, lalu selesaikan 1 drill atau baca 1 seksi materi
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

/**
 * Kartu profil ringkas di dashboard: avatar, username, formasi, dan
 * tombol Ubah profil. Hanya tampil saat user login dan profilnya
 * sudah termuat; di mode tamu atau placeholder (Supabase belum
 * terkonfigurasi) dan selama profil dimuat, kartu disembunyikan
 * supaya tidak pernah tampil kartu kosong.
 */
function ProfileCard() {
  const configured = isSupabaseConfigured()
  const { user, loading } = useAuthUser()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    if (!configured || !user) {
      setProfile(null)
      return
    }
    let cancelled = false
    setProfileLoading(true)
    getMyProfile()
      .then((nextProfile) => {
        if (cancelled) return
        setProfile(nextProfile)
        setProfileLoading(false)
      })
      .catch(() => {
        if (!cancelled) setProfileLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [configured, user])

  if (!configured || loading || profileLoading || !user || !profile) {
    return null
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-4">
        <ProfileAvatar size={56} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-extrabold">
            {profile.username}
          </p>
          <p className="truncate text-sm font-medium text-ink/60">
            {profile.formasi ?? 'Formasi belum diisi'}
          </p>
        </div>
        <Link to="/profil" className="shrink-0">
          <Button size="sm" variant="outline">
            Ubah profil
          </Button>
        </Link>
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
  const bacaKeseluruhan = overallReadProgress(readSections)
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
  // beranda tanpa reload.
  const { variantId } = useProfileAvatar()
  const avatarVariant = getAvatarVariant(variantId)

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
    <div className="flex flex-col gap-5 lg:gap-8">
      {/* Hero tipografi: sapaan besar + XP/streak + progres level,
          ditemani maskot (v2.1: maskot tampil besar dengan namanya) */}
      <section className="flex flex-col gap-6 rounded-3xl border border-line bg-white p-6 shadow-soft lg:flex-row lg:items-start lg:justify-between lg:p-10">
        <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink/60">
          {tanggalHariIni()}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] font-extrabold lg:text-5xl">
          {sapaan()}! Siap lolos CPNS?
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink/70 lg:text-lg">
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
          />
          <p className="mt-1.5 text-sm font-medium text-ink/60">
            {progress.needed - progress.current} XP lagi ke Level {level + 1}
          </p>
          <p className="mt-1 flex items-start gap-1 text-sm leading-snug font-medium text-ink/60">
            {streakAmanHariIni ? (
              <>
                <CheckIcon width={14} height={14} className="mt-0.5 shrink-0 text-primary-600" />
                Streak aman, kamu sudah belajar hari ini.
              </>
            ) : streakPutus ? (
              `Streak-mu putus. Bujuk ${MASCOT_NAME} di bawah biar balik lagi.`
            ) : (
              'Yuk belajar hari ini biar streak-mu tetap nyala.'
            )}
          </p>
        </div>

        <p className="mt-6 border-t border-dashed border-line pt-4 text-sm leading-relaxed font-semibold text-ink/60">
          Passing grade mini:{' '}
          <span className="text-ink">
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
          className="shrink-0 lg:w-52"
        />
      </section>

      {/* Kartu profil ringkas: hanya tampil saat login */}
      <ProfileCard />

      {/* Bujuk Osi: tampil hanya saat streak putus dan masih bisa dibujuk */}
      <BujukOsiCard />

      {/* Streak mingguan + peliharaan (kolom kiri) dan misi harian
          (kolom kanan). PetCard pindah ke sini (v2.3.2) supaya slot
          kosong di bawah kartu streak terisi dan beranda tidak lagi
          terasa penuh oleh blok full-width bertumpuk. */}
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <div className="flex flex-col gap-5 lg:gap-6">
          <WeekStreak />
          <PetCard />
        </div>
        <DailyMissions />
      </div>

      {/* Teaser peringkat minggu ini + teaser game + teaser formasi:
          3 kolom di lg (v2.3.2), sebelumnya 3 item di grid 2 kolom
          menyisakan lubang di baris kedua. */}
      <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
        <LeaderboardTeaser />
        <GameTeaserCard />
        <FormasiTeaserCard />
      </div>

      {/* Ulas soal salah + fokus hari ini */}
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
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
                  Ikut drill atau tryout mini dulu, nanti aku susun fokus
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
      </div>

      {/* Lanjutkan belajar: kartu amber lembut */}
      <Card className="border-accent-200 bg-accent-50 p-5 text-ink">
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
        <div className="grid grid-cols-3 gap-3 lg:gap-4">
          {AKSI_CEPAT.map(({ to, label, deskripsi, icon: Icon, tone }) => (
            <Link key={to} to={to}>
              <Card className="flex h-full flex-col items-center gap-1.5 py-4 text-center transition-transform hover:-translate-y-0.5 lg:py-6">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone} lg:h-12 lg:w-12`}
                >
                  <Icon width={20} height={20} />
                </span>
                <span className="font-display text-sm font-extrabold lg:text-base">{label}</span>
                <span className="text-[11px] leading-tight font-medium text-ink/60 lg:text-xs">
                  {deskripsi}
                </span>
              </Card>
            </Link>
          ))}
        </div>
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

      {/* Tryout terakhir + perkiraan kelolosan */}
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <section>
          <p className="kicker">Riwayat</p>
          <h2 className="mt-1 mb-3 font-display text-xl font-extrabold">
            Tryout terakhir
          </h2>
          {tryoutTerakhir ? (
            <TryoutTerakhirCard record={tryoutTerakhir} />
          ) : (
            <Card className="text-center">
              <Mascot mood="semangat" size={72} className="mx-auto" />
              <p className="mt-1 text-xs font-extrabold text-ink/50">
                {MASCOT_NAME}
              </p>
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
