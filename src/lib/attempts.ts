/**
 * Penyimpanan jawaban per attempt tryout (v2.12.1, keputusan Dhinda
 * 19 Nov 2026): supaya riwayat "Lihat hasil" bisa membuka halaman
 * hasil LENGKAP dengan pembahasan per soal, bukan cuma skor.
 *
 * Masalah yang ditutup: sebelum v2.12.1, riwayat hanya menyimpan
 * skor (TryoutRecord tanpa soal/jawaban), jadi pembahasan per soal
 * hanya bisa dilihat dari halaman hasil segar dalam sesi yang sama.
 * Akibatnya unlock Senin 00:00 WIB untuk user gratis (v2.12) hampir
 * tidak terjangkau: user yang menutup halaman Minggu lalu balik
 * Senin lewat riwayat tetap tidak bisa membaca pembahasan.
 *
 * Yang disimpan (ringkas, tanpa duplikasi teks soal):
 * - `questionIds`: id soal berurutan sesuai urutan pengerjaan.
 * - `answers`: id soal ke opsi yang dipilih (soal yang tidak
 *   dijawab tidak punya entri, sama seperti TryoutAnswers sesi).
 * Teks soal, kunci, dan pembahasan diambil lagi dari bank soal
 * lewat getQuestionById saat rekonstruksi.
 *
 * Dua jalur simpan:
 * - Lokal: `attempt` di TryoutRecord (store `lolosin:v1`, ikut
 *   tersinkron ke user_progress untuk user login; tamu hanya di
 *   memori, konsisten dengan aturan progres tamu v2.5). Hanya 30
 *   attempt terakhir yang menyimpan jawaban (lihat
 *   TRYOUT_ATTEMPT_KEEP di lib/store.ts); attempt lama tetap
 *   menyimpan skornya.
 * - Server (Akbar, user login): kolom JSONB `answers` di
 *   tryout_results (migrasi 007). Ini yang membuat riwayat Akbar
 *   permanen: jawaban tetap bisa diambil walau localStorage
 *   hilang atau attempt lokalnya sudah dipangkas. Tryout kilat
 *   tidak punya baris tryout_results (tidak dikirim ke
 *   leaderboard), jadi kilat hanya mengandalkan jalur lokal.
 *
 * Catatan privasi: kolom `answers` ikut terbaca lewat policy
 * select publik tryout_results yang sudah ada (sama seperti skor
 * twk/tiu/tkp/total yang memang tampil di leaderboard). Isinya
 * hanya id soal + opsi yang dipilih, tanpa data pribadi. Bila
 * nanti jawaban dianggap perlu dibatasi hanya untuk pemiliknya,
 * perlu tabel terpisah dengan policy select-own (bukan kolom di
 * tryout_results, karena policy RLS tidak bisa membatasi kolom).
 */
import { getCurrentUser } from './auth'
import { getQuestionById, type Opsi, type Question } from './questions'
import type { TryoutAnswers } from './quiz'
import { isSupabaseConfigured, supabase } from './supabase'

/** Jawaban satu attempt tryout, bentuk ringkas untuk disimpan. */
export interface TryoutAttempt {
  /** Id soal berurutan sesuai urutan pengerjaan. */
  questionIds: string[]
  /** Id soal ke opsi yang dipilih (soal kosong tidak punya entri). */
  answers: TryoutAnswers
}

/** Opsi jawaban yang sah (A-E). */
const OPSI_SET: ReadonlySet<string> = new Set(['A', 'B', 'C', 'D', 'E'])

/**
 * Bangun TryoutAttempt dari soal + jawaban satu sesi yang selesai.
 * Dipanggil sekali di akhir sesi (TryoutPage.finish).
 */
export function buildAttempt(
  questions: readonly Question[],
  answers: TryoutAnswers,
): TryoutAttempt {
  const kept: TryoutAnswers = {}
  for (const q of questions) {
    const answer = answers[q.id]
    if (answer !== undefined) kept[q.id] = answer
  }
  return {
    questionIds: questions.map((q) => q.id),
    answers: kept,
  }
}

/**
 * Validasi bentuk TryoutAttempt dari sumber tak tepercaya
 * (localStorage, sync server, kolom JSONB): questionIds array
 * string tak kosong, answers objek id ke opsi A-E, dan setiap id
 * di answers harus ada di questionIds.
 */
export function isTryoutAttempt(value: unknown): value is TryoutAttempt {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (
    !Array.isArray(v.questionIds) ||
    v.questionIds.length === 0 ||
    !v.questionIds.every((id) => typeof id === 'string' && id.length > 0)
  ) {
    return false
  }
  if (typeof v.answers !== 'object' || v.answers === null) return false
  const ids = new Set(v.questionIds as string[])
  for (const [id, opsi] of Object.entries(
    v.answers as Record<string, unknown>,
  )) {
    if (!ids.has(id)) return false
    if (typeof opsi !== 'string' || !OPSI_SET.has(opsi)) return false
  }
  return true
}

/**
 * Rekonstruksi soal + jawaban dari attempt tersimpan. Mengembalikan
 * null bila ada satu saja soal yang tidak ditemukan di bank (misal
 * soal dihapus bankfix setelah attempt itu) supaya halaman hasil
 * jatuh kembali ke tampilan skor saja, bukan breakdown setengah.
 */
export function reconstructAttempt(attempt: TryoutAttempt): {
  questions: Question[]
  answers: TryoutAnswers
} | null {
  const questions: Question[] = []
  for (const id of attempt.questionIds) {
    const q = getQuestionById(id)
    if (!q) return null
    questions.push(q)
  }
  const answers: TryoutAnswers = {}
  for (const [id, opsi] of Object.entries(attempt.answers)) {
    answers[id] = opsi as Opsi
  }
  return { questions, answers }
}

/**
 * Ambil jawaban attempt Akbar milik user yang login dari kolom
 * `answers` tryout_results, dicari dari finished_at-nya. Jendela
 * 2 detik dipakai supaya tidak gagal karena beda presisi
 * milidetik antara string ISO dan timestamptz Postgres. Aman
 * saat Supabase belum aktif / kolom belum ada (migrasi 007 belum
 * jalan) / baris tidak punya jawaban: mengembalikan null.
 */
export async function fetchMyAttemptAnswers(
  finishedAt: string,
): Promise<TryoutAttempt | null> {
  if (!isSupabaseConfigured() || !supabase) return null
  const start = new Date(finishedAt)
  if (Number.isNaN(start.getTime())) return null
  let user: Awaited<ReturnType<typeof getCurrentUser>>
  try {
    user = await getCurrentUser()
  } catch {
    return null
  }
  if (!user) return null
  const end = new Date(start.getTime() + 2000)
  try {
    const { data, error } = await supabase
      .from('tryout_results')
      .select('answers, finished_at')
      .eq('user_id', user.id)
      .eq('mode', 'full')
      .gte('finished_at', start.toISOString())
      .lt('finished_at', end.toISOString())
      .order('finished_at', { ascending: true })
      .limit(5)
    if (error || !data) return null
    for (const row of data as { answers?: unknown }[]) {
      if (isTryoutAttempt(row.answers)) return row.answers
    }
    return null
  } catch {
    return null
  }
}
