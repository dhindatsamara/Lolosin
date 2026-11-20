import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MATERI_LIST, MATERI_META, type Question } from '../lib/questions'
import { useAuthUser } from '../lib/auth'
import {
  fetchMyAttemptAnswers,
  reconstructAttempt,
} from '../lib/attempts'
import { getPremiumStatus } from '../lib/premium'
import {
  ORIGINAL_MAX,
  ORIGINAL_PASSING,
  scoreQuestion,
  SIMULASI_QUESTIONS_PER_SECTION,
  SIMULASI_TOTAL_QUESTIONS,
  TRYOUT_MAX_PER_SECTION,
  TRYOUT_PASSING_MINI,
  TRYOUT_QUESTIONS_PER_SECTION,
  TRYOUT_TOTAL_QUESTIONS,
  type TryoutAnswers,
  type TryoutScore,
} from '../lib/quiz'
import { cx } from '../lib/utils'
import { useStore } from '../lib/store'
import {
  getLastSubmitPromise,
  type LeaderboardSubmitStatus,
} from '../lib/leaderboard'
import {
  akbarDiscussionUnlockAt,
  formatDiscussionUnlockLabel,
  nextAkbarDiscussionUnlock,
  type EventRank,
} from '../lib/tryoutAkbar'
import {
  hasCelebratedFirstWin,
  markFirstWinCelebrated,
  tryoutShareText,
} from '../lib/firstWin'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Mascot } from '../components/Mascot'
import { FirstWinCard } from '../components/FirstWinCard'
import { PredictionPanel } from '../components/PredictionPanel'
import { DiscussionThread } from '../components/quiz/DiscussionThread'
import { ExplanationPanel } from '../components/quiz/ExplanationPanel'
import { StickyBackButton } from '../components/belajar/StickyBackButton'
import { CheckIcon } from '../components/icons'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

const MATERI_CARD = {
  TWK: 'border-l-4 border-l-twk',
  TIU: 'border-l-4 border-l-tiu',
  TKP: 'border-l-4 border-l-tkp',
} as const

/**
 * State hasil tryout segar, dikirim halaman tryout saat sesi selesai:
 * skor + soal + jawaban (untuk breakdown) + XP yang didapat.
 * Dipakai juga oleh riwayat "Lihat hasil" bila jawaban attempt-nya
 * tersimpan lokal (v2.12.1): bedanya `fromHistory` true dan tidak
 * ada `xpEarned` (XP sudah didapat saat sesi selesai dulu).
 */
export interface TryoutResultState {
  score: TryoutScore
  questions: Question[]
  answers: TryoutAnswers
  /** XP yang didapat dari sesi ini (tidak ada untuk hasil riwayat). */
  xpEarned?: number
  /** `true` bila sesi berakhir karena waktu habis (auto-submit). */
  timedOut?: boolean
  /**
   * Status pengiriman skor ke leaderboard (hanya Tryout Akbar).
   * 'sending' berarti pengiriman masih berjalan saat navigasi;
   * halaman hasil menyelesaikannya lewat getLastSubmitPromise().
   * Tryout kilat ('mini') tidak punya catatan leaderboard.
   */
  leaderboardStatus?: LeaderboardSubmitStatus
  /**
   * Timestamp ISO saat tryout selesai (v2.12): dipakai menghitung
   * Senin 00:00 WIB saat pembahasan Akbar kebuka untuk user gratis.
   * Opsional: state lama tanpa field ini memakai Senin berikutnya.
   */
  finishedAt?: string
  /**
   * `true` bila dibuka dari riwayat (v2.12.1): kartu kemenangan
   * pertama tidak tampil lagi untuk hasil lama.
   */
  fromHistory?: boolean
  /**
   * Peringkat user di event Akbar ini (v2.12.1, hanya untuk hasil
   * riwayat Akbar yang peringkatnya sudah dimuat halaman Tryout).
   */
  eventRank?: EventRank
}

/**
 * Referensi hasil riwayat (v2.12.1): dipakai "Lihat hasil" bila
 * jawaban attempt TIDAK tersimpan lokal (attempt lama, atau sudah
 * dipangkas dari 30 terakhir). Halaman hasil mengambil jawabannya
 * dari kolom `answers` tryout_results (migrasi 007) lewat
 * finished_at = recordDate; bila tidak ada, tampil skor saja
 * seperti sebelum v2.12.1.
 */
