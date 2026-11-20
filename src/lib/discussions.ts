/**
 * Diskusi per soal Lolosin (v2.8): komentar + balasan satu tingkat di
 * bawah pembahasan tiap soal.
 *
 * Tabel `public.discussions` (migrasi 005):
 * - id uuid PK, question_id text, user_id uuid (references profiles),
 *   body text, parent_id uuid null (references discussions, balasan
 *   satu tingkat), created_at timestamptz.
 * - RLS: baca publik (anon + authenticated), insert hanya user login
 *   yang Premium (user_id = auth.uid() + is_premium true atau
 *   premium_until masih aktif, migrasi 008), delete hanya penulis
 *   sendiri atau Dhinda.
 *
 * Sejak v2.13, menulis di diskusi (komentar + balasan) adalah fitur
 * Premium (keputusan Dhinda 19 Nov 2026, menggantikan "komunitas
 * harus terbuka"): membaca tetap gratis untuk semua, termasuk tamu.
 *
 * Semua fungsi aman saat Supabase belum terkonfigurasi (client null)
 * dan tidak pernah melempar error: kegagalan dikembalikan sebagai
 * hasil { ok: false } dengan pesan ramah. Username penulis diambil
 * dari tabel profiles (pola yang sama seperti leaderboard.ts); bila
 * profil tidak ditemukan, tampil "Peserta".
 */
import { getCurrentUser, getMyProfile } from './auth'
import { getPremiumStatus } from './premium'
import { isDevRedeemUser } from './redeem'
import { isSupabaseConfigured, supabase } from './supabase'

/** Panjang maksimum isi komentar/balasan (karakter). */
export const DISCUSSION_BODY_MAX = 2000

/** Nama tampilan bila profil penulis tidak ditemukan. */
export const DISCUSSION_UNKNOWN_AUTHOR = 'Peserta'

/** Satu komentar atau balasan di thread diskusi. */
export interface Comment {
  id: string
  questionId: string
  userId: string
  username: string
  body: string
  /** null = komentar utama; id komentar utama = balasan. */
  parentId: string | null
  createdAt: string
  /** Balasan satu tingkat (hanya terisi di komentar utama). */
  replies: Comment[]
}

/** Baris mentah dari tabel discussions (kolom yang kita select). */
interface DiscussionRow {
  id: string
  question_id: string
  user_id: string
  body: string
  parent_id: string | null
  created_at: string
}

/** Baris mentah dari tabel profiles (kolom yang kita select). */
interface DiscussionProfileRow {
  id: string
  username: string
}

/** Hasil pengambilan thread diskusi. */
export interface DiscussionResult {
  ok: boolean
  /** Komentar utama, masing-masing membawa balasannya. */
  comments: Comment[]
  /** Pesan ramah untuk user (bila gagal). */
  error?: string
}

/** Hasil tulis/hapus (komentar, balasan, hapus). */
export interface DiscussionWriteResult {
  ok: boolean
  /** Pesan ramah untuk user (bila gagal). */
  error?: string
}

/** Info viewer untuk aturan tampil tombol hapus dan form tulis. */
export interface DiscussionViewer {
  userId: string
  username: string | null
  email: string | null
  /** True bila viewer adalah Dhinda (boleh hapus komentar siapa pun). */
  isDev: boolean
  /**
   * True bila viewer Premium (boleh menulis). Dibaca lewat
   * getPremiumStatus, pola yang sama seperti halaman lain, jadi
   * toggle Premium Beta selama beta juga dihitung premium.
   */
  isPremium: boolean
}

/** True bila error PostgREST menandakan tabel discussions belum ada
 *  (migrasi 005 belum dijalankan). */
function isTableMissingError(error: { code?: string; message?: string }): boolean {
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const message = (error.message ?? '').toLowerCase()
  return (
    message.includes('discussions') &&
    (message.includes('does not exist') || message.includes('could not find'))
  )
}

/** True bila error PostgREST menandakan insert ditolak policy RLS
 *  (sejak migrasi 008: penulis bukan Premium). */
function isRlsViolationError(error: {
  code?: string
  message?: string
}): boolean {
  if (error.code === '42501') return true
  return (error.message ?? '')
    .toLowerCase()
    .includes('row-level security')
}

