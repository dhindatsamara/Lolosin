/**
 * Tabel bilangan pangkat (1–100) untuk dokumen `tiu-tabel-pangkat`.
 * Dirender sebagai tabel rapi dengan header lengket + kolom pencarian
 * (cari berdasarkan bilangan atau hasil pangkatnya).
 */
import { useState } from 'react'

export interface PangkatTableProps {
  pangkat: 2 | 3 | 4
  rows: ReadonlyArray<readonly [number, number]>
}

const SUPERSCRIPT: Record<2 | 3 | 4, string> = {
  2: '²',
  3: '³',
  4: '⁴',
}

export function PangkatTable({ pangkat, rows }: PangkatTableProps) {
  const [query, setQuery] = useState('')
  const q = query.trim()
  const filtered =
    q === ''
      ? rows
      : rows.filter(
          ([n, hasil]) =>
            String(n).includes(q) || String(hasil).includes(q),
        )
  const sup = SUPERSCRIPT[pangkat]

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-extrabold">
          Tabel Pangkat {pangkat} (1–100)
        </h3>
        <span className="text-xs font-semibold text-ink/60">
          {filtered.length} dari {rows.length} bilangan
        </span>
      </div>
      <input
        type="search"
        inputMode="numeric"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari bilangan atau hasil, mis. 7 atau 49…"
        aria-label="Cari bilangan di tabel pangkat"
        className="mb-3 w-full rounded-xl border-2 border-ink bg-white px-3.5 py-2.5 text-sm font-medium outline-none placeholder:text-ink/60 focus:border-primary-600 focus:ring-2 focus:ring-primary-100"
      />
      <div className="max-h-[420px] overflow-y-auto rounded-2xl border-2 border-ink bg-white shadow-sticker-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-primary-800 text-left">
              <th className="px-4 py-2.5 font-display font-extrabold text-white">
                Bilangan (n)
              </th>
              <th className="px-4 py-2.5 font-display font-extrabold text-white">
                n{sup}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(([n, hasil]) => (
              <tr
                key={n}
                className="border-t border-ink/10 odd:bg-white even:bg-paper"
              >
                <td className="px-4 py-2 font-bold tabular-nums">{n}</td>
                <td className="px-4 py-2 font-medium tabular-nums">
                  {hasil.toLocaleString('id-ID')}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={2}
                  className="px-4 py-6 text-center font-medium text-ink/60"
                >
                  Tidak ada bilangan yang cocok dengan “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
