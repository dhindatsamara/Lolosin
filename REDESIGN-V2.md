# Redesign v2 Lolosin — Bahasa "Lapang"

Dokumen ini adalah sumber kebenaran desain v2 (2026-11-14). Redesign v1
(neo-brutalist sticker) dihapus total karena terlalu meniru LolosPNS:
font tulisan tangan Caveat, tekstur grid/kotak-kotak, dan kartu sticker
(border 2px ink + hard offset shadow) tidak boleh muncul lagi di mana pun.

## Nama bahasa: Lapang

Lapang berarti lega dan terbuka. Tiga prinsip:

1. **Tipografi yang bicara.** Poppins tebal untuk judul, Plus Jakarta Sans
   untuk isi. Tanpa font script, tanpa dekorasi. Judul besar, hierarki
   jelas, satu aksen warna per momen.
2. **Ruang yang lega.** Konten desktop selebar max-w-7xl, whitespace besar
   antar seksi, grid multi-kolom. Mobile tetap satu kolom yang nyaman.
3. **Kartu yang lembut.** Permukaan putih, border netral 1px, soft shadow
   halus. Hijau dipakai sebagai aksen primer dan tombol utama; amber
   dipakai hemat sebagai highlight.

## Kenapa ini orisinal

Bahasa ini dirumuskan dari kebutuhan Lolosin sendiri, bukan dari
benchmark: palet hijau + paper hangat adalah identitas Lolosin sejak MVP
(sebelum benchmark dipelajari); tipografi besar tanpa dekorasi, kartu
lembut 1px, dan layout lapang adalah bahasa editorial umum, bukan ciri
khas situs mana pun. Tidak ada elemen yang diambil dari LolosPNS maupun
Pejuang NIP: tanpa script, tanpa tekstur grid, tanpa hard shadow, tanpa
kartu warna penuh per subtes (warna subtes hanya jadi aksen kecil).

## Token (src/index.css)

- Font: `--font-sans` Plus Jakarta Sans, `--font-display` Poppins.
  Tidak ada `--font-script`. Fontsource Caveat dihapus dari package.json.
- Warna (dipertahankan): paper `#FAF7F2`, ink `#1B1E1C`, primer hijau
  `#0E5C43` (skala primary-50..950), amber `#F59E0B` (skala
  accent-50..900), warna subtes TWK/TIU/TKP + versi soft-nya.
- Baru: `--color-line` `#E8E2D6` (border netral hangat),
  `--color-line-strong` `#D8D0BE`.
- Shadow: `--shadow-soft`, `--shadow-soft-lg` (blur lembut, tanpa offset
  keras). Shadow sticker (`--shadow-sticker*`) dihapus.
- Tipografi: `html` 16px, naik ke 17px pada layar `lg` (1024px+),
  sehingga seluruh skala rem membesar di desktop.
- Utility `.kicker`: label kecil kapital tebal hijau untuk pembuka seksi
  (pengganti eyebrow script).
- Dipertahankan karena orisinal Lolosin: `.hl-marker` (stabilo amber,
  dipakai hemat) dan confetti CSS-only.

## Komponen (src/components/ui/)

- `Card`: `rounded-2xl border border-line bg-white shadow-soft`.
- `Button`: `rounded-xl`, tanpa border tebal dan tanpa hard shadow.
  Primary hijau solid, outline border netral 1px, secondary amber solid,
  ghost transparan. Active: `scale-[0.98]`.
- `Badge`: pill lembut tanpa border (warna soft + teks berwarna).
- `ProgressBar`: track `bg-ink/10`, tanpa border.

## Layout (src/components/Layout.tsx)

- Kontainer `max-w-7xl`, padding `px-4 lg:px-8`.
- Header sticky: border bawah 1px, logo hijau solid (tanpa sticker),
  navigasi atas di desktop (`lg`), pill XP/streak lembut, tombol akun.
- Bottom nav hanya mobile (`lg:hidden`), item aktif hijau lembut.
- Footer kecil di desktop.

## Halaman

- `/` kondisional: Supabase terkonfigurasi + belum login = landing page
  (`LandingPage`); login atau Supabase belum terkonfigurasi = dashboard.
  Mode lokal (tanpa Supabase) tetap menampilkan dashboard seperti dulu.
- Landing: hero marketing hijau solid (tanpa tekstur) + CTA Masuk dan
  Daftar Gratis, seksi fitur tanpa angka soal/materi, seksi cara kerja,
  seksi akun Free vs Premium (premium "segera hadir", tanpa harga dan
  tanpa paywall; juara mingguan 1-3 dapat premium disebut singkat),
  CTA penutup.
- Dashboard: konten yang sama seperti sebelumnya, di-restyling: hero
  tipografi besar tanpa panel grid, tanpa strip angka soal/materi,
  grid 2 kolom di desktop untuk seksi berpasangan, kartu materi putih
  dengan aksen warna (bukan kartu warna penuh).

## Yang dilarang di v2

- `font-script`, Caveat, font tulisan tangan apa pun.
- `.bg-grid-dark`, `.bg-dot-paper`, tekstur grid/kotak apa pun.
- `shadow-sticker*`, hard offset shadow, `border-2 border-ink`.
- Kartu warna penuh per subtes (TWK/TIU/TKP sebagai background).
- Angka total soal/materi di hero beranda (landing maupun dashboard).

## Yang dipertahankan

- Palet hijau + paper + amber; semua fitur; semua route; key
  localStorage `lolosin:v1`; logika Supabase (supabase.ts, auth.ts,
  leaderboard.ts) kecuali penambahan hook `useAuthUser`; copy santai;
  NOL em-dash di seluruh `src/`; maskot Lolo; perayaan dan confetti;
  efek stabilo amber.
