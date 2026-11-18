/**
 * Orkestrasi gamifikasi: titik-titik aktivitas memanggil fungsi di sini
 * (bukan `addXp` / `recordActivity` mentah), supaya tiap event sekaligus
 * memperbarui statistik, progres misi, lencana, dan perayaan.
 *
 * Aturan XP lama tidak berubah; lapisan ini hanya menambah statistik,
 * misi, lencana, dan momen perayaan di atasnya.
 *
 * Perayaan disimpan di antrean memori (bukan localStorage) dan
 * ditampilkan satu per satu oleh `CelebrationHost` di Layout.
 */
import { checkNewBadges, type BadgeDef } from './badges'
import { getDailyMissions, type MissionKind } from './missions'
import { getRankTitle } from './ranks'
import { reviewCountDue } from './review'
import type { Materi } from './questions'
import type { TryoutScore } from './quiz'
import {
  addXp,
  getLevel,
  getStore,
  markRead,
  maybeReviveStreak,
  recordActivity,
  recordTryout,
  todayMakassar,
  unlockBadges,
  updateMissions,
  updateStats,
  XP_DRILL_COMPLETE,
  XP_DRILL_CORRECT,
  XP_SIMULASI_COMPLETE,
  XP_TRYOUT_COMPLETE,
} from './store'

/* ------------------------------------------------------------------ */
/* Perayaan (antrean memori + pub/sub kecil)                            */
/* ------------------------------------------------------------------ */

export type Celebration =
  | { kind: 'levelUp'; level: number; rankTitle: string }
  | { kind: 'badge'; badge: BadgeDef; firstBadge: boolean }
  | { kind: 'streak'; streak: number }
  | { kind: 'reviewDone' }

export interface CelebrationItem {
  id: number
  celebration: Celebration
}

let celebrationQueue: CelebrationItem[] = []
let nextCelebrationId = 1
const celebrationListeners = new Set<() => void>()

export function getCelebrations(): CelebrationItem[] {
  return celebrationQueue
}

export function subscribeCelebrations(listener: () => void): () => void {
  celebrationListeners.add(listener)
  return () => {
    celebrationListeners.delete(listener)
  }
}

function emitCelebrations(): void {
  celebrationListeners.forEach((listener) => listener())
}

export function pushCelebration(celebration: Celebration): void {
  celebrationQueue = [
    ...celebrationQueue,
    { id: nextCelebrationId++, celebration },
  ]
  emitCelebrations()
}

export function dismissCelebration(id: number): void {
  celebrationQueue = celebrationQueue.filter((item) => item.id !== id)
  emitCelebrations()
}

/* ------------------------------------------------------------------ */
/* Helper internal                                                      */
/* ------------------------------------------------------------------ */

/** Milestone streak yang dirayakan (hari beruntun). */
export const STREAK_MILESTONES = [3, 7, 14, 30]

/** Rayakan naik level bila XP melewati ambang sejak `xpBefore`. */
function checkLevelUp(xpBefore: number): void {
  const before = getLevel(xpBefore)
  const after = getLevel(getStore().xp)
  if (after > before) {
    pushCelebration({
      kind: 'levelUp',
      level: after,
      rankTitle: getRankTitle(after),
    })
  }
}

/** Cek lencana baru dari state terkini, simpan, lalu rayakan. */
function checkBadges(): void {
  const newly = checkNewBadges(getStore())
  if (newly.length === 0) return
  const firstBadge = getStore().badges.length === 0
  unlockBadges(newly.map((b) => b.id))
  newly.forEach((badge, i) => {
    pushCelebration({
      kind: 'badge',
      badge,
      firstBadge: firstBadge && i === 0,
    })
  })
}

/**
 * Coba pulihkan streak putus (mekanik "Bujuk Osi"). Dipanggil di akhir
 * drill dan baca bagian; hanya memulihkan bila user sudah mengetuk
 * "Bujuk Osi". Bila streak pulih ke angka milestone, rayakan juga.
 * Dipanggil sebelum `checkBadges` supaya lencana streak melihat angka
 * yang sudah dipulihkan.
 */
function reviveIfArmed(): void {
  const { revived, streak } = maybeReviveStreak()
  if (revived && STREAK_MILESTONES.includes(streak)) {
    pushCelebration({ kind: 'streak', streak })
  }
}

/** Reset progres misi bila tanggal sudah berganti. */
function ensureMissionsToday(today: string): void {
  const { missions } = getStore()
  if (missions.date === today) return
  updateMissions({ date: today, progress: {}, claimed: [] })
}

/** Naikkan progres misi hari ini yang cocok dengan event. */
function bumpMission(
  kind: MissionKind,
  materi?: Materi,
  amount = 1,
): void {
  const today = todayMakassar()
  ensureMissionsToday(today)
  const todays = getDailyMissions(today)
  const { progress } = getStore().missions
  const next = { ...progress }
  let changed = false
  for (const mission of todays) {
    if (mission.kind !== kind) continue
    if (mission.materi !== undefined && mission.materi !== materi) continue
    const current = next[mission.id] ?? 0
    if (current < mission.target) {
      next[mission.id] = Math.min(mission.target, current + amount)
      changed = true
    }
  }
  if (changed) updateMissions({ progress: next })
}

/* ------------------------------------------------------------------ */
/* Event publik (dipanggil halaman)                                     */
/* ------------------------------------------------------------------ */

/**
 * Catat aktivitas harian (pengganti `recordActivity` di halaman).
 * Di hari baru: reset misi, rayakan milestone streak, cek lencana streak.
 */
export function recordDailyActivity(date = new Date()): {
  streak: number
  isNewDay: boolean
} {
  const result = recordActivity(date)
  if (result.isNewDay) {
    ensureMissionsToday(todayMakassar(date))
    if (STREAK_MILESTONES.includes(result.streak)) {
      pushCelebration({ kind: 'streak', streak: result.streak })
    }
    checkBadges()
  }
  return result
}