export interface TryoutHistoryRefState {
  score: TryoutScore
  recordDate: string
  fromHistory: true
  eventRank?: EventRank
}

interface NormalizedResult {
  score: TryoutScore
  questions: Question[] | null
  answers: TryoutAnswers | null
  xpEarned: number | null
  timedOut: boolean
  leaderboardStatus: LeaderboardSubmitStatus | null
  finishedAt: string | null
  /**
   * Tanggal riwayat untuk mengambil jawaban dari server (v2.12.1):
   * hanya terisi untuk state referensi riwayat.
   */
  recordDate: string | null
  /** `true` bila dibuka dari riwayat. */
  fromHistory: boolean
  /** Peringkat di event Akbar ini, bila dimuat halaman Tryout. */
  eventRank: EventRank | null
}

const LEADERBOARD_STATUSES: readonly LeaderboardSubmitStatus[] = [
  'sent',
  'failed',
  'not-logged-in',
  'not-configured',
  'mini',
  'sending',
]

function isLeaderboardStatus(
  value: unknown,
): value is LeaderboardSubmitStatus {
  return (
    typeof value === 'string' &&
    (LEADERBOARD_STATUSES as readonly string[]).includes(value)
  )
}

function parseEventRank(value: unknown): EventRank | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  return typeof v.rank === 'number' && typeof v.total === 'number'
    ? { rank: v.rank, total: v.total }
    : null
}

function isTryoutScore(value: unknown): value is TryoutScore {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.scores === 'object' &&
    v.scores !== null &&
    typeof v.scaled === 'object' &&
    v.scaled !== null &&
    typeof v.total === 'number'
  )
}

/**
 * Halaman hasil menerima tiga bentuk state:
 * - `TryoutResultState` (dari sesi segar, atau dari riwayat yang
 *   jawabannya tersimpan lokal), dengan breakdown + XP.
 * - `TryoutHistoryRefState` (dari riwayat tanpa jawaban lokal):
 *   skor saja dulu, jawaban diambil dari server bila ada.
 * - `TryoutScore` polos (dari riwayat lama), tanpa breakdown soal.
 */
function normalize(state: unknown): NormalizedResult | null {
  if (typeof state !== 'object' || state === null) return null
  const v = state as Record<string, unknown>
  if (isTryoutScore(v.score) && Array.isArray(v.questions)) {
    return {
      score: v.score as TryoutScore,
      questions: v.questions as Question[],
      answers: (v.answers ?? {}) as TryoutAnswers,
      xpEarned:
        typeof v.xpEarned === 'number' ? (v.xpEarned as number) : null,
      timedOut: v.timedOut === true,
      leaderboardStatus: isLeaderboardStatus(v.leaderboardStatus)
        ? v.leaderboardStatus
        : null,
      finishedAt:
        typeof v.finishedAt === 'string' ? (v.finishedAt as string) : null,
      recordDate: null,
      fromHistory: v.fromHistory === true,
      eventRank: parseEventRank(v.eventRank),
    }
  }
  if (isTryoutScore(v.score) && typeof v.recordDate === 'string') {
    return {
      score: v.score as TryoutScore,
      questions: null,
      answers: null,
      xpEarned: null,
      timedOut: false,
      leaderboardStatus: null,
      finishedAt: v.recordDate as string,
      recordDate: v.recordDate as string,
      fromHistory: true,
      eventRank: parseEventRank(v.eventRank),
    }
  }
  if (isTryoutScore(state)) {
    return {
      score: state,
      questions: null,
      answers: null,
      xpEarned: null,
      timedOut: false,
      leaderboardStatus: null,
      finishedAt: null,
      recordDate: null,
      fromHistory: false,
      eventRank: null,
    }
  }
  return null
}

