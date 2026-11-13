import type { ButtonHTMLAttributes } from 'react'
import { cx } from '../../lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 shadow-sm',
  secondary:
    'bg-accent-500 text-ink hover:bg-accent-400 active:bg-accent-600',
  outline:
    'border border-ink/15 bg-white text-ink hover:border-primary-600 hover:text-primary-700',
  ghost: 'text-primary-700 hover:bg-primary-50',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'rounded-lg px-3 py-1.5 text-sm',
  md: 'rounded-xl px-4 py-2.5 text-sm',
  lg: 'rounded-xl px-5 py-3 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-semibold transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  )
}
