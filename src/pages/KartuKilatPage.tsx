/**
 * Kartu Kilat (/main/kartu-kilat): flashcard solo, tanpa login.
 *
 * Deck diambil dari soal yang sudah ada di bank soal lokal: depan kartu
 * adalah stem pertanyaan, belakang kartu adalah teks jawaban kunci
 * ditambah pembahasan singkat (bila ada). Soal yang punya pembahasan
 * diutamakan supaya belakang kartu tidak kosong.
 *
 * Satu sesi berisi 20 kartu (atau semua kartu yang tersedia bila kurang
 * dari 20). Kartu yang ditandai "Hafal" tersimpan (localStorage
 * untuk user login, memori saja untuk tamu sejak v2.5) dan
 * dikeluarkan dari rotasi sesi berikutnya, sampai user menekan
 * "Ulang dari awal" (pakai konfirmasi, karena menghapus progres lokal).
 *
 * Hadiah XP: 10 XP flat saat satu sesi selesai (pola Kuis Kilat memakai
 * konstanta lokal di file page, bukan konstanta baru di lib/store.ts).
 * Soal yang muncul di sesi ditandai sudah dilihat (markSeen) dan
 * aktivitas hari ini dicatat untuk streak.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  QUIZABLE_QUESTIONS,
  getQuestions,
  type Materi,
  type Question,
} from '../lib/questions'
import { shuffle, visibleOptions } from '../lib/quiz'
import { addXp, markSeen, recordActivity } from '../lib/store'
import {
  getScopedItem,
  migrateLegacyKey,
  removeScopedItem,
  setScopedItem,
} from '../lib/storage'
import { MathText } from '../components/MathText'
import { MASCOT_NAME } from '../lib/mascot'
import { useAuthUser } from '../lib/auth'
import { InteractiveMascot } from '../components/InteractiveMascot'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ConfirmModal } from '../components/quiz/ConfirmModal'
import {
  ArrowLeftIcon,
  BookIcon,
  CheckIcon,
  InfoIcon,
  TrophyIcon,
  XIcon,
} from '../components/icons'

/** Jumlah kartu per sesi. */
export const KARTU_KILAT_SESSION_SIZE = 20
/** Key dasar localStorage untuk id soal yang sudah ditandai Hafal (di-namespace per user: `:guest` atau `:<userId>`). */
export const KARTU_KILAT_HAFAL_KEY = 'lolosin:kartu-kilat:v1'
/** Hadiah XP saat satu sesi selesai. */
export const KARTU_KILAT_XP = 10
/** Panjang maksimum pembahasan di belakang kartu (sekitar 2 baris). */
const PEMBAHASAN_MAX_CHARS = 160

type DeckFilter = Materi | 'Semua'

type Phase = 'idle' | 'playing' | 'finished'

const FILTERS: { value: DeckFilter; label: string }[] = [
  { value: 'TWK', label: 'TWK' },
  { value: 'TIU', label: 'TIU' },
  { value: 'TKP', label: 'TKP' },
  { value: 'Semua', label: 'Semua' },
]

function loadHafal(): Set<string> {
  try {
    // Migrasi sekali: daftar hafal lama di key tanpa namespace pindah
    // ke namespace aktif sebelum dibaca.
    migrateLegacyKey(KARTU_KILAT_HAFAL_KEY)
    const raw = getScopedItem(KARTU_KILAT_HAFAL_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed.filter((id): id is string => typeof id === 'string'),
    )
  } catch {
    return new Set()
  }
}

function saveHafal(hafal: Set<string>): void {
  try {
    setScopedItem(KARTU_KILAT_HAFAL_KEY, JSON.stringify([...hafal]))
  } catch {
    // Penyimpanan tidak tersedia: abaikan diam-diam.
  }
}

/**
 * Susun deck satu sesi: soal yang sudah Hafal dikeluarkan, soal yang
 * punya pembahasan diutamakan (diacak dalam kelompoknya masing-masing),
 * lalu diambil maksimal KARTU_KILAT_SESSION_SIZE kartu.
 */
