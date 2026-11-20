/**
 * Tryout Akbar mingguan: SATU-SATUNYA simulasi CAT lengkap di Lolosin
 * (v2.11; Simulasi CAT mandiri dihapus 2026-11-19).
 *
 * Event tiap Minggu jam 09:00-11:00 WIB (10:00-12:00 WITA), zona
 * Asia/Jakarta (WIB, UTC+7 tanpa daylight saving, jadi offsetnya
 * tetap). Jendela dalam UTC: Minggu 02:00-04:00. Jadwal event ada di
 * konstanta di bawah supaya mudah diubah Dhinda: hari, jam mulai,
 * dan jam selesai.
 *
 * Cara ikut: saat jendela event terbuka, halaman Tryout Akbar
 * mengarahkan ke halaman Tryout dengan state startMode 'full', dan
 * halaman Tryout menjalankan alur simulasi 110 soal yang sudah ada
 * (modal konfirmasi, lalu startTryout('full')). Hasilnya tersimpan
 * normal sebagai tryout_results mode 'full', tanpa tabel baru.
 *
 * Aturan akses (v2.11, keputusan Dhinda 2026-11-19):
 * - Akbar WAJIB login: partisipasi dihitung per akun.
 * - User gratis dapat 2x ikut Akbar seumur akun (FREE_AKBAR_LIMIT);
 *   setelah itu ikut Akbar butuh premium. Premium tanpa batas.
 *   Hitungan partisipasi = jumlah hasil mode 'full' milik user
 *   (semua hasil full kini adalah hasil Akbar). Cek ini client-side
 *   saja, konsisten dengan cek premium client-side yang sudah ada
 *   (mis. host sesi); penegakan server-side adalah hardening
 *   lanjutan, bukan bagian v2.11.
 * - Skor realtime (live scoreboard) = premium: selama event, user
 *   premium melihat papan update langsung tiap ada skor masuk
 *   (subscribeAkbarResults + polling fallback). User gratis tidak
 *   melihat papan selama event; papan terbuka untuk mereka jam
 *   16:00 WIB (AKBAR_BOARD_UNLOCK_HOUR_WIB) di hari event yang
 *   sama. Skor PRIBADI tetap langsung terlihat di layar hasil
 *   setelah selesai mengerjakan.
 * - Pembahasan per soal Akbar (v2.12, keputusan Dhinda 2026-11-19):
 *   premium langsung kebuka habis mengerjakan; user gratis kebuka
 *   Senin 00:00 WIB setelah event (akbarDiscussionUnlockAt, Senin
 *   dari minggu event tempat hasil itu selesai). Skor pribadi +
 *   rincian per subtes + prediksi tetap langsung kelihatan untuk
 *   semua, tanpa menunggu.
 *
 * Papan peringkat: hasil mode 'full' yang finished_at-nya jatuh di
 * dalam jendela event minggu berjalan/terakhir, ranking total desc,
 * lalu passed, lalu finished_at (aturan seri yang sama dengan
 * leaderboard mingguan). Satu user satu baris: skor terbaiknya.
 * Halaman Peringkat menampilkan data yang sama (fetchAkbarLeaderboard
 * dengan jendela yang sama), bukan lagi seluruh hasil minggu itu.
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  buildLeaderboardEntries,
  compareTryoutRows,
  type LeaderboardEntry,
  type ProfileRow,
  type TryoutResultRow,
} from './leaderboard'

/** Tipe baris ranking, dipakai ulang dari leaderboard mingguan. */
export type { LeaderboardEntry } from './leaderboard'
import { JAKARTA_TIME_ZONE, shiftDate, todayJakarta } from './store'
import { isSupabaseConfigured, supabase } from './supabase'

/** Hari event: 0 = Minggu (getUTCDay). */
export const TRYOUT_AKBAR_DAY_OF_WEEK = 0

/** Jam mulai event (WIB). */
export const TRYOUT_AKBAR_START_HOUR_WIB = 9

