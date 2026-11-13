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
    'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
  secondary:
    'bg-accent-500 text-ink hover:bg-accent-400 active:bg-accent-600',
  outline:
    'bg-white text-ink hover:bg-primary-50 hover:text-primary-700',
  // Ghost: tanpa border & shadow (override base via tailwind-merge).
  ghost:
    'border-transparent bg-transparent text-primary-700 shadow-none hover:bg-primary-50 active:translate-x-0 active:translate-y-0',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
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
        'inline-flex items-center justify-center gap-2 rounded-full border-2 border-ink font-semibold shadow-sticker-sm transition-all duration-100',
        'active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
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
