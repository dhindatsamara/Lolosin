import { useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Mascot } from '../components/Mascot'
import { ChevronRightIcon, InfoIcon } from '../components/icons'
import {
  FORMASI_CONTOH,
  IS_DATA_CONTOH,
  SSCASN_URL,
  formatGajiLengkap,
  formatGajiSingkat,
  type Formasi,
  type JenisInstansi,
} from '../data/formasi-contoh'
import { cx } from '../lib/utils'

const SEMUA = 'semua'

/** Pilihan filter gaji minimal (batas bawah rentang gaji, rupiah). */
const PILIHAN_GAJI = [
  { label: 'Semua gaji', nilai: 0 },
  { label: 'Rp3 jt ke atas', nilai: 3_000_000 },
  { label: 'Rp4 jt ke atas', nilai: 4_000_000 },
  { label: 'Rp5 jt ke atas', nilai: 5_000_000 },
  { label: 'Rp6 jt ke atas', nilai: 6_000_000 },
  { label: 'Rp7 jt ke atas', nilai: 7_000_000 },
] as const

function nilaiUnik<T>(items: Formasi[], ambil: (f: Formasi) => T): T[] {
  return [...new Set(items.map(ambil))].sort((a, b) =>
    String(a).localeCompare(String(b), 'id-ID'),
  )
}

const KELAS_SELECT =
  'w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600'

function LabelFilter({
  htmlFor,
  children,
}: {
  htmlFor: string
  children: string
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-xs font-extrabold tracking-wide text-ink/70 uppercase"
    >
      {children}
    </label>
  )
}

/**
 * Satu kartu formasi. Kepala kartu adalah tombol (aria-expanded) yang
 * membuka detail lengkap: unit penempatan, kualifikasi, kuota, dan
 * rentang gaji lengkap plus tautan pengumuman resmi di SSCASN.
 */
function KartuFormasi({
  formasi,
  terbuka,
  onToggle,
}: {
  formasi: Formasi
  terbuka: boolean
  onToggle: () => void
}) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-line bg-white shadow-soft">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={terbuka}
        className="flex flex-1 flex-col gap-2 rounded-2xl p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 lg:p-5"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={formasi.jenisInstansi === 'pusat' ? 'green' : 'amber'}>
            {formasi.jenisInstansi === 'pusat'
              ? 'Instansi pusat'
              : 'Instansi daerah'}
          </Badge>
          <Badge tone="neutral">{formasi.provinsi}</Badge>
        </span>
        <span className="font-display text-lg leading-snug font-extrabold">
          {formasi.jabatan}
        </span>
        <span className="text-sm leading-snug font-semibold text-ink/70">
          {formasi.instansi}
        </span>
        <span className="mt-1 grid grid-cols-2 gap-2 border-t border-dashed border-line pt-3 text-sm">
          <span>
            <span className="block text-xs font-semibold text-ink/50">
              Penempatan
            </span>
            <span className="font-bold">
              {formasi.kotaKab}, {formasi.provinsi}
            </span>
          </span>
          <span>
            <span className="block text-xs font-semibold text-ink/50">
              Kuota
            </span>
            <span className="font-bold">
              {formasi.kuota.toLocaleString('id-ID')} orang
            </span>
          </span>
          <span>
            <span className="block text-xs font-semibold text-ink/50">
              Gaji
            </span>
            <span className="font-bold">
              {formatGajiSingkat(formasi.gajiMin)} -{' '}
              {formatGajiSingkat(formasi.gajiMax)}
            </span>
          </span>
          <span>
            <span className="block text-xs font-semibold text-ink/50">
              Kualifikasi
            </span>
            <span className="font-bold">{formasi.kualifikasi}</span>
          </span>
        </span>
        <span className="mt-1 inline-flex items-center gap-1 text-sm font-extrabold text-primary-700">
          {terbuka ? 'Tutup detail' : 'Lihat detail'}
          <ChevronRightIcon
            width={16}
            height={16}
            className={cx(
              'transition-transform',
              terbuka && 'rotate-90',
            )}
          />
        </span>
      </button>
      {terbuka && (
        <div className="border-t border-line bg-paper px-4 py-3.5 lg:px-5">
          <dl className="space-y-1.5 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-ink/60">Unit penempatan:</dt>
              <dd className="font-bold">{formasi.unitPenempatan}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold text-ink/60">Rentang gaji:</dt>
              <dd className="font-bold">
                {formatGajiLengkap(formasi.gajiMin)} -{' '}
                {formatGajiLengkap(formasi.gajiMax)} per bulan
              </dd>
            </div>
          </dl>
          <p className="mt-2 text-xs leading-relaxed font-medium text-ink/60">
            Rentang gaji di atas adalah angka contoh, bukan angka resmi.
            Cek pengumuman resmi instansi sebelum mendaftar.
          </p>
          <a
            href={SSCASN_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-sm font-extrabold text-primary-700 underline-offset-2 hover:underline"
          >
            Lihat pengumuman resmi di SSCASN
            <ChevronRightIcon width={16} height={16} />
          </a>
        </div>
      )}
    </article>
  )
}

