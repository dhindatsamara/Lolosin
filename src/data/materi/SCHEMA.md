# Skema JSON Materi Belajar | Lolosin

Konten belajar terstruktur untuk halaman Belajar. Dibuat 2026-11-13 dari sumber di
`~/workspace/cpns/materi/` (modul OCR, PDF berteks, DOCX). Teks dibersihkan dan
distrukturkan secara programatis; **isi materi tidak ditulis ulang** (kecuali
penjelasan "Cara Memakai Tabel Pangkat", label struktur Kartu Sakti, dan
6 bagian Rangkuman Tabel TWK yang dikurasi tulis-ulang pada v2.3.3, lihat
`BANG_ARYA_REWRITE` di build_materi.py).
Script build: `build_materi.py` di folder ini (dapat dijalankan ulang).
Audit isi 2026-11-15: soal latihan, pengantar, dan duplikat dikeluarkan dari
Belajar (lihat "Kebijakan isi" di bawah); 17 dokumen, 269 section, 68.287 kata.
Materi baru 2026-11-15 (v2.3.1): 15 file riset free-access dari
`~/workspace/cpns/materi/baru/` menutup gap audit (12 aspek TKP tipis, TWK
Integritas + Pilar Negara, analogi tiga kata TIU) -> 19 dokumen, 284 section,
79.612 kata. Dua dokumen baru (`tkp-karakter-perilaku`, `twk-integritas-pilar`)
+ 1 section baru (`tiu-analogi-verbal-s04`). Header sumber file `.md` TIDAK
masuk JSON (tanpa atribusi "by siapa" di app); sumber tercatat di file `.md`
internal. Dokumen baru punya `halaman: 0` (riset web, tanpa halaman sumber).
Tulis-ulang kurasi 2026-11-15 (v2.3.3): 6 bagian Rangkuman Tabel TWK
(`twk-bang-arya`) ditulis ulang terstruktur karena ekstraksi mind-map/tabel
aslinya huruf kapital semua dan tidak berurutan -> 19 dokumen, 284 section,
79.843 kata. ID bagian tidak berubah (progres baca aman); `catatan` mind-map
dihapus; verifikasi `verify_bang_arya_rewrite()` di build_materi.py.
Keterbacaan 2026-11-15 (v2.5): audit menemukan 43 bagian berupa tembok teks
(baris >600 karakter, terpanjang ~5.000, terkonsentrasi di 3 Handbook TIU);
SEMUA 284 bagian diaudit, yang kurang jelas ditulis ulang terkurasi lewat map
`READABILITY_REWRITE` + `verify_readability_rewrite()` (pola yang sama seperti
Bang Arya); setiap bagian mendapat field baru `poin_inti` (3-5 butir ringkasan,
map `POIN_INTI`, diverifikasi `verify_poin_inti()` yang menggagalkan build
bila ada bagian tanpa poin inti). ID bagian tidak berubah. Halaman baca
(`SectionDetailPage`) diubah jadi mode layar penuh: isi memakai lebar viewport
penuh, kartu Poin Inti di atas isi (HP) / kolom samping sticky (desktop).
Cheat sheet TIU + penebalan TWK tipis 2026-11-15 (v2.6): dokumen baru
`tiu-cheat-sheet` (6 seksi rumus cepat + trik, mengikuti pola cheat sheet
TWK/TKP), `twk-keyword-bela-negara` ditambah 3 seksi (dasar hukum dan
pengertian, bentuk partisipasi, jenis ancaman), `twk-integritas-pilar`
ditambah 2 seksi (pembeda gratifikasi/suap/pemerasan, LHKPN dan jalur
pelaporan) -> 20 dokumen, 295 section, 82.477 kata. ID bagian lama tidak
berubah; seksi baru masuk lewat `baru/*.md` + `BARU_TIU_CHEAT` /
`BARU_BELA_NEGARA` / `BARU_TWK` di build_materi.py.

## File

| File | Isi |
|---|---|
| `index.json` | Daftar semua dokumen + total + daftar yang dikecualikan dari MVP |
| `inventaris.json` | Salinan `~/workspace/cpns/materi/inventaris-materi.json` (referensi) |
| `<id-dokumen>.json` | Satu file per dokumen materi (20 file) |
| `build_materi.py` | Script pembangun (reproducible; baca `~/workspace/cpns/materi/`). PIN pypdf==7.0.1, lihat docstring script |

## `index.json`

```json
{
  "dibuat": "2026-11-15",
  "total_dokumen": 20,
  "total_kata": 82477,
  "total_halaman": 591,
  "dokumen": [
    {
      "id": "twk-modul-ringkasan",
      "file": "twk-modul-ringkasan.json",
      "judul": "Ringkasan Materi TWK CPNS (Modul TWK)",
      "materi": "TWK",
      "deskripsi": "Ringkasan materi TWK lengkap: ...",
      "halaman": 93,
      "kata": 19532,
      "subtopik": ["Pancasila", "UUD 1945", "..."],
      "jumlahSections": 61
    }
  ],
  "dikecualikan_dari_mvp": [
    {"judul": "Materi Pokok SKB ...", "materi": "SKB",
     "alasan": "SKB ditunda ke fase akhir pengembangan aplikasi."}
  ]
}
```