/** Jam selesai event (WIB). Jendela event 09:00-11:00 WIB. */
export const TRYOUT_AKBAR_END_HOUR_WIB = 11

/** Zona waktu event. */
export const TRYOUT_AKBAR_TIME_ZONE = JAKARTA_TIME_ZONE

/** Offset WIB dari UTC dalam jam (tetap, tanpa daylight saving). */
const WIB_OFFSET_HOURS = 7

/** Jatah ikut Akbar gratis seumur akun (v2.11). */
export const FREE_AKBAR_LIMIT = 2

/** Jam papan peringkat terbuka untuk user gratis di hari event (WIB). */
export const AKBAR_BOARD_UNLOCK_HOUR_WIB = 16

/** Jam pembahasan Akbar kebuka untuk user gratis (WIB), di hari Senin setelah event. */
export const AKBAR_DISCUSSION_UNLOCK_HOUR_WIB = 0

/**
 * Interval polling fallback papan live (ms): selama event dan user
 * premium, papan di-refresh berkala bila Realtime tidak tersedia
 * (mis. tabel belum masuk publikasi supabase_realtime atau koneksi
 * gagal). Realtime tetap jalur utama saat tersedia.
 */
export const AKBAR_LIVE_POLL_MS = 15000

/** Satu jendela event: awal dan akhir sebagai instans Date. */
export interface TryoutAkbarWindow {
  start: Date
  end: Date
}

/**
 * Jendela event untuk hari Minggu tanggal `isoSunday` (YYYY-MM-DD,
 * kalender WIB). Jam WIB diubah ke UTC dengan offset tetap +7.
 */
function windowForSunday(isoSunday: string): TryoutAkbarWindow {
  const [y, m, d] = isoSunday.split('-').map(Number)
  return {
    start: new Date(
      Date.UTC(
        y,
        m - 1,
        d,
        TRYOUT_AKBAR_START_HOUR_WIB - WIB_OFFSET_HOURS,
        0,
        0,
      ),
    ),
    end: new Date(
      Date.UTC(
        y,
        m - 1,
        d,
        TRYOUT_AKBAR_END_HOUR_WIB - WIB_OFFSET_HOURS,
        0,
        0,
      ),
    ),
  }
}

/** Hari Minggu (YYYY-MM-DD, kalender WIB) dari minggu tanggal itu. */
function sundayOfWeek(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  // getUTCDay: 0 = Minggu, 1 = Senin, ..., 6 = Sabtu.
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const daysSinceSunday = (dayOfWeek - TRYOUT_AKBAR_DAY_OF_WEEK + 7) % 7
  return shiftDate(isoDate, -daysSinceSunday)
}

/** Jendela event minggu kalender tanggal `now` (WIB). */
export function eventWindowOfWeek(now = new Date()): TryoutAkbarWindow {
  return windowForSunday(sundayOfWeek(todayJakarta(now)))
}

/**
 * Jendela event "berjalan/terakhir": jendela Minggu minggu ini bila
 * sudah mulai, kalau belum, jendela Minggu minggu lalu. Dipakai
 * papan peringkat event dan halaman Peringkat.
 */
export function currentEventWindow(now = new Date()): TryoutAkbarWindow {
  const thisWeek = eventWindowOfWeek(now)
  if (now.getTime() >= thisWeek.start.getTime()) return thisWeek
  const lastSunday = shiftDate(sundayOfWeek(todayJakarta(now)), -7)
  return windowForSunday(lastSunday)
}

/**
 * Jendela event minggu lalu (jendela berjalan digeser 7 hari ke
 * belakang). Dipakai "Juara minggu lalu" di halaman Peringkat.
 */
export function previousEventWindow(now = new Date()): TryoutAkbarWindow {
  const current = currentEventWindow(now)
  const weekMs = 7 * 24 * 60 * 60 * 1000
  return {
    start: new Date(current.start.getTime() - weekMs),
    end: new Date(current.end.getTime() - weekMs),
  }
}

