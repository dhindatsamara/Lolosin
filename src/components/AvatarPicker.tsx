import {
  AVATAR_VARIANTS,
  resolveAvatarVariant,
  setProfileAvatarVariant,
  useProfileAvatar,
  type AvatarVariantId,
} from '../lib/profile'
import { useStore } from '../lib/store'
import { MASCOT_NAME } from '../lib/mascot'
import { Mascot } from './Mascot'
import { cx } from '../lib/utils'

interface AvatarPickerProps {
  /**
   * Mode terkontrol (draft di halaman Profil, v2.5): bila value dan
   * onChange diisi, pilihan tidak langsung tersimpan, tapi
   * diteruskan ke pemanggil untuk ditampung sebagai draft. Tanpa
   * keduanya, perilakunya seperti dulu: pilihan langsung tersimpan
   * (namespaced per user, lihat lib/profile.ts).
   */
  value?: AvatarVariantId
  onChange?: (id: AvatarVariantId) => void
  /**
   * Kelas tambahan untuk grid radiogroup (v2.6): Profil memakai
   * "grid-cols-4" supaya 7 varian muat dalam 2 baris di kolom
   * sempit. twMerge menyelesaikan konflik dengan grid-cols-3
   * bawaan (kelas terakhir yang menang).
   */
  className?: string
}

/**
 * Pemilih avatar maskot untuk halaman Profil: grid tombol varian
 * (radiogroup). Varian terpilih ditandai ring hijau dan latar hijau
 * muda.
 *
 * Gating streak (v2.4): varian yang syarat streaknya belum terpenuhi
 * tampil abu-abu dengan syaratnya ("streak 7 hari") dan tidak bisa
 * dipilih. Bila streak putus sehingga varian tersimpan jadi terkunci,
 * yang ditandai terpilih adalah varian hasil resolve (tertinggi yang
 * masih terbuka), sama seperti yang dirender di hero dan header.
 */
export function AvatarPicker({
  value,
  onChange,
  className,
}: AvatarPickerProps = {}) {
  const { variantId } = useProfileAvatar()
  const { streak } = useStore()
  const activeId = value ?? variantId
  const resolved = resolveAvatarVariant(streak, activeId)

  return (
    <div
      role="radiogroup"
      aria-label={`Pilih avatar ${MASCOT_NAME}`}
      className={cx('grid grid-cols-3 gap-2', className)}
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
            onClick={() => {
              if (onChange) {
                onChange(variant.id)
              } else {
                setProfileAvatarVariant(variant.id)
              }
            }}
            className={cx(
              'flex flex-col items-center gap-0.5 rounded-2xl border p-1.5 transition-colors',
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
              size={44}
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
