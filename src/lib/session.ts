/**
 * Sesi ala Quizizz Lolosin: host membuat sesi berkode, pemain gabung
 * (maks 50 per sesi), host memulai, semua pemain menjawab 10 soal yang
 * sama, leaderboard live ter-update saat pemain mengirim jawaban.
 *
 * Host adalah fitur premium (dicek lewat lib/premium.ts di halaman
 * host, bukan di sini). Pemain yang ikut main tidak wajib premium.
 *
 * Semua fungsi di sini tidak pernah melempar error ke pemanggil:
 * kegagalan Supabase dikembalikan sebagai { ok: false, error } dengan
 * pesan ramah. Bila Supabase belum terkonfigurasi, semua fungsi
 * mengembalikan error atau null dengan aman.
 *
 * Live update memakai dua jalur: broadcast channel (sinyal cepat
 * pemain gabung, menjawab, sesi mulai, sesi selesai) dan postgres
 * changes di tabel game_players (leaderboard host ikut berubah saat
 * skor pemain berubah di database). Halaman juga melakukan polling
 * ringan sebagai cadangan bila Realtime tidak tersambung.
 *
 * Batasan V1: skor dilaporkan client (tanpa anti-cheat server-side),
 * host wajib tetap online selama sesi, dan hitung pemain saat gabung
 * bisa balapan bila dua orang gabung persis bersamaan (unique
 * constraint tetap mencegah satu user gabung dua kali).
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  generateGameCode,
  normalizeGameCode,
  pickGameQuestionIds,
  type GameChannel,
} from './battle'
import { isSupabaseConfigured, supabase } from './supabase'

/* ------------------------------------------------------------------ */
/* Konstanta                                                           */
/* ------------------------------------------------------------------ */

/** Batas pemain per sesi (sesuai default kolom max_players). */
export const SESSION_MAX_PLAYERS = 50

/* ------------------------------------------------------------------ */
/* Tipe                                                                */
/* ------------------------------------------------------------------ */

export type GameSessionStatus = 'lobby' | 'active' | 'finished'

/** Baris tabel public.game_sessions. */
export interface GameSessionRow {
  id: string
  code: string
  host_id: string
  status: GameSessionStatus
  question_ids: string[]
  max_players: number
  created_at: string
}

/** Baris tabel public.game_players. */
export interface GamePlayerRow {
  id: string
  session_id: string
  user_id: string
  display_name: string
  score: number
  answered_count: number
  joined_at: string
}

/** Hasil operasi sesi: ok true membawa data, ok false membawa pesan ramah. */
export interface SessionResult<T> {
  ok: boolean
  data?: T
  error?: string
}

/** Payload broadcast jawaban pemain (leaderboard live). */
export interface PlayerAnsweredPayload {
  userId: string
  displayName: string
  score: number
  answered: number
}

export interface SessionChannelHandlers {
  onPlayerJoined?: (payload: { userId: string; displayName: string }) => void
  onPlayerAnswered?: (payload: PlayerAnsweredPayload) => void
  onStarted?: () => void
  onFinished?: () => void
  onPlayerLeft?: (payload: { userId: string }) => void
}

/** Handle channel broadcast sesi (event-nya beda dengan battle). */
export interface SessionChannel {
  send: (
    event:
      | 'player-joined'
      | 'player-answered'
      | 'started'
      | 'finished'
      | 'player-left',
    payload: Record<string, unknown>,
  ) => void
  unsubscribe: () => void
}

/* ------------------------------------------------------------------ */
/* Parsing baris (defensif)                                            */
/* ------------------------------------------------------------------ */

function isSessionStatus(value: unknown): value is GameSessionStatus {
  return value === 'lobby' || value === 'active' || value === 'finished'
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every((v) => typeof v === 'string')) return null
  return value as string[]
}

/** Parse satu baris mentah menjadi GameSessionRow, atau null bila bentuknya aneh. */
export function parseGameSessionRow(row: unknown): GameSessionRow | null {
  if (typeof row !== 'object' || row === null) return null
  const r = row as Record<string, unknown>
  const questionIds = asStringArray(r.question_ids)
  if (
    typeof r.id !== 'string' ||
    typeof r.code !== 'string' ||
    typeof r.host_id !== 'string' ||
    !isSessionStatus(r.status) ||
    questionIds === null ||
    typeof r.max_players !== 'number' ||
    typeof r.created_at !== 'string'
  ) {
    return null
  }
  return {
    id: r.id,
    code: r.code,
    host_id: r.host_id,
    status: r.status,
    question_ids: questionIds,
    max_players: r.max_players,
    created_at: r.created_at,
  }
}

