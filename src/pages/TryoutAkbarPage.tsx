import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthUser } from '../lib/auth'
import { SIMULASI_TIME_LIMIT_MINUTES, SIMULASI_TOTAL_QUESTIONS } from '../lib/quiz'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  countdownParts,
  currentEventWindow,
  fetchAkbarLeaderboard,
  formatEventHours,
  formatEventLabel,
  isEventWindowOpen,
  nextEventStart,
  type LeaderboardEntry,
} from '../lib/tryoutAkbar'
import { cx } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { GuestProgressWarning } from '../components/GuestProgressWarning'
import { ChevronRightIcon, ClockIcon, TrophyIcon } from '../components/icons'

/** Warna lingkaran peringkat (sama seperti halaman Peringkat). */
function rankCircleClass(rank: number): string {
  if (rank === 1) return 'bg-accent-400 text-ink'
  if (rank === 2) return 'bg-white text-ink'
  if (rank === 3) return 'bg-orange-200 text-orange-800'
  return 'bg-ink/5 text-ink/70'
}

/** Satu kotak angka hitung mundur. */
function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-16 flex-col items-center rounded-2xl bg-white px-2 py-2.5 shadow-soft">
      <span className="font-display text-2xl font-extrabold tabular-nums">
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[11px] font-bold text-ink/60">{label}</span>
    </div>
  )
}

/**
 * Halaman Tryout Akbar: event simulasi CAT bareng tiap Minggu
 * 09:00-11:00 WITA. Hitung mundur live ke event berikutnya, tombol
 * mulai yang aktif hanya saat jendela event terbuka, dan papan
 * peringkat khusus event minggu berjalan/terakhir.
 *
 * Tombol mulai memakai alur simulasi yang sudah ada: diarahkan ke
 * halaman Tryout dengan state startMode 'full', lalu halaman Tryout
 * membuka modal konfirmasi dan menjalankan simulasi CAT lengkap.
 * Hasilnya tersimpan normal sebagai tryout mode 'full'.
 */
