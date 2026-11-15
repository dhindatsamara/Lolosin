/**
 * Kartu "Poin inti": ringkasan 3-5 butir terpenting dari satu seksi materi.
 * Tampil menonjol sebagai callout kuning/hijau khas Lolosin: di atas isi
 * seksi pada layar kecil, dan di kolom samping (sticky) pada layar lebar.
 */
import { CheckIcon, SparklesIcon } from '../icons'

export function PoinIntiCard({ poinInti }: { poinInti: string[] }) {
  if (poinInti.length === 0) return null
  return (
    <section
      aria-label="Poin inti"
      className="rounded-2xl border-2 border-accent-300 bg-accent-100 p-5 shadow-soft"
    >
      <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-ink">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-300 text-accent-800">
          <SparklesIcon width={18} height={18} />
        </span>
        Poin inti
      </h2>
      <p className="mt-1 text-sm font-medium text-ink/60">
        Yang perlu kamu ingat dari bagian ini
      </p>
      <ul className="mt-3 space-y-2.5">
        {poinInti.map((poin, i) => (
          <li
            key={i}
            className="flex items-start gap-2.5 text-[15px] leading-6 font-medium text-ink/85"
          >
            <CheckIcon
              width={18}
              height={18}
              className="mt-0.5 shrink-0 text-primary-600"
            />
            <span>{poin}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
