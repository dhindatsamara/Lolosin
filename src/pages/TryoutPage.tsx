import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MATERI_LIST,
  MATERI_META,
  type Opsi,
  type Question,
} from '../lib/questions'
import {
  ORIGINAL_MAX,
  ORIGINAL_PASSING,
  pickTryoutQuestions,
  scoreTryout,
  TRYOUT_MAX_PER_SECTION,
  TRYOUT_PASSING_MINI,
  TRYOUT_QUESTIONS_PER_SECTION,
  TRYOUT_SCALE_TO_ORIGINAL,
  TRYOUT_TIME_LIMIT_MINUTES,
  TRYOUT_TIME_LIMIT_SECONDS,
  TRYOUT_TOTAL_QUESTIONS,
  type TryoutAnswers,
  type TryoutScore,
} from '../lib/quiz'
import {
  addXp,
  getStore,
  markSeen,
  recordActivity,
  recordTryout,
  useStore,
  XP_TRYOUT_COMPLETE,
  type TryoutRecord,
} from '../lib/store'
import { cx } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { QuestionCard } from '../components/quiz/QuestionCard'
import { TimerDisplay } from '../components/quiz/TimerDisplay'
import { TryoutPalette } from '../components/quiz/TryoutPalette'
import { ChevronRightIcon, ClockIcon } from '../components/icons'
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

/** Rekonstruksi TryoutScore dari satu entri riwayat (tanpa breakdown soal). */
function scoreFromRecord(record: TryoutRecord): TryoutScore {
  return {
    scores: { TWK: record.twk, TIU: record.tiu, TKP: record.tkp },
    scaled: {
      TWK: record.twk * TRYOUT_SCALE_TO_ORIGINAL.TWK,
      TIU: record.tiu * TRYOUT_SCALE_TO_ORIGINAL.TIU,
      TKP: record.tkp * TRYOUT_SCALE_TO_ORIGINAL.TKP,
    },
    passed: {
      TWK: record.twk >= TRYOUT_PASSING_MINI.TWK,
      TIU: record.tiu >= TRYOUT_PASSING_MINI.TIU,
      TKP: record.tkp >= TRYOUT_PASSING_MINI.TKP,
    },
    passedOverall: record.passed,
    correct: record.correct,
    total: record.twk + record.tiu + record.tkp,
    scaledTotal:
      record.twk * TRYOUT_SCALE_TO_ORIGINAL.TWK +
      record.tiu * TRYOUT_SCALE_TO_ORIGINAL.TIU +
      record.tkp * TRYOUT_SCALE_TO_ORIGINAL.TKP,
  }
}

/**
 * Halaman tryout mini: mode info (aturan, passing grade, riwayat) dan
 * mode jalan (timer 27 menit, palet navigator, navigasi bebas) dalam satu
 * halaman. Saat selesai, hasilnya dikirim ke `/tryout/hasil`.
 */
