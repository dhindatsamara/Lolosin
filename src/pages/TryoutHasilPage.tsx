import { Link, useLocation, useNavigate } from 'react-router-dom'
import { MATERI_LIST, MATERI_META, type Question } from '../lib/questions'
import {
  ORIGINAL_MAX,
  ORIGINAL_PASSING,
  scoreQuestion,
  TRYOUT_MAX_PER_SECTION,
  TRYOUT_PASSING_MINI,
  type TryoutAnswers,
  type TryoutScore,
} from '../lib/quiz'
import { cx } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Mascot } from '../components/Mascot'
import { CheckIcon } from '../components/icons'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

const MATERI_CARD = {
  TWK: 'border-ink bg-twk text-white',
  TIU: 'border-ink bg-tiu text-white',
  TKP: 'border-ink bg-tkp text-white',
} as const

/**
 * State hasil tryout segar, dikirim halaman tryout saat sesi selesai:
 * skor + soal + jawaban (untuk breakdown) + XP yang didapat.
 */
export interface TryoutResultState {
  score: TryoutScore
  questions: Question[]
  answers: TryoutAnswers
  xpEarned: number
  /** `true` bila sesi berakhir karena waktu habis (auto-submit). */
  timedOut?: boolean
}

interface NormalizedResult {
  score: TryoutScore
  questions: Question[] | null
  answers: TryoutAnswers | null
  xpEarned: number | null
  timedOut: boolean
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
 * Halaman hasil menerima dua bentuk state:
 * - `TryoutScore` polos (dari riwayat), tanpa breakdown soal.
 * - `TryoutResultState` (dari sesi segar), dengan breakdown + XP.
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
    }
  }
  if (isTryoutScore(state)) {
    return {
      score: state,
      questions: null,
      answers: null,
      xpEarned: null,
      timedOut: false,
    }
  }
  return null
}

/**
 * Halaman hasil tryout: skor per seksi (mini + terskala), status lulus
 * per seksi dan keseluruhan, XP didapat, dan breakdown per soal.
 */
export function TryoutHasilPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const result = normalize(location.state)

  if (!result) {
    return (
      <Card className="p-6 text-center">
        <p className="font-display text-lg font-bold">
          Belum ada hasil tryout nih
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink/60">
          Selesaikan satu tryout mini dulu, nanti skor, status lulus per
          seksi, dan skor terskala CAT muncul di sini.
        </p>
        <Link to="/tryout" className="mt-4 inline-block">
          <Button>Ke halaman Tryout</Button>
        </Link>
      </Card>
    )
  }

  const { score, questions, answers, xpEarned, timedOut } = result
  const totalCorrect = score.correct
    ? score.correct.TWK + score.correct.TIU + score.correct.TKP
    : null

  return (
    <div className="flex flex-col gap-5">
      <header className="text-center">
        <Mascot
          mood={score.passedOverall ? 'semangat' : 'sedih'}
          size={80}
          className="mx-auto"
        />
        <h1 className="mt-2 font-display text-3xl font-extrabold">
          {score.passedOverall
            ? 'Selamat, kamu lulus!'
            : 'Belum lulus, terus berlatih ya!'}
        </h1>
        <p className="mt-1 text-sm font-medium text-ink/60">
          Total mini{' '}
          <span className="hl-marker font-extrabold">
            {score.total}/150
          </span>{' '}
          · terskala {score.scaledTotal}/550
          {totalCorrect !== null && (
            <> · {totalCorrect} jawaban benar dari 30 soal</>
          )}
        </p>
        {timedOut && (
          <p className="mx-auto mt-2 w-fit rounded-full border-2 border-ink bg-accent-400 px-3 py-1 text-xs font-extrabold text-ink shadow-sticker-sm">
            Waktu habis, jawaban tersimpan otomatis
          </p>
        )}
        {xpEarned !== null && (
          <p className="mx-auto mt-2 w-fit rounded-full border-2 border-ink bg-primary-100 px-3 py-1 text-sm font-extrabold text-primary-700 shadow-sticker-sm">
            +{xpEarned} XP
          </p>
        )}
      </header>

      <div className="flex flex-col gap-3">
        {MATERI_LIST.map((materi) => {
          const nilai = score.scores[materi]
          const scaled = score.scaled[materi]
          const passed = score.passed?.[materi] ?? false
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
                  className={cx(
                    'shrink-0 border-2 border-ink',
                    !passed && 'bg-white text-ink',
                  )}
                >
                  {passed ? 'Lulus' : 'Belum lulus'}
                </Badge>
              </div>
              <p className="mt-3 font-display text-2xl font-bold">
                {nilai}
                <span className="text-sm font-semibold text-white/75">
                  /{TRYOUT_MAX_PER_SECTION} · terskala {scaled}/
                  {ORIGINAL_MAX[materi]}
                </span>
              </p>
              <ProgressBar
                value={nilai}
                max={TRYOUT_MAX_PER_SECTION}
                tone="amber"
                label={`Skor ${materi}`}
                className="mt-2 bg-white/25"
              />
              <p className="mt-1.5 text-xs font-semibold text-white/85">
                Passing grade mini: {TRYOUT_PASSING_MINI[materi]} · passing
                asli: {ORIGINAL_PASSING[materi]}
                {score.correct
                  ? ` · benar: ${score.correct[materi]}/10`
                  : ''}
              </p>
            </Card>
          )
        })}
      </div>

      {questions && answers && (
        <section aria-label="Breakdown per soal">
          <h2 className="mb-2 font-display text-base font-extrabold">
            Hasil per soal
          </h2>
          <div className="flex flex-col gap-2">
            {questions.map((q, i) => {
              const answer = answers[q.id]
              const dijawab = answer !== undefined
              const benar = dijawab && answer === q.kunci
              const poin = scoreQuestion(q, answer)
              return (
                <Card key={q.id} className="py-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={cx(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink text-sm font-extrabold',
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
                      <p className="mt-1 text-sm leading-relaxed">
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
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </section>
      )}

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
