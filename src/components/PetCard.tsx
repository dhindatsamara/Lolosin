/**
 * Kartu peliharaan di dashboard (v2.3.2: pindah dari full-width ke
 * kolom kiri di bawah WeekStreak): maskot + outfit pilihan, nama
 * stage, progres ke milestone berikut, picker outfit ("Gaya Osi"),
 * dan tombol bagikan foto + bagikan teks.
 *
 * Layout ditumpuk vertikal (bukan baris) supaya muat di kolom
 * setengah lebar desktop maupun full-width mobile tanpa overflow.
 *
 * Picker outfit: user memilih outfit yang sudah TERBUKA sesuai
 * stage streak; outfit terkunci tampil abu-abu dengan syarat
 * streaknya. Pilihan tersimpan per-user (localStorage namespaced,
 * lihat src/lib/pet.ts); default = outfit tertinggi yang terbuka.
 * Bila streak putus lalu pilihan jadi terkunci lagi, tampilan jatuh
 * ke outfit tertinggi yang masih terbuka.
 *
 * Bagikan foto: kartu PNG 1080x1350 lewat canvas (lihat
 * src/lib/shareCard.ts), Web Share API dengan files bila didukung,
 * fallback unduh PNG. Bagikan teks: sharePet seperti sebelumnya.
 * Umpan balik tampil di bubble role="status" DI LUAR tombol,
 * disembunyikan dengan opacity (bukan display none) supaya tetap
 * diumumkan screen reader, dan tombol tidak pernah di-disable supaya
 * bisa ditekan ulang.
 */
import { useEffect, useRef, useState } from 'react'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { ProgressBar } from './ui/ProgressBar'
import { Mascot } from './Mascot'
import { CameraIcon, FlameIcon, ShareIcon } from './icons'
import { getLevel, useStore } from '../lib/store'
import {
  getPetStage,
  getUnlockedOutfits,
  OUTFIT_LABELS,
  PET_STAGES,
  resolveOutfit,
  setChosenOutfit,
  useChosenOutfit,
} from '../lib/pet'
import { sharePet } from '../lib/share'
import { sharePetPhoto } from '../lib/shareCard'
import { MASCOT_NAME } from '../lib/mascot'
import { cx } from '../lib/utils'

type ShareState =
  | 'idle'
  | 'copied'
  | 'shared'
  | 'downloaded'
  | 'failed'
  | 'photoFailed'

const SHARE_MESSAGES: Record<Exclude<ShareState, 'idle'>, string> = {
  copied: 'Tautan disalin',
  shared: 'Dibagikan',
  downloaded: 'Foto tersimpan',
  failed: 'Gagal membagikan, coba lagi',
  photoFailed: 'Gagal membuat foto, coba lagi',
}

