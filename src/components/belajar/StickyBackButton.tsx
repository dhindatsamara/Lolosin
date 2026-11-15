import { Link } from 'react-router-dom'
import { ArrowLeftIcon } from '../icons'

/**
 * Tombol kembali ikon saja, sticky di kiri halaman detail.
 *
 * `top-20` (80px) berada di bawah header app yang sticky (sekitar
 * 65px: logo 40px + padding 2x12px + border), jadi tombol tidak
 * pernah tertutup header saat scroll. Di posisi awal (scroll 0)
 * tombol duduk di alur normal di atas judul, jadi tidak menutupi
 * judul halaman.
 */
export function StickyBackButton({ to }: { to: string }) {
  return (
    <div className="sticky top-20 z-30 self-start">
      <Link
        to={to}
        aria-label="Kembali"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-ink shadow-soft transition-transform hover:-translate-y-px hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
      >
        <ArrowLeftIcon width={20} height={20} />
      </Link>
    </div>
  )
}
