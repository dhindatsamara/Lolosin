/**
 * Kartu peliharaan di dashboard: maskot + outfit sesuai streak,
 * nama stage, progres ke milestone berikut, dan tombol Bagikan.
 *
 * Tombol Bagikan memakai sharePet (Web Share API, fallback salin
 * tautan). Umpan balik ("Tautan disalin" dan kawan-kawan) tampil di
 * bubble role="status" DI LUAR tombol, disembunyikan dengan opacity
 * (bukan display none) supaya tetap diumumkan screen reader, dan
 * tombol tidak pernah di-disable supaya bisa ditekan ulang.
 */
import { useEffect, useRef, useState } from 'react'
import { Card } from './ui/Card'
import { Button } from './ui/Button'
import { ProgressBar } from './ui/ProgressBar'
import { Mascot } from './Mascot'
import { FlameIcon, ShareIcon } from './icons'
import { useStore } from '../lib/store'
import { getPetStage } from '../lib/pet'
import { sharePet } from '../lib/share'
import { cx } from '../lib/utils'

type ShareState = 'idle' | 'copied' | 'shared' | 'failed'

const SHARE_MESSAGES: Record<Exclude<ShareState, 'idle'>, string> = {
  copied: 'Tautan disalin',
  shared: 'Dibagikan',
  failed: 'Gagal membagikan, coba lagi',
}

export function PetCard() {
  const { streak } = useStore()
  const { stage, next, remaining } = getPetStage(streak)
  const [shareState, setShareState] = useState<ShareState>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
    },
    [],
  )

  async function handleShare() {
    const result = await sharePet(streak)
    // User menutup sheet berbagi: bukan kegagalan, diam saja.
    if (result === 'cancelled') return
    setShareState(result)
    // Tekan beruntun: timer lama dibersihkan, umpan balik mulai lagi.
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setShareState('idle')
    }, 2000)
  }

  return (
    <Card className="border-primary-200 bg-primary-50 p-5 lg:p-6">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
        <div className="flex shrink-0 flex-col items-center">
          <Mascot
            mood="senang"
            size={120}
            outfit={stage.outfit}
            className="float-soft h-auto w-28 lg:w-32"
          />
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-extrabold text-twk shadow-soft">
            <FlameIcon width={14} height={14} />
            Streak {streak} hari
          </span>
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="kicker">Peliharaanmu</p>
          <h2 className="mt-1 font-display text-xl font-extrabold lg:text-2xl">
            {stage.nama}
          </h2>
          <p className="mt-1 text-sm leading-relaxed font-medium text-ink/70">
            {stage.deskripsi}
          </p>
          {next ? (
            <div className="mt-3">
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
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <Button size="sm" variant="outline" onClick={handleShare}>
              <ShareIcon width={16} height={16} />
              Bagikan
            </Button>
            {/* Bubble status: selalu di DOM, sembunyi via opacity */}
            <span
              role="status"
              className={cx(
                'text-xs font-extrabold transition-opacity',
                shareState === 'idle'
                  ? 'opacity-0'
                  : 'text-primary-700 opacity-100',
              )}
            >
              {shareState === 'idle'
                ? ''
                : SHARE_MESSAGES[shareState]}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}