/**
 * Halaman hasil tryout: skor per bagian, status lulus per bagian dan
 * keseluruhan, XP didapat, dan breakdown per soal. Mode-aware:
 * tryout kilat menampilkan skor mini + terskala, Tryout Akbar
 * menampilkan skor asli (maks 150/175/225, total 550).
 *
 * Pembahasan per soal (v2.12, keputusan Dhinda 19 Nov 2026):
 * tryout kilat gratis untuk semua; Tryout Akbar langsung kebuka
 * untuk premium, sedangkan user gratis kebuka Senin 00:00 WIB
 * setelah event (skor + nilai per bagian + prediksi tetap gratis
 * untuk semua, langsung kelihatan). Tamu / Supabase belum aktif =
 * bukan premium, jadi pembahasan Akbar terkunci sampai Senin
 * dengan ajakan upgrade ke Profil.
 *
 * Riwayat (v2.12.1): "Lihat hasil" membuka breakdown lengkap bila
 * jawaban attempt tersimpan lokal (state penuh) atau bisa diambil
 * dari kolom `answers` tryout_results (state referensi, dimuat
 * di sini). Attempt lama tanpa jawaban tersimpan tetap tampil
 * skor saja, tanpa crash. Gating unlock Senin memakai tanggal
 * selesai attempt (finishedAt/recordDate), bukan tanggal buka.
 */
