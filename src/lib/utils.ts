import { twMerge } from 'tailwind-merge'

/**
 * Gabung daftar class CSS, mengabaikan nilai falsy, dan selesaikan
 * konflik class Tailwind (class terakhir menang, mis. `bg-primary-600`
 * dari call-site mengalahkan `bg-white` dari default komponen).
 */
export function cx(
  ...parts: Array<string | false | null | undefined>
): string {
  return twMerge(parts.filter(Boolean).join(' '))
}
