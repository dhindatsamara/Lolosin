/**
 * Peta petualangan kelemahan (v2.8.1): tiap subtopik jadi satu node
 * di sepanjang jalur berliku (SVG murni, tanpa dependensi baru),
 * dengan Osi sebagai pemandu di awal jalur.
 *
 * Cara gambar: satu <svg> menggambar jalur putus-putus, lalu node
 * berupa <button> HTML yang diposisikan absolut di atasnya dengan
 * persen, supaya tetap bisa diklik, difokus keyboard, dan dibaca
 * screen reader. Label nama subtopik + badge materi ada di bawah
 * tiap node.
 *
 * Warna node ikut level (premium saja): lemah merah, cukup amber,
 * kuat hijau primer. Node terlemah paling besar + ring + penanda
 * "Mulai dari sini". Node sampel kecil sedikit lebih kecil.
 *
 * Mode terkunci (akun free): semua node abu-abu netral dengan ikon
 * gembok, ukuran seragam, TANPA angka dan TANPA warna yang
 * membocorkan level. Nama subtopik tetap terlihat, klik node
 * mengarah ke upgrade lewat onLockedNodeClick.
 */
import { useMemo } from 'react'
import {
  ADVENTURE_MAP_WIDTH,
  ADVENTURE_OSI_Y,
  adventureMapHeight,
  adventureNodeKey,
  adventureNodePosition,
  adventureNodeXFrac,
  adventurePathD,
  guideMessage,
} from '../lib/adventureMap'
import { MASCOT_NAME } from '../lib/mascot'
import {
  WEAKNESS_LEVEL_LABEL,
  type WeaknessRow,
} from '../lib/weakness'
import { cx } from '../lib/utils'
import { Mascot } from './Mascot'
import { Badge } from './ui/Badge'
import { LockIcon, TargetIcon } from './icons'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

/** Warna node per level penguasaan (premium saja). */
const LEVEL_BG: Record<WeaknessRow['level'], string> = {
  lemah: 'bg-red-500',
  cukup: 'bg-amber-500',
  kuat: 'bg-primary-600',
}

/**
 * Diameter node dalam px. Terlemah paling besar, sampel kecil lebih
 * kecil, sisanya standar. Mode terkunci selalu seragam supaya tidak
 * membocorkan apa pun lewat ukuran.
 */
function nodeDiameter(
  row: WeaknessRow,
  isWeakest: boolean,
  locked: boolean,
): number {
  if (locked) return 52
  if (isWeakest) return 64
  if (row.sampleSmall) return 44
  return 52
}

export interface AdventureMapProps {
  rows: readonly WeaknessRow[]
  /** Subtopik terlemah (null di mode terkunci). */
  weakest: WeaknessRow | null
  /** Mode terkunci untuk akun free. */
  locked: boolean
  /** Kunci node yang sedang terpilih (premium saja). */
  selectedKey: string | null
  /** Dipanggil saat node premium diklik. */
  onSelect: (row: WeaknessRow) => void
  /** Dipanggil saat node terkunci diklik. */
  onLockedNodeClick: () => void
}

