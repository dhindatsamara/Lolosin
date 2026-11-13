/**
 * Loader data materi belajar Lolosin.
 *
 * Data berasal dari `src/data/materi/`: `index.json` (katalog) + 17 file
 * dokumen JSON. Total ~1 MB, dibundel lewat import statis + glob eager
 * sehingga seluruh materi tersedia offline (PWA).
 *
 * Teks materi sebagian berasal dari OCR dan mengandung artefak kecil
 * (karakter aneh, pemenggalan kata). Ditampilkan apa adanya, tidak
 * diperbaiki di sini.
 *
 * Progres baca disimpan di store (`readSections`) dengan kunci berupa id
 * seksi (mis. `twk-cheat-sheet-s01`). Id seksi unik secara global karena
 * mengandung id dokumennya.
 */
import materiIndex from '../data/materi/index.json'
import type { Materi } from './questions'

export interface MateriSection {
  id: string
  subtopik: string
  judul: string
  konten: string
  kata: number
}

export interface PangkatTabel {
  pangkat2: Array<[number, number]>
  pangkat3: Array<[number, number]>
  pangkat4: Array<[number, number]>
}

export interface MateriDoc {
  id: string
  judul: string
  materi: Materi
  deskripsi: string
  sumber: string
  halaman: number
  kata: number
  subtopik: string[]
  sections: MateriSection[]
  catatan_kualitas?: string
  tabel?: PangkatTabel
}

export interface ReadProgress {
  read: number
  total: number
  /** 0–100, dibulatkan. */
  percent: number
}

export interface SubtopikGroup {
  subtopik: string
  sections: MateriSection[]
}

/* ------------------------------------------------------------------ */
/* Muat dokumen                                                        */
/* ------------------------------------------------------------------ */

/**
 * Modul JSON di folder materi: dokumen + `index.json` + `inventaris.json`.
 * Hanya modul yang punya `sections` yang dianggap dokumen materi.
 */
const docModules = import.meta.glob<{ default: unknown }>(
  '../data/materi/*.json',
  { eager: true },
)

function isDocModule(value: unknown): value is MateriDoc {
  if (typeof value !== 'object' || value === null) return false
  const doc = value as Record<string, unknown>
  return typeof doc.id === 'string' && Array.isArray(doc.sections)
}

const byId = new Map<string, MateriDoc>()
for (const mod of Object.values(docModules)) {
  if (isDocModule(mod.default)) byId.set(mod.default.id, mod.default)
}

/** Urutan dokumen mengikuti katalog `index.json` (TWK, TIU, lalu TKP). */
const indexOrder = new Map<string, number>(
  materiIndex.dokumen.map(
    (d, i): [string, number] => [d.id, i],
  ),
)

const DOCUMENTS: MateriDoc[] = [...byId.values()].sort(
  (a, b) => (indexOrder.get(a.id) ?? 999) - (indexOrder.get(b.id) ?? 999),
)

export const TOTAL_DOKUMEN = DOCUMENTS.length
export const TOTAL_KATA = materiIndex.total_kata
export const TOTAL_HALAMAN = materiIndex.total_halaman
export const TOTAL_SECTIONS = DOCUMENTS.reduce(
  (n, doc) => n + doc.sections.length,
  0,
)

/** Alias sesuai penamaan tugas (total kata seluruh materi). */
export const totalKata = TOTAL_KATA

/* ------------------------------------------------------------------ */
/* Akses dokumen & seksi                                               */
/* ------------------------------------------------------------------ */

/** Seluruh dokumen, terurut mengikuti katalog. */
export function getDocuments(): MateriDoc[] {
  return DOCUMENTS
}

/** Dokumen untuk satu materi (TWK / TIU / TKP). */
export function getDocumentsByMateri(materi: Materi): MateriDoc[] {
  return DOCUMENTS.filter((doc) => doc.materi === materi)
}

/** Satu dokumen berdasarkan id, atau `undefined` bila tidak ada. */
export function getDocument(id: string | undefined): MateriDoc | undefined {
  if (!id) return undefined
  return byId.get(id)
}

/** Seksi-seksi satu dokumen (array kosong bila dokumen tidak ada). */
export function getSections(docId: string | undefined): MateriSection[] {
  return getDocument(docId)?.sections ?? []
}

/** Satu seksi berdasarkan id dokumen + id seksi. */
export function getSection(
  docId: string | undefined,
  sectionId: string | undefined,
): MateriSection | undefined {
  if (!sectionId) return undefined
  return getDocument(docId)?.sections.find((s) => s.id === sectionId)
}

/** Seksi sebelum/sesudah dalam satu dokumen, beserta posisinya. */
export function getSectionNav(
  docId: string | undefined,
  sectionId: string | undefined,
): {
  prev: MateriSection | undefined
  next: MateriSection | undefined
  index: number
  total: number
} {
  const sections = getSections(docId)
  const index = sections.findIndex((s) => s.id === sectionId)
  if (index < 0) {
    return { prev: undefined, next: undefined, index: -1, total: sections.length }
  }
  return {
    prev: sections[index - 1],
    next: sections[index + 1],
    index,
    total: sections.length,
  }
}

