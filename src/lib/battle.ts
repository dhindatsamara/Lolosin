/**
 * Battle 1v1 Lolosin: CRUD sesi battle + channel Realtime broadcast.
 *
 * Alur: host membuat battle (dapat kode 6 karakter) lalu membagikan
 * kodenya. Lawan gabung dengan kode. Kedua pemain mengerjakan 10 soal
 * YANG SAMA (question_ids disimpan di baris battle_sessions saat battle
 * dibuat, soal diambil dari bank lokal via ID). Progres live (berapa
 * soal sudah dijawab lawan) dikirim lewat broadcast channel per battle.
 * Pemenang = skor benar terbanyak, seri = total waktu tercepat.
 *
 * Host memilih kategori soal saat membuat battle (TWK, TIU, TKP, atau
 * Campur): kategori hanya mengubah pemilihan soal di host, karena lawan
 * membaca soal yang sama dari baris battle_sessions. Kategori satu
 * battle diturunkan dari soal tersimpannya (semua satu materi berarti
 * kategori itu, campuran berarti Campur), jadi tidak butuh kolom baru.
 *
 * Selain kode dan link, host bisa mengundang lewat username: guest_id
 * diisi id profil yang diundang selagi status masih 'waiting'. Lawan
 * melihat undangan masuk lewat query guest_id = id saya, lalu menerima
 * (status jadi 'active') atau menolak (status jadi 'cancelled'). RLS
 * yang sudah ada di migrasi 002 mengizinkan semua langkah ini: SELECT
 * terbuka untuk user login, UPDATE hanya host atau guest battle itu.
 * joinBattle sengaja tetap menolak battle yang guest_id-nya sudah
 * terisi, supaya battle undangan tidak bisa direbut orang lain lewat
 * kode; penerimaan undangan memakai acceptBattleInvite.
 *
 * Semua fungsi di sini tidak pernah melempar error ke pemanggil:
 * kegagalan Supabase dikembalikan sebagai { ok: false, error } dengan
 * pesan ramah. Bila Supabase belum terkonfigurasi, semua fungsi tulis
 * dan baca mengembalikan error atau null dengan aman.
 *
 * Batasan V1: skor dilaporkan client (tanpa anti-cheat server-side),
 * dan kedua pemain harus tetap online selama battle.
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  getQuestionById,
  getQuestions,
  QUIZABLE_QUESTIONS,
  type Materi,
  type Opsi,
  type Question,
} from './questions'
import { shuffle } from './quiz'
import { isSupabaseConfigured, supabase } from './supabase'

/* ------------------------------------------------------------------ */
/* Konstanta                                                           */
/* ------------------------------------------------------------------ */

/** Jumlah soal dalam satu battle (dan satu sesi Quizizz). */
export const GAME_QUESTION_COUNT = 10

/** Panjang kode battle/sesi. */
export const GAME_CODE_LENGTH = 6

/** Alfabet kode: tanpa huruf/angka yang mirip (I, O, 0, 1) supaya mudah dibaca. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/* ------------------------------------------------------------------ */
/* Tipe                                                                */
/* ------------------------------------------------------------------ */

export type BattleStatus = 'waiting' | 'active' | 'finished' | 'cancelled'

/** Kategori soal satu battle: satu subtes, atau campuran ketiganya. */
export type BattleCategory = Materi | 'campur'

/** Semua kategori, urutan tampil di pemilih kategori. */
export const BATTLE_CATEGORIES: BattleCategory[] = [
  'TWK',
  'TIU',
  'TKP',
  'campur',
]

/** Baris tabel public.battle_sessions. */
export interface BattleRow {
  id: string
  code: string
  host_id: string
  guest_id: string | null
  status: BattleStatus
  question_ids: string[]
  host_score: number
  guest_score: number
  host_time_ms: number | null
  guest_time_ms: number | null
  created_at: string
  finished_at: string | null
}

/** Peran pemain dalam satu battle. */
export type BattleRole = 'host' | 'guest'

