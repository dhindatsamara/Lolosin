import type { Opsi, Question } from '../../lib/questions'
import { scoreQuestion, visibleOptions } from '../../lib/quiz'
import { cx } from '../../lib/utils'
import { CheckIcon } from '../icons'

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
  // 193 soal di bank punya pembahasan null: koersi ke string kosong
  // supaya panel jatuh ke pesan jujur di bawah, bukan crash.
  const pembahasan =
    typeof question.pembahasan === 'string' ? question.pembahasan.trim() : ''
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
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-accent-50 p-4 shadow-soft">
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
              : 'Belum tepat, gapapa kok. Cek pembahasannya di bawah ya'}
        </p>
      )}

      {/* Verdict per opsi */}
      <div>
        <p className="mb-2 text-xs font-extrabold tracking-wide text-ink/60 uppercase">
          {isTkp ? 'Nilai tiap opsi' : 'Jawaban tiap opsi'}
        </p>
        <ul className="flex flex-col gap-1.5">
          {visibleOptions(question).map((opsi) => {
            const isKunci = opsi === kunci
            const isPilihan = opsi === selected
            const bobot = bobotOpsi(opsi)
            return (
              <li
                key={opsi}
                className={cx(
                  'flex items-start gap-2 rounded-xl border px-2.5 py-1.5 text-sm',
                  isKunci
                    ? 'border-primary-600 bg-primary-100'
                    : isPilihan
                      ? 'border-red-500 bg-red-50'
                      : 'border-line bg-white',
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
                    'flex shrink-0 items-center gap-1 text-xs font-extrabold',
                    isKunci ? 'text-primary-700' : 'text-ink/60',
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
      <div className="border-t border-dashed border-line-strong pt-3">
        <p className="mb-1.5 text-xs font-extrabold tracking-wide text-ink/60 uppercase">
          Pembahasan
        </p>
        {pembahasan ? (
          <p className="text-sm leading-relaxed whitespace-pre-line text-ink/80">
            {pembahasan}
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-ink/60">
            Pembahasan buat soal ini belum ada.
            {kunci !== null && (
              <>
                {' '}
                Kuncinya <strong className="text-ink">{kunci}</strong>.
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
