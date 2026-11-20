/**
 * Edge Function Lolosin: admin-actions (v2.14, ditambah v2.15).
 *
 * Satu pintu untuk semua aksi dan bacaan sensitif panel admin
 * (/admin): daftar user + progres, kasih/cabut premium, daftar dan
 * buat kode redeem, kirim ulang email kode juara mingguan, dan
 * (v2.15) kelola klaim pembayaran premium: daftar klaim, setujui
 * klaim (premium aktif), tolak klaim.
 *
 * Keamanan: setiap request WAJIB membawa JWT user di header
 * Authorization. Function memvalidasi JWT itu, lalu membaca
 * profiles.is_admin pemanggil lewat service role. Bukan admin
 * berarti 403, tanpa terkecuali. Client tidak pernah dipercaya
 * soal status admin: menyembunyikan halaman /admin di tampilan
 * hanyalah UX, penegakan sesungguhnya ada di sini.
 *
 * Dipanggil dari browser (supabase.functions.invoke), jadi CORS
 * diaktifkan. verify_jwt di dashboard HARUS tetap aktif (default).
 *
 * Aksi (POST JSON { action, ...params }):
 *   - list_users { q?, limit?, offset? }: user + XP, streak,
 *     tryout terakhir. Cari berdasarkan username.
 *   - grant_premium { user_id, days }: premium_until diperpanjang
 *     dari tanggal aktif terjauh (menumpuk, sama seperti redeem).
 *   - revoke_premium { user_id }: is_premium false,
 *     premium_until null.
 *   - list_codes { limit? }: kode + siapa yang sudah redeem.
 *   - create_code { premium_days, max_uses, expires_at?, note? }:
 *     buat kode 10 karakter (alfabet sama seperti
 *     create_redeem_code: tanpa huruf/angka yang mirip).
 *   - resend_winner_email { winner_id }: reset email_sent_at
 *     juara global itu lalu panggil fungsi kirim-kode-pemenang.
 *   - list_payments { limit? }: klaim pembayaran terbaru dulu,
 *     lengkap dengan username pengklaim.
 *   - approve_payment { payment_id }: setujui klaim pending,
 *     premium aktif (Paket SKD lifetime, Bulanan +30 hari
 *     menumpuk dari tanggal aktif terjauh).
 *   - reject_payment { payment_id, note? }: tolak klaim pending.
 *
 * Secret yang dipakai (diset lewat dashboard, lihat
 * docs/PANDUAN-REDEPLOY-EDGE-ADMIN.md):
 *   - WINNER_EMAIL_FUNCTION_SLUG (opsional): slug deploy fungsi
 *     kirim-kode-pemenang, default 'kirim-kode-pemenang'. Di
 *     produksi slug-nya 'clever-action', jadi secret ini WAJIB
 *     diset di sana supaya kirim ulang langsung jalan; tanpa itu
 *     reset tetap berhasil dan email terkirim di run cron Senin.
 *   - WINNER_EMAIL_FUNCTION_SECRET (opsional): bila fungsi
 *     kirim-kode-pemenang memakai FUNCTION_SECRET, isi yang sama
 *     di sini supaya pemanggilan antar fungsi diterima.
 * SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY disediakan otomatis
 * oleh Supabase di dalam function.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/**
 * Representasi lifetime untuk premium Paket SKD (keputusan
 * Dhinda 2026-11-20, menggantikan rencana awal "sampai SKD
 * berakhir"): premium_until diisi akhir 31 Desember 2099
 * (23:59:59 WITA, sebagai ISO UTC). Bukan tanggal kedaluwarsa
 * beneran, hanya nilai jauh di masa depan karena kolomnya
 * bertipe timestamptz.
 */
const LIFETIME_PREMIUM_UNTIL = '2099-12-31T15:59:59.000Z'

/** Batas halaman daftar user dan kode. */
const MAX_LIMIT = 50

function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

/** True bila error Postgres menandakan kolom is_admin belum ada. */
function isMissingAdminColumnError(error: { code?: string; message?: string }): boolean {
  if (error.code === '42703') return true
  const message = (error.message ?? '').toLowerCase()
  return message.includes('is_admin') && message.includes('column')
}

/** Bilangan bulat positif dari input, atau null bila tidak sah. */
function toPositiveInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

