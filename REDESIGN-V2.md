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

---

# Iterasi v2.1 — "Lapang + main" (2026-11-14)

Iterasi dari v2, BUKAN redesign total. Pemicu: user menilai v2 "udah
lumayan oke, tapi masih kurang menarik", kurang gaya Gen Z yang asik
dan kurang menonjolkan gamifikasi, desain masih terasa AI slop/template.
Jawaban v2.1: Lapang diberi kepribadian lewat elemen HUD gamified
(bar XP, lencana, streak) sebagai motif visual, gerakan halus, dan
maskot Lolo sebagai wajah brand. Tetap orisinal: tanpa script, tanpa
grid, tanpa sticker, tanpa meniru LolosPNS/Pejuang NIP.

## Prinsip tambahan

1. **Gamifikasi yang kelihatan, bukan diceritakan.** Landing
   menampilkan preview visual fitur unggulan (bar XP + gelar, baris
   lencana, kartu misi, streak, leaderboard, jadwal ulas, simulasi
   CAT), bukan sekadar daftar teks. Preview memakai data nyata app
   (fungsi level, daftar lencana, pool misi, jadwal ulas, konstanta
   simulasi) dengan progres contoh yang diberi label "Contoh tampilan".
2. **Lolo jadi bintang.** Maskot tampil besar di hero landing (220px,
   dengan balon ucapan dan chip melayang "+25 XP" / "Streak 12 hari"),
   di seksi "Kenalan, ini Lolo!" (180px, mood baru `kagum`), di CTA
   penutup, dan di hero dashboard (160px, dengan balon ucapan
   kontekstual streak). Namanya "Lolo" selalu terlihat di samping
   maskot. Karakter TIDAK digambar ulang: blob hijau + topi wisuda
   amber tetap, variasi hanya mood (`senang`, `semangat`, `sedih`,
   `kagum`) dan ukuran.
3. **Gerakan halus, compositor-only.** Semua animasi hanya memakai
   `transform` dan `opacity` (lihat token di bawah), opt-in lewat
   `prefers-reduced-motion: no-preference`, dan progressive
   enhancement: tanpa dukungan browser atau tanpa preferensi gerak,
   konten tampil statis dalam keadaan akhir, tidak pernah tersembunyi.

## Token baru (src/index.css)

- `.reveal`: reveal saat masuk viewport, scroll-driven
  (`animation-timeline: view()`, range `entry 0% entry 80%`),
  tanpa JS, di balik `@supports` + `prefers-reduced-motion`.
  Dipakai di kartu-kartu landing (bukan seksi setinggi layar, supaya
  animasi selalu selesai).
- `.float-soft`: goyang lembut maskot dan chip melayang
  (translateY -8px, 3.6s, infinite); variasi delay via inline style.
- `.card-lift`: kartu terangkat 4px + shadow membesar saat hover
  (umpan balik kecil, 200ms ease-out).
- `.badge-pop`: lencana membesar 8% saat hover, easing overshoot
  (back ease-out, cubic-bezier 0.34, 1.56, 0.64, 1).
- `.xp-fill`: isi bar XP diskala dari kiri (`transform: scaleX`,
  nilai akhir dari `--xp-fill` 0..1), terisi mengikuti scroll saat
  masuk viewport; tanpa dukungan, tampil langsung penuh.
- `.blob-soft`: radius blob organik untuk latar maskot (pengganti
  dekorasi geometris keras; bukan grid, bukan sticker).

## Landing v2.1 (src/pages/LandingPage.tsx)

Urutan seksi: hero 2 kolom (copy + panggung Lolo) → gamifikasi
(bento 7 kartu preview, label "Contoh tampilan") → "Kenalan, ini
Lolo!" → fitur (4 kartu, tanpa angka soal/materi) → cara pakai
(3 langkah; strip gamifikasi dihapus karena sudah punya seksi
sendiri) → Free vs Premium (tidak berubah) → CTA penutup (ditambah
Lolo semangat). Hero tetap tanpa angka total soal/materi; angka 110
soal hanya muncul di kartu preview simulasi CAT, bukan di hero.

## Dashboard v2.1 (src/pages/HomePage.tsx)

Hero jadi 2 kolom di desktop: konten lama (sapaan, pill XP/streak/
gelar, progres level, passing grade mini) tidak berubah isinya,
ditambah kolom Lolo (balon ucapan kontekstual streak + nama "Lolo").
Empty state "Fokus hari ini" dan "Tryout terakhir" kini menampilkan
keterangan nama "Lolo" di bawah maskot.

## Larangan v2 tetap berlaku

Font script/Caveat, tekstur grid, kartu sticker neo-brutalist
(border 2px ink + hard offset shadow), hard shadow, meniru
LolosPNS/Pejuang NIP, em-dash di `src/`. Catatan: border `border-2`
ber-gaya dashed dipakai SATU tempat (baris placeholder "Kamu?" di
preview leaderboard) sebagai affordance slot kosong, tanpa border ink
dan tanpa shadow, jadi bukan kartu sticker.

## Referensi yang dipakai

Skill: modern-web-guidance (`motion`, `scroll-entry-exit-effects`),
game-feel (tier feedback kecil, easing overshoot, hormati
reduce-motion), game-ui-ux (elemen HUD sebagai motif UI, kontras
teks informatif). Moodboard: designspells.com (micro-interactions:
angkat kartu 4px saat hover, angka dan bar yang beranimasi),
supahero.io (hero dua kolom dengan karakter), refero.design (sistem
warna/tipografi). Semua dipakai sebagai remix, bukan clone.
