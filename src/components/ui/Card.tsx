import type { HTMLAttributes } from 'react'
import { cx } from '../../lib/utils'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const PADDING: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4 lg:p-5',
  lg: 'p-6',
}

export function Card({ padding = 'md', className, ...props }: CardProps) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-line bg-white shadow-soft',
        PADDING[padding],
        className,
      )}
      {...props}
    />
  )
}
