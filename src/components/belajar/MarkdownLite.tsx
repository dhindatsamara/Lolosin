/**
 * Renderer markdown ringan untuk konten materi, tanpa library tambahan.
 *
 * Mendukung: heading `##` / `###`, bullet `- ` / `• `, daftar bernomor
 * `1. ` / `1) `, paragraf (baris-baris berurutan digabung dengan spasi),
 * tabel markdown (`| a | b |` + baris pemisah `|---|---|`), gambar
 * `![alt](src)` (baris sendiri jadi figure, di dalam teks jadi inline),
 * serta inline `**tebal**`, `*miring*`, dan `` `kode` ``.
 * Butir daftar yang menjorok (diawali spasi) dirender sebagai sub-daftar
 * di bawah butir sebelumnya.
 *
 * Notasi matematika inline ikut dirender (lihat `lib/mathText`):
 * pecahan numerik `a/b` menjadi pecahan bertumpuk, pangkat `x^2`
 * menjadi superscript. Tanggal, sitasi peraturan (`UU 20/2023`), dan
 * bilangan berformat ribuan (`Rp60.000/5`) sengaja tidak diubah.
 *
 * Teks materi ditampilkan apa adanya (termasuk artefak OCR kecil).
 */
import type { ReactNode } from 'react'
import { renderMathText } from '../MathText'
import { resolveGambarSrc } from '../../lib/materiGambar'

type ListItem = { text: string; sub: string[] }

type Align = 'left' | 'center' | 'right'

type Block =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: ListItem[] }
  | { type: 'ol'; items: ListItem[] }
  | { type: 'p'; text: string }
  | { type: 'table'; header: string[]; align: Align[]; rows: string[][] }
  | { type: 'img'; alt: string; src: string }

