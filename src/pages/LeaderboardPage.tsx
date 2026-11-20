import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getCurrentUser, getMyProfile, type Profile } from '../lib/auth'
import {
  filterEntriesByFormasi,
  listFormasi,
  retryPendingSubmissions,
  type LeaderboardEntry,
} from '../lib/leaderboard'
import { getPremiumStatus } from '../lib/premium'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  AKBAR_LIVE_POLL_MS,
  currentEventWindow,
  fetchAkbarLeaderboard,
  formatBoardUnlockHour,
  formatEventHours,
  formatEventLabel,
  isAkbarBoardLockedForFree,
  isEventWindowOpen,
  previousEventWindow,
  subscribeAkbarResults,
} from '../lib/tryoutAkbar'
import { cx } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Mascot } from '../components/Mascot'
import { StickyBackButton } from '../components/belajar/StickyBackButton'
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
        isMe && 'border-primary-600 bg-primary-50',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line font-display text-base font-extrabold',
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
 * Kartu "Peringkatmu" (v2.10): peringkat user sendiri pada scope
 * yang sedang aktif (global atau per formasi), dengan angka yang
 * sama persis dengan urutan daftar di bawahnya (tie-break yang
 * sama, karena diambil dari entri yang sama).
 *
 * - Berperingkat di scope aktif: angka besar + total skor, plus
 *   baris kedua berisi peringkat di scope satunya (global vs
 *   formasiku) bila ada.
 * - Punya peringkat global tapi tidak di formasi aktif: kabari dan
 *   tawarkan kembali ke ranking global.
 * - Belum punya skor minggu ini: ajakan ikut simulasi (disembunyikan
 *   bila scope sedang kosong, karena empty state daftar sudah
 *   mengajak hal yang sama).
 * - Tamu: ajakan login singkat (juga disembunyikan bila scope
 *   kosong, karena banner tamu di atas sudah mengajak login).
 */
function OwnRankCard({
  myUserId,
  myFormasi,
  myGlobalEntry,
  myScopedEntry,
  scopedCount,
  globalCount,
  scopeKind,
  scopeName,
  myFormasiEntry,
  myFormasiCount,
  onShowGlobal,
}: {
  myUserId: string | null
  myFormasi: string | null
  myGlobalEntry: LeaderboardEntry | null
  myScopedEntry: LeaderboardEntry | null
  scopedCount: number
  globalCount: number
  scopeKind: 'global' | 'formasi'
  scopeName: string | null
  myFormasiEntry: LeaderboardEntry | null
  myFormasiCount: number
  onShowGlobal: () => void
}) {
  if (myUserId === null) {
    if (scopedCount === 0) return null
    return (
      <Card
        data-testid="own-rank-card"
        aria-label="Peringkatmu"
        className="bg-accent-100 py-3"
      >
        <p className="text-sm leading-relaxed font-bold">
          Mau lihat peringkatmu?{' '}
          <Link
            to="/auth"
            className="text-primary-700 underline underline-offset-2"
          >
            Login dulu
          </Link>
          , terus ikut Tryout Akbar biar namamu masuk leaderboard.
        </p>
      </Card>
    )
  }

  if (myScopedEntry) {
    return (
      <Card
        data-testid="own-rank-card"
        aria-label="Peringkatmu"
        className="border-primary-600 bg-primary-50"
      >
        <div className="flex items-center gap-4">
          <p className="shrink-0 font-display text-4xl font-extrabold text-primary-700">
            #{myScopedEntry.rank}
          </p>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-extrabold">
              Peringkatmu minggu ini
            </p>
            <p className="mt-0.5 text-sm font-medium text-ink/70">
              {scopeKind === 'global'
                ? `dari ${scopedCount} peserta`
                : `di formasi ${scopeName} · dari ${scopedCount} peserta`}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-ink/60">
              Total {myScopedEntry.total}/550 · TWK {myScopedEntry.twk} ·
              TIU {myScopedEntry.tiu} · TKP {myScopedEntry.tkp}
            </p>
          </div>
        </div>
        {scopeKind === 'global' && myFormasiEntry && (
          <p className="mt-3 border-t border-primary-200 pt-3 text-sm font-medium text-ink/70">
            Di formasimu ({myFormasi}): peringkat #{myFormasiEntry.rank}{' '}
            dari {myFormasiCount} peserta.
          </p>
        )}
        {scopeKind === 'global' && !myFormasiEntry && (
          <p className="mt-3 border-t border-primary-200 pt-3 text-sm font-medium text-ink/70">
            Isi formasimu di{' '}
            <Link
              to="/profil"
              className="font-bold text-primary-700 underline underline-offset-2"
            >
              Profil
            </Link>{' '}
            biar ranking per formasimu muncul di sini.
          </p>
        )}
        {scopeKind === 'formasi' && myGlobalEntry && (
          <p className="mt-3 border-t border-primary-200 pt-3 text-sm font-medium text-ink/70">
            Peringkat globalmu: #{myGlobalEntry.rank} dari {globalCount}{' '}
            peserta minggu ini.
          </p>
        )}
      </Card>
    )
  }

  if (myGlobalEntry) {
    return (
      <Card data-testid="own-rank-card" aria-label="Peringkatmu">
        <p className="font-display text-base font-extrabold">
          Kamu belum punya skor di formasi {scopeName ?? 'ini'}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          Peringkat globalmu minggu ini: #{myGlobalEntry.rank} dari{' '}
          {globalCount} peserta.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onShowGlobal}
        >
          Lihat ranking global
        </Button>
      </Card>
    )
  }

  if (scopedCount === 0) return null
  return (
    <Card
      data-testid="own-rank-card"
      aria-label="Peringkatmu"
      className="p-6 text-center"
    >
      <Mascot mood="semangat" size={72} className="mx-auto" />
      <p className="mt-2 font-display text-lg font-extrabold">
        Kamu belum punya peringkat minggu ini
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink/60">
        Ikut Tryout Akbar sekarang, biar namamu muncul di leaderboard.
      </p>
      <Link to="/tryout-akbar" className="mt-4 inline-block">
        <Button>
          Ikut Tryout Akbar
          <ChevronRightIcon width={16} height={16} />
        </Button>
      </Link>
    </Card>
  )
}