/** Generate kode 10 karakter dari alfabet tanpa huruf/angka mirip. */
function generateCode(): string {
  let code = ''
  for (let i = 0; i < 10; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}

interface AdminContext {
  userId: string
  // deno-lint-ignore no-explicit-any
  supabase: any
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Preflight CORS dari browser.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method tidak didukung' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('admin-actions: env Supabase tidak lengkap')
    return jsonResponse({ ok: false, error: 'env Supabase tidak lengkap' }, 500)
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Validasi JWT pemanggil, lalu cek is_admin lewat service role.
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : ''
  if (!token) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
  }
  const { data: userData, error: userError } =
    await supabase.auth.getUser(token)
  const callerId = userData?.user?.id ?? null
  if (userError || !callerId) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
  }
  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', callerId)
    .maybeSingle()
  if (callerError) {
    if (isMissingAdminColumnError(callerError)) {
      return jsonResponse(
        { ok: false, error: 'migrasi 009 belum dijalankan' },
        500,
      )
    }
    console.error('admin-actions: gagal membaca profil pemanggil', callerError)
    return jsonResponse({ ok: false, error: 'gagal memeriksa admin' }, 500)
  }
  if (!callerProfile || callerProfile.is_admin !== true) {
    return jsonResponse({ ok: false, error: 'forbidden' }, 403)
  }
  const ctx: AdminContext = { userId: callerId, supabase }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return jsonResponse({ ok: false, error: 'body JSON tidak sah' }, 400)
  }
  const action = typeof body.action === 'string' ? body.action : ''

  try {
    switch (action) {
      case 'list_users':
        return jsonResponse(await listUsers(ctx, body))
      case 'grant_premium':
        return jsonResponse(await grantPremium(ctx, body))
      case 'revoke_premium':
        return jsonResponse(await revokePremium(ctx, body))
      case 'list_codes':
        return jsonResponse(await listCodes(ctx, body))
      case 'create_code':
        return jsonResponse(await createCode(ctx, body))
      case 'resend_winner_email':
        return jsonResponse(await resendWinnerEmail(ctx, body))
      case 'list_payments':
        return jsonResponse(await listPayments(ctx, body))
      case 'approve_payment':
        return jsonResponse(await approvePayment(ctx, body))
      case 'reject_payment':
        return jsonResponse(await rejectPayment(ctx, body))
      default:
        return jsonResponse({ ok: false, error: 'action tidak dikenal' }, 400)
    }
  } catch (err) {
    console.error(`admin-actions: action ${action} gagal`, err)
    return jsonResponse(
      { ok: false, error: 'terjadi kesalahan di server' },
      500,
    )
  }
})