/**
 * Awal event BERIKUTNYA: Minggu minggu ini bila jendelanya belum
 * mulai, kalau tidak Minggu minggu depan. Saat jendela sedang
 * terbuka, event berikutnya adalah Minggu depan.
 */
export function nextEventStart(now = new Date()): Date {
  const thisWeek = eventWindowOfWeek(now)
  if (now.getTime() < thisWeek.start.getTime()) return thisWeek.start
  const nextSunday = shiftDate(sundayOfWeek(todayJakarta(now)), 7)
  return windowForSunday(nextSunday).start
}

/** True bila `now` jatuh di dalam jendela event (09:00-11:00 WIB). */
export function isEventWindowOpen(now = new Date()): boolean {
  const window = eventWindowOfWeek(now)
  const time = now.getTime()
  return time >= window.start.getTime() && time < window.end.getTime()
}

/**
 * True bila papan peringkat masih TERKUNCI untuk user gratis pada
 * `now`: dari pukul 09:00 sampai 16:00 WIB di hari Minggu event.
 * Di luar rentang itu (Minggu setelah 16:00 sampai Minggu depan
 * 09:00) papan terbuka untuk semua. User premium tidak pernah
 * terkunci (pemeriksaan premium dilakukan pemanggil).
 */
export function isAkbarBoardLockedForFree(now = new Date()): boolean {
  const sunday = sundayOfWeek(todayJakarta(now))
  const [y, m, d] = sunday.split('-').map(Number)
  const lockStart = Date.UTC(
    y,
    m - 1,
    d,
    TRYOUT_AKBAR_START_HOUR_WIB - WIB_OFFSET_HOURS,
    0,
    0,
  )
  const lockEnd = Date.UTC(
    y,
    m - 1,
    d,
    AKBAR_BOARD_UNLOCK_HOUR_WIB - WIB_OFFSET_HOURS,
    0,
    0,
  )
  const time = now.getTime()
  return time >= lockStart && time < lockEnd
}

/**
 * Momen pembahasan Tryout Akbar kebuka untuk user gratis (v2.12):
 * Senin 00:00 WIB setelah Minggu event tempat `finishedAt` jatuh.
 * Hasil Akbar sungguhan selalu selesai di dalam jendela Minggu
 * 09:00-11:00 WIB, jadi Senin-nya adalah keesokan harinya. Fungsi
 * murni: mudah dites tanpa Supabase.
 */
export function akbarDiscussionUnlockAt(finishedAt: Date): Date {
  const monday = shiftDate(sundayOfWeek(todayJakarta(finishedAt)), 1)
  const [y, m, d] = monday.split('-').map(Number)
  return new Date(
    Date.UTC(
      y,
      m - 1,
      d,
      AKBAR_DISCUSSION_UNLOCK_HOUR_WIB - WIB_OFFSET_HOURS,
      0,
      0,
    ),
  )
}

/**
 * Senin 00:00 WIB berikutnya dari `now`. Dipakai bila tanggal hasil
 * tidak diketahui (state lama / tanpa finishedAt): kartu kunci tetap
 * menyebut Senin yang akan datang, bukan Senin yang sudah lewat.
 */
export function nextAkbarDiscussionUnlock(now = new Date()): Date {
  const unlock = akbarDiscussionUnlockAt(now)
  if (unlock.getTime() > now.getTime()) return unlock
  return new Date(unlock.getTime() + 7 * 24 * 60 * 60 * 1000)
}

/**
 * True bila pembahasan Akbar dari hasil yang selesai pada
 * `finishedAt` sudah kebuka untuk user gratis pada `now`.
 * Premium tidak pernah menunggu (pemeriksaan premium dilakukan
 * pemanggil).
 */
export function isAkbarDiscussionUnlocked(
  finishedAt: Date,
  now = new Date(),
): boolean {
  return now.getTime() >= akbarDiscussionUnlockAt(finishedAt).getTime()
}

