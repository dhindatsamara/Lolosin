/**
 * Cek backward-compat load store Fase 3: state lama (sebelum Fase 3,
 * tanpa `reviewQueue`, `topicStats`, dan `stats.reviewsCorrect`)
 * harus tetap kebaca, dengan field baru terisi nilai kosong.
 *
 * Dijalankan terpisah dari fase3-assert.ts supaya modul store dimuat
 * segar dengan localStorage yang sudah berisi state lama:
 *   npx vite-node scripts/fase3-backcompat.ts
 */

const memory = new Map<string, string>()
// State lama: bentuk persis sebelum Fase 3 (tanpa field baru).
memory.set(
  'lolosin:v1',
  JSON.stringify({
    xp: 250,
    streak: 3,
    lastActivityDate: '2026-11-12',
    seenQuestionIds: ['q1', 'q2'],
    readSections: ['s1'],
    tryoutHistory: [],
    activityDates: ['2026-11-12'],
    badges: [{ id: 'langkah-pertama', date: '2026-11-10' }],
    missions: { date: '2026-11-12', progress: {}, claimed: [] },
    stats: {
      drillsCompleted: 2,
      drillsPerfect: 0,
      correctAnswers: 15,
      materiTried: ['TIU'],
    },
  }),
)
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

import { getStore } from '../src/lib/store'

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    passed += 1
  } else {
    failed += 1
    failures.push(
      `${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

const state = getStore()
check('backcompat: xp lama kebaca', state.xp, 250)
check('backcompat: streak lama kebaca', state.streak, 3)
check('backcompat: seen lama kebaca', state.seenQuestionIds, ['q1', 'q2'])
check('backcompat: badges lama kebaca', state.badges.length, 1)
check('backcompat: stats lama kebaca', state.stats.correctAnswers, 15)
check('backcompat: reviewQueue default kosong', state.reviewQueue, [])
check('backcompat: topicStats default kosong', state.topicStats, {})
check('backcompat: reviewsCorrect default 0', state.stats.reviewsCorrect, 0)

console.log(`\nFase 3 backcompat: ${passed} lolos, ${failed} gagal`)
if (failures.length > 0) {
  for (const f of failures) console.log(`  GAGAL: ${f}`)
  process.exit(1)
}
console.log('Semua asersi backcompat lolos.')
