import type { Opsi } from '../../lib/questions'
import { cx } from '../../lib/utils'
import { CheckIcon } from '../icons'

export type OptionState =
  | 'default'
  | 'selected'
  | 'correct'
  | 'wrong'
  | 'muted'

export interface OptionButtonProps {
  /** Huruf opsi (A–E). */
  huruf: Opsi
  /** Teks isi opsi. */
  teks: string
  state?: OptionState
  disabled?: boolean
  /** Label kecil di kanan, mis. bobot poin TKP ("5 poin"). */
  badge?: string
  onClick?: () => void
}

const STATE_CLASSES: Record<OptionState, string> = {
  default: 'border-ink/15 bg-white hover:border-primary-600 hover:bg-primary-50',
  selected: 'border-primary-600 bg-primary-50 ring-1 ring-primary-600',
  correct: 'border-green-600 bg-green-50 ring-1 ring-green-600',
  wrong: 'border-red-500 bg-red-50 ring-1 ring-red-500',
  muted: 'border-ink/10 bg-white opacity-55',
}

const LETTER_CLASSES: Record<OptionState, string> = {
  default: 'bg-ink/5 text-ink/70',
  selected: 'bg-primary-600 text-white',
  correct: 'bg-green-600 text-white',
  wrong: 'bg-red-500 text-white',
  muted: 'bg-ink/5 text-ink/50',
}

/**
 * Satu tombol opsi jawaban (A–E). Dipakai drill (dengan feedback
 * benar/salah) dan tryout (pilih saja, tanpa feedback).
 */
export function OptionButton({
  huruf,
  teks,
  state = 'default',
  disabled = false,
  badge,
  onClick,
}: OptionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={state === 'selected'}
      className={cx(
        'flex w-full items-start gap-3 rounded-xl border-2 px-3 py-3 text-left transition-colors',
        'disabled:cursor-default',
        STATE_CLASSES[state],
      )}
    >
      <span
        className={cx(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          LETTER_CLASSES[state],
        )}
      >
        {state === 'correct' ? <CheckIcon width={16} height={16} /> : huruf}
      </span>
      <span className="min-w-0 flex-1 text-sm leading-relaxed font-medium">
        {teks}
      </span>
      {badge && (
        <span className="mt-0.5 shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-xs font-bold text-ink/70">
          {badge}
        </span>
      )}
    </button>
  )
}
