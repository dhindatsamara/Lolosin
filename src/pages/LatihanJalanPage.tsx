import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  getQuestionById,
  isMateri,
  type Materi,
  type Opsi,
  type Question,
} from '../lib/questions'
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
  todayMakassar,
  XP_DRILL_COMPLETE,
  XP_DRILL_CORRECT,
} from '../lib/store'
import {
  completeDrill,
  completeReview,
  recordDailyActivity,
  recordDrillCorrect,
  recordReviewCorrect,
} from '../lib/gamification'
import {
  answerReview,
  dueReviews,
  recordAnswer,
  REVIEW_SESSION_MAX,
} from '../lib/review'
import { cx } from '../lib/utils'
import { Mascot } from '../components/Mascot'
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

/** Ambil soal ulas yang jatuh tempo hari ini (maks 10, paling lama dulu). */
function pickReviewQuestions(): DrillPick {
  const questions = dueReviews(todayMakassar())
    .slice(0, REVIEW_SESSION_MAX)
    .map((entry) => getQuestionById(entry.questionId))
    .filter((q): q is Question => q !== undefined)
  return { questions, rotated: false }
}

/**
 * Sesi drill 10 soal: satu soal per layar, feedback langsung setelah
 * memilih, lalu pembahasan per opsi. +10 XP per jawaban benar, +50 XP
 * saat sesi selesai. Soal baru selalu didahulukan (anti-ulang).
 *
 * Mode `review` memakai ulang layar yang sama untuk ulasan soal yang
 * pernah salah: soalnya dari antrean yang jatuh tempo (maks 10 per
 * sesi), jawaban benar +10 XP tanpa bonus selesai sesi, dan jadwal
 * ulas dimajukan lewat `answerReview`.
 */
export function LatihanJalanPage({
  mode = 'drill',
}: {
  mode?: 'drill' | 'review'
}) {
  const isReview = mode === 'review'
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
    if (isReview) return pickReviewQuestions()
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

  if (!isReview && (!materi || !session)) {
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

  if (!session) return null

  if (session.questions.length === 0) {
    if (isReview) {
      return (
        <Card className="p-6 text-center">
          <Mascot mood="senang" size={72} className="mx-auto" />
          <p className="mt-2 font-display text-lg font-bold">
            Antrean ulas hari ini sudah habis
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Nggak ada soal yang jatuh tempo hari ini. Soal yang pernah
            salah bakal muncul lagi pas jadwalnya tiba.
          </p>
          <Link to="/latihan" className="mt-4 inline-block">
            <Button>Ke halaman Latihan</Button>
          </Link>
        </Card>
      )
    }
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
    const benar = opsi === question.kunci
    if (isReview) {
      answerReview(question.id, benar)
      if (benar) {
        recordReviewCorrect()
        setXpEarned((xp) => xp + XP_DRILL_CORRECT)
        setXpFlashKey((k) => k + 1)
      }
      return
    }
    recordAnswer(question, benar)
    if (benar) {
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
    if (isReview) {
      // Ulas tidak dapat bonus selesai sesi; XP hanya dari jawaban benar.
      // completeReview sekaligus merayakan bila antrean hari ini habis.
      completeReview()
    } else {
      completeDrill(materi as Materi, correctCount, total)
      setXpEarned((xp) => xp + XP_DRILL_COMPLETE)
    }
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
    const fresh = isReview
      ? pickReviewQuestions()
      : pickDrillQuestions(
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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="text-center">
          <p className="text-4xl" aria-hidden="true">
            🎉
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">
            {isReview ? 'Sesi ulas selesai!' : 'Sesi selesai!'}
          </h1>
          <p className="mt-1 text-sm font-medium text-ink/60">
            {isReview ? (
              'Ulas soal yang pernah salah'
            ) : (
              <>
                Drill {materi}
                {subtopik ? ` · ${subtopik}` : ''}
              </>
            )}
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
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-400 px-3 py-1 text-sm font-extrabold text-ink">
            +{xpEarned} XP
          </p>
          <p className="mt-2 text-xs font-medium text-ink/60">
            {correctCount} jawaban benar × {XP_DRILL_CORRECT} XP = {correctXp}{' '}
            XP
            {!isReview && (
              <>
                , plus bonus selesai {XP_DRILL_COMPLETE} XP
              </>
            )}
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
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold',
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
            {isReview ? 'Ulas lagi' : 'Latihan lagi (soal baru)'}
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header>
        <Link
          to="/latihan"
          className="text-sm font-semibold text-primary-700 hover:underline"
        >
          ← Akhiri sesi & pilih sesi lain
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 font-display text-3xl font-extrabold">
          {isReview ? (
            'Ulas Soal'
          ) : (
            <>
              Drill {materi}
              {subtopik && (
                <span className="text-base font-semibold text-ink/60">
                  · {subtopik}
                </span>
              )}
            </>
          )}
        </h1>
        {isReview && (
          <p className="mt-1 text-sm leading-relaxed text-ink/60">
            Soal-soal yang pernah salah, diulang pas jadwalnya supaya nempel.
          </p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar
            value={answeredCount}
            max={total}
            tone={isReview || !materi ? 'primary' : MATERI_TONE[materi]}
            label={isReview ? 'Progres ulasan' : 'Progres drill'}
            className="flex-1"
          />
          <span className="shrink-0 text-xs font-extrabold whitespace-nowrap text-ink/60">
            Soal {index + 1} dari {total}
          </span>
        </div>
        {session.rotated && (
          <p className="mt-2 rounded-xl border border-accent-200 bg-accent-100 px-3 py-2 text-xs font-bold text-accent-800">
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
          className="rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white shadow-soft-lg"
        >
          +{XP_DRILL_CORRECT} XP · Jawaban benar!
        </p>
      </div>
    </div>
  )
}
