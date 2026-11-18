import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Mascot } from '../components/Mascot'
import { InteractiveMascot } from '../components/InteractiveMascot'
import {
  BookIcon,
  CheckIcon,
  ClockIcon,
  FlameIcon,
  GamepadIcon,
  RankingIcon,
  SwordsIcon,
  TargetIcon,
  TrophyIcon,
  UsersIcon,
  ZapIcon,
} from '../components/icons'
import { BADGES } from '../lib/badges'
import { MASCOT_NAME } from '../lib/mascot'
import { getPetStage } from '../lib/pet'
import { MISSION_POOL, type MissionDef } from '../lib/missions'
import { getRankTitle } from '../lib/ranks'
import { REVIEW_INTERVALS } from '../lib/review'
import { getLevel, xpProgress } from '../lib/store'
import {
  ORIGINAL_PASSING,
  SIMULASI_QUESTIONS_PER_SECTION,
  SIMULASI_TIME_LIMIT_MINUTES,
  SIMULASI_TOTAL_QUESTIONS,
} from '../lib/quiz'
import {
  fetchLeaderboard,
  formatWeekRange,
  getCurrentWeekStart,
  type LeaderboardEntry,
} from '../lib/leaderboard'
import { cx } from '../lib/utils'

const FITUR = [
  {
    icon: BookIcon,
    tone: 'bg-primary-100 text-primary-700',
    judul: 'Materi SKD',
    deskripsi:
      'Ringkasan dan modul TWK, TIU, dan TKP yang gampang dicerna, lengkap dengan tabel dan contoh.',
  },
  {
    icon: TargetIcon,
    tone: 'bg-tiu-soft text-tiu',
    judul: 'Latihan per topik',
    deskripsi:
      'Drill per topik dengan pembahasan tiap opsi, jadi kamu tahu kenapa jawabanmu benar atau salah.',
  },
  {
    icon: TrophyIcon,
    tone: 'bg-accent-100 text-accent-700',
    judul: 'Tryout mini',
    deskripsi:
      'Latihan cepat dengan suasana CAT, lengkap dengan skor dan prediksi kelolosanmu.',
  },
  {
    icon: ClockIcon,
    tone: 'bg-tkp-soft text-tkp',
    judul: 'Simulasi CAT',
    deskripsi:
      'Rasakan ujian beneran dengan timer dan passing grade asli, biar hari-H nggak kaget.',
  },
] as const

const LANGKAH = [
  {
    nomor: '1',
    judul: 'Daftar gratis',
    deskripsi: 'Bikin akun dalam semenit, langsung bisa belajar.',
  },
  {
    nomor: '2',
    judul: 'Belajar tiap hari',
    deskripsi: 'Baca materi, kerjakan drill, dan jaga streak-mu tetap nyala.',
  },
  {
    nomor: '3',
    judul: 'Ukur kesiapanmu',
    deskripsi: 'Ikut tryout dan lihat prediksi kelolosanmu per subtes.',
  },
] as const

const FITUR_FREE = [
  'Materi SKD lengkap',
  'Latihan per topik',
  'Tryout mini dan simulasi CAT',
  'Misi harian, streak, dan lencana',
] as const

/* ------------------------------------------------------------------ */
/* Sorotan game (v2.6): lima game yang BENAR-BENAR ada di /main.      */
/* Tanpa angka atau skor apa pun; catatan login di bawah grid jujur:   */
/* Battle dan Sesi butuh login, tiga game kilat bisa langsung main.    */
/* ------------------------------------------------------------------ */
const GAME = [
  {
    icon: SwordsIcon,
    tone: 'bg-primary-100 text-primary-700',
    judul: 'Battle 1v1',
    deskripsi:
      'Adu cepat jawab soal lawan teman. Yang paling cepat dan tepat, dia yang menang.',
  },
  {
    icon: UsersIcon,
    tone: 'bg-tiu-soft text-tiu',
    judul: 'Sesi Bareng',
    deskripsi:
      'Main bareng satu sesi, host yang pegang kendali. Cocok buat belajar kelompok.',
  },
  {
    icon: ZapIcon,
    tone: 'bg-accent-100 text-accent-700',
    judul: 'Kuis Kilat',
    deskripsi:
      'Jawab secepat mungkin, kejar skor terbaikmu sendiri. Bisa dimainkan tanpa daftar.',
  },
  {
    icon: BookIcon,
    tone: 'bg-tkp-soft text-tkp',
    judul: 'Kartu Kilat',
    deskripsi:
      'Hafalan bolak-balik buat materi yang susah nempel. Bisa dimainkan tanpa daftar.',
  },
  {
    icon: TargetIcon,
    tone: 'bg-twk-soft text-twk',
    judul: 'Benar/Salah Kilat',
    deskripsi:
      'Nilai pernyataan benar atau salah, secepat kilat. Bisa dimainkan tanpa daftar.',
  },
] as const

