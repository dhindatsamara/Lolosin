/**
 * Tokenizer matematika murni untuk teks materi dan soal.
 *
 * Memecah satu potong teks menjadi token: teks biasa, pecahan numerik
 * (`a/b`), dan pangkat (`x^2`, `2^3`, `a^(m+n)`). Renderer (MarkdownLite)
 * memetakan token pecahan menjadi pecahan bertumpuk dan token pangkat
 * menjadi superscript. Fungsi ini tidak memakai React supaya bisa diuji
 * langsung dengan node.
 *
 * Aturan pecahan (kedua sisi HARUS angka murni, tanpa titik ribuan atau
 * koma desimal):
 * - `3/4`, `22/7`, `1/2` dirender sebagai pecahan; `3 1/4` (pecahan
 *   campuran) ikut dirender bagian `1/4`-nya.
 * - `Rp60.000/5` TIDAK dirender: `60.000` adalah bilangan berformat
 *   ribuan, bukan pembilang. Begitu juga `625/1.000` (penyebut berformat
 *   ribuan): keduanya dibiarkan sebagai teks apa adanya, tetap terbaca.
 * - Tanggal `14/2/1945` TIDAK dirender: pecahan yang bersebelahan dengan
 *   garis miring lain (di kiri atau kanan, spasi diabaikan) dianggap
 *   bagian dari tanggal atau jalur URL, bukan pecahan mandiri.
 * - Sitasi peraturan `UU 20/2023`, `PP 94/2021` TIDAK dirender: penyebut
 *   empat digit tahun (19xx/20xx) bukan penyebut pecahan. Awalan sitasi
 *   (UU/PP/Perpres/dll) juga diperiksa sebagai pengaman tambahan.
 * - `dan/atau`, `S1/D3`, `TWK/TIU`, `a/b`, `P/Q` tidak cocok karena
 *   kedua sisinya bukan angka murni.
 * - Tanda baca akhir kalimat tidak menghalangi: `3/4.` tetap dirender
 *   (titik diikuti spasi/akhir teks, bukan angka).
 *
 * Aturan pangkat:
 * - Basis adalah satu huruf, deret angka, atau kurung tutup `)` (untuk
 *   `(a^m)^n`); pangkat adalah satu huruf, bilangan bulat (boleh negatif),
 *   atau kelompok dalam kurung `(m+n)`, `(-n)`, `(7+3-5)`.
 * - `^` tanpa basis/pangkat yang sah dibiarkan apa adanya (mis. `a^`
 *   atau `^2` di awal teks).
 * - Superscript unicode yang sudah ada di konten (`²`, `³`) tidak
 *   disentuh: fungsi ini hanya menangani notasi `^`.
 */

export type MathToken =
  | { type: 'text'; text: string }
  | { type: 'frac'; num: string; den: string }
  | { type: 'pow'; base: string; exp: string }

/** Pecahan `angka/angka` (spasi di sekitar `/` diabaikan) atau pangkat. */
const TOKEN_RE =
  /(\d+)\s*\/\s*(\d+)|([A-Za-z]|\d+|\))(\^)(\([^)]*\)|-?\d+|[A-Za-z](?![A-Za-z]))/g

const LEGAL_PREFIX_RE =
  /(UU|PP|Perpres|Permen|Kepmen|Perpu|No\.?|Nomor)\s*$/

const YEAR_DEN_RE = /^(?:19|20)\d{2}$/

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9'
}

/** Karakter sebelum kandidat adalah bagian dari bilangan lain? */
function hasNumberBefore(text: string, index: number): boolean {
  const before = text[index - 1]
  if (isDigit(before)) return true
  if ((before === '.' || before === ',') && isDigit(text[index - 2])) {
    return true
  }
  return false
}

/** Karakter sesudah kandidat adalah bagian dari bilangan lain? */
function hasNumberAfter(text: string, end: number): boolean {
  const after = text[end]
  if (isDigit(after)) return true
  if ((after === '.' || after === ',') && isDigit(text[end + 1])) {
    return true
  }
  return false
}

/** Garis miring lain bersebelahan (tanggal `14/2/1945`, jalur URL)? */
function hasSlashAdjacent(text: string, start: number, end: number): boolean {
  if (/\/\s*$/.test(text.slice(0, start))) return true
  if (/^\s*\//.test(text.slice(end))) return true
  return false
}

function isValidFraction(
  text: string,
  start: number,
  end: number,
  den: string,
): boolean {
  if (hasNumberBefore(text, start)) return false
  if (hasNumberAfter(text, end)) return false
  if (hasSlashAdjacent(text, start, end)) return false
  if (YEAR_DEN_RE.test(den)) return false
  if (LEGAL_PREFIX_RE.test(text.slice(0, start))) return false
  return true
}

function isValidPower(text: string, start: number): boolean {
  // Basis digit yang menempel pada bilangan berformat ribuan, mis.
  // `000^2` di dalam `1.000^2`, bukan basis pangkat yang sah.
  if (hasNumberBefore(text, start)) return false
  return true
}

/** Pecah `text` menjadi token teks/pecahan/pangkat. */
export function tokenizeMath(text: string): MathToken[] {
  const tokens: MathToken[] = []
  let cursor = 0
  TOKEN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TOKEN_RE.exec(text)) !== null) {
    const start = match.index
    const end = start + match[0].length
    const num = match[1]
    let token: MathToken | null = null
    if (num !== undefined) {
      const den = match[2]
      if (isValidFraction(text, start, end, den)) {
        token = { type: 'frac', num, den }
      }
    } else {
      const base = match[3]
      const exp = match[5]
      if (isValidPower(text, start)) {
        token = { type: 'pow', base, exp }
      }
    }
    if (token === null) {
      // Kandidat ditolak penjaga: biarkan teksnya apa adanya.
      continue
    }
    if (start > cursor) {
      tokens.push({ type: 'text', text: text.slice(cursor, start) })
    }
    tokens.push(token)
    cursor = end
  }
  if (cursor < text.length) {
    tokens.push({ type: 'text', text: text.slice(cursor) })
  }
  return tokens
}

/** Apakah teks mengandung token matematika apa pun (jalan pintas render). */
export function hasMath(text: string): boolean {
  TOKEN_RE.lastIndex = 0
  return TOKEN_RE.test(text)
}
