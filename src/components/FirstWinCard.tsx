import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthUser } from '../lib/auth'
import { shareText, type ShareTextResult } from '../lib/share'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { ShareIcon } from './icons'

type ShareFeedback = 'idle' | 'shared' | 'copied' | 'failed'

const SHARE_MESSAGES: Record<Exclude<ShareFeedback, 'idle'>, string> = {
  shared: 'Dibagikan',
  copied: 'Tautan disalin',
  failed: 'Gagal membagikan, coba lagi',
}

/**
 * Kartu perayaan kemenangan pertama (v2.8): muncul sekali saja,
 * setelah drill pertama dengan skor >= 70% atau tryout pertama
 * selesai. Isinya ajakan berbagi hasil (jalur berbagi teks share.ts
 * yang sudah diperbaiki di v2.7) dan, untuk tamu, ajakan daftar
 * dengan penjelasan jujur bahwa progres tamu hanya tersimpan di
 * memori selama halaman terbuka.
 */
export function FirstWinCard({
  heading,
  body,
  shareText: textToShare,
}: {
  /** Judul perayaan, misal "Kemenangan pertamamu!" */
  heading: string
  /** Satu-dua kalimat tentang hasil yang baru diraih. */
  body: string
  /** Teks hasil yang dibagikan (dibuat lib/firstWin.ts). */
  shareText: string
}) {
  const { user, loading } = useAuthUser()
  const [feedback, setFeedback] = useState<ShareFeedback>('idle')
  const [sharing, setSharing] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
    },
    [],
  )

  async function handleShare() {
    if (sharing) return
    setSharing(true)
    let result: ShareTextResult
    try {
      result = await shareText(textToShare)
    } catch {
      result = 'failed'
    }
    setSharing(false)
    // User menutup sheet berbagi: bukan kegagalan, diam saja.
    if (result === 'cancelled') return
    setFeedback(result)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setFeedback('idle')
    }, 2500)
  }

  const isGuest = !loading && user === null

  return (
    <Card className="border-accent-200 bg-accent-50">
      <div className="flex flex-col gap-3 text-center">
        <p className="text-4xl" aria-hidden="true">
          🎉
        </p>
        <div>
          <h2 className="font-display text-xl font-extrabold">{heading}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-ink/70">
            {body}
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => void handleShare()}
            disabled={sharing}
          >
            <ShareIcon width={16} height={16} />
            {sharing ? 'Membagikan...' : 'Bagikan hasilmu'}
          </Button>
          {feedback !== 'idle' && (
            <p className="text-sm font-bold text-primary-700" role="status">
              {SHARE_MESSAGES[feedback]}
            </p>
          )}
        </div>
        {isGuest && (
          <div className="rounded-xl bg-white px-3.5 py-3 text-left shadow-soft">
            <p className="text-sm leading-relaxed font-medium text-ink/70">
              Kamu masih main sebagai tamu, jadi progresmu hanya
              tersimpan selama halaman ini terbuka. Daftar gratis biar
              progresmu tersimpan dan bisa lanjut di HP lain.
            </p>
            <Link to="/auth" className="mt-2 inline-block">
              <Button size="sm">Daftar gratis</Button>
            </Link>
          </div>
        )}
      </div>
    </Card>
  )
}