/* ------------------------------------------------------------------ */
/* Data contoh untuk preview gamifikasi. Angka-angka ini dihitung      */
/* dari fungsi dan data nyata app (level, gelar, lencana, misi,        */
/* jadwal ulas) supaya preview tidak ngawur; yang fiktif hanya        */
/* progres contohnya, dan bagian ini diberi label "Contoh tampilan".    */
/* ------------------------------------------------------------------ */

/** XP contoh: 2.150 XP = Level 7, gelar "Ksatria SKD". */
const DEMO_XP = 2150
const DEMO_LEVEL = getLevel(DEMO_XP)
const DEMO_PROGRESS = xpProgress(DEMO_XP)
const DEMO_STREAK = 12
/** Stage peliharaan pada streak contoh (12 hari = kacamata keren). */
const DEMO_PET_STAGE = getPetStage(DEMO_STREAK).stage
const DEMO_ULAS_JATUH_TEMPO = 8
/** Tangga gelar di sekitar level contoh (2 di bawah, 2 di atas). */
const DEMO_LADDER_LEVELS = [5, 6, 7, 8, 9]
/** 6 lencana pertama; 3 pertama tampil sebagai sudah diraih. */
const DEMO_LENCANA_DIRAIH = new Set([
  'langkah-pertama',
  'penantang-tryout',
  'konsisten-7',
])

function misiById(id: string): MissionDef {
  return (
    MISSION_POOL.find((m) => m.id === id) ?? MISSION_POOL[0]!
  )
}

const DEMO_MISI: { def: MissionDef; progress: number }[] = [
  { def: misiById('drill-1'), progress: 1 },
  { def: misiById('benar-10'), progress: 7 },
  { def: misiById('simulasi-1'), progress: 0 },
]

const DEMO_PODIUM = [
  { nama: 'Rani', skor: 520 },
  { nama: 'Bimo', skor: 505 },
  { nama: 'Sari', skor: 498 },
]

const DEMO_HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

const SIMULASI_SEKSI = [
  { materi: 'TWK', tone: 'bg-twk', soft: 'bg-twk-soft text-twk' },
  { materi: 'TIU', tone: 'bg-tiu', soft: 'bg-tiu-soft text-tiu' },
  { materi: 'TKP', tone: 'bg-tkp', soft: 'bg-tkp-soft text-tkp' },
] as const

/* ------------------------------------------------------------------ */
/* Papan Peringkat landing (v2.5, poin 4b)                             */
/* ------------------------------------------------------------------ */

/** Hadiah juara leaderboard mingguan: premium + lencana prestise. */
const HADIAH_PERINGKAT = [
  { juara: 1, medali: '🥇', premium: '7 hari' },
  { juara: 2, medali: '🥈', premium: '5 hari' },
  { juara: 3, medali: '🥉', premium: '3 hari' },
] as const

/** Warna lingkaran peringkat: 1 emas, 2 perak, 3 perunggu. */
function rankCircleClass(rank: number): string {
  if (rank === 1) return 'bg-accent-400 text-ink'
  if (rank === 2) return 'bg-white text-ink'
  if (rank === 3) return 'bg-orange-200 text-orange-800'
  return 'bg-ink/5 text-ink/70'
}

/**
 * Bagian "Papan Peringkat" di landing: tiga besar minggu berjalan dari
 * leaderboard Supabase. Hanya data ASLI yang ditampilkan; bila minggu
 * ini belum ada skor, fetch gagal, atau Supabase belum aktif,
 * tampilkan struktur hadiah + ajakan jadi yang pertama. Tidak pernah
 * menampilkan nama atau skor palsu.
 */
