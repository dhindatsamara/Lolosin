/**
 * Halaman Premium Lolosin (v2.15): /premium.
 *
 * Dua paket (harga dari src/lib/pricing.ts, satu-satunya sumber
 * harga): Paket SKD Rp69.000 sekali bayar, premium selamanya
 * (lifetime, hero), dan Bulanan Rp20.000 per 30 hari. Pembayaran MANUAL
 * tanpa gateway: user bayar nominal pas lewat QRIS, tap "Saya
 * sudah bayar", klaim tersimpan di payment_claims (migrasi 011)
 * berstatus pending, lalu admin memverifikasi di panel admin.
 *
 * Alur halaman: daftar paket -> checkout QRIS -> konfirmasi
 * pending. User yang sudah punya klaim pending melihat statusnya
 * di atas daftar paket dan tidak bisa membuat klaim baru sampai
 * klaim itu diproses. Tamu bisa melihat paket, tapi tombol Beli
 * mengarah ke halaman masuk.
 *
 * Catatan jujur di bawah daftar paket: selama beta, semua fitur
 * premium masih gratis untuk semua user lewat Premium Beta di
 * Profil. Paket yang dibeli aktif begitu disetujui admin dan
 * tetap berlaku setelah beta berakhir.
 *
 * v2.15.1: halaman dipercantik atas permintaan Dhinda. Osi tampil
 * di hero (mood 'semangat') dan di kartu konfirmasi (mood
 * 'senang'), copy marketing dibuat lucu dan persuasif, tombol CTA
 * playful, dan ekspektasi verifikasi ditulis jelas: maksimal
 * 1x24 jam, status bisa dipantau di Profil, dan ada tautan email
 * admin bila lewat dari itu. Harga, logika klaim, migrasi, dan
 * Edge Function TIDAK berubah. Grace premium (premium sementara
 * langsung aktif) diputuskan TIDAK dibangun (Dhinda 2026-11-20);
 * sebagai gantinya, pembayaran QRIS otomatis pakai payment gateway
 * (webhook) akan dibangun sebagai versi terpisah nanti. Copy
 * verifikasi maksimal 1x24 jam di halaman ini berlaku untuk jalur
 * bayar manual yang sudah ada.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthUser } from '../lib/auth'
import { getPremiumStatus, type PremiumStatus } from '../lib/premium'
import {
  createPaymentClaim,
  getMyPendingClaim,
  type PaymentClaim,
} from '../lib/payments'
import {
  formatRupiah,
  getPackage,
  PACKAGES,
  PREMIUM_BENEFITS,
  QRIS_IMAGE_PATH,
  type Package,
} from '../lib/pricing'
import { formatTanggalIndonesia } from '../lib/redeem'
import { MASCOT_NAME } from '../lib/mascot'
import { FEEDBACK_EMAIL } from '../lib/site'
import { cx } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Mascot } from '../components/Mascot'
import { CheckIcon } from '../components/icons'
import { StickyBackButton } from '../components/belajar/StickyBackButton'

type Step = 'packages' | 'checkout' | 'done'

export function PremiumPage() {
  const { user, loading: authLoading } = useAuthUser()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('packages')
  const [selected, setSelected] = useState<Package | null>(null)
  const [pendingClaim, setPendingClaim] = useState<PaymentClaim | null>(null)
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus | null>(
    null,
  )
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [doneClaim, setDoneClaim] = useState<PaymentClaim | null>(null)

  // Klaim pending + status premium milik user (bila login).
  useEffect(() => {
    if (!user) return
    let cancelled = false
    getMyPendingClaim(user.id).then((result) => {
      if (!cancelled) setPendingClaim(result.claim)
    })
    getPremiumStatus(user.id).then((status) => {
      if (!cancelled) setPremiumStatus(status)
    })
    return () => {
      cancelled = true
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleBuy(pkg: Package) {
    if (!user) {
      navigate('/auth')
      return
    }
    setSelected(pkg)
    setError('')
    setStep('checkout')
  }

  async function handlePaid() {
    if (!selected || !user || creating) return
    setCreating(true)
    setError('')
    const result = await createPaymentClaim(user.id, selected.id, selected.price)
    setCreating(false)
    if (!result.ok || !result.claim) {
      setError(result.message ?? 'Klaim gagal dibuat, coba lagi ya.')
      return
    }
    setDoneClaim(result.claim)
    setPendingClaim(result.claim)
    setStep('done')
  }

  const pendingPackage = pendingClaim
    ? getPackage(pendingClaim.package)
    : undefined

  return (
    <div className="mx-auto w-full max-w-5xl">
      <StickyBackButton to="/" />
      <header className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Mascot
          mood="semangat"
          size={120}
          className="float-soft h-auto w-24 shrink-0 sm:w-28"
        />
        <div>
          <p className="kicker">premium lolosin</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold">
            Gas jadi Premium, NIP makin dekat
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/70">
            Semua fitur pendalaman kebuka semua. Bayar lewat QRIS,
            tanpa kartu kredit, premium aktif begitu admin
            verifikasi. Semudah scan, bayar, beres.
          </p>
          <p className="mt-3 w-fit rounded-2xl rounded-bl-sm bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-800">
            {MASCOT_NAME}: "Aku temenin belajarmu sampai lolos!"
          </p>
        </div>
      </header>

      {premiumStatus?.premium && premiumStatus.premiumUntil && (
        <p className="mt-4 rounded-xl bg-primary-50 px-4 py-3 text-sm font-semibold text-primary-800">
          Premium kamu sudah aktif sampai{' '}
          {formatTanggalIndonesia(premiumStatus.premiumUntil)}. Beli
          paket lagi akan memperpanjang masa premiummu.
        </p>
      )}

      {pendingClaim && pendingPackage && step !== 'done' && (
        <div className="mt-4 rounded-xl border border-accent-200 bg-accent-50 px-4 py-3">
          <p className="text-sm font-bold">
            Tenang, klaimmu sudah masuk. Pembayaran{' '}
            {pendingPackage.label} {formatRupiah(pendingClaim.amount)}{' '}
            sedang diverifikasi.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink/70">
            Admin sedang memeriksa nominal dan waktu bayarmu. Premium
            aktif begitu disetujui, maksimal 1x24 jam. Kamu bisa
            melihat statusnya di Profil.
          </p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
        >
          {error}
        </p>
      )}

      {step === 'done' && doneClaim ? (
        <Card className="mt-5">
          <div className="flex items-start gap-3">
            <Mascot
              mood="senang"
              size={72}
              className="h-auto w-16 shrink-0"
            />
            <div>
              <h2 className="font-display text-xl font-extrabold">
                Pembayaranmu sedang diverifikasi
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink/70">
                Tenang, klaimmu sudah masuk dan aman. Terima kasih
                sudah upgrade! Admin akan memeriksa nominal dan waktu
                bayarmu, lalu premium aktif begitu disetujui,
                maksimal 1x24 jam.
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm font-semibold">
            {getPackage(doneClaim.package)?.label ?? doneClaim.package} ·{' '}
            {formatRupiah(doneClaim.amount)}
          </p>
          {FEEDBACK_EMAIL && (
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              Sudah lewat 1x24 jam tapi premium belum aktif?{' '}
              <a
                href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Pembayaran Premium Lolosin')}`}
                className="font-semibold text-primary-700 underline"
              >
                Hubungi admin lewat email
              </a>
              .
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/profil">
              <Button>Lihat status di Profil</Button>
            </Link>
            <Link to="/">
              <Button variant="outline">Kembali ke beranda</Button>
            </Link>
          </div>
        </Card>
      ) : step === 'checkout' && selected ? (
        <Card className="mt-5">
          <h2 className="font-display text-xl font-extrabold">
            Bayar {selected.label}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Scan kode QRIS di bawah dengan aplikasi apa pun (GoPay,
            OVO, DANA, atau m-banking), lalu bayar dengan nominal yang
            persis sama.
          </p>
          <div className="mt-4 flex flex-col items-center gap-3">
            <img
              src={QRIS_IMAGE_PATH}
              alt="Kode QRIS Lolosin untuk pembayaran premium"
              className="w-64 max-w-full rounded-2xl border border-line shadow-soft"
            />
            <p className="text-center">
              <span className="block text-xs font-medium text-ink/60">
                Nominal yang harus dibayar
              </span>
              <span className="block font-display text-3xl font-extrabold">
                {formatRupiah(selected.price)}
              </span>
            </p>
          </div>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ink/70">
            <li>Bayar {formatRupiah(selected.price)} lewat QRIS di atas.</li>
            <li>
              Setelah bayar, tap tombol di bawah supaya admin bisa
              memverifikasi pembayaranmu.
            </li>
            <li>
              Premium aktif begitu admin menyetujui, maksimal 1x24
              jam.
            </li>
          </ol>
          <p className="mt-3 text-sm leading-relaxed text-ink/70">
            Pembayaran diverifikasi manual oleh admin, jadi mohon
            tunggu sebentar ya. Status klaimmu bisa dipantau di
            Profil.{' '}
            {FEEDBACK_EMAIL && (
              <>
                Kalau sudah lewat 1x24 jam dan premium belum aktif,{' '}
                <a
                  href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Pembayaran Premium Lolosin')}`}
                  className="font-semibold text-primary-700 underline"
                >
                  hubungi admin lewat email
                </a>
                .
              </>
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void handlePaid()} disabled={creating}>
              {creating ? 'Menyimpan...' : 'Saya sudah bayar'}
            </Button>
            <Button
              variant="outline"
              onClick={() => setStep('packages')}
              disabled={creating}
            >
              Kembali ke paket
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {PACKAGES.map((pkg) => (
              <Card
                key={pkg.id}
                padding="lg"
                className={cx(
                  'flex flex-col gap-3',
                  pkg.hero && 'border-2 border-primary-600 bg-primary-50/50',
                )}
              >
                {pkg.hero && (
                  <span className="w-fit rounded-full bg-primary-600 px-3 py-1 text-xs font-bold text-white">
                    Paket utama
                  </span>
                )}
                <div>
                  <h2 className="font-display text-xl font-extrabold">
                    {pkg.label}
                  </h2>
                  <p className="mt-0.5 text-sm text-ink/60">
                    {pkg.durationLabel}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-primary-800">
                    {pkg.tagline}
                  </p>
                </div>
                <p>
                  <span className="text-sm text-ink/50 line-through">
                    {formatRupiah(pkg.anchorPrice)}
                  </span>{' '}
                  <span className="font-display text-3xl font-extrabold">
                    {formatRupiah(pkg.price)}
                  </span>
                  {pkg.id === 'monthly' && (
                    <span className="text-sm font-medium text-ink/60">
                      {' '}
                      /bulan
                    </span>
                  )}
                </p>
                <ul className="flex flex-1 flex-col gap-1.5 text-sm leading-relaxed text-ink/80">
                  {PREMIUM_BENEFITS.map((benefit) => (
                    <li key={benefit} className="flex gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-primary-700"
                      >
                        <CheckIcon width={16} height={16} />
                      </span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() => handleBuy(pkg)}
                  disabled={pendingClaim !== null}
                  size={pkg.hero ? 'lg' : 'md'}
                  className="w-full"
                >
                  {pendingClaim !== null
                    ? 'Menunggu verifikasi'
                    : pkg.hero
                      ? 'Gas jadi Premium'
                      : 'Coba Bulanan dulu'}
                </Button>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink/50">
            Catatan: selama masa beta, semua fitur premium masih
            gratis untuk semua user lewat Premium Beta di Profil.
            Beta berakhir 13 Desember 2026. Paket yang kamu beli
            aktif begitu disetujui admin dan tetap berlaku setelah
            beta berakhir.
          </p>
        </>
      )}

      {authLoading && (
        <p className="mt-4 text-sm text-ink/60">Memuat...</p>
      )}
    </div>
  )
}
