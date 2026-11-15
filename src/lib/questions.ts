/**
 * Loader & filter bank soal Lolosin.
 *
 * Data soal berasal dari chunk-chunk `src/data/questions/*.json` (salinan
 * dari `workspace/cpns/bank-soal/bank-soal.json`, dipecah per materi dengan
 * `scripts/split-questions.py`. Satu file 7,9 MB tidak bisa di-push lewat
 * konektor GitHub). Satu-satunya cara memperbarui bank soal: jalankan
 * script itu, lalu rebuild. Lihat README.
 *
 * Aturan penting: soal dengan `kunci === null` (621 soal tanpa kunci)
 * DIKECUALIKAN dari semua pool kuis. Semua fungsi di sini bekerja di atas
 * `QUIZABLE_QUESTIONS`, bukan `QUESTIONS` mentah.
 */
const chunkModules = import.meta.glob<{ default: unknown }>(
  '../data/questions/*.json',
  { eager: true },
)

/** Gabungan semua chunk bank soal (urutan chunk tidak berpengaruh). */
const rawQuestions: unknown[] = Object.values(chunkModules).flatMap((m) =>
  Array.isArray(m.default) ? m.default : [],
)

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
 * Soal tanpa kunci (621 soal) tidak pernah masuk pool ini.
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

/** Kunci normalisasi subtopik: huruf kecil + spasi ujung dipangkas. */
function topicKey(subtopik: string): string {
  return subtopik.toLowerCase().trim()
}

/**
 * Nama tampilan kanonis per topik (digabung tanpa peduli huruf besar/kecil).
 * Bank soal berisi varian ejaan topik yang sama, mis. "Analogi Verbal"
 * (281 soal) dan "analogi verbal" (10 soal). Tanpa penggabungan, varian
 * kecil kehabisan soal baru setelah satu drill dan anti-ulang rusak
 * (drill ke-2 mengulang 10/10 soal). Varian yang ditampilkan dipilih
 * oleh `pickDisplay` (utamakan berawalan kapital, lalu terbanyak).
 */
const canonicalCache = new Map<Materi, Map<string, string>>()

function canonicalTopics(materi: Materi): Map<string, string> {
  const cached = canonicalCache.get(materi)
  if (cached) return cached
  const variantCounts = new Map<string, Map<string, number>>()
  for (const q of QUIZABLE_QUESTIONS) {
    if (q.materi !== materi) continue
    const key = topicKey(q.subtopik)
    let variants = variantCounts.get(key)
    if (!variants) {
      variants = new Map()
      variantCounts.set(key, variants)
    }
    variants.set(q.subtopik, (variants.get(q.subtopik) ?? 0) + 1)
  }
  const out = new Map<string, string>()
  for (const [key, variants] of variantCounts) {
    out.set(key, pickDisplay(variants))
  }
  canonicalCache.set(materi, out)
  return out
}

/**
 * Nama tampilan kanonis satu subtopik (cocok tanpa peduli huruf):
 * "analogi verbal" menjadi "Analogi Verbal". Dipakai supaya tally
 * per subtopik tidak terpecah oleh varian ejaan. Kembalikan nilai
 * asli bila tidak ditemukan di pool (tidak seharusnya terjadi).
 */
export function canonicalTopicDisplay(
  materi: Materi,
  subtopik: string,
): string {
  return canonicalTopics(materi).get(topicKey(subtopik)) ?? subtopik
}

/**
 * Pilih nama tampilan dari varian ejaan satu topik: utamakan varian
 * berawalan huruf kapital (tampilan daftar lebih rapi); di antaranya
 * pilih yang punya soal terbanyak; seri dimenangkan yang alfabetis
 * pertama. Kalau tidak ada varian kapital, pakai aturan yang sama
 * untuk semua varian.
 */
function pickDisplay(variants: Map<string, number>): string {
  const entries = [...variants.entries()]
  const capitalized = entries.filter(([variant]) => /^[A-Z]/.test(variant))
  const pool = capitalized.length > 0 ? capitalized : entries
  let best = ''
  let bestCount = -1
  for (const [variant, count] of pool) {
    if (
      count > bestCount ||
      (count === bestCount && variant.localeCompare(best, 'id') < 0)
    ) {
      best = variant
      bestCount = count
    }
  }
  return best
}

/** Soal kuis untuk satu materi, opsional difilter subtopik (cocok tanpa peduli huruf besar/kecil). */
export function getQuestions(
  materi: Materi,
  subtopik?: string | null,
): Question[] {
  const key = subtopik == null ? null : topicKey(subtopik)
  return QUIZABLE_QUESTIONS.filter(
    (q) =>
      q.materi === materi && (key === null || topicKey(q.subtopik) === key),
  )
}

/**
 * Daftar subtopik (terurut alfabetis) untuk satu materi.
 * Varian ejaan yang sama digabung jadi satu topik (lihat `canonicalTopics`).
 */
export function getTopics(materi: Materi): string[] {
  return [...canonicalTopics(materi).values()].sort((a, b) =>
    a.localeCompare(b, 'id'),
  )
}

/** Jumlah soal kuis per subtopik untuk satu materi (varian ejaan digabung). */
export function countByTopic(materi: Materi): Record<string, number> {
  const canonical = canonicalTopics(materi)
  const counts: Record<string, number> = {}
  for (const q of QUIZABLE_QUESTIONS) {
    if (q.materi !== materi) continue
    const display = canonical.get(topicKey(q.subtopik)) ?? q.subtopik
    counts[display] = (counts[display] ?? 0) + 1
  }
  return counts
}

/** Sisa soal yang BELUM dilihat per subtopik, diberi daftar id yang sudah dilihat (varian ejaan digabung). */
export function countNewByTopic(
  materi: Materi,
  seenIds: Iterable<string>,
): Record<string, number> {
  const seen = seenIds instanceof Set ? seenIds : new Set(seenIds)
  const canonical = canonicalTopics(materi)
  const counts: Record<string, number> = {}
  for (const q of QUIZABLE_QUESTIONS) {
    if (q.materi !== materi || seen.has(q.id)) continue
    const display = canonical.get(topicKey(q.subtopik)) ?? q.subtopik
    counts[display] = (counts[display] ?? 0) + 1
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
