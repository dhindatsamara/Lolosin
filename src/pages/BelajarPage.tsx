import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { GuestProgressWarning } from '../components/GuestProgressWarning'
import { Mascot } from '../components/Mascot'
import { StickyBackButton } from '../components/belajar/StickyBackButton'
import { CheckIcon, ChevronRightIcon } from '../components/icons'
import { MateriMotifMini, MateriWatermark } from '../components/motifs'
import {
  getCheatSheetGroupByMateri,
  getMateriGroupsByMateri,
  groupReadProgress,
  isCheatSheetGroup,
  materiReadProgress,
  sortGroupsCheatSheetFirst,
  type MateriGroup,
} from '../lib/materi'
import { MATERI_LIST, MATERI_META, type Materi } from '../lib/questions'
import { MASCOT_NAME } from '../lib/mascot'
import { useStore } from '../lib/store'
import { cx } from '../lib/utils'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

const MATERI_CHIP: Record<Materi, string> = {
  TWK: 'bg-twk-soft text-twk',
  TIU: 'bg-tiu-soft text-tiu',
  TKP: 'bg-tkp-soft text-tkp',
}

/** Warna motif per subtes, dipakai dengan opacity rendah untuk watermark. */
const MATERI_WATERMARK: Record<Materi, string> = {
  TWK: 'text-twk',
  TIU: 'text-tiu',
  TKP: 'text-tkp',
}

/** Strip aksen atas kartu grup: TWK merah, TIU biru, TKP ungu. */
const MATERI_STRIP: Record<Materi, string> = {
  TWK: 'bg-red-600',
  TIU: 'bg-tiu',
  TKP: 'bg-tkp',
}

/**
 * Motif aksen tiap subtes (aksen kecil, bukan kartu full-color):
 * TWK merah putih, TIU logika dan angka, TKP karakter dan kerja sama.
 */
const MATERI_MOTIF: Record<
  Materi,
  { pill: string; pillClass: string }
> = {
  TWK: { pill: 'Merah Putih', pillClass: 'bg-red-50 text-red-700' },
  TIU: { pill: 'Logika & Angka', pillClass: 'bg-tiu-soft text-tiu' },
  TKP: {
    pill: 'Karakter & Kerja Sama',
    pillClass: 'bg-tkp-soft text-tkp',
  },
}

/** Deskripsi singkat statis per grup materi: satu baris, tanpa angka. */
const DESKRIPSI_GRUP: Record<string, string> = {
  'twk-bang-arya':
    'Pembahasan TWK yang enak dibaca, dari dasar sampai paham.',
  'twk-cheat-sheet': 'Kartu ringkas TWK buat hafalan kilat sebelum ujian.',
  'twk-ringkasan':
    'Ringkasan lengkap TWK: Pancasila, UUD 1945, sampai sejarah nasional.',
  'tiu-verbal':
    'Analogi, silogisme, dan penalaran bahasa, plus trik eliminasi.',
  'tiu-handbook-figural':
    'Pola gambar dan bentuk, dilatih sampai mata jeli.',
  'tiu-numerik':
    'Berhitung, deret angka, dan soal cerita, plus hitung cepat.',
  'tiu-modul':
    'Ringkasan TIU dari semua kemampuan, buat pengulangan cepat.',
  'tiu-tabel-pangkat': 'Hafalan pangkat biar hitung cepatmu makin ngebut.',
  'tkp-cheat-sheet':
    'Kartu ringkas TKP: ciri soal dan petunjuk per aspek.',
  'tkp-ringkasan':
    'Ringkasan TKP per aspek, lengkap dengan contoh situasional.',
}

const DESKRIPSI_DEFAULT =
  'Materi buat persiapan SKD, baca dikit-dikit tiap hari.'

/**
 * Deskripsi satu grup: entri khusus dulu, lalu deskripsi generik
 * untuk cheat sheet baru yang belum punya entri (mis. TIU), lalu
 * deskripsi default.
 */
