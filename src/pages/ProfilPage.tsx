import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  AUTH_NOT_CONFIGURED_MESSAGE,
  getMyProfile,
  isUsernameAvailable,
  isValidUsername,
  signOut,
  updateMyProfile,
  useAuthUser,
  USERNAME_FORMAT_MESSAGE,
  USERNAME_TAKEN_MESSAGE,
  type Profile,
} from '../lib/auth'
import { MASCOT_NAME } from '../lib/mascot'
import {
  getProfileAvatar,
  processProfilePhoto,
  removeProfilePhoto,
  resolveAvatarVariant,
  setProfileAvatarVariant,
  setProfilePhoto,
  useProfileAvatar,
  type AvatarVariantId,
} from '../lib/profile'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import {
  createRedeemCode,
  formatTanggalIndonesia,
  isDevRedeemUser,
  normalizeRedeemCode,
  REDEEM_ERROR_MESSAGES,
  redeemCode,
} from '../lib/redeem'
import {
  getPremiumStatus,
  type PremiumStatus,
} from '../lib/premium'
import { useSyncStatus, type SyncStatus } from '../lib/sync'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { AvatarPicker } from '../components/AvatarPicker'
import { Mascot } from '../components/Mascot'
import { ConfirmModal } from '../components/quiz/ConfirmModal'
import { XIcon } from '../components/icons'

const INPUT_CLASS =
  'w-full rounded-xl border border-line bg-white px-3.5 py-1.5 text-sm font-medium outline-none placeholder:text-ink/60 focus:border-primary-600 focus:ring-2 focus:ring-primary-100'

/** Label indikator status sinkronisasi di header. */
const SYNC_LABELS: Record<SyncStatus, string> = {
  synced: 'Progres tersinkron ke akunmu',
  pending: 'Belum tersinkron',
  inactive: 'Sinkronisasi tidak aktif',
}

/** Gaya chip indikator sinkronisasi per status. */
const SYNC_CHIP_CLASS: Record<SyncStatus, string> = {
  synced: 'border-primary-200 bg-primary-50 text-primary-700',
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  inactive: 'border-line bg-white text-ink/60',
}

/** Gaya titik indikator sinkronisasi per status. */
const SYNC_DOT_CLASS: Record<SyncStatus, string> = {
  synced: 'bg-primary-500',
  pending: 'bg-amber-500',
  inactive: 'bg-ink/30',
}

/**
 * Normalisasi formasi, sama seperti yang dipakai updateMyProfile:
 * trim, huruf kecil, spasi ganda dirapikan, kosong jadi null.
 * Dipakai dirty tracking supaya perbedaan spasi atau kapital saja
 * tidak dianggap perubahan.
 */
function normalisasiFormasi(nilai: string): string | null {
  const bersih = nilai.trim().toLowerCase().replace(/\s+/g, ' ')
  return bersih || null
}

/**
 * Pratinjau avatar dari nilai draft (foto atau varian maskot),
 * dirender seperti ProfileAvatar: foto didahulukan, varian maskot
 * di-resolve terhadap streak saat ini (gating streak v2.4 tetap
 * berlaku). Dipakai kartu identitas supaya pilihan yang belum
 * disimpan sudah terlihat di avatar besar.
 */
function PratinjauAvatar({
  photo,
  variantId,
  streak,
  size,
}: {
  photo: string | null
  variantId: AvatarVariantId
  streak: number
  size: number
}) {
  const variant = resolveAvatarVariant(streak, variantId)

  if (photo) {
    return (
      <img
        src={photo}
        alt="Pratinjau foto profilmu"
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    )
  }

  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50"
    >
      <Mascot
        mood={variant.mood}
        outfit={variant.outfit}
        showCap={variant.showCap}
        headphones={variant.headphones}
        size={Math.round(size * 0.88)}
      />
    </span>
  )
}

