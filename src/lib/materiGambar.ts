/**
 * Gambar built-in untuk bagian materi.
 *
 * Diagram SVG diimpor lewat Vite sehingga URL-nya mengikuti base path
 * aplikasi (di QA disajikan di bawah `/Lolosin/`, di Netlify di root `/`).
 * Konten materi merujuk diagram lewat kunci `gambar:<nama>`, mis.
 * `![Sudut jarum jam](gambar:jam)` atau field `gambar` di bagian.
 * URL http(s) dipakai apa adanya; kunci yang tidak dikenal mengembalikan
 * `null` supaya renderer bisa jatuh kembali ke teks alt.
 */
import diagramJam from '../assets/diagram-jam.svg'
import diagramPecahan from '../assets/diagram-pecahan.svg'
import diagramPythagoras from '../assets/diagram-pythagoras.svg'

/** Kunci gambar built-in -> URL hasil bundel Vite. */
export const GAMBAR_BUILTIN: Record<string, string> = {
  jam: diagramJam,
  pecahan: diagramPecahan,
  pythagoras: diagramPythagoras,
}

const GAMBAR_PREFIX = 'gambar:'

/** Selesaikan `src` gambar menjadi URL yang bisa dipakai `<img>`. */
export function resolveGambarSrc(src: string): string | null {
  if (src.startsWith(GAMBAR_PREFIX)) {
    const key = src.slice(GAMBAR_PREFIX.length)
    return GAMBAR_BUILTIN[key] ?? null
  }
  return src
}
