import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthUser } from '../lib/auth'
import { getPremiumStatus, PREMIUM_BETA_MESSAGE } from '../lib/premium'
import { useStore } from '../lib/store'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  weaknessRowsFromStats,
  weakestRow,
} from '../lib/weakness'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { GuestProgressWarning } from '../components/GuestProgressWarning'
import { StickyBackButton } from '../components/belajar/StickyBackButton'
import { WeaknessMap } from '../components/WeaknessMap'
import { CrownIcon } from '../components/icons'

/**
 * Halaman Peta Kelemahan (v2.8.1, fitur Premium): akurasi per
 * subtopik dari jawaban yang sudah tercatat, ditampilkan sebagai
 * peta petualangan interaktif dengan Osi sebagai pemandu, paling
 * lemah di awal jalur.
 *
 * Premium dicek persis seperti tempat lain (getPremiumStatus, yang
 * membaca is_premium dari toggle Premium Beta + premium_until):
 * selama beta, user yang mengaktifkan Premium Beta dari Profil
 * melihat peta lengkap. User free melihat peta yang sama dalam
 * keadaan terkunci (node abu-abu, nama subtopik tetap terlihat,
 * tanpa angka akurasi), plus ajakan upgrade. Tidak ada angka palsu
 * di mana pun.
 */
export function PetaKelemahanPage() {
  const { user, loading: authLoading } = useAuthUser()
  const { topicStats } = useStore()
  const [premium, setPremium] = useState(false)
  const [premiumChecked, setPremiumChecked] = useState(false)
  const configured = isSupabaseConfigured()

  const userId = user?.id ?? null

  useEffect(() => {
    if (authLoading) return
    if (!configured || !userId) {
      setPremiumChecked(true)
      return
    }
    let cancelled = false
    getPremiumStatus(userId).then((status) => {
      if (cancelled) return
      setPremium(status.premium)
      setPremiumChecked(true)
    })
    return () => {
      cancelled = true
    }
  }, [authLoading, configured, userId])

  const rows = useMemo(
    () => weaknessRowsFromStats(topicStats),
    [topicStats],
  )
  const weakest = useMemo(() => weakestRow(rows), [rows])

  const checking = authLoading || !premiumChecked

  return (
    <div className="flex flex-col gap-5">
      <GuestProgressWarning />

      {/* Tombol back (v2.9): halaman ini dicapai dari Latihan. */}
      <StickyBackButton to="/latihan" />

      <header>
        <p className="kicker">biar latihannya tepat sasaran</p>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-3xl font-extrabold">
          Peta Kelemahan
          <Badge tone="amber">
            <span className="inline-flex items-center gap-1">
              <CrownIcon width={13} height={13} />
              Premium
            </span>
          </Badge>
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink/60">
          Akurasimu per subtopik, dihitung dari semua jawaban yang sudah
          kamu kerjakan di drill, tryout, dan ulasan. Yang paling lemah
          tampil paling atas, biar kamu tahu harus mulai dari mana.
        </p>
      </header>

      {checking ? (
        <Card className="p-6 text-center">
          <p className="text-sm font-medium text-ink/60">
            Memuat peta kelemahan...
          </p>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="font-display text-lg font-bold">
            Petanya masih kosong nih
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink/60">
            Kamu belum mengerjakan soal apa pun, jadi belum ada akurasi
            yang bisa dipetakan. Kerjakan satu drill dulu, nanti peta
            kelemahanmu muncul di sini.
          </p>
          <Link to="/latihan" className="mt-4 inline-block">
            <Button>Mulai latihan</Button>
          </Link>
        </Card>
      ) : premium ? (
        <WeaknessMap rows={rows} weakest={weakest} />
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="border-accent-200 bg-accent-50">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-400 text-ink">
                <CrownIcon width={20} height={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold">
                  Peta lengkap itu fitur Premium
                </p>
                <p className="mt-0.5 text-xs leading-relaxed font-medium text-ink/60">
                  Akurasi tiap subtopik, sorotan area terlemah, dan
                  latihan yang disarankan baru kelihatan kalau kamu
                  premium. {PREMIUM_BETA_MESSAGE}, gratis selama beta.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {userId ? (
                    <Link to="/profil">
                      <Button size="sm">Ke halaman Profil</Button>
                    </Link>
                  ) : (
                    <Link to="/auth">
                      <Button size="sm">Daftar gratis</Button>
                    </Link>
                  )}
                  <Link to="/latihan">
                    <Button size="sm" variant="outline">
                      Tetap latihan dulu
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </Card>

          <WeaknessMap
            rows={rows}
            weakest={null}
            locked
            upgradeTo={userId ? '/profil' : '/auth'}
          />
        </div>
      )}
    </div>
  )
}