/**
 * Halaman Profil (/profil), selayar penuh (v2.5, poin 6): dua kolom
 * di desktop, kiri identitas + foto + avatar, kanan akun + premium.
 *
 * Dipadatkan (v2.6, poin 4): tiga kolom SEIMBANG di desktop
 * (identitas + foto | avatar | akun + premium + keluar), padding
 * kartu p-4, avatar pratinjau 72px horizontal, header ringkas
 * (judul + deskripsi sebaris), supaya halaman muat satu layar
 * 1440x900 tanpa scroll. Tidak ada fitur yang dihapus: mode draft,
 * cek username, avatar Osi, foto, Premium Beta, dan Keluar tetap ada.
 * Premium Beta digabung ke dalam kartu akun (di luar <form>, tetap
 * tersimpan langsung, bukan bagian draft).
 *
 * Ronde 4 (QA v2.6): terukur 904px di 1440x900 (4px di atas viewport),
 * jadi jarak header-grid gap-4 -> gap-3 dan padding kartu avatar +
 * akun p-4 -> p-3.5 (hemat ~8px, tanpa perubahan visual yang terasa).
 *
 * Pemadatan v2.7: field redeem masuk ke dalam blok Premium (satu baris
 * input + tombol, tanpa judul bagian sendiri) dan indikator sync jadi
 * chip kecil di header (muat sebaris, tanpa biaya vertikal). Supaya
 * halaman tetap muat satu layar dengan redeem terlihat, padding kartu
 * p-3.5 -> p-3, gap dirampingkan, input py-2 -> py-1.5, label form
 * text-sm -> text-xs, helper username dipendekkan jadi satu baris,
 * helper formasi dan deskripsi avatar dihapus (label + placeholder
 * sudah cukup jelas), dan avatar pratinjau 64 -> 56px. Target terukur
 * <=880px @1440x900 (akun non-dev; generator kode dev hanya ada di
 * akun Dhinda dan tidak masuk pengukuran).
 * Mode DRAFT: perubahan username, formasi, avatar, dan foto
 * ditampung dulu, tidak langsung tersimpan. Bar "Simpan perubahan"
 * muncul hanya bila ada perubahan (dirty tracking), dengan tombol
 * "Batalkan" untuk membuang draft. Toggle Premium Beta bukan bagian
 * draft, tetap tersimpan langsung seperti dulu.
 *
 * Username dicek keunikannya saat simpan lewat isUsernameAvailable
 * (cara yang sama dipakai form daftar), lalu disimpan lewat update
 * langsung ke tabel profiles: updateMyProfile di lib/auth.ts belum
 * menerima username, dan file itu di luar jangkauan revisi ini.
 * Pelanggaran unique constraint (23505) tetap ditangkap sebagai
 * username sudah dipakai, untuk menutup celah balapan antara cek
 * dan simpan. Foto profil tetap di-resize dan dikompres di client
 * (256px JPEG) sebelum disimpan di localStorage per user; avatar
 * maskot dipilih dari 7 varian dengan gating streak (v2.4). Foto
 * yang diunggah selalu tampil duluan, sebelum avatar maskot.
 *
 * Hanya bisa dibuka saat login; tamu diarahkan ke /auth. User yang
 * login tapi belum punya profil (mis. login Google yang belum
 * melengkapi profil) diarahkan ke /auth untuk memilih username dulu.
 */
