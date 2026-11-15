import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  getMyProfile,
  signOut,
  updateMyProfile,
  useAuthUser,
  type Profile,
} from '../lib/auth'
import { MASCOT_NAME } from '../lib/mascot'
import {
  processProfilePhoto,
  removeProfilePhoto,
  setProfilePhoto,
  useProfileAvatar,
} from '../lib/profile'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { AvatarPicker } from '../components/AvatarPicker'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { ConfirmModal } from '../components/quiz/ConfirmModal'
import { XIcon } from '../components/icons'

const INPUT_CLASS =
  'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm font-medium outline-none placeholder:text-ink/60 focus:border-primary-600 focus:ring-2 focus:ring-primary-100'

/**
 * Halaman Profil (/profil): avatar (foto unggahan atau avatar maskot),
 * username dan email, formasi yang bisa diedit, toggle Premium Beta,
 * dan tombol Keluar.
 *
 * Foto profil di-resize dan dikompres di client sebelum disimpan di
 * localStorage per user; avatar maskot dipilih dari 7 varian. Foto
 * yang diunggah selalu tampil duluan, sebelum avatar maskot.
 *
 * Hanya bisa dibuka saat login; tamu diarahkan ke /auth. User yang
 * login tapi belum punya profil (mis. login Google yang belum
 * melengkapi profil) diarahkan ke /auth untuk memilih username dulu.
 */
export default function ProfilPage() {
  const { user, loading: authLoading } = useAuthUser()
  const navigate = useNavigate()
  const { photo } = useProfileAvatar()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photoMessage, setPhotoMessage] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [formasi, setFormasi] = useState('')
  const [savingFormasi, setSavingFormasi] = useState(false)
  const [formasiMessage, setFormasiMessage] = useState('')
  const [formasiError, setFormasiError] = useState('')
  const [premiumSaving, setPremiumSaving] = useState(false)
  const [premiumError, setPremiumError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

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

  /** Unggah foto: resize dan kompres di client, lalu simpan per user. */
  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset value supaya file yang sama bisa dipilih lagi nanti.
    event.target.value = ''
    if (!file) return
    setPhotoMessage('')
    setPhotoError('')
    setPhotoProcessing(true)
    try {
      const dataUrl = await processProfilePhoto(file)
      setProfilePhoto(dataUrl)
      setPhotoMessage('Fotonya udah terpasang.')
    } catch (err) {
      setPhotoError(
        err instanceof Error
          ? err.message
          : 'Fotonya gagal diproses, coba foto lain ya.',
      )
    } finally {
      setPhotoProcessing(false)
    }
  }

  /** Hapus foto: kembali memakai avatar maskot. */
  function handleRemovePhoto() {
    removeProfilePhoto()
    setPhotoMessage(`Foto dihapus, avatar ${MASCOT_NAME} dipakai lagi.`)
    setPhotoError('')
  }

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

      {/* Identitas: avatar besar, username, formasi, email */}
      <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
        <ProfileAvatar size={96} />
        <div>
          <p className="font-display text-xl font-extrabold break-words">
            {profile.username}
          </p>
          <p className="mt-0.5 text-sm font-medium text-ink/60">
            {profile.formasi ?? 'Formasi belum diisi'}
          </p>
          <p className="mt-0.5 text-sm font-medium break-all text-ink/60">
            {user.email ?? '-'}
          </p>
        </div>
      </Card>

      {/* Foto profil: unggah (di-resize di client) atau hapus */}
      <Card padding="lg" className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-base font-extrabold">
            Foto profil
          </h2>
          <p className="mt-0.5 text-sm leading-relaxed text-ink/60">
            Foto tersimpan di browser ini dulu, sinkronisasi ke server
            menyusul.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          aria-label="Pilih foto profil"
          className="sr-only"
          onChange={(event) => void handlePhotoChange(event)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={photoProcessing}
          >
            {photoProcessing ? 'Memproses...' : 'Unggah foto'}
          </Button>
          {photo && (
            <Button
              variant="outline"
              onClick={handleRemovePhoto}
              disabled={photoProcessing}
            >
              Hapus foto
            </Button>
          )}
        </div>
        <p className="text-xs leading-relaxed font-medium text-ink/60">
          Foto otomatis diperkecil biar ringan. Foto yang kamu unggah
          tampil duluan, sebelum avatar {MASCOT_NAME}.
        </p>
        {photoMessage && (
          <p
            role="status"
            className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-sm font-semibold text-primary-700"
          >
            {photoMessage}
          </p>
        )}
        {photoError && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800"
          >
            {photoError}
          </p>
        )}
      </Card>

      {/* Avatar maskot: 7 varian, dipakai kalau belum unggah foto */}
      <Card padding="lg" className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-base font-extrabold">
            Avatar {MASCOT_NAME}
          </h2>
          <p className="mt-0.5 text-sm leading-relaxed text-ink/60">
            Pilih gaya {MASCOT_NAME} favoritmu. Gaya baru terbuka seiring
            streak belajar-mu. Dipakai kalau kamu belum unggah foto.
          </p>
        </div>
        <AvatarPicker />
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
        onClick={() => setShowLogoutConfirm(true)}
        disabled={signingOut}
        className="self-start"
      >
        {signingOut ? 'Sebentar ya...' : 'Keluar'}
      </Button>
      <ConfirmModal
        open={showLogoutConfirm}
        title="Yakin mau keluar?"
        body="Progres belajar di akunmu tetap tersimpan. Kamu bisa masuk lagi kapan pun."
        confirmLabel="Ya, keluar"
        cancelLabel="Tetap masuk"
        icon={<XIcon width={22} height={22} />}
        onConfirm={() => {
          setShowLogoutConfirm(false)
          void handleSignOut()
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  )
}