function deskripsiGrup(group: MateriGroup): string {
  const khusus = DESKRIPSI_GRUP[group.id]
  if (khusus) return khusus
  if (isCheatSheetGroup(group)) {
    return `Kartu ringkas ${group.materi} buat hafalan kilat sebelum ujian.`
  }
  return DESKRIPSI_DEFAULT
}

/** Status baca dalam bentuk teks, bukan angka. */
function statusBaca(percent: number): string {
  if (percent >= 100) return 'Selesai dibaca'
  if (percent > 0) return 'Lagi berjalan'
  return 'Belum mulai'
}

/** Strip aksen subtes: TWK merah putih, TIU biru, TKP ungu. */
function MotifStrip({ materi }: { materi: Materi }) {
  if (materi === 'TWK') {
    return (
      <span
        className="flex h-3.5 w-12 flex-col overflow-hidden rounded-full border border-line"
        aria-hidden="true"
      >
        <span className="h-1/2 bg-red-600" />
        <span className="h-1/2 bg-white" />
      </span>
    )
  }
  return (
    <span
      className={cx(
        'block h-1.5 w-12 rounded-full',
        materi === 'TIU' ? 'bg-tiu' : 'bg-tkp',
      )}
      aria-hidden="true"
    />
  )
}

/**
 * Kartu utama satu subtes di halaman Belajar: nama + deskripsi +
 * bar progres visual tanpa angka + petunjuk cheat sheet bila ada.
 * Kartu satu tujuan (single-destination): satu Link membungkus satu
 * <article>, tanpa tombol atau tautan lain di dalamnya.
 */
function SubtesCard({
  materi,
  readSections,
}: {
  materi: Materi
  readSections: string[]
}) {
  const progress = materiReadProgress(materi, readSections)
  const motif = MATERI_MOTIF[materi]
  const cheatSheet = getCheatSheetGroupByMateri(materi)

  return (
    <Link
      to={`/belajar?subtes=${materi.toLowerCase()}`}
      className="block h-full"
    >
      <article className="card-lift reveal relative h-full overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
        <span
          className={cx(
            'absolute inset-x-0 top-0 h-1',
            MATERI_STRIP[materi],
          )}
          aria-hidden="true"
        />
        <MateriWatermark
          materi={materi}
          className={cx(
            'absolute -right-1 bottom-1 h-20 w-28 text-5xl opacity-10',
            MATERI_WATERMARK[materi],
          )}
        />
        <div className="relative z-10 flex h-full flex-col p-5 lg:p-6">
          <MotifStrip materi={materi} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-display text-2xl font-extrabold">
              {materi}
            </span>
            <Badge tone={MATERI_TONE[materi]}>
              {MATERI_META[materi].nama}
            </Badge>
            <span
              className={cx(
                'rounded-full px-2.5 py-0.5 text-xs font-extrabold',
                motif.pillClass,
              )}
            >
              {motif.pill}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-ink/60">
            {MATERI_META[materi].deskripsi}
          </p>
          {cheatSheet && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-accent-700">
              <span aria-hidden="true" className="text-base text-accent-500">
                ★
              </span>
              Termasuk {cheatSheet.judul}
            </p>
          )}
          <div className="mt-auto pt-5">
            <div className="flex items-center gap-3">
              <ProgressBar
                value={progress.read}
                max={progress.total}
                tone={MATERI_TONE[materi]}
                label={`Progres baca ${materi}`}
                className="flex-1"
              />
              <span className="shrink-0 text-xs font-extrabold text-ink/60">
                {statusBaca(progress.percent)}
              </span>
            </div>
            <p className="mt-3 flex items-center gap-1 text-sm font-bold text-primary-600">
              Lihat materi
              <ChevronRightIcon width={16} height={16} aria-hidden="true" />
            </p>
          </div>
        </div>
      </article>
    </Link>
  )
}

/**
 * Kartu satu grup materi: nama + satu baris deskripsi + bar progres
 * visual tanpa angka. Kartu satu tujuan (single-destination): satu
 * Link membungkus satu <article>, tanpa tombol atau tautan lain di
 * dalamnya.
 *
 * `featured` dipakai untuk cheat sheet: kartu lebih besar, aksen
 * amber hemat (border, latar lembut, badge bintang), dan judul
 * lebih besar. Di grid drill-down, kartu featured membentang
 * selebar penuh lewat `className`.
 */