function PapanPeringkatSection() {
  // null = masih mengambil data; [] = minggu ini kosong / fetch gagal.
  const [top3, setTop3] = useState<LeaderboardEntry[] | null>(null)
  const weekStart = getCurrentWeekStart()

  useEffect(() => {
    let cancelled = false
    void fetchLeaderboard(weekStart)
      .then((entries) => {
        if (!cancelled) setTop3(entries.slice(0, 3))
      })
      .catch(() => {
        // fetchLeaderboard tidak pernah melempar, tapi jaga-jaga:
        // gagal fetch tampilkan fallback hadiah, jangan crash.
        if (!cancelled) setTop3([])
      })
    return () => {
      cancelled = true
    }
  }, [weekStart])

  return (
    <section aria-label="Papan peringkat minggu ini">
      <p className="kicker">Papan Peringkat</p>
      <h2 className="mt-2 max-w-2xl font-display text-3xl font-extrabold lg:text-4xl">
        Siapa yang paling siap minggu ini?
      </h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink/70">
        Skor simulasi CAT terbaik tiap minggu masuk papan peringkat. Tiga
        besar dapat premium gratis plus lencana prestise. Minggu ini (
        {formatWeekRange(weekStart)}):
      </p>

      {top3 === null ? (
        <Card className="mt-8 p-6 text-center lg:p-8">
          <p className="text-sm font-bold text-ink/60">
            Lagi ngambil peringkat minggu ini...
          </p>
        </Card>
      ) : top3.length > 0 ? (
        <>
          <ol className="mt-8 space-y-3">
            {top3.map((entry) => (
              <li key={entry.userId}>
                <Card className="py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={cx(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line font-display text-base font-extrabold',
                        rankCircleClass(entry.rank),
                      )}
                    >
                      {entry.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-extrabold">
                        {entry.username}
                      </p>
                      <p className="mt-0.5 truncate text-xs font-medium text-ink/60">
                        {entry.formasi ?? 'Formasi belum diisi'}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-ink/60">
                        TWK {entry.twk} · TIU {entry.tiu} · TKP {entry.tkp}
                      </p>
                    </div>
                    <p className="shrink-0 text-right font-display text-xl font-extrabold">
                      {entry.total}
                      <span className="block text-[11px] font-semibold text-ink/50">
                        dari 550
                      </span>
                    </p>
                  </div>
                </Card>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm leading-relaxed font-medium text-ink/70">
            Juara 1 dapat premium 7 hari, juara 2 premium 5 hari, juara 3
            premium 3 hari, semuanya plus lencana prestise. Masih ada
            waktu buat nyalip mereka minggu ini.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/auth?mode=daftar">
              <Button size="lg">Daftar gratis</Button>
            </Link>
            <Link to="/leaderboard">
              <Button size="lg" variant="outline">
                Lihat peringkat lengkap
              </Button>
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-3 lg:gap-6">
            {HADIAH_PERINGKAT.map(({ juara, medali, premium }) => (
              <Card key={juara} className="reveal card-lift p-5 text-center lg:p-6">
                <p className="text-4xl" aria-hidden="true">
                  {medali}
                </p>
                <h3 className="mt-3 font-display text-lg font-extrabold">
                  Juara {juara}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
                  Premium {premium} + lencana prestise yang bisa dipamerin.
                </p>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-sm leading-relaxed font-medium text-ink/70">
            Minggu ini belum ada yang masuk papan peringkat. Kursinya
            masih kosong semua.
          </p>
          <div className="mt-5">
            <Link to="/auth?mode=daftar">
              <Button size="lg">Daftar gratis, jadilah yang pertama</Button>
            </Link>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * Beranda untuk pengunjung yang belum login: landing page marketing
 * yang mengajak daftar atau masuk. Muncul hanya saat Supabase
 * terkonfigurasi dan belum ada sesi login (lihat HomePage).
 *
 * v2.1: marketing-first dan gamified. Hero menampilkan maskot besar,
 * lalu bagian gamifikasi dengan preview visual (bar XP, lencana, misi,
 * streak, leaderboard, ulas soal, simulasi CAT) memakai data nyata
 * app dengan progres contoh yang diberi label jelas.
 *
 * v2.2: maskot hero interaktif (bisa ditekan, balon ucapan berganti)
 * dan kartu streak menampilkan teaser peliharaan.
 *
 * v2.5: bagian Papan Peringkat dengan tiga besar minggu berjalan dari
 * Supabase (data asli saja; bila kosong tampilkan struktur hadiah).
 */
export function LandingPage() {
  return (
    <div className="flex flex-col gap-14 lg:gap-20">
      {/* Hero: panel hijau solid tanpa tekstur, maskot besar di kanan */}
      <section className="overflow-hidden rounded-3xl bg-primary-800 px-6 py-10 text-white shadow-soft-lg lg:px-12 lg:py-14">
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-6">
          <div>
            <p className="text-xs font-extrabold tracking-[0.14em] text-accent-300 uppercase">
              Belajar CPNS, anti bosan
            </p>
            <h1 className="mt-4 max-w-3xl font-display text-4xl leading-[1.05] font-extrabold lg:text-6xl">
              Belajar CPNS rasa{' '}
              {/* Titik di dalam span supaya tidak yatim di baris sendiri
                  saat judul membungkus di layar kecil. */}
              <span className="hl-marker">main game.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-primary-100 lg:text-lg">
              Naik level, kumpulin lencana, kejar streak, dan adu skor di
              leaderboard mingguan. Materi SKD, latihan per topik, tryout
              mini, sampai simulasi CAT yang rasanya kayak ujian beneran.
              Semuanya dalam satu aplikasi, gratis buat mulai.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth?mode=daftar">
                <Button size="lg" variant="secondary">
                  Daftar gratis
                </Button>
              </Link>
              <Link to="/auth">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/40 bg-transparent text-white hover:border-white hover:bg-white/10 hover:text-white"
                >
                  Masuk
                </Button>
              </Link>
            </div>
            <p className="mt-4 text-sm font-medium text-primary-200">
              Gratis buat mulai, tanpa ribet.
            </p>
          </div>

          {/* Panggung maskot: blob lembut + maskot interaktif + chip melayang */}
          <div className="relative mx-auto w-full max-w-xs sm:max-w-sm">
            <div
              className="blob-soft absolute inset-x-6 top-10 bottom-4 bg-primary-700/70"
              aria-hidden="true"
            />
            <div
              className="blob-soft absolute inset-x-14 top-4 bottom-14 bg-accent-400/25"
              aria-hidden="true"
            />
            <InteractiveMascot
              size={220}
              mascotClassName="float-soft h-auto w-44 sm:w-52 lg:w-60"
            />
            <p className="relative z-10 mt-1 text-center text-xs font-bold text-primary-200/80">
              Coba tekan {MASCOT_NAME}!
            </p>
            <span
              className="float-soft absolute top-16 -right-1 z-20 inline-flex items-center gap-1 rounded-full bg-accent-400 px-3 py-1.5 text-xs font-extrabold text-ink shadow-soft sm:right-0"
              style={{ animationDelay: '0.6s' }}
            >
              <ZapIcon width={14} height={14} />
              +25 XP
            </span>
            <span
              className="float-soft absolute bottom-16 -left-1 z-20 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-twk shadow-soft sm:left-0"
              style={{ animationDelay: '1.2s' }}
            >
              <FlameIcon width={14} height={14} />
              Streak {DEMO_STREAK} hari
            </span>
          </div>
        </div>
      </section>

      {/* Gamifikasi: preview visual, bukan sekadar teks */}
      <section aria-label="Fitur gamifikasi">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="kicker">Kenapa nagih?</p>
            <h2 className="mt-2 max-w-2xl font-display text-3xl font-extrabold lg:text-4xl">
              Belajar yang bikin ketagihan, bukan ketiduran
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink/70">
              Tiap jawaban benar ada hasilnya: XP naik, lencana kebuka,
              streak makin panjang. Ini cuplikan yang bakal kamu temuin di
              dalam.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-accent-100 px-3 py-1.5 text-xs font-extrabold text-accent-800">
            Contoh tampilan
          </span>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-6 lg:gap-6">
          {/* Level + XP + tangga gelar */}
          <Card className="reveal card-lift p-5 lg:col-span-3 lg:p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-100 text-accent-700">
                <ZapIcon width={20} height={20} />
              </span>
              <h3 className="font-display text-lg font-extrabold">
                Naik level, kumpulin XP
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              Tiap drill, tryout, dan misi ngasih XP. Makin banyak XP, makin
              tinggi level dan gelarmu.
            </p>
            <div className="mt-4 rounded-2xl bg-paper p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-display text-xl font-extrabold">
                  Level {DEMO_LEVEL} · {getRankTitle(DEMO_LEVEL)}
                </p>
                <p className="text-sm font-extrabold text-accent-700">
                  {DEMO_XP.toLocaleString('id-ID')} XP
                </p>
              </div>
              <div
                className="mt-2 h-3 w-full overflow-hidden rounded-full bg-ink/10"
                role="progressbar"
                aria-valuenow={DEMO_PROGRESS.current}
                aria-valuemin={0}
                aria-valuemax={DEMO_PROGRESS.needed}
                aria-label="Contoh progres XP menuju level berikutnya"
              >
                <div
                  className="xp-fill h-full bg-accent-500"
                  style={
                    {
                      '--xp-fill': DEMO_PROGRESS.current / DEMO_PROGRESS.needed,
                    } as CSSProperties
                  }
                />
              </div>
              <p className="mt-1.5 text-xs font-bold text-ink/60">
                {(DEMO_PROGRESS.needed - DEMO_PROGRESS.current).toLocaleString(
                  'id-ID',
                )}{' '}
                XP lagi ke Level {DEMO_LEVEL + 1} ·{' '}
                {getRankTitle(DEMO_LEVEL + 1)}
              </p>
              <ol className="mt-3 space-y-1.5 border-t border-dashed border-line pt-3">
                {DEMO_LADDER_LEVELS.map((level) => {
                  const current = level === DEMO_LEVEL
                  const passed = level < DEMO_LEVEL
                  return (
                    <li
                      key={level}
                      className={cx(
                        'flex items-center justify-between gap-2 text-sm',
                        current
                          ? 'font-extrabold text-primary-700'
                          : passed
                            ? 'font-semibold text-ink/70'
                            : 'font-medium text-ink/45',
                      )}
                    >
                      <span>
                        Lv {level} · {getRankTitle(level)}
                      </span>
                      {current ? (
                        <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[11px] font-extrabold text-white">
                          Kamu di sini
                        </span>
                      ) : passed ? (
                        <CheckIcon
                          width={16}
                          height={16}
                          className="text-primary-600"
                        />
                      ) : (
                        <span className="text-[11px] font-bold">
                          Terkunci
                        </span>
                      )}
                    </li>
                  )
                })}
              </ol>
            </div>
          </Card>

          {/* Lencana */}
          <Card className="reveal card-lift p-5 lg:col-span-3 lg:p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                <TrophyIcon width={20} height={20} />
              </span>
              <h3 className="font-display text-lg font-extrabold">
                Lencana buat dipamerin
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              Ada {BADGES.length} lencana yang bisa dikoleksi, dari Langkah
              Pertama sampai Lolos Simulasi. Tiap pencapaian ada buktinya.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {BADGES.slice(0, 6).map((def) => {
                const earned = DEMO_LENCANA_DIRAIH.has(def.id)
                return (
                  <div
                    key={def.id}
                    className={cx(
                      'badge-pop flex flex-col items-center gap-1 rounded-2xl p-3 text-center',
                      earned ? 'bg-accent-50' : 'bg-ink/5 opacity-70',
                    )}
                  >
                    <span
                      className={cx(
                        'flex h-11 w-11 items-center justify-center rounded-2xl text-2xl',
                        earned ? 'bg-accent-400' : 'bg-ink/5 grayscale',
                      )}
                      aria-hidden="true"
                    >
                      {def.ikon}
                    </span>
                    <span className="text-xs leading-tight font-extrabold">
                      {def.nama}
                    </span>
                    <span className="text-[11px] leading-tight font-medium text-ink/50">
                      {earned ? 'Diraih' : 'Belum diraih'}
                    </span>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Misi harian */}
          <Card className="reveal card-lift p-5 lg:col-span-2 lg:p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tiu-soft text-tiu">
                <TargetIcon width={20} height={20} />
              </span>
              <h3 className="font-display text-lg font-extrabold">
                Misi harian
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              Tiga misi baru tiap hari. Selesaikan, klaim XP-nya.
            </p>
            <div className="mt-4 space-y-3">
              {DEMO_MISI.map(({ def, progress }) => {
                const done = progress >= def.target
                return (
                  <div key={def.id} className="rounded-2xl bg-paper p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm leading-snug font-extrabold">
                        {def.judul}
                      </p>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-extrabold text-accent-700">
                        <ZapIcon width={11} height={11} />+{def.xp} XP
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <ProgressBar
                        value={progress}
                        max={def.target}
                        tone="primary"
                        label={`Contoh progres misi ${def.judul}`}
                        className="flex-1"
                      />
                      <span className="shrink-0 text-xs font-extrabold text-ink/60">
                        {progress}/{def.target}
                      </span>
                    </div>
                    {done && (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent-400 px-2.5 py-1 text-[11px] font-extrabold text-ink">
                        <ZapIcon width={11} height={11} />
                        Klaim +{def.xp} XP
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>

          {/* Streak */}
          <Card className="reveal card-lift p-5 lg:col-span-2 lg:p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-twk-soft text-twk">
                <FlameIcon width={20} height={20} />
              </span>
              <h3 className="font-display text-lg font-extrabold">
                Streak yang nagih dijaga
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              Belajar tiap hari biar apinya nggak padam. Sekali bolos,
              hitungan mulai dari nol lagi.
            </p>
            <div className="mt-4 rounded-2xl bg-paper p-4">
              <p className="text-center font-display text-2xl font-extrabold">
                🔥 {DEMO_STREAK} hari beruntun
              </p>
              <div className="mt-3 grid grid-cols-7 gap-1.5">
                {DEMO_HARI.map((hari, i) => {
                  const active = i < 6
                  const isToday = i === 6
                  return (
                    <div
                      key={hari}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <span
                        className={cx(
                          'flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold',
                          active
                            ? 'bg-primary-600 text-white'
                            : isToday
                              ? 'bg-accent-400 text-ink'
                              : 'bg-ink/5 text-ink/40',
                        )}
                        aria-label={`${hari} ${active ? 'belajar' : 'hari ini'}`}
                      >
                        {active ? (
                          <CheckIcon width={16} height={16} />
                        ) : (
                          hari[0]
                        )}
                      </span>
                      <span
                        className={cx(
                          'text-[11px] font-bold',
                          isToday ? 'text-ink' : 'text-ink/50',
                        )}
                      >
                        {hari}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-center text-xs font-bold text-ink/60">
                6 dari 7 hari minggu ini sudah belajar
              </p>
              <p className="mt-2 border-t border-dashed border-line pt-2 text-center text-xs leading-relaxed font-bold text-ink/60">
                {MASCOT_NAME} juga ikut tumbuh: streak {DEMO_STREAK} hari
                bikin dia jadi {DEMO_PET_STAGE.nama}.
              </p>
            </div>
          </Card>

          {/* Leaderboard mingguan */}
          <Card className="reveal card-lift p-5 lg:col-span-2 lg:p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tkp-soft text-tkp">
                <RankingIcon width={20} height={20} />
              </span>
              <h3 className="font-display text-lg font-extrabold">
                Leaderboard mingguan
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              Adu skor simulasi CAT sama pejuang lain. Juara 1 dapat
              premium 7 hari, juara 2 premium 5 hari, juara 3 premium 3
              hari, semuanya plus lencana prestise.
            </p>
            <ol className="mt-4 space-y-2">
              {DEMO_PODIUM.map(({ nama, skor }, i) => (
                <li
                  key={nama}
                  className={cx(
                    'flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5',
                    i === 0 ? 'bg-accent-50' : 'bg-paper',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-extrabold">
                    <span
                      className={cx(
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs',
                        i === 0
                          ? 'bg-accent-400 text-ink'
                          : 'bg-ink/5 text-ink/60',
                      )}
                    >
                      {i + 1}
                    </span>
                    {nama}
                  </span>
                  <span className="text-sm font-extrabold">
                    {skor.toLocaleString('id-ID')}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-2 rounded-2xl border-2 border-dashed border-line-strong px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-extrabold text-ink/60">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/5 text-xs text-ink/60">
                    4
                  </span>
                  Kamu?
                </span>
                <span className="text-sm font-extrabold text-ink/40">
                  ???
                </span>
              </li>
            </ol>
            <p className="mt-3 text-xs leading-relaxed font-bold text-ink/60">
              Daftar buat naik peringkat dan rebut hadiah mingguannya.
            </p>
          </Card>

          {/* Ulas soal salah */}
          <Card className="reveal card-lift p-5 lg:col-span-3 lg:p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-100 text-accent-700">
                <ClockIcon width={20} height={20} />
              </span>
              <h3 className="font-display text-lg font-extrabold">
                Ulas soal salah, sampai nempel
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              Soal yang pernah kamu jawab salah nggak hilang begitu aja.
              Lolosin ngingetin lagi pas waktunya, dengan jeda yang makin
              panjang tiap kamu berhasil jawab benar.
            </p>
            <div className="mt-4 rounded-2xl bg-paper p-4">
              <p className="text-xs font-extrabold tracking-wide text-ink/60 uppercase">
                Jadwal ulas (hari)
              </p>
              <ol className="mt-2 flex flex-wrap items-center gap-2">
                {REVIEW_INTERVALS.map((hari, i) => (
                  <li key={hari} className="flex items-center gap-2">
                    <span
                      className={cx(
                        'flex h-10 w-10 items-center justify-center rounded-full font-display text-base font-extrabold',
                        i === 0
                          ? 'bg-primary-600 text-white'
                          : 'bg-white text-ink shadow-soft',
                      )}
                    >
                      {hari}
                    </span>
                    {i < REVIEW_INTERVALS.length - 1 && (
                      <span
                        className="text-sm font-extrabold text-ink/30"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-sm font-bold text-ink/70">
                Contoh: {DEMO_ULAS_JATUH_TEMPO} soal jatuh tempo buat diulas
                hari ini. Lima kali benar beruntun, soal dianggap nempel.
              </p>
            </div>
          </Card>

          {/* Simulasi CAT */}
          <Card className="reveal card-lift p-5 lg:col-span-3 lg:p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                <TrophyIcon width={20} height={20} />
              </span>
              <h3 className="font-display text-lg font-extrabold">
                Simulasi CAT {SIMULASI_TOTAL_QUESTIONS} soal
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              Ujian beneran, lengkap dengan timer {SIMULASI_TIME_LIMIT_MINUTES}{' '}
              menit dan passing grade asli. Lulus di sini, pede di hari-H.
            </p>
            <div className="mt-4 space-y-2.5 rounded-2xl bg-paper p-4">
              {SIMULASI_SEKSI.map(({ materi, tone, soft }) => {
                const jumlah =
                  SIMULASI_QUESTIONS_PER_SECTION[materi]
                return (
                  <div key={materi}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span
                        className={cx(
                          'rounded-full px-2 py-0.5 font-extrabold',
                          soft,
                        )}
                      >
                        {materi}
                      </span>
                      <span className="font-extrabold">
                        {jumlah} soal · PG {ORIGINAL_PASSING[materi]}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-ink/10">
                      <div
                        className={cx('h-full rounded-full', tone)}
                        style={{
                          width: `${(jumlah / SIMULASI_TOTAL_QUESTIONS) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
              <p className="pt-1 text-xs leading-relaxed font-bold text-ink/60">
                Total {SIMULASI_TOTAL_QUESTIONS} soal, skor maksimal 550.
                Hasilnya masuk leaderboard mingguan.
              </p>
            </div>
          </Card>
        </div>
      </section>

      {/* Papan Peringkat: tiga besar minggu berjalan (data asli) atau
          struktur hadiah bila minggu ini masih kosong */}
      <PapanPeringkatSection />

      {/* Kenalan dengan maskot */}
      <section
        aria-label={`Kenalan dengan ${MASCOT_NAME}`}
        className="reveal rounded-3xl border border-accent-200 bg-accent-50 px-6 py-8 lg:px-10 lg:py-10"
      >
        <div className="grid items-center gap-6 lg:grid-cols-[auto_1fr] lg:gap-10">
          <div className="relative mx-auto w-fit">
            <div
              className="blob-soft absolute inset-2 bg-accent-200/70"
              aria-hidden="true"
            />
            <InteractiveMascot
              baseMood="kagum"
              size={180}
              withBubble={false}
              mascotClassName="float-soft h-auto w-36 sm:w-44 lg:w-48"
              className="relative"
            />
          </div>
          <div>
            <p className="kicker">Teman belajarmu</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold lg:text-4xl">
              Kenalan, ini {MASCOT_NAME}!
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink/70">
              {MASCOT_NAME} nemenin kamu dari drill pertama sampai hari-H.
              Dia yang ngerayain tiap kamu naik level, ngasih semangat pas
              streak mau padam, dan ikut bangga pas kamu lulus simulasi.
            </p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                {
                  judul: 'Ngerayain level baru',
                  deskripsi: 'Naik level selalu ada perayaannya.',
                },
                {
                  judul: 'Ngingetin streak',
                  deskripsi: 'Biar apimu nggak padam di tengah jalan.',
                },
                {
                  judul: 'Nemenin sampai lulus',
                  deskripsi: 'Dari drill pertama sampai simulasi CAT.',
                },
              ].map(({ judul, deskripsi }) => (
                <li
                  key={judul}
                  className="rounded-2xl bg-white p-4 shadow-soft"
                >
                  <p className="font-display text-sm font-extrabold">
                    {judul}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed font-medium text-ink/60">
                    {deskripsi}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Fitur: tanpa angka soal/materi */}
      <section>
        <p className="kicker">Apa aja di dalamnya</p>
        <h2 className="mt-2 max-w-2xl font-display text-3xl font-extrabold lg:text-4xl">
          Semua yang kamu butuhkan buat persiapan CPNS
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {FITUR.map(({ icon: Icon, tone, judul, deskripsi }) => (
            <Card key={judul} className="reveal card-lift p-5 lg:p-6">
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}
              >
                <Icon width={24} height={24} />
              </span>
              <h3 className="mt-4 font-display text-lg font-extrabold">
                {judul}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
                {deskripsi}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Sorotan game (v2.6): game adalah daya jual utama app, jadi
          dapat blok sendiri. Lima kartu game + satu kartu ajakan
          yang mengisi grid 3x2. */}
      <section aria-label="Game belajar">
        <p className="kicker">Main game</p>
        <h2 className="mt-2 max-w-2xl font-display text-3xl font-extrabold lg:text-4xl">
          Belajar nggak melulu baca materi
        </h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink/70">
          Capek baca modul? Pindah ke game dulu. Soalnya tetap soal
          CPNS, suasananya aja yang beda.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {GAME.map(({ icon: Icon, tone, judul, deskripsi }) => (
            <Card key={judul} className="reveal card-lift p-5 lg:p-6">
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}
              >
                <Icon width={24} height={24} />
              </span>
              <h3 className="mt-4 font-display text-lg font-extrabold">
                {judul}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
                {deskripsi}
              </p>
            </Card>
          ))}
          <Link to="/main">
            <Card className="reveal card-lift flex h-full flex-col justify-between border-primary-200 bg-primary-50 p-5 lg:p-6">
              <div>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-white">
                  <GamepadIcon width={24} height={24} />
                </span>
                <h3 className="mt-4 font-display text-lg font-extrabold">
                  Main sekarang
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
                  Lima game, satu tempat. Pilih yang paling kamu suka.
                </p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-extrabold text-primary-700">
                Lihat semua game
                <span aria-hidden="true">→</span>
              </span>
            </Card>
          </Link>
        </div>
        <p className="mt-4 text-sm font-medium text-ink/60">
          Battle 1v1 dan Sesi Bareng butuh login. Tiga game kilat bisa
          langsung dimainkan tanpa daftar.
        </p>
      </section>

      {/* Cara pakai */}
      <section>
        <p className="kicker">Gimana cara pakainya</p>
        <h2 className="mt-2 max-w-2xl font-display text-3xl font-extrabold lg:text-4xl">
          Mulai dalam tiga langkah
        </h2>
        <div className="mt-8 grid gap-4 lg:grid-cols-3 lg:gap-6">
          {LANGKAH.map(({ nomor, judul, deskripsi }) => (
            <Card key={nomor} className="reveal card-lift p-5 lg:p-6">
              <span className="font-display text-4xl font-extrabold text-primary-200">
                {nomor}
              </span>
              <h3 className="mt-3 font-display text-lg font-extrabold">
                {judul}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
                {deskripsi}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Akun Free vs Premium */}
      <section>
        <p className="kicker">Akunmu</p>
        <h2 className="mt-2 max-w-2xl font-display text-3xl font-extrabold lg:text-4xl">
          Mulai gratis, naik kelas kalau sudah siap
        </h2>
        <div className="mt-8 grid gap-4 lg:grid-cols-2 lg:gap-6">
          <Card className="reveal p-6 lg:p-8">
            <h3 className="font-display text-2xl font-extrabold">Gratis</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
              Semua fitur belajar dan tryout bisa dipakai tanpa bayar.
            </p>
            <ul className="mt-5 space-y-2.5">
              {FITUR_FREE.map((fitur) => (
                <li
                  key={fitur}
                  className="flex items-start gap-2 text-sm font-medium text-ink/80"
                >
                  <CheckIcon
                    width={18}
                    height={18}
                    className="mt-0.5 shrink-0 text-primary-600"
                  />
                  {fitur}
                </li>
              ))}
            </ul>
            <Link to="/auth?mode=daftar" className="mt-6 block">
              <Button fullWidth size="lg">
                Daftar gratis
              </Button>
            </Link>
          </Card>
          <Card className="reveal border-primary-200 bg-primary-50 p-6 lg:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-2xl font-extrabold">
                Premium
              </h3>
              <span className="rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-bold text-accent-700">
                Segera hadir
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
              Buat yang mau persiapan ekstra, dengan fitur lanjutan buat
              ngebut belajarmu.
            </p>
            <ul className="mt-5 space-y-2.5">
              <li className="flex items-start gap-2 text-sm font-medium text-ink/80">
                <CheckIcon
                  width={18}
                  height={18}
                  className="mt-0.5 shrink-0 text-primary-600"
                />
                Fitur lanjutan buat ngebut persiapan
              </li>
              <li className="flex items-start gap-2 text-sm font-medium text-ink/80">
                <CheckIcon
                  width={18}
                  height={18}
                  className="mt-0.5 shrink-0 text-primary-600"
                />
                Juara leaderboard mingguan dapat premium (juara 1 tujuh
                hari, juara 2 lima hari, juara 3 tiga hari), plus lencana
                prestise yang bisa dipamerin
              </li>
            </ul>
            <Link to="/leaderboard" className="mt-6 block">
              <Button fullWidth size="lg" variant="outline">
                Lihat peringkat
              </Button>
            </Link>
          </Card>
        </div>
      </section>

      {/* CTA penutup */}
      <section className="rounded-3xl bg-primary-800 px-6 py-10 text-center text-white shadow-soft-lg lg:py-14">
        <Mascot
          mood="semangat"
          size={96}
          className="float-soft mx-auto h-auto w-20 lg:w-24"
        />
        <h2 className="mx-auto mt-4 max-w-2xl font-display text-3xl font-extrabold lg:text-4xl">
          Yuk mulai persiapan CPNS-mu hari ini.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-primary-100">
          Daftar gratis, langsung belajar. NIP-mu nunggu.
        </p>
        <Link to="/auth?mode=daftar" className="mt-7 inline-block">
          <Button size="lg" variant="secondary">
            Daftar gratis
          </Button>
        </Link>
      </section>
    </div>
  )
}