/** Daftar user + XP, streak, tryout terakhir. Cari via username. */
async function listUsers(
  ctx: AdminContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const q = typeof body.q === 'string' ? body.q.trim() : ''
  const limitRaw = toPositiveInt(body.limit) ?? 20
  const limit = Math.min(limitRaw, MAX_LIMIT)
  const offsetRaw = toPositiveInt(body.offset) ?? 1
  const offset = offsetRaw - 1 >= 0 ? offsetRaw - 1 : 0

  let query = ctx.supabase
    .from('profiles')
    .select(
      'id, username, formasi, created_at, is_premium, premium_until, is_admin',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (q) query = query.ilike('username', `%${q}%`)
  const { data: profiles, count, error } = await query
  if (error) {
    console.error('admin-actions list_users: gagal baca profiles', error)
    throw new Error('gagal membaca daftar user')
  }
  const rows = (profiles ?? []) as Array<Record<string, unknown>>
  const ids = rows.map((r) => r.id as string)
  if (ids.length === 0) {
    return { ok: true, users: [], total: count ?? 0 }
  }

  // Progres (XP, streak) dari user_progress.data (JSONB).
  const { data: progressRows } = await ctx.supabase
    .from('user_progress')
    .select('user_id, data')
    .in('user_id', ids)
  const progressByUser = new Map<string, { xp: number; streak: number }>()
  for (const row of (progressRows ?? []) as Array<Record<string, unknown>>) {
    const data = (row.data ?? {}) as Record<string, unknown>
    progressByUser.set(row.user_id as string, {
      xp: typeof data.xp === 'number' ? data.xp : 0,
      streak: typeof data.streak === 'number' ? data.streak : 0,
    })
  }

  // Tryout terakhir tiap user (satu baris terbaru per user).
  const { data: tryoutRows } = await ctx.supabase
    .from('tryout_results')
    .select('user_id, finished_at, total, mode')
    .in('user_id', ids)
    .order('finished_at', { ascending: false })
    .limit(500)
  const lastTryoutByUser = new Map<
    string,
    { finished_at: string; total: number; mode: string }
  >()
  for (const row of (tryoutRows ?? []) as Array<Record<string, unknown>>) {
    const userId = row.user_id as string
    if (lastTryoutByUser.has(userId)) continue
    lastTryoutByUser.set(userId, {
      finished_at: row.finished_at as string,
      total: row.total as number,
      mode: row.mode as string,
    })
  }

  const users = rows.map((r) => {
    const id = r.id as string
    const progress = progressByUser.get(id) ?? { xp: 0, streak: 0 }
    return {
      id,
      username: r.username,
      formasi: r.formasi,
      created_at: r.created_at,
      is_premium: r.is_premium === true,
      premium_until: r.premium_until,
      is_admin: r.is_admin === true,
      xp: progress.xp,
      streak: progress.streak,
      last_tryout: lastTryoutByUser.get(id) ?? null,
    }
  })
  return { ok: true, users, total: count ?? users.length }
}

/** Kasih premium sejumlah hari (menumpuk dari tanggal aktif terjauh). */
async function grantPremium(
  ctx: AdminContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const userId = typeof body.user_id === 'string' ? body.user_id : ''
  const days = toPositiveInt(body.days)
  if (!userId) return { ok: false, error: 'user_id wajib diisi' }
  if (days === null || days > 3650) {
    return { ok: false, error: 'days harus 1 sampai 3650' }
  }
  const { data: target, error: targetError } = await ctx.supabase
    .from('profiles')
    .select('id, premium_until')
    .eq('id', userId)
    .maybeSingle()
  if (targetError || !target) {
    return { ok: false, error: 'user tidak ditemukan' }
  }
  const currentUntil = target.premium_until as string | null
  const baseMs = currentUntil ? Date.parse(currentUntil) : NaN
  const base = !Number.isNaN(baseMs) && baseMs > Date.now()
    ? baseMs
    : Date.now()
  const newUntil = new Date(base + days * 86400000).toISOString()
  const { error } = await ctx.supabase
    .from('profiles')
    .update({ premium_until: newUntil })
    .eq('id', userId)
  if (error) {
    console.error('admin-actions grant_premium: gagal update', error)
    throw new Error('gagal memberi premium')
  }
  return { ok: true, premium_until: newUntil }
}

/** Cabut premium: is_premium false, premium_until null. */
async function revokePremium(
  ctx: AdminContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const userId = typeof body.user_id === 'string' ? body.user_id : ''
  if (!userId) return { ok: false, error: 'user_id wajib diisi' }
  const { data: target, error: targetError } = await ctx.supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  if (targetError || !target) {
    return { ok: false, error: 'user tidak ditemukan' }
  }
  const { error } = await ctx.supabase
    .from('profiles')
    .update({ is_premium: false, premium_until: null })
    .eq('id', userId)
  if (error) {
    console.error('admin-actions revoke_premium: gagal update', error)
    throw new Error('gagal mencabut premium')
  }
  return { ok: true }
}

/** Daftar kode redeem + siapa yang sudah menebus masing-masing. */
async function listCodes(
  ctx: AdminContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const limitRaw = toPositiveInt(body.limit) ?? 50
  const limit = Math.min(limitRaw, 100)
  const { data: codes, error } = await ctx.supabase
    .from('codes')
    .select(
      'code, premium_days, max_uses, uses, expires_at, note, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('admin-actions list_codes: gagal baca codes', error)
    throw new Error('gagal membaca daftar kode')
  }
  const rows = (codes ?? []) as Array<Record<string, unknown>>
  const codeList = rows.map((r) => r.code as string)
  const redemptionsByCode = new Map<
    string,
    Array<{ username: string | null; redeemed_at: string }>
  >()
  if (codeList.length > 0) {
    const { data: redemptions } = await ctx.supabase
      .from('code_redemptions')
      .select('code, user_id, redeemed_at')
      .in('code', codeList)
      .order('redeemed_at', { ascending: true })
    const redemptionRows = (redemptions ?? []) as Array<Record<string, unknown>>
    const userIds = [...new Set(redemptionRows.map((r) => r.user_id as string))]
    const usernameById = new Map<string, string>()
    if (userIds.length > 0) {
      const { data: profiles } = await ctx.supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds)
      for (const p of (profiles ?? []) as Array<Record<string, unknown>>) {
        usernameById.set(p.id as string, p.username as string)
      }
    }
    for (const r of redemptionRows) {
      const code = r.code as string
      const list = redemptionsByCode.get(code) ?? []
      list.push({
        username: usernameById.get(r.user_id as string) ?? null,
        redeemed_at: r.redeemed_at as string,
      })
      redemptionsByCode.set(code, list)
    }
  }
  const codesOut = rows.map((r) => ({
    ...r,
    redemptions: redemptionsByCode.get(r.code as string) ?? [],
  }))
  return { ok: true, codes: codesOut }
}

