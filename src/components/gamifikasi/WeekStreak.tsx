import {
  shiftDate,
  todayMakassar,
  useStore,
} from '../../lib/store'
import { cx } from '../../lib/utils'
import { Card } from '../ui/Card'
import { CheckIcon, FlameIcon } from '../icons'

const HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

/** 7 tanggal Senin sampai Minggu di minggu yang memuat `todayIso`. */
export function getWeekDates(todayIso: string): string[] {
  const [y, m, d] = todayIso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  // getUTCDay: 0 = Minggu, jadi Senin berjarak (hari + 6) % 7 ke belakang.
  const mondayOffset = (dt.getUTCDay() + 6) % 7
  const monday = shiftDate(todayIso, -mondayOffset)
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i))
}

/**
 * Streak mingguan: 7 titik hari (Senin sampai Minggu) yang menunjukkan
 * hari apa saja minggu ini pengguna belajar.
 */
export function WeekStreak() {
  const { activityDates, streak } = useStore()
  const today = todayMakassar()
  const week = getWeekDates(today)
  const aktif = new Set(activityDates)
  const belajarMingguIni = week.filter((d) => aktif.has(d)).length

  return (
    <section aria-label="Streak mingguan">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-ink bg-twk-soft text-twk">
              <FlameIcon width={18} height={18} />
            </span>
            <div>
              <h2 className="font-display text-base leading-tight font-extrabold">
                Streak minggu ini
              </h2>
              <p className="text-xs font-medium text-ink/60">
                {belajarMingguIni} dari 7 hari belajar · {streak} hari
                beruntun
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {week.map((date, i) => {
            const isToday = date === today
            const isActive = aktif.has(date)
            const isFuture = date > today
            return (
              <div key={date} className="flex flex-col items-center gap-1.5">
                <span
                  className={cx(
                    'flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-extrabold',
                    isActive
                      ? 'border-ink bg-primary-600 text-white shadow-sticker-sm'
                      : isToday
                        ? 'border-ink bg-accent-400 text-ink shadow-sticker-sm'
                        : isFuture
                          ? 'border-dashed border-ink/25 bg-paper text-ink/40'
                          : 'border-ink/25 bg-white text-ink/40',
                  )}
                  aria-label={`${HARI[i]} ${isActive ? 'belajar' : isFuture ? 'belum tiba' : 'tidak belajar'}`}
                >
                  {isActive ? <CheckIcon width={16} height={16} /> : HARI[i][0]}
                </span>
                <span
                  className={cx(
                    'text-[11px] font-bold',
                    isToday ? 'text-ink' : 'text-ink/50',
                  )}
                >
                  {HARI[i]}
                </span>
              </div>
            )
          })}
        </div>
      </Card>
    </section>
  )
}
