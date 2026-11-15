/**
 * Renderer markdown ringan untuk konten materi, tanpa library tambahan.
 *
 * Mendukung: heading `##` / `###`, bullet `- ` / `• `, daftar bernomor
 * `1. ` / `1) `, paragraf (baris-baris berurutan digabung dengan spasi),
 * serta inline `**tebal**`, `*miring*`, dan `` `kode` ``.
 * Butir daftar yang menjorok (diawali spasi) dirender sebagai sub-daftar
 * di bawah butir sebelumnya.
 *
 * Teks materi ditampilkan apa adanya (termasuk artefak OCR kecil).
 */
import type { ReactNode } from 'react'

type ListItem = { text: string; sub: string[] }

type Block =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: ListItem[] }
  | { type: 'ol'; items: ListItem[] }
  | { type: 'p'; text: string }

const INLINE_PATTERN = /(`[^`]+`|\*\*[^*]+?\*\*|\*[^*]+?\*)/g

function renderInline(text: string): ReactNode[] {
  return text.split(INLINE_PATTERN).map((part, i) => {
    if (
      part.length > 4 &&
      part.startsWith('**') &&
      part.endsWith('**')
    ) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="rounded-md border border-ink/10 bg-accent-100 px-1 py-0.5 font-mono text-[0.85em] font-semibold text-accent-800"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    return <span key={i}>{part}</span>
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

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushPara()
      flushList()
      continue
    }
    const indented = /^\s/.test(raw)
    const h2 = line.match(/^##\s+(.*)$/)
    const h3 = line.match(/^###\s+(.*)$/)
    const bullet = line.match(/^[-•]\s+(.*)$/)
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    if (h2) {
      flushPara()
      flushList()
      blocks.push({ type: 'h2', text: h2[1] })
      continue
    }
    if (h3) {
      flushPara()
      flushList()
      blocks.push({ type: 'h3', text: h3[1] })
      continue
    }
    if (bullet) {
      pushItem('ul', bullet[1], indented)
      continue
    }
    if (numbered) {
      pushItem('ol', numbered[1], indented)
      continue
    }
    flushList()
    para.push(line)
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
          default:
            return <p key={i}>{renderInline(block.text)}</p>
        }
      })}
    </div>
  )
}
