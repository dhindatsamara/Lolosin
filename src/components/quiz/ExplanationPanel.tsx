import type { Opsi, Question } from '../../lib/questions'
import { scoreQuestion } from '../../lib/quiz'
import { cx } from '../../lib/utils'
import { CheckIcon } from '../icons'

const OPSI_LIST: Opsi[] = ['A', 'B', 'C', 'D', 'E']

export interface ExplanationPanelProps {
  question: Question
  /** Opsi yang dipilih pengguna (undefined = belum memilih). */
  selected?: Opsi
}

/**
 * Panel pembahasan per opsi.
 *
 * - TWK/TIU: tiap opsi diberi verdict benar/salah.
 * - TKP: tiap opsi diberi bobot poinnya (1–5); tanpa bobot, kunci = 5 poin
 *   dan opsi lain = 1 poin (sesuai fallback `scoreQuestion`).
 *
 * Teks pembahasan ditampilkan apa adanya; kalau kosong, ditampilkan pesan
 * jujur + kunci jawabannya. Tidak pernah mengarang penjelasan.
 */
export function ExplanationPanel({ question, selected }: ExplanationPanelProps) {
  const isTkp = question.materi === 'TKP'
  const pembahasan = question.pembahasan.trim()
  const kunci = question.kunci
  const poinDidapat =
    selected !== undefined ? scoreQuestion(question, selected) : 0
  const benar = selected !== undefined && kunci !== null && selected === kunci

  function bobotOpsi(opsi: Opsi): number | null {
    if (!isTkp) return null
    const bobot = question.bobot?.[opsi]
    if (typeof bobot === 'number') return Math.min(5, Math.max(1, bobot))
    // Fallback sesuai scoreQuestion: kunci = 5, opsi lain = 1.
    return opsi === kunci ? 5 : 1
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-ink/10 bg-paper p-4">
      {/* Ringkasan hasil pilihan */}
      {selected !== undefined && (
        <p
          className={cx(
            'text-sm font-bold',
            isTkp
              ? 'text-ink'
              : benar
                ? 'text-primary-700'
                : 'text-red-700',
          )}
        >
          {isTkp
            ? `Kamu dapat ${poinDidapat}/5 poin`
            : benar
              ? 'Benar! 🎉'
              : 'Belum tepat — pelajari pembahasannya di bawah'}
        </p>
      )}

      {/* Verdict per opsi */}
      <div>
        <p className="mb-2 text-xs font-bold tracking-wide text-ink/50 uppercase">
          {isTkp ? 'Nilai tiap opsi' : 'Jawaban tiap opsi'}
        </p>
        <ul className="flex flex-col gap-1.5">
          {OPSI_LIST.map((opsi) => {
            const isKunci = opsi === kunci
            const isPilihan = opsi === selected
            const bobot = bobotOpsi(opsi)
            return (
              <li
                key={opsi}
                className={cx(
                  'flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm',
                  isKunci
                    ? 'bg-primary-100/70'
                    : isPilihan
                      ? 'bg-red-50'
                      : 'bg-white/60',
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink/5 text-xs font-bold">
                  {opsi}
                </span>
                <span className="min-w-0 flex-1 leading-relaxed font-medium">
                  {question.pilihan[opsi]}
                </span>
                <span
                  className={cx(
                    'flex shrink-0 items-center gap-1 text-xs font-bold',
                    isKunci ? 'text-primary-700' : 'text-ink/50',
                  )}
                >
                  {isTkp ? (
                    <>
                      {isKunci && <CheckIcon width={13} height={13} />}
                      {bobot !== null ? `${bobot} poin` : ''}
                      {isKunci ? ' · terbaik' : ''}
                    </>
                  ) : isKunci ? (
                    <>
                      <CheckIcon width={13} height={13} /> Benar
                    </>
                  ) : (
                    'Salah'
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Pembahasan */}
      <div className="border-t border-ink/10 pt-3">
        <p className="mb-1.5 text-xs font-bold tracking-wide text-ink/50 uppercase">
          Pembahasan
        </p>
        {pembahasan ? (
          <p className="text-sm leading-relaxed whitespace-pre-line text-ink/80">
            {pembahasan}
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-ink/60">
            Pembahasan belum tersedia untuk soal ini.
            {kunci !== null && (
              <>
                {' '}
                Kunci jawabannya adalah{' '}
                <strong className="text-ink">{kunci}</strong>.
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
