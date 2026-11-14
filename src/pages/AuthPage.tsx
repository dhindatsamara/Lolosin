import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  isUsernameAvailable,
  isValidUsername,
  resendConfirmation,
  signIn,
  signUp,
  getSession,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_TAKEN_MESSAGE,
} from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'
import { cx } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { CheckIcon } from '../components/icons'

type Mode = 'masuk' | 'daftar'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_MIN_LENGTH = 6

const INPUT_CLASS =
  'w-full rounded-xl border-2 border-ink bg-white px-3.5 py-2.5 text-sm font-medium outline-none placeholder:text-ink/60 focus:border-primary-600 focus:ring-2 focus:ring-primary-100'

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
 */
export default function AuthPage() {
  const navigate = useNavigate()
  const configured = isSupabaseConfigured()

  const [mode, setMode] = useState<Mode>('masuk')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [formasi, setFormasi] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(
    null,
  )
  const [resendSent, setResendSent] = useState(false)
  const [resendError, setResendError] = useState('')
  const [checkingUsername, setCheckingUsername] = useState(false)
  const usernameRef = useRef('')

  // Bila sudah login, tidak ada urusan di halaman ini, balik ke beranda.
  useEffect(() => {
    if (!configured) return
    let cancelled = false
    getSession().then((session) => {
      if (!cancelled && session) navigate('/', { replace: true })
    })
    return () => {
      cancelled = true
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
        next.username = `Username ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} karakter, huruf, angka, atau underscore aja ya`
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  /** Cek ketersediaan username saat field ditinggalkan (mode daftar). */
  async function handleUsernameBlur() {
    if (mode !== 'daftar') return
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

      const { needsConfirmation } = await signUp(
        email,
        password,
        username,
        formasi,
      )
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
      <div className="flex flex-col gap-5">
        <header>
          <p className="font-script text-2xl leading-none text-primary-700">
            akunmu, progresmu
          </p>
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
      <div className="flex flex-col gap-5">
        <header>
          <p className="font-script text-2xl leading-none text-primary-700">
            hampir jadi, satu langkah lagi
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold">
            Cek emailmu
          </h1>
        </header>
        <Card padding="lg" className="flex flex-col gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink bg-primary-100 text-primary-700 shadow-sticker-sm">
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
            <p className="rounded-xl border-2 border-ink bg-primary-50 px-3.5 py-2.5 text-sm font-semibold text-primary-700 shadow-sticker-sm">
              Email terkirim, cek inbox ya.
            </p>
          )}
          {resendError && (
            <p className="rounded-xl border-2 border-ink bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800 shadow-sticker-sm">
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

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="font-script text-2xl leading-none text-primary-700">
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
          className="grid grid-cols-2 gap-1 rounded-full border-2 border-ink bg-paper p-1"
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
                  ? 'bg-primary-600 text-white shadow-sticker-sm'
                  : 'text-ink/60 hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="mt-5 flex flex-col gap-4"
        >
          <Field
            id="auth-email"
            label="Email"
            error={errors.email}
          >
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={
                errors.email ? 'auth-email-error' : undefined
              }
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
            <input
              id="auth-password"
              type="password"
              autoComplete={
                mode === 'daftar' ? 'new-password' : 'current-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password-mu"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={
                errors.password ? 'auth-password-error' : undefined
              }
              className={INPUT_CLASS}
            />
          </Field>

          {mode === 'daftar' && (
            <>
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
                  type="text"
                  autoComplete="username"
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

              <Field
                id="auth-formasi"
                label="Formasi yang dituju"
                hint="Opsional. Boleh dikosongkan, dan dipakai buat leaderboard per formasi."
              >
                <input
                  id="auth-formasi"
                  type="text"
                  autoComplete="off"
                  value={formasi}
                  onChange={(e) => setFormasi(e.target.value)}
                  placeholder="Mis. Analis Kebijakan"
                  className={INPUT_CLASS}
                />
              </Field>
            </>
          )}

          {submitError && (
            <p
              role="alert"
              className="rounded-xl border-2 border-ink bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-800 shadow-sticker-sm"
            >
              {submitError}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            fullWidth
            disabled={loading}
          >
            {loading
              ? 'Sebentar ya...'
              : mode === 'masuk'
                ? 'Masuk'
                : 'Buat akun'}
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

function Field({ id, label, hint, error, children }: FieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-extrabold"
      >
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