/** Parse satu baris mentah menjadi GamePlayerRow, atau null bila bentuknya aneh. */
export function parseGamePlayerRow(row: unknown): GamePlayerRow | null {
  if (typeof row !== 'object' || row === null) return null
  const r = row as Record<string, unknown>
  if (
    typeof r.id !== 'string' ||
    typeof r.session_id !== 'string' ||
    typeof r.user_id !== 'string' ||
    typeof r.display_name !== 'string' ||
    typeof r.score !== 'number' ||
    typeof r.answered_count !== 'number' ||
    typeof r.joined_at !== 'string'
  ) {
    return null
  }
  return {
    id: r.id,
    session_id: r.session_id,
    user_id: r.user_id,
    display_name: r.display_name,
    score: r.score,
    answered_count: r.answered_count,
    joined_at: r.joined_at,
  }
}

const NOT_CONFIGURED: SessionResult<never> = {
  ok: false,
  error: 'Fitur online belum aktif.',
}

function failed<T>(error: string): SessionResult<T> {
  return { ok: false, error }
}

/* ------------------------------------------------------------------ */
/* CRUD sesi                                                           */
/* ------------------------------------------------------------------ */

/**
 * Buat sesi baru sebagai host. Soal dipilih sekali di sini dan disimpan
 * sebagai question_ids, supaya semua pemain menjawab soal yang sama.
 * Bila kode bentrok (sangat jarang), dicoba lagi sampai 3 kali.
 */
export async function createGameSession(
  hostId: string,
): Promise<SessionResult<GameSessionRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  const client = supabase
  const questionIds = pickGameQuestionIds()
  if (questionIds.length === 0) {
    return failed('Bank soal lagi kosong, coba lagi nanti ya.')
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateGameCode()
    try {
      const { data, error } = await client
        .from('game_sessions')
        .insert({
          code,
          host_id: hostId,
          status: 'lobby',
          question_ids: questionIds,
          max_players: SESSION_MAX_PLAYERS,
        })
        .select()
        .single()
      if (error) {
        if (error.code === '23505') continue
        return failed('Sesi gagal dibuat, coba lagi ya.')
      }
      const session = parseGameSessionRow(data)
      if (!session) return failed('Sesi gagal dibuat, coba lagi ya.')
      return { ok: true, data: session }
    } catch {
      return failed('Koneksi bermasalah, coba lagi ya.')
    }
  }
  return failed('Kode sesi bentrok terus, coba lagi ya.')
}

/** Ambil sesi berdasarkan kode 6 karakter (input user dinormalisasi). */
export async function getGameSessionByCode(
  code: string,
): Promise<SessionResult<GameSessionRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  const clean = normalizeGameCode(code)
  if (clean.length !== 6) {
    return failed('Kode sesi itu 6 karakter ya, cek lagi.')
  }
  try {
    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('code', clean)
      .maybeSingle()
    if (error) return failed('Sesi gagal dimuat, coba lagi ya.')
    if (!data) return failed('Kode sesi tidak ditemukan, cek lagi ya.')
    const session = parseGameSessionRow(data)
    if (!session) return failed('Sesi gagal dimuat, coba lagi ya.')
    return { ok: true, data: session }
  } catch {
    return failed('Koneksi bermasalah, coba lagi ya.')
  }
}

/** Ambil sesi berdasarkan id (dipakai polling saat menunggu host). */
export async function getGameSessionById(
  id: string,
): Promise<SessionResult<GameSessionRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  try {
    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return failed('Sesi gagal dimuat, coba lagi ya.')
    const session = parseGameSessionRow(data)
    if (!session) return failed('Sesi gagal dimuat, coba lagi ya.')
    return { ok: true, data: session }
  } catch {
    return failed('Koneksi bermasalah, coba lagi ya.')
  }
}

/** Mulai sesi (hanya host, hanya dari status lobby). */
export async function startGameSession(
  sessionId: string,
  hostId: string,
): Promise<SessionResult<GameSessionRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  try {
    const { data, error } = await supabase
      .from('game_sessions')
      .update({ status: 'active' })
      .eq('id', sessionId)
      .eq('host_id', hostId)
      .eq('status', 'lobby')
      .select()
      .maybeSingle()
    if (error || !data) return failed('Sesi gagal dimulai, coba lagi ya.')
    const session = parseGameSessionRow(data)
    if (!session) return failed('Sesi gagal dimulai, coba lagi ya.')
    return { ok: true, data: session }
  } catch {
    return failed('Koneksi bermasalah, coba lagi ya.')
  }
}

