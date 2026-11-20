/**
 * Harga paket Premium Lolosin (v2.15).
 *
 * File ini SATU-SATUNYA sumber harga di app: halaman /premium,
 * checkout QRIS, dan panel admin semuanya membaca dari sini, jadi
 * mengubah harga cukup di satu tempat. Harga sudah diputuskan
 * Dhinda (2026-11-19/20) dan hanya ada DUA paket:
 *
 * - Paket SKD: Rp69.000 sekali bayar (harga coret Rp99.000),
 *   semua fitur premium selamanya (lifetime). Paket utama.
 * - Bulanan: Rp20.000 per bulan (harga coret Rp30.000), premium
 *   30 hari. Paket percobaan.
 *
 * Lifetime diputuskan Dhinda 2026-11-20 (menggantikan rencana
 * awal "sampai SKD berakhir"). Teknisnya, saat admin menyetujui
 * klaim Paket SKD, Edge Function admin-actions mengisi
 * premium_until dengan 31 Desember 2099 (representasi lifetime,
 * lihat supabase/functions/admin-actions/index.ts).
 *
 * Pembayaran MANUAL (tanpa gateway): user bayar nominal pas lewat
 * QRIS, tap "Saya sudah bayar", admin memverifikasi (nominal +
 * waktu) di panel admin lalu menyetujui, premium aktif. Klaim
 * pembayaran tersimpan di tabel payment_claims (migrasi 011).
 */

/** ID paket. */
export type PackageId = 'skd' | 'monthly'

/** Satu paket premium. */
export interface Package {
  id: PackageId
  /** Nama paket seperti tampil di kartu dan checkout. */
  label: string
  /** Harga bayar (rupiah, tanpa titik ribuan). */
  price: number
  /** Harga coret (rupiah), ditampilkan sebagai anchor. */
  anchorPrice: number
  /** Keterangan durasi di kartu paket. */
  durationLabel: string
  /** Jumlah hari premium untuk paket bulanan; null untuk SKD. */
  days: number | null
  /** True bila ini paket utama (hero). */
  hero: boolean
  /** Kalimat ajakan ringan di kartu paket (v2.15.1). */
  tagline: string
}

/** Daftar paket, urutan tampil: Paket SKD dulu, lalu Bulanan. */
export const PACKAGES: Package[] = [
  {
    id: 'skd',
    label: 'Paket SKD',
    price: 69000,
    anchorPrice: 99000,
    durationLabel: 'Sekali bayar, premium selamanya',
    days: null,
    hero: true,
    tagline: 'Lebih murah dari sekali nongkrong, tapi manfaatnya selamanya.',
  },
  {
    id: 'monthly',
    label: 'Bulanan',
    price: 20000,
    anchorPrice: 30000,
    durationLabel: 'Premium 30 hari',
    days: 30,
    hero: false,
    tagline: 'Buat yang mau coba-coba dulu, santai aja.',
  },
]

/** Cari paket berdasarkan id, atau undefined bila tidak ada. */
export function getPackage(id: string | null | undefined): Package | undefined {
  return PACKAGES.find((p) => p.id === id)
}

/** Format rupiah tanpa desimal, mis. 69000 jadi "Rp69.000". */
export function formatRupiah(amount: number): string {
  return `Rp${amount.toLocaleString('id-ID')}`
}

/**
 * Manfaat premium yang didapat SEMUA paket (bedanya hanya durasi).
 * Daftar ini mengikuti DRAF-BATASAN-FREE-PREMIUM.md: yang berbayar
 * adalah pendalaman dan kemudahan, bukan akses ke ilmu dasar.
 * Bahasanya dibuat ringan dan playful sejak v2.15.1 supaya halaman
 * /premium terasa mengajak, bukan sekadar daftar fitur.
 */
export const PREMIUM_BENEFITS: string[] = [
  'Tryout Kilat tanpa batas, latihan sepuasnya sampai pede',
  'Ikut Tryout Akbar tiap Minggu, rasain deg-degan CAT beneran',
  'Pembahasan Akbar langsung kebuka, nggak usah nunggu Senin',
  'Live scoreboard Akbar, intip posisimu naik turun secara realtime',
  'Bisa host semua sesi, jadi tuan rumah Quizizz dan turnamen',
  'Peta kelemahanmu, biar belajarnya nembak yang lemah, bukan yang udah jago',
  'Riwayat tryout lengkap, liat skormu naik dari minggu ke minggu',
]

/**
 * URL gambar QRIS Lolosin di Supabase Storage (bucket assets).
 * Dipakai karena tool push tidak bisa mengirim file biner, jadi
 * public/qris-lolosin.png belum ada di repo remote. Setelah PNG
 * itu masuk repo (rencana 1 Des 2026), boleh kembali ke
 * '/qris-lolosin.png'.
 */
export const QRIS_IMAGE_PATH =
  'https://rhoyeloqiorbspsucljt.supabase.co/storage/v1/object/public/assets/qris-lolosin.png'
