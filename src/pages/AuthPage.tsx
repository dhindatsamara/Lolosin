import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import {
  completeProfile,
  getMyProfile,
  getSession,
  isEmailVerified,
  isUsernameAvailable,
  isValidUsername,
  onAuthChange,
  resendConfirmation,
  signIn,
  signInWithGoogle,
  signUp,
  USERNAME_FORMAT_MESSAGE,
  USERNAME_MAX_LENGTH,
  USERNAME_TAKEN_MESSAGE,
} from '../lib/auth'
import { MASCOT_NAME } from '../lib/mascot'
import { isSupabaseConfigured } from '../lib/supabase'
import { cx } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Mascot } from '../components/Mascot'
import {
  CheckIcon,
  CrownIcon,
  GamepadIcon,
  GoogleIcon,
  SparklesIcon,
} from '../components/icons'

type Mode = 'masuk' | 'daftar'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN_LENGTH = 6

const INPUT_CLASS =
  'w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm font-medium outline-none placeholder:text-ink/60 focus:border-primary-600 focus:ring-2 focus:ring-primary-100'

type FieldErrors = Partial<Record<'email' | 'password' | 'username', string>>

/**
 * Halaman akun: masuk atau daftar dalam satu halaman dengan toggle mode.
 * Route /auth ditambahkan koordinator; halaman ini cukup mengekspor
 * komponen default.
 *
 * Gotcha konfirmasi email: proyek Supabase baru mengharuskan konfirmasi
 * email, jadi daftar bisa sukses TANPA session. Bila begitu, halaman
 * menampilkan state "Cek emailmu" dan TIDAK menganggap user sudah login.
 * User masuk dari halaman ini setelah mengklik tautan di emailnya.
 *
 * Alur login Google: setelah redirect kembali, Supabase menukar code
 * jadi session otomatis. Email Google sudah terkonfirmasi, tapi user
 * belum punya profil/username, jadi halaman menampilkan form
 * "Lengkapi profilmu" (username saja) sebelum masuk ke beranda.
 */
