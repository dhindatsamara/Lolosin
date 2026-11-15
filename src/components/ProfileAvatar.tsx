import { resolveAvatarVariant, useProfileAvatar } from '../lib/profile'
import { useStore } from '../lib/store'
import { Mascot } from './Mascot'
import { cx } from '../lib/utils'

interface ProfileAvatarProps {
  /** Diameter avatar dalam px (default 28). */
  size?: number
  className?: string
  /** Label aksesibilitas untuk foto; default "Foto profilmu". */
  label?: string
}

/**
 * Satu komponen tampil avatar profil, dipakai header, halaman Profil,
 * dan kartu profil dashboard. Foto yang diunggah didahulukan; kalau
 * belum ada foto, tampil varian maskot yang dipilih user.
 *
 * Gating streak (v2.4): varian yang dirender adalah hasil resolve
 * terhadap streak saat ini, jadi varian yang terkunci karena streak
 * putus jatuh ke varian tertinggi yang masih terbuka (lihat
 * resolveAvatarVariant di lib/profile.ts).
 *
 * Varian maskot dirender sedikit lebih kecil dari lingkaran (88%)
 * supaya mahkota dan topi wisuda tidak terpotong tepi lingkaran.
 */
export function ProfileAvatar({
  size = 28,
  className,
  label,
}: ProfileAvatarProps) {
  const { photo, variantId } = useProfileAvatar()
  const { streak } = useStore()
  const variant = resolveAvatarVariant(streak, variantId)

  if (photo) {
    return (
      <img
        src={photo}
        alt={label ?? 'Foto profilmu'}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cx('shrink-0 rounded-full object-cover', className)}
      />
    )
  }

  return (
    <span
      style={{ width: size, height: size }}
      className={cx(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50',
        className,
      )}
    >
      <Mascot
        mood={variant.mood}
        outfit={variant.outfit}
        showCap={variant.showCap}
        headphones={variant.headphones}
        size={Math.round(size * 0.88)}
      />
    </span>
  )
}