function GroupCard({
  group,
  readSections,
  featured = false,
  className,
}: {
  group: MateriGroup
  readSections: string[]
  featured?: boolean
  className?: string
}) {
  const progress = groupReadProgress(group, readSections)
  const selesai = progress.percent === 100
  const deskripsi = deskripsiGrup(group)

  return (
    <Link to={`/belajar/${group.id}`} className={cx('block h-full', className)}>
      <article
        className={cx(
          'card-lift reveal relative h-full overflow-hidden rounded-2xl border shadow-soft',
          featured ? 'border-accent-300 bg-accent-50' : 'border-line bg-white',
        )}
      >
        <span
          className={cx(
            'absolute inset-x-0 top-0',
            featured ? 'h-1.5 bg-accent-400' : 'h-1',
            !featured && MATERI_STRIP[group.materi],
          )}
          aria-hidden="true"
        />
        <MateriWatermark
          materi={group.materi}
          className={cx(
            'absolute -right-1 bottom-1 text-4xl opacity-10',
            featured ? 'h-20 w-28' : 'h-16 w-24',
            MATERI_WATERMARK[group.materi],
          )}
        />
        <div
          className={cx(
            'relative z-10 flex h-full flex-col',
            featured ? 'p-5 lg:p-6' : 'p-4 lg:p-5',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                className={cx(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-display text-xs font-extrabold',
                  MATERI_CHIP[group.materi],
                )}
                aria-hidden="true"
              >
                {group.materi}
              </span>
              <MateriMotifMini
                materi={group.materi}
                className={MATERI_WATERMARK[group.materi]}
              />
            </span>
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {featured && (
                <Badge tone="amber">
                  <span aria-hidden="true">★</span> Bintang utama
                </Badge>
              )}
              {selesai ? (
                <Badge tone="green">
                  <CheckIcon width={12} height={12} className="mr-1" />
                  Selesai
                </Badge>
              ) : (
                <span className="mt-1 shrink-0 text-xs font-bold text-ink/50">
                  {progress.read > 0 ? 'Lanjut baca' : 'Mulai baca'}
                </span>
              )}
            </span>
          </div>
          <h3
            className={cx(
              'mt-3 font-display font-extrabold leading-snug',
              featured && 'text-lg lg:text-xl',
            )}
          >
            {group.judul}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink/60">
            {deskripsi}
          </p>
          <div className="mt-auto pt-4">
            <ProgressBar
              value={progress.read}
              max={progress.total}
              tone={MATERI_TONE[group.materi]}
              label={`Progres baca ${group.judul}`}
            />
          </div>
        </div>
      </article>
    </Link>
  )
}

/**
 * Tampilan drill-down satu subtes: header subtes + daftar dokumennya.
 * Cheat sheet (bila ada) tampil pertama, membentang selebar penuh,
 * dengan kartu featured. Subtes tanpa cheat sheet tampil biasa saja.
 */
function SubtesView({
  materi,
  readSections,
}: {
  materi: Materi
  readSections: string[]
}) {
  const groups = sortGroupsCheatSheetFirst(getMateriGroupsByMateri(materi))
  const progress = materiReadProgress(materi, readSections)
  const motif = MATERI_MOTIF[materi]

  return (
    <div className="flex flex-col gap-6">
      <StickyBackButton to="/belajar" />

      <Card className="reveal relative overflow-hidden">
        <MateriWatermark
          materi={materi}
          className={cx(
            'absolute -top-1 right-2 h-24 w-36 text-6xl opacity-10 lg:h-28 lg:w-44',
            MATERI_WATERMARK[materi],
            materi === 'TWK' && 'motif-melayang',
          )}
        />
        <div className="relative">
          <MotifStrip materi={materi} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-display text-xl font-extrabold">
              {materi}
            </span>
            <Badge tone={MATERI_TONE[materi]}>
              {MATERI_META[materi].nama}
            </Badge>
            <span
              className={cx(
                'rounded-full px-2.5 py-0.5 text-xs font-extrabold',
                motif.pillClass,
              )}
            >
              {motif.pill}
            </span>
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-ink/60">
            {MATERI_META[materi].deskripsi}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <ProgressBar
              value={progress.read}
              max={progress.total}
              tone={MATERI_TONE[materi]}
              label={`Progres baca ${materi}`}
              className="flex-1"
            />
            <span className="shrink-0 text-xs font-extrabold text-ink/60">
              {statusBaca(progress.percent)}
            </span>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((group) => {
          const featured = isCheatSheetGroup(group)
          return (
            <GroupCard
              key={group.id}
              group={group}
              readSections={readSections}
              featured={featured}
              className={featured ? 'lg:col-span-2' : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}

/**
 * Halaman Belajar v2.6: tiga kartu utama subtes dulu (TWK, TIU, TKP).
 * Ketuk satu kartu untuk masuk ke daftar dokumen subtes itu.
 *
 * Drill-down memakai query param `?subtes=twk` (bukan rute baru):
 * rute `/belajar/:materiId` sudah dipakai halaman detail materi, dan
 * App.tsx di luar cakupan worker ini. Query param tetap memberi
 * deep-link yang bisa dibagikan, dan tombol back browser kembali ke
 * tiga kartu karena perpindahan ini tercatat di history. Nilai
 * param yang tidak dikenal kembali ke tampilan tiga kartu.
 */
export function BelajarPage() {
  const { readSections } = useStore()
  const [searchParams] = useSearchParams()
  const subtesParam = searchParams.get('subtes')?.toUpperCase()
  const subtes = MATERI_LIST.includes(subtesParam as Materi)
    ? (subtesParam as Materi)
    : undefined

  // ScrollToTop di App hanya bereaksi ke pathname; perubahan
  // ?subtes= tidak mengganti pathname, jadi scroll manual ke atas
  // setiap kali tampilan berubah.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [subtes])

  return (
    <div className="flex flex-col gap-6">
      <GuestProgressWarning />

      {subtes ? (
        <SubtesView materi={subtes} readSections={readSections} />
      ) : (
        <>
          <header>
            <p className="kicker">baca dikit-dikit, lama-lama lolos</p>
            <h1 className="mt-1 font-display text-3xl font-extrabold">
              Belajar
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-ink/60">
              Materi SKD yang sudah dirapikan per topik. Tiap bagian yang
              selesai dibaca dapat 5 XP.
            </p>
          </header>

          {/* Banner Tips & Trik Jawab (v2.8.2): satu-satunya entry
              point halaman /tips-trik. Gaya kartu konsisten dengan
              kartu subtes di bawahnya, dengan Osi sebagai pemandu.
              aria-label eksplisit: link membungkus <article> + <h2>,
              dan Chromium menghitung nama aksesibel link seperti itu
              sebagai KOSONG (pembaca layar mendengar link tanpa nama).
              Label ini juga yang dipakai QA getByRole. */}
          <Link
            to="/tips-trik"
            className="block"
            aria-label="Tips & Trik Jawab: strategi menjawab soal TWK, TIU, dan TKP"
          >
            <article className="card-lift reveal relative overflow-hidden rounded-2xl border border-primary-200 bg-primary-50/60 shadow-soft">
              <div className="flex items-center gap-4 p-4 lg:p-5">
                <Mascot mood="kagum" size={56} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg font-extrabold leading-snug">
                    Tips &amp; Trik Jawab
                  </h2>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink/60">
                    Strategi menjawab soal TWK, TIU, dan TKP yang
                    praktis, dibawakan {MASCOT_NAME} di tiap kartunya.
                  </p>
                </div>
                <ChevronRightIcon
                  width={20}
                  height={20}
                  className="shrink-0 text-primary-600"
                  aria-hidden="true"
                />
              </div>
            </article>
          </Link>

          <div className="grid gap-4 lg:grid-cols-3">
            {MATERI_LIST.map((materi) => (
              <SubtesCard
                key={materi}
                materi={materi}
                readSections={readSections}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
