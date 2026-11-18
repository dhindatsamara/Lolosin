import { claimMission } from '../../lib/gamification'
import { getMissionStatuses } from '../../lib/missions'
import { todayMakassar, useStore } from '../../lib/store'
import { cx } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ProgressBar } from '../ui/ProgressBar'
import { CheckIcon, TargetIcon, ZapIcon } from '../icons'

/**
 * Kartu misi harian: 3 misi yang sama untuk semua pengguna di hari yang
 * sama, dengan progress bar dan tombol klaim reward XP saat selesai.
 *
 * Dipadatkan (v2.6): peregangan setinggi kolom dari v2.4 dilepas
 * (tanpa h-full / flex-1), padding kartu misi dan ikon dikecilkan,
 * supaya section streak beranda lebih pendek. Tepi bawah kolom misi
 * boleh tidak sejajar dengan kolom streak.
 */
export function DailyMissions() {
  const { missions } = useStore()
  const today = todayMakassar()
  const statuses = getMissionStatuses(missions, today)
  const semuaDiklaim =
    statuses.length > 0 && statuses.every((s) => s.claimed)
  const selesaiCount = statuses.filter((s) => s.done).length

  return (
    <section aria-label="Misi harian" className="flex flex-col">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <p className="kicker">tantangan kecil, hadiah nyata</p>
          <h2 className="mt-1 font-display text-lg font-extrabold">
            Misi hari ini
          </h2>
        </div>
        <Badge tone="amber" className="shrink-0">
          {selesaiCount}/{statuses.length} selesai
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        {statuses.map(({ def, progress, done, claimed }) => (
          <Card key={def.id} className="flex flex-col justify-center p-3">
            <div className="flex items-start gap-3">
              <span
                className={cx(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                  claimed
                    ? 'bg-primary-100 text-primary-700'
                    : done
                      ? 'bg-accent-400 text-ink'
                      : 'bg-ink/5 text-ink/70',
                )}
              >
                {claimed ? (
                  <CheckIcon width={20} height={20} />
                ) : (
                  <TargetIcon width={20} height={20} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-sm leading-snug font-extrabold">
                    {def.judul}
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-extrabold text-accent-700">
                    <ZapIcon width={11} height={11} />+{def.xp} XP
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-snug font-medium text-ink/60">
                  {def.deskripsi}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <ProgressBar
                    value={progress}
                    max={def.target}
                    tone="primary"
                    label={`Progres misi ${def.judul}`}
                    className="flex-1"
                  />
                  <span className="shrink-0 text-xs font-extrabold text-ink/60">
                    {progress}/{def.target}
                  </span>
                </div>
                <div className="mt-1.5">
                  {claimed ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-3 py-1 text-xs font-extrabold text-primary-700">
                      <CheckIcon width={12} height={12} />
                      Diklaim +{def.xp} XP
                    </span>
                  ) : done ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => claimMission(def.id)}
                    >
                      <ZapIcon width={14} height={14} />
                      Klaim +{def.xp} XP
                    </Button>
                  ) : (
                    <span className="text-xs font-bold text-ink/50">
                      Selesaikan misinya untuk klaim reward.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {semuaDiklaim && (
        <p className="mt-2.5 rounded-2xl bg-primary-100 px-4 py-3 text-center text-sm font-bold text-primary-700">
          Misi hari ini beres semua. Besok gas lagi!
        </p>
      )}
    </section>
  )
}