/** Validasi baris discussions mentah sebelum dipakai. */
function isDiscussionRow(value: unknown): value is DiscussionRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    typeof row.question_id === 'string' &&
    typeof row.user_id === 'string' &&
    typeof row.body === 'string' &&
    (row.parent_id === null || typeof row.parent_id === 'string') &&
    typeof row.created_at === 'string'
  )
}

/**
 * Susun baris mentah menjadi thread: komentar utama (parent_id null)
 * urut terlama dulu, masing-masing membawa balasannya (satu tingkat,
 * urut terlama dulu). Balasan yang parent-nya tidak ada di hasil
 * (tidak seharusnya terjadi, parent terhapus ikut menghapus balasan
 * lewat ON DELETE CASCADE) dibuang.
 */
export function buildDiscussionThread(
  rows: readonly DiscussionRow[],
  profiles: readonly DiscussionProfileRow[],
): Comment[] {
  const usernameById = new Map<string, string>()
  for (const profile of profiles) {
    usernameById.set(profile.id, profile.username)
  }
  const toComment = (row: DiscussionRow): Comment => ({
    id: row.id,
    questionId: row.question_id,
    userId: row.user_id,
    username: usernameById.get(row.user_id) ?? DISCUSSION_UNKNOWN_AUTHOR,
    body: row.body,
    parentId: row.parent_id,
    createdAt: row.created_at,
    replies: [],
  })
  const topLevel = new Map<string, Comment>()
  const comments: Comment[] = []
  for (const row of rows) {
    if (row.parent_id === null) {
      const comment = toComment(row)
      topLevel.set(comment.id, comment)
      comments.push(comment)
    }
  }
  for (const row of rows) {
    if (row.parent_id === null) continue
    const parent = topLevel.get(row.parent_id)
    if (parent) parent.replies.push(toComment(row))
  }
  return comments
}

/**
 * Ambil thread diskusi satu soal (bisa dibaca tamu). Komentar utama
 * dan balasannya urut terlama dulu. Aman saat Supabase belum
 * terkonfigurasi: mengembalikan { ok: false } dengan pesan ramah.
 */
export async function fetchDiscussion(
  questionId: string,
): Promise<DiscussionResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return {
      ok: false,
      comments: [],
      error: 'Fitur akun belum aktif.',
    }
  }
  try {
    const { data, error } = await supabase
      .from('discussions')
      .select('id, question_id, user_id, body, parent_id, created_at')
      .eq('question_id', questionId)
      .order('created_at', { ascending: true })
      .limit(200)
    if (error) {
      if (isTableMissingError(error)) {
        return {
          ok: false,
          comments: [],
          error: 'Diskusi belum aktif. Coba lagi nanti ya.',
        }
      }
      return {
        ok: false,
        comments: [],
        error: 'Diskusi gagal dimuat. Coba lagi ya.',
      }
    }
    const rows = (Array.isArray(data) ? data : []).filter(isDiscussionRow)
    if (rows.length === 0) return { ok: true, comments: [] }
    const userIds = [...new Set(rows.map((row) => row.user_id))]
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds)
    const typedProfiles: DiscussionProfileRow[] = []
    if (!profileError && Array.isArray(profiles)) {
      for (const profile of profiles as Array<Record<string, unknown>>) {
        if (
          typeof profile.id === 'string' &&
          typeof profile.username === 'string'
        ) {
          typedProfiles.push({ id: profile.id, username: profile.username })
        }
      }
    }
    return { ok: true, comments: buildDiscussionThread(rows, typedProfiles) }
  } catch {
    return {
      ok: false,
      comments: [],
      error: 'Diskusi gagal dimuat. Coba lagi ya.',
    }
  }
}

/** Validasi isi komentar/balasan sebelum dikirim ke database. */
function validateBody(rawBody: string): { body: string } | { error: string } {
  const body = rawBody.trim()
  if (!body) return { error: 'Tulis dulu komentarmu ya.' }
  if (body.length > DISCUSSION_BODY_MAX) {
    return {
      error: `Komentarmu kepanjangan, maksimal ${DISCUSSION_BODY_MAX} karakter ya.`,
    }
  }
  return { body }
}

/**
 * Kirim satu komentar utama ke soal ini. Hanya user login yang
 * Premium (RLS menolak insert tamu dan non-premium sejak migrasi
 * 008). Tidak pernah melempar error.
 */