/** Label tanggal kebuka, misal "Senin, 23 November 2026" (WIB). */
export function formatDiscussionUnlockLabel(unlockAt: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TRYOUT_AKBAR_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(unlockAt)
}

/** Label tanggal event, misal "Minggu, 16 November 2026" (WIB). */
export function formatEventLabel(windowStart: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TRYOUT_AKBAR_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(windowStart)
}

/** Label jam jendela event, misal "09:00-11:00 WIB". */
export function formatEventHours(): string {
  const pad = (hour: number) => String(hour).padStart(2, '0')
  return `${pad(TRYOUT_AKBAR_START_HOUR_WIB)}:00-${pad(TRYOUT_AKBAR_END_HOUR_WIB)}:00 WIB`
}

/** Label jam papan terbuka untuk user gratis, misal "16:00 WIB". */
export function formatBoardUnlockHour(): string {
  return `${String(AKBAR_BOARD_UNLOCK_HOUR_WIB).padStart(2, '0')}:00 WIB`
}

/** Bagian hitung mundur (hari, jam, menit, detik, tidak negatif). */
export interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
}

/** Pecah selisih milidetik menjadi hari/jam/menit/detik. */
export function countdownParts(target: Date, now = new Date()): CountdownParts {
  const remaining = Math.max(0, target.getTime() - now.getTime())
  const totalSeconds = Math.floor(remaining / 1000)
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor(totalSeconds / 3600) % 24,
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
  }
}

/* ------------------------------------------------------------------ */
/* Papan peringkat event                                               */
/* ------------------------------------------------------------------ */

/**
 * Ranking satu jendela event: skor TERBAIK per user dari hasil mode
 * 'full' yang finished_at-nya di dalam jendela. Urutan query
 * mengikuti aturan seri leaderboard mingguan (total desc, lalu
 * passed, lalu finished_at), dan buildLeaderboardEntries mengambil
 * baris pertama per user sebagai skor terbaiknya. Aman saat Supabase
 * belum terkonfigurasi: mengembalikan [].
 */
export async function fetchAkbarLeaderboard(
  window: TryoutAkbarWindow,
): Promise<LeaderboardEntry[]> {
  if (!isSupabaseConfigured() || !supabase) return []
  try {
    const { data: rows, error } = await supabase
      .from('tryout_results')
      .select('user_id, twk, tiu, tkp, total, passed, finished_at')
      .eq('mode', 'full')
      .gte('finished_at', window.start.toISOString())
      .lt('finished_at', window.end.toISOString())
      .order('total', { ascending: false })
      .order('passed', { ascending: false })
      .order('finished_at', { ascending: true })
      .limit(500)
    if (error || !rows) return []
    const typedRows = rows as TryoutResultRow[]
    if (typedRows.length === 0) return []

    const userIds = [...new Set(typedRows.map((r) => r.user_id))]
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, formasi')
      .in('id', userIds)
    const typedProfiles =
      !profileError && profiles ? (profiles as ProfileRow[]) : []
    return buildLeaderboardEntries(typedRows, typedProfiles)
  } catch {
    return []
  }
}

/** Peringkat satu user di satu event Akbar (v2.12.1). */
export interface EventRank {
  rank: number
  /** Jumlah peserta event itu (satu user dihitung sekali). */
  total: number
}

/**
 * Peringkat satu user dari baris-baris tryout_results satu event.
 * Fungsi murni: urut dengan aturan seri leaderboard yang sama
 * (total desc, passed desc, finished_at asc), ambil skor TERBAIK
 * per user, lalu cari posisi user itu. Mengembalikan null bila
 * user tidak punya baris di event itu (misal selesai di luar
 * jendela event). Tidak butuh kolom/tabel baru: peringkat per
 * event diturunkan dari data yang sudah ada.
 */
