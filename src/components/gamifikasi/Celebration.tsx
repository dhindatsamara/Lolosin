import { useMemo } from 'react'
import { useSyncExternalStore } from 'react'
import {
  dismissCelebration,
  getCelebrations,
  subscribeCelebrations,
  type Celebration,
  type CelebrationItem,
} from '../../lib/gamification'
import { Button } from '../ui/Button'
import { Mascot } from '../Mascot'

const CONFETTI_COLORS = ['#F59E0B', '#0E5C43', '#C2410C', '#1E40AF', '#7E22CE']
const CONFETTI_COUNT = 24

/**
 * Confetti CSS-only (tanpa library): 24 potong yang jatuh sekali.
 * Dipakai hemat, hanya di momen besar: naik level, lencana pertama,
 * dan lulus tryout.
 */
function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        left: (i * 37 + 11) % 100,
        delay: (i % 8) * 0.12,
        duration: 2.2 + (i % 5) * 0.25,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        round: i % 3 === 0,
      })),
    [],
  )
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
    >
      {pieces.map((piece, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${piece.left}%`,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            borderRadius: piece.round ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  )
}

/** Confetti hanya untuk momen besar. */
function withConfetti(celebration: Celebration): boolean {
  if (celebration.kind === 'levelUp') return true
  if (celebration.kind === 'reviewDone') return true
  if (celebration.kind === 'badge') {
    return celebration.firstBadge || celebration.badge.id === 'lulus-tryout'
  }
  return false
}

function CelebrationBody({ celebration }: { celebration: Celebration }) {
  if (celebration.kind === 'levelUp') {
    return (
      <>
        <Mascot mood="semangat" size={72} className="mx-auto" />
        <p className="kicker mt-2">level up!</p>
        <h2 className="mt-1 font-display text-2xl leading-tight font-extrabold">
          Naik ke Level {celebration.level}!
        </h2>
        <p className="mt-2 text-sm leading-relaxed font-medium text-ink/70">
          Gelar barumu: {celebration.rankTitle}. Makin dekat ke NIP, gas
          terus!
        </p>
      </>
    )
  }
  if (celebration.kind === 'badge') {
    return (
      <>
        <p className="text-4xl" aria-hidden="true">
          {celebration.badge.ikon}
        </p>
        <p className="kicker mt-2">lencana baru!</p>
        <h2 className="mt-1 font-display text-2xl leading-tight font-extrabold">
          {celebration.badge.nama}
        </h2>
        <p className="mt-2 text-sm leading-relaxed font-medium text-ink/70">
          {celebration.badge.deskripsi}
        </p>
        {celebration.firstBadge && (
          <p className="mt-2 text-sm leading-relaxed font-bold text-primary-700">
            Nice! Lencana pertama kamu kebuka.
          </p>
        )}
      </>
    )
  }
  if (celebration.kind === 'reviewDone') {
    return (
      <>
        <Mascot mood="semangat" size={72} className="mx-auto" />
        <p className="kicker mt-2">antrean ulas beres!</p>
        <h2 className="mt-1 font-display text-2xl leading-tight font-extrabold">
          Semua ulasan hari ini selesai!
        </h2>
        <p className="mt-2 text-sm leading-relaxed font-medium text-ink/70">
          Soal-soal yang dulu salah sekarang makin nempel. Besok cek lagi
          ya, siapa tahu ada yang jatuh tempo.
        </p>
      </>
    )
  }
  return (
    <>
      <Mascot mood="senang" size={72} className="mx-auto" />
      <p className="kicker mt-2">apinya nyala terus!</p>
      <h2 className="mt-1 font-display text-2xl leading-tight font-extrabold">
        {celebration.streak} hari beruntun!
      </h2>
      <p className="mt-2 text-sm leading-relaxed font-medium text-ink/70">
        Konsistensimu nggak main-main. Besok lanjut lagi ya!
      </p>
    </>
  )
}

/**
 * Host perayaan: menampilkan antrean perayaan satu per satu sebagai
 * kartu overlay yang bisa ditutup (tombol, tombol X, atau ketuk latar).
 * Dipasang sekali di Layout supaya momen dari halaman mana pun muncul.
 */
export function CelebrationHost() {
  const items = useSyncExternalStore(
    subscribeCelebrations,
    getCelebrations,
    getCelebrations,
  )
  const current: CelebrationItem | undefined = items[0]
  if (!current) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Perayaan"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Tutup perayaan"
        onClick={() => dismissCelebration(current.id)}
        className="absolute inset-0 bg-ink/50"
      />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-white p-6 text-center shadow-soft-lg">
        {withConfetti(current.celebration) && <Confetti />}
        <button
          type="button"
          aria-label="Tutup"
          onClick={() => dismissCelebration(current.id)}
          className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-ink/5 text-base font-extrabold text-ink/70 hover:bg-ink/10"
        >
          ✕
        </button>
        <div className="relative">
          <CelebrationBody celebration={current.celebration} />
          <div className="mt-5">
            <Button
              size="lg"
              fullWidth
              onClick={() => dismissCelebration(current.id)}
            >
              Sip, lanjut!
            </Button>
          </div>
          {items.length > 1 && (
            <p className="mt-2 text-xs font-bold text-ink/50">
              Masih ada {items.length - 1} perayaan lagi
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
