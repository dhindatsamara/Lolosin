/**
 * Edge Function Lolosin: kirim-kode-pemenang (v2.8).
 *
 * Mengirim email berisi kode hadiah ke juara mingguan global yang
 * belum dikirimi email. Dijadwalkan tiap Senin 09:05 WITA lewat
 * pg_cron + pg_net (job 'kirim-email-pemenang', lihat blok di akhir
 * supabase/migrations/005_discussions_winners_fix.sql).
 *
 * Alur per run:
 *   1. Ambil baris weekly_winners scope 'global' yang code-nya sudah
 *      ada tapi email_sent_at-nya masih NULL.
 *   2. Untuk tiap pemenang, ambil email lewat Admin API
 *      (supabase.auth.admin.getUserById). Tabel profiles TIDAK punya
 *      kolom email, jadi email hanya bisa diambil dari auth.users
 *      lewat service role key.
 *   3. Kirim satu email per pemenang lewat Resend API.
 *   4. Bila Resend sukses, set email_sent_at = now() untuk baris itu.
 *
 * Idempotent: run ulang hanya memproses baris yang email_sent_at-nya
 * masih NULL. Pemenang yang emailnya tidak ditemukan dilewati dan
 * dicatat di log (tidak menggagalkan run). Pemenang yang pengiriman
 * Resend-nya gagal TIDAK ditandai terkirim, jadi dicoba lagi di run
 * berikutnya.
 *
 * Secret yang dipakai (diset lewat `supabase secrets set` atau
 * dashboard, lihat docs/PANDUAN-MIGRASI-005.md):
 *   - RESEND_API_KEY (wajib): API key Resend.
 *   - RESEND_FROM (opsional): alamat pengirim, default
 *     "Lolosin <hadiah@lolosin.app>". Untuk tes sebelum domain
 *     terverifikasi, set ke "Lolosin <onboarding@resend.dev>"
 *     (Resend hanya mengantar email tes ke alamat akun Resend).
 *   - FUNCTION_SECRET (opsional): bila diset, request harus membawa
 *     header x-function-secret dengan nilai yang sama. Lapisan
 *     tambahan di atas verifikasi JWT default Supabase (yang tetap
 *     aktif, function ini dipanggil dengan anon key dari pg_cron).
 * SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY disediakan otomatis
 * oleh Supabase di dalam function.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_URL = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'Lolosin <hadiah@lolosin.app>'

/** Hadiah premium per peringkat juara global (hari). */
function premiumDaysForRank(rank: number): number {
  if (rank === 1) return 7
  if (rank === 2) return 5
  return 3
}

/** Label rentang minggu dari Senin week_start, misal "10 Nov - 16 Nov 2026". */
function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return weekStart
  const end = new Date(start.getTime() + 6 * 86400000)
  const dayMonth = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'short',
  })
  const dayMonthYear = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${dayMonth.format(start)} - ${dayMonthYear.format(end)}`
}

/** Tanggal kedaluwarsa kode: 30 hari dari sekarang, misal "15 Des 2026". */
function formatExpiry(): string {
  const expiry = new Date(Date.now() + 30 * 86400000)
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Makassar',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(expiry)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

interface WinnerRow {
  id: string
  week_start: string
  rank: number
  user_id: string
  code: string
}

interface WinnerResult {
  user_id: string
  week_start: string
  rank: number
  status: 'sent' | 'failed' | 'skipped'
  /** Alasan gagal atau dilewati (bila ada). */
  reason?: string
}

function buildEmailHtml(winner: WinnerRow): string {
  const days = premiumDaysForRank(winner.rank)
  const minggu = formatWeekRange(winner.week_start)
  const expiry = formatExpiry()
  const code = escapeHtml(winner.code)
  return `<!DOCTYPE html>
<html lang="id">
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1c2430; line-height: 1.6; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 22px; margin-bottom: 8px;">Selamat, kamu juara ${winner.rank} mingguan Lolosin!</h1>
  <p>Kamu jadi juara ${winner.rank} leaderboard minggu ${minggu}. Sebagai hadiah, kamu dapat premium Lolosin ${days} hari. Ini kode hadiahmu:</p>
  <p style="text-align: center; margin: 24px 0;">
    <span style="display: inline-block; font-size: 28px; font-weight: bold; letter-spacing: 4px; background: #f2f4f8; border: 1px solid #d7dce3; border-radius: 8px; padding: 12px 20px;">${code}</span>
  </p>
  <p><strong>Cara menebus kode:</strong></p>
  <ol>
    <li>Buka Lolosin lalu masuk ke akunmu.</li>
    <li>Buka Profil, cari bagian Premium.</li>
    <li>Masukkan kode di atas lalu tebus. Premiummu langsung aktif ${days} hari.</li>
  </ol>
  <p>Kode ini berlaku sampai ${expiry}. Setelah tanggal itu kode tidak bisa dipakai lagi, jadi segera tebus ya.</p>
  <p>Kode yang sama juga tampil di gift notice dalam aplikasi saat kamu login.</p>
  <p>Terus semangat belajarnya, dan semoga lolos CPNS tahun ini!</p>
  <p style="color: #6b7280; font-size: 13px;">Tim Lolosin</p>
