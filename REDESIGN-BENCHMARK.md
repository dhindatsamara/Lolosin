# Benchmark UI — Pejuang NIP & LolosPNS (2026-11-13)

Studi visual 2 web benchmark pilihan user untuk redesign Lolosin.
Bukti: PDF full-page di
`workspace/.hatch-browser/outputs/browser-task:e2696647-dc3d-5fe8-be6a-aae5f7586049/`
(f1 = Pejuang NIP homepage, f2 = Pejuang NIP detail Nasionalisme,
f3 = LolosPNS homepage, f4 = LolosPNS index Materi).
Warna di bawah disampling dari piksel render (±beberapa unit dari token asli).

## Bahasa visual bersama (keduanya)

Neo-brutalist "sticker": kartu putih dengan **border 2px solid gelap +
hard offset shadow (4-5px, tanpa blur)**, radius besar (16-24px),
tombol pill dengan border + hard shadow yang sama, tipografi extra-bold
dengan leading rapat. Tanpa gradient ungu-biru, tanpa soft blur shadow,
tanpa foto stok generik — itulah yang membuat keduanya terasa crafted,
bukan AI slop.

## 1. Pejuang NIP — yudhapratama14.github.io/CPNS/ (dashboard belajar)

- BG #F1F3F8 (abu-biru pucat), ink #14161C, kartu putih.
- Triad pastel SEMANTIK per subtes: teal #35A7A9 (TWK), oranye hangat
  #F8B461 (TIU), lavender #A58BD6 (TKP); krem #FFEBC7 untuk banner.
- Font: grotesque geometris rounded (mirip Plus Jakarta Sans);
  heading extra-bold ~48px, body 15-16px abu-biru, micro-label all-caps.
- Hero adalah dashboard kerja, bukan banner: sapaan + search pill +
  3 kartu subtes besar + target skor + peta belajar, semua usable.
- Detail mikro: separator dashed, lingkaran bernomor, analogi sehari-hari,
  kartu komik "Latih Otak", copy manusiawi ("Ambil kopi, atur napas...").
- Kelemahan: Arena Tryout masih placeholder kosong.

## 2. LolosPNS — lolospns.natakarsa.com (landing editorial)

- Hero navy gelap #14103D + oranye koral #FF7D52 di atas BG lavender
  sangat pucat #F7F5FF. Satu kontras kuat, sisanya restraint.
- Font: grotesque extra-bold agresif (~56px hero, all-caps di sana-sini)
  + SATU aksen script handwritten (mirip Caveat) hanya untuk eyebrow —
  langkah tipografi paling khas situs ini.
- Panel hero navy dengan tekstur grid halus + highlight oranye di belakang
  kata kunci headline; ticker oranye sebagai motif pemisah section;
  kartu "Simulasi Ujian" sebagai preview produk di hero.
- Kartu putih border 2px navy + hard offset shadow navy; kartu pricing
  "Juara" invert ke navy dengan shadow oranye.
- Konten padat sebagai fitur: passing grade, breakdown 110 soal, tabel
  perbandingan, contoh soal + pembahasan — semua di landing page.
- Kelemahan: scroll-reveal bikin heading abu-abu sesaat (kontras rendah).

## Takeaway untuk redesign Lolosin

- Satu warna semantik per subtes, dipakai di mana-mana (kartu, pill, progres).
- Hard offset shadow, bukan soft blur. Border 2px ink di kartu & tombol.
- Panel hero gelap bertekstur grid halus + angka spesifik di layar pertama
  (110 soal, passing grade, progres %) — bukan klaim generik.
- Aksen script hanya untuk eyebrow/anotasi.
- Hero adalah alat (search, progres, target), bukan poster.
- Jangan tiru kelemahannya: placeholder kosong & teks low-contrast.

## Arah Lolosin (diputuskan 2026-11-13, jangan jiplak mentah-mentah)

- Identitas hijau dipertahankan: deep green #0E5C43 + paper hangat
  #FAF7F2 + ink #1B1E1C + amber #F59E0B; panel hero hijau tua bertekstur
  grid (ala LolosPNS tapi hijau, bukan navy).
- Triad semantik TWK/TIU/TKP dipertahankan (terracotta/biru/plum),
  dipakai jauh lebih berani (kartu subtes berwarna ala Pejuang NIP).
- Font: Poppins (display/heading) + Plus Jakarta Sans (body/UI) +
  Caveat (aksen script, eyebrow saja) — ketiganya SELF-HOSTED via
  Fontsource (tanpa Google Fonts CDN, agar offline PWA & screenshot
  selalu memakai font asli).
