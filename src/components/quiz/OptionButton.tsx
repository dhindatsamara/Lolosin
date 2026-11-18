import type { Opsi } from '../../lib/questions'
import { cx } from '../../lib/utils'
import { CheckIcon } from '../icons'
import { MathText } from '../MathText'

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
  default:
    'border-line bg-white shadow-soft hover:border-primary-300 hover:bg-primary-50',
  selected:
    'border-primary-600 bg-primary-600 text-white shadow-soft',
  correct:
    'border-green-600 bg-green-100 text-green-900 shadow-soft',
  wrong:
    'border-red-500 bg-red-100 text-red-900 shadow-soft',
  muted: 'border-line bg-white opacity-60',
}

const LETTER_CLASSES: Record<OptionState, string> = {
  default: 'bg-ink/5 text-ink',
  selected: 'bg-white text-primary-700',
  correct: 'bg-green-600 text-white',
  wrong: 'bg-red-500 text-white',
  muted: 'bg-ink/5 text-ink/60',
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
        'flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-all',
        'disabled:cursor-default',
        'enabled:active:scale-[0.98]',
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
        <MathText text={teks} />
      </span>
      {badge && (
        <span className="mt-0.5 shrink-0 rounded-full bg-ink/5 px-2 py-0.5 text-xs font-extrabold text-ink">
          {badge}
        </span>
      )}
    </button>
  )
}
