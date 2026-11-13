import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MATERI_LIST,
  MATERI_META,
  type Materi,
  type Opsi,
  type Question,
} from '../lib/questions'
import {
  ORIGINAL_MAX,
  ORIGINAL_PASSING,
  pickTryoutQuestions,
  scoreFromRecord,
  scoreTryout,
  SIMULASI_QUESTIONS_PER_SECTION,
  SIMULASI_TIME_LIMIT_MINUTES,
  SIMULASI_TIME_LIMIT_SECONDS,
  SIMULASI_TOTAL_QUESTIONS,
  TRYOUT_MAX_PER_SECTION,
  TRYOUT_PASSING_MINI,
  TRYOUT_QUESTIONS_PER_SECTION,
  TRYOUT_SCALE_TO_ORIGINAL,
  TRYOUT_TIME_LIMIT_MINUTES,
  TRYOUT_TIME_LIMIT_SECONDS,
  TRYOUT_TOTAL_QUESTIONS,
  type TryoutAnswers,
  type TryoutMode,
} from '../lib/quiz'
import {
  getStore,
  markSeen,
  useStore,
  XP_SIMULASI_COMPLETE,
  XP_TRYOUT_COMPLETE,
  type TryoutRecord,
} from '../lib/store'
import {
  completeTryout,
  recordDailyActivity,
} from '../lib/gamification'
import { recordAnswer } from '../lib/review'
import { cx } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { QuestionCard } from '../components/quiz/QuestionCard'
import { TimerDisplay } from '../components/quiz/TimerDisplay'
import { TryoutPalette } from '../components/quiz/TryoutPalette'
import { ChevronRightIcon, ClockIcon, TrophyIcon } from '../components/icons'
import type { TryoutResultState } from './TryoutHasilPage'

/** Ikon bendera kecil (gaya garis Lucide) untuk tombol ragu-ragu. */
function FlagIcon({ width = 24, height = 24 }: { width?: number; height?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" x2="4" y1="22" y2="15" />
    </svg>
  )
}

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

type Mode = 'info' | 'running'

/** Label mode yang tampil di kartu pilihan dan header sesi jalan. */
const MODE_LABEL: Record<TryoutMode, string> = {
  mini: 'Tryout kilat',
  full: 'Simulasi CAT',
}

/** Label mode di tengah kalimat (akronim CAT tetap kapital). */
const MODE_LABEL_KALIMAT: Record<TryoutMode, string> = {
  mini: 'tryout kilat',
  full: 'simulasi CAT',
}

/** Label mode di riwayat (riwayat lama disebut tryout mini). */
const HISTORY_LABEL: Record<TryoutMode, string> = {
  mini: 'Tryout mini',
  full: 'Simulasi CAT',
}

/** Total maksimum satu mode: 150 untuk mini, 550 untuk simulasi. */
const MODE_MAX_TOTAL: Record<TryoutMode, number> = {
  mini: TRYOUT_MAX_PER_SECTION * 3,
  full:
    ORIGINAL_MAX.TWK + ORIGINAL_MAX.TIU + ORIGINAL_MAX.TKP,
}

function timeLimitSeconds(mode: TryoutMode): number {
  return mode === 'full'
    ? SIMULASI_TIME_LIMIT_SECONDS
    : TRYOUT_TIME_LIMIT_SECONDS
}

function xpForMode(mode: TryoutMode): number {
  return mode === 'full' ? XP_SIMULASI_COMPLETE : XP_TRYOUT_COMPLETE
}

/** Mode satu entri riwayat; riwayat lama (tanpa field mode) = mini. */
function recordMode(record: TryoutRecord): TryoutMode {
  return record.mode ?? 'mini'
}

