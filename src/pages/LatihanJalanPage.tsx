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
  addXp,
  getStore,
  markSeen,
  recordActivity,
  XP_DRILL_COMPLETE,
  XP_DRILL_CORRECT,
} from '../lib/store'
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

  // Soal dipilih sekali saat sesi dimulai — bukan per render — supaya
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

  // Catat aktivitas (streak) saat sesi dimulai.
  useEffect(() => {
    recordActivity()
  }, [])

  if (!materi || !session) {
    return (
      <Card className="p-6 text-center">
        <p className="font-display text-lg font-bold">
          Sesi latihan belum dipilih
        </p>
        <p className="mt-2 text-sm text-ink/60">
          Pilih materi dan topik dulu dari halaman Latihan.
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
          Tidak ada soal untuk topik ini
        </p>
        <p className="mt-2 text-sm text-ink/60">
          Coba topik lain atau pilih &ldquo;Semua topik&rdquo;.
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
      addXp(XP_DRILL_CORRECT)
      setXpEarned((xp) => xp + XP_DRILL_CORRECT)
    }
  }

  function handleFinish() {
    if (finishedRef.current) return
    finishedRef.current = true
    addXp(XP_DRILL_COMPLETE)
    setXpEarned((xp) => xp + XP_DRILL_COMPLETE)
    recordActivity()
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
    recordActivity()
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
          <h1 className="mt-2 text-2xl font-bold">Sesi selesai!</h1>
          <p className="mt-1 text-sm text-ink/60">
            Drill {materi}
            {subtopik ? ` · ${subtopik}` : ''}
          </p>
        </header>

        <Card className="text-center">
          <p className="font-display text-4xl font-bold">
            {correctCount}
            <span className="text-lg font-medium text-ink/50">/{total}</span>
          </p>
          <p className="mt-1 text-sm font-medium text-ink/60">
            jawaban benar
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-100 px-3 py-1 text-sm font-bold text-accent-700">
            +{xpEarned} XP
          </p>
          <p className="mt-2 text-xs text-ink/50">
            {correctCount} jawaban benar × {XP_DRILL_CORRECT} XP = {correctXp}{' '}
            XP + bonus selesai {XP_DRILL_COMPLETE} XP
          </p>
        </Card>

        <section aria-label="Ringkasan jawaban">
          <h2 className="mb-2 text-sm font-bold text-ink/70">
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
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                      benar
                        ? 'bg-primary-100 text-primary-700'
                        : 'bg-red-50 text-red-700',
                    )}
                  >
                    {benar ? <CheckIcon width={15} height={15} /> : '✕'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug font-medium">
                      <span className="text-ink/50">Soal {i + 1} · </span>
                      {q.soal.length > 90
                        ? `${q.soal.slice(0, 90)}…`
                        : q.soal}
                    </p>
                    <p className="mt-0.5 text-xs text-ink/60">
                      {poin !== null
                        ? `Kamu dapat ${poin}/5 poin`
                        : benar
                          ? 'Benar'
                          : `Jawabanmu ${answer ?? '—'} · kunci ${q.kunci}`}
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
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-2xl font-bold">
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
          <span className="shrink-0 text-xs font-bold text-ink/60">
            Soal {index + 1} dari {total}
          </span>
        </div>
        {session.rotated && (
          <p className="mt-2 rounded-xl bg-accent-50 px-3 py-2 text-xs font-medium text-accent-700">
            Soal baru habis — mengulang dari awal.
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
        <p className="-mt-3 text-center text-xs text-ink/50">
          Pilih satu jawaban untuk melihat pembahasannya.
        </p>
      )}
    </div>
  )
}
