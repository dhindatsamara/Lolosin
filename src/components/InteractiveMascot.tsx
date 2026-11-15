/**
 * Maskot interaktif (landing + dashboard): maskot yang bisa ditekan
 * (klik, sentuh, atau keyboard Enter/Spasi karena ini <button> asli).
 *
 * Tiap tekan: Osi GOYANG lucu (geleng kiri-kanan sambil melompat
 * kecil, satu animasi pada SATU maskot), balon ucapan berganti ke
 * kalimat penyemangat berikutnya, dan mood berubah sebentar ke
 * 'semangat' lalu kembali ke mood dasar.
 *
 * Sengaja TIDAK ada efek yang memunculkan elemen tambahan (tanpa
 * +XP melayang, tanpa mini-maskot): satu maskot, satu balon, bersih
 * dan tidak menumpuk atau menutupi konten (feedback user v2.2.1).
 *
 * Gerak (keyframes di src/index.css) hanya transform/opacity dan
 * opt-in lewat @media (prefers-reduced-motion: no-preference). Saat
 * reduced motion, teks balon tetap berganti langsung tanpa animasi.
 */
import { useEffect, useRef, useState } from 'react'
import { Mascot, type MascotMood } from './Mascot'
import { MASCOT_NAME } from '../lib/mascot'
import { cx } from '../lib/utils'

/** Kalimat balon ucapan. Indeks 0 adalah sapaan awal di hero. */
const PHRASES = [
  `Hai! Aku ${MASCOT_NAME}, teman belajarmu.`,
  'Kamu bisa, gas terus!',
  'Satu soal lagi, satu langkah ke NIP.',
  'Streak-mu keren, jangan sampai padam ya.',
  'Aku bangga sama progresmu!',
  'Belajar bentar tiap hari, hasilnya besar.',
]

/** Durasi mood 'semangat' setelah ditekan (ms). */
const MOOD_DURATION_MS = 900

interface InteractiveMascotProps {
  /** Mood dasar di luar momen ditekan (default 'semangat'). */
  baseMood?: MascotMood
  /** Ukuran kotak SVG dalam px (default 220, sama seperti hero lama). */
  size?: number
  /** Kalimat balon ucapan (default PHRASES). Indeks 0 tampil pertama. */
  phrases?: string[]
  /** Tampilkan balon ucapan di atas maskot (default true). */
  withBubble?: boolean
  /** Tampilkan pill nama di bawah maskot (default true). */
  showName?: boolean
  className?: string
  /** Class tambahan untuk SVG maskot (mis. lebar responsif, float-soft). */
  mascotClassName?: string
}

export function InteractiveMascot({
  baseMood = 'semangat',
  size = 220,
  phrases = PHRASES,
  withBubble = true,
  showName = true,
  className,
  mascotClassName,
}: InteractiveMascotProps) {
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [mood, setMood] = useState<MascotMood>(baseMood)
  const [danceKey, setDanceKey] = useState(0)
  const moodTimer = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      window.clearTimeout(moodTimer.current)
    },
    [],
  )

  function handlePress() {
    // Kalimat berikutnya (berputar); key baru memicu ulang goyang.
    setPhraseIndex((i) => (i + 1) % phrases.length)
    setDanceKey((k) => k + 1)
    // Mood semangat sebentar, lalu kembali ke mood dasar. Timer lama
    // dibersihkan supaya tekan beruntun tidak mengembalikan mood di
    // tengah-tengah.
    setMood('semangat')
    window.clearTimeout(moodTimer.current)
    moodTimer.current = window.setTimeout(() => {
      setMood(baseMood)
    }, MOOD_DURATION_MS)
  }

  return (
    <div className={cx('flex flex-col items-center', className)}>
      {withBubble && (
        <div
          key={phraseIndex}
          role="status"
          className="bubble-pop relative z-10 mx-auto w-fit max-w-full rounded-2xl bg-white px-4 py-2.5 text-center shadow-soft"
        >
          <p className="text-sm leading-snug font-bold text-ink">
            {phrases[phraseIndex]}
          </p>
          <span
            className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-white"
            aria-hidden="true"
          />
        </div>
      )}
      <button
        type="button"
        onClick={handlePress}
        aria-label={`Sapa ${MASCOT_NAME}, maskot Lolosin`}
        title={`Sapa ${MASCOT_NAME}`}
        className="relative z-10 mt-2 cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-400"
      >
        {/* key baru = animasi goyang jalan lagi dari awal */}
        <span key={danceKey} className="mascot-goyang block">
          <Mascot mood={mood} size={size} className={mascotClassName} />
        </span>
      </button>
      {showName && (
        <p className="relative z-10 mt-1 w-fit rounded-full bg-white px-4 py-1 font-display text-base font-extrabold text-primary-800 shadow-soft">
          {MASCOT_NAME}
        </p>
      )}
    </div>
  )
}
