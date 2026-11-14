import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCurrentUser, getMyProfile, type Profile } from '../lib/auth'
import {
  fetchLastWeekTop3,
  fetchLeaderboard,
  filterEntriesByFormasi,
  formatWeekRange,
  getCurrentWeekStart,
  getPreviousWeekStart,
  listFormasi,
  retryPendingSubmissions,
  type LeaderboardEntry,
} from '../lib/leaderboard'
import { isSupabaseConfigured } from '../lib/supabase'
import { cx } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Mascot } from '../components/Mascot'
import { ChevronRightIcon, TrophyIcon } from '../components/icons'

const FILTER_SEMUA = 'semua'
const FILTER_FORMASIKU = 'formasiku'

/** Warna lingkaran peringkat: 1 emas, 2 perak, 3 perunggu. */
function rankCircleClass(rank: number): string {
  if (rank === 1) return 'bg-accent-400 text-ink'
  if (rank === 2) return 'bg-white text-ink'
  if (rank === 3) return 'bg-orange-200 text-orange-800'
  return 'bg-ink/5 text-ink/70'
}

/** Satu baris ranking minggu berjalan. */
function LeaderboardRow({
  entry,
  isMe,
}: {
  entry: LeaderboardEntry
  isMe: boolean
}) {
  return (
    <Card
      className={cx(
        'py-3',
        isMe && 'border-primary-600 bg-primary-100 shadow-sticker',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-ink font-display text-base font-extrabold shadow-sticker-sm',
            rankCircleClass(entry.rank),
          )}
        >
          {entry.rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-display text-base font-extrabold">
            <span className="truncate">{entry.username}</span>
            {isMe && <Badge tone="green">Kamu</Badge>}
            {entry.passed && <Badge tone="amber">Lulus</Badge>}
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-ink/60">
            {entry.formasi ?? 'Formasi belum diisi'}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-ink/60">
            TWK {entry.twk} · TIU {entry.tiu} · TKP {entry.tkp}
          </p>
        </div>
        <p className="shrink-0 text-right font-display text-xl font-extrabold">
          {entry.total}
          <span className="block text-[11px] font-semibold text-ink/50">
            dari 550
          </span>
        </p>
      </div>
    </Card>
  )
}

/**
 * Halaman leaderboard mingguan: ranking simulasi CAT minggu berjalan
 * (global atau per formasi), juara 3 besar minggu lalu, dan baris
 * user sendiri yang disorot. Melihat leaderboard boleh tanpa login.
 * Skor yang sempat gagal terkirim dicoba lagi saat halaman dibuka.
 */
export function LeaderboardPage() {
  const configured = isSupabaseConfigured()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [lastWeek, setLastWeek] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(configured)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [selectedFormasi, setSelectedFormasi] = useState<string>(FILTER_SEMUA)
  const [pendingSent, setPendingSent] = useState(0)

  const weekStart = getCurrentWeekStart()
  const lastWeekStart = getPreviousWeekStart()

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    setLoading(true)
    try {
      const user = await getCurrentUser().catch(() => null)
      setMyUserId(user?.id ?? null)
      if (user) {
        const profile = await getMyProfile().catch(() => null)
        setMyProfile(profile)
        // Kirim dulu skor yang sempat tertunda, biar rankingnya mutakhir.
        const retry = await retryPendingSubmissions()
        if (retry.sent > 0) setPendingSent(retry.sent)
      }
      const [week, last] = await Promise.all([
        fetchLeaderboard(getCurrentWeekStart()),
        fetchLastWeekTop3(),
      ])
      setEntries(week)
      setLastWeek(last)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const formasiOptions = useMemo(() => listFormasi(entries), [entries])
  const myFormasi = myProfile?.formasi?.trim() || null

  const visibleEntries = useMemo(() => {
    if (selectedFormasi === FILTER_SEMUA) return entries
    if (selectedFormasi === FILTER_FORMASIKU) {
      return myFormasi ? filterEntriesByFormasi(entries, myFormasi) : []
    }
    return filterEntriesByFormasi(entries, selectedFormasi)
  }, [entries, selectedFormasi, myFormasi])

  const myEntry = useMemo(
    () =>
      myUserId
        ? (entries.find((e) => e.userId === myUserId) ?? null)
        : null,
    [entries, myUserId],
  )

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="font-script text-2xl leading-none text-primary-700">
          siapa paling rajin minggu ini
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">
          Leaderboard
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          Ranking simulasi CAT minggu ini, {formatWeekRange(weekStart)}.
          Skor terbaik tiap orang yang dihitung, jadi santai aja kalau
          mau coba lagi.
        </p>
      </header>

      {!configured && (
        <Card className="p-6 text-center">
          <Mascot mood="semangat" size={72} className="mx-auto" />
          <p className="mt-2 font-display text-lg font-extrabold">
            Leaderboard online belum aktif
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink/60">
            Leaderboard muncul otomatis setelah setup Supabase selesai.
            Skormu tetap tersimpan di perangkat ini, jadi tetap bisa
            latihan dan tryout seperti biasa.
          </p>
          <Link to="/tryout" className="mt-4 inline-block">
            <Button>
              Latihan dulu aja
              <ChevronRightIcon width={16} height={16} />
            </Button>
          </Link>
        </Card>
      )}

      {configured && (
        <>
          {myUserId === null && !loading && (
            <Card className="bg-accent-100 py-3 shadow-sticker-amber">
              <p className="text-sm leading-relaxed font-bold">
                Kamu lagi lihat sebagai tamu.{' '}
                <Link
                  to="/auth"
                  className="text-primary-700 underline underline-offset-2"
                >
                  Login dulu
                </Link>{' '}
                biar skormu masuk leaderboard dan bisa adu peringkat sama
                yang lain.
              </p>
            </Card>
          )}

          {pendingSent > 0 && (
            <p className="rounded-xl border-2 border-ink bg-primary-100 px-3 py-2 text-xs font-bold text-primary-700">
              {pendingSent} skor yang sempat tertunda berhasil dikirim ke
              leaderboard.
            </p>
          )}

          <section aria-label="Juara minggu lalu">
            <h2 className="mb-2 font-display text-base font-extrabold">
              Juara minggu lalu
            </h2>
            <p className="mb-2 text-xs font-medium text-ink/60">
              {formatWeekRange(lastWeekStart)}
            </p>
            {loading ? (
              <Card className="py-4 text-center text-sm font-bold text-ink/60">
                Memuat juara minggu lalu...
              </Card>
            ) : lastWeek.length === 0 ? (
              <Card className="py-4 text-center">
                <p className="text-sm font-bold">
                  Belum ada juara minggu lalu
                </p>
                <p className="mt-1 text-xs leading-relaxed font-medium text-ink/60">
                  Minggu ini kesempatanmu naik podium.
                </p>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {lastWeek.map((entry) => (
                  <Card key={entry.userId} className="py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={cx(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink shadow-sticker-sm',
                          rankCircleClass(entry.rank),
                        )}
                      >
                        {entry.rank === 1 ? (
                          <TrophyIcon width={18} height={18} />
                        ) : (
                          <span className="font-display text-sm font-extrabold">
                            {entry.rank}
                          </span>
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-base font-extrabold">
                          {entry.username}
                        </p>
                        <p className="mt-0.5 truncate text-xs font-medium text-ink/60">
                          {entry.formasi ?? 'Formasi belum diisi'}
                        </p>
                      </div>
                      <p className="shrink-0 font-display text-lg font-extrabold">
                        {entry.total}
                        <span className="ml-1 text-xs font-semibold text-ink/50">
                          /550
                        </span>
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section aria-label="Ranking minggu ini">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <h2 className="font-display text-base font-extrabold">
                Ranking minggu ini
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load()}
                disabled={loading}
              >
                {loading ? 'Memuat...' : 'Muat ulang'}
              </Button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label
                htmlFor="filter-formasi"
                className="text-sm font-extrabold"
              >
                Formasi
              </label>
              <select
                id="filter-formasi"
                value={selectedFormasi}
                onChange={(e) => setSelectedFormasi(e.target.value)}
                className="min-w-0 flex-1 rounded-full border-2 border-ink bg-white px-3 py-2 text-sm font-bold shadow-sticker-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
              >
                <option value={FILTER_SEMUA}>Semua formasi</option>
                {myFormasi && (
                  <option value={FILTER_FORMASIKU}>
                    Formasiku ({myFormasi})
                  </option>
                )}
                {formasiOptions.map((formasi) => (
                  <option key={formasi} value={formasi}>
                    {formasi}
                  </option>
                ))}
              </select>
            </div>

            {myEntry && (
              <p className="mb-3 w-fit rounded-full border-2 border-ink bg-primary-100 px-3 py-1 text-xs font-extrabold text-primary-700 shadow-sticker-sm">
                Kamu peringkat #{myEntry.rank} minggu ini dengan total{' '}
                {myEntry.total}/550
              </p>
            )}

            {loading ? (
              <Card className="py-6 text-center text-sm font-bold text-ink/60">
                Memuat leaderboard...
              </Card>
            ) : visibleEntries.length === 0 ? (
              <Card className="p-6 text-center">
                <Mascot mood="semangat" size={72} className="mx-auto" />
                <p className="mt-2 font-display text-lg font-extrabold">
                  {selectedFormasi === FILTER_SEMUA
                    ? 'Belum ada skor minggu ini'
                    : 'Belum ada skor untuk formasi ini'}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink/60">
                  {selectedFormasi === FILTER_SEMUA
                    ? 'Jadi yang pertama naik leaderboard, mulai simulasi CAT sekarang.'
                    : 'Coba filter lain, atau jadi yang pertama dari formasi ini.'}
                </p>
                <Link to="/tryout" className="mt-4 inline-block">
                  <Button>
                    Mulai simulasi CAT
                    <ChevronRightIcon width={16} height={16} />
                  </Button>
                </Link>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {visibleEntries.map((entry) => (
                  <LeaderboardRow
                    key={entry.userId}
                    entry={entry}
                    isMe={entry.userId === myUserId}
                  />
                ))}
              </div>
            )}

            <p className="mt-3 text-xs leading-relaxed font-medium text-ink/60">
              Leaderboard dihitung dari simulasi CAT (110 soal). Tryout
              kilat tidak masuk ranking. Ranking reset tiap Senin.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
