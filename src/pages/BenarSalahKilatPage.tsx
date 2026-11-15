/**
 * Benar/Salah Kilat (/main/benar-salah): game solo rapid-fire, tanpa login.
 *
 * 60 detik, pernyataan muncul satu per satu dan user mengetuk Benar
 * atau Salah. Pernyataan dibuat dari soal TWK/TIU yang sudah ada di
 * bank soal lokal: stem soal ditambah satu klaim jawaban. 50%
 * pernyataan BENAR (klaim = opsi kunci), 50% SALAH (klaim = satu opsi
 * pengecoh acak). TKP tidak dipakai karena tidak ada benar/salah.
 *
 * Hanya soal yang kuncinya valid dan punya minimal 2 opsi non-kosong
 * yang dipakai (null-safe lewat visibleOptions), dan soal tidak
 * berulang dalam satu sesi.
 *
 * Penskoran meniru Kuis Kilat: 10 poin dasar per jawaban benar dengan
 * combo multiplier (1x/2x/3x), skor terbaik di localStorage, XP =
 * skor/10 maksimal 50 XP. Soal yang sempat dijawab ditandai sudah
 * dilihat (markSeen) dan aktivitas hari ini dicatat untuk streak.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { QUIZABLE_QUESTIONS, type Opsi, type Question } from '../lib/questions'
import { shuffle, visibleOptions } from '../lib/quiz'
import { addXp, markSeen, recordActivity } from '../lib/store'
import { migrateLegacyKey, scopedKey } from '../lib/storage'
import { comboMultiplier } from './KuisKilatPage'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ConfirmModal } from '../components/quiz/ConfirmModal'
import {
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  FlameIcon,
  TargetIcon,
  TrophyIcon,
  XIcon,
  ZapIcon,
} from '../components/icons'

/** Durasi satu permainan Benar/Salah Kilat. */
export const BENAR_SALAH_SECONDS = 60
/** Poin dasar satu jawaban benar (sebelum multiplier kombo). */
export const BENAR_SALAH_BASE_POINTS = 10
/** Ukuran antrean pernyataan per permainan (diisi ulang bila habis). */
const QUEUE_SIZE = 30
/** Key dasar localStorage untuk skor terbaik Benar/Salah Kilat (di-namespace per user: `:guest` atau `:<userId>`). */
export const BENAR_SALAH_BEST_KEY = 'lolosin:benar-salah-best'
/** Hadiah XP maksimal per permainan. */
export const BENAR_SALAH_MAX_XP = 50
/** Panjang maksimum stem yang ditampilkan (sisanya dipotong elipsis). */
const STEM_MAX_CHARS = 240

interface BestScore {
  score: number
  correct: number
  date: string
}

/** Satu pernyataan: soal + klaim jawaban yang harus dinilai benar/salah. */
interface Statement {
  question: Question
  claim: string
  /** `true` bila klaim adalah opsi kunci, `false` bila pengecoh. */
  isTrue: boolean
}

type Phase = 'idle' | 'playing' | 'finished'

/**
 * Pool pernyataan: soal TWK/TIU yang kuncinya valid, opsi kuncinya
 * punya teks, dan minimal 2 opsi non-kosong (null-safe).
 */
function buildPool(): Question[] {
  return QUIZABLE_QUESTIONS.filter((q) => {
    if (q.materi !== 'TWK' && q.materi !== 'TIU') return false
    if (q.kunci === null) return false
    const visible = visibleOptions(q)
    if (visible.length < 2) return false
    return visible.includes(q.kunci)
  })
}

/**
 * Buat satu pernyataan dari satu soal: 50% klaimnya benar (opsi kunci),
 * 50% klaimnya salah (satu opsi pengecoh acak yang punya teks).
 */
function makeStatement(question: Question): Statement {
  const kunci = question.kunci as Opsi
  const visible = visibleOptions(question)
  const distractors = visible.filter((opsi) => opsi !== kunci)
  const isTrue = Math.random() < 0.5 || distractors.length === 0
  if (isTrue) {
    return { question, claim: question.pilihan[kunci], isTrue: true }
  }
  const pick = distractors[Math.floor(Math.random() * distractors.length)]
  return { question, claim: question.pilihan[pick], isTrue: false }
}

/** Potong teks panjang dengan elipsis. */
function truncate(text: string, maxChars: number): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (clean.length <= maxChars) return clean
  return `${clean.slice(0, maxChars).trimEnd()}...`
}