/** Satu baris passing grade per seksi, dipakai kedua kelompok. */
function PassingCard({
  materi,
  passing,
  max,
  note,
}: {
  materi: Materi
  passing: number
  max: number
  note?: string
}) {
  return (
    <Card
      className={cx(
        'flex items-center justify-between gap-3 py-3',
        materi === 'TWK'
          ? 'bg-twk-soft'
          : materi === 'TIU'
            ? 'bg-tiu-soft'
            : 'bg-tkp-soft',
      )}
    >
      <div className="flex items-center gap-2">
        <Badge tone={MATERI_TONE[materi]}>{materi}</Badge>
        <span className="text-sm font-semibold">
          {MATERI_META[materi].nama}
        </span>
      </div>
      <p className="shrink-0 text-sm font-extrabold">
        ≥ {passing}
        <span className="ml-1 text-xs font-semibold text-ink/60">
          dari {max}
          {note ? `, ${note}` : ''}
        </span>
      </p>
    </Card>
  )
}

/**
 * Halaman tryout: mode info (pilih mode, aturan, passing grade,
 * riwayat) dan mode jalan (timer, palet navigator, navigasi bebas)
 * dalam satu halaman. Dua mode tryout: kilat (30 soal, 27 menit)
 * dan simulasi CAT (110 soal, 100 menit). Sesi jalan
 * diparameterisasi dari mode yang dipilih, tanpa duplikasi logika.
 * Saat selesai, hasilnya dikirim ke `/tryout/hasil`.
 */