/** Akhiri sesi (hanya host, hanya dari status active). */
export async function finishGameSession(
  sessionId: string,
  hostId: string,
): Promise<SessionResult<GameSessionRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  try {
    const { data, error } = await supabase
      .from('game_sessions')
      .update({ status: 'finished' })
      .eq('id', sessionId)
      .eq('host_id', hostId)
      .eq('status', 'active')
      .select()
      .maybeSingle()
    if (error || !data) return failed('Sesi gagal diakhiri, coba lagi ya.')
    const session = parseGameSessionRow(data)
    if (!session) return failed('Sesi gagal diakhiri, coba lagi ya.')
    return { ok: true, data: session }
  } catch {
    return failed('Koneksi bermasalah, coba lagi ya.')
  }
}

/* ------------------------------------------------------------------ */
/* Pemain                                                              */
/* ------------------------------------------------------------------ */

/**
 * Gabung sesi sebagai pemain. Bila user sudah terdaftar di sesi ini,
 * baris lamanya dikembalikan (gabung ulang itu aman). Bila sesi sudah
 * penuh (50 pemain), ditolak dengan pesan ramah. Bila sesi sudah
 * selesai, ditolak juga.
 */
export async function joinGameSession(
  session: GameSessionRow,
  userId: string,
  displayName: string,
): Promise<SessionResult<GamePlayerRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  if (session.status === 'finished') {
    return failed('Sesi ini sudah selesai, cari sesi lain ya.')
  }
  const client = supabase
  try {
    const { data: existing, error: existingError } = await client
      .from('game_players')
      .select('*')
      .eq('session_id', session.id)
      .eq('user_id', userId)
      .maybeSingle()
    if (existingError) return failed('Gagal gabung sesi, coba lagi ya.')
    if (existing) {
      const row = parseGamePlayerRow(existing)
      if (row) return { ok: true, data: row }
    }

    const { count, error: countError } = await client
      .from('game_players')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session.id)
    if (countError) return failed('Gagal gabung sesi, coba lagi ya.')
    if ((count ?? 0) >= session.max_players) {
      return failed(
        `Sesi sudah penuh (${session.max_players} pemain), cari sesi lain ya.`,
      )
    }

    const { data, error } = await client
      .from('game_players')
      .insert({
        session_id: session.id,
        user_id: userId,
        display_name: displayName,
      })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') {
        const { data: retry } = await client
          .from('game_players')
          .select('*')
          .eq('session_id', session.id)
          .eq('user_id', userId)
          .maybeSingle()
        const row = parseGamePlayerRow(retry)
        if (row) return { ok: true, data: row }
      }
      return failed('Gagal gabung sesi, coba lagi ya.')
    }
    const row = parseGamePlayerRow(data)
    if (!row) return failed('Gagal gabung sesi, coba lagi ya.')
    return { ok: true, data: row }
  } catch {
    return failed('Koneksi bermasalah, coba lagi ya.')
  }
}

/** Daftar pemain satu sesi, urut skor tertinggi dulu lalu paling cepat gabung. */
export async function listGamePlayers(
  sessionId: string,
): Promise<GamePlayerRow[]> {
  if (!isSupabaseConfigured() || !supabase) return []
  try {
    const { data, error } = await supabase
      .from('game_players')
      .select('*')
      .eq('session_id', sessionId)
      .order('score', { ascending: false })
      .order('joined_at', { ascending: true })
      .limit(50)
    if (error || !data) return []
    const rows: GamePlayerRow[] = []
    for (const raw of data) {
      const row = parseGamePlayerRow(raw)
      if (row) rows.push(row)
    }
    return rows
  } catch {
    return []
  }
}

/**
 * Catat satu jawaban pemain: answered_count naik 1, score naik 1 bila
 * benar. Dipanggil sekali per soal yang dijawab. Bila update gagal
 * (mis. koneksi putus), halaman menampilkan pesan dan jawaban itu
 * tidak tercatat, pemain bisa mencoba kirim ulang.
 */
export async function updatePlayerProgress(
  sessionId: string,
  userId: string,
  correct: boolean,
): Promise<SessionResult<GamePlayerRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  const client = supabase
  try {
    const { data: current, error: readError } = await client
      .from('game_players')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle()
    if (readError || !current) {
      return failed('Jawaban gagal terkirim, coba lagi ya.')
    }
    const row = parseGamePlayerRow(current)
    if (!row) return failed('Jawaban gagal terkirim, coba lagi ya.')
    const { data, error } = await client
      .from('game_players')
      .update({
        score: row.score + (correct ? 1 : 0),
        answered_count: row.answered_count + 1,
      })
      .eq('id', row.id)
      .select()
      .maybeSingle()
    if (error || !data) return failed('Jawaban gagal terkirim, coba lagi ya.')
    const updated = parseGamePlayerRow(data)
    if (!updated) return failed('Jawaban gagal terkirim, coba lagi ya.')
    return { ok: true, data: updated }
  } catch {
    return failed('Koneksi bermasalah, coba lagi ya.')
  }
}

