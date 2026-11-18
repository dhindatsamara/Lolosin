/**
 * Peta kelemahan (v2.8.1): wrapper di atas AdventureMap.
 *
 * Premium: peta petualangan interaktif + panel detail node yang
 * dipilih (akurasi, jumlah jawaban, label level, tombol latihan
 * yang disarankan). Node terpilih defaultnya subtopik terlemah,
 * jadi info "fokus utama" langsung kelihatan tanpa kartu terpisah;
 * bubble Osi di peta juga sudah menyebut subtopik terlemah.
 *
 * Free (locked): peta terkunci yang sama tanpa angka (lihat
 * AdventureMap) + ajakan upgrade ditangani halaman; klik node
 * mengarah ke upgradeTo. Tidak ada angka di mode ini.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adventureNodeKey } from '../lib/adventureMap'
import {
  WEAKNESS_LEVEL_LABEL,
  type WeaknessRow,
} from '../lib/weakness'
import { cx } from '../lib/utils'
import { AdventureMap } from './AdventureMap'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { Card } from './ui/Card'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

/** Warna batang + teks persentase per level penguasaan. */
const LEVEL_BAR: Record<WeaknessRow['level'], string> = {
  lemah: 'bg-red-500',
  cukup: 'bg-amber-500',
  kuat: 'bg-primary-600',
}

const LEVEL_TEXT: Record<WeaknessRow['level'], string> = {
  lemah: 'text-red-700',
  cukup: 'text-amber-700',
  kuat: 'text-primary-700',
}

const LEVEL_PILL: Record<WeaknessRow['level'], string> = {
  lemah: 'bg-red-100 text-red-700',
  cukup: 'bg-amber-100 text-amber-700',
  kuat: 'bg-primary-100 text-primary-700',
}

export function WeaknessMap({
  rows,
  weakest,
  locked = false,
  upgradeTo = '/profil',
}: {
  rows: readonly WeaknessRow[]
  weakest: WeaknessRow | null
  /** Mode terkunci untuk akun free (tanpa angka). */
  locked?: boolean
  /** Tujuan saat node terkunci diklik (/profil bila login, /auth bila tamu). */
  upgradeTo?: string
}) {
  const navigate = useNavigate()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  // Default: subtopik terlemah, supaya panel detail langsung
  // menampilkan fokus utama tanpa perlu ketuk apa pun.
  const selected =
    rows.find((r) => adventureNodeKey(r) === selectedKey) ??
    weakest ??
    rows[0] ??
    null

  function startDrill(row: WeaknessRow) {
    navigate('/latihan/jalan', {
      state: { materi: row.materi, subtopik: row.subtopik },
    })
  }

  if (locked) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <section aria-label="Peta petualangan terkunci">
          <h2 className="mb-2 font-display text-base font-extrabold">
            Peta petualanganmu
          </h2>
          <p className="mb-3 text-xs leading-relaxed font-medium text-ink/60">
            Jalannya masih terkunci. Ketuk node mana pun untuk melihat
            cara membuka peta lengkap.
          </p>
          <Card padding="none" className="overflow-hidden bg-[#FBF6EC]">
            <AdventureMap
              rows={rows}
              weakest={null}
              locked
              selectedKey={null}
              onSelect={() => {}}
              onLockedNodeClick={() => navigate(upgradeTo)}
            />
          </Card>
        </section>
      </div>
    )
  }

  const percent = selected ? Math.round(selected.accuracy * 100) : 0

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card padding="none" className="overflow-hidden bg-[#FBF6EC]">
        <AdventureMap
          rows={rows}
          weakest={weakest}
          locked={false}
          selectedKey={selected ? adventureNodeKey(selected) : null}
          onSelect={(row) => setSelectedKey(adventureNodeKey(row))}
          onLockedNodeClick={() => {}}
        />
      </Card>

      {/* Panel detail node yang dipilih. */}
      {selected && (
        <Card aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-extrabold break-words">
                  {selected.subtopik}
                </span>
                <Badge tone={MATERI_TONE[selected.materi]}>
                  {selected.materi}
                </Badge>
                <span
                  className={cx(
                    'rounded-full px-2.5 py-0.5 text-xs font-bold',
                    LEVEL_PILL[selected.level],
                  )}
                >
                  {WEAKNESS_LEVEL_LABEL[selected.level]}
                </span>
              </p>
              <p className="mt-1 text-xs font-medium text-ink/60">
                {selected.correct} benar dari {selected.total} jawaban
                {selected.sampleSmall
                  ? ' · data masih sedikit, latih dulu biar gambarannya makin jelas'
                  : ''}
              </p>
            </div>
            <p
              className={cx(
                'shrink-0 font-display text-3xl font-extrabold tabular-nums',
                LEVEL_TEXT[selected.level],
              )}
            >
              {percent}%
            </p>
          </div>
          <div
            role="img"
            aria-label={`Akurasi ${selected.subtopik}: ${percent} persen`}
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink/10"
          >
            <div
              className={cx('h-full rounded-full', LEVEL_BAR[selected.level])}
              style={{ width: `${percent}%` }}
            />
          </div>
          <Button
            size="sm"
            className="mt-3.5"
            onClick={() => startDrill(selected)}
          >
            Latihan yang disarankan
          </Button>
        </Card>
      )}
    </div>
  )
}