/** Buat satu kode redeem baru. */
async function createCode(
  ctx: AdminContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const days = toPositiveInt(body.premium_days)
  const maxUses = toPositiveInt(body.max_uses)
  if (days === null || days > 3650) {
    return { ok: false, error: 'premium_days harus 1 sampai 3650' }
  }
  if (maxUses === null || maxUses > 1000) {
    return { ok: false, error: 'max_uses harus 1 sampai 1000' }
  }
  const expiresAt = typeof body.expires_at === 'string' && body.expires_at
    ? body.expires_at
    : null
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) {
    return { ok: false, error: 'expires_at bukan tanggal yang sah' }
  }
  const note = typeof body.note === 'string'
    ? body.note.trim().slice(0, 200)
    : null

  // Generate sampai dapat kode yang belum dipakai.
  let code = ''
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generateCode()
    const { data } = await ctx.supabase
      .from('codes')
      .select('code')
      .eq('code', candidate)
      .maybeSingle()
    if (!data) {
      code = candidate
      break
    }
  }
  if (!code) {
    return { ok: false, error: 'gagal membuat kode unik, coba lagi' }
  }
  const { error } = await ctx.supabase.from('codes').insert({
    code,
    premium_days: days,
    max_uses: maxUses,
    expires_at: expiresAt,
    note: note || null,
    created_by: ctx.userId,
  })
  if (error) {
    console.error('admin-actions create_code: gagal insert', error)
    throw new Error('gagal membuat kode')
  }
  return { ok: true, code }
}

/**
 * Kirim ulang email kode juara: reset email_sent_at lalu panggil
 * fungsi kirim-kode-pemenang. Bila pemanggilan gagal, reset tetap
 * berhasil sehingga cron Senin akan mengirimnya; respons menandai
 * resent false supaya admin tahu email belum langsung terkirim.
 */
async function resendWinnerEmail(
  ctx: AdminContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const winnerId = typeof body.winner_id === 'string' ? body.winner_id : ''
  if (!winnerId) return { ok: false, error: 'winner_id wajib diisi' }
  const { data: winner, error: winnerError } = await ctx.supabase
    .from('weekly_winners')
    .select('id, week_start, rank, user_id, scope, code')
    .eq('id', winnerId)
    .maybeSingle()
  if (winnerError || !winner) {
    return { ok: false, error: 'juara tidak ditemukan' }
  }
  if (winner.scope !== 'global' || !winner.code) {
    return {
      ok: false,
      error: 'hanya juara global yang punya kode yang bisa dikirim ulang',
    }
  }
  const { error: resetError } = await ctx.supabase
    .from('weekly_winners')
    .update({ email_sent_at: null })
    .eq('id', winnerId)
  if (resetError) {
    console.error('admin-actions resend: gagal reset email_sent_at', resetError)
    throw new Error('gagal menjadwalkan ulang email')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') as string
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
  const slug = Deno.env.get('WINNER_EMAIL_FUNCTION_SLUG') ||
    'kirim-kode-pemenang'
  const url = `${supabaseUrl}/functions/v1/${slug}`
  const headers: Record<string, string> = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  }
  const functionSecret = Deno.env.get('WINNER_EMAIL_FUNCTION_SECRET')
  if (functionSecret) headers['x-function-secret'] = functionSecret
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: '{}',
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(
        `admin-actions resend: fungsi email gagal (${res.status}): ${detail.slice(0, 200)}`,
      )
      return {
        ok: true,
        resent: false,
        detail:
          'Email dijadwalkan ulang, tapi pengiriman langsung gagal. Cron Senin akan mengirimnya.',
      }
    }
    return { ok: true, resent: true, detail: 'Email terkirim.' }
  } catch (err) {
    console.error('admin-actions resend: fungsi email tidak terjangkau', err)
    return {
      ok: true,
      resent: false,
      detail:
        'Email dijadwalkan ulang, tapi fungsi email tidak terjangkau. Cron Senin akan mengirimnya.',
    }
  }
}

/** Daftar klaim pembayaran terbaru dulu, lengkap dengan username. */
async function listPayments(
  ctx: AdminContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const limitRaw = toPositiveInt(body.limit) ?? 50
  const limit = Math.min(limitRaw, 100)
  const { data: claims, error } = await ctx.supabase
    .from('payment_claims')
    .select(
      'id, user_id, package, amount, status, created_at, verified_at, verified_by, note',
    )
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('admin-actions list_payments: gagal baca payment_claims', error)
    throw new Error('gagal membaca daftar pembayaran')
  }
  const rows = (claims ?? []) as Array<Record<string, unknown>>
  const userIds = [...new Set(rows.map((r) => r.user_id as string))]
  const usernameById = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await ctx.supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds)
    for (const p of (profiles ?? []) as Array<Record<string, unknown>>) {
      usernameById.set(p.id as string, p.username as string)
    }
  }
  const payments = rows.map((r) => ({
    ...r,
    username: usernameById.get(r.user_id as string) ?? null,
  }))
  return { ok: true, payments }
}

