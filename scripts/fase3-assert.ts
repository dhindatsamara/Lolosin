/**
 * Skrip asersi logika murni Fase 3 (ulas, rencana, prediksi, lencana).
 *
 * Dijalankan dengan vite-node supaya `import.meta.glob` di loader bank
 * soal ikut jalan (tsx/tsc polos tidak bisa):
 *   npx vite-node scripts/fase3-assert.ts
 *   (dari root repo, perlu koneksi npm saat pertama kali mengunduh
 *   vite-node; setelah itu tersimpan di cache npx)
 *
 * Keluar dengan kode 1 bila ada asersi yang gagal.
 */

// localStorage tidak ada di Node: tiruan in-memory. Modul store hanya
// menyentuh localStorage di dalam fungsi (bukan di level modul), jadi
// tiruan ini cukup dipasang sebelum pemanggilan pertama.
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

import { checkNewBadges, getBadgeDef } from '../src/lib/badges'
import {
  completeReview,
  getCelebrations,
} from '../src/lib/gamification'
import {
  normalizeTopicLabel,
  todayFocus,
  todayFocusFromStats,
  untriedTopics,
  untriedTopicsFromStats,
  weakestTopics,
  weakestTopicsFromStats,
} from '../src/lib/plan'
import {
  bandFromDiff,
  PREDICTION_BAND_LABELS,
  predictFromHistory,
} from '../src/lib/prediction'
import type { Materi, Question } from '../src/lib/questions'
import {
  ORIGINAL_PASSING,
  TRYOUT_SCALE_TO_ORIGINAL,
} from '../src/lib/quiz'
import {
  answerReview,
  dueReviews,
  recordAnswer,
  reviewCountDue,
} from '../src/lib/review'
import {
  getStore,
  resetStore,
  type TopicStat,
  type TryoutRecord,
} from '../src/lib/store'

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

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

function checkTrue(name: string, value: boolean): void {
  check(name, value, true)
}

