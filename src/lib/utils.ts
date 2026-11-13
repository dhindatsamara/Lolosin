/** Gabung daftar class CSS, mengabaikan nilai falsy. */
export function cx(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(' ')
}
