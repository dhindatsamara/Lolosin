import {
  AVATAR_VARIANTS,
  setProfileAvatarVariant,
  useProfileAvatar,
} from '../lib/profile'
import { MASCOT_NAME } from '../lib/mascot'
import { Mascot } from './Mascot'
import { cx } from '../lib/utils'

/**
 * Pemilih avatar maskot untuk halaman Profil: grid tombol varian
 * (radiogroup). Varian terpilih ditandai ring hijau dan latar hijau
 * muda, dan tersimpan langsung saat diketik (namespaced per user,
 * lihat lib/profile.ts).
 */
export function AvatarPicker() {
  const { variantId } = useProfileAvatar()

  return (
    <div
      role="radiogroup"
      aria-label={`Pilih avatar ${MASCOT_NAME}`}
      className="grid grid-cols-3 gap-2"
    >
      {AVATAR_VARIANTS.map((variant) => {
        const selected = variant.id === variantId
        return (
          <button
            key={variant.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={variant.nama}
            onClick={() => setProfileAvatarVariant(variant.id)}
            className={cx(
              'flex flex-col items-center gap-1 rounded-2xl border p-2 transition-colors',
              selected
                ? 'border-primary-600 bg-primary-50 ring-2 ring-primary-600'
                : 'border-line bg-white hover:border-primary-300 hover:bg-primary-50/50',
            )}
          >
            <Mascot
              mood={variant.mood}
              outfit={variant.outfit}
              showCap={variant.showCap}
              headphones={variant.headphones}
              size={56}
            />
            <span className="text-center text-xs leading-tight font-bold">
              {variant.nama}
            </span>
          </button>
        )
      })}
    </div>
  )
}
