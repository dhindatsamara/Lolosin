/**
 * Nama maskot Lolosin: SATU-SATUNYA sumber nama maskot di app.
 *
 * Nama lama "Lolo" diganti di v2.2 karena terdengar negatif di bahasa
 * daerah user. Nama final masih dipilih user (kandidat: Losi, Nusa,
 * Bima, Sina); placeholder untuk sekarang adalah "Losi".
 *
 * ATURAN: jangan pernah hardcode nama maskot di komponen lain, selalu
 * import MASCOT_NAME dari sini. Kalau nama final diputuskan, cukup
 * ubah satu baris ini. Verifikasi dengan: grep -rn '"Losi"' src
 * tidak boleh ada di luar file ini (dan tidak ada "Lolo" tersisa
 * sebagai nama maskot; "Lolosin" dan lencana "Lolos Mini"/"Lolos
 * Simulasi" bukan nama maskot dan tetap dipakai).
 */
export const MASCOT_NAME = 'Losi'
