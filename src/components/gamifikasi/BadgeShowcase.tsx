import { useState } from 'react'
import { BADGES } from '../../lib/badges'
import { useStore } from '../../lib/store'
import { cx } from '../../lib/utils'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
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

/** Chip lencana yang ditampilkan di strip ringkas (maksimal 6). */
const MAX_CHIP_TAMPIL = 6

/**
 * Showcase lencana pencapaian, dipadatkan (v2.4): saat tertutup hanya
 * strip ringkas setinggi maksimal sekitar 2 baris (lencana yang diraih
 * sebagai chip kecil + tombol "Lihat semua"). Tombol mengembang ke
 * grid penuh di tempat: yang sudah diraih tampil berwarna lengkap
 * dengan tanggal raih, yang belum diraih tampil redup beserta
 * syaratnya.
 */
export function BadgeShowcase() {
  const { badges } = useStore()
  const [terbuka, setTerbuka] = useState(false)
  const diraih = new Map(badges.map((b) => [b.id, b.date]))
  const daftarDiraih = BADGES.filter((def) => diraih.has(def.id))
  const chipTampil = daftarDiraih.slice(0, MAX_CHIP_TAMPIL)
  const sisaChip = daftarDiraih.length - chipTampil.length

  return (
    <section aria-label="Lencana pencapaian">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="kicker">koleksi pencapaianmu</p>
          <h2 className="mt-1 font-display text-xl font-extrabold">
            Lencana
          </h2>
        </div>
        <Badge tone="amber" className="shrink-0">
          {badges.length}/{BADGES.length} diraih
        </Badge>
      </div>
      {terbuka ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
                      'flex h-12 w-12 items-center justify-center rounded-2xl text-2xl',
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
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-extrabold text-primary-700">
                      <CheckIcon width={11} height={11} />
                      Diraih {formatTanggalRaih(tanggal)}
                    </span>
                  ) : (
                    <span className="mt-1 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-bold text-ink/50">
                      Belum diraih
                    </span>
                  )}
                </Card>
              )
            })}
          </div>
          <div className="mt-3 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTerbuka(false)}
              aria-expanded={true}
            >
              Tutup
            </Button>
          </div>
        </>
      ) : (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            {daftarDiraih.length === 0 ? (
              <p className="text-sm font-medium text-ink/60">
                Belum ada lencana diraih. Gas belajar biar koleksimu
                nambah.
              </p>
            ) : (
              <>
                {chipTampil.map((def) => (
                  <span
                    key={def.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-2.5 py-1 text-xs font-extrabold"
                  >
                    <span aria-hidden="true">{def.ikon}</span>
                    {def.nama}
                  </span>
                ))}
                {sisaChip > 0 && (
                  <span className="inline-flex items-center rounded-full bg-ink/5 px-2.5 py-1 text-xs font-extrabold text-ink/60">
                    +{sisaChip} lagi
                  </span>
                )}
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTerbuka(true)}
              aria-expanded={false}
              className="ml-auto"
            >
              Lihat semua
            </Button>
          </div>
        </Card>
      )}
    </section>
  )
}