/** Kelompokkan seksi dokumen per subtopik, urutan kemunculan pertama. */
export function groupSectionsBySubtopik(doc: MateriDoc): SubtopikGroup[] {
  const groups: SubtopikGroup[] = []
  const bySubtopik = new Map<string, SubtopikGroup>()
  for (const section of doc.sections) {
    let group = bySubtopik.get(section.subtopik)
    if (!group) {
      group = { subtopik: section.subtopik, sections: [] }
      bySubtopik.set(section.subtopik, group)
      groups.push(group)
    }
    group.sections.push(section)
  }
  return groups
}

/* ------------------------------------------------------------------ */
/* Tabel pangkat (dokumen `tiu-tabel-pangkat`)                         */
/* ------------------------------------------------------------------ */

/**
 * Tabel pangkat untuk sebuah seksi, bila seksi tersebut memang
 * menampilkan tabel (judulnya mengandung "Pangkat 2/3/4" dan dokumen
 * punya field `tabel`). Mengembalikan `null` untuk seksi lain.
 */
export function getTabelForSection(
  doc: MateriDoc,
  section: MateriSection,
): { pangkat: 2 | 3 | 4; rows: Array<[number, number]> } | null {
  if (!doc.tabel) return null
  const match = section.judul.match(/Pangkat\s+([234])\b/)
  if (!match) return null
  const pangkat = Number(match[1]) as 2 | 3 | 4
  const key = `pangkat${pangkat}` as const
  return { pangkat, rows: doc.tabel[key] }
}

/**
 * Hapus blok contoh (1–10) dari konten seksi tabel. Contoh tersebut
 * redundan karena tabel lengkapnya sudah dirender sebagai tabel rapi.
 * Konten seksi lain tidak disentuh.
 */
export function stripTabelContoh(konten: string): string {
  return konten
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (t.startsWith('Contoh (1')) return false
      if (/^\d+\^[234]\s*=/.test(t)) return false
      return true
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/* ------------------------------------------------------------------ */
/* Progres baca (di atas `store.readSections`)                         */
/* ------------------------------------------------------------------ */

function toProgress(read: number, total: number): ReadProgress {
  return {
    read,
    total,
    percent: total > 0 ? Math.round((read / total) * 100) : 0,
  }
}

function toReadSet(readSections: Iterable<string>): Set<string> {
  return readSections instanceof Set
    ? readSections
    : new Set(readSections)
}

/** Jumlah seksi satu dokumen yang sudah dibaca. */
export function countReadSections(
  doc: MateriDoc,
  readSections: Iterable<string>,
): number {
  const read = toReadSet(readSections)
  let n = 0
  for (const section of doc.sections) {
    if (read.has(section.id)) n += 1
  }
  return n
}

/** Progres baca satu dokumen. */
export function docReadProgress(
  doc: MateriDoc,
  readSections: Iterable<string>,
): ReadProgress {
  return toProgress(
    countReadSections(doc, readSections),
    doc.sections.length,
  )
}

/** Progres baca gabungan seluruh dokumen satu materi. */
export function materiReadProgress(
  materi: Materi,
  readSections: Iterable<string>,
): ReadProgress {
  const read = toReadSet(readSections)
  let total = 0
  let done = 0
  for (const doc of getDocumentsByMateri(materi)) {
    total += doc.sections.length
    done += countReadSections(doc, read)
  }
  return toProgress(done, total)
}

/** Progres baca keseluruhan (semua dokumen). */
export function overallReadProgress(
  readSections: Iterable<string>,
): ReadProgress {
  const read = toReadSet(readSections)
  let done = 0
  for (const doc of DOCUMENTS) {
    done += countReadSections(doc, read)
  }
  return toProgress(done, TOTAL_SECTIONS)
}

/** Seksi pertama yang belum dibaca dalam satu dokumen. */
export function getNextUnreadSection(
  doc: MateriDoc,
  readSections: Iterable<string>,
): MateriSection | undefined {
  const read = toReadSet(readSections)
  return doc.sections.find((s) => !read.has(s.id))
}

/* ------------------------------------------------------------------ */
/* Format                                                              */
/* ------------------------------------------------------------------ */

/** "1.208 kata" */
export function formatKata(kata: number): string {
  return `${kata.toLocaleString('id-ID')} kata`
}

/** Estimasi menit baca dengan kecepatan ±200 kata/menit (min. 1 menit). */
export function estimasiBacaMenit(kata: number): number {
  return Math.max(1, Math.round(kata / 200))
}

/** "±6 mnt" atau "±3 jam 20 mnt". */
export function formatDurasi(menit: number): string {
  if (menit < 60) return `±${menit} mnt`
  const jam = Math.floor(menit / 60)
  const sisa = menit % 60
  return sisa > 0 ? `±${jam} jam ${sisa} mnt` : `±${jam} jam`
}
