/**
 * Battle 1v1 (/main/battle dan /main/battle/:code).
 *
 * Alur: lobi (buat battle lalu dapat kode 6 karakter, atau gabung
 * dengan kode) lalu menunggu lawan, arena 10 soal yang sama, lalu
 * layar hasil. Pemenang = skor benar terbanyak, seri = total waktu
 * tercepat.
 *
 * Progres lawan tampil live lewat broadcast channel; polling ringan
 * tiap 3 detik jadi cadangan bila Realtime tidak tersambung. Satu
 * soal dijawab satu kali (pilih lalu tombol "Jawab", anti salah
 * pencet), tidak ada pengulangan soal dalam satu battle.
 *
 * Waktu tiap pemain diukur dari arena-nya sendiri (saat ia masuk
 * arena sampai kirim jawaban terakhir). Kedua pemain memakai alur
 * yang sama, jadi perbandingannya adil di V1.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getMyProfile, useAuthUser } from '../lib/auth'
import {
  abandonBattle,
  countCorrect,
  createBattle,
  decideBattleWinner,
  finishBattleEarly,
  GAME_QUESTION_COUNT,
  getBattleByCode,
  getBattleById,
  getBattleUsernames,
  joinBattle,
  resolveGameQuestions,
  submitBattleResult,
  subscribeBattleChannel,
  type BattleRole,
  type BattleRow,
  type GameChannel,
} from '../lib/battle'
import type { Opsi, Question } from '../lib/questions'
import { visibleOptions } from '../lib/quiz'
import { isSupabaseConfigured } from '../lib/supabase'
import { markSeen, recordActivity } from '../lib/store'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { OptionButton } from '../components/quiz/OptionButton'
import {
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  CrownIcon,
  InfoIcon,
  ShareIcon,
  SwordsIcon,
  TrophyIcon,
  XIcon,
} from '../components/icons'

const POLL_MS = 3000

type Phase =
  | 'loading'
  | 'lobby'
  | 'join'
  | 'waiting'
  | 'arena'
  | 'done'
  | 'result'
  | 'error'
  | 'cancelled'

/** Format milidetik jadi "1:23" (menit:detik). */
function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function BattlePage() {
  const { code } = useParams<{ code?: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuthUser()
  const configured = isSupabaseConfigured()

  const [phase, setPhase] = useState<Phase>(code ? 'loading' : 'lobby')
  const [battle, setBattle] = useState<BattleRow | null>(null)
  const [role, setRole] = useState<BattleRole | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [username, setUsername] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)

  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<Opsi | null>(null)
  const [answers, setAnswers] = useState<Record<string, Opsi>>({})
  const [elapsedMs, setElapsedMs] = useState(0)
  const [oppAnswered, setOppAnswered] = useState(0)
  const [oppFinished, setOppFinished] = useState(false)
  const [oppLeft, setOppLeft] = useState(false)

  const startTimeRef = useRef<number | null>(null)
  const channelRef = useRef<GameChannel | null>(null)
  const submittedRef = useRef(false)
  const seenOppRef = useRef(false)
  const phaseRef = useRef<Phase>(phase)
  phaseRef.current = phase

  const userId = user?.id ?? null

  /* Username sendiri, untuk presence dan tampilan. */
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getMyProfile().then((profile) => {
      if (!cancelled && profile) setUsername(profile.username)
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  /* Muat battle dari kode di URL. */
  useEffect(() => {
    if (!code) return
    if (authLoading) return
    if (!configured || !userId) {
      setPhase('error')
      setMessage(
        configured
          ? 'Masuk dulu biar bisa ikut battle ini.'
          : 'Fitur online belum aktif.',
      )
      return
    }
    let cancelled = false
    setPhase('loading')
    getBattleByCode(code).then((result) => {
      if (cancelled) return
      if (!result.ok || !result.data) {
        setMessage(result.error ?? 'Battle gagal dimuat, coba lagi ya.')
        setPhase('error')
        return
      }
      const row = result.data
      setBattle(row)
      if (row.status === 'cancelled') {
        setPhase('cancelled')
        return
      }
      if (row.status === 'finished') {
        setQuestions(resolveGameQuestions(row.question_ids))
        setPhase('result')
        return
      }
      if (row.host_id === userId) {
        setRole('host')
        if (row.status === 'waiting') {
          setPhase('waiting')
        } else {
          setQuestions(resolveGameQuestions(row.question_ids))
          startTimeRef.current = Date.now()
          setPhase('arena')
        }
        return
      }
      if (row.guest_id === userId) {
        setRole('guest')
        setQuestions(resolveGameQuestions(row.question_ids))
        startTimeRef.current = Date.now()
        setPhase('arena')
        return
      }
      if (row.status === 'waiting' && row.guest_id === null) {
        setPhase('join')
        return
      }
      setMessage('Battle ini sudah dimulai atau sudah penuh.')
      setPhase('error')
    })
    return () => {
      cancelled = true
    }
  }, [code, authLoading, configured, userId])

  /* Username kedua pemain, untuk layar hasil dan arena. */
  useEffect(() => {
    if (!battle) return
    const ids = [battle.host_id, battle.guest_id].filter(
      (id): id is string => id !== null,
    )
    let cancelled = false
    getBattleUsernames(ids).then((map) => {
      if (!cancelled) setNames(map)
    })
    return () => {
      cancelled = true
    }
  }, [battle?.host_id, battle?.guest_id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Channel broadcast + presence, selama battle menunggu atau berjalan. */
  useEffect(() => {
    if (!battle || !role || !userId) return
    if (battle.status !== 'waiting' && battle.status !== 'active') return
    const channel = subscribeBattleChannel(
      battle.code,
      userId,
      username || 'Pejuang',
      {
        onProgress: (payload) => {
          setOppAnswered(payload.answered)
        },
        onFinished: () => {
          setOppFinished(true)
        },
        onLeft: () => {
          setOppLeft(true)
        },
        onPresence: (presentIds) => {
          const opponentId =
            role === 'host' ? battle.guest_id : battle.host_id
          if (!opponentId) return
          if (presentIds.includes(opponentId)) {
            seenOppRef.current = true
          } else if (seenOppRef.current) {
            setOppLeft(true)
          }
        },
      },
    )
    channelRef.current = channel
    return () => {
      channel?.unsubscribe()
      channelRef.current = null
    }
  }, [battle?.id, battle?.status, role, userId, username]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Polling cadangan: lawan gabung, lawan selesai, atau battle batal. */
  useEffect(() => {
    if (!battle) return
    if (
      phase !== 'waiting' &&
      phase !== 'arena' &&
      phase !== 'done' &&
      phase !== 'join'
    ) {
      return
    }
    const timer = setInterval(() => {
      void getBattleById(battle.id).then((result) => {
        if (!result.ok || !result.data) return
        const row = result.data
        setBattle(row)
        if (row.status === 'cancelled') {
          setPhase('cancelled')
          return
        }
        if (row.status === 'finished') {
          setPhase('result')
          return
        }
        const current = phaseRef.current
        if (
          current === 'waiting' &&
          row.status === 'active' &&
          row.guest_id !== null
        ) {
          setQuestions(resolveGameQuestions(row.question_ids))
          startTimeRef.current = Date.now()
          setPhase('arena')
          return
        }
        if (current === 'done') {
          const myTime =
            role === 'host' ? row.host_time_ms : row.guest_time_ms
          const oppTime =
            role === 'host' ? row.guest_time_ms : row.host_time_ms
          if (oppTime !== null) setOppFinished(true)
          if (myTime !== null && oppTime !== null) setPhase('result')
        }
      })
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [battle?.id, phase, role]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Detak timer arena. */
  useEffect(() => {
    if (phase !== 'arena') return
    const timer = setInterval(() => {
      if (startTimeRef.current !== null) {
        setElapsedMs(Date.now() - startTimeRef.current)
      }
    }, 500)
    return () => clearInterval(timer)
  }, [phase])

  /* Salin kode battle. */
  async function handleCopyCode(codeToCopy: string) {
    try {
      await navigator.clipboard.writeText(codeToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setMessage('Gagal menyalin kode, salin manual aja ya.')
    }
  }

  async function handleCreate() {
    if (!userId) return
    setBusy(true)
    setMessage(null)
    const result = await createBattle(userId)
    setBusy(false)
    if (!result.ok || !result.data) {
      setMessage(result.error ?? 'Battle gagal dibuat, coba lagi ya.')
      return
    }
    navigate(`/main/battle/${result.data.code}`)
  }

  async function handleJoinByCode() {
    if (!userId) return
    const clean = joinCode.trim().toUpperCase()
    if (clean.length === 0) {
      setMessage('Isi dulu kode battle-nya ya.')
      return
    }
    setBusy(true)
    setMessage(null)
    const found = await getBattleByCode(clean)
    if (!found.ok || !found.data) {
      setBusy(false)
      setMessage(found.error ?? 'Kode battle tidak ditemukan, cek lagi ya.')
      return
    }
    const joined = await joinBattle(found.data, userId)
    setBusy(false)
    if (!joined.ok || !joined.data) {
      setMessage(joined.error ?? 'Gagal gabung battle, coba lagi ya.')
      return
    }
    navigate(`/main/battle/${joined.data.code}`)
  }

  async function handleJoinThis() {
    if (!userId || !battle) return
    setBusy(true)
    setMessage(null)
    const joined = await joinBattle(battle, userId)
    setBusy(false)
    if (!joined.ok || !joined.data) {
      setMessage(joined.error ?? 'Gagal gabung battle, coba lagi ya.')
      setPhase('error')
      return
    }
    setBattle(joined.data)
    setRole('guest')
    setQuestions(resolveGameQuestions(joined.data.question_ids))
    startTimeRef.current = Date.now()
    setPhase('arena')
  }

  async function handleCancel() {
    if (!battle) return
    channelRef.current?.send('left', { userId: userId ?? '' })
    await abandonBattle(battle.id)
    navigate('/main/battle')
  }

  async function handleFinishEarly() {
    if (!battle) return
    const done = await finishBattleEarly(battle.id)
    if (!done) {
      setMessage('Battle gagal diakhiri, coba lagi ya.')
      return
    }
    const result = await getBattleById(battle.id)
    if (result.ok && result.data) setBattle(result.data)
    setPhase('result')
  }

  function handleAnswer() {
    if (!battle || !role || selected === null) return
    const question = questions[index]
    if (!question) return
    const nextAnswers = { ...answers, [question.id]: selected }
    setAnswers(nextAnswers)
    const correct = countCorrect(questions, nextAnswers)
    channelRef.current?.send('progress', {
      userId: userId ?? '',
      answered: Object.keys(nextAnswers).length,
      correct,
    })
    setSelected(null)
    if (index + 1 >= questions.length) {
      void finishBattle(nextAnswers)
    } else {
      setIndex((i) => i + 1)
    }
  }

  async function finishBattle(finalAnswers: Record<string, Opsi>) {
    if (!battle || !role || submittedRef.current) return
    submittedRef.current = true
    const score = countCorrect(questions, finalAnswers)
    const timeMs =
      startTimeRef.current !== null
        ? Date.now() - startTimeRef.current
        : 0
    markSeen(Object.keys(finalAnswers))
    recordActivity()
    channelRef.current?.send('finished', {
      userId: userId ?? '',
      score,
      timeMs,
    })
    const result = await submitBattleResult(battle.id, role, score, timeMs)
    if (!result.ok || !result.data) {
      submittedRef.current = false
      setMessage(result.error ?? 'Skor gagal dikirim, coba lagi ya.')
      setPhase('arena')
      return
    }
    setBattle(result.data)
    if (result.data.status === 'finished') {
      setPhase('result')
    } else {
      setPhase('done')
    }
  }

  const opponentId =
    battle && role === 'host'
      ? battle.guest_id
      : battle
        ? battle.host_id
        : null
  const opponentName = opponentId
    ? (names[opponentId] ?? 'Lawan')
    : 'Lawan'
  const myCorrect = countCorrect(questions, answers)
  const answeredCount = Object.keys(answers).length
  const total = questions.length || GAME_QUESTION_COUNT
  const question = questions[index]

  /* Belum login: ajakan masuk, bukan crash. */
  if (!authLoading && !user) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-6 text-center">
          <SwordsIcon
            width={40}
            height={40}
            className="mx-auto text-primary-600"
          />
          <h1 className="mt-3 font-display text-2xl font-extrabold">
            Battle 1v1 butuh login
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            Masuk dulu biar bisa buat battle dan tantang temanmu.
          </p>
          <Link to="/auth" className="mt-4 inline-block">
            <Button size="lg">Masuk / Daftar</Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (!configured) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-6 text-center">
          <p className="font-display text-lg font-bold">
            Fitur online belum aktif
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Battle butuh koneksi online. Kuis Kilat tetap bisa dimainkan
            tanpa login.
          </p>
          <Link to="/main/kuis-kilat" className="mt-4 inline-block">
            <Button>Main Kuis Kilat</Button>
          </Link>
        </Card>
      </div>
    )
  }

  if (authLoading || phase === 'loading') {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-6 text-center">
          <p className="text-sm font-semibold text-ink/60">
            Lagi memuat battle...
          </p>
        </Card>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Link
          to="/main/battle"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline"
        >
          <ArrowLeftIcon width={16} height={16} />
          Kembali ke lobi battle
        </Link>
        <Card className="p-6 text-center">
          <p className="font-display text-lg font-bold">Ups, ada kendala</p>
          <p className="mt-2 text-sm text-ink/60">
            {message ?? 'Battle gagal dimuat, coba lagi ya.'}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => navigate('/main/battle')}>
              Ke lobi battle
            </Button>
            <Link to="/auth">
              <Button variant="outline">Masuk / Daftar</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  if (phase === 'cancelled') {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-6 text-center">
          <p className="font-display text-lg font-bold">
            Battle ini dibatalkan
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Battle dibatalkan host atau ditinggal salah satu pemain.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => navigate('/main/battle')}>
              Buat battle baru
            </Button>
            <Link to="/main">
              <Button variant="outline">Ke Hub Game</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  if (phase === 'lobby') {
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
            <SwordsIcon width={28} height={28} className="text-primary-600" />
            Battle 1v1
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-ink/60">
            Buat battle lalu bagikan kodenya, atau masukkan kode battle
            temanmu. 10 soal yang sama, yang paling banyak benar menang,
            seri ditentukan waktu tercepat.
          </p>
        </header>

        {message && (
          <p className="rounded-2xl border border-line bg-white px-4 py-3 text-sm font-medium text-ink/70 shadow-soft">
            {message}
          </p>
        )}

        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-extrabold">
            Buat battle baru
          </h2>
          <p className="text-sm leading-relaxed text-ink/60">
            Kamu jadi host. Setelah battle dibuat, bagikan kode 6
            karakternya ke lawanmu.
          </p>
          <Button size="lg" onClick={handleCreate} disabled={busy}>
            {busy ? 'Lagi membuat...' : 'Buat battle'}
          </Button>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-extrabold">
            Gabung battle teman
          </h2>
          <label
            htmlFor="battle-code"
            className="text-sm font-semibold text-ink/70"
          >
            Kode battle (6 karakter)
          </label>
          <input
            id="battle-code"
            type="text"
            value={joinCode}
            onChange={(e) =>
              setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
            }
            maxLength={6}
            placeholder="Misal K7Q2XA"
            autoCapitalize="characters"
            className="rounded-xl border border-line bg-white px-4 py-3 font-display text-lg font-bold tracking-[0.2em] uppercase outline-none placeholder:font-sans placeholder:text-sm placeholder:font-medium placeholder:normal-case placeholder:tracking-normal focus:border-primary-600"
          />
          <Button
            size="lg"
            variant="outline"
            onClick={handleJoinByCode}
            disabled={busy || joinCode.trim().length === 0}
          >
            {busy ? 'Lagi gabung...' : 'Gabung battle'}
          </Button>
        </Card>
      </div>
    )
  }

  if (phase === 'join' && battle) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-6 text-center">
          <p className="kicker">Kode {battle.code}</p>
          <h1 className="mt-2 font-display text-2xl font-extrabold">
            Diajak battle nih
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            Host battle ini adalah{' '}
            <span className="font-bold text-ink">
              {names[battle.host_id] ?? 'seorang pejuang'}
            </span>
            . Begitu kamu gabung, battle langsung mulai dan kalian
            mengerjakan 10 soal yang sama.
          </p>
          {message && (
            <p className="mt-3 text-sm font-medium text-ink/70">{message}</p>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={handleJoinThis} disabled={busy}>
              {busy ? 'Lagi gabung...' : 'Gabung battle ini'}
            </Button>
            <Link to="/main/battle">
              <Button size="lg" variant="outline">
                Bukan, ke lobi aja
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  if (phase === 'waiting' && battle) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="text-center">
          <p className="kicker">Battle dibuat</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">
            Menunggu lawan gabung
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Bagikan kode ini ke temanmu. Battle mulai otomatis begitu
            lawan gabung.
          </p>
        </header>
        <Card className="text-center">
          <p className="text-xs font-extrabold tracking-wide text-ink/60 uppercase">
            Kode battle
          </p>
          <p className="mt-1 font-display text-5xl font-extrabold tracking-[0.15em]">
            {battle.code}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => handleCopyCode(battle.code)}
          >
            <ShareIcon width={16} height={16} />
            {copied ? 'Kode tersalin' : 'Salin kode'}
          </Button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-ink/60">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary-600" />
            Lagi menunggu lawan...
          </p>
        </Card>
        <Button variant="ghost" onClick={handleCancel}>
          Batalkan battle
        </Button>
      </div>
    )
  }

  if (phase === 'done' && battle) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-6 text-center">
          <TrophyIcon
            width={40}
            height={40}
            className="mx-auto text-primary-600"
          />
          <h1 className="mt-3 font-display text-2xl font-extrabold">
            Kamu sudah selesai!
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            Skormu: {myCorrect} benar dari {total} soal, waktu{' '}
            {formatTime(elapsedMs)}. Lagi menunggu {opponentName}{' '}
            menyelesaikan battle.
          </p>
          {oppFinished && (
            <p className="mt-2 text-sm font-semibold text-primary-700">
              Lawan sudah selesai, hasil lagi dihitung...
            </p>
          )}
          {oppLeft && (
            <p className="mt-2 rounded-xl bg-accent-100 px-3 py-2 text-sm font-semibold text-accent-800">
              Lawan keluar dari battle. Kamu bisa mengakhiri battle
              sekarang, kemenangan jatuh ke kamu karena lawan tidak
              menyelesaikan battle.
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {oppLeft && (
              <Button onClick={handleFinishEarly}>
                Akhiri battle dan lihat hasil
              </Button>
            )}
            <Button onClick={() => navigate('/main/battle')}>
              Buat battle baru
            </Button>
            <Link to="/main">
              <Button variant="outline">Ke Hub Game</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  if (phase === 'result' && battle) {
    const winner = decideBattleWinner(battle)
    const myRole = role ?? (battle.host_id === userId ? 'host' : 'guest')
    const myScore =
      myRole === 'host' ? battle.host_score : battle.guest_score
    const oppScore =
      myRole === 'host' ? battle.guest_score : battle.host_score
    const myTime =
      myRole === 'host' ? battle.host_time_ms : battle.guest_time_ms
    const oppTime =
      myRole === 'host' ? battle.guest_time_ms : battle.host_time_ms
    /* Forfeit: satu pihak tidak menyelesaikan battle (keluar di tengah). */
    const forfeitWin = winner === null && myTime !== null && oppTime === null
    const forfeitLose =
      winner === null && myTime === null && oppTime !== null
    const noWinner = winner === null && !forfeitWin && !forfeitLose
    const iWon = winner === myRole || forfeitWin
    const isDraw = winner === 'draw'
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="text-center">
          <p className="text-4xl" aria-hidden="true">
            {noWinner ? '🏁' : isDraw ? '🤝' : iWon ? '🏆' : '💪'}
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">
            {noWinner
              ? 'Battle selesai'
              : isDraw
                ? 'Seri, sama kuat!'
                : iWon
                  ? 'Kamu menang!'
                  : `${opponentName} menang`}
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Battle {battle.code} sudah selesai.
            {forfeitWin &&
              ' Lawan tidak menyelesaikan battle, jadi kemenangan jatuh ke kamu.'}
            {forfeitLose &&
              ' Kamu tidak menyelesaikan battle, jadi kemenangan jatuh ke lawan.'}
          </p>
        </header>

        <Card>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="flex items-center justify-center gap-1.5 text-xs font-extrabold tracking-wide text-ink/60 uppercase">
                {iWon && !isDraw && (
                  <CrownIcon width={14} height={14} className="text-accent-500" />
                )}
                Kamu
              </p>
              <p className="mt-1 font-display text-4xl font-extrabold">
                {myScore}
                <span className="text-lg font-semibold text-ink/60">
                  /{total}
                </span>
              </p>
              <p className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-ink/60">
                <ClockIcon width={13} height={13} />
                {myTime !== null ? formatTime(myTime) : 'belum selesai'}
              </p>
            </div>
            <div>
              <p className="flex items-center justify-center gap-1.5 text-xs font-extrabold tracking-wide text-ink/60 uppercase">
                {!iWon && !isDraw && !noWinner && (
                  <CrownIcon width={14} height={14} className="text-accent-500" />
                )}
                {opponentName}
              </p>
              <p className="mt-1 font-display text-4xl font-extrabold">
                {oppScore}
                <span className="text-lg font-semibold text-ink/60">
                  /{total}
                </span>
              </p>
              <p className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-ink/60">
                <ClockIcon width={13} height={13} />
                {oppTime !== null ? formatTime(oppTime) : 'belum selesai'}
              </p>
            </div>
          </div>
          {isDraw && (
            <p className="mt-3 text-center text-sm font-medium text-ink/60">
              Skor sama dan waktu sama persis, susah dicari tandingannya.
            </p>
          )}
          {!isDraw && myScore === oppScore && (
            <p className="mt-3 text-center text-sm font-medium text-ink/60">
              Skor sama, jadi pemenang ditentukan waktu tercepat.
            </p>
          )}
        </Card>

        {questions.length > 0 && answeredCount > 0 && (
          <section aria-label="Ringkasan jawabanmu">
            <h2 className="mb-2 font-display text-base font-extrabold">
              Ringkasan jawabanmu
            </h2>
            <div className="flex flex-col gap-2">
              {questions.map((q, i) => {
                const answer = answers[q.id]
                const benar = answer !== undefined && answer === q.kunci
                return (
                  <Card key={q.id} className="flex items-start gap-3 py-3">
                    <span
                      className={
                        benar
                          ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700'
                          : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700'
                      }
                    >
                      {benar ? (
                        <CheckIcon width={15} height={15} />
                      ) : (
                        <XIcon width={15} height={15} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug font-semibold">
                        <span className="text-ink/60">Soal {i + 1} · </span>
                        {q.soal.length > 90
                          ? `${q.soal.slice(0, 90)}...`
                          : q.soal}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-ink/60">
                        {benar
                          ? 'Benar'
                          : `Jawabanmu ${answer ?? 'kosong'} · kunci ${q.kunci}`}
                      </p>
                    </div>
                    <Badge tone="neutral" className="shrink-0">
                      {q.materi}
                    </Badge>
                  </Card>
                )
              })}
            </div>
          </section>
        )}

        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth onClick={() => navigate('/main/battle')}>
            Battle lagi
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

  /* Arena: jawab soal satu per satu. */
  if (phase === 'arena' && question) {
    const opsiTampil = visibleOptions(question)
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="kicker flex items-center gap-1.5">
              <SwordsIcon width={16} height={16} />
              Battle {battle?.code}
            </p>
            <p className="flex items-center gap-1.5 text-sm font-extrabold text-ink/70">
              <ClockIcon width={16} height={16} />
              {formatTime(elapsedMs)}
            </p>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <ProgressBar
              value={answeredCount}
              max={total}
              label="Progres battle"
              className="flex-1"
            />
            <span className="shrink-0 text-xs font-extrabold whitespace-nowrap text-ink/60">
              Soal {index + 1} dari {total}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="green">Benar: {myCorrect}</Badge>
            <Badge tone="neutral">
              {opponentName} sudah jawab {oppAnswered}/{total}
            </Badge>
            {oppFinished && (
              <Badge tone="amber">{opponentName} sudah selesai</Badge>
            )}
          </div>
          {oppLeft && (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-accent-100 px-3 py-2 text-sm font-semibold text-accent-800">
              <InfoIcon width={16} height={16} className="mt-0.5 shrink-0" />
              {opponentName} keluar dari battle. Kamu tetap bisa
              menyelesaikan soalmu, hasilnya dihitung dari skor yang
              terkirim.
            </p>
          )}
          {message && (
            <p className="mt-3 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink/70">
              {message}
            </p>
          )}
        </header>

        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{question.materi}</Badge>
              <span className="text-xs font-extrabold tracking-wide text-ink/60 uppercase">
                Soal {index + 1} dari {total}
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
                  state={selected === opsi ? 'selected' : 'default'}
                  onClick={() => setSelected(opsi)}
                />
              ))}
            </div>
          </div>
        </Card>

        <Button
          size="lg"
          fullWidth
          onClick={handleAnswer}
          disabled={selected === null}
        >
          {index + 1 >= total ? 'Jawab dan lihat hasil' : 'Jawab'}
        </Button>
        <button
          type="button"
          onClick={handleCancel}
          className="text-center text-sm font-semibold text-ink/50 hover:text-ink/80 hover:underline"
        >
          Keluar dari battle (battle dibatalkan)
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Card className="p-6 text-center">
        <p className="font-display text-lg font-bold">
          Soal battle gagal dimuat
        </p>
        <p className="mt-2 text-sm text-ink/60">
          Soal battle ini tidak ditemukan di bank soal lokal. Coba buat
          battle baru ya.
        </p>
        <Button className="mt-4" onClick={() => navigate('/main/battle')}>
          Ke lobi battle
        </Button>
      </Card>
    </div>
  )
}
