/**
 * Rencana belajar personal (Fase 3).
 *
 * Menghitung akurasi per subtopik dari tally `topicStats` di store
 * (diperbarui di tempat yang sama dengan pencatatan jawaban, jadi
 * drill, tryout, dan ulasan semuanya terhitung).
 *
 * Normalisasi label hanya di lapisan hitung dan tampil, data soal
 * tidak pernah diubah: huruf besar kecil disamakan, spasi dan tanda
 * baca dirapikan, lalu label yang hanya beda kata penghubung digabung.
 * Kalau dua label tetap terpisah setelah normalisasi, dibiarkan begitu.
 */
import {
  countByTopic,
  getTopics,
  MATERI_LIST,
  type Materi,
} from './questions'
import { getStore, type TopicStat } from './store'

/** Jumlah jawaban minimum supaya subtopik bisa masuk daftar terlemah. */
export const WEAKEST_MIN_ANSWERS = 5

/** Kata penghubung yang diabaikan saat membandingkan label subtopik. */
const CONNECTOR_WORDS = new Set([
  'dan',
  'atau',
  'serta',
  'dengan',
  'yang',
  'di',
  'ke',
  'dari',
  'pada',
  'untuk',
  'tentang',
  'sebagai',
])

export interface TopicAccuracy {
  materi: Materi
  /** Label tampil (label asli terbanyak di grup yang dinormalisasi). */
  subtopik: string
  correct: number
  total: number
  /** Akurasi 0 sampai 1. */
  accuracy: number
}

export interface UntriedTopic {
  materi: Materi
  subtopik: string
  questionCount: number
}

export interface TodayFocus {
  /** Subtopik terlemah (min 5 jawaban), atau null bila belum ada yang memenuhi. */
  weakest: TopicAccuracy | null
  /** Subtopik yang belum pernah dicoba sama sekali. */
  untried: UntriedTopic[]
  /** `true` bila sudah ada jawaban tercatat. */
  hasData: boolean
}

/** Satu subtopik dari bank soal, dipakai sebagai semesta "belum dicoba". */
export interface TopicUniverseEntry {
  materi: Materi
  subtopik: string
  questionCount: number
}

/**
 * Normalisasi ringan label subtopik: huruf kecil, tanda baca jadi spasi,
 * kata penghubung dibuang, spasi dirapikan. Label yang hanya berisi tanda
 * baca kembali ke bentuk aslinya (huruf kecil, spasi dirapikan).
 */