const INLINE_PATTERN = /(`[^`]+`|\*\*[^*]+?\*\*|\*[^*]+?\*)/g
const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)\)/g
const IMAGE_LINE_PATTERN = /^!\[([^\]]*)\]\(([^)\s]+)\)$/
const TABLE_SEPARATOR_CELL = /^:?-+:?$/


/** Satu potong teks tanpa gambar: tebal/miring/kode + matematika. */
function renderInlineNoImage(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE_PATTERN).map((part, i) => {
    const prefix = `${keyPrefix}-${i}`
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={prefix}>{renderMathText(part.slice(2, -2), prefix)}</strong>
      )
    }
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return <em key={prefix}>{renderMathText(part.slice(1, -1), prefix)}</em>
    }
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={prefix}
          className="rounded-md border border-ink/10 bg-accent-100 px-1 py-0.5 font-mono text-[0.85em] font-semibold text-accent-800"
        >
          {renderMathText(part.slice(1, -1), prefix)}
        </code>
      )
    }
    return <span key={prefix}>{renderMathText(part, prefix)}</span>
  })
}

function renderInline(text: string): ReactNode[] {
  // Gambar inline dipisah dulu; sisanya dirender sebagai inline biasa.
  // split dengan 2 grup tangkap menghasilkan pola [teks, alt, src, ...].
  const parts = text.split(IMAGE_PATTERN)
  const nodes: ReactNode[] = []
  for (let i = 0; i < parts.length; i += 3) {
    const chunk = parts[i]
    if (chunk) {
      nodes.push(...renderInlineNoImage(chunk, `t${i}`))
    }
    const alt = parts[i + 1]
    const src = parts[i + 2]
    if (src !== undefined) {
      const resolved = resolveGambarSrc(src)
      if (resolved) {
        nodes.push(
          <img
            key={`img${i}`}
            src={resolved}
            alt={alt}
            className="mx-auto my-2 block w-full max-w-md rounded-2xl border border-line bg-white p-3 shadow-soft"
            loading="lazy"
          />,
        )
      } else if (alt) {
        nodes.push(<span key={`img${i}`}>{alt}</span>)
      }
    }
  }
  return nodes
}

/** Pecah satu baris tabel menjadi sel-sel (tanpa `|` tepi). */
function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

function isSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line)
  return (
    cells.length > 0 && cells.every((cell) => TABLE_SEPARATOR_CELL.test(cell))
  )
}

function separatorAlign(line: string): Align[] {
  return splitTableRow(line).map((cell) => {
    if (cell.startsWith(':') && cell.endsWith(':')) return 'center'
    if (cell.endsWith(':')) return 'right'
    return 'left'
  })
}

function parseBlocks(konten: string): Block[] {
  const lines = konten.split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  let list: { type: 'ul' | 'ol'; items: ListItem[] } | null = null

  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ type: 'p', text: para.join(' ') })
      para = []
    }
  }
  const flushList = () => {
    if (list) {
      blocks.push(list)
      list = null
    }
  }
  // Butir daftar; butir yang menjorok masuk sebagai sub-butir di bawah
  // butir sebelumnya (bila ada), selebihnya jadi butir biasa.
  const pushItem = (
    type: 'ul' | 'ol',
    text: string,
    indented: boolean,
  ) => {
    flushPara()
    if (indented && list && list.items.length > 0) {
      list.items[list.items.length - 1].sub.push(text)
      return
    }
    if (!list || list.type !== type) {
      flushList()
      list = { type, items: [] }
    }
    list.items.push({ text, sub: [] })
  }

  let i = 0
  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line) {
      flushPara()
      flushList()
      i += 1
      continue
    }
    const indented = /^\s/.test(raw)
    const h2 = line.match(/^##\s+(.*)$/)
    const h3 = line.match(/^###\s+(.*)$/)
    const bullet = line.match(/^[-•]\s+(.*)$/)
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    const imageLine = line.match(IMAGE_LINE_PATTERN)
    if (h2) {
      flushPara()
      flushList()
      blocks.push({ type: 'h2', text: h2[1] })
      i += 1
      continue
    }
    if (h3) {
      flushPara()
      flushList()
      blocks.push({ type: 'h3', text: h3[1] })
      i += 1
      continue
    }
    if (imageLine) {
      flushPara()
      flushList()
      blocks.push({ type: 'img', alt: imageLine[1], src: imageLine[2] })
      i += 1
      continue
    }
    // Tabel markdown: baris header `| ... |` yang langsung diikuti
    // baris pemisah `|---|---|`. Baris `|` tanpa pemisah diperlakukan
    // sebagai teks paragraf biasa.
    if (
      line.startsWith('|') &&
      i + 1 < lines.length &&
      isSeparatorRow(lines[i + 1].trim())
    ) {
      flushPara()
      flushList()
      const header = splitTableRow(line)
      const align = separatorAlign(lines[i + 1].trim())
      const rows: string[][] = []
      i += 2
      while (i < lines.length) {
        const rowLine = lines[i].trim()
        if (!rowLine.startsWith('|')) break
        rows.push(splitTableRow(rowLine))
        i += 1
      }
      blocks.push({ type: 'table', header, align, rows })
      continue
    }
    if (bullet) {
      pushItem('ul', bullet[1], indented)
      i += 1
      continue
    }
    if (numbered) {
      pushItem('ol', numbered[1], indented)
      i += 1
      continue
    }
    flushList()
    para.push(line)
    i += 1
  }
  flushPara()
  flushList()
  return blocks
}

export function MarkdownLite({ konten }: { konten: string }) {
  const blocks = parseBlocks(konten)
  return (
    <div className="space-y-5 text-[17px] leading-8 break-words text-ink/85">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h2':
            return (
              <h2
                key={i}
                className="border-b border-line pt-8 pb-3 font-display text-2xl leading-snug font-extrabold text-ink first:pt-0"
              >
                {renderInline(block.text)}
              </h2>
            )
          case 'h3':
            return (
              <h3
                key={i}
                className="pt-6 font-display text-xl leading-snug font-extrabold text-ink first:pt-0"
              >
                {renderInline(block.text)}
              </h3>
            )
          case 'ul':
            return (
              <ul
                key={i}
                className="list-disc space-y-2 pl-6 marker:text-primary-600"
              >
                {block.items.map((item, j) => (
                  <li key={j}>
                    {renderInline(item.text)}
                    {item.sub.length > 0 && (
                      <ul className="mt-1.5 list-disc space-y-1.5 pl-5 marker:text-primary-600/70">
                        {item.sub.map((sub, k) => (
                          <li key={k}>{renderInline(sub)}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol
                key={i}
                className="list-decimal space-y-2 pl-6 marker:font-semibold marker:text-primary-600"
              >
                {block.items.map((item, j) => (
                  <li key={j}>
                    {renderInline(item.text)}
                    {item.sub.length > 0 && (
                      <ul className="mt-1.5 list-disc space-y-1.5 pl-5 marker:text-primary-600/70">
                        {item.sub.map((sub, k) => (
                          <li key={k}>{renderInline(sub)}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )
          case 'table':
            return (
              <div
                key={i}
                className="overflow-x-auto rounded-2xl border border-line bg-white shadow-soft"
              >
                <table className="md-table">
                  <thead>
                    <tr>
                      {block.header.map((cell, j) => (
                        <th
                          key={j}
                          style={{ textAlign: block.align[j] ?? 'left' }}
                        >
                          {renderInline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td
                            key={k}
                            style={{ textAlign: block.align[k] ?? 'left' }}
                          >
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'img': {
            const resolved = resolveGambarSrc(block.src)
            if (!resolved) {
              return block.alt ? <p key={i}>{block.alt}</p> : null
            }
            return (
              <figure key={i} className="my-2">
                <img
                  src={resolved}
                  alt={block.alt}
                  className="mx-auto w-full max-w-md rounded-2xl border border-line bg-white p-3 shadow-soft"
                  loading="lazy"
                />
                {block.alt && (
                  <figcaption className="mt-2 text-center text-sm font-medium text-ink/60">
                    {block.alt}
                  </figcaption>
                )}
              </figure>
            )
          }
          default:
            return <p key={i}>{renderInline(block.text)}</p>
        }
      })}
    </div>
  )
}
