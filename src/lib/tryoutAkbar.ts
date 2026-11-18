/**
 * Tryout Akbar mingguan (v2.8): event tetap tiap Minggu pagi WITA.
 *
 * Jadwal event ada di konstanta di bawah supaya mudah diubah Dhinda:
 * hari, jam mulai, dan jam selesai. Zona waktu Asia/Makassar (WITA,
 * UTC+8 tanpa daylight saving, jadi offsetnya tetap).
 *
 * Cara ikut: saat jendela event terbuka, halaman Tryout Akbar
 * mengarahkan ke halaman Tryout dengan state startMode 'full', dan
 * halaman Tryout menjalankan alur mulai simulasi CAT yang sudah ada
 * (modal konfirmasi, lalu startTryout('full')). Hasilnya tersimpan
 * normal sebagai tryout_results mode 'full', tanpa tabel baru.
 *
 * Papan peringkat event: hasil mode 'full' yang finished_at-nya jatuh
 * di dalam jendela event minggu berjalan/terakhir, ranking total desc,
 * lalu passed, lalu finished_at (aturan seri yang sama dengan
 * leaderboard mingguan). Satu user satu baris: skor terbaiknya.
 */
import {
  buildLeaderboardEntries,
  type LeaderboardEntry,
  type ProfileRow,
  type TryoutResultRow,
} from './leaderboard'

/** Tipe baris ranking, dipakai ulang dari leaderboard mingguan. */
export type { LeaderboardEntry } from './leaderboard'
import {
  MAKASSAR_TIME_ZONE,
  shiftDate,
  todayMakassar,
} from './store'
import { isSupabaseConfigured, supabase } from './supabase'

/** Hari event: 0 = Minggu (getUTCDay). */
export const TRYOUT_AKBAR_DAY_OF_WEEK = 0

/** Jam mulai event (WITA). */
export const TRYOUT_AKBAR_START_HOUR_WITA = 9

/** Jam selesai event (WITA). Jendela event 09:00-11:00 WITA. */
export const TRYOUT_AKBAR_END_HOUR_WITA = 11

/** Zona waktu event. */
export const TRYOUT_AKBAR_TIME_ZONE = MAKASSAR_TIME_ZONE

/** Offset WITA dari UTC dalam jam (tetap, tanpa daylight saving). */
const WITA_OFFSET_HOURS = 8

/** Satu jendela event: awal dan akhir sebagai instans Date. */
export interface TryoutAkbarWindow {
  start: Date
  end: Date
}

/**
 * Jendela event untuk hari Minggu tanggal `isoSunday` (YYYY-MM-DD,
 * kalender WITA). Jam WITA diubah ke UTC dengan offset tetap +8.
 */
function windowForSunday(isoSunday: string): TryoutAkbarWindow {
  const [y, m, d] = isoSunday.split('-').map(Number)
  return {
    start: new Date(
      Date.UTC(
        y,
        m - 1,
        d,
        TRYOUT_AKBAR_START_HOUR_WITA - WITA_OFFSET_HOURS,
        0,
        0,
      ),
    ),
    end: new Date(
      Date.UTC(
        y,
        m - 1,
        d,
        TRYOUT_AKBAR_END_HOUR_WITA - WITA_OFFSET_HOURS,
        0,
        0,
      ),
    ),
  }
}

/** Hari Minggu (YYYY-MM-DD, kalender WITA) dari minggu tanggal itu. */
function sundayOfWeek(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  // getUTCDay: 0 = Minggu, 1 = Senin, ..., 6 = Sabtu.
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const daysSinceSunday = (dayOfWeek - TRYOUT_AKBAR_DAY_OF_WEEK + 7) % 7
  return shiftDate(isoDate, -daysSinceSunday)
}

/** Jendela event minggu kalender tanggal `now` (WITA). */
export function eventWindowOfWeek(now = new Date()): TryoutAkbarWindow {
  return windowForSunday(sundayOfWeek(todayMakassar(now)))
}

/**
 * Jendela event "berjalan/terakhir": jendela Minggu minggu ini bila
 * sudah mulai, kalau belum, jendela Minggu minggu lalu. Dipakai
 * papan peringkat event.
 */
export function currentEventWindow(now = new Date()): TryoutAkbarWindow {
  const thisWeek = eventWindowOfWeek(now)
  if (now.getTime() >= thisWeek.start.getTime()) return thisWeek
  const lastSunday = shiftDate(sundayOfWeek(todayMakassar(now)), -7)
  return windowForSunday(lastSunday)
}

/**
 * Awal event BERIKUTNYA: Minggu minggu ini bila jendelanya belum
 * mulai, kalau tidak Minggu minggu depan. Saat jendela sedang
 * terbuka, event berikutnya adalah Minggu depan.
 */
export function nextEventStart(now = new Date()): Date {
  const thisWeek = eventWindowOfWeek(now)
  if (now.getTime() < thisWeek.start.getTime()) return thisWeek.start
  const nextSunday = shiftDate(sundayOfWeek(todayMakassar(now)), 7)
  return windowForSunday(nextSunday).start
}

/** True bila `now` jatuh di dalam jendela event (09:00-11:00 WITA). */
export function isEventWindowOpen(now = new Date()): boolean {
  const window = eventWindowOfWeek(now)
  const time = now.getTime()
  return time >= window.start.getTime() && time < window.end.getTime()
}

/** Label tanggal event, misal "Minggu, 16 November 2026" (WITA). */
export function formatEventLabel(windowStart: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TRYOUT_AKBAR_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(windowStart)
}

/** Label jam jendela event, misal "09:00-11:00 WITA". */
export function formatEventHours(): string {
  const pad = (hour: number) => String(hour).padStart(2, '0')
  return `${pad(TRYOUT_AKBAR_START_HOUR_WITA)}:00-${pad(TRYOUT_AKBAR_END_HOUR_WITA)}:00 WITA`
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
      .select('user_id, twk, tiu, tkp, total, passed')
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