/** Hasil operasi battle: ok true membawa data, ok false membawa pesan ramah. */
export interface BattleResult<T> {
  ok: boolean
  data?: T
  error?: string
}

/** Payload broadcast progres: lawan sudah jawab berapa soal. */
export interface BattleProgressPayload {
  userId: string
  answered: number
  correct: number
}

/** Payload broadcast selesai: lawan sudah kirim skor akhirnya. */
export interface BattleFinishedPayload {
  userId: string
  score: number
  timeMs: number
}

export interface BattleChannelHandlers {
  onProgress?: (payload: BattleProgressPayload) => void
  onFinished?: (payload: BattleFinishedPayload) => void
  onLeft?: (payload: { userId: string }) => void
  /** Dipanggil saat daftar user yang online di channel berubah. */
  onPresence?: (presentUserIds: string[]) => void
}

/** Handle channel broadcast: kirim event atau berhenti berlangganan. */
export interface GameChannel {
  send: (
    event: 'progress' | 'finished' | 'left',
    payload: Record<string, unknown>,
  ) => void
  unsubscribe: () => void
}

/* ------------------------------------------------------------------ */
/* Kode game                                                           */
/* ------------------------------------------------------------------ */

/** Kode acak 6 karakter dari alfabet tanpa huruf mirip. */
export function generateGameCode(length: number = GAME_CODE_LENGTH): string {
  let code = ''
  try {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    for (const b of bytes) {
      code += CODE_ALPHABET[b % CODE_ALPHABET.length]
    }
    return code
  } catch {
    for (let i = 0; i < length; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    }
    return code
  }
}

/** Normalisasi kode dari input user: trim lalu huruf besar. */
export function normalizeGameCode(code: string): string {
  return code.trim().toUpperCase()
}

/* ------------------------------------------------------------------ */
/* Pemilihan soal                                                      */
/* ------------------------------------------------------------------ */

/**
 * Pilih id soal untuk satu game.
 * - Kategori satu materi (TWK/TIU/TKP): semua soal dari materi itu.
 * - 'campur' (default): campuran 3 TWK, 4 TIU, 3 TKP, urutan diacak.
 * Bila satu materi kehabisan soal, kekurangannya diisi soal acak dari
 * materi lain. Tidak ada soal yang berulang dalam satu set. Pool yang
 * dipakai hanya soal ber-kunci (getQuestions), dan opsi kosong
 * disembunyikan di tampilan lewat visibleOptions.
 */
export function pickGameQuestionIds(
  count: number = GAME_QUESTION_COUNT,
  category: BattleCategory = 'campur',
): string[] {
  if (category !== 'campur') {
    const picked = shuffle(getQuestions(category)).slice(0, count)
    if (picked.length < count) {
      const ids = new Set(picked.map((q) => q.id))
      for (const q of shuffle(QUIZABLE_QUESTIONS)) {
        if (picked.length >= count) break
        if (!ids.has(q.id)) {
          picked.push(q)
          ids.add(q.id)
        }
      }
    }
    return shuffle(picked)
      .slice(0, count)
      .map((q) => q.id)
  }
  const mix: Array<{ materi: Materi; n: number }> = [
    { materi: 'TWK', n: 3 },
    { materi: 'TIU', n: 4 },
    { materi: 'TKP', n: 3 },
  ]
  const picked: Question[] = []
  for (const { materi, n } of mix) {
    picked.push(...shuffle(getQuestions(materi)).slice(0, n))
  }
  if (picked.length < count) {
    const ids = new Set(picked.map((q) => q.id))
    for (const q of shuffle(QUIZABLE_QUESTIONS)) {
      if (picked.length >= count) break
      if (!ids.has(q.id)) {
        picked.push(q)
        ids.add(q.id)
      }
    }
  }
  return shuffle(picked)
    .slice(0, count)
    .map((q) => q.id)
}

