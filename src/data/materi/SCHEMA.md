# Skema JSON Materi Belajar | Lolosin

Konten belajar terstruktur untuk halaman Belajar. Dibuat 2026-11-13 dari sumber di
`~/workspace/cpns/materi/` (modul OCR, PDF berteks, DOCX). Teks dibersihkan dan
distrukturkan secara programatis; **isi materi tidak ditulis ulang** (kecuali
penjelasan "Cara Memakai Tabel Pangkat" dan label struktur Kartu Sakti).
Script build: `build_materi.py` di folder ini (dapat dijalankan ulang).

## File

| File | Isi |
|---|---|
| `index.json` | Daftar semua dokumen + total + daftar yang dikecualikan dari MVP |
| `inventaris.json` | Salinan `~/workspace/cpns/materi/inventaris-materi.json` (referensi) |
| `<id-dokumen>.json` | Satu file per dokumen materi (17 file) |
| `build_materi.py` | Script pembangun (reproducible; baca `~/workspace/cpns/materi/`) |

## `index.json`

```json
{
  "dibuat": "2026-11-13",
  "total_dokumen": 17,
  "total_kata": 124163,
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
  "catatan": "Hasil OCR bagian ini kurang rapi ..."
}
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `id` | string | ya | `{id-dokumen}-s{NN}` (NN mulai 01, urut) |
| `subtopik` | string | ya | Salah satu dari `subtopik` dokumen (dipilih dari kecocokan judul) |
| `judul` | string | ya | Judul section (judul bab/subbab sumber; lanjutan memakai suffix `" (lanjutan 2)"`) |
| `konten` | string | ya | Teks markdown ringan (lihat bawah) |
| `kata` | integer | ya | Jumlah kata `konten` (dipisah spasi) |
| `catatan` | string | tidak | Peringatan kualitas (OCR kacau / butuh gambar). Tampilkan sebagai notice bila ada |
| `nomor` | integer | hanya `tkp-kartu-sakti` | Nomor urut kompetensi di tabel sumber (1–33) |

### Format `konten` (markdown ringan)

- Paragraf dipisah `\n\n`.
- Subjudul kecil di dalam section: `## Judul` (dipakai saat subbab kecil digabung ke section sebelumnya).
- Butir daftar: `- teks` (bullet) atau `1. teks` / `(i) teks` (bernomor, penanda asli dipertahankan).
- Soal contoh + opsi + `Jawaban:` / `Pembahasan:` dipertahankan apa adanya di dalam konten (modul TIU/TKP dan Bang Arya memang mengandung soal).
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
    {"id": "tiu-tabel-pangkat-s02", "judul": "Tabel Pangkat 2 (1–100)", "...": "..."},
    {"id": "tiu-tabel-pangkat-s05", "judul": "Latihan: Volume Bangun Ruang", "...": "..."}
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
- Handbook TIU Seri 3 (Figural) dan Lampiran soal bergambar sangat bergantung pada
  gambar; teks saja tidak cukup (lihat `catatan_kualitas` dan field `catatan`).
