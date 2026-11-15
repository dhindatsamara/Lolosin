/**
 * Lonceng notifikasi di header (v2.3.4): satu-satunya pintu masuk
 * global untuk undangan battle 1v1.
 *
 * Masalah yang dipecahkan: undangan battle sebelumnya HANYA terlihat
 * di halaman Battle ("Undangan battle masuk"), jadi user yang diundang
 * tidak tahu kalau tidak membuka halaman itu. Sekarang lonceng di
 * header menampilkan badge jumlah undangan yang belum dibaca, dan
 * panel dropdown-nya memuat daftar undangan dengan tombol Terima dan
 * Tolak yang sama seperti di lobi battle.
 *
 * Aturan:
 * - Hanya tampil saat user login (undangan butuh akun). Mode tamu
 *   dan Supabase belum terkonfigurasi: tidak ada lonceng sama sekali.
 * - Undangan dimuat saat mount lalu polling tiap 3 detik, mengikuti
 *   pola polling BattlePage (POLL_MS). Tanpa Realtime baru.
 * - Badge hilang begitu panel dibuka; undangan tetap ada di panel
 *   sampai diterima atau ditolak. Undangan BARU yang datang setelah
 *   panel dibuka memunculkan badge lagi.
 * - Terima: acceptBattleInvite lalu navigasi ke arena battle
 *   (/main/battle/:code, BattlePage langsung masuk arena karena
 *   status battle sudah 'active'). Tolak: abandonBattle lalu
 *   undangan hilang dari daftar, sama seperti di lobi battle.
 * - Hanya undangan battle. Bukan sistem notifikasi umum (hadiah juara
 *   mingguan dan semacamnya tidak masuk sini).
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthUser } from '../lib/auth'
import {
  abandonBattle,
  acceptBattleInvite,
  deriveBattleCategoryFromIds,
  getBattleUsernames,
  getIncomingInvites,
  type BattleCategory,
  type BattleRow,
} from '../lib/battle'
import { isSupabaseConfigured } from '../lib/supabase'
import { Button } from './ui/Button'

/** Interval polling undangan, sama seperti BattlePage (POLL_MS). */
const POLL_MS = 3000

/** Label kategori untuk chip tampilan (sama seperti di BattlePage). */
const CATEGORY_LABEL: Record<BattleCategory, string> = {
  TWK: 'TWK',
  TIU: 'TIU',
  TKP: 'TKP',
  campur: 'Campur',
}

/** Warna chip kategori, mengikuti aksen subtes (sama seperti BattlePage). */
const CATEGORY_CHIP: Record<BattleCategory, string> = {
  TWK: 'bg-twk-soft text-twk',
  TIU: 'bg-tiu-soft text-tiu',
  TKP: 'bg-tkp-soft text-tkp',
  campur: 'bg-primary-50 text-primary-700',
}

