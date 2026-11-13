import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { isMateri, type Materi, type Opsi } from '../lib/questions'
import {
  DRILL_DEFAULT_COUNT,
  pickDrillQuestions,
  scoreQuestion,
  type DrillPick,
  type TryoutAnswers,
} from '../lib/quiz'
import {
  getStore,
  markSeen,
  XP_DRILL_COMPLETE,
  XP_DRILL_CORRECT,
} from '../lib/store'
import {
  completeDrill,
  recordDailyActivity,
  recordDrillCorrect,
} from '../lib/gamification'
import { cx } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { QuestionCard } from '../components/quiz/QuestionCard'
import { CheckIcon, ChevronRightIcon } from '../components/icons'

interface DrillState {
  materi?: unknown
  subtopik?: unknown
}

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

/**
 * Sesi drill 10 soal: satu soal per layar, feedback langsung setelah
 * memilih, lalu pembahasan per opsi. +10 XP per jawaban benar, +50 XP
 * saat sesi selesai. Soal baru selalu didahulukan (anti-ulang).
 */
export function LatihanJalanPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state ?? {}) as DrillState

  const materi: Materi | null = isMateri(
    typeof state.materi === 'string' ? state.materi : undefined,
  )
    ? (state.materi as Materi)
    : null
  const subtopik = typeof state.subtopik === 'string' ? state.subtopik : null

  // Soal dipilih sekali saat sesi dimulai, bukan per render, supaya
  // markSeen selama sesi tidak mengubah set soal.
  const [session, setSession] = useState<DrillPick | null>(() => {
    if (!materi) return null
    return pickDrillQuestions(
      materi,
      subtopik,
      DRILL_DEFAULT_COUNT,
      getStore().seenQuestionIds,
    )
  })
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<TryoutAnswers>({})
  const [xpEarned, setXpEarned] = useState(0)
  const [finished, setFinished] = useState(false)
  const finishedRef = useRef(false)
  // Kilas "+10 XP" saat jawaban benar (angka = kunci animasi ulang).
  const [xpFlashKey, setXpFlashKey] = useState(0)
  const [showXpFlash, setShowXpFlash] = useState(false)

  // Catat aktivitas (streak) saat sesi dimulai.
  useEffect(() => {
    recordDailyActivity()
  }, [])

  // Kilas +XP hilang sendiri setelah 1,5 detik.
  useEffect(() => {
    if (xpFlashKey === 0) return
    setShowXpFlash(true)
    const timer = setTimeout(() => setShowXpFlash(false), 1500)
    return () => clearTimeout(timer)
  }, [xpFlashKey])

  if (!materi || !session) {
    return (
      <Card className="p-6 text-center">
        <p className="font-display text-lg font-bold">
          Ups, sesinya belum dipilih
        </p>
        <p className="mt-2 text-sm text-ink/60">
          Pilih materi dan topik dulu di halaman Latihan, baru mulai drill.
        </p>
        <Link to="/latihan" className="mt-4 inline-block">
          <Button>Ke halaman Latihan</Button>
        </Link>
      </Card>
    )
  }

  if (session.questions.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="font-display text-lg font-bold">
          Nggak ada soal buat topik ini
        </p>
        <p className="mt-2 text-sm text-ink/60">
          Coba topik lain, atau pilih &ldquo;Semua topik&rdquo; aja.
        </p>
        <Link to="/latihan" className="mt-4 inline-block">
          <Button>Ke halaman Latihan</Button>
        </Link>
      </Card>
    )
  }

  const questions = session.questions
  const total = questions.length
  const question = questions[index]
  const selected = answers[question.id]
  const revealed = selected !== undefined
  const isLast = index === total - 1
  const answeredCount = Object.keys(answers).length

  function handleSelect(opsi: Opsi) {
    if (revealed) return
    setAnswers((prev) => ({ ...prev, [question.id]: opsi }))
    markSeen([question.id])
    // "Benar" = jawaban sama dengan kunci; untuk TKP berarti opsi terbaik.
    if (opsi === question.kunci) {
      recordDrillCorrect()
      setXpEarned((xp) => xp + XP_DRILL_CORRECT)
      setXpFlashKey((k) => k + 1)
    }
  }

  function handleFinish() {
    if (finishedRef.current) return
    finishedRef.current = true
    const correctCount = questions.filter(
      (q) => answers[q.id] !== undefined && answers[q.id] === q.kunci,
    ).length
    completeDrill(materi as Materi, correctCount, total)
    setXpEarned((xp) => xp + XP_DRILL_COMPLETE)
    setFinished(true)
  }

  function handleNext() {
    if (!revealed) return
    if (isLast) {
      handleFinish()
    } else {
      setIndex((i) => i + 1)
    }
  }

  function handleAgain() {
    const fresh = pickDrillQuestions(
      materi as Materi,
      subtopik,
      DRILL_DEFAULT_COUNT,
      getStore().seenQuestionIds,
    )
    setSession(fresh)
    setIndex(0)
    setAnswers({})
    setXpEarned(0)
    setFinished(false)
    finishedRef.current = false
    recordDailyActivity()
  }

  if (finished) {
    const correctCount = questions.filter(
      (q) => answers[q.id] !== undefined && answers[q.id] === q.kunci,
    ).length
    const correctXp = correctCount * XP_DRILL_CORRECT
    return (
      <div className="flex flex-col gap-5">
        <header className="text-center">
          <p className="text-4xl" aria-hidden="true">
            🎉
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">Sesi selesai!</h1>
          <p className="mt-1 text-sm font-medium text-ink/60">
            Drill {materi}
            {subtopik ? ` · ${subtopik}` : ''}
          </p>
        </header>

        <Card className="text-center">
          <p className="font-display text-4xl font-extrabold">
            <span className="hl-marker">{correctCount}</span>
            <span className="text-lg font-semibold text-ink/60">/{total}</span>
          </p>
          <p className="mt-1 text-sm font-semibold text-ink/60">
            jawaban benar
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-accent-400 px-3 py-1 text-sm font-extrabold text-ink shadow-sticker-sm">
            +{xpEarned} XP
          </p>
          <p className="mt-2 text-xs font-medium text-ink/60">
            {correctCount} jawaban benar × {XP_DRILL_CORRECT} XP = {correctXp}{' '}
            XP, plus bonus selesai {XP_DRILL_COMPLETE} XP
          </p>
        </Card>

        <section aria-label="Ringkasan jawaban">
          <h2 className="mb-2 font-display text-base font-extrabold">
            Ringkasan jawaban
          </h2>
          <div className="flex flex-col gap-2">
            {questions.map((q, i) => {
              const answer = answers[q.id]
              const benar = answer !== undefined && answer === q.kunci
              const poin =
                q.materi === 'TKP' ? scoreQuestion(q, answer) : null
              return (
                <Card key={q.id} className="flex items-start gap-3 py-3">
                  <span
                    className={cx(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink text-sm font-extrabold',
                      benar
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-red-100 text-red-700',
                    )}
                  >
                    {benar ? <CheckIcon width={15} height={15} /> : '✕'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug font-semibold">
                      <span className="text-ink/60">Soal {i + 1} · </span>
                      {q.soal.length > 90
                        ? `${q.soal.slice(0, 90)}…`
                        : q.soal}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-ink/60">
                      {poin !== null
                        ? `Kamu dapat ${poin}/5 poin`
                        : benar
                          ? 'Benar'
                          : `Jawabanmu ${answer ?? 'kosong'} · kunci ${q.kunci}`}
                    </p>
                  </div>
                  <Badge tone={MATERI_TONE[q.materi]} className="shrink-0">
                    {q.materi}
                  </Badge>
                </Card>
              )
            })}
          </div>
        </section>

        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth onClick={handleAgain}>
            Latihan lagi (soal baru)
          </Button>
          <Button
            size="lg"
            variant="outline"
            fullWidth
            onClick={() => navigate('/latihan')}
          >
            Kembali ke Latihan
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link
          to="/latihan"
          className="text-sm font-semibold text-primary-700 hover:underline"
        >
          ← Akhiri sesi & pilih sesi lain
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 font-display text-3xl font-extrabold">
          Drill {materi}
          {subtopik && (
            <span className="text-base font-semibold text-ink/60">
              · {subtopik}
            </span>
          )}
        </h1>
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar
            value={answeredCount}
            max={total}
            tone={MATERI_TONE[materi]}
            label="Progres drill"
            className="flex-1"
          />
          <span className="shrink-0 text-xs font-extrabold whitespace-nowrap text-ink/60">
            Soal {index + 1} dari {total}
          </span>
        </div>
        {session.rotated && (
          <p className="mt-2 rounded-xl border-2 border-ink bg-accent-100 px-3 py-2 text-xs font-bold text-accent-800">
            Soal baru habis, jadi mulai mengulang dari awal.
          </p>
        )}
      </header>

      <Card>
        <QuestionCard
          question={question}
          nomor={index + 1}
          total={total}
          selected={selected}
          revealed={revealed}
          onSelect={handleSelect}
        />
      </Card>

      <Button
        size="lg"
        fullWidth
        onClick={handleNext}
        disabled={!revealed}
      >
        {isLast ? 'Lihat hasil' : 'Soal berikutnya'}
        <ChevronRightIcon width={18} height={18} />
      </Button>
      {!revealed && (
        <p className="-mt-3 text-center text-xs font-medium text-ink/60">
          Pilih satu jawaban dulu, pembahasannya langsung muncul.
        </p>
      )}

      {/* Kilas +XP saat jawaban benar */}
      <div
        aria-live="polite"
        className={cx(
          'pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 transition-all duration-300',
          showXpFlash ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        )}
      >
        <p
          key={xpFlashKey}
          className="rounded-full border-2 border-ink bg-ink px-4 py-2.5 text-sm font-bold text-white shadow-sticker-amber"
        >
          +{XP_DRILL_CORRECT} XP · Jawaban benar!
        </p>
      </div>
    </div>
  )
}