/** Ambil objek soal dari bank lokal berdasarkan daftar id (yang hilang dilewati). */
export function resolveGameQuestions(ids: readonly string[]): Question[] {
  const questions: Question[] = []
  for (const id of ids) {
    const q = getQuestionById(id)
    if (q !== undefined) questions.push(q)
  }
  return questions
}

/**
 * Turunkan kategori battle dari soalnya: semua satu materi berarti
 * kategori materi itu, campuran (atau tidak ada soal yang ketemu)
 * berarti 'campur'. Dipakai lobi, arena, dan kartu undangan, supaya
 * kategori tampil sama untuk host dan lawan tanpa kolom baru.
 */
export function deriveBattleCategory(
  questions: readonly Question[],
): BattleCategory {
  if (questions.length === 0) return 'campur'
  const first = questions[0].materi
  return questions.every((q) => q.materi === first) ? first : 'campur'
}

/** Turunkan kategori battle dari daftar id soal tersimpan. */
export function deriveBattleCategoryFromIds(
  ids: readonly string[],
): BattleCategory {
  return deriveBattleCategory(resolveGameQuestions(ids))
}

/**
 * Hitung jawaban benar dari satu set jawaban. "Benar" = jawaban sama
 * dengan kunci; untuk TKP berarti opsi terbaik.
 */
export function countCorrect(
  questions: readonly Question[],
  answers: Record<string, Opsi>,
): number {
  let correct = 0
  for (const q of questions) {
    const answer = answers[q.id]
    if (answer !== undefined && answer === q.kunci) correct += 1
  }
  return correct
}

/* ------------------------------------------------------------------ */
/* Parsing baris (defensif)                                            */
/* ------------------------------------------------------------------ */

function isBattleStatus(value: unknown): value is BattleStatus {
  return (
    value === 'waiting' ||
    value === 'active' ||
    value === 'finished' ||
    value === 'cancelled'
  )
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every((v) => typeof v === 'string')) return null
  return value as string[]
}

/** Parse satu baris mentah dari Supabase menjadi BattleRow, atau null bila bentuknya aneh. */
export function parseBattleRow(row: unknown): BattleRow | null {
  if (typeof row !== 'object' || row === null) return null
  const r = row as Record<string, unknown>
  const questionIds = asStringArray(r.question_ids)
  if (
    typeof r.id !== 'string' ||
    typeof r.code !== 'string' ||
    typeof r.host_id !== 'string' ||
    (r.guest_id !== null && typeof r.guest_id !== 'string') ||
    !isBattleStatus(r.status) ||
    questionIds === null ||
    typeof r.host_score !== 'number' ||
    typeof r.guest_score !== 'number' ||
    (r.host_time_ms !== null && typeof r.host_time_ms !== 'number') ||
    (r.guest_time_ms !== null && typeof r.guest_time_ms !== 'number') ||
    typeof r.created_at !== 'string' ||
    (r.finished_at !== null && typeof r.finished_at !== 'string')
  ) {
    return null
  }
  return {
    id: r.id,
    code: r.code,
    host_id: r.host_id,
    guest_id: r.guest_id as string | null,
    status: r.status,
    question_ids: questionIds,
    host_score: r.host_score,
    guest_score: r.guest_score,
    host_time_ms: r.host_time_ms as number | null,
    guest_time_ms: r.guest_time_ms as number | null,
    created_at: r.created_at,
    finished_at: r.finished_at as string | null,
  }
}

/* ------------------------------------------------------------------ */
/* CRUD battle                                                         */
/* ------------------------------------------------------------------ */

const NOT_CONFIGURED: BattleResult<never> = {
  ok: false,
  error: 'Fitur online belum aktif.',
}

function failed<T>(error: string): BattleResult<T> {
  return { ok: false, error }
}

/**
 * Buat battle baru sebagai host. Soal dipilih sekali di sini sesuai
 * kategori dan disimpan sebagai question_ids, supaya host dan lawan
 * mengerjakan soal yang sama persis. Bila kode bentrok (sangat jarang),
 * dicoba lagi dengan kode baru sampai 3 kali.
 */