/** Ikon lonceng inline (gaya Lucide, seperti ikon di Layout). */
function BellIcon() {
  return (
    <svg
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
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

export function NotificationBell() {
  const configured = isSupabaseConfigured()
  const { user, loading } = useAuthUser()
  const navigate = useNavigate()
  const userId = user?.id ?? null

  const [invites, setInvites] = useState<BattleRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [open, setOpen] = useState(false)
  /** Id undangan yang sudah dilihat (panel pernah dibuka saat undangan
      itu ada). Dipakai menghitung badge; undangan baru yang belum
      pernah dilihat tetap memunculkan badge. */
  const [seenIds, setSeenIds] = useState<string[]>([])
  /** Id undangan yang sedang diproses (Terima/Tolak), supaya tombol
      tidak bisa ditekan dua kali. */
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  /* Muat undangan saat mount + polling. Gagal baca tidak merusak
     header, daftarnya tinggal kosong (getIncomingInvites tidak
     pernah melempar). */
  useEffect(() => {
    if (!configured || !userId) {
      setInvites([])
      return
    }
    let cancelled = false
    const load = () => {
      getIncomingInvites(userId).then((rows) => {
        if (cancelled) return
        setInvites(rows)
        const hostIds = rows.map((row) => row.host_id)
        if (hostIds.length > 0) {
          getBattleUsernames(hostIds).then((map) => {
            if (!cancelled) {
              setNames((prev) => ({ ...prev, ...map }))
            }
          })
        }
      })
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [configured, userId])

  /* Klik di luar panel atau tombol Escape menutup panel. */
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open ])

  /* Lonceng hanya untuk user login. Loading auth: sembunyi dulu
     supaya tidak berkedip. */
  if (!configured || loading || !user) return null

  const unseen = invites.filter((invite) => !seenIds.includes(invite.id))

  function toggleOpen() {
    if (open) {
      setOpen(false)
      return
    }
    // Badge hilang begitu panel dibuka; undangan tetap ada sampai
    // diterima atau ditolak.
    setSeenIds((prev) =>
      Array.from(new Set([...prev, ...invites.map((i) => i.id)])),
    )
    setMessage(null)
    setOpen(true)
  }

  /* Terima undangan: battle langsung mulai, navigasi ke arena. */
  async function handleAccept(invite: BattleRow) {
    if (!userId || busyId) return
    setBusyId(invite.id)
    setMessage(null)
    const accepted = await acceptBattleInvite(invite, userId)
    setBusyId(null)
    if (!accepted.ok || !accepted.data) {
      setMessage(accepted.error ?? 'Gagal menerima undangan, coba lagi ya.')
      return
    }
    setInvites((prev) => prev.filter((row) => row.id !== invite.id))
    setOpen(false)
    navigate(`/main/battle/${accepted.data.code}`)
  }

  /* Tolak undangan: sesi dibatalkan, undangan hilang dari daftar. */
  async function handleDecline(invite: BattleRow) {
    if (busyId) return
    setBusyId(invite.id)
    await abandonBattle(invite.id)
    setBusyId(null)
    setInvites((prev) => prev.filter((row) => row.id !== invite.id))
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={
          unseen.length > 0
            ? `Notifikasi, ${unseen.length} undangan battle baru`
            : 'Notifikasi'
        }
        aria-expanded={open}
        aria-haspopup="true"
        title="Notifikasi"
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-line bg-white text-ink/70 shadow-soft transition-colors hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500"
      >
        <BellIcon />
        {unseen.length > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-extrabold text-white"
          >
            {unseen.length > 9 ? '9+' : unseen.length}
          </span>
        )}
      </button>
      {open && (
        <div
          role="region"
          aria-label="Notifikasi undangan battle"
          className="absolute top-full right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-white p-3 shadow-soft"
        >
          <p className="px-1 font-display text-base font-extrabold">
            Notifikasi
          </p>
          <p className="mt-0.5 px-1 text-xs font-medium text-ink/60">
            Undangan battle 1v1 dari temanmu.
          </p>
          {message && (
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {message}
            </p>
          )}
          {invites.length === 0 ? (
            <p className="py-6 text-center text-sm font-medium text-ink/60">
              Belum ada undangan
            </p>
          ) : (
            <ul className="mt-2 flex max-h-80 flex-col gap-2 overflow-y-auto">
              {invites.map((invite) => {
                const category = deriveBattleCategoryFromIds(
                  invite.question_ids,
                )
                const busy = busyId === invite.id
                return (
                  <li
                    key={invite.id}
                    className="flex flex-col gap-2 rounded-xl border border-line bg-paper px-3 py-2.5"
                  >
                    <p className="text-sm leading-snug text-ink/70">
                      <span className="font-bold text-ink">
                        {names[invite.host_id] ?? 'Seorang pejuang'}
                      </span>{' '}
                      mengajakmu battle 1v1.
                    </p>
                    <p>
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-extrabold ${CATEGORY_CHIP[category]}`}
                      >
                        Kategori: {CATEGORY_LABEL[category]}
                      </span>
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleAccept(invite)}
                        disabled={busyId !== null}
                      >
                        {busy ? 'Sebentar...' : 'Terima'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDecline(invite)}
                        disabled={busyId !== null}
                      >
                        Tolak
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <Link
            to="/main/battle"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-xl px-1 py-2 text-center text-sm font-bold text-primary-700 hover:bg-primary-50"
          >
            Buka halaman Battle
          </Link>
        </div>
      )}
    </div>
  )
}
