import type { HTMLAttributes } from 'react'
import { cx } from '../../lib/utils'

export type BadgeTone = 'twk' | 'tiu' | 'tkp' | 'amber' | 'green' | 'neutral'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
}

const TONES: Record<BadgeTone, string> = {
  twk: 'bg-twk-soft text-twk',
  tiu: 'bg-tiu-soft text-tiu',
  tkp: 'bg-tkp-soft text-tkp',
  amber: 'bg-accent-100 text-accent-700',
  green: 'bg-primary-100 text-primary-700',
  neutral: 'bg-ink/5 text-ink/70',
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold',
        TONES[tone],
        className,
      )}
      {...props}
    />
  )
}
