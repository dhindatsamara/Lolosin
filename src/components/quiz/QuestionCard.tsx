import type { Materi, Opsi, Question } from '../../lib/questions'
import { visibleOptions } from '../../lib/quiz'
import { MathText } from '../MathText'
import { Badge } from '../ui/Badge'
import { DiscussionThread } from './DiscussionThread'
import { ExplanationPanel } from './ExplanationPanel'
import { OptionButton, type OptionState } from './OptionButton'

const MATERI_TONE = { TWK: 'twk', TIU: 'tiu', TKP: 'tkp' } as const

export interface QuestionCardProps {
  question: Question
  /** Nomor soal yang ditampilkan (mis. 3 dari 10). */
  nomor?: number
  /** Total soal dalam sesi (untuk label "Soal 3 dari 10"). */
  total?: number
  /** Opsi yang dipilih pengguna. */
  selected?: Opsi
  /**
   * Mode drill: `true` setelah pengguna mengunci jawaban lewat tombol
   * Jawab. Opsi disorot benar/salah dan panel pembahasan muncul.
   * Mode tryout: selalu `false`.
   */
  revealed?: boolean
  onSelect?: (opsi: Opsi) => void
  /** Tampilkan badge bagian (TWK/TIU/TKP) di atas soal. */
  showMateriBadge?: boolean
}

function materiLabel(materi: Materi): string {
  return {
    TWK: 'Tes Wawasan Kebangsaan',
    TIU: 'Tes Intelegensia Umum',
    TKP: 'Tes Karakteristik Pribadi',
  }[materi]
}

/**
 * Satu kartu soal: stem + daftar opsi. Dipakai drill (feedback langsung)
 * dan tryout (pilih tanpa feedback).
 */
export function QuestionCard({
  question,
  nomor,
  total,
  selected,
  revealed = false,
  onSelect,
  showMateriBadge = false,
}: QuestionCardProps) {
  const isTkp = question.materi === 'TKP'

  function stateFor(opsi: Opsi): OptionState {
    if (!revealed) {
      return selected === opsi ? 'selected' : 'default'
    }
    if (opsi === question.kunci) return 'correct'
    if (opsi === selected) return 'wrong'
    return 'muted'
  }

  function badgeFor(opsi: Opsi): string | undefined {
    if (!revealed || !isTkp) return undefined
    const bobot = question.bobot?.[opsi]
    if (typeof bobot === 'number') {
      return `${Math.min(5, Math.max(1, bobot))} poin`
    }
    return opsi === question.kunci ? '5 poin' : '1 poin'
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {showMateriBadge && (
          <Badge tone={MATERI_TONE[question.materi]}>
            {question.materi}
          </Badge>
        )}
        {nomor !== undefined && (
          <span className="text-xs font-extrabold tracking-wide text-ink/60 uppercase">
            Soal {nomor}
            {total !== undefined ? ` dari ${total}` : ''}
            {showMateriBadge ? ` · ${materiLabel(question.materi)}` : ''}
          </span>
        )}
      </div>

      <p className="text-[15px] leading-relaxed font-medium whitespace-pre-line">
        <MathText text={question.soal} />
      </p>

      {isTkp && (
        <p className="rounded-xl border border-tkp/30 bg-tkp-soft px-3 py-2 text-xs leading-relaxed font-semibold text-tkp">
          Soal TKP dinilai 1–5. Pilih jawaban yang paling mencerminkan
          karakter ASN.
        </p>
      )}

      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Pilihan jawaban">
        {visibleOptions(question).map((opsi) => (
          <OptionButton
            key={opsi}
            huruf={opsi}
            teks={question.pilihan[opsi]}
            state={stateFor(opsi)}
            badge={badgeFor(opsi)}
            disabled={revealed}
            onClick={() => onSelect?.(opsi)}
          />
        ))}
      </div>

      {revealed && (
        <>
          <ExplanationPanel question={question} selected={selected} />
          <DiscussionThread questionId={question.id} />
        </>
      )}
    </div>
  )
}
