/**
 * Konfigurasi situs: tautan resmi dan alamat saran.
 *
 * Tautan resmi tampil di footer sebagai kolom "Tautan resmi" (v2.4):
 * situs pemerintah terkait seleksi CPNS, dibuka di tab baru.
 */

/** Satu tautan resmi di footer. */
export interface OfficialLink {
  label: string
  href: string
}

/** Situs resmi terkait seleksi CPNS. */
export const OFFICIAL_LINKS: OfficialLink[] = [
  { label: 'SSCASN', href: 'https://sscasn.bkn.go.id' },
  { label: 'BKN', href: 'https://www.bkn.go.id' },
  { label: 'KemenPANRB', href: 'https://www.menpan.go.id' },
]

/**
 * Alamat email untuk "Kirim saran ke pengembang" di footer.
 *
 * Diisi 2026-11-15 atas permintaan user: lolosin.app@gmail.com.
 * Selama nilainya null, tombol kirim saran TIDAK tampil di footer
 * sama sekali. Begitu alamatnya tersedia, isi konstanta ini saja,
 * tombol langsung muncul.
 */
export const FEEDBACK_EMAIL: string | null = 'lolosin.app@gmail.com'

/** Subjek default email saran dari footer. */
export const FEEDBACK_SUBJECT = 'Saran untuk Lolosin'
