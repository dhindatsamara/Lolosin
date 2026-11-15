import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from '../ui/Button'
import { PlayIcon } from '../icons'

export interface ConfirmModalProps {
  /** Modal terbuka atau tidak. Dialog selalu ter-render; buka/tutup lewat showModal/close. */
  open: boolean
  /** Judul modal, mis. "Mulai sekarang?" atau "Yakin mau keluar?". */
  title: string
  /** Nama mode yang dikonfirmasi, mis. "Tryout kilat". Opsional; baris subjudul hanya tampil bila modeLabel atau summary diisi. */
  modeLabel?: string
  /** Ringkasan mode, mis. "30 soal · 27 menit". Opsional. */
  summary?: string
  /** Isi kotak penjelasan. Bila tidak diisi, tampil catatan timer tryout (dipakai konfirmasi mulai tryout). */
  body?: string
  /** Label tombol konfirmasi. Default "Mulai". */
  confirmLabel?: string
  /** Label tombol batal. Default "Batalkan". */
  cancelLabel?: string
  /** Ikon di samping judul. Default PlayIcon. */
  icon?: ReactNode
  /** Dipanggil saat user menekan tombol konfirmasi. */
  onConfirm: () => void
  /** Dipanggil saat modal ditutup tanpa konfirmasi (tombol batal, Esc, klik luar). */
  onCancel: () => void
}

/**
 * Modal konfirmasi umum, native `<dialog>` (modal, via `showModal()`).
 *
 * Dipakai semua konfirmasi aksi penting: mulai tryout, batal tryout,
 * keluar (logout), akhiri drill, batal/keluar battle, keluar sesi,
 * dan akhiri sesi host. Tiap pemakaian mengatur judul, isi, dan label
 * tombolnya sendiri; perilakunya (light dismiss, Esc, fokus awal)
 * sama di semua tempat.
 *
 * - Light dismiss: `closedby="any"` + fallback pointerdown/pointerup
 *   untuk browser tanpa dukungan `closedBy` (Safari).
 * - Esc dan gestur back ditangani browser; tidak ada handler Esc manual,
 *   focus trap, `inert`, `role="dialog"`, atau `aria-modal` tambahan.
 * - Tombol dikirim lewat `<form method="dialog">`; `close` listener
 *   membaca `returnValue` ("mulai" vs lainnya) lalu me-resetnya supaya
 *   nilai lama tidak bocor ke pembukaan berikutnya.
 * - Scroll halaman belakang ditahan murni lewat CSS
 *   (`overscroll-behavior: contain` di `dialog:modal` dan `::backdrop`),
 *   tanpa `overflow: hidden` di `html`/`body`.
 */
export function ConfirmModal({
  open,
  title,
  modeLabel,
  summary,
  body,
  confirmLabel = 'Mulai',
  cancelLabel = 'Batalkan',
  icon,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  // Ref callback supaya `close` listener (dipasang sekali) selalu memakai
  // handler terbaru tanpa perlu dipasang ulang.
  const onConfirmRef = useRef(onConfirm)
  const onCancelRef = useRef(onCancel)
  onConfirmRef.current = onConfirm
  onCancelRef.current = onCancel

  // Light dismiss: `closedby="any"` + fallback untuk browser yang belum
  // mendukungnya (cek `closedBy` di prototype, bukan user agent).
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.setAttribute('closedby', 'any')
    if ('closedBy' in HTMLDialogElement.prototype) return
    // Fallback: tutup hanya bila tekan DAN lepas di luar kotak dialog,
    // supaya drag seleksi teks yang berakhir di backdrop tidak menutup.
    let pressedOutside = false
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect()
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
    }
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e)
    }
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close()
    }
    dialog.addEventListener('pointerdown', onDown)
    dialog.addEventListener('pointerup', onUp)
    return () => {
      dialog.removeEventListener('pointerdown', onDown)
      dialog.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Baca hasil lewat `returnValue`, lalu reset agar tidak bocor.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleClose = () => {
      const value = dialog.returnValue
      dialog.returnValue = ''
      if (value === 'mulai') {
        onConfirmRef.current()
      } else {
        onCancelRef.current()
      }
    }
    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [])

  // Buka/tutup mengikuti prop `open`. Fokus awal ke tombol utama.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // Fokus awal ke tombol utama (selain atribut autoFocus, yang
      // tidak selalu jalan karena dialog ter-render dalam keadaan
      // tertutup saat komponen pertama dipasang).
      dialog
        .querySelector<HTMLButtonElement>('button[value="mulai"]')
        ?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open ])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-line bg-white p-0 shadow-soft-lg [&::backdrop]:bg-ink/50 [&::backdrop]:overflow-hidden [&::backdrop]:overscroll-contain [&:modal]:overscroll-contain"
    >
      <form method="dialog" className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
            {icon ?? <PlayIcon width={22} height={22} />}
          </span>
          <div className="min-w-0">
            <h2
              id={titleId}
              className="font-display text-xl font-extrabold"
            >
              {title}
            </h2>
            {(modeLabel || summary) && (
              <p className="mt-0.5 text-sm leading-relaxed font-medium text-ink/60">
                {[modeLabel, summary].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        <p className="rounded-xl bg-paper px-3 py-2.5 text-sm leading-relaxed font-medium text-ink/70">
          {body ??
            'Timer mulai jalan begitu kamu ketuk Mulai. Jawaban masih bisa diubah sampai kamu selesai.'}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button type="submit" variant="outline" value="batal">
            {cancelLabel}
          </Button>
          <Button type="submit" value="mulai" autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
