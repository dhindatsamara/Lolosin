/**
 * Host sesi ala Quizizz (/main/sesi/host dan /main/sesi/host/:code).
 *
 * Host adalah fitur premium: halaman ini mengecek profiles.is_premium
 * lewat lib/premium.ts. Bila bukan premium, tampil penjelasan dan link
 * ke halaman Profil, bukan form buat sesi. Bila kolom is_premium belum
 * ada di database (migrasi 003 belum jalan), dianggap bukan premium
 * dengan pesan ramah.
 *
 * Alur host: buat sesi (dapat kode 6 karakter) lalu lobi pemain,
 * mulai sesi, pantau leaderboard live, akhiri sesi, podium akhir.
 * Host tidak ikut menjawab soal, ia memandu sesi.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthUser } from '../lib/auth'
import { getPremiumStatus, PREMIUM_BETA_MESSAGE } from '../lib/premium'
import {
  createGameSession,
  finishGameSession,
  getGameSessionByCode,
  getGameSessionById,
  listGamePlayers,
  SESSION_MAX_PLAYERS,
  startGameSession,
  subscribeSessionChannel,
  subscribeSessionPlayers,
  type GamePlayerRow,
  type GameSessionRow,
  type SessionChannel,
} from '../lib/session'
import { isSupabaseConfigured } from '../lib/supabase'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmModal } from '../components/quiz/ConfirmModal'
import {
  ArrowLeftIcon,
  CrownIcon,
  InfoIcon,
  PlayIcon,
  ShareIcon,
  SparklesIcon,
  TrophyIcon,
  UsersIcon,
  XIcon,
} from '../components/icons'

const POLL_MS = 4000

type Phase = 'loading' | 'gate' | 'create' | 'lobby' | 'active' | 'finished' | 'error'

export function SessionHostPage() {
  const { code } = useParams<{ code?: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuthUser()
  const configured = isSupabaseConfigured()

  const [phase, setPhase] = useState<Phase>('loading')
  const [session, setSession] = useState<GameSessionRow | null>(null)
  const [players, setPlayers] = useState<GamePlayerRow[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showFinishConfirm, setShowFinishConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const [premiumChecked, setPremiumChecked] = useState(false)

  const channelRef = useRef<SessionChannel | null>(null)

  const userId = user?.id ?? null

  /* Cek premium dulu, baru muat atau siapkan sesi. */
  useEffect(() => {
    if (authLoading) return
    if (!configured || !userId) {
      setPhase('gate')
      return
    }
    let cancelled = false
    setPhase('loading')
    getPremiumStatus(userId).then((status) => {
      if (cancelled) return
      setPremiumChecked(true)
      if (!status.premium) {
        setPhase('gate')
        return
      }
      if (!code) {
        setPhase('create')
        return
      }
      getGameSessionByCode(code).then((result) => {
        if (cancelled) return
        if (!result.ok || !result.data) {
          setMessage(result.error ?? 'Sesi gagal dimuat, coba lagi ya.')
          setPhase('error')
          return
        }
        const row = result.data
        if (row.host_id !== userId) {
          setMessage('Kamu bukan host sesi ini. Ikut main lewat halaman Sesi aja ya.')
          setPhase('error')
          return
        }
        setSession(row)
        setPhase(
          row.status === 'lobby'
            ? 'lobby'
            : row.status === 'active'
              ? 'active'
              : 'finished',
        )
      })
    })
    return () => {
      cancelled = true
    }
  }, [code, authLoading, configured, userId])

  /* Refresh daftar pemain (dipakai polling, broadcast, dan postgres changes). */
  async function refreshPlayers(sessionId: string) {
    const rows = await listGamePlayers(sessionId)
    setPlayers(rows)
  }

  /* Polling sesi + pemain sebagai cadangan Realtime. */
  useEffect(() => {
    if (!session) return
    if (phase !== 'lobby' && phase !== 'active') return
    void refreshPlayers(session.id)
    const timer = setInterval(() => {
      void getGameSessionById(session.id).then((result) => {
        if (!result.ok || !result.data) return
        setSession(result.data)
        if (result.data.status === 'finished') setPhase('finished')
        if (result.data.status === 'active') setPhase('active')
      })
      void refreshPlayers(session.id)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [session?.id, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Muat pemain sekali saat masuk layar podium. */
  useEffect(() => {
    if (phase === 'finished' && session) {
      void refreshPlayers(session.id)
    }
  }, [phase, session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Channel broadcast + postgres changes untuk leaderboard live. */
  useEffect(() => {
    if (!session) return
    if (phase !== 'lobby' && phase !== 'active') return
    const channel = subscribeSessionChannel(session.code, {
      onPlayerJoined: () => void refreshPlayers(session.id),
      onPlayerAnswered: () => void refreshPlayers(session.id),
      onPlayerLeft: () => void refreshPlayers(session.id),
    })
    channelRef.current = channel
    const unsubscribePlayers = subscribeSessionPlayers(session.id, () => {
      void refreshPlayers(session.id)
    })
    return () => {
      channel?.unsubscribe()
      channelRef.current = null
      unsubscribePlayers?.()
    }
  }, [session?.id, session?.code, phase]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const result = await createGameSession(userId)
    setBusy(false)
    if (!result.ok || !result.data) {
      setMessage(result.error ?? 'Sesi gagal dibuat, coba lagi ya.')
      return
    }
    navigate(`/main/sesi/host/${result.data.code}`)
  }

  async function handleStart() {
    if (!session || !userId) return
    setBusy(true)
    setMessage(null)
    const result = await startGameSession(session.id, userId)
    setBusy(false)
    if (!result.ok || !result.data) {
      setMessage(result.error ?? 'Sesi gagal dimulai, coba lagi ya.')
      return
    }
    setSession(result.data)
    channelRef.current?.send('started', {})
    setPhase('active')
  }

  async function handleFinish() {
    if (!session || !userId) return
    setBusy(true)
    setMessage(null)
    const result = await finishGameSession(session.id, userId)
    setBusy(false)
    if (!result.ok || !result.data) {
      setMessage(result.error ?? 'Sesi gagal diakhiri, coba lagi ya.')
      return
    }
    setSession(result.data)
    channelRef.current?.send('finished', {})
    await refreshPlayers(session.id)
    setPhase('finished')
  }

  if (authLoading || phase === 'loading') {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-6 text-center">
          <p className="text-sm font-semibold text-ink/60">
            Lagi memeriksa sesi...
          </p>
        </Card>
      </div>
    )
  }

  /* Gate premium (termasuk belum login dan Supabase belum aktif). */
  if (phase === 'gate') {
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
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-100 text-accent-700">
            <CrownIcon width={28} height={28} />
          </span>
          <h1 className="mt-3 font-display text-2xl font-extrabold">
            Jadi Host itu fitur Premium
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink/60">
            {!configured
              ? 'Fitur online belum aktif, jadi sesi belum bisa dibuat. Kuis Kilat tetap bisa dimainkan tanpa login.'
              : !user
                ? 'Masuk dulu, lalu aktifkan Premium Beta dari halaman Profil biar bisa jadi host sesi.'
                : premiumChecked
                  ? `${PREMIUM_BETA_MESSAGE}. Selama beta, Premium gratis dan bisa diaktifkan langsung dari halaman Profil.`
                  : 'Aktifkan Premium Beta dulu dari halaman Profil biar bisa jadi host sesi.'}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {configured && user ? (
              <Link to="/profil">
                <Button size="lg">Ke halaman Profil</Button>
              </Link>
            ) : configured ? (
              <Link to="/auth">
                <Button size="lg">Masuk / Daftar</Button>
              </Link>
            ) : (
              <Link to="/main/kuis-kilat">
                <Button size="lg">Main Kuis Kilat</Button>
              </Link>
            )}
            <Link to="/main/sesi">
              <Button size="lg" variant="outline">
                Ikut sesi aja (gratis)
              </Button>
            </Link>
          </div>
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
          <p className="font-display text-lg font-bold">Ups, ada kendala</p>
          <p className="mt-2 text-sm text-ink/60">
            {message ?? 'Sesi gagal dimuat, coba lagi ya.'}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => navigate('/main/sesi/host')}>
              Buat sesi baru
            </Button>
            <Link to="/main/sesi">
              <Button variant="outline">Ikut sesi</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  if (phase === 'create') {
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
            Jadi Host Sesi
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-ink/60">
            Buat sesi, bagikan kodenya ke pemain (maks {SESSION_MAX_PLAYERS}{' '}
            orang), lalu mulai saat semua sudah siap. Semua pemain menjawab
            10 soal yang sama, dan kamu memantau leaderboard live.
          </p>
        </header>

        {message && (
          <p className="rounded-2xl border border-line bg-white px-4 py-3 text-sm font-medium text-ink/70 shadow-soft">
            {message}
          </p>
        )}

        <Card className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-sm leading-relaxed text-ink/70">
            <InfoIcon width={18} height={18} className="mt-0.5 shrink-0" />
            Kamu memandu sesi, bukan ikut menjawab. Tetap buka halaman
            ini selama sesi berjalan, supaya leaderboard live tetap
            terpantau.
          </p>
          <Button size="lg" onClick={handleCreate} disabled={busy}>
            <SparklesIcon width={18} height={18} />
            {busy ? 'Lagi membuat...' : 'Buat sesi baru'}
          </Button>
        </Card>
      </div>
    )
  }

  if (phase === 'lobby' && session) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="text-center">
          <p className="kicker">Lobi sesi</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">
            Pemain lagi gabung
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Bagikan kode ini, lalu mulai saat semua sudah siap.
          </p>
        </header>

        <Card className="text-center">
          <p className="text-xs font-extrabold tracking-wide text-ink/60 uppercase">
            Kode sesi
          </p>
          <p className="mt-1 font-display text-5xl font-extrabold tracking-[0.15em]">
            {session.code}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => handleCopyCode(session.code)}
          >
            <ShareIcon width={16} height={16} />
            {copied ? 'Kode tersalin' : 'Salin kode'}
          </Button>
        </Card>

        {message && (
          <p className="rounded-2xl border border-line bg-white px-4 py-3 text-sm font-medium text-ink/70 shadow-soft">
            {message}
          </p>
        )}

        <Card>
          <h2 className="flex items-center justify-between font-display text-lg font-extrabold">
            Pemain
            <Badge tone="green">
              {players.length}/{session.max_players}
            </Badge>
          </h2>
          {players.length === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-ink/60">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary-600" />
              Belum ada yang gabung. Bagikan kodenya dulu ya.
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
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Button
          size="lg"
          fullWidth
          onClick={handleStart}
          disabled={busy || players.length === 0}
        >
          <PlayIcon width={18} height={18} />
          {busy
            ? 'Lagi memulai...'
            : players.length === 0
              ? 'Tunggu pemain gabung dulu'
              : `Mulai sesi (${players.length} pemain)`}
        </Button>
      </div>
    )
  }

  if (phase === 'active' && session) {
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
          <h1 className="mt-2 font-display text-3xl font-extrabold">
            Sesi berjalan · {session.code}
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Leaderboard live: skor berubah begitu pemain mengirim
            jawaban. Akhiri sesi saat semua sudah selesai menjawab.
          </p>
        </header>

        {message && (
          <p className="rounded-2xl border border-line bg-white px-4 py-3 text-sm font-medium text-ink/70 shadow-soft">
            {message}
          </p>
        )}

        <Card>
          <h2 className="font-display text-lg font-extrabold">
            Leaderboard live
          </h2>
          {players.length === 0 ? (
            <p className="mt-2 text-sm text-ink/60">
              Belum ada jawaban masuk.
            </p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {players.map((player, i) => (
                <li
                  key={player.id}
                  className="flex items-center gap-3 rounded-xl bg-ink/5 px-3 py-2.5"
                >
                  <span className="w-6 shrink-0 text-center font-display text-base font-extrabold">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {player.display_name}
                  </span>
                  <span className="shrink-0 text-xs font-bold text-ink/60">
                    {player.answered_count}/10 soal
                  </span>
                  <span className="shrink-0 rounded-full bg-primary-100 px-2.5 py-0.5 text-sm font-extrabold text-primary-700">
                    {player.score}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Button
          size="lg"
          fullWidth
          variant="secondary"
          onClick={() => setShowFinishConfirm(true)}
          disabled={busy}
        >
          <TrophyIcon width={18} height={18} />
          {busy ? 'Lagi mengakhiri...' : 'Akhiri sesi dan tampilkan podium'}
        </Button>
        <ConfirmModal
          open={showFinishConfirm}
          title="Akhiri sesi sekarang?"
          body="Pemain yang belum selesai tidak bisa lanjut menjawab, dan podium langsung ditampilkan."
          confirmLabel="Ya, akhiri"
          cancelLabel="Lanjut memantau"
          icon={<XIcon width={22} height={22} />}
          onConfirm={() => {
            setShowFinishConfirm(false)
            void handleFinish()
          }}
          onCancel={() => setShowFinishConfirm(false)}
        />
      </div>
    )
  }

  /* Podium akhir. */
  if (phase === 'finished' && session) {
    const top3 = players.slice(0, 3)
    const rest = players.slice(3)
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
                  </span>
                  <span className="shrink-0 rounded-full bg-primary-100 px-3 py-1 text-sm font-extrabold text-primary-700">
                    {player.score} benar
                  </span>
                </li>
              ))}
            </ol>
          )}
          {rest.length > 0 && (
            <ol className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
              {rest.map((player, i) => (
                <li
                  key={player.id}
                  className="flex items-center gap-3 text-sm font-semibold"
                >
                  <span className="w-6 text-center font-extrabold text-ink/60">
                    {i + 4}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {player.display_name}
                  </span>
                  <span className="shrink-0 text-ink/60">
                    {player.score} benar
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth onClick={() => navigate('/main/sesi/host')}>
            Buat sesi baru
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

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Card className="p-6 text-center">
        <p className="font-display text-lg font-bold">
          Sesi gagal dimuat
        </p>
        <p className="mt-2 text-sm text-ink/60">
          Coba buat sesi baru ya.
        </p>
        <Button className="mt-4" onClick={() => navigate('/main/sesi/host')}>
          Buat sesi baru
        </Button>
      </Card>
    </div>
  )
}