</body>
</html>`
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Lapisan keamanan tambahan (opsional): bila FUNCTION_SECRET diset,
  // request wajib membawa header x-function-secret yang cocok.
  // Verifikasi JWT default Supabase tetap aktif di depan function ini.
  const functionSecret = Deno.env.get('FUNCTION_SECRET')
  if (
    functionSecret &&
    req.headers.get('x-function-secret') !== functionSecret
  ) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!resendApiKey) {
    console.error('kirim-kode-pemenang: RESEND_API_KEY belum diset')
    return new Response(
      JSON.stringify({ error: 'RESEND_API_KEY belum diset di function secrets' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const from = Deno.env.get('RESEND_FROM') ?? DEFAULT_FROM

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('kirim-kode-pemenang: env Supabase tidak lengkap')
    return new Response(
      JSON.stringify({ error: 'env Supabase tidak lengkap' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Juara global yang sudah punya kode tapi emailnya belum dikirim.
  const { data: winners, error: winnersError } = await supabase
    .from('weekly_winners')
    .select('id, week_start, rank, user_id, code')
    .eq('scope', 'global')
    .not('code', 'is', null)
    .is('email_sent_at', null)
    .order('week_start', { ascending: true })
    .order('rank', { ascending: true })

  if (winnersError) {
    console.error('kirim-kode-pemenang: gagal baca weekly_winners', winnersError)
    return new Response(
      JSON.stringify({ error: 'gagal membaca daftar pemenang' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const results: WinnerResult[] = []
  let sent = 0
  let failed = 0
  let skipped = 0

  for (const winner of (winners ?? []) as WinnerRow[]) {
    // Email user diambil dari auth.users lewat Admin API. Tabel
    // profiles tidak punya kolom email, jadi tidak ada cara lain
    // yang bisa diandalkan dari dalam function ini.
    const { data: userData, error: userError } =
      await supabase.auth.admin.getUserById(winner.user_id)
    const email = userData?.user?.email ?? null
    if (userError || !email) {
      console.error(
        `kirim-kode-pemenang: email tidak ditemukan untuk user ${winner.user_id} (minggu ${winner.week_start} rank ${winner.rank})`,
        userError ?? undefined,
      )
      skipped += 1
      results.push({
        user_id: winner.user_id,
        week_start: winner.week_start,
        rank: winner.rank,
        status: 'skipped',
        reason: 'email tidak ditemukan',
      })
      continue
    }

    const days = premiumDaysForRank(winner.rank)
    let resendResponse: Response
    try {
      resendResponse = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: 'Kamu juara mingguan Lolosin! Ini kode hadiahmu',
          html: buildEmailHtml(winner),
          text:
            `Selamat, kamu juara ${winner.rank} mingguan Lolosin (minggu ${formatWeekRange(winner.week_start)})!\n\n` +
            `Kode hadiahmu: ${winner.code}\n\n` +
            `Tebus kode ini di Profil, bagian Premium, untuk mengaktifkan premium ${days} hari. ` +
            `Kode berlaku sampai ${formatExpiry()}.\n\n` +
            `Tim Lolosin`,
        }),
      })
    } catch (err) {
      console.error(
        `kirim-kode-pemenang: Resend tidak terjangkau untuk ${email} (minggu ${winner.week_start} rank ${winner.rank})`,
        err,
      )
      failed += 1
      results.push({
        user_id: winner.user_id,
        week_start: winner.week_start,
        rank: winner.rank,
        status: 'failed',
        reason: 'Resend tidak terjangkau',
      })
      continue
    }

    if (!resendResponse.ok) {
      const detail = await resendResponse.text().catch(() => '')
      console.error(
        `kirim-kode-pemenang: Resend gagal (${resendResponse.status}) untuk ${email} (minggu ${winner.week_start} rank ${winner.rank}): ${detail}`,
      )
      failed += 1
      results.push({
        user_id: winner.user_id,
        week_start: winner.week_start,
        rank: winner.rank,
        status: 'failed',
        reason: `Resend ${resendResponse.status}: ${detail.slice(0, 200)}`,
      })
      continue
    }

    // Hanya tandai terkirim SETELAH Resend sukses, supaya yang gagal
    // dicoba lagi di run berikutnya.
    const { error: updateError } = await supabase
      .from('weekly_winners')
      .update({ email_sent_at: new Date().toISOString() })
      .eq('id', winner.id)
    if (updateError) {
      console.error(
        `kirim-kode-pemenang: email terkirim ke ${email} tapi gagal menandai email_sent_at (id ${winner.id})`,
        updateError,
      )
      failed += 1
      results.push({
        user_id: winner.user_id,
        week_start: winner.week_start,
        rank: winner.rank,
        status: 'failed',
        reason: 'email terkirim tapi gagal menandai email_sent_at',
      })
      continue
    }

    sent += 1
    results.push({
      user_id: winner.user_id,
      week_start: winner.week_start,
      rank: winner.rank,
      status: 'sent',
    })
  }

  return new Response(JSON.stringify({ sent, failed, skipped, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