export function TryoutPage() {
  const navigate = useNavigate()
  const { tryoutHistory } = useStore()
  const [mode, setMode] = useState<Mode>('info')
  const [startError, setStartError] = useState<string | null>(null)

  // State sesi jalan
  const [tryoutMode, setTryoutMode] = useState<TryoutMode>('mini')
  const [questions, setQuestions] = useState<Question[]>([])
  const [rotated, setRotated] = useState(false)
  const [answers, setAnswers] = useState<TryoutAnswers>({})
  const [doubted, setDoubted] = useState<ReadonlySet<string>>(new Set())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(
    TRYOUT_TIME_LIMIT_SECONDS,
  )
  const [showConfirm, setShowConfirm] = useState(false)
  const [showPalette, setShowPalette] = useState(true)
  const finishedRef = useRef(false)

  // Ref agar auto-submit dari timer selalu memakai jawaban terbaru.
  const answersRef = useRef(answers)
  answersRef.current = answers
  const questionsRef = useRef(questions)
  questionsRef.current = questions
  const tryoutModeRef = useRef(tryoutMode)
  tryoutModeRef.current = tryoutMode

  const finish = useCallback(
    (timedOut: boolean) => {
      if (finishedRef.current) return
      finishedRef.current = true
      const qs = questionsRef.current
      const ans = answersRef.current
      const sessionMode = tryoutModeRef.current
      const score = scoreTryout(qs, ans, sessionMode)
      completeTryout(score)
      markSeen(qs.map((q) => q.id))
      // Catat tiap jawaban untuk antrean ulas + tally per subtopik.
      // Benar = jawaban sama dengan kunci (TKP: opsi terbaik); soal
      // kosong dihitung salah.
      for (const q of qs) {
        const answer = ans[q.id]
        recordAnswer(q, answer !== undefined && answer === q.kunci)
      }
      const state: TryoutResultState = {
        score,
        questions: qs,
        answers: ans,
        xpEarned: xpForMode(sessionMode),
        timedOut,
      }
      navigate('/tryout/hasil', { state })
    },
    [navigate],
  )

  // Hitung mundur selama sesi berjalan.
  useEffect(() => {
    if (mode !== 'running') return
    const id = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [mode])

  // Auto-submit saat waktu habis.
  useEffect(() => {
    if (mode === 'running' && secondsLeft === 0) {
      finish(true)
    }
  }, [mode, secondsLeft, finish])

  function startTryout(sessionMode: TryoutMode) {
    const pick = pickTryoutQuestions(getStore().seenQuestionIds, sessionMode)
    if (pick.questions.length === 0) {
      setStartError('Bank soalnya masih kosong, tryout belum bisa dimulai.')
      return
    }
    setStartError(null)
    setTryoutMode(sessionMode)
    tryoutModeRef.current = sessionMode
    setQuestions(pick.questions)
    setRotated(pick.rotated)
    setAnswers({})
    setDoubted(new Set())
    setCurrentIndex(0)
    setSecondsLeft(timeLimitSeconds(sessionMode))
    setShowConfirm(false)
    setShowPalette(true)
    finishedRef.current = false
    recordDailyActivity()
    setMode('running')
    window.scrollTo({ top: 0 })
  }

  function cancelTryout() {
    setMode('info')
    setShowConfirm(false)
  }

  if (mode === 'running') {
    const question = questions[currentIndex]
    const total = questions.length
    const answeredCount = Object.keys(answers).length
    const unansweredCount = total - answeredCount

    function selectAnswer(opsi: Opsi) {
      setAnswers((prev) => ({ ...prev, [question.id]: opsi }))
    }

    function toggleDoubt() {
      setDoubted((prev) => {
        const next = new Set(prev)
        if (next.has(question.id)) {
          next.delete(question.id)
        } else {
          next.add(question.id)
        }
        return next
      })
    }

    function goTo(index: number) {
      setCurrentIndex(Math.min(total - 1, Math.max(0, index)))
      window.scrollTo({ top: 0 })
    }

    return (
      <div className="flex flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <TimerDisplay secondsLeft={secondsLeft} />
          <div className="flex items-center gap-2">
            <span className="rounded-full border-2 border-ink bg-accent-400 px-2.5 py-1 text-xs font-extrabold whitespace-nowrap text-ink shadow-sticker-sm">
              {MODE_LABEL[tryoutMode]}
            </span>
            <span className="rounded-full border-2 border-ink bg-white px-2.5 py-1 text-xs font-extrabold whitespace-nowrap text-ink shadow-sticker-sm">
              {answeredCount}/{total} dijawab
            </span>
            <button
              type="button"
              onClick={cancelTryout}
              className="text-xs font-bold text-red-700 hover:underline"
            >
              Batalkan
            </button>
          </div>
        </header>

        {rotated && (
          <p className="rounded-xl border-2 border-ink bg-accent-100 px-3 py-2 text-xs font-bold text-accent-800">
            Soal baru habis, jadi mulai mengulang dari awal.
          </p>
        )}

        <Card padding="none" className="overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPalette((v) => !v)}
            aria-expanded={showPalette}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm font-extrabold">Navigator soal</span>
            <ChevronRightIcon
              width={18}
              height={18}
              className={cx(
                'text-ink/60 transition-transform',
                showPalette && 'rotate-90',
              )}
            />
          </button>
          {showPalette && (
            <div className="border-t-2 border-ink px-4 py-3">
              <TryoutPalette
                questions={questions}
                answers={answers}
                doubted={doubted}
                currentIndex={currentIndex}
                onSelect={goTo}
              />
            </div>
          )}
        </Card>

        <Card>
          <QuestionCard
            question={question}
            nomor={currentIndex + 1}
            total={total}
            selected={answers[question.id]}
            revealed={false}
            onSelect={selectAnswer}
            showMateriBadge
          />
        </Card>

        <Button
          variant={doubted.has(question.id) ? 'secondary' : 'outline'}
          fullWidth
          onClick={toggleDoubt}
        >
          <FlagIcon width={16} height={16} />
          {doubted.has(question.id)
            ? 'Ragu-ragu, ketuk untuk membatalkan'
            : 'Tandai ragu-ragu'}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => goTo(currentIndex - 1)}
            disabled={currentIndex === 0}
          >
            ← Sebelumnya
          </Button>
          <Button
            variant="outline"
            onClick={() => goTo(currentIndex + 1)}
            disabled={currentIndex === total - 1}
          >
            Berikutnya →
          </Button>
        </div>

        {showConfirm ? (
          <Card className="bg-accent-100 shadow-sticker-amber">
            <p className="font-display text-base font-extrabold">
              Selesaikan {MODE_LABEL_KALIMAT[tryoutMode]}?
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink/70">
              {unansweredCount === 0
                ? 'Semua soal beres! Skor langsung dihitung dan disimpan.'
                : `Masih ada ${unansweredCount} soal belum dijawab, dan soal kosong bernilai 0.`}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setShowConfirm(false)}>
                Lanjut mengerjakan
              </Button>
              <Button onClick={() => finish(false)}>Ya, selesaikan</Button>
            </div>
          </Card>
        ) : (
          <Button size="lg" fullWidth onClick={() => setShowConfirm(true)}>
            Selesai & lihat hasil
          </Button>
        )}
      </div>
    )
  }

  const historyNewestFirst = [...tryoutHistory].reverse()

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="font-script text-2xl leading-none text-primary-700">
          simulasi beneran, deg-degan beneran
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">
          Tryout & Simulasi
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          Dua mode, satu tujuan: lolos SKD. Pemanasan kilat 30 soal,
          atau simulasi CAT 110 soal persis ujian beneran.
        </p>
      </header>

      <section aria-label="Pilih mode tryout">
        <h2 className="mb-2 font-display text-base font-extrabold">
          Pilih modemu
        </h2>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => startTryout('mini')}
            className="w-full rounded-2xl border-2 border-ink bg-white p-4 text-left shadow-sticker transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-primary-100 text-primary-700 shadow-sticker-sm">
                <ClockIcon width={22} height={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-extrabold">
                  Tryout kilat
                </p>
                <p className="text-xs font-semibold text-ink/60">
                  Buat pemanasan, cepat dan ringan
                </p>
                <p className="mt-1.5 text-sm font-bold">
                  {TRYOUT_TOTAL_QUESTIONS} soal · {TRYOUT_TIME_LIMIT_MINUTES}{' '}
                  menit · +{XP_TRYOUT_COMPLETE} XP
                </p>
                <p className="mt-0.5 text-xs leading-relaxed font-medium text-ink/60">
                  {TRYOUT_QUESTIONS_PER_SECTION} soal per seksi · passing
                  grade mini TWK ≥{TRYOUT_PASSING_MINI.TWK} · TIU ≥
                  {TRYOUT_PASSING_MINI.TIU} · TKP ≥{TRYOUT_PASSING_MINI.TKP}{' '}
                  (maks {TRYOUT_MAX_PER_SECTION} per seksi)
                </p>
              </div>
            </div>
            <span className="mt-3 inline-flex items-center gap-1 rounded-full border-2 border-ink bg-primary-600 px-4 py-2 text-sm font-extrabold text-white shadow-sticker-sm">
              Mulai tryout kilat
              <ChevronRightIcon width={16} height={16} />
            </span>
          </button>

          <button
            type="button"
            onClick={() => startTryout('full')}
            className="w-full rounded-2xl border-2 border-ink bg-accent-100 p-4 text-left shadow-sticker-amber transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-accent-400 text-ink shadow-sticker-sm">
                <TrophyIcon width={22} height={22} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-display text-lg font-extrabold">
                  Simulasi CAT
                  <span className="rounded-full border-2 border-ink bg-white px-2 py-0.5 font-sans text-[11px] font-extrabold text-ink shadow-sticker-sm">
                    Suasana ujian beneran
                  </span>
                </p>
                <p className="text-xs font-semibold text-ink/60">
                  Jumlah soal dan waktu persis SKD asli
                </p>
                <p className="mt-1.5 text-sm font-bold">
                  {SIMULASI_TOTAL_QUESTIONS} soal ·{' '}
                  {SIMULASI_TIME_LIMIT_MINUTES} menit · +{XP_SIMULASI_COMPLETE}{' '}
                  XP
                </p>
                <p className="mt-0.5 text-xs leading-relaxed font-medium text-ink/60">
                  TWK {SIMULASI_QUESTIONS_PER_SECTION.TWK} · TIU{' '}
                  {SIMULASI_QUESTIONS_PER_SECTION.TIU} · TKP{' '}
                  {SIMULASI_QUESTIONS_PER_SECTION.TKP} soal · passing grade
                  asli TWK ≥{ORIGINAL_PASSING.TWK} · TIU ≥
                  {ORIGINAL_PASSING.TIU} · TKP ≥{ORIGINAL_PASSING.TKP}
                </p>
              </div>
            </div>
            <span className="mt-3 inline-flex items-center gap-1 rounded-full border-2 border-ink bg-ink px-4 py-2 text-sm font-extrabold text-white shadow-sticker-sm">
              Mulai simulasi CAT
              <ChevronRightIcon width={16} height={16} />
            </span>
          </button>
        </div>
        {startError && (
          <p className="mt-2 text-center text-sm font-medium text-red-700">
            {startError}
          </p>
        )}
      </section>

      <section aria-label="Aturan tryout">
        <h2 className="mb-2 font-display text-base font-extrabold">Aturan main</h2>
        <Card>
          <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-ink/80">
            <li>
              <strong>TWK & TIU:</strong> jawaban benar = 5 poin,
              salah/kosong = 0.
            </li>
            <li>
              <strong>TKP:</strong> tiap opsi bernilai 1–5 poin sesuai bobot
              karakternya.
            </li>
            <li>
              Timer berjalan terus: {TRYOUT_TIME_LIMIT_MINUTES} menit untuk
              tryout kilat, {SIMULASI_TIME_LIMIT_MINUTES} menit untuk
              simulasi CAT. Jawabanmu tersimpan otomatis kalau waktu habis.
            </li>
            <li>
              Kamu bebas pindah soal lewat navigator, dan boleh menandai soal
              yang ragu-ragu.
            </li>
            <li>
              Selesaikan tryout dan dapat{' '}
              <strong>
                +{XP_TRYOUT_COMPLETE} XP (kilat) atau +{XP_SIMULASI_COMPLETE} XP
                (simulasi CAT)
              </strong>
              .
            </li>
          </ul>
        </Card>
      </section>

      <section aria-label="Passing grade">
        <h2 className="mb-2 font-display text-base font-extrabold">
          Passing grade
        </h2>
        <p className="mb-2 text-sm font-bold text-ink/70">
          Tryout kilat (skor mini)
        </p>
        <div className="flex flex-col gap-2">
          {MATERI_LIST.map((materi) => (
            <PassingCard
              key={`mini-${materi}`}
              materi={materi}
              passing={TRYOUT_PASSING_MINI[materi]}
              max={TRYOUT_MAX_PER_SECTION}
              note={`skala ×${TRYOUT_SCALE_TO_ORIGINAL[materi]}`}
            />
          ))}
        </div>
        <p className="mt-4 mb-2 text-sm font-bold text-ink/70">
          Simulasi CAT (passing grade asli)
        </p>
        <div className="flex flex-col gap-2">
          {MATERI_LIST.map((materi) => (
            <PassingCard
              key={`asli-${materi}`}
              materi={materi}
              passing={ORIGINAL_PASSING[materi]}
              max={ORIGINAL_MAX[materi]}
            />
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed font-medium text-ink/60">
          Biar lulus keseluruhan, ketiga seksi harus melewati passing
          grade-nya masing-masing. Passing grade aslinya dari KepmenPANRB
          406/2026.
        </p>
      </section>

      {historyNewestFirst.length > 0 && (
        <section aria-label="Riwayat tryout">
          <h2 className="mb-2 font-display text-base font-extrabold">
            Riwayat tryout
          </h2>
          <div className="flex flex-col gap-2">
            {historyNewestFirst.map((record, i) => {
              const sessionMode = recordMode(record)
              const total = record.twk + record.tiu + record.tkp
              return (
                <Card key={`${record.date}-${i}`} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <p className="font-extrabold">
                        {new Date(record.date).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}{' '}
                        <span className="font-semibold text-ink/60">
                          {new Date(record.date).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </p>
                      <p className="mt-0.5 font-medium text-ink/60">
                        <span className="font-extrabold text-ink">
                          {HISTORY_LABEL[sessionMode]}
                        </span>{' '}
                        · TWK {record.twk} · TIU {record.tiu} · TKP{' '}
                        {record.tkp} · total {total}/
                        {MODE_MAX_TOTAL[sessionMode]}
                      </p>
                    </div>
                    <Badge tone={record.passed ? 'green' : 'neutral'}>
                      {record.passed ? 'Lulus' : 'Belum lulus'}
                    </Badge>
                  </div>
                  <Link
                    to="/tryout/hasil"
                    state={scoreFromRecord(record)}
                    className="mt-2 inline-block text-sm font-semibold text-primary-700 hover:underline"
                  >
                    Lihat hasil
                  </Link>
                </Card>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