export function TryoutHasilPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { tryoutHistory } = useStore()
  // Di-memo supaya identitasnya stabil antar render (efek ambil
  // jawaban server bergantung padanya).
  const result = useMemo(
    () => normalize(location.state),
    [location.state],
  )
  const { user } = useAuthUser()
  const modeFull = result?.score.mode === 'full'

  // Jawaban attempt dari server (v2.12.1): untuk hasil riwayat
  // yang jawabannya tidak tersimpan lokal, ambil dari kolom
  // `answers` tryout_results lalu rekonstruksi soal + jawabannya.
  // Bila tidak ada (attempt lama / migrasi 007 belum jalan),
  // halaman tetap tampil skor saja seperti sebelumnya.
  const [loadedAttempt, setLoadedAttempt] = useState<{
    questions: Question[]
    answers: TryoutAnswers
  } | null>(null)
  const [attemptLoadDone, setAttemptLoadDone] = useState(false)
  const recordDate = result?.recordDate ?? null
  const hasLocalQuestions = result?.questions !== null
  useEffect(() => {
    if (!recordDate || hasLocalQuestions || !modeFull) return
    let cancelled = false
    void (async () => {
      const attempt = await fetchMyAttemptAnswers(recordDate)
      if (cancelled) return
      setAttemptLoadDone(true)
      if (attempt) {
        const rebuilt = reconstructAttempt(attempt)
        if (rebuilt) setLoadedAttempt(rebuilt)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [recordDate, hasLocalQuestions, modeFull])

  // Status premium, hanya dibaca untuk hasil Tryout Akbar (null =
  // belum terbaca). Tamu / belum terkonfigurasi langsung bukan premium
  // (getPremiumStatus mengembalikan NOT_PREMIUM untuk keduanya).
  const [premium, setPremium] = useState<boolean | null>(null)
  useEffect(() => {
    if (!modeFull) return
    let cancelled = false
    void getPremiumStatus(user?.id).then((status) => {
      if (!cancelled) setPremium(status.premium)
    })
    return () => {
      cancelled = true
    }
  }, [modeFull, user])

  // Jam "sekarang" yang diperbarui tiap 30 detik selama pembahasan
  // Akbar masih terkunci untuk user gratis, supaya kartu kunci
  // berubah jadi pembahasan begitu Senin 00:00 WIB lewat tanpa
  // perlu refresh halaman.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!modeFull || premium !== false) return
    const id = window.setInterval(() => setNowMs(Date.now()), 30000)
    return () => window.clearInterval(id)
  }, [modeFull, premium])

  // Kemenangan pertama (v2.8): hasil segar (bukan dari riwayat) +
  // ini tryout pertama di riwayat + belum pernah dirayakan.
  // Keputusan ditangkap sekali di state awal supaya kartu tidak
  // hilang saat render ulang setelah penanda ditulis.
  const [showFirstWin] = useState(
    () =>
      result !== null &&
      result.questions !== null &&
      !result.fromHistory &&
      tryoutHistory.length === 1 &&
      !hasCelebratedFirstWin(),
  )
  useEffect(() => {
    if (showFirstWin) markFirstWinCelebrated()
  }, [showFirstWin])

  // Status pengiriman skor ke leaderboard. Bila masih 'sending',
  // selesaikan dari promise pengiriman terakhir (fire-and-forget dari
  // TryoutPage) begitu janjinya beres.
  const initialStatus = result?.leaderboardStatus ?? null
  const [submitStatus, setSubmitStatus] =
    useState<LeaderboardSubmitStatus | null>(initialStatus)
  useEffect(() => {
    if (initialStatus !== 'sending') return
    let alive = true
    const promise = getLastSubmitPromise()
    if (!promise) {
      setSubmitStatus('failed')
      return
    }
    promise.then(
      (res) => {
        if (alive) setSubmitStatus(res.status)
      },
      () => {
        if (alive) setSubmitStatus('failed')
      },
    )
    return () => {
      alive = false
    }
  }, [initialStatus])

  if (!result) {
    return (
      <Card className="p-6 text-center">
        <p className="font-display text-lg font-bold">
          Belum ada hasil tryout nih
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink/60">
          Selesaikan satu tryout kilat atau Tryout Akbar dulu, nanti skor,
          status lulus per bagian, dan perkiraan kelolosanmu muncul di sini.
        </p>
        <Link to="/tryout" className="mt-4 inline-block">
          <Button>Ke halaman Tryout</Button>
        </Link>
      </Card>
    )
  }

  const { score, xpEarned, timedOut } = result
  // Soal + jawaban efektif: dari state (sesi segar / riwayat lokal)
  // atau dari jawaban attempt yang dimuat dari server (v2.12.1).
  const questions = result.questions ?? loadedAttempt?.questions ?? null
  const answers = result.answers ?? loadedAttempt?.answers ?? null
  const isFull = score.mode === 'full'
  // Momen pembahasan Akbar kebuka untuk user gratis (v2.12): Senin
  // 00:00 WIB setelah event tempat hasil ini selesai. Bila tanggal
  // hasil tidak ada (state lama), pakai Senin berikutnya supaya
  // kartu kunci tetap menyebut tanggal yang akan datang.
  const unlockAt = isFull
    ? (() => {
        const finished = result.finishedAt
          ? new Date(result.finishedAt)
          : null
        return finished !== null && !Number.isNaN(finished.getTime())
          ? akbarDiscussionUnlockAt(finished)
          : nextAkbarDiscussionUnlock()
      })()
    : null
  const discussionUnlockedForFree =
    unlockAt !== null && nowMs >= unlockAt.getTime()
  // Pembahasan tampil untuk tryout kilat (gratis), untuk Akbar bila
  // user premium, dan untuk Akbar user gratis setelah Senin 00:00
  // WIB. Saat status premium belum terbaca, pembahasan Akbar
  // disembunyikan dulu (bukan ditampilkan lalu ditarik).
  const showPembahasan =
    !isFull || premium === true || discussionUnlockedForFree
  const totalSoal = isFull ? SIMULASI_TOTAL_QUESTIONS : TRYOUT_TOTAL_QUESTIONS
  const totalCorrect = score.correct
    ? score.correct.TWK + score.correct.TIU + score.correct.TKP
    : null

  return (
    <div className="flex flex-col gap-5">
      {/* Tombol back (v2.9): kembali ke halaman Tryout. */}
      <StickyBackButton to="/tryout" />

      <header className="text-center">
        <Mascot
          mood={score.passedOverall ? 'semangat' : 'tekad'}
          size={80}
          className="mx-auto"
        />
        {/* Skor total besar di antara maskot dan judul (v2.11.1). Spasi
            setelah "Total" disengaja supaya teks halaman tetap memuat
            "Total 525/550" / "Total 120/150" (dipakai cek QA). */}
        <p className="mt-2 font-display leading-none">
          <span className="text-xs font-extrabold tracking-widest text-ink/50 uppercase">
            Total
          </span>{' '}
          <span className="mt-1 block text-6xl font-extrabold">
            {score.total}
            <span className="text-2xl font-bold text-ink/50">
              /{isFull ? 550 : 150}
            </span>
          </span>
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold">
          {score.passedOverall
            ? 'Selamat, kamu lulus!'
            : 'Belum lulus, terus berlatih ya!'}
        </h1>
        {(!isFull || totalCorrect !== null) && (
          <p className="mt-1 text-sm font-medium text-ink/60">
            {!isFull && <>terskala {score.scaledTotal}/550</>}
            {!isFull && totalCorrect !== null && ' · '}
            {totalCorrect !== null && (
              <>
                {totalCorrect} jawaban benar dari {totalSoal} soal
              </>
            )}
          </p>
        )}
        {timedOut && (
          <p className="mx-auto mt-2 w-fit rounded-full bg-accent-400 px-3 py-1 text-xs font-extrabold text-ink">
            Waktu habis, jawaban tersimpan otomatis
          </p>
        )}
        {xpEarned !== null && (
          <p className="mx-auto mt-2 w-fit rounded-full bg-primary-100 px-3 py-1 text-sm font-extrabold text-primary-700">
            +{xpEarned} XP
          </p>
        )}
        {result.eventRank && (
          <p className="mx-auto mt-2 w-fit rounded-full bg-accent-100 px-3 py-1 text-xs font-extrabold text-accent-700">
            Peringkat #{result.eventRank.rank} dari{' '}
            {result.eventRank.total} peserta di Akbar ini
          </p>
        )}
        {submitStatus && submitStatus !== 'mini' && (
          <p
            className={cx(
              'mx-auto mt-2 w-fit rounded-full px-3 py-1 text-xs font-extrabold',
              submitStatus === 'sent'
                ? 'bg-primary-100 text-primary-700'
                : 'bg-ink/5 text-ink/70',
            )}
          >
            {submitStatus === 'sent' && (
              <>
                Skormu udah masuk leaderboard minggu ini.{' '}
                <Link to="/leaderboard" className="underline underline-offset-2">
                  Lihat leaderboard
                </Link>
              </>
            )}
            {submitStatus === 'sending' &&
              'Mengirim skormu ke leaderboard...'}
            {submitStatus === 'failed' &&
              'Skormu belum kekirim, dicoba lagi otomatis nanti.'}
            {submitStatus === 'not-logged-in' && (
              <>
                Login dulu biar skormu masuk leaderboard.{' '}
                <Link to="/auth" className="underline underline-offset-2">
                  Masuk
                </Link>
              </>
            )}
            {submitStatus === 'not-configured' &&
              'Leaderboard online belum aktif, skormu hanya dicatat selama halaman ini terbuka.'}
          </p>
        )}
      </header>

      {showFirstWin && (
        <FirstWinCard
          heading="Kemenangan pertamamu!"
          body={
            isFull
              ? `Tryout Akbar pertamamu selesai dengan total ${score.total}/550. Bagikan hasilnya, siapa tahu temanmu ikut semangat latihan.`
              : `Tryout kilat pertamamu selesai dengan total ${score.total}/150. Bagikan hasilnya, siapa tahu temanmu ikut semangat latihan.`
          }
          shareText={tryoutShareText(score.mode, score.total)}
        />
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {MATERI_LIST.map((materi) => {
          const nilai = score.scores[materi]
          const scaled = score.scaled[materi]
          const passed = score.passed?.[materi] ?? false
          const maxSeksi = isFull
            ? ORIGINAL_MAX[materi]
            : TRYOUT_MAX_PER_SECTION
          const benarMax = isFull
            ? SIMULASI_QUESTIONS_PER_SECTION[materi]
            : TRYOUT_QUESTIONS_PER_SECTION
          return (
            <Card key={materi} className={MATERI_CARD[materi]}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge tone={MATERI_TONE[materi]}>{materi}</Badge>
                  <span className="text-sm font-semibold">
                    {MATERI_META[materi].nama}
                  </span>
                </div>
                <Badge
                  tone={passed ? 'green' : 'neutral'}
                  className="shrink-0"
                >
                  {passed ? 'Lulus' : 'Belum lulus'}
                </Badge>
              </div>
              <p className="mt-3 font-display text-2xl font-bold">
                {nilai}
                <span className="text-sm font-semibold text-ink/60">
                  /{maxSeksi}
                  {!isFull && (
                    <>
                      {' '}
                      · terskala {scaled}/{ORIGINAL_MAX[materi]}
                    </>
                  )}
                </span>
              </p>
              <ProgressBar
                value={nilai}
                max={maxSeksi}
                tone={MATERI_TONE[materi]}
                label={`Skor ${materi}`}
                className="mt-2"
              />
              <p className="mt-1.5 text-xs font-semibold text-ink/60">
                {isFull ? (
                  <>Passing grade: {ORIGINAL_PASSING[materi]}</>
                ) : (
                  <>
                    Passing grade mini: {TRYOUT_PASSING_MINI[materi]} ·
                    passing asli: {ORIGINAL_PASSING[materi]}
                  </>
                )}
                {score.correct
                  ? ` · benar: ${score.correct[materi]}/${benarMax}`
                  : ''}
              </p>
            </Card>
          )
        })}
      </div>

      {!questions && recordDate && !attemptLoadDone && (
        <section aria-label="Breakdown per soal">
          <h2 className="mb-2 font-display text-base font-extrabold">
            Hasil per soal
          </h2>
          <p className="text-sm font-medium text-ink/60">
            Memuat pembahasan...
          </p>
        </section>
      )}

      {questions && answers && (
        <section aria-label="Breakdown per soal">
          <h2 className="mb-2 font-display text-base font-extrabold">
            Hasil per soal
          </h2>
          {isFull && premium === false && !discussionUnlockedForFree && (
            <Card className="mb-3 border-accent-200 bg-accent-50 p-4">
              <p className="text-sm font-extrabold">
                Pembahasan lengkap kebuka hari Senin
              </p>
              <p className="mt-1 text-xs leading-relaxed font-medium text-ink/60">
                Skor dan nilai per bagianmu tetap tampil di atas.
                Pembahasan tiap opsi dari 110 soal ini kebuka untuk akun
                gratis mulai{' '}
                {unlockAt
                  ? `${formatDiscussionUnlockLabel(unlockAt)} jam 00:00 WIB`
                  : 'Senin depan'}
                . Aktifkan Premium untuk melihatnya sekarang juga, tanpa
                nunggu.
              </p>
              <Link to="/premium" className="mt-3 inline-block">
                <Button size="sm">Lihat Premium</Button>
              </Link>
            </Card>
          )}
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {questions.map((q, i) => {
              const answer = answers[q.id]
              const dijawab = answer !== undefined
              const benar = dijawab && answer === q.kunci
              const poin = scoreQuestion(q, answer)
              return (
                <div key={q.id} className="flex min-w-0 flex-col gap-2">
                  <Card className="py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={cx(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold',
                        q.materi === 'TKP'
                          ? poin >= 4
                            ? 'bg-primary-100 text-primary-700'
                            : poin >= 2
                              ? 'bg-accent-100 text-accent-700'
                              : 'bg-red-100 text-red-700'
                          : benar
                            ? 'bg-primary-100 text-primary-700'
                            : 'bg-red-100 text-red-700',
                      )}
                    >
                      {q.materi === 'TKP' ? (
                        poin
                      ) : benar ? (
                        <CheckIcon width={15} height={15} />
                      ) : (
                        '✕'
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm leading-snug font-semibold">
                        <span className="text-ink/60">Soal {i + 1}</span>
                        <Badge tone={MATERI_TONE[q.materi]}>
                          {q.materi}
                        </Badge>
                      </p>
                      <p className="mt-1 text-sm leading-relaxed break-words">
                        {q.soal.length > 160
                          ? `${q.soal.slice(0, 160)}…`
                          : q.soal}
                      </p>
                      <p className="mt-1.5 text-xs text-ink/60">
                        {q.materi === 'TKP' ? (
                          <>
                            {dijawab
                              ? `Kamu dapat ${poin}/5 poin (jawabanmu ${answer})`
                              : 'Tidak dijawab, 0 poin'}
                            {` · jawaban terbaik: ${q.kunci}`}
                          </>
                        ) : dijawab ? (
                          benar ? (
                            `Benar, jawabanmu ${answer}`
                          ) : (
                            `Jawabanmu ${answer} · kunci ${q.kunci}`
                          )
                        ) : (
                          `Tidak dijawab · kunci ${q.kunci}`
                        )}
                      </p>
                      {showPembahasan && (
                        <div className="mt-3">
                          <ExplanationPanel
                            question={q}
                            selected={answer}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  </Card>
                  {/* Diskusi per soal (v2.8): thread di bawah tiap
                      kartu ringkasan, supaya user bisa bertanya soal
                      soal ini langsung dari ulasan tryout. */}
                  <DiscussionThread questionId={q.id} mulaiTertutup />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Perkiraan kelolosan dari riwayat tryout (termasuk yang baru selesai) */}
      <PredictionPanel history={tryoutHistory} />

      <div className="flex flex-col gap-2">
        <Button size="lg" fullWidth onClick={() => navigate('/tryout')}>
          Tryout lagi
        </Button>
        <Button
          size="lg"
          variant="outline"
          fullWidth
          onClick={() => navigate('/')}
        >
          Ke beranda
        </Button>
      </div>
    </div>
  )
}