/**
 * Setujui klaim pembayaran pending: status jadi approved dan
 * premium aktif untuk pengklaim. Paket SKD: premium lifetime
 * (premium_until 31 Desember 2099, atau tanggal premium aktif
 * yang sudah lebih jauh bila ada, supaya tidak memendekkan
 * premium yang sudah dibeli). Bulanan: +30 hari menumpuk dari
 * tanggal aktif terjauh, sama seperti grant_premium. Klaim yang
 * sudah diproses tidak bisa disetujui dua kali.
 */
async function approvePayment(
  ctx: AdminContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const paymentId = typeof body.payment_id === 'string' ? body.payment_id : ''
  if (!paymentId) return { ok: false, error: 'payment_id wajib diisi' }
  const { data: claim, error: claimError } = await ctx.supabase
    .from('payment_claims')
    .select('id, user_id, package, amount, status')
    .eq('id', paymentId)
    .maybeSingle()
  if (claimError || !claim) {
    return { ok: false, error: 'klaim pembayaran tidak ditemukan' }
  }
  if (claim.status !== 'pending') {
    return { ok: false, error: 'klaim ini sudah diproses' }
  }
  const { data: target, error: targetError } = await ctx.supabase
    .from('profiles')
    .select('id, premium_until')
    .eq('id', claim.user_id)
    .maybeSingle()
  if (targetError || !target) {
    return { ok: false, error: 'user tidak ditemukan' }
  }
  const currentUntil = target.premium_until as string | null
  const currentMs = currentUntil ? Date.parse(currentUntil) : NaN
  const activeMs = !Number.isNaN(currentMs) && currentMs > Date.now()
    ? currentMs
    : null
  let newUntil: string
  if (claim.package === 'skd') {
    const lifetimeMs = Date.parse(LIFETIME_PREMIUM_UNTIL)
    newUntil = new Date(Math.max(activeMs ?? 0, lifetimeMs)).toISOString()
  } else if (claim.package === 'monthly') {
    const base = activeMs ?? Date.now()
    newUntil = new Date(base + 30 * 86400000).toISOString()
  } else {
    return { ok: false, error: 'paket klaim tidak dikenal' }
  }
  const { error: updateError } = await ctx.supabase
    .from('profiles')
    .update({ premium_until: newUntil })
    .eq('id', claim.user_id)
  if (updateError) {
    console.error('admin-actions approve_payment: gagal update premium', updateError)
    throw new Error('gagal mengaktifkan premium')
  }
  const { error: claimUpdateError } = await ctx.supabase
    .from('payment_claims')
    .update({
      status: 'approved',
      verified_at: new Date().toISOString(),
      verified_by: ctx.userId,
    })
    .eq('id', paymentId)
  if (claimUpdateError) {
    console.error('admin-actions approve_payment: gagal update klaim', claimUpdateError)
    throw new Error('gagal memperbarui klaim')
  }
  return { ok: true, premium_until: newUntil }
}

/** Tolak klaim pembayaran pending (dengan catatan opsional). */
async function rejectPayment(
  ctx: AdminContext,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const paymentId = typeof body.payment_id === 'string' ? body.payment_id : ''
  if (!paymentId) return { ok: false, error: 'payment_id wajib diisi' }
  const note = typeof body.note === 'string'
    ? body.note.trim().slice(0, 200)
    : null
  const { data: claim, error: claimError } = await ctx.supabase
    .from('payment_claims')
    .select('id, status')
    .eq('id', paymentId)
    .maybeSingle()
  if (claimError || !claim) {
    return { ok: false, error: 'klaim pembayaran tidak ditemukan' }
  }
  if (claim.status !== 'pending') {
    return { ok: false, error: 'klaim ini sudah diproses' }
  }
  const { error } = await ctx.supabase
    .from('payment_claims')
    .update({
      status: 'rejected',
      verified_at: new Date().toISOString(),
      verified_by: ctx.userId,
      note: note || null,
    })
    .eq('id', paymentId)
  if (error) {
    console.error('admin-actions reject_payment: gagal update klaim', error)
    throw new Error('gagal menolak klaim')
  }
  return { ok: true }
}