export function AdventureMap({
  rows,
  weakest,
  locked,
  selectedKey,
  onSelect,
  onLockedNodeClick,
}: AdventureMapProps) {
  const height = adventureMapHeight(rows.length)
  const pathD = useMemo(() => adventurePathD(rows.length), [rows.length])
  const allStrong = rows.length > 0 && rows.every((r) => r.level === 'kuat')
  const weakestKey = weakest ? adventureNodeKey(weakest) : null
  const guide = useMemo(
    () => guideMessage({ locked, allStrong, weakest }),
    [locked, allStrong, weakest],
  )

  // Osi berdiri di atas node pertama (paling lemah di mode premium).
  const osiXFrac = adventureNodeXFrac(0)
  const osiOnLeft = osiXFrac < 0.5

  // Posisi vertikal dalam persen tinggi container (container ikut
  // tinggi SVG, jadi persen viewBox tetap sejajar di semua lebar).
  const topPct = (y: number) => `${(y / height) * 100}%`

  return (
    <div
      className="relative"
      role="group"
      aria-label={
        locked
          ? 'Peta petualangan kelemahanmu, terkunci untuk akun free'
          : 'Peta petualangan kelemahanmu'
      }
    >
      <svg
        viewBox={`0 0 ${ADVENTURE_MAP_WIDTH} ${height}`}
        className="block h-auto w-full"
        aria-hidden="true"
      >
        {/* Alas jalur yang lembut + jejak titik di atasnya. */}
        <path
          d={pathD}
          fill="none"
          stroke="#F1EBDD"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d={pathD}
          fill="none"
          stroke="#D8D0BE"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="0.1 12"
        />
      </svg>

      <div className="absolute inset-0">
        {/* Osi pemandu di awal jalur. */}
        <div
          className="absolute"
          style={{
            left: `${osiXFrac * 100}%`,
            top: topPct(ADVENTURE_OSI_Y),
            transform: 'translate(-50%, -50%)',
          }}
        >
          <Mascot mood={guide.mood} size={64} />
        </div>

        {/* Bubble ucapan Osi, di sampingnya menghadap ke arah luar. */}
        <div
          className="absolute"
          style={{
            top: topPct(14),
            ...(osiOnLeft
              ? {
                  left: `calc(${osiXFrac * 100}% + 42px)`,
                  right: '10px',
                }
              : {
                  right: `calc(${(1 - osiXFrac) * 100}% + 42px)`,
                  left: '10px',
                }),
          }}
        >
          <div className="relative rounded-2xl border border-line bg-white px-3 py-2 shadow-soft">
            <span
              aria-hidden="true"
              className={cx(
                'absolute top-4 h-3 w-3 rotate-45 border-line bg-white',
                osiOnLeft
                  ? '-left-[7px] border-b border-l'
                  : '-right-[7px] border-r border-t',
              )}
            />
            <p className="text-[11px] font-extrabold text-primary-700">
              {MASCOT_NAME}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug font-medium">
              {guide.text}
            </p>
          </div>
        </div>

        {rows.map((row, index) => {
          const pos = adventureNodePosition(index)
          const key = adventureNodeKey(row)
          const isWeakest = !locked && key === weakestKey
          const isSelected = !locked && key === selectedKey
          const diameter = nodeDiameter(row, isWeakest, locked)
          const radius = diameter / 2
          const percent = Math.round(row.accuracy * 100)
          const xFrac = adventureNodeXFrac(index)

          return (
            <div key={key}>
              {/* Penanda node terlemah (premium saja). Sembunyi saat semua kuat. */}
              {isWeakest && !allStrong && (
                <div
                  className="absolute z-10"
                  style={{
                    left: `${xFrac * 100}%`,
                    top: topPct(pos.y - radius - 16),
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-extrabold whitespace-nowrap text-white shadow-md">
                    <TargetIcon width={12} height={12} />
                    Mulai dari sini
                  </span>
                </div>
              )}

              {/* Node: tombol asli supaya bisa keyboard + screen reader. */}
              <button
                type="button"
                aria-label={
                  locked
                    ? `${row.subtopik}, ${row.materi}, terkunci untuk akun free`
                    : `${row.subtopik}, ${row.materi}, akurasi ${percent} persen, ${WEAKNESS_LEVEL_LABEL[row.level]}`
                }
                aria-pressed={isSelected}
                onClick={() =>
                  locked ? onLockedNodeClick() : onSelect(row)
                }
                className={cx(
                  'absolute flex items-center justify-center rounded-full border-2 border-white font-display font-extrabold text-white shadow-md transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600',
                  locked
                    ? 'bg-line-strong text-ink/50'
                    : LEVEL_BG[row.level],
                  diameter >= 64
                    ? 'text-base'
                    : diameter >= 52
                      ? 'text-sm'
                      : 'text-xs',
                  isWeakest && !allStrong && 'shadow-lg ring-4 ring-red-200',
                  isSelected && !isWeakest && 'ring-4 ring-primary-900/25',
                )}
                style={{
                  left: `${xFrac * 100}%`,
                  top: topPct(pos.y),
                  width: diameter,
                  height: diameter,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {locked ? (
                  <LockIcon width={20} height={20} />
                ) : (
                  `${percent}%`
                )}
              </button>

              {/* Label nama subtopik + badge materi di bawah node. */}
              <div
                className="pointer-events-none absolute w-[148px] text-center"
                style={{
                  left: `${xFrac * 100}%`,
                  top: topPct(pos.y + radius + 10),
                  transform: 'translateX(-50%)',
                }}
              >
                <p className="text-xs leading-tight font-extrabold break-words">
                  {row.subtopik}
                </p>
                <Badge tone={MATERI_TONE[row.materi]} className="mt-1">
                  {row.materi}
                </Badge>
              </div>
            </div>
          )
        })}
      </div>

      {/* Konteks arah jalur untuk screen reader (premium saja,
          supaya mode terkunci tidak membocorkan urutan). */}
      {!locked && rows.length > 1 && (
        <span className="sr-only">
          Node pertama di jalur ini adalah subtopik terlemahmu, node
          terakhir adalah subtopik terkuatmu.
        </span>
      )}
    </div>
  )
}