export function TryoutPage() {
  const navigate = useNavigate()
  const { tryoutHistory } = useStore()
  const [mode, setMode] = useState<Mode>('info')
  const [startError, setStartError] = useState<string | null>(null)

  // State sesi jalan
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

  const finish = useCallback(
    (timedOut: boolean) => {
      if (finishedRef.current) return
      finishedRef.current = true
      const qs = questionsRef.current
      const ans = answersRef.current
      const score = scoreTryout(qs, ans)
      recordTryout({
        twk: score.scores.TWK,
        tiu: score.scores.TIU,
        tkp: score.scores.TKP,
        passed: score.passedOverall,
        correct: score.correct,
      })
      markSeen(qs.map((q) => q.id))
      addXp(XP_TRYOUT_COMPLETE)
      recordActivity()
      const state: TryoutResultState = {
        score,
        questions: qs,
        answers: ans,
        xpEarned: XP_TRYOUT_COMPLETE,
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

  function startTryout() {
    const pick = pickTryoutQuestions(getStore().seenQuestionIds)
    if (pick.questions.length === 0) {
      setStartError('Bank soal masih kosong — tryout belum bisa dimulai.')
      return
    }
    setStartError(null)
    setQuestions(pick.questions)
    setRotated(pick.rotated)
    setAnswers({})
    setDoubted(new Set())
    setCurrentIndex(0)
    setSecondsLeft(TRYOUT_TIME_LIMIT_SECONDS)
    setShowConfirm(false)
    setShowPalette(true)
    finishedRef.current = false
    recordActivity()
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
            <span className="text-xs font-bold text-ink/60">
              {answeredCount}/{total} dijawab
            </span>
            <button
              type="button"
              onClick={cancelTryout}
              className="text-xs font-semibold text-red-700 hover:underline"
            >
              Batalkan
            </button>
          </div>
        </header>

        {rotated && (
          <p className="rounded-xl bg-accent-50 px-3 py-2 text-xs font-medium text-accent-700">
            Soal baru habis — mengulang dari awal.
          </p>
        )}

        <Card padding="none" className="overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPalette((v) => !v)}
            aria-expanded={showPalette}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="text-sm font-bold">Navigator soal</span>
            <ChevronRightIcon
              width={18}
              height={18}
              className={cx(
                'text-ink/50 transition-transform',
                showPalette && 'rotate-90',
              )}
            />
          </button>
          {showPalette && (
            <div className="border-t border-ink/10 px-4 py-3">
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
            ? 'Ragu-ragu — ketuk untuk membatalkan'
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
          <Card className="border-amber-600/40 bg-accent-50">
            <p className="font-display text-base font-bold">
              Selesaikan tryout?
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink/70">
              {unansweredCount === 0
                ? 'Semua soal sudah dijawab. Skor akan dihitung dan disimpan.'
                : `Masih ada ${unansweredCount} soal belum dijawab — soal kosong bernilai 0.`}
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
        <h1 className="text-2xl font-bold">Tryout Mini</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          Simulasi SKD singkat: {TRYOUT_TOTAL_QUESTIONS} soal dalam{' '}
          {TRYOUT_TIME_LIMIT_MINUTES} menit. Skor diskalakan ke nilai CAT
          asli.
        </p>
      </header>

      <Card className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-100 text-accent-700">
          <ClockIcon width={22} height={22} />
        </span>
        <div className="text-sm">
          <p className="font-bold">
            {TRYOUT_TOTAL_QUESTIONS} soal · {TRYOUT_TIME_LIMIT_MINUTES} menit
          </p>
          <p className="text-ink/60">
            {TRYOUT_QUESTIONS_PER_SECTION} soal per seksi · maks{' '}
            {TRYOUT_MAX_PER_SECTION} poin per seksi
          </p>
        </div>
      </Card>

      <section aria-label="Aturan tryout">
        <h2 className="mb-2 text-sm font-bold text-ink/70">Aturan main</h2>
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
              Timer {TRYOUT_TIME_LIMIT_MINUTES} menit berjalan terus — jawaban
              tersimpan otomatis saat waktu habis.
            </li>
            <li>
              Kamu bebas pindah soal lewat navigator, dan boleh menandai soal
              yang ragu-ragu.
            </li>
            <li>
              Selesaikan tryout untuk mendapat{' '}
              <strong>+{XP_TRYOUT_COMPLETE} XP</strong>.
            </li>
          </ul>
        </Card>
      </section>

      <section aria-label="Passing grade">
        <h2 className="mb-2 text-sm font-bold text-ink/70">
          Passing grade mini (proporsional dari passing grade asli)
        </h2>
        <div className="flex flex-col gap-2">
          {MATERI_LIST.map((materi) => (
            <Card
              key={materi}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="flex items-center gap-2">
                <Badge tone={MATERI_TONE[materi]}>{materi}</Badge>
                <span className="text-sm font-medium">
                  {MATERI_META[materi].nama}
                </span>
              </div>
              <p className="text-sm font-bold">
                ≥ {TRYOUT_PASSING_MINI[materi]}
                <span className="ml-1 text-xs font-medium text-ink/50">
                  (asli {ORIGINAL_PASSING[materi]}/{ORIGINAL_MAX[materi]},
                  skala ×{TRYOUT_SCALE_TO_ORIGINAL[materi]})
                </span>
              </p>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink/50">
          Lulus keseluruhan berarti ketiga seksi melewati passing grade-nya.
          Passing grade asli merujuk KepmenPANRB 406/2026.
        </p>
      </section>

      {historyNewestFirst.length > 0 && (
        <section aria-label="Riwayat tryout">
          <h2 className="mb-2 text-sm font-bold text-ink/70">
            Riwayat tryout
          </h2>
          <div className="flex flex-col gap-2">
            {historyNewestFirst.map((record, i) => (
              <Card key={`${record.date}-${i}`} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-bold">
                      {new Date(record.date).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}{' '}
                      <span className="font-medium text-ink/50">
                        {new Date(record.date).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </p>
                    <p className="mt-0.5 text-ink/60">
                      TWK {record.twk} · TIU {record.tiu} · TKP {record.tkp} ·
                      total {record.twk + record.tiu + record.tkp}/150
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
            ))}
          </div>
        </section>
      )}

      <Button size="lg" fullWidth onClick={startTryout}>
        Mulai tryout
      </Button>
      {startError && (
        <p className="text-center text-sm font-medium text-red-700">
          {startError}
        </p>
      )}
    </div>
  )
}
