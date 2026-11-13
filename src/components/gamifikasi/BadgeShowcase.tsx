import { BADGES } from '../../lib/badges'
import { useStore } from '../../lib/store'
import { cx } from '../../lib/utils'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { CheckIcon } from '../icons'

const BULAN_SINGKAT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
]

/** "2026-11-13" menjadi "13 Nov 2026". */
function formatTanggalRaih(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d || m < 1 || m > 12) return iso
  return `${d} ${BULAN_SINGKAT[m - 1]} ${y}`
}

/**
 * Showcase lencana pencapaian: yang sudah diraih tampil berwarna lengkap
 * dengan tanggal raih, yang belum diraih tampil redup beserta syaratnya.
 */
export function BadgeShowcase() {
  const { badges } = useStore()
  const diraih = new Map(badges.map((b) => [b.id, b.date]))

  return (
    <section aria-label="Lencana pencapaian">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="font-script text-2xl leading-none text-primary-700">
            koleksi pencapaianmu
          </p>
          <h2 className="mt-1 font-display text-xl font-extrabold">
            Lencana
          </h2>
        </div>
        <Badge tone="amber" className="shrink-0">
          {badges.length}/{BADGES.length} diraih
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {BADGES.map((def) => {
          const tanggal = diraih.get(def.id)
          const earned = tanggal !== undefined
          return (
            <Card
              key={def.id}
              className={cx(
                'flex flex-col items-center gap-1 p-4 text-center',
                earned ? 'bg-accent-50' : 'bg-white opacity-70',
              )}
            >
              <span
                className={cx(
                  'flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-ink text-2xl',
                  earned ? 'bg-accent-400' : 'bg-ink/5 grayscale',
                )}
                aria-hidden="true"
              >
                {def.ikon}
              </span>
              <span className="mt-1 font-display text-sm leading-snug font-extrabold">
                {def.nama}
              </span>
              <span className="text-xs leading-snug font-medium text-ink/60">
                {def.deskripsi}
              </span>
              {earned ? (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full border-2 border-ink bg-primary-100 px-2 py-0.5 text-[11px] font-extrabold text-primary-700">
                  <CheckIcon width={11} height={11} />
                  Diraih {formatTanggalRaih(tanggal)}
                </span>
              ) : (
                <span className="mt-1 rounded-full border-2 border-dashed border-ink/30 px-2 py-0.5 text-[11px] font-bold text-ink/50">
                  Belum diraih
                </span>
              )}
            </Card>
          )
        })}
      </div>
    </section>
  )
}
