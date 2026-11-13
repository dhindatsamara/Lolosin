import { cx } from '../../lib/utils'
import { ClockIcon } from '../icons'

export interface TimerDisplayProps {
  /** Sisa waktu dalam detik. */
  secondsLeft: number
  /** Di bawah ambang ini timer tampil merah (default 5 menit). */
  warningAtSeconds?: number
}

function format(seconds: number): string {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

/**
 * Tampilan hitung mundur tryout. Berubah merah saat sisa waktu di bawah
 * ambang peringatan.
 */
export function TimerDisplay({
  secondsLeft,
  warningAtSeconds = 5 * 60,
}: TimerDisplayProps) {
  const urgent = secondsLeft <= warningAtSeconds
  const critical = secondsLeft <= 60
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-sm font-bold tabular-nums',
        urgent ? 'bg-red-50 text-red-700' : 'bg-accent-100 text-accent-700',
        critical && 'animate-pulse',
      )}
      role="timer"
      aria-label={`Sisa waktu ${format(secondsLeft)}`}
    >
      <ClockIcon width={16} height={16} />
      {format(secondsLeft)}
    </span>
  )
}