export async function createBattle(
  hostId: string,
  category: BattleCategory = 'campur',
): Promise<BattleResult<BattleRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  const client = supabase
  const questionIds = pickGameQuestionIds(GAME_QUESTION_COUNT, category)
  if (questionIds.length === 0) {
    return failed('Bank soal lagi kosong, coba lagi nanti ya.')
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateGameCode()
    try {
      const { data, error } = await client
        .from('battle_sessions')
        .insert({
          code,
          host_id: hostId,
          status: 'waiting',
          question_ids: questionIds,
        })
        .select()
        .single()
      if (error) {
        if (error.code === '23505') continue
        return failed('Battle gagal dibuat, coba lagi ya.')
      }
      const battle = parseBattleRow(data)
      if (!battle) return failed('Battle gagal dibuat, coba lagi ya.')
      return { ok: true, data: battle }
    } catch {
      return failed('Koneksi bermasalah, coba lagi ya.')
    }
  }
  return failed('Kode battle bentrok terus, coba lagi ya.')
}

/** Ambil battle berdasarkan kode 6 karakter (input user dinormalisasi). */
export async function getBattleByCode(
  code: string,
): Promise<BattleResult<BattleRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  const clean = normalizeGameCode(code)
  if (clean.length !== GAME_CODE_LENGTH) {
    return failed('Kode battle itu 6 karakter ya, cek lagi.')
  }
  try {
    const { data, error } = await supabase
      .from('battle_sessions')
      .select('*')
      .eq('code', clean)
      .maybeSingle()
    if (error) return failed('Battle gagal dimuat, coba lagi ya.')
    if (!data) return failed('Kode battle tidak ditemukan, cek lagi ya.')
    const battle = parseBattleRow(data)
    if (!battle) return failed('Battle gagal dimuat, coba lagi ya.')
    return { ok: true, data: battle }
  } catch {
    return failed('Koneksi bermasalah, coba lagi ya.')
  }
}

/** Ambil battle berdasarkan id (dipakai polling saat menunggu lawan). */
export async function getBattleById(
  id: string,
): Promise<BattleResult<BattleRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  try {
    const { data, error } = await supabase
      .from('battle_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return failed('Battle gagal dimuat, coba lagi ya.')
    const battle = parseBattleRow(data)
    if (!battle) return failed('Battle gagal dimuat, coba lagi ya.')
    return { ok: true, data: battle }
  } catch {
    return failed('Koneksi bermasalah, coba lagi ya.')
  }
}

/**
 * Gabung battle sebagai lawan. Hanya berhasil bila battle masih
 * menunggu dan belum ada lawan (dicek atomik di query, jadi dua orang
 * yang gabung bersamaan tidak bisa sama-sama masuk). Host tidak bisa
 * gabung ke battle-nya sendiri.
 */
export async function joinBattle(
  battle: BattleRow,
  guestId: string,
): Promise<BattleResult<BattleRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  if (battle.host_id === guestId) {
    return failed('Itu battle buatanmu sendiri, bagikan kodenya ke lawan ya.')
  }
  if (battle.status !== 'waiting' || battle.guest_id !== null) {
    return failed('Battle ini sudah dimulai atau sudah penuh.')
  }
  try {
    const { data, error } = await supabase
      .from('battle_sessions')
      .update({ guest_id: guestId, status: 'active' })
      .eq('id', battle.id)
      .eq('status', 'waiting')
      .is('guest_id', null)
      .select()
      .maybeSingle()
    if (error) return failed('Gagal gabung battle, coba lagi ya.')
    if (!data) return failed('Battle ini sudah dimulai atau sudah penuh.')
    const updated = parseBattleRow(data)
    if (!updated) return failed('Gagal gabung battle, coba lagi ya.')
    return { ok: true, data: updated }
  } catch {
    return failed('Koneksi bermasalah, coba lagi ya.')
  }
}