export default function ProfilPage() {
  const { user, loading: authLoading } = useAuthUser()
  const navigate = useNavigate()
  const { photo, variantId } = useProfileAvatar()
  const { streak } = useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photoMessage, setPhotoMessage] = useState('')
  const [photoError, setPhotoError] = useState('')
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)

  // Nilai draft (belum tersimpan) + penanda draft sudah diisi dari
  // nilai tersimpan. Dirty tracking dimatikan sampai draftSiap true,
  // supaya nilai awal state tidak terbaca sebagai perubahan.
  const [draftUsername, setDraftUsername] = useState('')
  const [draftFormasi, setDraftFormasi] = useState('')
  const [draftVariantId, setDraftVariantId] =
    useState<AvatarVariantId>('wisuda')
  const [draftPhoto, setDraftPhoto] = useState<string | null>(null)
  const [draftSiap, setDraftSiap] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')

  const [premiumSaving, setPremiumSaving] = useState(false)
  const [premiumError, setPremiumError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  // Status premium dari server (is_premium + premium_until), dipakai
  // menampilkan tanggal berakhir premium. Toggle Premium Beta di
  // bawah tetap membaca profile.is_premium seperti dulu.
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus | null>(
    null,
  )

  // Redeem code (semua user) + generator kode (hanya akun Dhinda).
  const [redeemInput, setRedeemInput] = useState('')
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemMessage, setRedeemMessage] = useState('')
  const [redeemError, setRedeemError] = useState('')
  const [devDays, setDevDays] = useState('7')
  const [devMaxUses, setDevMaxUses] = useState('10')
  const [devExpires, setDevExpires] = useState('')
  const [devCreating, setDevCreating] = useState(false)
  const [devCreatedCode, setDevCreatedCode] = useState('')
  const [devCreateError, setDevCreateError] = useState('')
  const [devCopied, setDevCopied] = useState(false)

  const syncStatus = useSyncStatus()
  const isDev = isDevRedeemUser(profile?.username, user?.email)

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
        if (nextProfile) {
          // Isi draft dari nilai tersimpan: profil dari server,
          // avatar dan foto dibaca segar dari localStorage.
          setDraftUsername(nextProfile.username)
          setDraftFormasi(nextProfile.formasi ?? '')
          const stored = getProfileAvatar()
          setDraftVariantId(stored.variantId)
          setDraftPhoto(stored.photo)
          setDraftSiap(true)
        }
        setProfileLoading(false)
      })
      .catch(() => {
        if (!cancelled) setProfileLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authLoading, user])

  // Status premium (termasuk premium_until dari redeem / juara
  // mingguan). Gagal baca bukan error fatal: tanggal berakhirnya
  // cukup tidak tampil, toggle Premium Beta tetap jalan.
  useEffect(() => {
    if (authLoading || !user) return
    let cancelled = false
    getPremiumStatus(user.id)
      .then((status) => {
        if (!cancelled) setPremiumStatus(status)
      })
      .catch(() => {
        // Abaikan, premiumUntil cukup tidak tampil.
      })
    return () => {
      cancelled = true
    }
  }, [authLoading, user])

  // Dirty tracking: bandingkan draft dengan nilai tersimpan.
  // Username dibandingkan setelah normalisasi (trim + huruf kecil),
  // formasi setelah normalisasi yang sama seperti updateMyProfile.
  const usernameBersih = draftUsername.trim().toLowerCase()
  const usernameBerubah =
    draftSiap && profile !== null && usernameBersih !== profile.username
  const formasiBerubah =
    draftSiap &&
    profile !== null &&
    normalisasiFormasi(draftFormasi) !== profile.formasi
  const avatarBerubah = draftSiap && draftVariantId !== variantId
  const fotoBerubah = draftSiap && draftPhoto !== photo
  const adaPerubahan =
    usernameBerubah || formasiBerubah || avatarBerubah || fotoBerubah

  /** Buang draft, kembali ke nilai tersimpan. */
  function handleCancel() {
    if (!profile) return
    setDraftUsername(profile.username)
    setDraftFormasi(profile.formasi ?? '')
    setDraftVariantId(variantId)
    setDraftPhoto(photo)
    setSaveMessage('')
    setSaveError('')
    setPhotoMessage('')
    setPhotoError('')
  }

  /** Simpan semua perubahan draft sekaligus. */
  async function handleSave() {
    if (!profile || !user || saving || !adaPerubahan) return
    setSaveMessage('')
    setSaveError('')

    // Validasi username dulu, sebelum ada yang tersimpan: format,
    // lalu keunikan terhadap profil Supabase.
    if (usernameBerubah) {
      if (!isValidUsername(draftUsername)) {
        setSaveError(USERNAME_FORMAT_MESSAGE)
        return
      }
      try {
        const tersedia = await isUsernameAvailable(usernameBersih)
        if (!tersedia) {
          setSaveError(USERNAME_TAKEN_MESSAGE)
          return
        }
      } catch (err) {
        setSaveError(
          err instanceof Error
            ? err.message
            : 'Username gagal dicek, coba lagi ya.',
        )
        return
      }
    }

    setSaving(true)
    try {
      if (usernameBerubah) {
        if (!supabase) throw new Error(AUTH_NOT_CONFIGURED_MESSAGE)
        const { error } = await supabase
          .from('profiles')
          .update({ username: usernameBersih })
          .eq('id', user.id)
        if (error) {
          if (error.code === '23505') throw new Error(USERNAME_TAKEN_MESSAGE)
          throw new Error('Username gagal disimpan, coba lagi ya.')
        }
      }
      if (formasiBerubah) {
        await updateMyProfile({ formasi: draftFormasi || null })
      }
      if (avatarBerubah) {
        setProfileAvatarVariant(draftVariantId)
      }
      if (fotoBerubah) {
        if (draftPhoto) {
          setProfilePhoto(draftPhoto)
        } else {
          removeProfilePhoto()
        }
      }
      const fresh = await getMyProfile()
      if (fresh) setProfile(fresh)
      // Draft tidak perlu di-reset: nilai tersimpan kini sama dengan
      // draft, jadi dirty tracking bersih sendiri (avatar dan foto
      // ikut lewat hook useProfileAvatar yang reaktif).
      setSaveMessage('Perubahan tersimpan.')
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Ada yang salah, coba lagi ya.',
      )
      // Sebagian perubahan mungkin sudah tersimpan sebelum gagal:
      // muat ulang profil supaya dirty tracking tetap jujur, tapi
      // draft tidak diutak-atik agar ketikan yang belum tersimpan
      // tidak hilang.
      try {
        const fresh = await getMyProfile()
        if (fresh) setProfile(fresh)
      } catch {
        // Abaikan, pesan error utama sudah tampil.
      }
    } finally {
      setSaving(false)
    }
  }

  /** Pilih foto: resize dan kompres di client, ditampung sebagai draft. */
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
      setDraftPhoto(dataUrl)
      setPhotoMessage(
        'Fotonya udah dipilih. Ketuk Simpan perubahan buat memasang.',
      )
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

  /** Hapus foto dari draft: kembali memakai avatar maskot saat disimpan. */
  function handleRemovePhoto() {
    setDraftPhoto(null)
    setPhotoMessage(
      `Foto akan dihapus saat kamu menyimpan, avatar ${MASCOT_NAME} dipakai lagi.`,
    )
    setPhotoError('')
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

  /** Tukarkan kode redeem menjadi premium (semua user). */
  async function handleRedeem() {
    if (redeemLoading) return
    setRedeemMessage('')
    setRedeemError('')
    const code = normalizeRedeemCode(redeemInput)
    if (!code) {
      setRedeemError('Masukkan dulu kodenya ya.')
      return
    }
    setRedeemLoading(true)
    try {
      const result = await redeemCode(code)
      if (result.ok) {
        const daysPart =
          result.days && result.days > 0
            ? `Premium ${result.days} hari aktif`
            : 'Premium aktif'
        const untilPart = result.premiumUntil
          ? ` sampai ${formatTanggalIndonesia(result.premiumUntil)}`
          : ''
        setRedeemMessage(`Berhasil! ${daysPart}${untilPart}.`)
        setRedeemInput('')
        const fresh = await getPremiumStatus(user?.id)
        setPremiumStatus(fresh)
      } else {
        setRedeemError(
          result.message ?? REDEEM_ERROR_MESSAGES.unknown,
        )
      }
    } finally {
      setRedeemLoading(false)
    }
  }

  /** Buat satu kode redeem baru (hanya akun Dhinda). */
  async function handleCreateCode() {
    if (devCreating) return
    setDevCreateError('')
    setDevCreatedCode('')
    setDevCopied(false)
    setDevCreating(true)
    try {
      const result = await createRedeemCode({
        days: Number(devDays),
        maxUses: Number(devMaxUses),
        expiresAt: devExpires || null,
      })
      if (result.ok && result.code) {
        setDevCreatedCode(result.code)
      } else {
        setDevCreateError(result.error ?? 'Kode gagal dibuat, coba lagi ya.')
      }
    } finally {
      setDevCreating(false)
    }
  }

  /** Salin kode yang baru dibuat ke clipboard. */
  async function handleCopyCode() {
    if (!devCreatedCode) return
    try {
      await navigator.clipboard.writeText(devCreatedCode)
      setDevCopied(true)
    } catch {
      setDevCreateError('Gagal menyalin, salin manual aja ya.')
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
      {/* Header ringkas (v2.6): judul + deskripsi sebaris, tanpa
          kicker, supaya halaman muat satu layar. Chip status sync
          (v2.7) duduk sebaris di kanan, tanpa biaya vertikal. */}
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-display text-2xl font-extrabold">Profil</h1>
        <p className="text-sm leading-relaxed text-ink/60">
          Atur username, formasi yang kamu tuju, dan avatar-mu.
          Perubahan baru tersimpan setelah kamu ketuk Simpan perubahan.
        </p>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${SYNC_CHIP_CLASS[syncStatus]}`}
        >
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${SYNC_DOT_CLASS[syncStatus]}`}
          />
          {SYNC_LABELS[syncStatus]}
        </span>
      </header>

      {saveMessage && (
        <p
          role="status"
          className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-sm font-semibold text-primary-700"
        >
          {saveMessage}
        </p>
      )}
      {saveError && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800"
        >
          {saveError}
        </p>
      )}

      {/* Tiga kolom seimbang (v2.6, diratakan v2.8.3): identitas
          + foto | avatar | akun + premium + keluar. Di mobile kolom
          menumpuk seperti biasa; di desktop ketiganya direnggang
          sampai tepi bawah yang sama (stretch + flex-1 di tiap
          kartu), jadi tidak ada ruang kosong di bawah kolom yang
          lebih pendek. Tinggi halaman tidak bertambah: baris grid
          tetap setinggi kolom tertinggi. */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Kolom 1: identitas + foto */}
        <div className="flex flex-col gap-2.5">
          {/* Identitas horizontal (v2.6): avatar 56px di kiri, teks
              di kanan, bukan lagi tumpukan vertikal. */}
          <Card padding="md" className="flex items-center gap-3.5 p-2.5 lg:p-2.5">
            <PratinjauAvatar
              photo={draftPhoto}
              variantId={draftVariantId}
              streak={streak}
              size={56}
            />
            <div className="min-w-0">
              <p className="font-display text-base leading-tight font-extrabold break-words">
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

          {/* Foto profil: unggah (di-resize di client) atau hapus.
              Pilihan ditampung sebagai draft sampai disimpan.
              flex-1 + justify-between (v2.8.3): kartu ini menyerap
              sisa tinggi kolom, tombol Unggah menempel di bawah
              supaya tidak ada ruang kosong besar di dalam kartu. */}
          <Card padding="md" className="flex flex-1 flex-col justify-between gap-2.5 p-3 lg:p-3">
            <div>
              <h2 className="font-display text-sm font-extrabold">
                Foto profil
              </h2>
              <p className="mt-0.5 text-sm leading-relaxed text-ink/60">
                Tersimpan di browser ini dulu, otomatis diperkecil dan
                tampil sebelum avatar {MASCOT_NAME}.
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
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={photoProcessing}
              >
                {photoProcessing ? 'Memproses...' : 'Unggah foto'}
              </Button>
              {draftPhoto && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRemovePhoto}
                  disabled={photoProcessing}
                >
                  Hapus foto
                </Button>
              )}
            </div>
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

          {/* Keluar pindah ke kolom identitas (v2.6): kolom akun
              adalah yang tertinggi, jadi tombol keluar ditaruh di
              kolom yang lebih pendek supaya ketiga kolom seimbang. */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowLogoutConfirm(true)}
            disabled={signingOut}
            className="self-start"
          >
            {signingOut ? 'Sebentar ya...' : 'Keluar'}
          </Button>
        </div>

        {/* Kolom 2: avatar maskot (7 varian, dipakai kalau belum
            unggah foto). Pilihan ditampung sebagai draft sampai
            disimpan. Picker 4 kolom supaya muat 2 baris. */}
        <div className="flex flex-col gap-4">
          {/* flex-1 (v2.8.3): kartu avatar direnggang sampai tepi
              bawah kolom; grid avatar dipusatkan vertikal lewat
              content-center di AvatarPicker. */}
          <Card padding="md" className="flex flex-1 flex-col gap-2 p-3 lg:p-3">
            <div>
              <h2 className="font-display text-sm font-extrabold">
                Avatar {MASCOT_NAME}
              </h2>
            </div>
            <AvatarPicker
              value={draftVariantId}
              onChange={(id) => {
                setDraftVariantId(id)
                setSaveMessage('')
                setSaveError('')
              }}
              className="grid-cols-4 flex-1 content-center"
            />
          </Card>
        </div>

        {/* Kolom 3: akun + premium + keluar */}
        <div className="flex flex-col gap-4">
          {/* flex-1 (v2.8.3): simetri dengan kolom lain; tidak
              mengubah apa pun saat kolom ini yang tertinggi. */}
          <Card padding="md" className="flex flex-1 flex-col gap-3 p-3 lg:p-3">
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void handleSave()
              }}
              noValidate
              className="flex flex-col gap-2.5"
            >
              <div>
                <label
                  htmlFor="profil-username"
                  className="mb-0.5 block text-xs font-extrabold"
                >
                  Username
                </label>
                <input
                  id="profil-username"
                  name="username"
                  type="text"
                  autoComplete="off"
                  value={draftUsername}
                  onChange={(e) => {
                    setDraftUsername(e.target.value)
                    setSaveMessage('')
                    setSaveError('')
                  }}
                  placeholder="Mis. dhinda_28"
                  className={INPUT_CLASS}
                />
                <p className="mt-1 text-xs font-medium text-ink/60">
                  3-20 karakter, huruf kecil, angka, atau underscore.
                </p>
              </div>

              <div>
                <label
                  htmlFor="profil-formasi"
                  className="mb-0.5 block text-xs font-extrabold"
                >
                  Formasi yang dituju
                </label>
                <input
                  id="profil-formasi"
                  name="formasi"
                  type="text"
                  autoComplete="off"
                  value={draftFormasi}
                  onChange={(e) => {
                    setDraftFormasi(e.target.value)
                    setSaveMessage('')
                    setSaveError('')
                  }}
                  placeholder="Mis. Analis Kebijakan"
                  className={INPUT_CLASS}
                />
              </div>
            </form>

            {/* Premium Beta: di dalam kartu akun supaya hemat ruang,
                tapi DI LUAR <form> dan tetap tersimpan langsung,
                bukan bagian draft. Baris redeem (v2.7) menempel di
                bawah toggle tanpa judul bagian sendiri supaya
                halaman tetap muat satu layar. */}
            <div className="border-t border-line pt-3">
              <label
                htmlFor="profil-premium-beta"
                className="flex cursor-pointer items-center justify-between gap-3"
              >
                <span>
                  <span className="block font-display text-sm font-extrabold">
                    Premium Beta
                  </span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-ink/60">
                    Gratis selama beta, termasuk jadi host sesi.
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
              {premiumStatus?.premiumUntil && (
                <p className="mt-1.5 text-sm font-semibold text-primary-700">
                  Premium aktif sampai{' '}
                  {formatTanggalIndonesia(premiumStatus.premiumUntil)}.
                </p>
              )}
              {premiumError && (
                <p
                  role="alert"
                  className="mt-2.5 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800"
                >
                  {premiumError}
                </p>
              )}
              {/* Redeem code (v2.7, semua user): kode dari giveaway
                  atau hadiah juara mingguan ditukar jadi premium. */}
              <div className="mt-2 flex gap-2">
                <input
                  id="profil-redeem"
                  name="redeem-code"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={redeemInput}
                  onChange={(e) => {
                    setRedeemInput(e.target.value)
                    setRedeemMessage('')
                    setRedeemError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleRedeem()
                    }
                  }}
                  placeholder="Kode redeem premium"
                  aria-label="Kode redeem premium"
                  className={INPUT_CLASS}
                />
                <Button
                  size="sm"
                  onClick={() => void handleRedeem()}
                  disabled={redeemLoading}
                  className="shrink-0"
                >
                  {redeemLoading ? 'Sebentar...' : 'Redeem'}
                </Button>
              </div>
              {redeemMessage && (
                <p
                  role="status"
                  className="mt-2 rounded-xl bg-primary-50 px-3.5 py-2.5 text-sm font-semibold text-primary-700"
                >
                  {redeemMessage}
                </p>
              )}
              {redeemError && (
                <p
                  role="alert"
                  className="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800"
                >
                  {redeemError}
                </p>
              )}
            </div>

            {/* Generator kode redeem (v2.7, HANYA akun Dhinda):
                tidak ada sama sekali di DOM untuk user lain. */}
            {isDev && (
              <div className="border-t border-line pt-3">
                <h2 className="font-display text-sm font-extrabold">
                  Buat kode redeem
                </h2>
                <p className="mt-0.5 text-sm leading-relaxed text-ink/60">
                  Buat kode untuk giveaway atau hadiah.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    id="profil-dev-days"
                    name="dev-days"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={devDays}
                    onChange={(e) => setDevDays(e.target.value)}
                    placeholder="Hari"
                    aria-label="Durasi premium dalam hari"
                    className="w-24 rounded-xl border border-line bg-white px-3.5 py-1.5 text-sm font-medium outline-none placeholder:text-ink/60 focus:border-primary-600 focus:ring-2 focus:ring-primary-100"
                  />
                  <input
                    id="profil-dev-max-uses"
                    name="dev-max-uses"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={devMaxUses}
                    onChange={(e) => setDevMaxUses(e.target.value)}
                    placeholder="Maks pakai"
                    aria-label="Maksimal jumlah pemakaian kode"
                    className="w-28 rounded-xl border border-line bg-white px-3.5 py-1.5 text-sm font-medium outline-none placeholder:text-ink/60 focus:border-primary-600 focus:ring-2 focus:ring-primary-100"
                  />
                  <Button
                    size="sm"
                    onClick={() => void handleCreateCode()}
                    disabled={devCreating}
                    className="shrink-0"
                  >
                    {devCreating ? 'Membuat...' : 'Buat kode'}
                  </Button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label
                    htmlFor="profil-dev-expires"
                    className="shrink-0 text-xs font-bold text-ink/60"
                  >
                    Kedaluwarsa
                  </label>
                  <input
                    id="profil-dev-expires"
                    name="dev-expires"
                    type="date"
                    value={devExpires}
                    onChange={(e) => setDevExpires(e.target.value)}
                    aria-label="Tanggal kedaluwarsa kode, boleh dikosongkan"
                    className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 py-1.5 text-sm font-medium outline-none focus:border-primary-600 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                {devCreatedCode && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl bg-primary-50 px-3.5 py-2.5">
                    <code className="min-w-0 flex-1 text-sm font-extrabold break-all text-primary-800">
                      {devCreatedCode}
                    </code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleCopyCode()}
                      className="shrink-0"
                    >
                      {devCopied ? 'Tersalin' : 'Salin'}
                    </Button>
                  </div>
                )}
                {devCreateError && (
                  <p
                    role="alert"
                    className="mt-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800"
                  >
                    {devCreateError}
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Bar simpan: muncul hanya bila ada perubahan yang belum
          disimpan (dirty tracking). Menempel di bawah supaya selalu
          terjangkau. */}
      {adaPerubahan && (
        <div className="sticky bottom-4 z-10">
          <Card className="flex flex-wrap items-center justify-between gap-3 border-primary-200 bg-primary-50 p-4 shadow-soft-lg">
            <p className="text-sm font-bold text-primary-800">
              Ada perubahan yang belum disimpan.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={saving}
              >
                Batalkan
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Menyimpan...' : 'Simpan perubahan'}
              </Button>
            </div>
          </Card>
        </div>
      )}

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
