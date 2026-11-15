/**
 * Motif visual khas per subtes SKD (v2.2.1): dekorasi Belajar dan
 * Tryout. Semua motif aria-hidden, pointer-events-none, dan tidak
 * menutupi teks atau tombol (konten selalu dibungkus relative di
 * atasnya).
 *
 * TWK: GarudaMotif, siluet burung terbang stylized yang digambar
 * sendiri untuk Lolosin. Ini burung generik, BUKAN lambang negara
 * Garuda Pancasila: tanpa perisai, tanpa pita, tanpa mahkota, tanpa
 * cakar memegang apa pun. Bentuknya datar (flat) senada gaya maskot:
 * beberapa bentuk sederhana dengan warna currentColor.
 * TIU: MathWatermark, simbol matematika sebagai glif teks
 * (font-display, tajam tanpa SVG). Ukuran glif mengikuti font-size
 * pembungkusnya (class text-* di pemakai).
 * TKP: HandshakeIcon dari icons.tsx, jabat tangan gaya garis Lucide.
 */
import type { SVGProps } from 'react'
import type { Materi } from '../lib/questions'
import { cx } from '../lib/utils'
import { HandshakeIcon } from './icons'

/**
 * Siluet burung terbang stylized (orisinil, bukan lambang negara):
 * sayap mengalir dengan ujung bergerigi halus, badan, kepala,
 * paruh, dan ekor. Fill currentColor, ikut warna teks pemakai.
 */
export function GarudaMotif(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="120"
      height="76"
      viewBox="0 0 120 76"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      {/* Sayap kiri dan kanan */}
      <path d="M59 48C48 32 32 22 10 20 24 27 32 34 36 42 26 37 14 35 4 37 16 43 28 49 38 55 47 59 56 56 59 48Z" />
      <path d="M61 48C72 32 88 22 110 20 96 27 88 34 84 42 94 37 106 35 116 37 104 43 92 49 82 55 73 59 64 56 61 48Z" />
      {/* Badan, kepala, paruh, ekor */}
      <path d="M60 40C63 44 66 50 66 56 66 62 63 66 60 66 57 66 54 62 54 56 54 50 57 44 60 40Z" />
      <circle cx="60" cy="35" r="5" />
      <path d="M57 39 63 39 60 44Z" />
      <path d="M55 64 60 75 65 64C62 67 58 67 55 64Z" />
    </svg>
  )
}

/**
 * Simbol matematika TIU sebagai glif teks: Sigma besar, pi, dan akar.
 * Ukuran mengikuti font-size pembungkus (atur lewat class text-*).
 */
export function MathWatermark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex gap-[0.12em] font-display font-extrabold select-none',
        className,
      )}
    >
      <span>Σ</span>
      <span className="text-[0.62em]">π</span>
      <span className="text-[0.78em]">√</span>
    </span>
  )
}

/**
 * Watermark motif per subtes untuk sudut kartu atau header. Pemakai
 * mengatur posisi, ukuran, warna, opacity, dan (untuk TIU) ukuran
 * font lewat className. TWK dan TKP mengisi pembungkus (h-full
 * w-full); TIU memakai font-size pembungkus.
 */
export function MateriWatermark({
  materi,
  className,
}: {
  materi: Materi
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cx('pointer-events-none select-none', className)}
    >
      {materi === 'TWK' && <GarudaMotif className="h-full w-full" />}
      {materi === 'TIU' && (
        <MathWatermark className="h-full w-full items-center justify-end" />
      )}
      {materi === 'TKP' && (
        <HandshakeIcon strokeWidth={1.5} className="h-full w-full" />
      )}
    </span>
  )
}

/**
 * Motif mini per subtes untuk deretan judul atau badge: Garuda kecil
 * (TWK), glif Sigma (TIU), atau jabat tangan (TKP). Warna ikut
 * className pemakai (text-twk, text-tiu, atau text-tkp).
 */
export function MateriMotifMini({
  materi,
  className,
}: {
  materi: Materi
  className?: string
}) {
  if (materi === 'TWK') {
    return <GarudaMotif width={30} height={19} className={className} />
  }
  if (materi === 'TIU') {
    return (
      <span
        aria-hidden="true"
        className={cx(
          'font-display text-lg leading-none font-extrabold',
          className,
        )}
      >
        Σ
      </span>
    )
  }
  return <HandshakeIcon width={20} height={20} className={className} />
}