/**
 * Cari profil dari username. Username dinormalisasi (trim + huruf
 * kecil) mengikuti aturan di lib/auth.ts, jadi pencarian tidak peduli
 * kapital. Dipakai host saat mengundang teman lewat username.
 */
export async function findProfileByUsername(
  username: string,
): Promise<BattleResult<{ id: string; username: string }>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  const clean = username.trim().toLowerCase()
  if (clean.length === 0) {
    return failed('Isi dulu username temanmu ya.')
  }
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', clean)
      .maybeSingle()
    if (error) return failed('Username gagal dicari, coba lagi ya.')
    if (!data) return failed('Username tidak ditemukan, cek lagi ya.')
    const row = data as { id: unknown; username: unknown }
    if (typeof row.id !== 'string' || typeof row.username !== 'string') {
      return failed('Username tidak ditemukan, cek lagi ya.')
    }
    return { ok: true, data: { id: row.id, username: row.username } }
  } catch {
    return failed('Koneksi bermasalah, coba lagi ya.')
  }
}

/**
 * Undang satu user ke battle yang masih menunggu, dengan mengisi
 * guest_id baris battle. Battle jadi khusus untuk yang diundang:
 * joinBattle menolak battle yang guest_id-nya sudah terisi, jadi
 * tidak bisa direbut orang lain lewat kode. Dicek atomik di query,
 * jadi undangan gagal bila lawan lain sudah gabung duluan. RLS
 * mengizinkan update ini karena pemanggil adalah host battle itu.
 */
export async function inviteGuestToBattle(
  battle: BattleRow,
  guestId: string,
): Promise<BattleResult<BattleRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  if (battle.host_id === guestId) {
    return failed('Itu username kamu sendiri, undang teman lain ya.')
  }
  if (battle.status !== 'waiting' || battle.guest_id !== null) {
    return failed('Battle ini sudah ada lawannya.')
  }
  try {
    const { data, error } = await supabase
      .from('battle_sessions')
      .update({ guest_id: guestId })
      .eq('id', battle.id)
      .eq('status', 'waiting')
      .is('guest_id', null)
      .select()
      .maybeSingle()
    if (error) return failed('Undangan gagal dikirim, coba lagi ya.')
    if (!data) return failed('Battle ini sudah ada lawannya.')
    const updated = parseBattleRow(data)
    if (!updated) return failed('Undangan gagal dikirim, coba lagi ya.')
    return { ok: true, data: updated }
  } catch {
    return failed('Koneksi bermasalah, coba lagi ya.')
  }
}

/**
 * Daftar undangan battle masuk untuk satu user: battle yang guest_id-nya
 * adalah user itu dan statusnya masih 'waiting', terbaru dulu. RLS
 * battle_sessions_select_auth (migrasi 002) mengizinkan user login
 * membaca baris battle apa pun, jadi query ini jalan tanpa policy baru.
 * Tidak pernah melempar: gagal baca mengembalikan daftar kosong.
 */
export async function getIncomingInvites(userId: string): Promise<BattleRow[]> {
  if (!isSupabaseConfigured() || !supabase) return []
  try {
    const { data, error } = await supabase
      .from('battle_sessions')
      .select('*')
      .eq('guest_id', userId)
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
    if (error || !data) return []
    const invites: BattleRow[] = []
    for (const row of data) {
      const parsed = parseBattleRow(row)
      if (parsed) invites.push(parsed)
    }
    return invites
  } catch {
    return []
  }
}

/**
 * Terima undangan battle: status 'waiting' jadi 'active' untuk battle
 * yang guest_id-nya memang user ini. Pasangan joinBattle untuk jalur
 * undangan (joinBattle menolak battle yang guest_id-nya sudah terisi).
 * RLS mengizinkan update ini karena pemanggil adalah guest battle itu.
 */
