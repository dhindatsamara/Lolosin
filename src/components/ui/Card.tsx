import type { HTMLAttributes } from 'react'
import { cx } from '../../lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function Card({ padding = 'md', className, ...props }: CardProps) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-ink/10 bg-white shadow-[0_1px_2px_rgba(27,30,28,0.05)]',
        PADDING[padding],
        className,
      )}
      {...props}
    />
  )
}
