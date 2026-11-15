import {
  AVATAR_VARIANTS,
  resolveAvatarVariant,
  setProfileAvatarVariant,
  useProfileAvatar,
} from '../lib/profile'
import { useStore } from '../lib/store'
import { MASCOT_NAME } from '../lib/mascot'
import { Mascot } from './Mascot'
import { cx } from '../lib/utils'

/**
 * Pemilih avatar maskot untuk halaman Profil: grid tombol varian
 * (radiogroup). Varian terpilih ditandai ring hijau dan latar hijau
 * muda, dan tersimpan langsung saat diketik (namespaced per user,
 * lihat lib/profile.ts).
 *
 * Gating streak (v2.4): varian yang syarat streaknya belum terpenuhi
 * tampil abu-abu dengan syaratnya ("streak 7 hari") dan tidak bisa
 * dipilih. Bila streak putus sehingga varian tersimpan jadi terkunci,
 * yang ditandai terpilih adalah varian hasil resolve (tertinggi yang
 * masih terbuka), sama seperti yang dirender di hero dan header.
 */
export function AvatarPicker() {
  const { variantId } = useProfileAvatar()
  const { streak } = useStore()
  const resolved = resolveAvatarVariant(streak, variantId)

  return (
    <div
      role="radiogroup"
      aria-label={`Pilih avatar ${MASCOT_NAME}`}
      className="grid grid-cols-3 gap-2"
    >
      {AVATAR_VARIANTS.map((variant) => {
        const unlocked = streak >= variant.minStreak
        const selected = variant.id === resolved.id
        return (
          <button
            key={variant.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={
              unlocked
                ? variant.nama
                : `${variant.nama}, terkunci, butuh streak ${variant.minStreak} hari`
            }
            disabled={!unlocked}
            onClick={() => setProfileAvatarVariant(variant.id)}
            className={cx(
              'flex flex-col items-center gap-1 rounded-2xl border p-2 transition-colors',
              selected
                ? 'border-primary-600 bg-primary-50 ring-2 ring-primary-600'
                : 'border-line bg-white hover:border-primary-300 hover:bg-primary-50/50',
              !unlocked && 'cursor-not-allowed opacity-60',
            )}
          >
            <Mascot
              mood={variant.mood}
              outfit={variant.outfit}
              showCap={variant.showCap}
              headphones={variant.headphones}
              size={56}
              className={cx(!unlocked && 'opacity-50 grayscale')}
            />
            <span className="text-center text-xs leading-tight font-bold">
              {variant.nama}
            </span>
            {!unlocked && (
              <span className="text-center text-[10px] leading-tight font-bold text-ink/50">
                streak {variant.minStreak} hari
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
