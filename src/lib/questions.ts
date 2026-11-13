/**
 * Loader & filter bank soal Lolosin.
 *
 * Data soal berasal dari `src/data/questions.json` (salinan dari
 * `workspace/cpns/bank-soal/bank-soal.json`). Satu-satunya cara memperbarui
 * bank soal: ganti file itu, lalu rebuild — lihat README.
 *
 * Aturan penting: soal dengan `kunci === null` (102 soal CATBKN tanpa kunci)
 * DIKECUALIKAN dari semua pool kuis. Semua fungsi di sini bekerja di atas
 * `QUIZABLE_QUESTIONS`, bukan `QUESTIONS` mentah.
 */
import rawQuestions from '../data/questions.json'

export type Materi = 'TWK' | 'TIU' | 'TKP'
export type Opsi = 'A' | 'B' | 'C' | 'D' | 'E'

export const MATERI_LIST: Materi[] = ['TWK', 'TIU', 'TKP']

export const MATERI_META: Record<
  Materi,
  { nama: string; singkatan: string; deskripsi: string }
> = {
  TWK: {
    nama: 'Tes Wawasan Kebangsaan',
    singkatan: 'TWK',
    deskripsi:
      'Pancasila, UUD 1945, NKRI, Bhinneka Tunggal Ika, dan sejarah kebangsaan.',
  },
  TIU: {
    nama: 'Tes Intelegensia Umum',
    singkatan: 'TIU',
    deskripsi: 'Kemampuan verbal, numerik, dan figural.',
  },
  TKP: {
    nama: 'Tes Karakteristik Pribadi',
    singkatan: 'TKP',
    deskripsi: 'Integritas, kerja sama, pelayanan publik, dan karakter ASN.',
  },
}

export interface Question {
  id: string
  materi: Materi
  subtopik: string
  soal: string
  pilihan: Record<Opsi, string>
  /** `null` untuk soal tanpa kunci jawaban (dikecualikan dari kuis). */
  kunci: Opsi | null
  pembahasan: string
  sumber: string
  /** Bobot per opsi (1–5), hanya untuk sebagian soal TKP. */
  bobot?: Partial<Record<Opsi, number>>
}

/** Seluruh bank soal, termasuk yang tanpa kunci. */
export const QUESTIONS: Question[] = rawQuestions as unknown as Question[]

/**
 * Soal yang boleh dipakai di kuis: hanya yang punya kunci jawaban.
 * Soal tanpa kunci (CATBKN, 102 soal) tidak pernah masuk pool ini.
 */
export const QUIZABLE_QUESTIONS: Question[] = QUESTIONS.filter(
  (q) => q.kunci !== null,
)

export const TOTAL_QUESTIONS = QUESTIONS.length
export const TOTAL_QUIZABLE = QUIZABLE_QUESTIONS.length

export function isMateri(value: string | undefined): value is Materi {
  return value === 'TWK' || value === 'TIU' || value === 'TKP'
}

export function getQuestionById(id: string): Question | undefined {
  return QUESTIONS.find((q) => q.id === id)
}

/** Soal kuis untuk satu materi, opsional difilter subtopik. */
export function getQuestions(
  materi: Materi,
  subtopik?: string | null,
): Question[] {
  return QUIZABLE_QUESTIONS.filter(
    (q) => q.materi === materi && (subtopik == null || q.subtopik === subtopik),
  )
}

/** Daftar subtopik (terurut alfabetis) untuk satu materi. */
export function getTopics(materi: Materi): string[] {
  const topics = new Set<string>()
  for (const q of QUIZABLE_QUESTIONS) {
    if (q.materi === materi) topics.add(q.subtopik)
  }
  return [...topics].sort((a, b) => a.localeCompare(b, 'id'))
}

/** Jumlah soal kuis per subtopik untuk satu materi. */
export function countByTopic(materi: Materi): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const q of QUIZABLE_QUESTIONS) {
    if (q.materi !== materi) continue
    counts[q.subtopik] = (counts[q.subtopik] ?? 0) + 1
  }
  return counts
}

/** Sisa soal yang BELUM dilihat per subtopik, diberi daftar id yang sudah dilihat. */
export function countNewByTopic(
  materi: Materi,
  seenIds: Iterable<string>,
): Record<string, number> {
  const seen = seenIds instanceof Set ? seenIds : new Set(seenIds)
  const counts: Record<string, number> = {}
  for (const q of QUIZABLE_QUESTIONS) {
    if (q.materi !== materi || seen.has(q.id)) continue
    counts[q.subtopik] = (counts[q.subtopik] ?? 0) + 1
  }
  return counts
}

/** Jumlah soal kuis untuk satu materi. */
export function countTotalByMateri(materi: Materi): number {
  let n = 0
  for (const q of QUIZABLE_QUESTIONS) {
    if (q.materi === materi) n += 1
  }
  return n
}

/** Jumlah soal yang sudah dilihat per materi. */
export function countSeenByMateri(
  seenIds: Iterable<string>,
): Record<Materi, number> {
  const seen = seenIds instanceof Set ? seenIds : new Set(seenIds)
  const counts: Record<Materi, number> = { TWK: 0, TIU: 0, TKP: 0 }
  for (const q of QUIZABLE_QUESTIONS) {
    if (seen.has(q.id)) counts[q.materi] += 1
  }
  return counts
}
