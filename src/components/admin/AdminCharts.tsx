/**
 * Grafik ringan panel admin (v2.14.1): SVG murni, tanpa dependensi.
 *
 * Tiga grafik untuk modul Statistik:
 * - AreaLineChart: user baru per hari (7 hari terakhir).
 * - StackedBarChart: tryout selesai per hari, Kilat + Akbar ditumpuk.
 * - DonutChart: pembagian user Gratis vs Premium.
 *
 * Semua grafik aman saat data kosong (total 0): garis datar, batang
 * nol, atau cincin abu-abu, plus catatan "Belum ada data". Tidak
 * pernah crash karena max 0 atau pembagian nol.
 *
 * Zona waktu: semua tanggal dihitung dalam Asia/Makassar supaya
 * konsisten dengan week_start leaderboard dan Senin minggu berjalan.
 */
import { useId } from 'react'

/** Satu hari di sumbu X: kunci YYYY-MM-DD + label singkat. */
export interface DayKey {
  key: string
  /** Mis. "Sen 16". */
  label: string
}

/** Ambil bagian tanggal (tahun, bulan, hari) dalam Asia/Makassar. */
function makassarParts(date: Date): {
  year: number
  month: number
  day: number
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
  }
}

/** Kunci YYYY-MM-DD dari bagian tanggal. */
function dateKey(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

/**
 * 7 hari terakhir sampai hari ini (Asia/Makassar), urut dari yang
 * paling lama ke hari ini. Label memakai nama hari singkat id-ID.
 */
export function last7DaysMakassar(now = new Date()): DayKey[] {
  const { year, month, day } = makassarParts(now)
  const days: DayKey[] = []
  for (let back = 6; back >= 0; back--) {
    const d = new Date(Date.UTC(year, month - 1, day))
    d.setUTCDate(d.getUTCDate() - back)
    const key = dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
    const weekday = new Intl.DateTimeFormat('id-ID', {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(d)
    days.push({ key, label: `${weekday} ${d.getUTCDate()}` })
  }
  return days
}

/** Ubah timestamp ISO menjadi kunci tanggal Asia/Makassar. */
export function toMakassarDateKey(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const { year, month, day } = makassarParts(date)
  return dateKey(year, month, day)
}

/** Hitung jumlah timestamp per hari (kunci di luar daftar diabaikan). */
export function countPerDay(isoList: string[], keys: string[]): number[] {
  const counts = keys.map(() => 0)
  const indexByKey = new Map(keys.map((key, i) => [key, i]))
  for (const iso of isoList) {
    const key = toMakassarDateKey(iso)
    if (key === null) continue
    const i = indexByKey.get(key)
    if (i !== undefined) counts[i] += 1
  }
  return counts
}

/** Warna grafik (token Lolosin, hex supaya bisa dipakai di SVG). */
const GREEN_DARK = '#0E5C43'
const GREEN_MID = '#529E83'
const GREEN_LIGHT = '#84BCA6'
const GREEN_PALE = '#D8EBE2'
const INK = '#1B1E1C'
const GRID = '#E8E2D6'

/* ------------------------------------------------------------------ */
/* Grafik garis + area: user baru per hari                             */
/* ------------------------------------------------------------------ */

export interface LinePoint {
  label: string
  value: number
}

export function AreaLineChart({
  data,
  caption,
}: {
  data: LinePoint[]
  /** Ringkasan untuk pembaca layar, mis. "Total 1 user baru". */
  caption: string
}) {
  const gradientId = useId()
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const width = 640
  const height = 220
  const padLeft = 36
  const padRight = 12
  const padTop = 18
  const padBottom = 30
  const innerW = width - padLeft - padRight
  const innerH = height - padTop - padBottom
  const max = Math.max(1, ...data.map((d) => d.value))
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0
  const x = (i: number) => padLeft + i * stepX
  const y = (v: number) => padTop + innerH - (v / max) * innerH
  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ')
  // Path area: garis atas lalu tutup ke bawah.
  const areaPath =
    data.length > 0
      ? [
          `M ${x(0)} ${y(data[0].value)}`,
          ...data.slice(1).map((d, i) => `L ${x(i + 1)} ${y(d.value)}`),
          `L ${x(data.length - 1)} ${y(0)}`,
          `L ${x(0)} ${y(0)}`,
          'Z',
        ].join(' ')
      : ''
  const gridValues = [0, Math.ceil(max / 3), Math.ceil((2 * max) / 3), max]

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Grafik user baru 7 hari terakhir. ${caption}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN_MID} stopOpacity="0.35" />
            <stop offset="100%" stopColor={GREEN_MID} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridValues.map((v, i) => (
          <g key={`${v}-${i}`}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={y(v)}
              y2={y(v)}
              stroke={GRID}
              strokeWidth="1"
            />
            <text
              x={padLeft - 8}
              y={y(v) + 4}
              textAnchor="end"
              fontSize="11"
              fill={INK}
              fillOpacity="0.55"
            >
              {v}
            </text>
          </g>
        ))}
        {data.length > 0 && (
          <path d={areaPath} fill={`url(#${gradientId})`} />
        )}
        {data.length > 1 && (
          <polyline
            points={points}
            fill="none"
            stroke={GREEN_DARK}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {data.map((d, i) => (
          <g key={d.label}>
            <circle
              cx={x(i)}
              cy={y(d.value)}
              r="4"
              fill="#fff"
              stroke={GREEN_DARK}
              strokeWidth="2"
            />
            {d.value > 0 && (
              <text
                x={x(i)}
                y={y(d.value) - 10}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill={INK}
              >
                {d.value}
              </text>
            )}
            <text
              x={x(i)}
              y={height - 8}
              textAnchor="middle"
              fontSize="11"
              fill={INK}
              fillOpacity="0.55"
            >
              {d.label}
            </text>
          </g>
        ))}
      </svg>
      {total === 0 && (
        <p className="mt-1 text-xs text-ink/50">
          Belum ada user baru 7 hari terakhir.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Grafik batang tumpuk: tryout per hari (Kilat + Akbar)               */
/* ------------------------------------------------------------------ */

export interface StackedDayPoint {
  label: string
  kilat: number
  akbar: number
}

export function StackedBarChart({
  data,
  caption,
}: {
  data: StackedDayPoint[]
  /** Ringkasan untuk pembaca layar. */
  caption: string
}) {
  const totals = data.map((d) => d.kilat + d.akbar)
  const total = totals.reduce((sum, v) => sum + v, 0)
  const width = 640
  const height = 220
  const padLeft = 36
  const padRight = 12
  const padTop = 18
  const padBottom = 30
  const innerW = width - padLeft - padRight
  const innerH = height - padTop - padBottom
  const max = Math.max(1, ...totals)
  const slot = data.length > 0 ? innerW / data.length : 0
  const barW = Math.min(44, slot * 0.55)
  const y = (v: number) => padTop + innerH - (v / max) * innerH
  const gridValues = [0, Math.ceil(max / 3), Math.ceil((2 * max) / 3), max]

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Grafik tryout selesai 7 hari terakhir. ${caption}`}
      >
        {gridValues.map((v, i) => (
          <g key={`${v}-${i}`}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={y(v)}
              y2={y(v)}
              stroke={GRID}
              strokeWidth="1"
            />
            <text
              x={padLeft - 8}
              y={y(v) + 4}
              textAnchor="end"
              fontSize="11"
              fill={INK}
              fillOpacity="0.55"
            >
              {v}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padLeft + slot * i + slot / 2
          const totalDay = d.kilat + d.akbar
          const akbarH = (d.akbar / max) * innerH
          const kilatH = (d.kilat / max) * innerH
          const base = y(0)
          return (
            <g key={d.label}>
              {d.akbar > 0 && (
                <rect
                  x={cx - barW / 2}
                  y={base - akbarH}
                  width={barW}
                  height={akbarH}
                  rx="3"
                  fill={GREEN_DARK}
                />
              )}
              {d.kilat > 0 && (
                <rect
                  x={cx - barW / 2}
                  y={base - akbarH - kilatH}
                  width={barW}
                  height={kilatH}
                  rx="3"
                  fill={GREEN_LIGHT}
                />
              )}
              {totalDay > 0 && (
                <text
                  x={cx}
                  y={base - akbarH - kilatH - 6}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={INK}
                >
                  {totalDay}
                </text>
              )}
              <text
                x={cx}
                y={height - 8}
                textAnchor="middle"
                fontSize="11"
                fill={INK}
                fillOpacity="0.55"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs font-medium text-ink/70">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: GREEN_LIGHT }}
          />
          Tryout Kilat
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: GREEN_DARK }}
          />
          Tryout Akbar
        </span>
      </div>
      {total === 0 && (
        <p className="mt-1 text-xs text-ink/50">
          Belum ada tryout yang selesai 7 hari terakhir.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Grafik donat: Gratis vs Premium                                     */
/* ------------------------------------------------------------------ */

export function DonutChart({
  premium,
  gratis,
}: {
  premium: number
  gratis: number
}) {
  const total = premium + gratis
  const size = 200
  const stroke = 28
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const premiumFrac = total > 0 ? premium / total : 0
  const premiumLen = premiumFrac * circumference
  const premiumPct = total > 0 ? Math.round(premiumFrac * 100) : 0
  const gratisPct = total > 0 ? 100 - premiumPct : 0

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-44 w-44 shrink-0"
        role="img"
        aria-label={`Grafik gratis vs premium. Premium ${premium} user, gratis ${gratis} user, total ${total} user.`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={total > 0 ? GREEN_PALE : GRID}
          strokeWidth={stroke}
        />
        {premium > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={GREEN_DARK}
            strokeWidth={stroke}
            strokeDasharray={`${premiumLen} ${circumference - premiumLen}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        <text
          x={size / 2}
          y={size / 2 - 4}
          textAnchor="middle"
          fontSize="30"
          fontWeight="800"
          fill={INK}
        >
          {total}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 18}
          textAnchor="middle"
          fontSize="12"
          fill={INK}
          fillOpacity="0.55"
        >
          user
        </text>
      </svg>
      <div className="min-w-40 flex-1 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 font-medium">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: GREEN_DARK }}
            />
            Premium
          </span>
          <span className="font-bold">
            {premium} user · {premiumPct}%
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 font-medium">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: GREEN_PALE }}
            />
            Gratis
          </span>
          <span className="font-bold">
            {gratis} user · {gratisPct}%
          </span>
        </div>
        {total === 0 && (
          <p className="text-xs text-ink/50">Belum ada user terdaftar.</p>
        )}
      </div>
    </div>
  )
}
