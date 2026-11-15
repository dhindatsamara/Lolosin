/**
 * Hub Game (/main): pintu masuk lima game Lolosin.
 *
 * - Battle 1v1: gratis, wajib login.
 * - Sesi ala Quizizz: ikut main gratis wajib login, jadi host premium.
 * - Kuis Kilat: solo, bisa dimainkan tanpa login.
 * - Kartu Kilat: flashcard solo, bisa dimainkan tanpa login.
 * - Benar/Salah Kilat: solo, bisa dimainkan tanpa login.
 *
 * Bila Supabase belum terkonfigurasi atau user belum login, kartu
 * battle dan sesi menampilkan keadaan terkunci dengan ajakan masuk,
 * bukan crash.
 */
import { Link } from 'react-router-dom'
import { useAuthUser } from '../lib/auth'
import { isSupabaseConfigured } from '../lib/supabase'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import {
  BookIcon,
  GamepadIcon,
  InfoIcon,
  SwordsIcon,
  TargetIcon,
  UsersIcon,
  ZapIcon,
} from '../components/icons'

export function MainHubPage() {
  const { user, loading } = useAuthUser()
  const configured = isSupabaseConfigured()
  const onlineReady = configured && user !== null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header>
        <p className="kicker flex items-center gap-1.5">
          <GamepadIcon width={16} height={16} />
          Main Game
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold lg:text-4xl">
          Belajar sambil main
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/60 lg:text-base">
          Lima cara seru buat ngasah soal CPNS: adu cepat lawan teman,
          main bareng satu sesi, kejar skor kilat sendirian, hafalan
          kartu bolak-balik, atau nilai pernyataan benar dan salah.
        </p>
      </header>

      {!configured && (
        <p className="flex items-start gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-sm leading-relaxed font-medium text-ink/70 shadow-soft">
          <InfoIcon width={18} height={18} className="mt-0.5 shrink-0" />
          Fitur online belum aktif, jadi Battle dan Sesi belum bisa
          dipakai. Kuis Kilat, Kartu Kilat, dan Benar/Salah Kilat tetap
          bisa dimainkan.
        </p>
      )}

      {configured && !loading && !user && (
        <p className="flex items-start gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-sm leading-relaxed font-medium text-ink/70 shadow-soft">
          <InfoIcon width={18} height={18} className="mt-0.5 shrink-0" />
          Masuk dulu biar bisa Battle 1v1 dan ikut Sesi. Kuis Kilat,
          Kartu Kilat, dan Benar/Salah Kilat bisa langsung dimainkan
          tanpa masuk.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="reveal card-lift flex flex-col gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-700">
            <SwordsIcon width={24} height={24} />
          </span>
          <div>
            <h2 className="font-display text-xl font-extrabold">
              Battle 1v1
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink/60">
              Duel 10 soal lawan satu teman, yang paling banyak benar
              dan paling cepat menang.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="green">Gratis</Badge>
            <Badge tone="neutral">Butuh login</Badge>
          </div>
          <div className="mt-auto pt-1">
            {onlineReady ? (
              <Link to="/main/battle" className="block">
                <Button fullWidth>Masuk Battle</Button>
              </Link>
            ) : (
              <Link to="/auth" className="block">
                <Button fullWidth variant="outline">
                  Masuk dulu buat Battle
                </Button>
              </Link>
            )}
          </div>
        </Card>

        <Card className="reveal card-lift flex flex-col gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-100 text-accent-700">
            <UsersIcon width={24} height={24} />
          </span>
          <div>
            <h2 className="font-display text-xl font-extrabold">
              Sesi Bareng
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink/60">
              Main bareng sampai 50 orang dalam satu sesi, leaderboard
              live, ada podium di akhir.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="green">Ikut main gratis</Badge>
            <Badge tone="amber">Host itu Premium</Badge>
          </div>
          <div className="mt-auto flex flex-col gap-2 pt-1">
            {onlineReady ? (
              <>
                <Link to="/main/sesi" className="block">
                  <Button fullWidth>Ikut Sesi</Button>
                </Link>
                <Link to="/main/sesi/host" className="block">
                  <Button fullWidth variant="outline">
                    Jadi Host
                  </Button>
                </Link>
              </>
            ) : (
              <Link to="/auth" className="block">
                <Button fullWidth variant="outline">
                  Masuk dulu buat Sesi
                </Button>
              </Link>
            )}
          </div>
        </Card>

        <Card className="reveal card-lift flex flex-col gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tiu-soft text-tiu">
            <ZapIcon width={24} height={24} />
          </span>
          <div>
            <h2 className="font-display text-xl font-extrabold">
              Kuis Kilat
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink/60">
              60 detik, soal acak campur TWK, TIU, TKP. Jawaban benar
              beruntun menaikkan kombo dan poin.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="green">Gratis</Badge>
            <Badge tone="neutral">Tanpa login</Badge>
          </div>
          <div className="mt-auto pt-1">
            <Link to="/main/kuis-kilat" className="block">
              <Button fullWidth>Main Kuis Kilat</Button>
            </Link>
          </div>
        </Card>

        <Card className="reveal card-lift flex flex-col gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-twk-soft text-twk">
            <BookIcon width={24} height={24} />
          </span>
          <div>
            <h2 className="font-display text-xl font-extrabold">
              Kartu Kilat
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink/60">
              Hafalan cepat pakai kartu bolak-balik: 20 kartu per sesi,
              tandai Hafal kalau sudah ingat jawabannya.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="green">Gratis</Badge>
            <Badge tone="neutral">Tanpa login</Badge>
          </div>
          <div className="mt-auto pt-1">
            <Link to="/main/kartu-kilat" className="block">
              <Button fullWidth>Main Kartu Kilat</Button>
            </Link>
          </div>
        </Card>

        <Card className="reveal card-lift flex flex-col gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tkp-soft text-tkp">
            <TargetIcon width={24} height={24} />
          </span>
          <div>
            <h2 className="font-display text-xl font-extrabold">
              Benar/Salah Kilat
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink/60">
              60 detik, nilai klaim jawaban TWK dan TIU: benar atau
              salah? Jawaban benar beruntun menaikkan kombo dan poin.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="green">Gratis</Badge>
            <Badge tone="neutral">Tanpa login</Badge>
          </div>
          <div className="mt-auto pt-1">
            <Link to="/main/benar-salah" className="block">
              <Button fullWidth>Main Benar/Salah Kilat</Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