export default function AuthPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const configured = isSupabaseConfigured()

  // Mode awal mengikuti query param ?mode=daftar (dari CTA landing page).
  const [mode, setMode] = useState<Mode>(() =>
    searchParams.get('mode') === 'daftar' ? 'daftar' : 'masuk',
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Tampilkan/sembunyikan password (ikon mata). Default tersembunyi.
  const [showPassword, setShowPassword] = useState(false)
  const [username, setUsername] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(
    null,
  )
  const [resendSent, setResendSent] = useState(false)
  const [resendError, setResendError] = useState('')
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [needsProfile, setNeedsProfile] = useState(false)
  const usernameRef = useRef('')
  const emailInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const usernameInputRef = useRef<HTMLInputElement>(null)

  // Bila sudah login, tidak ada urusan di halaman ini, kecuali user
  // baru login Google yang belum punya profil (tampilkan form lengkapi
  // profil). User yang emailnya belum terverifikasi diarahkan ke
  // beranda, tempat gate verifikasi di App menampilkan layar "Cek
  // emailmu". Listener onAuthStateChange menutupi callback OAuth yang
  // session-nya belum siap saat halaman pertama dimuat.
  useEffect(() => {
    if (!configured) return
    let cancelled = false

    async function checkSession(session: Session | null) {
      if (!session) return
      const user = session.user
      if (!isEmailVerified(user)) {
        navigate('/', { replace: true })
        return
      }
      const profile = await getMyProfile().catch(() => null)
      if (cancelled) return
      if (profile) {
        navigate('/', { replace: true })
      } else {
        setNeedsProfile(true)
      }
    }

    getSession().then((session) => {
      if (!cancelled) void checkSession(session)
    })
    const unsubscribe = onAuthChange((_event, session) => {
      if (!cancelled) void checkSession(session)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [configured, navigate])

  function switchMode(next: Mode) {
    setMode(next)
    setErrors({})
    setSubmitError('')
    setConfirmationEmail(null)
    setResendSent(false)
    setResendError('')
  }

  function validate(): boolean {
    const next: FieldErrors = {}
    if (!EMAIL_PATTERN.test(email.trim())) {
      next.email = 'Isi email yang valid ya, mis. nama@email.com'
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      next.password = `Password minimal ${PASSWORD_MIN_LENGTH} karakter ya`
    }
    if (mode === 'daftar') {
      if (!isValidUsername(username)) {
        next.username = USERNAME_FORMAT_MESSAGE
      }
    }
    setErrors(next)
    // Fokus ke field pertama yang salah, supaya keyboard dan screen
    // reader langsung tahu apa yang harus diperbaiki.
    if (next.email) {
      emailInputRef.current?.focus()
    } else if (next.password) {
      passwordInputRef.current?.focus()
    } else if (next.username) {
      usernameInputRef.current?.focus()
    }
    return Object.keys(next).length === 0
  }

  /** Cek ketersediaan username saat field ditinggalkan. */
  async function handleUsernameBlur() {
    const value = username.trim()
    if (!isValidUsername(value)) return
    usernameRef.current = value
    setCheckingUsername(true)
    try {
      const available = await isUsernameAvailable(value)
      // Abaikan hasil basi bila user sudah mengetik username lain.
      if (usernameRef.current !== value) return
      setErrors((prev) => ({
        ...prev,
        username: available ? undefined : USERNAME_TAKEN_MESSAGE,
      }))
    } catch {
      // Gagal cek bukan berarti username dipakai, biarkan submit yang menilai.
    } finally {
      if (usernameRef.current === value) setCheckingUsername(false)
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setSubmitError('')
    if (!validate()) return

    setLoading(true)
    try {
      if (mode === 'masuk') {
        await signIn(email, password)
        navigate('/', { replace: true })
        return
      }

      const { needsConfirmation } = await signUp(email, password, username)
      if (needsConfirmation) {
        // Daftar sukses tapi belum login: email wajib dikonfirmasi dulu.
        setConfirmationEmail(email.trim())
      } else {
        navigate('/', { replace: true })
      }
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Ada yang salah, coba lagi ya.',
      )
    } finally {
      setLoading(false)
    }
  }

  /** Masuk dengan Google: browser dialihkan ke Google, lalu kembali ke sini. */
  async function handleGoogle() {
    if (googleLoading) return
    setSubmitError('')
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
      // Berhasil: browser dialihkan ke Google, jadi baris setelah ini
      // umumnya tidak tercapai.
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Ada yang salah, coba lagi ya.',
      )
      setGoogleLoading(false)
    }
  }

  /** Form lengkapi profil (login Google): username saja. */
  async function handleCompleteProfile(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setSubmitError('')
    if (!isValidUsername(username)) {
      setErrors({ username: USERNAME_FORMAT_MESSAGE })
      usernameInputRef.current?.focus()
      return
    }
    setLoading(true)
    try {
      await completeProfile(username)
      navigate('/', { replace: true })
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Ada yang salah, coba lagi ya.',
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!confirmationEmail) return
    setResendError('')
    try {
      await resendConfirmation(confirmationEmail)
      setResendSent(true)
    } catch (err) {
      setResendError(
        err instanceof Error ? err.message : 'Ada yang salah, coba lagi ya.',
      )
    }
  }

  // Supabase belum terkonfigurasi: akun belum aktif, tapi belajar dan
  // tryout tetap jalan tanpa akun. Bukan error, jadi tampilkan penjelasan.
  if (!configured) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <header>
          <p className="kicker">akunmu, progresmu</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold">Akun</h1>
        </header>
        <Card padding="lg" className="flex flex-col gap-3">
          <p className="font-display text-lg font-extrabold">
            Fitur akun belum aktif
          </p>
          <p className="text-sm leading-relaxed text-ink/70">
            Akun dipakai buat ikut leaderboard mingguan dan nyimpen skor
            tryout-mu secara online. Fitur ini masih disiapkan, jadi belum
            bisa daftar atau masuk dulu.
          </p>
          <p className="text-sm leading-relaxed text-ink/70">
            Tenang, belajar dan tryout tetap bisa dipakai tanpa akun. Semua
            progresmu tersimpan di perangkat ini.
          </p>
          <Button
            variant="outline"
            className="self-start"
            onClick={() => navigate('/')}
          >
            Balik ke beranda
          </Button>
        </Card>
      </div>
    )
  }

  // Daftar sukses, menunggu konfirmasi email. User BELUM login.
  if (confirmationEmail) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <header>
          <p className="kicker">hampir jadi, satu langkah lagi</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold">
            Cek emailmu
          </h1>
        </header>
        <Card padding="lg" className="flex flex-col gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-primary-700">
            <CheckIcon width={22} height={22} />
          </span>
          <p className="text-sm leading-relaxed text-ink/70">
            Tautan konfirmasi sudah dikirim ke{' '}
            <span className="font-extrabold text-ink">
              {confirmationEmail}
            </span>
            . Klik tautan itu, lalu masuk dari halaman ini.
          </p>
          <p className="text-sm leading-relaxed text-ink/70">
            Nggak nemu emailnya? Cek folder spam atau promosi, atau kirim
            ulang tautannya.
          </p>
          {resendSent && (
            <p className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-sm font-semibold text-primary-700">
              Email terkirim, cek inbox ya.
            </p>
          )}
          {resendError && (
            <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800">
              {resendError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={handleResend}
              disabled={resendSent}
            >
              {resendSent ? 'Email sudah dikirim' : 'Kirim ulang email'}
            </Button>
            <Button variant="outline" onClick={() => switchMode('masuk')}>
              Ke halaman masuk
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // Login Google berhasil tapi belum punya profil: pilih username dulu.
  if (needsProfile) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <header className="flex flex-col items-center text-center">
          <span className="blob-soft flex h-28 w-28 items-center justify-center bg-primary-100">
            <Mascot mood="kagum" size={88} className="float-soft" />
          </span>
          <p className="mt-4 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-ink shadow-soft">
            Hai! Aku {MASCOT_NAME}, teman belajarmu.
          </p>
          <p className="kicker mt-4">satu langkah lagi</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold">
            Lengkapi profilmu
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-ink/60">
            Login Googlemu berhasil. Pilih username yang tampil di
            leaderboard, lalu mulai main.
          </p>
        </header>

        <Card padding="lg">
          <form
            onSubmit={handleCompleteProfile}
            noValidate
            className="flex flex-col gap-4"
          >
            <Field
              id="auth-username"
              label="Username"
              error={errors.username}
              hint={
                checkingUsername
                  ? 'Lagi ngecek username...'
                  : 'Nama yang tampil di leaderboard. Huruf kecil, angka, atau underscore.'
              }
            >
              <input
                id="auth-username"
                ref={usernameInputRef}
                name="username"
                type="text"
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  usernameRef.current = e.target.value.trim()
                  setErrors((prev) => ({ ...prev, username: undefined }))
                }}
                onBlur={handleUsernameBlur}
                placeholder="pejuangnip"
                maxLength={USERNAME_MAX_LENGTH}
                aria-invalid={Boolean(errors.username)}
                aria-describedby={
                  errors.username ? 'auth-username-error' : undefined
                }
                className={INPUT_CLASS}
              />
            </Field>

            {submitError && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800"
              >
                {submitError}
              </p>
            )}

            <Button type="submit" size="lg" fullWidth disabled={loading}>
              {loading ? 'Sebentar ya...' : 'Simpan dan mulai'}
            </Button>
          </form>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-5">
      <header className="flex flex-col items-center text-center">
        <span className="blob-soft flex h-28 w-28 items-center justify-center bg-primary-100">
          <Mascot
            mood={mode === 'daftar' ? 'semangat' : 'senang'}
            size={88}
            className="float-soft"
          />
        </span>
        <p className="mt-4 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-ink shadow-soft">
          Hai! Aku {MASCOT_NAME}, teman belajarmu.
        </p>
        <p className="kicker mt-4">
          {mode === 'masuk'
            ? 'selamat datang kembali'
            : 'gabung dan mulai naik peringkat'}
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">
          {mode === 'masuk' ? 'Masuk' : 'Daftar'}
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-ink/60">
          {mode === 'masuk'
            ? 'Masuk buat ikut leaderboard mingguan dan nyimpen skor tryout-mu.'
            : 'Satu akun buat ikut leaderboard mingguan, nyimpen skor tryout, dan pamer peringkatmu.'}
        </p>
      </header>

      <Card padding="lg">
        {/* Toggle mode */}
        <div
          className="grid grid-cols-2 gap-1 rounded-full bg-ink/5 p-1"
          role="tablist"
          aria-label="Pilih masuk atau daftar"
        >
          {(
            [
              { value: 'masuk', label: 'Masuk' },
              { value: 'daftar', label: 'Daftar' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={mode === tab.value}
              onClick={() => switchMode(tab.value)}
              className={cx(
                'rounded-full px-4 py-2 text-sm font-extrabold transition-all',
                mode === tab.value
                  ? 'bg-primary-600 text-white shadow-soft'
                  : 'text-ink/60 hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="lg"
          fullWidth
          onClick={handleGoogle}
          disabled={googleLoading}
          className="mt-5"
        >
          <GoogleIcon width={20} height={20} />
          {googleLoading ? 'Mengalihkan ke Google...' : 'Masuk dengan Google'}
        </Button>

        <div className="mt-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-line" />
          <span className="text-xs font-bold text-ink/50">
            atau pakai email
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-5 flex flex-col gap-4"
        >
          <Field id="auth-email" label="Email" error={errors.email}>
            <input
              id="auth-email"
              ref={emailInputRef}
              name="email"
              type="email"
              autoComplete="username"
              enterKeyHint="next"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'auth-email-error' : undefined}
              className={INPUT_CLASS}
            />
          </Field>

          <Field
            id="auth-password"
            label="Password"
            error={errors.password}
            hint={
              mode === 'daftar'
                ? `Minimal ${PASSWORD_MIN_LENGTH} karakter`
                : undefined
            }
          >
            <div className="relative">
              <input
                id="auth-password"
                ref={passwordInputRef}
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={
                  mode === 'daftar' ? 'new-password' : 'current-password'
                }
                enterKeyHint={mode === 'daftar' ? 'next' : 'done'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password-mu"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? 'auth-password-error' : undefined
                }
                className={`${INPUT_CLASS} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword
                    ? 'Sembunyikan password'
                    : 'Tampilkan password'
                }
                aria-pressed={showPassword}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-ink/50 transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-600"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </Field>

          {mode === 'daftar' && (
            <Field
              id="auth-username"
              label="Username"
              error={errors.username}
              hint={
                checkingUsername
                  ? 'Lagi ngecek username...'
                  : 'Nama yang tampil di leaderboard. Huruf kecil, angka, atau underscore.'
              }
            >
              <input
                id="auth-username"
                ref={usernameInputRef}
                name="username"
                type="text"
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  usernameRef.current = e.target.value.trim()
                  setErrors((prev) => ({ ...prev, username: undefined }))
                }}
                onBlur={handleUsernameBlur}
                placeholder="pejuangnip"
                maxLength={USERNAME_MAX_LENGTH}
                aria-invalid={Boolean(errors.username)}
                aria-describedby={
                  errors.username ? 'auth-username-error' : undefined
                }
                className={INPUT_CLASS}
              />
            </Field>
          )}

          {submitError && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800"
            >
              {submitError}
            </p>
          )}

          <Button type="submit" size="lg" fullWidth disabled={loading}>
            {loading ? 'Sebentar ya...' : mode === 'masuk' ? 'Masuk' : 'Buat akun'}
          </Button>

          <p className="text-center text-xs leading-relaxed font-medium text-ink/60">
            {mode === 'masuk' ? (
              <>
                Belum punya akun?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('daftar')}
                  className="font-extrabold text-primary-700 underline underline-offset-2"
                >
                  Daftar dulu
                </button>
              </>
            ) : (
              <>
                Udah punya akun?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('masuk')}
                  className="font-extrabold text-primary-700 underline underline-offset-2"
                >
                  Masuk aja
                </button>
              </>
            )}
          </p>
        </form>
      </Card>

      {mode === 'daftar' && (
        <Card padding="md" className="card-lift flex flex-col gap-2">
          <p className="flex items-center gap-2 font-display text-base font-extrabold">
            <SparklesIcon
              width={18}
              height={18}
              className="shrink-0 text-accent-500"
            />
            Daftar gratis, langsung dapat misi harian
          </p>
          <ul className="flex flex-col gap-1.5 text-sm font-medium text-ink/70">
            <li className="flex items-center gap-2">
              <GamepadIcon
                width={18}
                height={18}
                className="shrink-0 text-primary-600"
              />
              Kumpulin XP dan naik level tiap latihan
            </li>
            <li className="flex items-center gap-2">
              <CrownIcon
                width={18}
                height={18}
                className="shrink-0 text-primary-600"
              />
              Rebut peringkat 1 leaderboard mingguan
            </li>
          </ul>
        </Card>
      )}
    </div>
  )
}

interface FieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}

/**
 * Ikon mata dan mata-tercoret lokal untuk tombol show/hide password.
 * Gaya garis Lucide seperti icons.tsx (icons.tsx tidak punya ikon mata
 * dan tidak diubah). aria-hidden karena tombolnya sudah punya
 * aria-label.
 */
function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </svg>
  )
}

function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-extrabold">
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          className="mt-1.5 text-xs font-semibold text-red-700"
        >
          {error}
        </p>
      ) : (
        hint && (
          <p className="mt-1.5 text-xs font-medium text-ink/60">{hint}</p>
        )
      )}
    </div>
  )
}