function loadBest(): BestScore | null {
  try {
    // Migrasi sekali: skor terbaik lama di key tanpa namespace pindah
    // ke namespace aktif sebelum dibaca.
    migrateLegacyKey(BENAR_SALAH_BEST_KEY)
    const raw = localStorage.getItem(scopedKey(BENAR_SALAH_BEST_KEY))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BestScore>
    if (
      typeof parsed.score !== 'number' ||
      typeof parsed.correct !== 'number' ||
      typeof parsed.date !== 'string'
    ) {
      return null
    }
    return {
      score: parsed.score,
      correct: parsed.correct,
      date: parsed.date,
    }
  } catch {
    return null
  }
}

function saveBest(best: BestScore): void {
  try {
    localStorage.setItem(
      scopedKey(BENAR_SALAH_BEST_KEY),
      JSON.stringify(best),
    )
  } catch {
    // Penyimpanan tidak tersedia: abaikan diam-diam.
  }
}

export function BenarSalahKilatPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [queue, setQueue] = useState<Statement[]>([])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(BENAR_SALAH_SECONDS)
  const [best, setBest] = useState<BestScore | null>(() => loadBest())
  const [isNewBest, setIsNewBest] = useState(false)
  const [xpEarned, setXpEarned] = useState(0)
  const [lastResult, setLastResult] = useState<{
    key: number
    correct: boolean
    points: number
  } | null>(null)
  const [showEndConfirm, setShowEndConfirm] = useState(false)

  const endTimeRef = useRef<number | null>(null)
  const finishedRef = useRef(false)
  const answeredIdsRef = useRef<string[]>([])
  const statsRef = useRef({ score: 0, correct: 0 })

  /* Detak timer: pakai endTime supaya tidak melambat bila tab tidak aktif. */
  useEffect(() => {
    if (phase !== 'playing') return
    const timer = setInterval(() => {
      if (endTimeRef.current === null) return
      const left = Math.max(
        0,
        Math.ceil((endTimeRef.current - Date.now()) / 1000),
      )
      setSecondsLeft(left)
      if (left <= 0) finishGame()
    }, 200)
    return () => clearInterval(timer)
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  function startGame() {
    const fresh = shuffle(buildPool())
      .slice(0, QUEUE_SIZE)
      .map(makeStatement)
    setQueue(fresh)
    setIndex(0)
    setScore(0)
    setCorrectCount(0)
    setAnsweredCount(0)
    setCombo(0)
    setBestCombo(0)
    setSecondsLeft(BENAR_SALAH_SECONDS)
    setIsNewBest(false)
    setXpEarned(0)
    setLastResult(null)
    statsRef.current = { score: 0, correct: 0 }
    answeredIdsRef.current = []
    finishedRef.current = false
    endTimeRef.current = Date.now() + BENAR_SALAH_SECONDS * 1000
    setPhase('playing')
  }

  function finishGame() {
    if (finishedRef.current) return
    finishedRef.current = true
    endTimeRef.current = null
    const finalScore = statsRef.current.score
    const finalCorrect = statsRef.current.correct
    const xp = Math.min(
      BENAR_SALAH_MAX_XP,
      Math.floor(finalScore / 10),
    )
    if (xp > 0) {
      addXp(xp)
      setXpEarned(xp)
    }
    markSeen(answeredIdsRef.current)
    recordActivity()
    const previousBest = loadBest()
    if (!previousBest || finalScore > previousBest.score) {
      const next: BestScore = {
        score: finalScore,
        correct: finalCorrect,
        date: new Date().toISOString(),
      }
      saveBest(next)
      setBest(next)
      setIsNewBest(finalScore > 0)
    }
    setPhase('finished')
  }

  function handleAnswer(guessTrue: boolean) {
    if (phase !== 'playing') return
    const statement = queue[index]
    if (!statement) return
    const correct = guessTrue === statement.isTrue
    answeredIdsRef.current.push(statement.question.id)
    setAnsweredCount((n) => n + 1)
    if (correct) {
      const nextCombo = combo + 1
      const multiplier = comboMultiplier(nextCombo)
      const points = BENAR_SALAH_BASE_POINTS * multiplier
      const nextScore = score + points
      statsRef.current = {
        score: nextScore,
        correct: statsRef.current.correct + 1,
      }
      setScore(nextScore)
      setCorrectCount((n) => n + 1)
      setCombo(nextCombo)
      setBestCombo((b) => Math.max(b, nextCombo))
      setLastResult({
        key: Date.now(),
        correct: true,
        points,
      })
    } else {
      setCombo(0)
      setLastResult({ key: Date.now(), correct: false, points: 0 })
    }
    /* Antrean habis: isi ulang dengan soal acak yang belum muncul. */
    if (index + 1 >= queue.length) {
      const seenIds = new Set(queue.map((s) => s.question.id))
      const refill = shuffle(
        buildPool().filter((q) => !seenIds.has(q.id)),
      )
        .slice(0, QUEUE_SIZE)
        .map(makeStatement)
      if (refill.length > 0) {
        setQueue((current) => [...current, ...refill])
      }
    }
    setIndex((i) => i + 1)
  }

  const statement = queue[index]
  const multiplier = comboMultiplier(combo)

  if (phase === 'idle') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header>
          <Link
            to="/main"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline"
          >
            <ArrowLeftIcon width={16} height={16} />
            Hub Game
          </Link>
          <h1 className="mt-2 flex items-center gap-2 font-display text-3xl font-extrabold">
            <TargetIcon
              width={28}
              height={28}
              className="text-primary-600"
            />
            Benar/Salah Kilat
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-ink/60">
            60 detik, pernyataan TWK dan TIU muncul satu per satu. Tugasmu
            simpel: nilai klaim jawabannya, benar atau salah? Jawaban
            benar beruntun membangun kombo dan melipatgandakan poin.
          </p>
        </header>

        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-extrabold">
            Cara main
          </h2>
          <ul className="flex flex-col gap-2 text-sm leading-relaxed text-ink/70">
            <li className="flex items-start gap-2">
              <ClockIcon
                width={18}
                height={18}
                className="mt-0.5 shrink-0 text-primary-600"
              />
              Kamu punya 60 detik. Nilai sebanyak mungkin pernyataan
              sebelum waktu habis.
            </li>
            <li className="flex items-start gap-2">
              <TargetIcon
                width={18}
                height={18}
                className="mt-0.5 shrink-0 text-primary-600"
              />
              Setiap pernyataan menampilkan satu soal dan satu klaim
              jawaban. Setengah klaimnya benar, setengahnya salah.
              Ketuk Benar atau Salah.
            </li>
            <li className="flex items-start gap-2">
              <FlameIcon
                width={18}
                height={18}
                className="mt-0.5 shrink-0 text-accent-600"
              />
              Kombo 3 jawaban benar beruntun jadi 2x poin, kombo 6 jadi
              3x poin. Satu jawaban salah memutus kombo.
            </li>
            <li className="flex items-start gap-2">
              <TrophyIcon
                width={18}
                height={18}
                className="mt-0.5 shrink-0 text-primary-600"
              />
              Skor terbaikmu tersimpan di perangkat ini. Main tanpa
              login, gratis.
            </li>
          </ul>
          {best && (
            <p className="rounded-xl bg-ink/5 px-3 py-2 text-sm font-semibold">
              Skor terbaikmu: {best.score} poin ({best.correct} benar)
            </p>
          )}
          <Button size="lg" onClick={startGame}>
            <ZapIcon width={18} height={18} />
            Mulai 60 detik
          </Button>
        </Card>
      </div>
    )
  }

  if (phase === 'finished') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="text-center">
          <p className="text-4xl" aria-hidden="true">
            {isNewBest ? '🏆' : '🎯'}
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">
            {isNewBest ? 'Skor terbaik baru!' : 'Waktu habis!'}
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            60 detik yang padat, kerja bagus.
          </p>
        </header>

        <Card className="text-center">
          <p className="font-display text-5xl font-extrabold">
            <span className="hl-marker">{score}</span>
          </p>
          <p className="mt-1 text-sm font-semibold text-ink/60">poin</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div>
              <p className="font-display text-2xl font-extrabold">
                {correctCount}
              </p>
              <p className="text-xs font-semibold text-ink/60">
                jawaban benar
              </p>
            </div>
            <div>
              <p className="font-display text-2xl font-extrabold">
                {answeredCount}
              </p>
              <p className="text-xs font-semibold text-ink/60">
                pernyataan dinilai
              </p>
            </div>
            <div>
              <p className="font-display text-2xl font-extrabold">
                {bestCombo}x
              </p>
              <p className="text-xs font-semibold text-ink/60">
                kombo terbaik
              </p>
            </div>
          </div>
          {xpEarned > 0 && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent-400 px-3 py-1 text-sm font-extrabold text-ink">
              +{xpEarned} XP
            </p>
          )}
          {best && (
            <p className="mt-3 text-sm font-medium text-ink/60">
              Skor terbaik: {best.score} poin
              {isNewBest ? ' (barusan kamu pecahkan!)' : ''}
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth onClick={startGame}>
            Main lagi
          </Button>
          <Link to="/main" className="block">
            <Button size="lg" variant="outline" fullWidth>
              Ke Hub Game
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  /* Arena bermain. */
  if (!statement) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-6 text-center">
          <p className="font-display text-lg font-bold">
            Pernyataan habis, luar biasa cepat!
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Kamu menilai semua pernyataan yang tersedia sebelum waktu
            habis.
          </p>
          <Button className="mt-4" onClick={finishGame}>
            Lihat hasil
          </Button>
        </Card>
      </div>
    )
  }

  const { question } = statement
  const lowTime = secondsLeft <= 10

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header>
        <button
          type="button"
          onClick={() => setShowEndConfirm(true)}
          className="text-sm font-semibold text-primary-700 hover:underline"
        >
          ← Akhiri sesi
        </button>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="kicker flex items-center gap-1.5">
            <TargetIcon width={16} height={16} />
            Benar/Salah Kilat
          </p>
          <p
            className={
              lowTime
                ? 'flex items-center gap-1.5 text-lg font-extrabold text-red-600'
                : 'flex items-center gap-1.5 text-lg font-extrabold text-ink/70'
            }
          >
            <ClockIcon width={18} height={18} />
            {secondsLeft} dtk
          </p>
        </div>
        <div className="mt-3">
          <ProgressBar
            value={secondsLeft}
            max={BENAR_SALAH_SECONDS}
            tone={lowTime ? 'amber' : 'primary'}
            label="Sisa waktu"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="green">Skor: {score}</Badge>
          <Badge tone="amber">
            <FlameIcon width={13} height={13} />
            Kombo {combo}x · pengali {multiplier}x
          </Badge>
          <Badge tone="neutral">Benar: {correctCount}</Badge>
        </div>
      </header>

      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{question.materi}</Badge>
            <span className="text-xs font-extrabold tracking-wide text-ink/60 uppercase">
              Pernyataan {answeredCount + 1}
            </span>
          </div>
          <p className="line-clamp-3 text-[15px] leading-relaxed font-medium whitespace-pre-line">
            {truncate(question.soal, STEM_MAX_CHARS)}
          </p>
          <div className="rounded-2xl border border-line bg-paper px-4 py-4 text-center">
            <p className="text-xs font-extrabold tracking-wide text-ink/50 uppercase">
              Klaim jawaban
            </p>
            <p className="mt-1 text-xl leading-snug font-extrabold">
              {statement.claim}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="lg"
              onClick={() => handleAnswer(false)}
              className="bg-red-600 text-white hover:bg-red-700 active:bg-red-800"
            >
              <XIcon width={18} height={18} />
              Salah
            </Button>
            <Button size="lg" onClick={() => handleAnswer(true)}>
              <CheckIcon width={18} height={18} />
              Benar
            </Button>
          </div>
          <p className="text-center text-xs font-medium text-ink/60">
            Jawaban langsung dinilai begitu kamu menekan tombol.
          </p>
        </div>
      </Card>

      {/* Umpan balik poin: muncul sebentar tiap jawaban, hanya transform dan opacity. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4"
      >
        {lastResult && (
          <p
            key={lastResult.key}
            className={
              lastResult.correct
                ? 'flex items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white shadow-soft-lg'
                : 'flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-soft-lg'
            }
          >
            {lastResult.correct ? (
              <>
                <CheckIcon width={16} height={16} />+{lastResult.points} poin
              </>
            ) : (
              <>
                <XIcon width={16} height={16} />
                Salah, kombo putus
              </>
            )}
          </p>
        )}
      </div>

      <ConfirmModal
        open={showEndConfirm}
        title="Akhiri sesi sekarang?"
        body="Skor yang sudah kamu kumpulkan tetap tersimpan, dan XP-nya tetap masuk."
        confirmLabel="Ya, akhiri"
        cancelLabel="Lanjut main"
        icon={<XIcon width={22} height={22} />}
        onConfirm={() => {
          setShowEndConfirm(false)
          finishGame()
        }}
        onCancel={() => setShowEndConfirm(false)}
      />
    </div>
  )
}