export async function postComment(
  questionId: string,
  rawBody: string,
): Promise<DiscussionWriteResult> {
  return postDiscussion(questionId, rawBody, null)
}

/**
 * Kirim satu balasan ke komentar utama. Hanya user login yang
 * Premium (sama seperti komentar). Balasan tidak bisa dibalas
 * lagi (ditegakkan di UI; database menerima parent_id apa pun).
 * Tidak pernah melempar error.
 */
export async function postReply(
  questionId: string,
  parentId: string,
  rawBody: string,
): Promise<DiscussionWriteResult> {
  return postDiscussion(questionId, rawBody, parentId)
}

async function postDiscussion(
  questionId: string,
  rawBody: string,
  parentId: string | null,
): Promise<DiscussionWriteResult> {
  const validated = validateBody(rawBody)
  if ('error' in validated) return { ok: false, error: validated.error }
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Fitur akun belum aktif.' }
  }
  let user
  try {
    user = await getCurrentUser()
  } catch {
    return { ok: false, error: 'Komentar gagal dikirim. Coba lagi ya.' }
  }
  if (!user) {
    return { ok: false, error: 'Login dulu biar bisa ikut diskusi.' }
  }
  try {
    const { error } = await supabase.from('discussions').insert({
      question_id: questionId,
      user_id: user.id,
      body: validated.body,
      parent_id: parentId,
    })
    if (error) {
      if (isTableMissingError(error)) {
        return { ok: false, error: 'Diskusi belum aktif. Coba lagi nanti ya.' }
      }
      if (isRlsViolationError(error)) {
        return {
          ok: false,
          error: 'Menulis di diskusi itu fitur Premium. Aktifkan Premium dulu ya.',
        }
      }
      return { ok: false, error: 'Komentar gagal dikirim. Coba lagi ya.' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Komentar gagal dikirim. Coba lagi ya.' }
  }
}

/**
 * Hapus satu komentar (balasannya ikut terhapus lewat ON DELETE
 * CASCADE di database). RLS hanya mengizinkan penulis sendiri atau
 * Dhinda; pemanggil lain mendapat error. Tidak pernah melempar error.
 */
export async function deleteComment(
  commentId: string,
): Promise<DiscussionWriteResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Fitur akun belum aktif.' }
  }
  let user
  try {
    user = await getCurrentUser()
  } catch {
    return { ok: false, error: 'Komentar gagal dihapus. Coba lagi ya.' }
  }
  if (!user) {
    return { ok: false, error: 'Login dulu biar bisa hapus komentar.' }
  }
  try {
    const { error } = await supabase
      .from('discussions')
      .delete()
      .eq('id', commentId)
    if (error) {
      if (isTableMissingError(error)) {
        return { ok: false, error: 'Diskusi belum aktif. Coba lagi nanti ya.' }
      }
      return { ok: false, error: 'Komentar gagal dihapus. Coba lagi ya.' }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: 'Komentar gagal dihapus. Coba lagi ya.' }
  }
}

/**
 * Info viewer saat ini (null untuk tamu). Username diambil dari
 * profil; bila profil belum ada, username null dan cek dev hanya
 * memakai email. Status premium dibaca lewat getPremiumStatus
 * (pola yang sama seperti halaman lain). Tidak pernah melempar
 * error.
 */
export async function getDiscussionViewer(): Promise<DiscussionViewer | null> {
  if (!isSupabaseConfigured() || !supabase) return null
  try {
    const user = await getCurrentUser()
    if (!user) return null
    const [profile, premiumStatus] = await Promise.all([
      getMyProfile(),
      getPremiumStatus(user.id),
    ])
    const username = profile?.username ?? null
    const email = user.email ?? null
    return {
      userId: user.id,
      username,
      email,
      isDev: isDevRedeemUser(username, email),
      isPremium: premiumStatus.premium,
    }
  } catch {
    return null
  }
}

/**
 * Format timestamp menjadi waktu relatif Bahasa Indonesia:
 * "baru saja", "5 menit lalu", "2 jam lalu", "3 hari lalu", atau
 * tanggal "12 Des 2026" bila sudah lewat seminggu. Zona WITA.
 */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return 'baru saja'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'baru saja'
  if (minutes < 60) return `${minutes} menit lalu`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} hari lalu`
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
