import { useEffect, useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Mascot } from '../components/Mascot'
import { ChevronRightIcon, InfoIcon } from '../components/icons'
import {
  FORMASI_CONTOH,
  IS_DATA_CONTOH,
  SSCASN_URL,
  formatGajiSingkat,
  type Formasi,
  type JenisInstansi,
} from '../data/formasi-contoh'

const SEMUA = 'semua'

/** Formasi per halaman (poin 5, v2.5): 34 formasi contoh jadi 2 halaman. */
const PER_HALAMAN = 18

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
 * Satu kartu formasi, compact (poin 5, v2.5): padding kecil, teks
 * dipadatkan, hanya field esensial: jabatan, instansi, jumlah
 * formasi, lokasi, pendidikan, gaji, plus tautan pengumuman resmi.
 * Tanpa lipatan detail lagi, semua esensial langsung terlihat.
 *
 * Batas waktu: data contoh tidak punya kolom batas waktu (lihat
 * data/formasi-contoh.ts), jadi tidak ada tanggal yang ditampilkan
 * (tanggal karangan akan menyesatkan). Batas waktu ada di pengumuman
 * resmi, makanya tautan SSCASN-nya diberi label yang menyebutnya.
 */
function KartuFormasi({ formasi }: { formasi: Formasi }) {
  return (
    <article className="flex h-full flex-col rounded-2xl border border-line bg-white p-3.5 shadow-soft">
      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone={formasi.jenisInstansi === 'pusat' ? 'green' : 'amber'}>
          {formasi.jenisInstansi === 'pusat'
            ? 'Instansi pusat'
            : 'Instansi daerah'}
        </Badge>
        <Badge tone="neutral">{formasi.provinsi}</Badge>
      </span>
      <span className="mt-2 font-display text-base leading-snug font-extrabold">
        {formasi.jabatan}
      </span>
      <span className="mt-0.5 text-xs leading-snug font-semibold text-ink/70">
        {formasi.instansi}
      </span>
      <span className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-dashed border-line pt-2.5 text-xs">
        <span>
          <span className="block text-[11px] font-semibold text-ink/50">
            Formasi
          </span>
          <span className="font-bold">
            {formasi.kuota.toLocaleString('id-ID')} formasi
          </span>
        </span>
        <span>
          <span className="block text-[11px] font-semibold text-ink/50">
            Lokasi
          </span>
          <span className="font-bold">{formasi.kotaKab}</span>
        </span>
        <span>
          <span className="block text-[11px] font-semibold text-ink/50">
            Pendidikan
          </span>
          <span className="font-bold">{formasi.kualifikasi}</span>
        </span>
        <span>
          <span className="block text-[11px] font-semibold text-ink/50">
            Gaji
          </span>
          <span className="font-bold">
            {formatGajiSingkat(formasi.gajiMin)} -{' '}
            {formatGajiSingkat(formasi.gajiMax)}
          </span>
        </span>
      </span>
      <a
        href={SSCASN_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-auto inline-flex items-center gap-1 pt-2.5 text-xs font-extrabold text-primary-700 underline-offset-2 hover:underline"
      >
        Pengumuman resmi &amp; batas waktu di SSCASN
        <ChevronRightIcon width={14} height={14} />
      </a>
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
  const [halaman, setHalaman] = useState(1)

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
  }

  // Ganti filter apa pun kembali ke halaman 1, supaya tidak terjebak
  // di halaman yang sudah tidak ada setelah hasil menyusut.
  useEffect(() => {
    setHalaman(1)
  }, [cari, provinsi, kualifikasi, gajiMin, instansi, jenis])

  const totalHalaman = Math.max(
    1,
    Math.ceil(hasil.length / PER_HALAMAN),
  )
  const halamanAktif = Math.min(halaman, totalHalaman)
  const awal = hasil.length === 0 ? 0 : (halamanAktif - 1) * PER_HALAMAN + 1
  const akhir = Math.min(halamanAktif * PER_HALAMAN, hasil.length)
  const tampil = hasil.slice(
    (halamanAktif - 1) * PER_HALAMAN,
    halamanAktif * PER_HALAMAN,
  )

  function pindahHalaman(nomor: number) {
    setHalaman(nomor)
    document
      .getElementById('formasi-hasil')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
      <div
        id="formasi-hasil"
        className="flex flex-wrap items-center justify-between gap-3 scroll-mt-24"
      >
        <p className="text-sm font-bold" aria-live="polite">
          {hasil.length === 0
            ? 'Menampilkan 0 formasi'
            : `Menampilkan ${awal}–${akhir} dari ${hasil.length} formasi`}
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
        <>
          <div
            aria-label="Daftar formasi"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {tampil.map((f) => (
              <KartuFormasi key={f.id} formasi={f} />
            ))}
          </div>

          {/* Pagination: prev/next + nomor halaman, muncul bila hasil
              lebih dari satu halaman. */}
          {totalHalaman > 1 && (
            <nav
              aria-label="Halaman formasi"
              className="flex flex-wrap items-center justify-center gap-2"
            >
              {/* Ikon saja (v2.6): chevron tanpa teks, aria-label
                  menjelaskan tujuannya. Tetap disabled di halaman
                  pertama. */}
              <Button
                variant="outline"
                size="sm"
                disabled={halamanAktif === 1}
                onClick={() => pindahHalaman(halamanAktif - 1)}
                aria-label="Halaman sebelumnya"
                className="px-2.5 text-base leading-none"
              >
                <span aria-hidden="true">‹</span>
              </Button>
              {Array.from({ length: totalHalaman }, (_, i) => i + 1).map(
                (nomor) => (
                  <button
                    key={nomor}
                    type="button"
                    onClick={() => pindahHalaman(nomor)}
                    aria-current={
                      nomor === halamanAktif ? 'page' : undefined
                    }
                    aria-label={`Halaman ${nomor}`}
                    className={
                      nomor === halamanAktif
                        ? 'rounded-xl border border-primary-600 bg-primary-600 px-3 py-1.5 text-sm font-extrabold text-white'
                        : 'rounded-xl border border-line bg-white px-3 py-1.5 text-sm font-extrabold text-ink hover:border-primary-300 hover:text-primary-700'
                    }
                  >
                    {nomor}
                  </button>
                ),
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={halamanAktif === totalHalaman}
                onClick={() => pindahHalaman(halamanAktif + 1)}
                aria-label="Halaman berikutnya"
                className="px-2.5 text-base leading-none"
              >
                <span aria-hidden="true">›</span>
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
