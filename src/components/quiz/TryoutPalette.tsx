import type { Materi, Question } from '../../lib/questions'
import type { TryoutAnswers } from '../../lib/quiz'
import { cx } from '../../lib/utils'

export interface TryoutPaletteProps {
  questions: Question[]
  answers: TryoutAnswers
  /** Id soal yang ditandai ragu-ragu. */
  doubted: ReadonlySet<string>
  currentIndex: number
  onSelect: (index: number) => void
}

const SECTION_STYLE: Record<Materi, { label: string; answered: string }> = {
  TWK: { label: 'text-twk', answered: 'bg-twk text-white border-twk' },
  TIU: { label: 'text-tiu', answered: 'bg-tiu text-white border-tiu' },
  TKP: { label: 'text-tkp', answered: 'bg-tkp text-white border-tkp' },
}

/**
 * Palet navigator tryout: grid nomor soal 1–N yang dikelompokkan per seksi.
 * Status tiap nomor: belum dijawab (putih), dijawab (warna seksi),
 * ragu-ragu (amber), soal aktif (ring tebal).
 */
export function TryoutPalette({
  questions,
  answers,
  doubted,
  currentIndex,
  onSelect,
}: TryoutPaletteProps) {
  const sections: Array<{ materi: Materi; start: number; items: Question[] }> =
    []
  for (const q of questions) {
    const last = sections[sections.length - 1]
    if (last && last.materi === q.materi) {
      last.items.push(q)
    } else {
      sections.push({
        materi: q.materi,
        start: sections.reduce((n, s) => n + s.items.length, 0),
        items: [q],
      })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-ink/60">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-ink/15 bg-white" />
          Belum dijawab
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-primary-600 bg-primary-600" />
          Dijawab
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border-2 border-accent-500 bg-accent-100" />
          Ragu-ragu
        </span>
      </div>

      {sections.map(({ materi, start, items }) => (
        <div key={materi}>
          <p
            className={cx(
              'mb-1.5 text-xs font-bold tracking-wide uppercase',
              SECTION_STYLE[materi].label,
            )}
          >
            {materi} · soal {start + 1}–{start + items.length}
          </p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {items.map((q, i) => {
              const index = start + i
              const answered = answers[q.id] !== undefined
              const isDoubted = doubted.has(q.id)
              const isCurrent = index === currentIndex
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onSelect(index)}
                  aria-label={`Soal ${index + 1}${answered ? ', sudah dijawab' : ''}${isDoubted ? ', ragu-ragu' : ''}`}
                  aria-current={isCurrent}
                  className={cx(
                    'flex aspect-square items-center justify-center rounded-lg border-2 text-sm font-bold transition-colors',
                    isDoubted
                      ? 'border-accent-500 bg-accent-100 text-accent-700'
                      : answered
                        ? SECTION_STYLE[materi].answered
                        : 'border-ink/15 bg-white text-ink/70 hover:border-ink/30',
                    isCurrent && 'ring-2 ring-ink ring-offset-1',
                  )}
                >
                  {index + 1}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
