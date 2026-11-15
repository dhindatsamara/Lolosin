import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  getMyProfile,
  signOut,
  updateMyProfile,
  useAuthUser,
  type Profile,
} from '../lib/auth'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

const INPUT_CLASS =
  'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm font-medium outline-none placeholder:text-ink/60 focus:border-primary-600 focus:ring-2 focus:ring-primary-100'

/**
 * Halaman Profil (/profil): username dan email (read-only), formasi
 * yang bisa diedit, toggle Premium Beta, dan tombol Keluar.
 *
 * Hanya bisa dibuka saat login; tamu diarahkan ke /auth. User yang
 * login tapi belum punya profil (mis. login Google yang belum
 * melengkapi profil) diarahkan ke /auth untuk memilih username dulu.
 */
export default function ProfilPage() {
  const { user, loading: authLoading } = useAuthUser()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [formasi, setFormasi] = useState('')
  const [savingFormasi, setSavingFormasi] = useState(false)
  const [formasiMessage, setFormasiMessage] = useState('')
  const [formasiError, setFormasiError] = useState('')
  const [premiumSaving, setPremiumSaving] = useState(false)
  const [premiumError, setPremiumError] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (authLoading) return
    // Tamu: tidak ada profil untuk dimuat; matikan loading supaya
    // render lanjut ke <Navigate to="/auth">. Tanpa ini tamu terjebak
    // di "Lagi memuat profilmu..." selamanya (profileLoading awal true
    // dan tidak pernah diubah).
    if (!user) {
      setProfileLoading(false)
      return
    }
    let cancelled = false
    setProfileLoading(true)
    getMyProfile()
      .then((nextProfile) => {
        if (cancelled) return
        setProfile(nextProfile)
        setFormasi(nextProfile?.formasi ?? '')
        setProfileLoading(false)
      })
      .catch(() => {
        if (!cancelled) setProfileLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authLoading, user])

  async function handleSaveFormasi(event: React.FormEvent) {
    event.preventDefault()
    if (savingFormasi) return
    setFormasiMessage('')
    setFormasiError('')
    setSavingFormasi(true)
    try {
      const updated = await updateMyProfile({ formasi: formasi || null })
      setProfile(updated)
      setFormasi(updated.formasi ?? '')
      setFormasiMessage('Formasi tersimpan.')
    } catch (err) {
      setFormasiError(
        err instanceof Error ? err.message : 'Ada yang salah, coba lagi ya.',
      )
    } finally {
      setSavingFormasi(false)
    }
  }

  async function handlePremiumChange(checked: boolean) {
    if (premiumSaving) return
    setPremiumError('')
    setPremiumSaving(true)
    try {
      const updated = await updateMyProfile({ is_premium: checked })
      setProfile(updated)
    } catch (err) {
      // Bila kolom is_premium belum ada, pesannya sudah jelas:
      // "Jalankan dulu migrasi 003 di SQL Editor". Toggle kembali ke
      // nilai lama karena profile tidak berubah.
      setPremiumError(
        err instanceof Error ? err.message : 'Ada yang salah, coba lagi ya.',
      )
    } finally {
      setPremiumSaving(false)
    }
  }

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch {
      setSigningOut(false)
    }
  }

  if (authLoading || profileLoading) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <header>
          <p className="kicker">akunmu</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold">Profil</h1>
        </header>
        <Card padding="lg">
          <p className="text-sm font-medium text-ink/60">
            Lagi memuat profilmu...
          </p>
        </Card>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" replace />
  }

  // Login tapi belum punya profil: lengkapi dulu di /auth.
  if (!profile) {
    return <Navigate to="/auth" replace />
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <header>
        <p className="kicker">akunmu</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Profil</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          Atur formasi yang kamu tuju dan coba Premium Beta gratis selama
          masa beta.
        </p>
      </header>

      <Card padding="lg" className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-extrabold tracking-wide text-ink/50 uppercase">
            Username
          </p>
          <p className="mt-1 font-display text-lg font-extrabold">
            {profile.username}
          </p>
        </div>
        <div>
          <p className="text-xs font-extrabold tracking-wide text-ink/50 uppercase">
            Email
          </p>
          <p className="mt-1 text-sm font-semibold break-all">
            {user.email ?? '-'}
          </p>
        </div>
      </Card>

      <Card padding="lg">
        <form
          onSubmit={handleSaveFormasi}
          noValidate
          className="flex flex-col gap-4"
        >
          <div>
            <label
              htmlFor="profil-formasi"
              className="mb-1.5 block text-sm font-extrabold"
            >
              Formasi yang dituju
            </label>
            <input
              id="profil-formasi"
              name="formasi"
              type="text"
              autoComplete="off"
              value={formasi}
              onChange={(e) => {
                setFormasi(e.target.value)
                setFormasiMessage('')
                setFormasiError('')
              }}
              placeholder="Mis. Analis Kebijakan"
              className={INPUT_CLASS}
            />
            <p className="mt-1.5 text-xs font-medium text-ink/60">
              Dipakai buat leaderboard per formasi. Boleh dikosongkan.
            </p>
          </div>

          {formasiMessage && (
            <p
              role="status"
              className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-sm font-semibold text-primary-700"
            >
              {formasiMessage}
            </p>
          )}
          {formasiError && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800"
            >
              {formasiError}
            </p>
          )}

          <Button type="submit" disabled={savingFormasi}>
            {savingFormasi ? 'Menyimpan...' : 'Simpan formasi'}
          </Button>
        </form>
      </Card>

      <Card padding="lg" className="flex flex-col gap-3">
        <label
          htmlFor="profil-premium-beta"
          className="flex cursor-pointer items-center justify-between gap-3"
        >
          <span>
            <span className="block font-display text-base font-extrabold">
              Premium Beta
            </span>
            <span className="mt-0.5 block text-sm leading-relaxed text-ink/60">
              Coba fitur premium gratis selama masa beta, termasuk jadi host
              sesi live.
            </span>
          </span>
          <input
            id="profil-premium-beta"
            name="premium-beta"
            type="checkbox"
            checked={profile.is_premium ?? false}
            disabled={premiumSaving}
            onChange={(e) => void handlePremiumChange(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-primary-600 disabled:opacity-50"
          />
        </label>
        {premiumError && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800"
          >
            {premiumError}
          </p>
        )}
      </Card>

      <Button
        variant="outline"
        onClick={handleSignOut}
        disabled={signingOut}
        className="self-start"
      >
        {signingOut ? 'Sebentar ya...' : 'Keluar'}
      </Button>
    </div>
  )
}