export function TryoutAkbarPage() {
  const navigate = useNavigate()
  const { user } = useAuthUser()
  const [now, setNow] = useState(() => new Date())
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const configured = isSupabaseConfigured()

  // Hitung mundur live, tick tiap detik.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const windowOpen = isEventWindowOpen(now)
  const eventWindow = currentEventWindow(now)
  const countdownTarget = windowOpen ? eventWindow.end : nextEventStart(now)
  const countdown = countdownParts(countdownTarget, now)

  const loadEntries = useCallback(async () => {
    if (!configured) {
      setLoadingEntries(false)
      return
    }
    const result = await fetchAkbarLeaderboard(currentEventWindow())
    setEntries(result)
    setLoadingEntries(false)
  }, [configured])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  async function handleRefresh() {
    if (refreshing) return
    setRefreshing(true)
    await loadEntries()
    setRefreshing(false)
  }

  return (
    <div className="flex flex-col gap-5">
      <GuestProgressWarning />

      <header>
        <p className="kicker">event mingguan, bareng-bareng</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">
          Tryout Akbar
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink/60">
          Simulasi CAT 110 soal bareng semua pejuang, tiap Minggu{' '}
          {formatEventHours()}. Kerjakan di dalam jendela event biar
          skormu masuk papan peringkat minggu ini.
        </p>
      </header>

      <Card className="border-primary-200 bg-primary-50">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-extrabold">
                <ClockIcon width={18} height={18} className="text-primary-700" />
                {windowOpen
                  ? 'Event sedang berlangsung'
                  : `Event berikutnya: ${formatEventLabel(nextEventStart(now))}`}
              </p>
              <p className="mt-1 text-xs leading-relaxed font-medium text-ink/60">
                {windowOpen
                  ? 'Jendela event tutup pukul 11:00 WITA. Mulai sekarang biar sempat selesai.'
                  : `Jendela event ${formatEventHours()}. Tombol mulai aktif saat event dibuka.`}
              </p>
            </div>
            <Badge tone={windowOpen ? 'green' : 'neutral'}>
              {windowOpen ? 'Sedang berlangsung' : 'Belum dibuka'}
            </Badge>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold text-ink/60">
              {windowOpen ? 'Event berakhir dalam' : 'Event dimulai dalam'}
            </p>
            <div className="flex gap-2">
              <CountdownUnit value={countdown.days} label="hari" />
              <CountdownUnit value={countdown.hours} label="jam" />
              <CountdownUnit value={countdown.minutes} label="menit" />
              <CountdownUnit value={countdown.seconds} label="detik" />
            </div>
          </div>

          <div>
            <Button
              size="lg"
              fullWidth
              disabled={!windowOpen}
              onClick={() =>
                navigate('/tryout', { state: { startMode: 'full' } })
              }
            >
              <TrophyIcon width={18} height={18} />
              {windowOpen ? 'Mulai Tryout Akbar' : 'Ikut Tryout Akbar'}
            </Button>
            <p className="mt-2 text-center text-xs font-medium text-ink/60">
              {SIMULASI_TOTAL_QUESTIONS} soal · {SIMULASI_TIME_LIMIT_MINUTES}{' '}
              menit · suasana ujian beneran
            </p>
          </div>
        </div>
      </Card>

      <section aria-label="Cara ikut Tryout Akbar">
        <h2 className="mb-2 font-display text-base font-extrabold">
          Cara ikutnya
        </h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-sm font-extrabold">1. Datang pas jamnya</p>
            <p className="mt-1 text-xs leading-relaxed font-medium text-ink/60">
              Event dibuka Minggu 09:00 WITA dan ditutup 11:00 WITA.
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm font-extrabold">2. Kerjakan simulasi CAT</p>
            <p className="mt-1 text-xs leading-relaxed font-medium text-ink/60">
              110 soal, 100 menit, passing grade asli seperti SKD.
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm font-extrabold">3. Cek peringkatmu</p>
            <p className="mt-1 text-xs leading-relaxed font-medium text-ink/60">
              Skor terbaikmu di jendela event masuk papan peringkat di
              bawah ini.
            </p>
          </Card>
        </div>
      </section>

      <section aria-label="Hasil Tryout Akbar minggu ini">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-extrabold">
            Hasil Tryout Akbar minggu ini
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleRefresh()}
            disabled={!configured || refreshing}
          >
            {refreshing ? 'Memuat...' : 'Muat ulang'}
          </Button>
        </div>
        <p className="mb-3 text-xs leading-relaxed font-medium text-ink/60">
          Event {formatEventLabel(eventWindow.start)} ·{' '}
          {formatEventHours()} · skor terbaik tiap peserta
        </p>

        {!configured ? (
          <Card className="p-6 text-center">
            <p className="font-display text-base font-bold">
              Peringkat online belum aktif
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink/60">
              Hasil Tryout Akbar baru bisa ditampilkan kalau leaderboard
              online sudah aktif.
            </p>
          </Card>
        ) : loadingEntries ? (
          <Card className="p-6 text-center">
            <p className="text-sm font-medium text-ink/60">
              Memuat hasil event...
            </p>
          </Card>
        ) : entries.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="font-display text-base font-bold">
              Belum ada peserta minggu ini
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink/60">
              Belum ada yang menyelesaikan simulasi di jendela event ini.
              Ikut Minggu 09:00 WITA dan jadilah yang pertama masuk
              papan peringkat.
            </p>
            <Link
              to="/tryout"
              className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary-700 hover:underline"
            >
              Latihan simulasi dulu
              <ChevronRightIcon width={16} height={16} />
            </Link>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => {
              const isMe = user !== null && entry.userId === user.id
              return (
                <Card
                  key={entry.userId}
                  className={cx(
                    'py-3',
                    isMe && 'border-primary-300 bg-primary-50',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cx(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold',
                        rankCircleClass(entry.rank),
                      )}
                    >
                      {entry.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-extrabold">
                        <span className="truncate">{entry.username}</span>
                        {entry.passed && (
                          <Badge tone="amber">Lulus</Badge>
                        )}
                        {isMe && <Badge tone="green">Kamu</Badge>}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-ink/60">
                        {entry.formasi ?? 'Formasi belum diisi'}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-ink/60">
                        TWK {entry.twk} · TIU {entry.tiu} · TKP {entry.tkp}
                      </p>
                    </div>
                    <p className="shrink-0 font-display text-xl font-extrabold tabular-nums">
                      {entry.total}
                    </p>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
