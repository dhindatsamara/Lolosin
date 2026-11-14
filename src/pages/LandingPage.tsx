import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import {
  BookIcon,
  CheckIcon,
  ClockIcon,
  TargetIcon,
  TrophyIcon,
  ZapIcon,
} from '../components/icons'

const FITUR = [
  {
    icon: BookIcon,
    tone: 'bg-primary-100 text-primary-700',
    judul: 'Materi SKD',
    deskripsi:
      'Ringkasan dan modul TWK, TIU, dan TKP yang gampang dicerna, lengkap dengan tabel dan contoh.',
  },
  {
    icon: TargetIcon,
    tone: 'bg-tiu-soft text-tiu',
    judul: 'Latihan per topik',
    deskripsi:
      'Drill per topik dengan pembahasan tiap opsi, jadi kamu tahu kenapa jawabanmu benar atau salah.',
  },
  {
    icon: TrophyIcon,
    tone: 'bg-accent-100 text-accent-700',
    judul: 'Tryout mini',
    deskripsi:
      'Latihan cepat dengan suasana CAT, lengkap dengan skor dan prediksi kelolosanmu.',
  },
  {
    icon: ClockIcon,
    tone: 'bg-tkp-soft text-tkp',
    judul: 'Simulasi CAT',
    deskripsi:
      'Rasakan ujian beneran dengan timer dan passing grade asli, biar hari-H nggak kaget.',
  },
] as const

const LANGKAH = [
  {
    nomor: '1',
    judul: 'Daftar gratis',
    deskripsi: 'Bikin akun dalam semenit, langsung bisa belajar.',
  },
  {
    nomor: '2',
    judul: 'Belajar tiap hari',
    deskripsi: 'Baca materi, kerjakan drill, dan jaga streak-mu tetap nyala.',
  },
  {
    nomor: '3',
    judul: 'Ukur kesiapanmu',
    deskripsi: 'Ikut tryout dan lihat prediksi kelolosanmu per subtes.',
  },
] as const

const FITUR_FREE = [
  'Materi SKD lengkap',
  'Latihan per topik',
  'Tryout mini dan simulasi CAT',
  'Misi harian, streak, dan lencana',
] as const

/**
 * Beranda untuk pengunjung yang belum login: landing page marketing
 * yang mengajak daftar atau masuk. Muncul hanya saat Supabase
 * terkonfigurasi dan belum ada sesi login (lihat HomePage).
 */