/**
 * Satu jawaban benar (drill maupun ulasan): +10 XP (aturan lama),
 * hitung jawaban benar, majukan misi "jawab N soal benar".
 * Lencana dicek saat sesi selesai.
 */
function recordCorrectAnswer(): void {
  const { stats } = getStore()
  addXp(XP_DRILL_CORRECT)
  updateStats({ correctAnswers: stats.correctAnswers + 1 })
  bumpMission('benar')
}

/** Jawaban drill benar: +10 XP, hitung jawaban benar, majukan misi. */
export function recordDrillCorrect(): void {
  recordCorrectAnswer()
}

/**
 * Jawaban ulasan benar: sama seperti drill (+10 XP, `XP_DRILL_CORRECT`),
 * karena ulasan adalah jawaban benar juga. Jadwal ulasnya sendiri
 * dimajukan oleh `answerReview` di `lib/review.ts`.
 */
export function recordReviewCorrect(): void {
  recordCorrectAnswer()
}

/**
 * Drill selesai: +50 XP (aturan lama), perbarui statistik drill,
 * majukan misi drill, catat aktivitas, pulihkan streak putus bila
 * user sudah membujuk Osi, cek naik level dan lencana.
 */
export function completeDrill(
  materi: Materi,
  correct: number,
  total: number,
): void {
  const xpBefore = getStore().xp
  const { stats } = getStore()
  addXp(XP_DRILL_COMPLETE)
  updateStats({
    drillsCompleted: stats.drillsCompleted + 1,
    drillsPerfect:
      stats.drillsPerfect + (total > 0 && correct === total ? 1 : 0),
    materiTried: stats.materiTried.includes(materi)
      ? stats.materiTried
      : [...stats.materiTried, materi],
  })
  bumpMission('drill')
  bumpMission('drillMateri', materi)
  checkLevelUp(xpBefore)
  recordDailyActivity()
  reviveIfArmed()
  checkBadges()
}

/**
 * Sesi ulas selesai: tidak ada bonus XP selesai sesi (XP ulasan hanya
 * +10 per jawaban benar), tapi catat aktivitas, cek naik level dan
 * lencana (termasuk Pantang Menyerah), lalu rayakan bila antrean
 * ulas hari ini sudah habis.
 */
export function completeReview(): void {
  const xpBefore = getStore().xp
  checkLevelUp(xpBefore)
  recordDailyActivity()
  checkBadges()
  if (reviewCountDue(todayMakassar()) === 0) {
    pushCelebration({ kind: 'reviewDone' })
  }
}

/**
 * Tryout selesai: simpan hasil beserta modenya, beri XP sesuai mode
 * (mini +100, simulasi +300, aturan lama untuk mini), hitung jawaban
 * benar, majukan misi tryout (mini) atau misi simulasi (full), catat
 * aktivitas, cek naik level dan lencana.
 */
export function completeTryout(score: TryoutScore): void {
  const xpBefore = getStore().xp
  const { stats } = getStore()
  const full = score.mode === 'full'
  recordTryout({
    mode: score.mode,
    twk: score.scores.TWK,
    tiu: score.scores.TIU,
    tkp: score.scores.TKP,
    passed: score.passedOverall,
    correct: score.correct,
  })
  addXp(full ? XP_SIMULASI_COMPLETE : XP_TRYOUT_COMPLETE)
  const correctTotal = score.correct
    ? score.correct.TWK + score.correct.TIU + score.correct.TKP
    : 0
  if (correctTotal > 0) {
    updateStats({ correctAnswers: stats.correctAnswers + correctTotal })
  }
  bumpMission(full ? 'simulasi' : 'tryout')
  if (correctTotal > 0) bumpMission('benar', undefined, correctTotal)
  checkLevelUp(xpBefore)
  recordDailyActivity()
  checkBadges()
}

/**
 * Bagian materi ditandai dibaca: +5 XP sekali per bagian (aturan lama),
 * majukan misi baca, catat aktivitas, pulihkan streak putus bila
 * user sudah membujuk Osi, cek naik level dan lencana.
 * Mengembalikan `false` bila bagian sudah pernah ditandai.
 */
export function completeSectionRead(
  sectionId: string,
  materi: Materi,
): boolean {
  const xpBefore = getStore().xp
  if (!markRead(sectionId)) return false
  const { stats } = getStore()
  if (!stats.materiTried.includes(materi)) {
    updateStats({ materiTried: [...stats.materiTried, materi] })
  }
  bumpMission('baca')
  bumpMission('bacaMateri', materi)
  checkLevelUp(xpBefore)
  recordDailyActivity()
  reviveIfArmed()
  checkBadges()
  return true
}

/**
 * Klaim reward misi yang sudah selesai. Mengembalikan XP yang diklaim
 * (0 bila misi belum selesai atau sudah diklaim).
 */
export function claimMission(missionId: string): {
  claimed: boolean
  xp: number
} {
  const today = todayMakassar()
  ensureMissionsToday(today)
  const mission = getDailyMissions(today).find((m) => m.id === missionId)
  if (!mission) return { claimed: false, xp: 0 }
  const { missions } = getStore()
  if (missions.claimed.includes(missionId)) return { claimed: false, xp: 0 }
  if ((missions.progress[missionId] ?? 0) < mission.target) {
    return { claimed: false, xp: 0 }
  }
  const xpBefore = getStore().xp
  addXp(mission.xp)
  updateMissions({ claimed: [...missions.claimed, missionId] })
  checkLevelUp(xpBefore)
  checkBadges()
  return { claimed: true, xp: mission.xp }
}