export function normalizeTopicLabel(label: string): string {
  const cleaned = label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((word) => word.length > 0 && !CONNECTOR_WORDS.has(word))
    .join(' ')
  if (cleaned.length > 0) return cleaned
  return label.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Kunci grup: materi + label yang sudah dinormalisasi. */
function groupKey(materi: Materi, subtopik: string): string {
  return `${materi}|${normalizeTopicLabel(subtopik)}`
}

interface TopicGroup {
  materi: Materi
  correct: number
  total: number
  /** Hitungan jawaban per label asli (untuk memilih label tampil). */
  labelCounts: Map<string, number>
}

/** Gabungkan tally per kunci "MATERI|Subtopik" menjadi grup ternormalisasi. */
function groupStats(
  stats: Record<string, TopicStat>,
): Map<string, TopicGroup> {
  const groups = new Map<string, TopicGroup>()
  for (const [key, stat] of Object.entries(stats)) {
    const sep = key.indexOf('|')
    if (sep === -1) continue
    const materi = key.slice(0, sep)
    if (materi !== 'TWK' && materi !== 'TIU' && materi !== 'TKP') continue
    const subtopik = key.slice(sep + 1)
    const gk = groupKey(materi, subtopik)
    let group = groups.get(gk)
    if (!group) {
      group = { materi, correct: 0, total: 0, labelCounts: new Map() }
      groups.set(gk, group)
    }
    group.correct += stat.correct
    group.total += stat.total
    group.labelCounts.set(
      subtopik,
      (group.labelCounts.get(subtopik) ?? 0) + stat.total,
    )
  }
  return groups
}

/** Label tampil grup: label asli dengan jawaban terbanyak. */
function displayLabel(group: TopicGroup): string {
  let best = ''
  let bestCount = -1
  for (const [label, count] of group.labelCounts) {
    if (count > bestCount) {
      best = label
      bestCount = count
    }
  }
  return best
}

/**
 * Subtopik terlemah dari tally yang diberikan: akurasi terendah di
 * antara subtopik yang sudah dijawab minimal `WEAKEST_MIN_ANSWERS`
 * kali. Urutan: akurasi naik, lalu total jawaban turun.
 */
export function weakestTopicsFromStats(
  stats: Record<string, TopicStat>,
  limit = 3,
): TopicAccuracy[] {
  const rows: TopicAccuracy[] = []
  for (const group of groupStats(stats).values()) {
    if (group.total < WEAKEST_MIN_ANSWERS) continue
    rows.push({
      materi: group.materi,
      subtopik: displayLabel(group),
      correct: group.correct,
      total: group.total,
      accuracy: group.total > 0 ? group.correct / group.total : 0,
    })
  }
  rows.sort(
    (a, b) =>
      a.accuracy - b.accuracy ||
      b.total - a.total ||
      a.materi.localeCompare(b.materi) ||
      a.subtopik.localeCompare(b.subtopik, 'id'),
  )
  return rows.slice(0, Math.max(0, limit))
}

/**
 * Subtopik dari semesta bank soal yang belum pernah dicoba (tidak ada
 * di tally, setelah normalisasi). Urut per materi lalu alfabetis.
 */
export function untriedTopicsFromStats(
  stats: Record<string, TopicStat>,
  universe: readonly TopicUniverseEntry[],
): UntriedTopic[] {
  const tried = new Set<string>()
  for (const key of Object.keys(stats)) {
    const sep = key.indexOf('|')
    if (sep === -1) continue
    const materi = key.slice(0, sep)
    if (materi !== 'TWK' && materi !== 'TIU' && materi !== 'TKP') continue
    tried.add(groupKey(materi, key.slice(sep + 1)))
  }
  const materiOrder = new Map(MATERI_LIST.map((m, i) => [m, i]))
  return universe
    .filter((t) => !tried.has(groupKey(t.materi, t.subtopik)))
    .map((t) => ({
      materi: t.materi,
      subtopik: t.subtopik,
      questionCount: t.questionCount,
    }))
    .sort(
      (a, b) =>
        (materiOrder.get(a.materi) ?? 0) - (materiOrder.get(b.materi) ?? 0) ||
        a.subtopik.localeCompare(b.subtopik, 'id'),
    )
}

/** Fokus hari ini dari tally yang diberikan (inti murni `todayFocus`). */
export function todayFocusFromStats(
  stats: Record<string, TopicStat>,
  universe: readonly TopicUniverseEntry[],
): TodayFocus {
  const hasData = Object.values(stats).some((s) => s.total > 0)
  return {
    weakest: weakestTopicsFromStats(stats, 1)[0] ?? null,
    untried: untriedTopicsFromStats(stats, universe),
    hasData,
  }
}

/** Semesta subtopik dari bank soal (semua materi + jumlah soal). */
function topicUniverse(): TopicUniverseEntry[] {
  const universe: TopicUniverseEntry[] = []
  for (const materi of MATERI_LIST) {
    const counts = countByTopic(materi)
    for (const subtopik of getTopics(materi)) {
      universe.push({
        materi,
        subtopik,
        questionCount: counts[subtopik] ?? 0,
      })
    }
  }
  return universe
}

/** Subtopik terlemah dari store (min 5 jawaban), paling lemah dulu. */
export function weakestTopics(limit = 3): TopicAccuracy[] {
  return weakestTopicsFromStats(getStore().topicStats, limit)
}

/** Subtopik yang belum pernah dicoba sama sekali. */
export function untriedTopics(): UntriedTopic[] {
  return untriedTopicsFromStats(getStore().topicStats, topicUniverse())
}

/** Fokus belajar hari ini: satu subtopik terlemah + daftar belum dicoba. */
export function todayFocus(): TodayFocus {
  return todayFocusFromStats(getStore().topicStats, topicUniverse())
}