/** Keluar dari sesi (menghapus baris pemain). Dipakai saat pemain meninggalkan lobi. */
export async function leaveGameSession(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false
  try {
    const { error } = await supabase
      .from('game_players')
      .delete()
      .eq('session_id', sessionId)
      .eq('user_id', userId)
    return !error
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/* Channel Realtime                                                    */
/* ------------------------------------------------------------------ */

function asPlayerJoinedPayload(
  payload: unknown,
): { userId: string; displayName: string } | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (typeof p.userId !== 'string' || typeof p.displayName !== 'string') {
    return null
  }
  return { userId: p.userId, displayName: p.displayName }
}

function asPlayerAnsweredPayload(
  payload: unknown,
): PlayerAnsweredPayload | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (
    typeof p.userId !== 'string' ||
    typeof p.displayName !== 'string' ||
    typeof p.score !== 'number' ||
    typeof p.answered !== 'number'
  ) {
    return null
  }
  return {
    userId: p.userId,
    displayName: p.displayName,
    score: p.score,
    answered: p.answered,
  }
}

function asPlayerLeftPayload(payload: unknown): { userId: string } | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (typeof p.userId !== 'string') return null
  return { userId: p.userId }
}

/**
 * Berlangganan channel broadcast satu sesi. Event yang dipakai:
 * - 'player-joined': pemain baru gabung (host me-refresh daftar).
 * - 'player-answered': pemain mengirim jawaban (leaderboard live).
 * - 'started': host memulai sesi (pemain masuk arena).
 * - 'finished': host mengakhiri sesi (podium tampil).
 * - 'player-left': pemain keluar dari sesi.
 * Mengembalikan null bila Supabase belum terkonfigurasi. Pemanggil
 * wajib memanggil unsubscribe saat komponen dilepas.
 */
export function subscribeSessionChannel(
  code: string,
  handlers: SessionChannelHandlers,
): SessionChannel | null {
  if (!isSupabaseConfigured() || !supabase) return null
  const client = supabase
  const channel: RealtimeChannel = client.channel(
    `session:${normalizeGameCode(code)}`,
    { config: { broadcast: { self: false } } },
  )

  channel.on('broadcast', { event: 'player-joined' }, ({ payload }) => {
    const parsed = asPlayerJoinedPayload(payload)
    if (parsed) handlers.onPlayerJoined?.(parsed)
  })
  channel.on('broadcast', { event: 'player-answered' }, ({ payload }) => {
    const parsed = asPlayerAnsweredPayload(payload)
    if (parsed) handlers.onPlayerAnswered?.(parsed)
  })
  channel.on('broadcast', { event: 'started' }, () => {
    handlers.onStarted?.()
  })
  channel.on('broadcast', { event: 'finished' }, () => {
    handlers.onFinished?.()
  })
  channel.on('broadcast', { event: 'player-left' }, ({ payload }) => {
    const parsed = asPlayerLeftPayload(payload)
    if (parsed) handlers.onPlayerLeft?.(parsed)
  })

  channel.subscribe()

  return {
    send: (event, payload) => {
      void channel
        .send({ type: 'broadcast', event, payload })
        .catch(() => {
          // Gagal kirim broadcast: halaman tetap jalan via polling.
        })
    },
    unsubscribe: () => {
      void client.removeChannel(channel).catch(() => {
        // Abaikan.
      })
    },
  }
}

/**
 * Berlangganan perubahan baris game_players sesi ini (insert, update,
 * delete) lewat postgres changes. Dipakai halaman host supaya
 * leaderboard live ikut berubah saat skor pemain berubah di database,
 * tanpa menunggu broadcast. Perlu tabel game_players masuk publikasi
 * supabase_realtime (migrasi 002). Mengembalikan fungsi unsubscribe,
 * atau null bila Supabase belum terkonfigurasi.
 */
export function subscribeSessionPlayers(
  sessionId: string,
  onChange: () => void,
): (() => void) | null {
  if (!isSupabaseConfigured() || !supabase) return null
  const client = supabase
  const channel: RealtimeChannel = client.channel(
    `session-players:${sessionId}`,
  )
  channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'game_players',
      filter: `session_id=eq.${sessionId}`,
    },
    () => {
      onChange()
    },
  )
  channel.subscribe()
  return () => {
    void client.removeChannel(channel).catch(() => {
      // Abaikan.
    })
  }
}

/** Re-ekspor tipe channel battle supaya halaman game punya satu sumber tipe. */
export type { GameChannel }
