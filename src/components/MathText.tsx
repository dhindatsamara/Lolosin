/**
 * Teks polos dengan notasi matematika inline: pecahan numerik `a/b`
 * dirender bertumpuk (pembilang di atas penyebut), pangkat `x^2`
 * dirender sebagai superscript. Dipakai MarkdownLite (materi) dan
 * semua tempat yang merender teks soal (stem, opsi, pembahasan,
 * klaim, jawaban kartu). Aturan penjaga ada di lib/mathText:
 * tanggal, sitasi peraturan, dan bilangan berformat ribuan
 * sengaja tidak diubah.
 */
import type { ReactNode } from 'react'
import { tokenizeMath } from '../lib/mathText'

/** Satu potong teks polos menjadi node-node teks/pecahan/pangkat. */
export function renderMathText(text: string, keyPrefix: string): ReactNode[] {
  return tokenizeMath(text).map((token, i) => {
    const key = `${keyPrefix}-${i}`
    if (token.type === 'frac') {
      return (
        <span key={key} className="math-frac">
          <span className="math-frac-num">{token.num}</span>
          <span className="math-frac-den">{token.den}</span>
        </span>
      )
    }
    if (token.type === 'pow') {
      return (
        <span key={key}>
          {token.base}
          <sup>{token.exp}</sup>
        </span>
      )
    }
    return <span key={key}>{token.text}</span>
  })
}

/** Komponen praktis: teks polos + matematika inline. */
export function MathText({ text }: { text: string }) {
  return <>{renderMathText(text, 'mt')}</>
}