/**
 * Halaman leaderboard mingguan: ranking Tryout Akbar minggu berjalan
 * (global atau per formasi), juara 3 besar minggu lalu, dan baris
 * user sendiri yang disorot. Melihat leaderboard boleh tanpa login.
 * Skor yang sempat gagal terkirim dicoba lagi saat halaman dibuka.
 *
 * Aturan papan (v2.11): datanya hasil jendela event Akbar minggu
 * berjalan/terakhir, sama dengan papan di halaman Akbar. Papan
 * terkunci untuk non-premium selama Minggu 09:00-16:00 WIB; user
 * premium melihat papan live selama event (Realtime + polling).
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
  // Status premium (null = belum terbaca) dan jam sekarang (untuk
  // kunci papan gratis yang buka jam 16:00 WIB).
  const [premium, setPremium] = useState<boolean | null>(null)
  const [now, setNow] = useState(() => new Date())

  const eventWindow = currentEventWindow(now)
  const prevEventWindow = previousEventWindow(now)

  // Jam diperbarui tiap 30 detik supaya kunci papan terbuka sendiri
  // saat lewat jam 16:00 WIB tanpa perlu reload.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  // Ambil data tanpa mengubah indikator loading (dipakai polling live).
  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    const user = await getCurrentUser().catch(() => null)
    setMyUserId(user?.id ?? null)
    if (user) {
      const profile = await getMyProfile().catch(() => null)
      setMyProfile(profile)
      setPremium((await getPremiumStatus(user.id)).premium)
      // Kirim dulu skor yang sempat tertunda, biar rankingnya mutakhir.
      const retry = await retryPendingSubmissions()
      if (retry.sent > 0) setPendingSent(retry.sent)
    } else {
      setPremium(false)
    }
    const [week, last] = await Promise.all([
      fetchAkbarLeaderboard(currentEventWindow()),
      fetchAkbarLeaderboard(previousEventWindow()),
    ])
    setEntries(week)
    setLastWeek(last.slice(0, 3))
  }, [])

  const load = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    setLoading(true)
    try {
      await fetchData()
    } finally {
      setLoading(false)
    }
  }, [fetchData])

  useEffect(() => {
    void load()
  }, [load])

  // Papan terkunci untuk non-premium selama Minggu 09:00-16:00 WIB.
  const boardLocked =
    configured &&
    premium !== null &&
    !premium &&
    isAkbarBoardLockedForFree(now)
  // Papan live: premium + jendela event terbuka.
  const liveEnabled =
    configured && premium === true && isEventWindowOpen(now)

  // Live board premium: subscribe INSERT tryout_results + polling
  // fallback tiap AKBAR_LIVE_POLL_MS selama event berlangsung.
  useEffect(() => {
    if (!liveEnabled) return
    const refresh = () => {
      void fetchData()
    }
    const unsubscribe = subscribeAkbarResults(refresh)
    const id = window.setInterval(refresh, AKBAR_LIVE_POLL_MS)
    return () => {
      window.clearInterval(id)
      unsubscribe?.()
    }
  }, [liveEnabled, fetchData])

  const formasiOptions = useMemo(() => listFormasi(entries), [entries])
  const myFormasi = myProfile?.formasi?.trim() || null

  const visibleEntries = useMemo(() => {
    if (selectedFormasi === FILTER_SEMUA) return entries
    if (selectedFormasi === FILTER_FORMASIKU) {
      return myFormasi ? filterEntriesByFormasi(entries, myFormasi) : []
    }
    return filterEntriesByFormasi(entries, selectedFormasi)
  }, [entries, selectedFormasi, myFormasi])

  const myGlobalEntry = useMemo(
    () =>
      myUserId
        ? (entries.find((e) => e.userId === myUserId) ?? null)
        : null,
    [entries, myUserId],
  )

  // Entri user sendiri pada scope yang sedang aktif (angka yang sama
  // dengan daftar yang tampil, karena diambil dari daftar yang sama).
  const myScopedEntry = useMemo(
    () =>
      myUserId
        ? (visibleEntries.find((e) => e.userId === myUserId) ?? null)
        : null,
    [visibleEntries, myUserId],
  )

  // Ranking user di formasinya sendiri (baris kedua kartu saat scope
  // aktif adalah global).
  const myFormasiEntries = useMemo(
    () => (myFormasi ? filterEntriesByFormasi(entries, myFormasi) : []),
    [entries, myFormasi],
  )
  const myFormasiEntry = useMemo(
    () =>
      myUserId
        ? (myFormasiEntries.find((e) => e.userId === myUserId) ?? null)
        : null,
    [myFormasiEntries, myUserId],
  )

  const scopeKind: 'global' | 'formasi' =
    selectedFormasi === FILTER_SEMUA ? 'global' : 'formasi'
  const scopeName =
    selectedFormasi === FILTER_FORMASIKU
      ? myFormasi
      : selectedFormasi === FILTER_SEMUA
        ? null
        : selectedFormasi

  return (
    <div className="flex flex-col gap-5">
      {/* Tombol back (v2.9): kembali ke Beranda. */}
      <StickyBackButton to="/" />

      <header>
        <p className="kicker">siapa paling rajin minggu ini</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">
          Leaderboard
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          Ranking Tryout Akbar minggu ini, event{' '}
          {formatEventLabel(eventWindow.start)} · {formatEventHours()}.
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
            Latihan dan tryout tetap bisa dipakai seperti biasa, tapi
            skormu hanya dicatat selama halaman ini terbuka.
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
            <Card className="bg-accent-100 py-3">
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
            <p className="rounded-xl bg-primary-100 px-3 py-2 text-xs font-bold text-primary-700">
              {pendingSent} skor yang sempat tertunda berhasil dikirim ke
              leaderboard.
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-5">
            <section aria-label="Juara minggu lalu" className="lg:col-span-2">
            <h2 className="mb-2 font-display text-base font-extrabold">
              Juara minggu lalu
            </h2>
            <p className="mb-2 text-xs font-medium text-ink/60">
              Event {formatEventLabel(prevEventWindow.start)}
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
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line',
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

          <section aria-label="Ranking minggu ini" className="lg:col-span-3">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-base font-extrabold">
                Ranking minggu ini
                {liveEnabled && (
                  <Badge tone="green">
                    <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-primary-600" />
                    Live
                  </Badge>
                )}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load()}
                disabled={loading || boardLocked}
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
                className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
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

            {!loading && !boardLocked && (
              <div className="mb-3">
                <OwnRankCard
                  myUserId={myUserId}
                  myFormasi={myFormasi}
                  myGlobalEntry={myGlobalEntry}
                  myScopedEntry={myScopedEntry}
                  scopedCount={visibleEntries.length}
                  globalCount={entries.length}
                  scopeKind={scopeKind}
                  scopeName={scopeName}
                  myFormasiEntry={myFormasiEntry}
                  myFormasiCount={myFormasiEntries.length}
                  onShowGlobal={() => setSelectedFormasi(FILTER_SEMUA)}
                />
              </div>
            )}

            {loading ? (
              <Card className="py-6 text-center text-sm font-bold text-ink/60">
                Memuat leaderboard...
              </Card>
            ) : boardLocked ? (
              <Card className="p-6 text-center">
                <p className="font-display text-base font-bold">
                  Papan peringkat terbuka jam {formatBoardUnlockHour()}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink/60">
                  Skor live selama event hanya untuk user premium.
                  Sabar ya, papan peringkat minggu ini terbuka untuk
                  semua jam {formatBoardUnlockHour()}.
                </p>
                <Link
                  to="/profil"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary-700 hover:underline"
                >
                  Lihat premium
                  <ChevronRightIcon width={16} height={16} />
                </Link>
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
                    ? 'Jadi yang pertama naik leaderboard, ikut Tryout Akbar sekarang.'
                    : 'Coba filter lain, atau jadi yang pertama dari formasi ini.'}
                </p>
                <Link to="/tryout-akbar" className="mt-4 inline-block">
                  <Button>
                    Ikut Tryout Akbar
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

            <Card className="mt-4 p-4">
              <h3 className="font-display text-sm font-extrabold">
                Hadiah juara mingguan
              </h3>
              <ul className="mt-2 flex flex-col gap-1 text-sm font-medium text-ink/70">
                <li>Juara 1: premium 7 hari + lencana prestise</li>
                <li>Juara 2: premium 5 hari + lencana prestise</li>
                <li>Juara 3: premium 3 hari + lencana prestise</li>
              </ul>
              <p className="mt-2 text-xs leading-relaxed font-medium text-ink/60">
                Juara per formasi dapat lencana prestise. Hadiah masuk
                sebagai gift lewat notifikasi tiap Senin.
              </p>
            </Card>

            <p className="mt-3 text-xs leading-relaxed font-medium text-ink/60">
              Leaderboard dihitung dari Tryout Akbar (110 soal). Tryout
              kilat tidak masuk ranking. Peringkat baru tiap Minggu.
            </p>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
