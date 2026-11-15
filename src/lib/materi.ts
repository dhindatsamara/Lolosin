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
  /** 3-5 butir ringkasan inti seksi (v2.5; dijamin ada oleh build). */
  poin_inti?: string[]
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

/**
 * Judul dokumen versi tampil: nama materinya saja, tanpa atribusi
 * sumber/penulis. Dipakai di semua tempat judul dirender (daftar
 * Belajar, detail materi, detail seksi). Metadata `sumber` di file
 * data TIDAK diubah, hanya tampilannya yang dibersihkan.
 *
 * Pola yang dihapus: akhiran "| TemanASN / TemenASN", akhiran
 * "TemanASN / TemenASN" tanpa pemisah, "by Analitica.id", akhiran
 * "| Kang Arya (...)", dan akhiran "| Master" (artefak nama file).
 * Judul tanpa atribusi (mis. "Handbook ... | Kemampuan Verbal")
 * tidak berubah karena bagian setelah "|" bukan nama sumber.
 */
export function cleanJudul(judul: string): string {
  return judul
    .replace(/\s+by\s+Analitica\.id\s*$/i, '')
    .replace(/\s*\|\s*(TemanASN|TemenASN|Kang Arya.*|Master)\s*$/i, '')
    .replace(/\s+(TemanASN|TemenASN)\s*$/i, '')
    .trim()
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
/* Pengelompokan tampilan: dokumen setopik jadi satu entri materi      */
/* ------------------------------------------------------------------ */

/**
 * Satu entri materi di daftar Belajar: gabungan satu atau beberapa
 * dokumen yang membahas topik yang sama. Pengelompokan ini HANYA
 * level tampilan: dokumen asli, id seksi, dan metadata `sumber` di
 * file data tidak berubah. Rute detail memakai id grup; id dokumen
 * lama tetap bisa dibuka (lihat `resolveMateriView`).
 *
 * Id grup yang sama dengan id dokumen (`twk-cheat-sheet`,
 * `tkp-cheat-sheet`, dan semua grup satu dokumen) sengaja dipakai
 * supaya tautan lama ke dokumen tersebut membuka tampilan grupnya.
 */
export interface MateriGroup {
  id: string
  judul: string
  materi: Materi
  deskripsi: string
  docs: MateriDoc[]
}

/** Satu seksi beserta dokumen asalnya (untuk tautan detail seksi). */
export interface SectionEntry {
  doc: MateriDoc
  section: MateriSection
}

export interface SubtopikEntryGroup {
  subtopik: string
  entries: SectionEntry[]
}

interface GroupDef {
  id: string
  judul?: string
  deskripsi?: string
  docIds: string[]
}

/**
 * Pemetaan dokumen ke grup tampilan, urut kemunculan pertama di
 * katalog. Grup satu dokumen tanpa `judul`/`deskripsi` memakai judul
 * (sudah dibersihkan) dan deskripsi dokumennya sendiri.
 */
const GROUP_DEFS: GroupDef[] = [
  // TWK: 6 dokumen jadi 3 entri.
  { id: 'twk-bang-arya', docIds: ['twk-bang-arya'] },
  {
    id: 'twk-cheat-sheet',
    judul: 'Cheat Sheet TWK',
    deskripsi:
      'Kartu ringkas TWK: poin penting dan kata kunci per tema, plus pembeda bela negara, nasionalisme, patriotisme, dan cinta tanah air.',
    docIds: ['twk-cheat-sheet', 'twk-keyword-bela-negara'],
  },
  {
    id: 'twk-ringkasan',
    judul: 'Ringkasan Materi TWK',
    deskripsi:
      'Ringkasan lengkap TWK: Pancasila, UUD 1945, Bhinneka Tunggal Ika, tata negara, bela negara, dan sejarah nasional, plus catatan ringkas buat hafalan.',
    docIds: [
      'twk-modul-ringkasan',
      'twk-rangkuman-temenasn',
      'twk-rangkuman-tryout',
    ],
  },
  // TIU: 7 dokumen jadi 5 entri. Di grup verbal, handbook ditaruh
  // dulu karena isinya paling lengkap; analogi jadi pelengkap.
  {
    id: 'tiu-verbal',
    judul: 'Kemampuan Verbal',
    deskripsi:
      'Penalaran verbal: analogi, silogisme, penalaran analitis, dan teknik eliminasi, plus contoh analogi profesi dan tempat kerja.',
    docIds: ['tiu-handbook-verbal', 'tiu-analogi-verbal'],
  },
  {
    id: 'tiu-handbook-figural',
    judul: 'Kemampuan Figural',
    docIds: ['tiu-handbook-figural'],
  },
  {
    id: 'tiu-numerik',
    judul: 'Kemampuan Numerik',
    deskripsi:
      'Berhitung, deret angka, perbandingan kuantitatif, soal cerita, dan teknik hitung cepat.',
    docIds: ['tiu-handbook-numerik', 'tiu-hitung-cepat'],
  },
  { id: 'tiu-modul', docIds: ['tiu-modul'] },
  { id: 'tiu-tabel-pangkat', docIds: ['tiu-tabel-pangkat'] },
  // TKP: 4 dokumen jadi 2 entri.
  {
    id: 'tkp-cheat-sheet',
    judul: 'Cheat Sheet TKP',
    deskripsi:
      'Kartu ringkas TKP: kata kunci dan ciri soal per aspek, plus definisi kompetensi dan deskripsi level tiap aspek.',
    docIds: ['tkp-cheat-sheet', 'tkp-kartu-sakti'],
  },
  {
    id: 'tkp-ringkasan',
    judul: 'Ringkasan Materi TKP',
    deskripsi:
      'Ringkasan materi TKP per aspek: integritas, adaptasi, pengendalian diri, pelayanan, jejaring kerja, sosial budaya, dan TIK.',
    docIds: ['tkp-modul', 'tkp-rangkuman-temenasn'],
  },
]

function buildGroups(): MateriGroup[] {
  const groups: MateriGroup[] = []
  const grouped = new Set<string>()
  for (const def of GROUP_DEFS) {
    const docs = def.docIds
      .map((id) => byId.get(id))
      .filter((d): d is MateriDoc => d !== undefined)
    if (docs.length === 0) continue
    for (const doc of docs) grouped.add(doc.id)
    groups.push({
      id: def.id,
      judul: def.judul ?? cleanJudul(docs[0].judul),
      materi: docs[0].materi,
      deskripsi: def.deskripsi ?? docs[0].deskripsi,
      docs,
    })
  }
  // Dokumen baru yang belum masuk tabel (materi kiriman berikutnya)
  // tetap tampil sebagai entri sendiri, judul sudah dibersihkan.
  for (const doc of DOCUMENTS) {
    if (grouped.has(doc.id)) continue
    groups.push({
      id: doc.id,
      judul: cleanJudul(doc.judul),
      materi: doc.materi,
      deskripsi: doc.deskripsi,
      docs: [doc],
    })
  }
  return groups
}

const GROUPS: MateriGroup[] = buildGroups()
const groupById = new Map<string, MateriGroup>(
  GROUPS.map((g) => [g.id, g]),
)

/** Jumlah entri materi tampil (gabungan), bukan jumlah dokumen. */
export const TOTAL_MATERI = GROUPS.length

/** Seluruh grup tampilan, terurut mengikuti tabel grup. */
export function getMateriGroups(): MateriGroup[] {
  return GROUPS
}

/** Grup tampilan untuk satu materi (TWK / TIU / TKP). */
export function getMateriGroupsByMateri(materi: Materi): MateriGroup[] {
  return GROUPS.filter((g) => g.materi === materi)
}

/** Satu grup berdasarkan id, atau `undefined` bila tidak ada. */
export function getMateriGroup(id: string | undefined): MateriGroup | undefined {
  if (!id) return undefined
  return groupById.get(id)
}

/** Grup yang memuat satu dokumen, atau `undefined` bila tidak ada. */
export function getGroupForDocument(docId: string): MateriGroup | undefined {
  return GROUPS.find((g) => g.docs.some((d) => d.id === docId))
}

/**
 * Tampilan detail untuk satu id rute: grup dulu, lalu dokumen lama
 * sebagai grup satu dokumen (judul dibersihkan). Jadi tautan lama
 * ke dokumen yang kini tergabung tetap bisa dibuka.
 */
export function resolveMateriView(id: string | undefined): MateriGroup | undefined {
  const group = getMateriGroup(id)
  if (group) return group
  const doc = getDocument(id)
  if (!doc) return undefined
  return {
    id: doc.id,
    judul: cleanJudul(doc.judul),
    materi: doc.materi,
    deskripsi: doc.deskripsi,
    docs: [doc],
  }
}

/** Seluruh seksi grup, urut dokumen lalu urut seksi. */
export function groupSections(group: MateriGroup): SectionEntry[] {
  return group.docs.flatMap((doc) =>
    doc.sections.map((section) => ({ doc, section })),
  )
}

/** Kelompokkan entri seksi per subtopik, urutan kemunculan pertama. */
export function groupEntriesBySubtopik(
  entries: SectionEntry[],
): SubtopikEntryGroup[] {
  const groups: SubtopikEntryGroup[] = []
  const bySubtopik = new Map<string, SubtopikEntryGroup>()
  for (const entry of entries) {
    let group = bySubtopik.get(entry.section.subtopik)
    if (!group) {
      group = { subtopik: entry.section.subtopik, entries: [] }
      bySubtopik.set(entry.section.subtopik, group)
      groups.push(group)
    }
    group.entries.push(entry)
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

/** Progres baca satu grup (gabungan semua dokumennya). */
export function groupReadProgress(
  group: MateriGroup,
  readSections: Iterable<string>,
): ReadProgress {
  const read = toReadSet(readSections)
  let total = 0
  let done = 0
  for (const doc of group.docs) {
    total += doc.sections.length
    done += countReadSections(doc, read)
  }
  return toProgress(done, total)
}

/** Seksi pertama yang belum dibaca dalam satu grup, beserta dokumennya. */
export function groupNextUnreadSection(
  group: MateriGroup,
  readSections: Iterable<string>,
): SectionEntry | undefined {
  const read = toReadSet(readSections)
  for (const doc of group.docs) {
    const section = doc.sections.find((s) => !read.has(s.id))
    if (section) return { doc, section }
  }
  return undefined
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