export function rankOfUserInRows(
  rows: readonly TryoutResultRow[],
  userId: string,
): EventRank | null {
  const bestByUser = new Map<string, TryoutResultRow>()
  for (const row of [...rows].sort(compareTryoutRows)) {
    if (!bestByUser.has(row.user_id)) bestByUser.set(row.user_id, row)
  }
  const ordered = [...bestByUser.values()]
  const index = ordered.findIndex((row) => row.user_id === userId)
  if (index === -1) return null
  return { rank: index + 1, total: ordered.length }
}

/**
 * Peringkat user di satu event Akbar (v2.12.1): dipakai riwayat
 * tryout supaya tiap Akbar yang diikuti menampilkan peringkatnya
 * ("Peringkat #5 dari 128 peserta"). Hanya mengambil kolom skor,
 * tanpa profiles (nama tidak dibutuhkan untuk peringkat). Batas
 * 500 baris sama seperti fetchAkbarLeaderboard: user di luar 500
 * besar tidak ditemukan dan mengembalikan null. Aman saat
 * Supabase belum terkonfigurasi: mengembalikan null.
 */
export async function fetchMyAkbarRank(
  window: TryoutAkbarWindow,
  userId: string,
): Promise<EventRank | null> {
  if (!userId) return null
  if (!isSupabaseConfigured() || !supabase) return null
  try {
    const { data: rows, error } = await supabase
      .from('tryout_results')
      .select('user_id, twk, tiu, tkp, total, passed, finished_at')
      .eq('mode', 'full')
      .gte('finished_at', window.start.toISOString())
      .lt('finished_at', window.end.toISOString())
      .order('total', { ascending: false })
      .order('passed', { ascending: false })
      .order('finished_at', { ascending: true })
      .limit(500)
    if (error || !rows) return null
    return rankOfUserInRows(rows as TryoutResultRow[], userId)
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Akses Akbar (v2.11): hitung partisipasi + live scoreboard           */
/* ------------------------------------------------------------------ */

/**
 * Jumlah partisipasi Tryout Akbar user ini: jumlah hasil mode 'full'
 * miliknya. Sejak v2.11 semua hasil mode 'full' adalah hasil Akbar,
 * jadi hitungan ini sama dengan jumlah keikutsertaan event. Dipakai
 * gate gratis 2x (FREE_AKBAR_LIMIT). Aman saat Supabase belum
 * terkonfigurasi: mengembalikan 0. Bila hitungan gagal dibaca
 * (error jaringan / count null), mengembalikan 0: fail-open, jangan
 * kunci user karena kegagalan baca. Penegakan ini client-side saja;
 * penegakan server-side adalah hardening lanjutan.
 */
export async function fetchMyAkbarCount(userId: string): Promise<number> {
  if (!userId) return 0
  if (!isSupabaseConfigured() || !supabase) return 0
  try {
    const { count, error } = await supabase
      .from('tryout_results')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('mode', 'full')
    if (error || count === null) return 0
    return count
  } catch {
    return 0
  }
}

/**
 * Berlangganan skor Akbar baru lewat postgres changes: tiap INSERT
 * ke tryout_results mode 'full' memanggil `onInsert` (pemanggil me-
 * refresh papan). Dipakai papan live premium selama event. Perlu
 * tabel tryout_results masuk publikasi supabase_realtime (migrasi
 * 006); bila belum, subscription diam-diam tidak menerima event dan
 * polling fallback (AKBAR_LIVE_POLL_MS) yang menjaga papan tetap
 * mutakhir. Mengembalikan fungsi unsubscribe, atau null bila
 * Supabase belum terkonfigurasi. Pemanggil wajib memanggil
 * unsubscribe saat komponen dilepas.
 */
export function subscribeAkbarResults(
  onInsert: () => void,
): (() => void) | null {
  if (!isSupabaseConfigured() || !supabase) return null
  const client = supabase
  const channel: RealtimeChannel = client.channel('akbar-live')
  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'tryout_results',
      filter: 'mode=eq.full',
    },
    () => {
      onInsert()
    },
  )
  channel.subscribe()
  return () => {
    void client.removeChannel(channel).catch(() => {
      // Abaikan.
    })
  }
}