export function LandingPage() {
  return (
    <div className="flex flex-col gap-14 lg:gap-20">
      {/* Hero: panel hijau solid tanpa tekstur */}
      <section className="rounded-3xl bg-primary-800 px-6 py-10 text-white shadow-soft-lg lg:px-12 lg:py-16">
        <p className="text-xs font-extrabold tracking-[0.14em] text-accent-300 uppercase">
          Belajar CPNS, anti bosan
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl leading-[1.05] font-extrabold lg:text-6xl">
          Lolos CPNS dimulai dari belajar yang{' '}
          <span className="hl-marker">seru</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-primary-100 lg:text-lg">
          Materi SKD yang gampang dicerna, latihan per topik, tryout mini,
          sampai simulasi CAT yang rasanya kayak ujian beneran. Semuanya
          dalam satu aplikasi, gratis buat mulai.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/auth?mode=daftar">
            <Button size="lg" variant="secondary">
              Daftar gratis
            </Button>
          </Link>
          <Link to="/auth">
            <Button
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:border-white hover:bg-white/10 hover:text-white"
            >
              Masuk
            </Button>
          </Link>
        </div>
        <p className="mt-4 text-sm font-medium text-primary-200">
          Gratis buat mulai, tanpa ribet.
        </p>
      </section>

      {/* Fitur: tanpa angka soal/materi */}
      <section>
        <p className="kicker">Apa aja di dalamnya</p>
        <h2 className="mt-2 max-w-2xl font-display text-3xl font-extrabold lg:text-4xl">
          Semua yang kamu butuhkan buat persiapan CPNS
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {FITUR.map(({ icon: Icon, tone, judul, deskripsi }) => (
            <Card key={judul} className="p-5 lg:p-6">
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${tone}`}
              >
                <Icon width={24} height={24} />
              </span>
              <h3 className="mt-4 font-display text-lg font-extrabold">
                {judul}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
                {deskripsi}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Cara pakai */}
      <section>
        <p className="kicker">Gimana cara pakainya</p>
        <h2 className="mt-2 max-w-2xl font-display text-3xl font-extrabold lg:text-4xl">
          Mulai dalam tiga langkah
        </h2>
        <div className="mt-8 grid gap-4 lg:grid-cols-3 lg:gap-6">
          {LANGKAH.map(({ nomor, judul, deskripsi }) => (
            <Card key={nomor} className="p-5 lg:p-6">
              <span className="font-display text-4xl font-extrabold text-primary-200">
                {nomor}
              </span>
              <h3 className="mt-3 font-display text-lg font-extrabold">
                {judul}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
                {deskripsi}
              </p>
            </Card>
          ))}
        </div>
        <Card className="mt-4 flex flex-col items-start gap-3 bg-primary-50 p-5 sm:flex-row sm:items-center lg:p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white">
            <ZapIcon width={24} height={24} />
          </span>
          <p className="text-base leading-relaxed font-medium text-ink/80">
            Belajar nggak sendirian: ada misi harian, lencana pencapaian,
            dan leaderboard mingguan buat adu skor sama pejuang lain.
          </p>
        </Card>
      </section>

      {/* Akun Free vs Premium */}
      <section>
        <p className="kicker">Akunmu</p>
        <h2 className="mt-2 max-w-2xl font-display text-3xl font-extrabold lg:text-4xl">
          Mulai gratis, naik kelas kalau sudah siap
        </h2>
        <div className="mt-8 grid gap-4 lg:grid-cols-2 lg:gap-6">
          <Card className="p-6 lg:p-8">
            <h3 className="font-display text-2xl font-extrabold">Gratis</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
              Semua fitur belajar dan tryout bisa dipakai tanpa bayar.
            </p>
            <ul className="mt-5 space-y-2.5">
              {FITUR_FREE.map((fitur) => (
                <li
                  key={fitur}
                  className="flex items-start gap-2 text-sm font-medium text-ink/80"
                >
                  <CheckIcon
                    width={18}
                    height={18}
                    className="mt-0.5 shrink-0 text-primary-600"
                  />
                  {fitur}
                </li>
              ))}
            </ul>
            <Link to="/auth?mode=daftar" className="mt-6 block">
              <Button fullWidth size="lg">
                Daftar gratis
              </Button>
            </Link>
          </Card>
          <Card className="border-primary-200 bg-primary-50 p-6 lg:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-2xl font-extrabold">
                Premium
              </h3>
              <span className="rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-bold text-accent-700">
                Segera hadir
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-ink/70">
              Buat yang mau persiapan ekstra, dengan fitur lanjutan buat
              ngebut belajarmu.
            </p>
            <ul className="mt-5 space-y-2.5">
              <li className="flex items-start gap-2 text-sm font-medium text-ink/80">
                <CheckIcon
                  width={18}
                  height={18}
                  className="mt-0.5 shrink-0 text-primary-600"
                />
                Fitur lanjutan buat ngebut persiapan
              </li>
              <li className="flex items-start gap-2 text-sm font-medium text-ink/80">
                <CheckIcon
                  width={18}
                  height={18}
                  className="mt-0.5 shrink-0 text-primary-600"
                />
                Juara 1 sampai 3 leaderboard mingguan dapat akses premium
                gratis, plus lencana prestise yang bisa dipamerin
              </li>
            </ul>
            <Link to="/leaderboard" className="mt-6 block">
              <Button fullWidth size="lg" variant="outline">
                Lihat peringkat
              </Button>
            </Link>
          </Card>
        </div>
      </section>

      {/* CTA penutup */}
      <section className="rounded-3xl bg-primary-800 px-6 py-10 text-center text-white shadow-soft-lg lg:py-14">
        <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold lg:text-4xl">
          Yuk mulai persiapan CPNS-mu hari ini.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-primary-100">
          Daftar gratis, langsung belajar. NIP-mu nunggu.
        </p>
        <Link to="/auth?mode=daftar" className="mt-7 inline-block">
          <Button size="lg" variant="secondary">
            Daftar gratis
          </Button>
        </Link>
      </section>
    </div>
  )
}