export async function acceptBattleInvite(
  battle: BattleRow,
  guestId: string,
): Promise<BattleResult<BattleRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  if (battle.guest_id !== guestId) {
    return failed('Undangan ini bukan untukmu.')
  }
  if (battle.status !== 'waiting') {
    return failed('Undangan ini sudah tidak berlaku.')
  }
  try {
    const { data, error } = await supabase
      .from('battle_sessions')
      .update({ status: 'active' })
      .eq('id', battle.id)
      .eq('status', 'waiting')
      .eq('guest_id', guestId)
      .select()
      .maybeSingle()
    if (error) return failed('Gagal menerima undangan, coba lagi ya.')
    if (!data) return failed('Undangan ini sudah tidak berlaku.')
    const updated = parseBattleRow(data)
    if (!updated) return failed('Gagal menerima undangan, coba lagi ya.')
    return { ok: true, data: updated }
  } catch {
    return failed('Koneksi bermasalah, coba lagi ya.')
  }
}

/**
 * Kirim skor akhir satu pemain (skor benar + total waktu). Bila kedua
 * pemain sudah kirim, status battle diubah jadi finished. Waktu yang
 * tersimpan (bukan skor) jadi penanda "sudah kirim", karena skor 0
 * tetap skor yang sah.
 */
export async function submitBattleResult(
  battleId: string,
  role: BattleRole,
  score: number,
  timeMs: number,
): Promise<BattleResult<BattleRow>> {
  if (!isSupabaseConfigured() || !supabase) return NOT_CONFIGURED
  const scoreField = role === 'host' ? 'host_score' : 'guest_score'
  const timeField = role === 'host' ? 'host_time_ms' : 'guest_time_ms'
  try {
    const { data, error } = await supabase
      .from('battle_sessions')
      .update({ [scoreField]: score, [timeField]: timeMs })
      .eq('id', battleId)
      .select()
      .maybeSingle()
    if (error || !data) {
      return failed('Skor gagal dikirim, coba lagi ya.')
    }
    const battle = parseBattleRow(data)
    if (!battle) return failed('Skor gagal dikirim, coba lagi ya.')
    if (
      battle.host_time_ms !== null &&
      battle.guest_time_ms !== null &&
      battle.status !== 'finished'
    ) {
      const { data: finished, error: finishError } = await supabase
        .from('battle_sessions')
        .update({
          status: 'finished',
          finished_at: new Date().toISOString(),
        })
        .eq('id', battleId)
        .select()
        .maybeSingle()
      if (!finishError && finished) {
        const done = parseBattleRow(finished)
        if (done) return { ok: true, data: done }
      }
    }
    return { ok: true, data: battle }
  } catch {
    return failed('Koneksi bermasalah, coba lagi ya.')
  }
}

/**
 * Batalkan battle yang masih menunggu atau berjalan. Dipakai host
 * saat membatalkan, atau pemain yang keluar di tengah battle.
 */
export async function abandonBattle(battleId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false
  try {
    const { error } = await supabase
      .from('battle_sessions')
      .update({ status: 'cancelled' })
      .eq('id', battleId)
      .in('status', ['waiting', 'active'])
    return !error
  } catch {
    return false
  }
}

/**
 * Tandai battle sebagai selesai tanpa menunggu skor lawan. Dipakai
 * pemain yang sudah kirim skor saat lawannya keluar tanpa
 * menyelesaikan battle. Pemenang di layar hasil dihitung dari skor
 * yang terkirim (lawan yang tidak menyelesaikan dianggap kalah).
 */
export async function finishBattleEarly(battleId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false
  try {
    const { error } = await supabase
      .from('battle_sessions')
      .update({
        status: 'finished',
        finished_at: new Date().toISOString(),
      })
      .eq('id', battleId)
      .eq('status', 'active')
    return !error
  } catch {
    return false
  }
}

/**
 * Tentukan pemenang dari baris battle yang sudah selesai: skor benar
 * terbanyak menang, seri ditentukan total waktu tercepat. Null bila
 * salah satu pemain belum kirim skor.
 */