export function PetCard() {
  const { streak, streakBroken, xp } = useStore()
  const { stage, next, remaining } = getPetStage(streak)
  const chosenOutfit = useChosenOutfit()
  const outfit = resolveOutfit(streak, chosenOutfit)
  const unlocked = getUnlockedOutfits(streak)
  const [shareState, setShareState] = useState<ShareState>('idle')
  const timer = useRef<number | undefined>(undefined)
  // Pembungkus maskot utama (bukan mini maskot di picker): SVG-nya
  // diserialisasi jadi gambar di kartu berbagi foto.
  const mascotWrapRef = useRef<HTMLSpanElement | null>(null)

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
    },
    [],
  )

  function showFeedback(nextState: Exclude<ShareState, 'idle'>) {
    setShareState(nextState)
    // Tekan beruntun: timer lama dibersihkan, umpan balik mulai lagi.
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setShareState('idle')
    }, 2500)
  }

  async function handleSharePhoto() {
    const svg = mascotWrapRef.current?.querySelector('svg') ?? null
    const result = await sharePetPhoto(svg, {
      streak,
      xp,
      level: getLevel(xp),
      stageName: stage.nama,
    })
    // User menutup sheet berbagi: bukan kegagalan, diam saja.
    if (result === 'cancelled') return
    if (result === 'failed') {
      showFeedback('photoFailed')
      return
    }
    showFeedback(result)
  }

  async function handleShareText() {
    const result = await sharePet(streak)
    // User menutup sheet berbagi: bukan kegagalan, diam saja.
    if (result === 'cancelled') return
    showFeedback(result)
  }

  return (
    <Card className="border-primary-200 bg-primary-50 p-5">
      <div className="flex flex-col items-center text-center">
        {/* Saat streak putus, Osi ngambek (mood marah). Logika outfit
            streak tidak berubah. */}
        <span ref={mascotWrapRef} className="inline-flex">
          <Mascot
            mood={streakBroken ? 'marah' : 'senang'}
            size={120}
            outfit={outfit}
            className="float-soft h-auto w-28"
          />
        </span>
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-extrabold text-twk shadow-soft">
          <FlameIcon width={14} height={14} />
          Streak {streak} hari
        </span>
        <p className="kicker mt-3">Peliharaanmu</p>
        <h2 className="mt-1 font-display text-xl font-extrabold">
          {stage.nama}
        </h2>
        <p className="mt-1 text-sm leading-relaxed font-medium text-ink/70">
          {stage.deskripsi}
        </p>
        {next ? (
          <div className="mt-3 w-full">
            <ProgressBar
              value={streak - stage.minStreak}
              max={next.minStreak - stage.minStreak}
              tone="primary"
              label={`Progres menuju ${next.nama}`}
            />
            <p className="mt-1.5 text-xs font-bold text-ink/60">
              {remaining} hari lagi menuju {next.nama}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm font-bold text-primary-700">
            Kamu sudah sampai tahap tertinggi. Pertahankan streak-mu.
          </p>
        )}

        {/* Picker outfit: mini maskot per outfit, terkunci bila syarat
            streak belum terpenuhi. */}
        <div className="mt-4 w-full border-t border-dashed border-line pt-4">
          <p className="text-xs font-extrabold tracking-wide text-ink/60 uppercase">
            Gaya {MASCOT_NAME}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {PET_STAGES.map((s) => {
              const isUnlocked = unlocked.includes(s.outfit)
              const isSelected = outfit === s.outfit
              const label = OUTFIT_LABELS[s.outfit]
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!isUnlocked}
                  aria-pressed={isSelected}
                  aria-label={
                    isUnlocked
                      ? `Gaya ${label}`
                      : `Gaya ${label}, terkunci, butuh streak ${s.minStreak} hari`
                  }
                  onClick={() => setChosenOutfit(s.outfit)}
                  className={cx(
                    'flex w-[4.25rem] flex-col items-center gap-0.5 rounded-2xl border-2 px-1 py-2 transition-colors',
                    isSelected
                      ? 'border-primary-600 bg-white shadow-soft'
                      : 'border-line bg-white/60 hover:border-primary-300',
                    !isUnlocked && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <Mascot
                    mood="senang"
                    size={44}
                    outfit={s.outfit}
                    className={cx(
                      'h-auto w-11',
                      !isUnlocked && 'opacity-50 grayscale',
                    )}
                  />
                  <span className="text-[11px] leading-tight font-extrabold">
                    {label}
                  </span>
                  {!isUnlocked && (
                    <span className="text-[10px] leading-tight font-bold text-ink/50">
                      streak {s.minStreak} hari
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Bagikan: foto (utama) + teks (opsi kedua). */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" onClick={handleSharePhoto}>
            <CameraIcon width={16} height={16} />
            Bagikan foto
          </Button>
          <Button size="sm" variant="outline" onClick={handleShareText}>
            <ShareIcon width={16} height={16} />
            Bagikan teks
          </Button>
          {/* Bubble status: selalu di DOM, sembunyi via opacity */}
          <span
            role="status"
            className={cx(
              'w-full text-xs font-extrabold transition-opacity',
              shareState === 'idle'
                ? 'opacity-0'
                : 'text-primary-700 opacity-100',
            )}
          >
            {shareState === 'idle' ? '' : SHARE_MESSAGES[shareState]}
          </span>
        </div>
      </div>
    </Card>
  )
}
