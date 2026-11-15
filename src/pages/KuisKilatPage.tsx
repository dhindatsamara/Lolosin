/**
 * Kuis Kilat (/main/kuis-kilat): game solo rapid-fire, tanpa login.
 *
 * 60 detik, soal acak campur TWK/TIU/TKP dari bank soal lokal.
 * Jawaban benar memberi poin dengan combo multiplier untuk jawaban
 * benar beruntun, jawaban salah memutus combo. Layar akhir menampilkan
 * skor, jumlah jawaban benar, dan skor terbaik (localStorage).
 *
 * Hadiah XP: store punya fungsi tambah XP generik (addXp), jadi di
 * akhir permainan pemain mendapat skor/10 XP, maksimal 50 XP.
 * Soal yang sempat dijawab ditandai sudah dilihat (markSeen) supaya
 * tidak diulang di drill, dan aktivitas hari ini dicatat untuk streak.
 *
 * Berbeda dengan Battle dan Sesi, di sini jawaban langsung dinilai
 * saat opsi ditekan (tanpa tombol Jawab): kecepatan adalah inti
 * permainan ini, tombol tambahan justru menghambat alurnya.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { QUIZABLE_QUESTIONS, type Opsi, type Question } from '../lib/questions'
import { shuffle, visibleOptions } from '../lib/quiz'
import {
  addXp,
  markSeen,
  recordActivity,
} from '../lib/store'
import { migrateLegacyKey, scopedKey } from '../lib/storage'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { OptionButton } from '../components/quiz/OptionButton'
import { ConfirmModal } from '../components/quiz/ConfirmModal'
import {
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  FlameIcon,
  TrophyIcon,
  XIcon,
  ZapIcon,
} from '../components/icons'

/** Durasi satu permainan Kuis Kilat. */
export const KUIS_KILAT_SECONDS = 60
/** Poin dasar satu jawaban benar (sebelum multiplier kombo). */
export const KUIS_KILAT_BASE_POINTS = 10
/** Ukuran antrean soal per permainan (diisi ulang bila habis). */
const QUEUE_SIZE = 30
/** Key dasar localStorage untuk skor terbaik Kuis Kilat (di-namespace per user: `:guest` atau `:<userId>`). */
export const KUIS_KILAT_BEST_KEY = 'lolosin:kuis-kilat-best'
/** Hadiah XP maksimal per permainan. */
export const KUIS_KILAT_MAX_XP = 50

interface BestScore {
  score: number
  correct: number
  date: string
}

type Phase = 'idle' | 'playing' | 'finished'

/**
 * Multiplier kombo: tiap 3 jawaban benar beruntun menaikkan pengali
 * 1 poin, maksimal 3x. Kombo 0-2 jadi 1x, 3-5 jadi 2x, 6+ jadi 3x.
 */
export function comboMultiplier(combo: number): number {
  return Math.min(3, 1 + Math.floor(Math.max(0, combo) / 3))
}

function loadBest(): BestScore | null {
  try {
    // Migrasi sekali: skor terbaik lama di key tanpa namespace pindah
    // ke namespace aktif sebelum dibaca.
    migrateLegacyKey(KUIS_KILAT_BEST_KEY)
    const raw = localStorage.getItem(scopedKey(KUIS_KILAT_BEST_KEY))
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
    localStorage.setItem(scopedKey(KUIS_KILAT_BEST_KEY), JSON.stringify(best))
  } catch {
    // Penyimpanan tidak tersedia: abaikan diam-diam.
  }
}

export function KuisKilatPage() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [queue, setQueue] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [combo, setCombo] = useState(0)
  const [bestCombo, setBestCombo] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(KUIS_KILAT_SECONDS)
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
    const fresh = shuffle(QUIZABLE_QUESTIONS).slice(0, QUEUE_SIZE)
    setQueue(fresh)
    setIndex(0)
    setScore(0)
    setCorrectCount(0)
    setAnsweredCount(0)
    setCombo(0)
    setBestCombo(0)
    setSecondsLeft(KUIS_KILAT_SECONDS)
    setIsNewBest(false)
    setXpEarned(0)
    setLastResult(null)
    statsRef.current = { score: 0, correct: 0 }
    answeredIdsRef.current = []
    finishedRef.current = false
    endTimeRef.current = Date.now() + KUIS_KILAT_SECONDS * 1000
    setPhase('playing')
  }

  function finishGame() {
    if (finishedRef.current) return
    finishedRef.current = true
    endTimeRef.current = null
    const finalScore = statsRef.current.score
    const finalCorrect = statsRef.current.correct
    const xp = Math.min(
      KUIS_KILAT_MAX_XP,
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

  function handleSelect(opsi: Opsi) {
    if (phase !== 'playing') return
    const question = queue[index]
    if (!question) return
    const correct = opsi === question.kunci
    answeredIdsRef.current.push(question.id)
    setAnsweredCount((n) => n + 1)
    if (correct) {
      const nextCombo = combo + 1
      const multiplier = comboMultiplier(nextCombo)
      const points = KUIS_KILAT_BASE_POINTS * multiplier
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
      const seenIds = new Set(queue.map((q) => q.id))
      const refill = shuffle(
        QUIZABLE_QUESTIONS.filter((q) => !seenIds.has(q.id)),
      ).slice(0, QUEUE_SIZE)
      if (refill.length > 0) {
        setQueue((current) => [...current, ...refill])
      }
    }
    setIndex((i) => i + 1)
  }

  const question = queue[index]
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
            <ZapIcon width={28} height={28} className="text-primary-600" />
            Kuis Kilat
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-ink/60">
            60 detik, soal acak campur TWK, TIU, dan TKP. Jawab secepat
            mungkin: jawaban benar beruntun membangun kombo dan
            melipatgandakan poin, jawaban salah memutus kombo.
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
              Kamu punya 60 detik. Jawab sebanyak mungkin sebelum waktu
              habis.
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
            {isNewBest ? '🏆' : '⚡'}
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
                soal dijawab
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
  if (!question) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-6 text-center">
          <p className="font-display text-lg font-bold">
            Soal habis, luar biasa cepat!
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Kamu menjawab semua soal yang tersedia sebelum waktu habis.
          </p>
          <Button className="mt-4" onClick={finishGame}>
            Lihat hasil
          </Button>
        </Card>
      </div>
    )
  }

  const opsiTampil = visibleOptions(question)
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
            <ZapIcon width={16} height={16} />
            Kuis Kilat
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
            max={KUIS_KILAT_SECONDS}
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
              Soal {answeredCount + 1}
            </span>
          </div>
          <p className="text-[15px] leading-relaxed font-medium whitespace-pre-line">
            {question.soal}
          </p>
          <div
            className="flex flex-col gap-2"
            role="radiogroup"
            aria-label="Pilihan jawaban"
          >
            {opsiTampil.map((opsi) => (
              <OptionButton
                key={opsi}
                huruf={opsi}
                teks={question.pilihan[opsi]}
                onClick={() => handleSelect(opsi)}
              />
            ))}
          </div>
          <p className="text-center text-xs font-medium text-ink/60">
            Jawaban langsung dinilai begitu kamu menekan opsi.
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