- `kata` = jumlah kata dihitung dari `konten` semua section (bukan dari klaim inventaris).
- `halaman` = jumlah halaman dokumen sumber (termasuk sampul/daftar isi).
  Dokumen dari riset web (`tkp-karakter-perilaku`, `twk-integritas-pilar`)
  punya `halaman: 0` karena tidak ada halaman sumber.
- `total_kata` / `total_halaman` = jumlah dari semua dokumen di `dokumen`.

## Dokumen (`<id>.json`)

```json
{
  "id": "twk-modul-ringkasan",
  "judul": "Ringkasan Materi TWK CPNS (Modul TWK)",
  "materi": "TWK",
  "deskripsi": "Ringkasan materi TWK lengkap: Pancasila, ...",
  "sumber": "ocr/Mod-TWK-Ringkasan.txt",
  "halaman": 93,
  "kata": 19532,
  "subtopik": ["Pancasila", "UUD 1945", "Bhinneka Tunggal Ika"],
  "sections": [ ... ],
  "catatan_kualitas": "Hasil OCR modul scan; tata letak dua kolom ..."
}
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | string | ya | Slug unik, sama dengan nama file tanpa `.json` |
| `judul` | string | ya | Judul dokumen |
| `materi` | string | ya | `"TWK"` \| `"TIU"` \| `"TKP"` |
| `deskripsi` | string | ya | 1–2 kalimat |
| `sumber` | string | ya | Path file asal, relatif terhadap `~/workspace/cpns/materi/` |
| `halaman` | integer | ya | Jumlah halaman sumber |
| `kata` | integer | ya | Jumlah kata = jumlah `kata` semua section |
| `subtopik` | string[] | ya | Daftar subtopik dokumen (dari inventaris) |
| `sections` | section[] | ya | Isi, terurut sesuai urutan sumber |
| `catatan_kualitas` | string | tidak | Catatan kualitas sumber (OCR, gambar, dll.) |
| `tabel` | object | hanya `tiu-tabel-pangkat` | Lihat bawah |

## Section

```json
{
  "id": "twk-modul-ringkasan-s03",
  "subtopik": "Pancasila",
  "judul": "C. Sejarah Perumusan Pancasila",
  "konten": "Berikut adalah tokoh-tokoh ...\n\n1. Muh. Yamin ...\n\n(i) Peri kebangsaan.",
  "kata": 190,
  "poin_inti": ["Perumusan Pancasila ...", "Tokoh kunci ...", "Tanggal penting ..."],
  "catatan": "Hasil OCR bagian ini kurang rapi ..."
}
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | string | ya | `{id-dokumen}-s{NN}` (NN mulai 01, urut; nomor bisa berlubang karena filter isi menghapus section tanpa menomori ulang, supaya progres baca lama tetap cocok) |
| `subtopik` | string | ya | Salah satu dari `subtopik` dokumen (dipilih dari kecocokan judul) |
| `judul` | string | ya | Judul section (judul bab/subbab sumber; lanjutan memakai suffix `" (lanjutan 2)"`) |
| `konten` | string | ya | Teks markdown ringan (lihat bawah) |
| `kata` | integer | ya | Jumlah kata `konten` (dipisah spasi) |
| `poin_inti` | string[] | ya (v2.5) | 3–5 butir ringkasan inti, tiap butir satu kalimat pendek (≤200 karakter), teks polos tanpa markdown/em-dash/URL/atribusi. Ditampilkan sebagai kartu callout di halaman baca. Wajib ada di semua bagian; `verify_poin_inti()` menggagalkan build bila ada yang hilang |
| `gambar` | string | tidak | Diagram ilustrasi section (v2.5): kunci built-in `gambar:<nama>` (dipetakan ke SVG di `src/assets/` lewat `lib/materiGambar.ts`, aman di bawah base path apa pun) atau URL http(s). Ditampilkan sebagai figure di atas isi. Divalidasi `verify_gambar()` |
| `catatan` | string | tidak | Peringatan kualitas (OCR kacau / butuh gambar). Tampilkan sebagai notice bila ada |
| `nomor` | integer | hanya `tkp-kartu-sakti` | Nomor urut kompetensi di tabel sumber (1–33) |

### Format `konten` (markdown ringan)