export function FormasiPage() {
  const [cari, setCari] = useState('')
  const [provinsi, setProvinsi] = useState(SEMUA)
  const [kualifikasi, setKualifikasi] = useState(SEMUA)
  const [gajiMin, setGajiMin] = useState(0)
  const [instansi, setInstansi] = useState(SEMUA)
  const [jenis, setJenis] = useState<JenisInstansi | typeof SEMUA>(SEMUA)
  const [terbukaId, setTerbukaId] = useState<string | null>(null)

  const daftarProvinsi = useMemo(
    () => nilaiUnik(FORMASI_CONTOH, (f) => f.provinsi),
    [],
  )
  const daftarKualifikasi = useMemo(
    () => nilaiUnik(FORMASI_CONTOH, (f) => f.kualifikasi),
    [],
  )
  const daftarInstansi = useMemo(
    () => nilaiUnik(FORMASI_CONTOH, (f) => f.instansi),
    [],
  )

  const filterAktif =
    cari.trim() !== '' ||
    provinsi !== SEMUA ||
    kualifikasi !== SEMUA ||
    gajiMin > 0 ||
    instansi !== SEMUA ||
    jenis !== SEMUA

  const hasil = useMemo(() => {
    const kata = cari.trim().toLowerCase()
    return FORMASI_CONTOH.filter((f) => {
      if (kata) {
        const cocok =
          f.jabatan.toLowerCase().includes(kata) ||
          f.instansi.toLowerCase().includes(kata) ||
          f.unitPenempatan.toLowerCase().includes(kata)
        if (!cocok) return false
      }
      if (provinsi !== SEMUA && f.provinsi !== provinsi) return false
      if (kualifikasi !== SEMUA && f.kualifikasi !== kualifikasi) return false
      if (gajiMin > 0 && f.gajiMin < gajiMin) return false
      if (instansi !== SEMUA && f.instansi !== instansi) return false
      if (jenis !== SEMUA && f.jenisInstansi !== jenis) return false
      return true
    })
  }, [cari, provinsi, kualifikasi, gajiMin, instansi, jenis])

  function resetFilter() {
    setCari('')
    setProvinsi(SEMUA)
    setKualifikasi(SEMUA)
    setGajiMin(0)
    setInstansi(SEMUA)
    setJenis(SEMUA)
    setTerbukaId(null)
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="kicker">cari formasi impianmu</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">
          Formasi CPNS
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink/60">
          CPNS 2026 dibuka November ini, sekitar 160 ribu formasi. Cari
          jabatan yang cocok dengan jurusanmu, lalu filter berdasarkan
          wilayah, gaji, dan instansi.
        </p>
      </header>

      {/* Banner beta + data contoh. Sengaja mencolok dan eksplisit:
          pengguna tidak boleh mengira data contoh ini formasi resmi. */}
      {IS_DATA_CONTOH && (
        <Card className="border-accent-200 bg-accent-50 p-5" role="note">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="amber">BETA</Badge>
            <Badge tone="amber">Data contoh</Badge>
            <span className="font-display text-base font-extrabold">
              Menu ini masih versi beta
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed font-medium text-ink/70">
            Formasi di bawah ini adalah <strong>data contoh</strong> untuk
            melihat cara kerja menu, <strong>bukan formasi resmi 2026</strong>.
            Rincian formasi resmi belum diumumkan BKN; begitu diumumkan,
            datanya akan diganti dengan data resmi dan label ini hilang.
          </p>
          <p className="mt-2 flex items-start gap-1.5 text-sm leading-relaxed font-medium text-ink/70">
            <InfoIcon
              width={16}
              height={16}
              className="mt-0.5 shrink-0 text-accent-700"
            />
            <span>
              Satu-satunya portal resmi seleksi CPNS adalah{' '}
              <a
                href={SSCASN_URL}
                target="_blank"
                rel="noreferrer"
                className="font-extrabold text-primary-700 underline-offset-2 hover:underline"
              >
                sscasn.bkn.go.id
              </a>
              . Hati-hati situs palsu yang mirip (mis. sacasn, ssacsn,
              atau scasn) dan jangan pernah memasukkan NIK atau nomor KK
              di situs yang bukan SSCASN.
            </span>
          </p>
        </Card>
      )}

      {/* Filter */}
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-1">
            <LabelFilter htmlFor="formasi-cari">
              Cari jabatan atau instansi
            </LabelFilter>
            <input
              id="formasi-cari"
              type="search"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Mis. analis, dokter, Kemenkeu"
              className="w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm font-bold placeholder:font-medium placeholder:text-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
            />
          </div>
          <div>
            <LabelFilter htmlFor="formasi-provinsi">Wilayah</LabelFilter>
            <select
              id="formasi-provinsi"
              value={provinsi}
              onChange={(e) => setProvinsi(e.target.value)}
              className={KELAS_SELECT}
            >
              <option value={SEMUA}>Semua provinsi</option>
              {daftarProvinsi.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <LabelFilter htmlFor="formasi-kualifikasi">
              Jurusan / kualifikasi
            </LabelFilter>
            <select
              id="formasi-kualifikasi"
              value={kualifikasi}
              onChange={(e) => setKualifikasi(e.target.value)}
              className={KELAS_SELECT}
            >
              <option value={SEMUA}>Semua kualifikasi</option>
              {daftarKualifikasi.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <LabelFilter htmlFor="formasi-gaji">Gaji minimal</LabelFilter>
            <select
              id="formasi-gaji"
              value={gajiMin}
              onChange={(e) => setGajiMin(Number(e.target.value))}
              className={KELAS_SELECT}
            >
              {PILIHAN_GAJI.map((p) => (
                <option key={p.nilai} value={p.nilai}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <LabelFilter htmlFor="formasi-instansi">Instansi</LabelFilter>
            <select
              id="formasi-instansi"
              value={instansi}
              onChange={(e) => setInstansi(e.target.value)}
              className={KELAS_SELECT}
            >
              <option value={SEMUA}>Semua instansi</option>
              {daftarInstansi.map((nama) => (
                <option key={nama} value={nama}>
                  {nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <LabelFilter htmlFor="formasi-jenis">Jenis instansi</LabelFilter>
            <select
              id="formasi-jenis"
              value={jenis}
              onChange={(e) =>
                setJenis(e.target.value as JenisInstansi | typeof SEMUA)
              }
              className={KELAS_SELECT}
            >
              <option value={SEMUA}>Pusat dan daerah</option>
              <option value="pusat">Instansi pusat</option>
              <option value="daerah">Instansi daerah</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Jumlah hasil + reset */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold" aria-live="polite">
          Menampilkan {hasil.length} dari {FORMASI_CONTOH.length} formasi
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={resetFilter}
          disabled={!filterAktif}
        >
          Reset filter
        </Button>
      </div>

      {/* Daftar hasil / empty state */}
      {hasil.length === 0 ? (
        <Card className="p-6 text-center">
          <Mascot mood="semangat" size={72} className="mx-auto" />
          <p className="mt-2 font-display text-lg font-extrabold">
            Nggak ada formasi yang cocok
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink/60">
            Coba longgarkan filternya, mis. ganti wilayah atau hapus kata
            pencarian, lalu lihat lagi.
          </p>
          <Button variant="outline" className="mt-4" onClick={resetFilter}>
            Reset filter
          </Button>
        </Card>
      ) : (
        <div
          aria-label="Daftar formasi"
          className="grid gap-4 lg:grid-cols-2"
        >
          {hasil.map((f) => (
            <KartuFormasi
              key={f.id}
              formasi={f}
              terbuka={terbukaId === f.id}
              onToggle={() =>
                setTerbukaId(terbukaId === f.id ? null : f.id)
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