function fakeQuestion(id: string, materi: Materi, subtopik: string): Question {
  return {
    id,
    materi,
    subtopik,
    soal: 'Soal tes',
    pilihan: { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e' },
    kunci: 'A',
    pembahasan: '',
    sumber: 'tes',
  }
}

function record(id: string, twk: number, tiu: number, tkp: number): TryoutRecord {
  return { date: id, twk, tiu, tkp, passed: false }
}

/* ------------------------------------------------------------------ */
/* review.ts                                                           */
/* ------------------------------------------------------------------ */

resetStore()
const q1 = fakeQuestion('q1', 'TIU', 'Deret Angka')
const q2 = fakeQuestion('q2', 'TWK', 'Pancasila')

// Salah masuk antrean, jatuh tempo besok, interval 1, streak 0.
recordAnswer(q1, false, '2026-11-13')
check('review: salah masuk antrean (panjang)', getStore().reviewQueue.length, 1)
check('review: entri salah', getStore().reviewQueue[0], {
  questionId: 'q1',
  materi: 'TIU',
  subtopik: 'Deret Angka',
  due: '2026-11-14',
  intervalDays: 1,
  streakCorrect: 0,
})
check('review: tally salah', getStore().topicStats['TIU|Deret Angka'], {
  correct: 0,
  total: 1,
})

// Belum jatuh tempo hari ini, jatuh tempo besok.
check('review: belum due di hari yang sama', reviewCountDue('2026-11-13'), 0)
check('review: due besok', reviewCountDue('2026-11-14'), 1)
check('review: dueReviews mengembalikan entri', dueReviews('2026-11-14').length, 1)

// Benar di drill biasa (bukan antrean) tidak masuk antrean.
recordAnswer(q2, true, '2026-11-13')
check('review: benar di drill tidak masuk antrean', getStore().reviewQueue.length, 1)
check('review: tally benar', getStore().topicStats['TWK|Pancasila'], {
  correct: 1,
  total: 1,
})

// Benar saat ulas: jadwal maju 1 -> 3 -> 7 -> 14 -> 30, lalu keluar.
answerReview('q1', true, '2026-11-14')
check('review: maju ke 3 hari', getStore().reviewQueue[0], {
  questionId: 'q1',
  materi: 'TIU',
  subtopik: 'Deret Angka',
  due: '2026-11-17',
  intervalDays: 3,
  streakCorrect: 1,
})
check('review: reviewsCorrect 1', getStore().stats.reviewsCorrect, 1)
answerReview('q1', true, '2026-11-17')
check('review: maju ke 7 hari', getStore().reviewQueue[0].intervalDays, 7)
check('review: due 7 hari', getStore().reviewQueue[0].due, '2026-11-24')
check('review: streak 2', getStore().reviewQueue[0].streakCorrect, 2)
answerReview('q1', true, '2026-11-24')
check('review: maju ke 14 hari', getStore().reviewQueue[0].intervalDays, 14)
check('review: due 14 hari', getStore().reviewQueue[0].due, '2026-12-08')
answerReview('q1', true, '2026-12-08')
check('review: maju ke 30 hari', getStore().reviewQueue[0].intervalDays, 30)
check('review: due 30 hari', getStore().reviewQueue[0].due, '2027-01-07')
check('review: streak 4', getStore().reviewQueue[0].streakCorrect, 4)
answerReview('q1', true, '2027-01-07')
check('review: keluar antrean setelah 5x benar', getStore().reviewQueue.length, 0)
check('review: reviewsCorrect 5', getStore().stats.reviewsCorrect, 5)

// Salah saat ulas: reset ke 1 hari, streak 0.
recordAnswer(q1, false, '2026-11-13')
answerReview('q1', true, '2026-11-14')
answerReview('q1', false, '2026-11-17')
check('review: salah reset interval', getStore().reviewQueue[0].intervalDays, 1)
check('review: salah reset streak', getStore().reviewQueue[0].streakCorrect, 0)
check('review: salah reset due', getStore().reviewQueue[0].due, '2026-11-18')
check('review: tally ulasan ikut terhitung', getStore().topicStats['TIU|Deret Angka'], {
  correct: 6,
  total: 9,
})

// Benar di drill biasa untuk soal yang sudah di antrean: dihitung satu
// ulasan benar, tidak dobel catat (tetap satu entri).
recordAnswer(q1, true, '2026-11-18')
check('review: benar di drill majukan antrean', getStore().reviewQueue.length, 1)
check('review: benar di drill interval 3', getStore().reviewQueue[0].intervalDays, 3)
check('review: benar di drill streak 1', getStore().reviewQueue[0].streakCorrect, 1)
check('review: benar di drill tambah reviewsCorrect', getStore().stats.reviewsCorrect, 7)

// Urutan due: paling lama jatuh tempo dulu.
resetStore()
recordAnswer(fakeQuestion('qa', 'TIU', 'A'), false, '2026-11-10') // due 11-11
recordAnswer(fakeQuestion('qb', 'TIU', 'B'), false, '2026-11-12') // due 11-13
recordAnswer(fakeQuestion('qc', 'TIU', 'C'), false, '2026-11-11') // due 11-12
check(
  'review: dueReviews urut paling lama dulu',
  dueReviews('2026-11-13').map((e) => e.questionId),
  ['qa', 'qc', 'qb'],
)
check('review: reviewCountDue semua due', reviewCountDue('2026-11-13'), 3)
check('review: reviewCountDue sebagian due', reviewCountDue('2026-11-11'), 1)

// answerReview soal yang tidak ada di antrean: false, tidak mengubah apa-apa.
check('review: answerReview id asing false', answerReview('tidak-ada', true), false)
check('review: antrean tidak berubah', getStore().reviewQueue.length, 3)

/* ------------------------------------------------------------------ */
/* plan.ts (inti murni)                                                */
/* ------------------------------------------------------------------ */

const stats: Record<string, TopicStat> = {
  'TIU|Deret Angka': { correct: 1, total: 10 }, // 10%
  'TIU|Analogi': { correct: 4, total: 5 }, // 80%
  'TWK|Pancasila': { correct: 0, total: 4 }, // 0% tapi baru 4 jawaban
  'TKP|Integritas': { correct: 9, total: 10 }, // 90%
}
const weakest = weakestTopicsFromStats(stats, 3)
check('plan: terlemah hanya yang min 5 jawaban', weakest.length, 3)
check('plan: terlemah pertama Deret Angka', weakest[0].subtopik, 'Deret Angka')
check('plan: akurasi terlemah 0.1', weakest[0].accuracy, 0.1)
check('plan: terlemah kedua Analogi', weakest[1].subtopik, 'Analogi')
check(
  'plan: topik 4 jawaban tidak masuk terlemah',
  weakest.some((w) => w.subtopik === 'Pancasila'),
  false,
)

// Normalisasi label: beda huruf besar/kecil + spasi digabung.
const statsNorm: Record<string, TopicStat> = {
  'TIU|Analogi Verbal': { correct: 2, total: 5 },
  'TIU|analogi verbal ': { correct: 2, total: 5 },
  'TIU|Sinonim dan Antonim': { correct: 1, total: 5 },
  'TIU|Sinonim Antonim': { correct: 1, total: 5 },
  'TIU|Deret-Tabel': { correct: 3, total: 5 },
  'TIU|Deret Tabel': { correct: 3, total: 5 },
}
check('plan: normalisasi huruf/spasi', normalizeTopicLabel('Analogi Verbal '), 'analogi verbal')
check('plan: normalisasi kata penghubung', normalizeTopicLabel('Sinonim dan Antonim'), 'sinonim antonim')
check('plan: normalisasi tanda baca', normalizeTopicLabel('Deret-Tabel'), 'deret tabel')
const weakestNorm = weakestTopicsFromStats(statsNorm, 10)
check('plan: label mirip digabung jadi 3 grup', weakestNorm.length, 3)
const analogi = weakestNorm.find((w) => w.subtopik === 'Analogi Verbal')
check('plan: grup gabungan total 10', analogi?.total, 10)
check('plan: grup gabungan benar 4', analogi?.correct, 4)
check('plan: grup gabungan akurasi 0.4', analogi?.accuracy, 0.4)

// Belum dicoba: yang ada di tally (setelah normalisasi) dikeluarkan.
const universe = [
  { materi: 'TIU' as Materi, subtopik: 'Deret Angka', questionCount: 50 },
  { materi: 'TIU' as Materi, subtopik: 'Analogi Verbal', questionCount: 30 },
  { materi: 'TWK' as Materi, subtopik: 'Pancasila', questionCount: 40 },
]
const untried = untriedTopicsFromStats(statsNorm, universe)
check(
  'plan: belum dicoba',
  untried.map((t) => t.subtopik),
  ['Pancasila', 'Deret Angka'],
)
check('plan: belum dicoba bawa jumlah soal', untried[0].questionCount, 40)

// Fokus hari ini: kosong vs ada data.
const focusEmpty = todayFocusFromStats({}, universe)
check('plan: fokus kosong hasData false', focusEmpty.hasData, false)
check('plan: fokus kosong weakest null', focusEmpty.weakest, null)
check('plan: fokus kosong semua belum dicoba', focusEmpty.untried.length, 3)
const focus = todayFocusFromStats(stats, universe)
check('plan: fokus ada data', focus.hasData, true)
check('plan: fokus weakest Deret Angka', focus.weakest?.subtopik, 'Deret Angka')

/* ------------------------------------------------------------------ */
/* plan.ts (wrapper store + bank soal asli)                             */
/* ------------------------------------------------------------------ */

resetStore()
check('plan: wrapper kosong weakest []', weakestTopics(3), [])
check('plan: wrapper kosong hasData false', todayFocus().hasData, false)
checkTrue('plan: wrapper kosong untried banyak', untriedTopics().length > 100)
recordAnswer(fakeQuestion('qx', 'TIU', 'Deret Angka'), false, '2026-11-13')
for (let i = 0; i < 5; i++) {
  recordAnswer(fakeQuestion(`qy${i}`, 'TIU', 'Analogi Verbal'), i < 2, '2026-11-13')
}
check('plan: wrapper weakest dari store', weakestTopics(1)[0].subtopik, 'Analogi Verbal')
check('plan: wrapper weakest akurasi', weakestTopics(1)[0].accuracy, 0.4)
check('plan: wrapper todayFocus weakest', todayFocus().weakest?.subtopik, 'Analogi Verbal')
check('plan: wrapper todayFocus hasData', todayFocus().hasData, true)
checkTrue(
  'plan: wrapper untried tidak berisi yang sudah dicoba',
  !untriedTopics().some(
    (t) => t.materi === 'TIU' && t.subtopik === 'Analogi Verbal',
  ),
)

/* ------------------------------------------------------------------ */
/* prediction.ts                                                       */
/* ------------------------------------------------------------------ */

check('prediksi: riwayat kosong null', predictFromHistory([]), null)

// Satu tryout: skor terskala dari konstanta quiz.ts, tren null.
const one = predictFromHistory([
  record('2026-11-10T00:00:00.000Z', 22, 23, 35),
])
check('prediksi: tryoutCount 1', one?.tryoutCount, 1)
check(
  'prediksi: TWK terskala 22 x skala',
  one?.sections.TWK.scaled,
  22 * TRYOUT_SCALE_TO_ORIGINAL.TWK,
)
check('prediksi: TWK passing asli', one?.sections.TWK.passing, ORIGINAL_PASSING.TWK)
check('prediksi: TWK diff 1', one?.sections.TWK.diff, 1)
check('prediksi: TWK pita hampir-aman', one?.sections.TWK.band, 'hampir-aman')
check(
  'prediksi: TWK label pita',
  one?.sections.TWK.bandLabel,
  'Hampir aman, sedikit lagi',
)
check('prediksi: TIU terskala 80.5', one?.sections.TIU.scaled, 80.5)
check('prediksi: TIU diff 0.5', one?.sections.TIU.diff, 0.5)
check('prediksi: TKP terskala 157.5', one?.sections.TKP.scaled, 157.5)
check('prediksi: tren null saat 1 tryout', one?.sections.TWK.trend, null)
check('prediksi: recent 1 entri', one?.sections.TWK.recent, [66])

// Batas pita (persis di ambang).
check('prediksi: pita diff 15 aman', bandFromDiff(15), 'aman')
check('prediksi: pita diff 14 hampir-aman', bandFromDiff(14), 'hampir-aman')
check('prediksi: pita diff 0 hampir-aman', bandFromDiff(0), 'hampir-aman')
check('prediksi: pita diff -1 butuh-kejar', bandFromDiff(-1), 'butuh-kejar')
check('prediksi: pita diff -14 butuh-kejar', bandFromDiff(-14), 'butuh-kejar')
check('prediksi: pita diff -15 masih-jauh', bandFromDiff(-15), 'masih-jauh')
check('prediksi: label aman', PREDICTION_BAND_LABELS.aman, 'Aman, pertahankan')
check(
  'prediksi: label butuh-kejar',
  PREDICTION_BAND_LABELS['butuh-kejar'],
  'Butuh kejar, sudah dekat',
)
check(
  'prediksi: label masih-jauh',
  PREDICTION_BAND_LABELS['masih-jauh'],
  'Masih jauh, fokus di sini dulu',
)

// Tren: naik dan turun per seksi, dari 2 tryout.
const two = predictFromHistory([
  record('2026-11-08T00:00:00.000Z', 20, 20, 30),
  record('2026-11-10T00:00:00.000Z', 25, 18, 28),
])
check('prediksi: tren TWK naik 15', two?.sections.TWK.trend, 15)
check('prediksi: tren TIU turun 7', two?.sections.TIU.trend, -7)
check('prediksi: tren TKP turun 9', two?.sections.TKP.trend, -9)
check('prediksi: recent 2 entri', two?.sections.TWK.recent, [60, 75])
check('prediksi: TWK diff 10 hampir-aman', two?.sections.TWK.band, 'hampir-aman')

// 4 tryout: recent dibatasi 3 terakhir, urutan dari yang terlama.
const four = predictFromHistory([
  record('2026-11-01T00:00:00.000Z', 10, 10, 10),
  record('2026-11-02T00:00:00.000Z', 12, 12, 12),
  record('2026-11-03T00:00:00.000Z', 14, 14, 14),
  record('2026-11-04T00:00:00.000Z', 16, 16, 16),
])
check('prediksi: recent dibatasi 3', four?.sections.TWK.recent, [36, 42, 48])
check('prediksi: tryoutCount 4', four?.tryoutCount, 4)
check('prediksi: lastDate tryout terakhir', four?.lastDate, '2026-11-04T00:00:00.000Z')
check('prediksi: TWK masih-jauh (48 vs 65)', four?.sections.TWK.band, 'masih-jauh')

// Riwayat tidak urut tanggal tetap dibaca dengan benar.
const unordered = predictFromHistory([
  record('2026-11-10T00:00:00.000Z', 25, 25, 25),
  record('2026-11-08T00:00:00.000Z', 20, 20, 20),
])
check('prediksi: riwayat tak urut pakai yang terbaru', unordered?.sections.TWK.scaled, 75)
check('prediksi: riwayat tak urut tren benar', unordered?.sections.TWK.trend, 15)

/* ------------------------------------------------------------------ */
/* Lencana Pantang Menyerah + perayaan ulas selesai                     */
/* ------------------------------------------------------------------ */

resetStore()
check('lencana: definisi ada', getBadgeDef('pantang-menyerah')?.nama, 'Pantang Menyerah')
check(
  'lencana: belum unlock di store kosong',
  checkNewBadges(getStore()).some((b) => b.id === 'pantang-menyerah'),
  false,
)
// 10 ulasan benar (10 soal berbeda, masing-masing salah dulu lalu benar).
for (let i = 0; i < 10; i++) {
  const q = fakeQuestion(`qb${i}`, 'TIU', 'Deret Angka')
  recordAnswer(q, false, '2026-11-13')
  answerReview(q.id, true, '2026-11-14')
}
check('lencana: reviewsCorrect 10', getStore().stats.reviewsCorrect, 10)
check(
  'lencana: syarat terpenuhi',
  checkNewBadges(getStore()).some((b) => b.id === 'pantang-menyerah'),
  true,
)
// completeReview mengunci lencana + merayakan antrean yang sudah habis
// (semua entri jatuh tempo 3 hari lagi, jadi due hari ini 0).
completeReview()
check(
  'lencana: terkunci setelah completeReview',
  getStore().badges.some((b) => b.id === 'pantang-menyerah'),
  true,
)
check(
  'perayaan: reviewDone didorong saat antrean habis',
  getCelebrations().some((c) => c.celebration.kind === 'reviewDone'),
  true,
)
check(
  'perayaan: lencana ikut dirayakan',
  getCelebrations().some(
    (c) =>
      c.celebration.kind === 'badge' &&
      c.celebration.badge.id === 'pantang-menyerah',
  ),
  true,
)

/* ------------------------------------------------------------------ */
/* Ringkasan                                                           */
/* ------------------------------------------------------------------ */

console.log(`\nFase 3 asersi: ${passed} lolos, ${failed} gagal`)
if (failures.length > 0) {
  for (const f of failures) console.log(`  GAGAL: ${f}`)
  process.exit(1)
}
console.log('Semua asersi lolos.')
