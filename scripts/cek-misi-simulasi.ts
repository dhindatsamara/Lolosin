/**
 * Verifikasi jalur positif misi simulasi: pada tanggal yang set misinya
 * memuat 'simulasi-1' (2026-11-14), menyelesaikan satu simulasi CAT
 * harus memajukan progres misi itu ke 1. Dijalankan dengan vite-node:
 *   npx vite-node scripts/cek-misi-simulasi.ts
 * Tanggal dipalsukan lewat mock Date (todayMakassar memakai new Date()).
 * Skrip sekali pakai untuk QA; bukan bagian dari app.
 */

// localStorage tiruan in-memory (pola yang sama dengan simulasi-assert.ts)
const memory = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, String(value))
  },
  removeItem: (key: string) => {
    memory.delete(key)
  },
  clear: () => {
    memory.clear()
  },
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size
  },
} as Storage

// Mock Date: 2026-11-14 pukul 10:00 WITA (= 02:00 UTC).
const RealDate = Date
const target = new RealDate('2026-11-14T02:00:00.000Z')
class MockDate extends RealDate {
  constructor(...args: unknown[]) {
    // @ts-expect-error konstruktor variadik
    super(...(args.length > 0 ? args : [target.getTime()]))
  }
  static now() {
    return target.getTime()
  }
}
globalThis.Date = MockDate as unknown as DateConstructor

const { getDailyMissions } = await import('../src/lib/missions')
const { completeTryout } = await import('../src/lib/gamification')
const { getStore, resetStore } = await import('../src/lib/store')
const { scoreTryout, pickTryoutQuestions } = await import('../src/lib/quiz')

let gagal = 0
function check(nama: string, aktual: unknown, harapan: unknown) {
  const ok = JSON.stringify(aktual) === JSON.stringify(harapan)
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${nama} | aktual=${JSON.stringify(aktual)} harapan=${JSON.stringify(harapan)}`)
  if (!ok) gagal++
}

const misi = getDailyMissions('2026-11-14').map((m) => m.id)
check('misi 2026-11-14 memuat simulasi-1', misi.includes('simulasi-1'), true)

resetStore()
const pick = pickTryoutQuestions([], 'full')
const answers: Record<string, string> = {}
for (const q of pick.questions) answers[q.id] = q.kunci
const score = scoreTryout(pick.questions, answers as never, 'full')
completeTryout(score)
check('XP +300', getStore().xp, 300)
check(
  "progres misi simulasi-1 menjadi 1 setelah simulasi",
  getStore().missions.progress['simulasi-1'],
  1,
)
check('missions.date = 2026-11-14', getStore().missions.date, '2026-11-14')

// Kontrol negatif: tryout mini di tanggal yang sama TIDAK memajukan
// misi simulasi.
resetStore()
const pickMini = pickTryoutQuestions([], 'mini')
const answersMini: Record<string, string> = {}
for (const q of pickMini.questions) answersMini[q.id] = q.kunci
completeTryout(scoreTryout(pickMini.questions, answersMini as never, 'mini'))
check(
  'tryout mini tidak memajukan misi simulasi-1',
  getStore().missions.progress['simulasi-1'] ?? 0,
  0,
)

console.log(gagal === 0 ? '\nSemua cek misi lolos.' : `\n${gagal} cek GAGAL.`)
process.exit(gagal === 0 ? 0 : 1)