function buildDeck(filter: DeckFilter, hafal: Set<string>): Question[] {
  const pool =
    filter === 'Semua'
      ? QUIZABLE_QUESTIONS
      : getQuestions(filter)
  const fresh = pool.filter((q) => !hafal.has(q.id))
  // pembahasan bisa null di data mentah (193 soal), jadi akses
  // null-safe: soal tanpa pembahasan masuk kelompok kedua.
  const withPembahasan = shuffle(
    fresh.filter((q) => (q.pembahasan ?? '').trim().length > 0),
  )
  const withoutPembahasan = shuffle(
    fresh.filter((q) => (q.pembahasan ?? '').trim().length === 0),
  )
  return [...withPembahasan, ...withoutPembahasan].slice(
    0,
    KARTU_KILAT_SESSION_SIZE,
  )
}

/** Potong teks jadi sekitar 2 baris, dengan elipsis bila terpotong. */
function truncate(text: string, maxChars: number): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  if (clean.length <= maxChars) return clean
  return `${clean.slice(0, maxChars).trimEnd()}...`
}

/**
 * Apakah perangkat meminta gerakan dikurangi: flip kartu jadi tukar
 * sisi langsung tanpa transisi rotateY.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function KartuKilatPage() {
  const { user } = useAuthUser()
  const [phase, setPhase] = useState<Phase>('idle')
  const [filter, setFilter] = useState<DeckFilter>('TWK')
  const [hafal, setHafal] = useState<Set<string>>(() => loadHafal())
  const [deck, setDeck] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [hafalThisSession, setHafalThisSession] = useState(0)
  const [xpEarned, setXpEarned] = useState(0)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const reducedMotion = useMemo(() => prefersReducedMotion(), [])

  /* Sisa kartu yang belum Hafal per filter (untuk layar awal). */
  const remainingByFilter = useMemo(() => {
    const counts: Record<DeckFilter, number> = {
      TWK: 0,
      TIU: 0,
      TKP: 0,
      Semua: 0,
    }
    for (const q of QUIZABLE_QUESTIONS) {
      if (hafal.has(q.id)) continue
      counts[q.materi] += 1
      counts.Semua += 1
    }
    return counts
  }, [hafal])

  function startSession() {
    const nextDeck = buildDeck(filter, hafal)
    if (nextDeck.length === 0) return
    setDeck(nextDeck)
    setIndex(0)
    setFlipped(false)
    setHafalThisSession(0)
    setXpEarned(0)
    setPhase('playing')
  }

  function finishSession() {
    addXp(KARTU_KILAT_XP)
    setXpEarned(KARTU_KILAT_XP)
    markSeen(deck.map((q) => q.id))
    recordActivity()
    setPhase('finished')
  }

  function advance() {
    if (index + 1 >= deck.length) {
      finishSession()
      return
    }
    setIndex((i) => i + 1)
    setFlipped(false)
  }

  function handleHafal() {
    const question = deck[index]
    if (!question) return
    const next = new Set(hafal)
    next.add(question.id)
    setHafal(next)
    saveHafal(next)
    setHafalThisSession((n) => n + 1)
    advance()
  }

  function handleReset() {
    setShowResetConfirm(false)
    setHafal(new Set())
    try {
      removeScopedItem(KARTU_KILAT_HAFAL_KEY)
    } catch {
      // Penyimpanan tidak tersedia: abaikan diam-diam.
    }
    setPhase('idle')
  }

  const question = deck[index]
  const remaining = remainingByFilter[filter]

  if (phase === 'idle') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header>
          <Link
            to="/main"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:underline"
          >
            <ArrowLeftIcon width={16} height={16} />
            Hub Game
          </Link>
          <h1 className="mt-2 flex items-center gap-2 font-display text-3xl font-extrabold">
            <BookIcon width={28} height={28} className="text-primary-600" />
            Kartu Kilat
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-ink/60">
            Hafalan cepat pakai kartu bolak-balik dari soal CPNS. Ketuk
            kartu untuk melihat jawabannya, lalu tandai Hafal kalau kamu
            sudah ingat, atau Belum kalau masih perlu diulang.
          </p>
        </header>

        <Card className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-lg font-extrabold">
              Pilih materi deck
            </h2>
            <div
              className="mt-2 flex flex-wrap gap-2"
              role="group"
              aria-label="Filter materi deck"
            >
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  aria-pressed={filter === f.value}
                  className={
                    filter === f.value
                      ? 'rounded-full bg-primary-600 px-4 py-2 text-sm font-bold text-white shadow-soft'
                      : 'rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink/70 hover:border-primary-300 hover:text-primary-700'
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone="green">
              {remaining} kartu belum hafal
            </Badge>
            <Badge tone="neutral">
              {hafal.size} kartu sudah hafal
            </Badge>
            <Badge tone="neutral">20 kartu per sesi</Badge>
          </div>

          {remaining === 0 ? (
            <p className="rounded-xl bg-primary-50 px-3 py-2.5 text-sm leading-relaxed font-semibold text-primary-800">
              Semua kartu {filter === 'Semua' ? '' : `${filter} `}sudah
              hafal, keren! Pilih materi lain, atau ulang dari awal
              kalau mau mengulang semuanya.
            </p>
          ) : (
            <p className="flex items-start gap-2 text-sm leading-relaxed text-ink/70">
              <InfoIcon
                width={18}
                height={18}
                className="mt-0.5 shrink-0 text-primary-600"
              />
              {user
                ? 'Kartu yang sudah Hafal tidak muncul lagi di sesi berikutnya. Progres tersimpan di perangkat ini.'
                : 'Kartu yang sudah Hafal tidak muncul lagi selama halaman ini terbuka. Daftar gratis biar progresmu kesimpan.'}
            </p>
          )}

          <Button
            size="lg"
            onClick={startSession}
            disabled={remaining === 0}
          >
            <BookIcon width={18} height={18} />
            Mulai 20 kartu
          </Button>

          {hafal.size > 0 && (
            <Button
              size="lg"
              variant="outline"
              onClick={() => setShowResetConfirm(true)}
            >
              Ulang dari awal
            </Button>
          )}
        </Card>

        <ConfirmModal
          open={showResetConfirm}
          title="Hapus semua tanda hafal?"
          body={`Semua ${hafal.size} kartu yang sudah kamu tandai Hafal akan kembali masuk rotasi deck, dan progres hafalanmu mulai lagi dari nol. Aksi ini tidak bisa dibatalkan.`}
          confirmLabel="Ya, hapus semua"
          cancelLabel="Batalkan"
          icon={<XIcon width={22} height={22} />}
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
        />
      </div>
    )
  }

  if (phase === 'finished') {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="text-center">
          <InteractiveMascot
            size={140}
            phrases={[
              `Sesi selesai, ${hafalThisSession} kartu baru hafal!`,
              'Sedikit demi sedikit, lama-lama hafal semua.',
              'Gas lagi? Satu sesi lagi yuk.',
            ]}
          />
          <h1 className="mt-2 font-display text-3xl font-extrabold">
            Sesi selesai!
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            {MASCOT_NAME} bangga, kamu sudah menyelesaikan {deck.length}{' '}
            kartu.
          </p>
        </header>

        <Card className="text-center">
          <p className="font-display text-5xl font-extrabold">
            <span className="hl-marker">{hafalThisSession}</span>
          </p>
          <p className="mt-1 text-sm font-semibold text-ink/60">
            kartu baru ditandai Hafal dari {deck.length} kartu
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="font-display text-2xl font-extrabold">
                {deck.length - hafalThisSession}
              </p>
              <p className="text-xs font-semibold text-ink/60">
                masih perlu diulang
              </p>
            </div>
            <div>
              <p className="font-display text-2xl font-extrabold">
                {hafal.size}
              </p>
              <p className="text-xs font-semibold text-ink/60">
                total kartu hafal
              </p>
            </div>
          </div>
          {xpEarned > 0 && (
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent-400 px-3 py-1 text-sm font-extrabold text-ink">
              +{xpEarned} XP
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-2">
          <Button size="lg" fullWidth onClick={() => setPhase('idle')}>
            Lanjut lagi
          </Button>
          <Link to="/main" className="block">
            <Button size="lg" variant="outline" fullWidth>
              Kembali ke hub
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  /* Arena bermain. */
  if (!question) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card className="p-6 text-center">
          <p className="font-display text-lg font-bold">
            Deck-nya kosong
          </p>
          <p className="mt-2 text-sm text-ink/60">
            Tidak ada kartu yang bisa dimainkan untuk filter ini.
          </p>
          <Button className="mt-4" onClick={() => setPhase('idle')}>
            Kembali ke awal
          </Button>
        </Card>
      </div>
    )
  }

  const kunci = question.kunci
  const jawabanKunci =
    kunci !== null && visibleOptions(question).includes(kunci)
      ? question.pilihan[kunci]
      : ''
  const pembahasan = (question.pembahasan ?? '').trim()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="kicker flex items-center gap-1.5">
            <BookIcon width={16} height={16} />
            Kartu Kilat
          </p>
          <p className="text-lg font-extrabold text-ink/70">
            Kartu {index + 1} dari {deck.length}
          </p>
        </div>
        <div className="mt-3">
          <ProgressBar
            value={index}
            max={deck.length}
            tone="primary"
            label="Progres kartu"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{question.materi}</Badge>
          <Badge tone="neutral">{question.subtopik}</Badge>
          <Badge tone="green">
            <TrophyIcon width={13} height={13} />
            {hafal.size} hafal
          </Badge>
        </div>
      </header>

      {/*
        Kartu bolak-balik: dua sisi ditumpuk, sisi belakang di-rotateY
        180 derajat. Hanya transform dan opacity yang dianimasikan;
        saat prefers-reduced-motion, transisi dimatikan (tukar langsung).
      */}
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label={
          flipped
            ? 'Kartu jawaban, ketuk untuk kembali ke pertanyaan'
            : 'Kartu pertanyaan, ketuk untuk melihat jawaban'
        }
        className="block w-full cursor-pointer rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
        style={{ perspective: '1000px' }}
      >
        <div
          className="relative w-full"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            transition: reducedMotion
              ? 'none'
              : 'transform 300ms ease-in-out',
          }}
        >
          {/* Sisi depan: pertanyaan. */}
          <div
            className="flex min-h-64 w-full flex-col justify-center gap-3 rounded-2xl border border-line bg-white p-6 shadow-soft"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <p className="text-xs font-extrabold tracking-wide text-ink/50 uppercase">
              Pertanyaan
            </p>
            <p className="text-lg leading-relaxed font-semibold whitespace-pre-line">
              <MathText text={question.soal} />
            </p>
            <p className="mt-2 text-center text-sm font-medium text-primary-700">
              Ketuk kartu untuk melihat jawaban
            </p>
          </div>
          {/* Sisi belakang: jawaban kunci + pembahasan singkat. */}
          <div
            className="absolute inset-0 flex w-full flex-col justify-center gap-3 overflow-y-auto rounded-2xl border border-primary-200 bg-primary-50 p-6 shadow-soft"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            <p className="text-xs font-extrabold tracking-wide text-primary-700 uppercase">
              Jawaban{kunci !== null ? ` (${kunci})` : ''}
            </p>
            <p className="text-lg leading-relaxed font-bold">
              <MathText text={jawabanKunci || 'Jawaban tidak tersedia.'} />
            </p>
            {pembahasan.length > 0 && (
              <p className="line-clamp-2 text-sm leading-relaxed text-ink/70">
                <MathText text={truncate(pembahasan, PEMBAHASAN_MAX_CHARS)} />
              </p>
            )}
            <p className="mt-2 text-center text-sm font-medium text-primary-700">
              Sudah ingat? Tandai di bawah.
            </p>
          </div>
        </div>
      </button>

      {flipped ? (
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" variant="outline" onClick={advance}>
            <XIcon width={18} height={18} />
            Belum
          </Button>
          <Button size="lg" onClick={handleHafal}>
            <CheckIcon width={18} height={18} />
            Hafal
          </Button>
        </div>
      ) : (
        <p className="text-center text-sm font-medium text-ink/60">
          Coba jawab dalam hati dulu, baru balik kartunya.
        </p>
      )}

      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPhase('idle')}
        >
          <ArrowLeftIcon width={16} height={16} />
          Akhiri sesi
        </Button>
      </div>
    </div>
  )
}
