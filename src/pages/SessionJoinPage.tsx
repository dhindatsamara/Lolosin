/**
 * Ikut sesi ala Quizizz (/main/sesi).
 *
 * Alur: masukkan kode sesi, gabung (maks 50 pemain per sesi), tunggu
 * host memulai, jawab 10 soal yang sama dengan semua pemain, lihat
 * posisi di leaderboard, lalu podium akhir. Ikut main gratis, wajib
 * login. Host yang memulai dan mengakhiri sesi.
 *
 * Setiap jawaban dikirim ke database (update game_players.score) dan
 * disiarkan lewat broadcast, supaya leaderboard host ikut berubah.
 * Polling ringan tiap 4 detik jadi cadangan bila Realtime tidak
 * tersambung.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMyProfile, useAuthUser } from '../lib/auth'
import { resolveGameQuestions } from '../lib/battle'
import type { Opsi, Question } from '../lib/questions'
import { visibleOptions } from '../lib/quiz'
import {
  getGameSessionByCode,
  getGameSessionById,
  joinGameSession,
  leaveGameSession,
  listGamePlayers,
  subscribeSessionChannel,
  updatePlayerProgress,
  type GamePlayerRow,
  type GameSessionRow,
  type SessionChannel,
} from '../lib/session'
import { isSupabaseConfigured } from '../lib/supabase'
import { markSeen, recordActivity } from '../lib/store'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { MathText } from '../components/MathText'
import { OptionButton } from '../components/quiz/OptionButton'
import { ConfirmModal } from '../components/quiz/ConfirmModal'
import {
  ArrowLeftIcon,
  CheckIcon,
  InfoIcon,
  PlayIcon,
  TrophyIcon,
  UsersIcon,
  XIcon,
} from '../components/icons'

const POLL_MS = 4000

type Phase =
  | 'loading'
  | 'form'
  | 'waiting'
  | 'arena'
  | 'done'
  | 'finished'
  | 'error'

export function SessionJoinPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuthUser()
  const configured = isSupabaseConfigured()

  const [phase, setPhase] = useState<Phase>('loading')
  const [session, setSession] = useState<GameSessionRow | null>(null)
  const [me, setMe] = useState<GamePlayerRow | null>(null)
  const [players, setPlayers] = useState<GamePlayerRow[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [username, setUsername] = useState('')

  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<Opsi | null>(null)
  const [answers, setAnswers] = useState<Record<string, Opsi>>({})

  const channelRef = useRef<SessionChannel | null>(null)
  const finishedRef = useRef(false)

  const userId = user?.id ?? null

  /* Username sendiri, dipakai sebagai nama tampilan di leaderboard. */
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

  useEffect(() => {
    if (authLoading) return
    if (!configured || !userId) {
      setPhase('error')
      setMessage(
        configured
          ? 'Masuk dulu biar bisa ikut sesi.'
          : 'Fitur online belum aktif.',
      )
      return
    }
    setPhase('form')
  }, [authLoading, configured, userId])

  async function refreshPlayers(sessionId: string) {
    const rows = await listGamePlayers(sessionId)
    setPlayers(rows)
    const mine = rows.find((row) => row.user_id === userId)
    if (mine) setMe(mine)
  }

  /* Polling status sesi + leaderboard, cadangan Realtime. */
  useEffect(() => {
    if (!session) return
    if (
      phase !== 'waiting' &&
      phase !== 'arena' &&
      phase !== 'done'
    ) {
      return
    }
    void refreshPlayers(session.id)
    const timer = setInterval(() => {
      void getGameSessionById(session.id).then((result) => {
        if (!result.ok || !result.data) return
        const row = result.data
        setSession(row)
        if (row.status === 'active') {
          setQuestions((current) =>
            current.length > 0
              ? current
              : resolveGameQuestions(row.question_ids),
          )
          setPhase((current) =>
            current === 'waiting' ? 'arena' : current,
          )
        }
        if (row.status === 'finished') setPhase('finished')
      })
      void refreshPlayers(session.id)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [session?.id, phase, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Muat podium saat sesi selesai. */
  useEffect(() => {
    if (phase === 'finished' && session) {
      void refreshPlayers(session.id)
    }
  }, [phase, session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Channel broadcast sesi: mulai, selesai, dan update pemain. */
  useEffect(() => {
    if (!session) return
    if (phase !== 'waiting' && phase !== 'arena' && phase !== 'done') {
      return
    }
    const channel = subscribeSessionChannel(session.code, {
      onStarted: () => {
        setQuestions(resolveGameQuestions(session.question_ids))
        setPhase((current) => (current === 'waiting' ? 'arena' : current))
      },
      onFinished: () => setPhase('finished'),
      onPlayerAnswered: () => void refreshPlayers(session.id),
      onPlayerJoined: () => void refreshPlayers(session.id),
      onPlayerLeft: () => void refreshPlayers(session.id),
    })
    channelRef.current = channel
    return () => {
      channel?.unsubscribe()
      channelRef.current = null
    }
  }, [session?.id, session?.code, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleJoin() {
    if (!userId) return
    const clean = joinCode.trim().toUpperCase()
    if (clean.length === 0) {
      setMessage('Isi dulu kode sesinya ya.')
      return
    }
    setBusy(true)
    setMessage(null)
    const found = await getGameSessionByCode(clean)
    if (!found.ok || !found.data) {
      setBusy(false)
      setMessage(found.error ?? 'Kode sesi tidak ditemukan, cek lagi ya.')
      return
    }
    const joined = await joinGameSession(
      found.data,
      userId,
      username || 'Pejuang',
    )
    setBusy(false)
    if (!joined.ok || !joined.data) {
      setMessage(joined.error ?? 'Gagal gabung sesi, coba lagi ya.')
      return
    }
    setSession(found.data)
    setMe(joined.data)
    channelRef.current?.send('player-joined', {
      userId,
      displayName: joined.data.display_name,
    })
    if (found.data.status === 'active') {
      setQuestions(resolveGameQuestions(found.data.question_ids))
      setPhase('arena')
    } else if (found.data.status === 'finished') {
      setPhase('finished')
    } else {
      setPhase('waiting')
    }
  }

  async function handleLeave() {
    if (!session || !userId) return
    channelRef.current?.send('player-left', { userId })
    await leaveGameSession(session.id, userId)
    navigate('/main')
  }

  async function handleAnswer() {
    if (!session || !userId || !me || selected === null) return
    const question = questions[index]
    if (!question) return
    const correct = selected === question.kunci
    setBusy(true)
    const result = await updatePlayerProgress(
      session.id,
      userId,
      correct,
    )
    setBusy(false)
    if (!result.ok || !result.data) {
      setMessage(result.error ?? 'Jawaban gagal terkirim, coba lagi ya.')
      return
    }
    setMe(result.data)
    setAnswers((prev) => ({ ...prev, [question.id]: selected }))
    channelRef.current?.send('player-answered', {
      userId,
      displayName: result.data.display_name,
      score: result.data.score,
      answered: result.data.answered_count,
    })
    setSelected(null)
    setMessage(null)
    if (index + 1 >= questions.length) {
      finishArena(question.id)
    } else {
      setIndex((i) => i + 1)
    }
  }

  function finishArena(lastQuestionId?: string) {
    if (finishedRef.current) return
    finishedRef.current = true
    const seenIds = [...Object.keys(answers)]
    if (lastQuestionId) seenIds.push(lastQuestionId)
    markSeen(seenIds)
    recordActivity()
    setPhase('done')
  }

  const total = questions.length || 10
  const question = questions[index]
  const answeredCount = me?.answered_count ?? Object.keys(answers).length
  const myRank =
    players.findIndex((row) => row.user_id === userId) + 1
  const top3 = players.slice(0, 3)

  if (authLoading || phase === 'loading') {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-6 text-center">
          <p className="text-sm font-semibold text-ink/60">
            Lagi memuat sesi...
          </p>
        </Card>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Link
          to="/main"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline"
        >
          <ArrowLeftIcon width={16} height={16} />
          Hub Game
        </Link>
        <Card className="p-6 text-center">
          <UsersIcon
            width={40}
            height={40}
            className="mx-auto text-primary-600"
          />
          <h1 className="mt-3 font-display text-2xl font-extrabold">
            Ikut Sesi
          </h1>
          <p className="mt-2 text-sm text-ink/60">
            {message ?? 'Sesi gagal dimuat, coba lagi ya.'}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {configured && !user ? (
              <Link to="/auth">
                <Button size="lg">Masuk / Daftar</Button>
              </Link>
            ) : (
              <Link to="/main/kuis-kilat">
                <Button size="lg">Main Kuis Kilat</Button>
              </Link>
            )}
            <Link to="/main">
              <Button size="lg" variant="outline">
                Ke Hub Game
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  if (phase === 'form') {
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
            <UsersIcon width={28} height={28} className="text-primary-600" />
            Ikut Sesi Bareng
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-ink/60">
            Masukkan kode sesi dari host, lalu tunggu host memulai.
            Semua pemain menjawab 10 soal yang sama, pemenang naik
            podium di akhir. Ikut main gratis.
          </p>
        </header>

        {message && (
          <p className="rounded-2xl border border-line bg-white px-4 py-3 text-sm font-medium text-ink/70 shadow-soft">
            {message}
          </p>
        )}

        <Card className="flex flex-col gap-3">
          <label
            htmlFor="session-code"
            className="text-sm font-semibold text-ink/70"
          >
            Kode sesi (6 karakter)
          </label>
          <input
            id="session-code"
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
            onClick={handleJoin}
            disabled={busy || joinCode.trim().length === 0}
          >
            <PlayIcon width={18} height={18} />
            {busy ? 'Lagi gabung...' : 'Gabung sesi'}
          </Button>
          <Link
            to="/main/sesi/host"
            className="text-center text-sm font-semibold text-primary-700 hover:underline"
          >
            Mau jadi host? Buka halaman host (Premium)
          </Link>
        </Card>
      </div>
    )
  }

  if (phase === 'waiting' && session) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="text-center">
          <p className="kicker">Sesi {session.code}</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">
            Kamu sudah gabung!
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Tunggu host memulai sesi. Soal muncul otomatis begitu sesi
            dimulai.
          </p>
        </header>

        <Card>
          <h2 className="flex items-center justify-between font-display text-lg font-extrabold">
            Pemain yang sudah gabung
            <Badge tone="green">
              {players.length}/{session.max_players}
            </Badge>
          </h2>
          {players.length === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-ink/60">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary-600" />
              Lagi memuat daftar pemain...
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {players.map((player) => (
                <li
                  key={player.id}
                  className="flex items-center gap-2 rounded-xl bg-ink/5 px-3 py-2 text-sm font-semibold"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-extrabold text-primary-700">
                    {player.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  {player.display_name}
                  {player.user_id === userId && (
                    <Badge tone="amber" className="ml-auto">
                      Kamu
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <button
          type="button"
          onClick={() => setShowLeaveConfirm(true)}
          className="text-center text-sm font-semibold text-ink/50 hover:text-ink/80 hover:underline"
        >
          Keluar dari sesi ini
        </button>
        <ConfirmModal
          open={showLeaveConfirm}
          title="Keluar dari sesi ini?"
          body="Kamu harus gabung lagi pakai kode kalau mau balik."
          confirmLabel="Ya, keluar"
          cancelLabel="Tetap di sesi"
          icon={<XIcon width={22} height={22} />}
          onConfirm={() => {
            setShowLeaveConfirm(false)
            void handleLeave()
          }}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      </div>
    )
  }

  if (phase === 'done' && session) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-6 text-center">
          <TrophyIcon
            width={40}
            height={40}
            className="mx-auto text-primary-600"
          />
          <h1 className="mt-3 font-display text-2xl font-extrabold">
            Kamu sudah selesai menjawab!
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/60">
            Skormu: {me?.score ?? 0} benar dari {total} soal
            {myRank > 0 && `, posisi ${myRank} dari ${players.length} pemain`}.
            Tunggu host mengakhiri sesi untuk melihat podium.
          </p>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-medium text-ink/60">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary-600" />
            Menunggu host mengakhiri sesi...
          </p>
          <div className="mt-4">
            <Link to="/main">
              <Button variant="outline">Ke Hub Game</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  if (phase === 'finished' && session) {
    const myEntry = players.find((row) => row.user_id === userId)
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="text-center">
          <p className="text-4xl" aria-hidden="true">
            🏆
          </p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">
            Sesi selesai!
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Podium sesi {session.code}.
            {myEntry && myRank > 0 && (
              <>
                {' '}
                Kamu di posisi {myRank} dengan {myEntry.score} jawaban
                benar.
              </>
            )}
          </p>
        </header>

        <Card>
          {top3.length === 0 ? (
            <p className="text-center text-sm text-ink/60">
              Tidak ada pemain yang menjawab di sesi ini.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {top3.map((player, i) => (
                <li
                  key={player.id}
                  className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3"
                >
                  <span className="text-2xl" aria-hidden="true">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-display text-lg font-extrabold">
                    {player.display_name}
                    {player.user_id === userId && (
                      <span className="ml-2 text-sm font-bold text-primary-700">
                        (kamu)
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 rounded-full bg-primary-100 px-3 py-1 text-sm font-extrabold text-primary-700">
                    {player.score} benar
                  </span>
                </li>
              ))}
            </ol>
          )}
          {players.length > 3 && (
            <ol className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
              {players.slice(3).map((player, i) => (
                <li
                  key={player.id}
                  className="flex items-center gap-3 text-sm font-semibold"
                >
                  <span className="w-6 text-center font-extrabold text-ink/60">
                    {i + 4}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {player.display_name}
                    {player.user_id === userId && ' (kamu)'}
                  </span>
                  <span className="shrink-0 text-ink/60">
                    {player.score} benar
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {questions.length > 0 && Object.keys(answers).length > 0 && (
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
          <Button size="lg" fullWidth onClick={() => navigate('/main/sesi')}>
            Ikut sesi lain
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
  if (phase === 'arena' && question && session) {
    const opsiTampil = visibleOptions(question)
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="kicker flex items-center gap-1.5">
              <UsersIcon width={16} height={16} />
              Sesi {session.code}
            </p>
            {myRank > 0 && (
              <Badge tone="green">
                Posisi {myRank} dari {players.length}
              </Badge>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <ProgressBar
              value={answeredCount}
              max={total}
              label="Progres sesi"
              className="flex-1"
            />
            <span className="shrink-0 text-xs font-extrabold whitespace-nowrap text-ink/60">
              Soal {index + 1} dari {total}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="green">Skormu: {me?.score ?? 0} benar</Badge>
            <Badge tone="neutral">
              {players.length} pemain di sesi ini
            </Badge>
          </div>
          {message && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink/70">
              <InfoIcon width={16} height={16} className="mt-0.5 shrink-0" />
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
              <MathText text={question.soal} />
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
          disabled={selected === null || busy}
        >
          {busy
            ? 'Lagi mengirim...'
            : index + 1 >= total
              ? 'Jawab dan selesai'
              : 'Jawab'}
        </Button>
        {!selected && (
          <p className="-mt-3 text-center text-xs font-medium text-ink/60">
            Pilih satu jawaban dulu, lalu tekan Jawab.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Card className="p-6 text-center">
        <p className="font-display text-lg font-bold">
          Soal sesi gagal dimuat
        </p>
        <p className="mt-2 text-sm text-ink/60">
          Soal sesi ini tidak ditemukan di bank soal lokal. Coba ikut
          sesi lain ya.
        </p>
        <Button className="mt-4" onClick={() => navigate('/main/sesi')}>
          Ikut sesi lain
        </Button>
      </Card>
    </div>
  )
}