export function decideBattleWinner(
  battle: BattleRow,
): 'host' | 'guest' | 'draw' | null {
  if (battle.host_time_ms === null || battle.guest_time_ms === null) {
    return null
  }
  if (battle.host_score !== battle.guest_score) {
    return battle.host_score > battle.guest_score ? 'host' : 'guest'
  }
  if (battle.host_time_ms === battle.guest_time_ms) return 'draw'
  return battle.host_time_ms < battle.guest_time_ms ? 'host' : 'guest'
}

/** Ambil username para pemain battle (id user ke username). */
export async function getBattleUsernames(
  userIds: readonly string[],
): Promise<Record<string, string>> {
  const names: Record<string, string> = {}
  if (userIds.length === 0) return names
  if (!isSupabaseConfigured() || !supabase) return names
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', [...userIds])
    if (error || !data) return names
    for (const row of data as Array<{ id: string; username: string }>) {
      names[row.id] = row.username
    }
    return names
  } catch {
    return names
  }
}

/* ------------------------------------------------------------------ */
/* Channel Realtime broadcast + presence                               */
/* ------------------------------------------------------------------ */

function asProgressPayload(payload: unknown): BattleProgressPayload | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (
    typeof p.userId !== 'string' ||
    typeof p.answered !== 'number' ||
    typeof p.correct !== 'number'
  ) {
    return null
  }
  return { userId: p.userId, answered: p.answered, correct: p.correct }
}

function asFinishedPayload(payload: unknown): BattleFinishedPayload | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (
    typeof p.userId !== 'string' ||
    typeof p.score !== 'number' ||
    typeof p.timeMs !== 'number'
  ) {
    return null
  }
  return { userId: p.userId, score: p.score, timeMs: p.timeMs }
}

function asLeftPayload(payload: unknown): { userId: string } | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (typeof p.userId !== 'string') return null
  return { userId: p.userId }
}

/**
 * Berlangganan channel broadcast satu battle. Event yang dipakai:
 * - 'progress': lawan menjawab satu soal (progres live).
 * - 'finished': lawan sudah kirim skor akhir.
 * - 'left': lawan keluar dari battle.
 * Presence melacak siapa yang sedang online di channel, supaya lawan
 * yang disconnect bisa terdeteksi. Mengembalikan null bila Supabase
 * belum terkonfigurasi. Pemanggil wajib memanggil unsubscribe saat
 * komponen dilepas.
 */
export function subscribeBattleChannel(
  code: string,
  selfUserId: string,
  selfUsername: string,
  handlers: BattleChannelHandlers,
): GameChannel | null {
  if (!isSupabaseConfigured() || !supabase) return null
  const client = supabase
  const channel: RealtimeChannel = client.channel(
    `battle:${normalizeGameCode(code)}`,
    {
      config: {
        broadcast: { self: false },
        presence: { key: selfUserId },
      },
    },
  )

  channel.on('broadcast', { event: 'progress' }, ({ payload }) => {
    const parsed = asProgressPayload(payload)
    if (parsed) handlers.onProgress?.(parsed)
  })
  channel.on('broadcast', { event: 'finished' }, ({ payload }) => {
    const parsed = asFinishedPayload(payload)
    if (parsed) handlers.onFinished?.(parsed)
  })
  channel.on('broadcast', { event: 'left' }, ({ payload }) => {
    const parsed = asLeftPayload(payload)
    if (parsed) handlers.onLeft?.(parsed)
  })
  channel.on('presence', { event: 'sync' }, () => {
    try {
      const state = channel.presenceState() as unknown as Record<
        string,
        Array<Record<string, unknown>>
      >
      const ids = new Set<string>()
      for (const metas of Object.values(state)) {
        for (const meta of metas) {
          if (typeof meta.user_id === 'string') ids.add(meta.user_id)
        }
      }
      handlers.onPresence?.([...ids])
    } catch {
      // Presence gagal dibaca: abaikan, polling tetap jalan.
    }
  })

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      void channel
        .track({ user_id: selfUserId, username: selfUsername })
        .catch(() => {
          // Gagal track presence: progres broadcast tetap jalan.
        })
    }
  })

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
