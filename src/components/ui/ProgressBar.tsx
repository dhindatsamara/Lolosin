import { cx } from '../../lib/utils'

type ProgressTone = 'primary' | 'twk' | 'tiu' | 'tkp' | 'amber'

export interface ProgressBarProps {
  value: number
  max: number
  tone?: ProgressTone
  className?: string
  label?: string
}

const TONES: Record<ProgressTone, string> = {
  primary: 'bg-primary-600',
  twk: 'bg-twk',
  tiu: 'bg-tiu',
  tkp: 'bg-tkp',
  amber: 'bg-accent-500',
}

export function ProgressBar({
  value,
  max,
  tone = 'primary',
  className,
  label,
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      className={cx(
        'h-3 w-full overflow-hidden rounded-full bg-ink/10',
        className,
      )}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div
        className={cx('h-full transition-all', TONES[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