- Paragraf dipisah `\n\n`.
- Subjudul kecil di dalam section: `## Judul` (dipakai saat subbab kecil digabung ke section sebelumnya).
- Butir daftar: `- teks` (bullet) atau `1. teks` / `(i) teks` (bernomor, penanda asli dipertahankan).
- Tabel markdown: `| a | b |` + baris pemisah `|---|---|` (perataan `:---:`/`:---`), dirender sebagai tabel ber-style (v2.5).
- Gambar inline: `![alt](src)` — baris sendiri jadi figure + figcaption, di dalam teks jadi inline. `src` bisa kunci built-in `gambar:<nama>` atau URL (v2.5).
- Matematika inline (v2.5): pecahan numerik `a/b` dirender bertumpuk, pangkat `x^2` jadi superscript. Tanggal, sitasi peraturan, dan bilangan berformat ribuan sengaja tidak diubah (lihat `lib/mathText.ts`).
- **Kebijakan isi (audit 2026-11-15):** Belajar hanya berisi materi belajar murni
  (penjelasan, rangkuman, rumus, tabel, contoh pengerjaan). Soal latihan/tryout
  (stem + opsi A-E + kunci/pembahasan), pengantar/cover/daftar isi, dan section
  duplikat TIDAK masuk. Contoh pengerjaan TANPA opsi (mis. contoh hitung
  bertahap, contoh silogisme, contoh gambar figural dengan "Jawaban: ↑")
  dipertahankan karena itu materi ajar, bukan soal untuk dikerjakan.
  Pengecualian diimplementasikan di `build_materi.py` (`filter_doc_sections` +
  `strip_question_zones`, berjalan setelah ID section ditetapkan) sehingga
  perbaikan tahan rebuild. Laporan: `~/workspace/cpns/materi/AUDIT-ISI-2026-11-15.md`.
- Materi baru dari `baru/*.md` (v2.3.1, `parse_baru_markdown` di
  `build_materi.py`): header sumber (blockquote / bagian `## Sumber` + paragraf
  Catatan), garis `---`, dan kalimat atribusi di dalam konten dibuang; tabel
  markdown dikonversi ke bullet (renderer tidak mendukung tabel); quote isi
  dibuka jadi paragraf biasa; em-dash dibersihkan. `verify_baru_content`
  menggagalkan build bila konten baru mengandung URL, nama situs sumber,
  em-dash, atau frasa soal ("kunci jawaban", "latihan soal").
- Section dibatasi ±1500 kata (dipecah di batas paragraf; lanjutan memakai suffix judul).
- Karakter khusus matematika dipertahankan apa adanya (`√`, `×`, `²`, `→`, dll.).

## Tabel pangkat (`tiu-tabel-pangkat.json`)

Semua angka **dihitung ulang secara programatis** (`n**2`, `n**3`, `n**4` untuk
`n = 1..100`) karena digit OCR tabel terbukti salah baca. Telah diverifikasi
dengan recompute penuh (300/300 nilai benar).

```json
{
  "id": "tiu-tabel-pangkat",
  "tabel": {
    "pangkat2": [[1, 1], [2, 4], [3, 9], "...", [100, 10000]],
    "pangkat3": [[1, 1], [2, 8], "...", [100, 1000000]],
    "pangkat4": [[1, 1], [2, 16], "...", [100, 100000000]]
  },
  "sections": [
    {"id": "tiu-tabel-pangkat-s01", "judul": "Cara Memakai Tabel Pangkat", "...": "..."},
    {"id": "tiu-tabel-pangkat-s02", "judul": "Tabel Pangkat 2 (1–100)", "...": "..."}
  ]
}
```

- Tiap entri `[n, hasil]`, `n` berurutan 1–100.
- `kata` dokumen ini hanya menghitung kata di `sections` (angka tabel tidak dihitung).
- Section `s02`–`s04` berisi contoh 1–10; data lengkap hanya ada di field `tabel`.

## Kartu Sakti TKP (`tkp-kartu-sakti.json`)

Satu section per kompetensi (33 kompetensi). `konten` terstruktur:

```
Kelompok: Kemampuan Berfikir (KB)

Definisi: Kemampuan menggunakan berbagai sudut pandang ...

- Level 0: Mengetahui adanya perbedaan sudut pandang.
- Level 1: Mengenali sudut pandang orang lain yang berbeda.
...
- Level 6: Mendayagunakan berbagai sudut pandang ...

Kata kunci: Mampu menggunakan berbagai sudut pandang.
```

UI boleh mem-parse baris `- Level N:` untuk tampilan khusus.

## Catatan konsumsi

- Semua JSON valid UTF-8, `ensure_ascii=False` (karakter Indonesia/matematika apa adanya).
- `materi` hanya berisi `TWK`/`TIU`/`TKP` di MVP. SKB, Referensi (KepmenPANRB 406/2026),
  dan Panduan (JadiASN, BKN) **dikecualikan**, daftarnya ada di
  `index.json` → `dikecualikan_dari_mvp`.
- Halaman iklan tryout premium di kedua cheat sheet Analitica (hal. 9) dan
  halaman sampul/daftar isi/promo/disclaimer di ketiga Handbook TIU **tidak**
  dimasukkan (bukan materi belajar).
- Beberapa judul section terpotong / mengandung artefak OCR (mis. `M. Lufti Ade`,
  `C. Tetap mempertahankan sis`) karena judul sumber terpotong di pergantian kolom
  saat OCR, isi section tetap utuh. Jangan "memperbaiki" judul dengan menebak.
- Handbook TIU Seri 3 (Figural) sangat bergantung pada gambar; teks saja tidak
  cukup (lihat `catatan_kualitas` dan field `catatan`). Lampiran soal bergambar
  + kunci jawabannya dikeluarkan dari Belajar pada audit 2026-11-15.
