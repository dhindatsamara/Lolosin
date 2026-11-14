/**
 * Client Supabase untuk Lolosin (auth, leaderboard, pengiriman skor).
 *
 * Kredensial dibaca dari env var:
 * - VITE_SUPABASE_URL: Project URL, misal https://xxx.supabase.co
 * - VITE_SUPABASE_PUBLISHABLE_KEY: Publishable key (pengganti anon key lama,
 *   aman dipakai di browser). JANGAN pernah memakai Secret key di sini.
 *
 * Bila env belum diisi atau belum sah, `supabase` bernilai null dan app
 * tetap jalan dalam mode lokal (tanpa auth dan leaderboard online).
 * Modul ini tidak pernah melempar error dan tidak pernah menulis key
 * ke log.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** URL proyek Supabase yang sah: https://<ref>.supabase.co */
const SUPABASE_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i

/** Potongan kata yang menandakan nilai env masih placeholder. */
const PLACEHOLDER_MARKERS = ['placeholder', 'contoh', 'YOUR_']

function readEnv(name: string): string {
  const value = import.meta.env[name]
  return typeof value === 'string' ? value.trim() : ''
}

/** True bila key terlihat seperti placeholder, bukan key asli. */
function isPlaceholderKey(key: string): boolean {
  const lower = key.toLowerCase()
  return PLACEHOLDER_MARKERS.some((marker) =>
    lower.includes(marker.toLowerCase()),
  )
}

/**
 * True bila Supabase terkonfigurasi dengan benar:
 * - kedua env var tidak kosong,
 * - URL berbentuk https://*.supabase.co,
 * - key bukan placeholder.
 */
export function isSupabaseConfigured(): boolean {
  const url = readEnv('VITE_SUPABASE_URL')
  const key = readEnv('VITE_SUPABASE_PUBLISHABLE_KEY')
  if (url === '' || key === '') return false
  if (!SUPABASE_URL_PATTERN.test(url)) return false
  if (isPlaceholderKey(key)) return false
  return true
}

/**
 * Client Supabase, atau null bila env belum diisi atau belum sah.
 * Worker auth/leaderboard wajib cek null sebelum memakai client ini.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(
      readEnv('VITE_SUPABASE_URL'),
      readEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
    )
  : null
