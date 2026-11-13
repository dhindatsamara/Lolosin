/** Cincin progres melingkar (SVG) dengan label persen di tengah. */
import { cx } from '../../lib/utils'

type RingTone = 'primary' | 'twk' | 'tiu' | 'tkp' | 'amber'

const TONES: Record<RingTone, string> = {
  primary: 'stroke-primary-600',
  twk: 'stroke-twk',
  tiu: 'stroke-tiu',
  tkp: 'stroke-tkp',
  amber: 'stroke-accent-500',
}

export interface ProgressRingProps {
  value: number
  max: number
  size?: number
  strokeWidth?: number
  tone?: RingTone
  /** Label di tengah cincin; default persen (mis. "45%"). */
  label?: string
  /** Kelas warna untuk lintasan (track) cincin. */
  trackClassName?: string
  className?: string
}

export function ProgressRing({
  value,
  max,
  size = 64,
  strokeWidth = 9,
  tone = 'primary',
  label,
  trackClassName = 'stroke-ink/10',
  className,
}: ProgressRingProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  return (
    <div
      className={cx('relative inline-flex shrink-0 items-center justify-center', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label ?? `${Math.round(pct)} persen`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={trackClassName}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          className={cx('transition-all', TONES[tone])}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-sm font-extrabold">
        {label ?? `${Math.round(pct)}%`}
      </span>
    </div>
  )
}
