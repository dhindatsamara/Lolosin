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
 *
 * Dipadatkan (v2.6): padding kartu, ikon judul, dan lingkaran hari
 * dikecilkan supaya section streak beranda lebih pendek.
 */
export function WeekStreak() {
  const { activityDates, streak } = useStore()
  const today = todayMakassar()
  const week = getWeekDates(today)
  const aktif = new Set(activityDates)
  const belajarMingguIni = week.filter((d) => aktif.has(d)).length

  return (
    <section aria-label="Streak mingguan">
      <Card className="p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-twk-soft text-twk">
              <FlameIcon width={17} height={17} />
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

        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {week.map((date, i) => {
            const isToday = date === today
            const isActive = aktif.has(date)
            const isFuture = date > today
            return (
              <div key={date} className="flex flex-col items-center gap-1">
                <span
                  className={cx(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold',
                    isActive
                      ? 'bg-primary-600 text-white'
                      : isToday
                        ? 'bg-accent-400 text-ink'
                        : isFuture
                          ? 'bg-paper text-ink/40'
                          : 'bg-ink/5 text-ink/40',
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
