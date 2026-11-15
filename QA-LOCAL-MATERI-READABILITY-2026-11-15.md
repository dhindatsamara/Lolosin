# QA Lokal — Keterbacaan Materi Belajar (v2.5 readability) — 2026-11-15

**Branch:** `materi-readability` (worktree `/tmp/lolosin-materi`, basis `f7f157f` = v2.3.4).
**Target:** http://127.0.0.1:4211/Lolosin/ (build placeholder) + http://127.0.0.1:4212/Lolosin/ (build fake Supabase, network diblokir).
**Metode:** Playwright + Chromium headless di VM. Full QA: `~/workspace/qa-lolosin/qa-materi2.mjs` (salinan `qa-v234.mjs` + penyesuaian §13 + perbaikan lookup stem duplikat), `QA_APP_DIR=/tmp/lolosin-materi`. Render check: `~/workspace/qa-lolosin/render-materi.mjs`. Log: `~/workspace/qa-lolosin/qa-run-materi-readability.log`. Screenshot: `~/workspace/qa-lolosin/screenshots-materi-readability/`.

## Verdict: SIAP

- **Full QA: 372/372 PASS, 0 FAIL** (console error 0, page error 0, request gagal 0, warning 0).
- **Render check materi: 110/110 PASS** (10 section ditulis ulang desktop + 2 mobile + 2 pembahasan drill).
- **Uji negatif verify pipeline: lulus** (em-dash, baris tembok 700 karakter, dan poin_inti hilang masing-masing menggagalkan build).
- **Rebuild pipeline: bersih**, semua verify OK (materi baru, Bang Arya, readability 248 seksi, poin-inti 284 seksi).

> Catatan run 1: full QA pertama memakai `qa.mjs` terbaru (yang memuat cek dashboard v2.4) dan crash di §12 karena worktree ini berbasis v2.3.4 — 5 cek v2.4 gagal + 1 crash `nav[Pintasan]` tidak ada, semuanya ekspektasian (bukan regresi). Run 2 memakai salinan `qa-v234.mjs` yang sesuai dengan basis branch ini dan lulus penuh. Saat branch ini di-merge ke tree v2.4, jalankan lagi full QA dengan `qa.mjs` terbaru.

## Ringkasan perubahan

### Fase 1 — Materi Belajar (284 seksi, 19 dokumen)

- **248 seksi ditulis ulang** (dari 43 tembok awal + audit penuh yang menemukan artefak OCR berat di hampir semua dokumen modul/handbook). Total kata 79.843 menjadi **77.575** (-2.268, mayoritas sampah OCR dan pasangan sinonim duplikat yang dibuang).
- **36 judul diperbaiki** (judul salah/terpotong artefak OCR, diturunkan dari isi sectionnya sendiri, mis. `M. Lufti Ade` menjadi `M. Tanda Baca, Kata, dan Tata Kalimat`; `Analogi` menjadi `Daftar Sinonim (B-Z)`).
- **284/284 seksi punya `poin_inti`** (3-5 butir, diverifikasi pipeline: build gagal bila ada yang kurang).
- **ID seksi tidak berubah** (284/284 sama); seksi yang tidak ditulis ulang hanya bertambah field `poin_inti`, kontennya byte-identical.
- **0 em-dash, 0 URL, 0 atribusi** di konten baru; baris terpanjang di semua konten kini 587 karakter (sebelumnya ~5.000).
- Fakta dan rumus yang salah di sumber **dibetulkan dengan hitung ulang** (puluhan koreksi, mis. 60.000÷5=12.000×8=96.000; sudut jam 10.08 = 104°; luas kubus s=7 = 294 cm²; Yamin "Peri keadilan" menjadi "Peri kemanusiaan" agar konsisten antar-dokumen; Sumpah Pemuda Kongres Pemuda II 1928; UU 5/2014 menjadi UU 20/2023; PETA Blitar 14 Februari 1945; Pemilu 1955 29 September 1955). Fakta yang tidak terverifikasi **dihilangkan, bukan dikarang**.

### Mode baca layar penuh + Poin inti (UI)

- `SectionDetailPage` dirombak: lebar viewport penuh (artikel ~850px di desktop, bukan lagi kolom sempit), tipografi lebih lega (`text-[17px] leading-8`, `space-y-5`), subjudul h2 bergaris pembatas, dan kartu **Poin inti** (callout kuning, ikon Sparkles) sebagai sidebar sticky di desktop / di atas konten di mobile.
- `MarkdownLite`: dukung **sub-daftar bertingkat** (70 baris bersarang di 13 seksi kini dirender sebagai sub-daftar, sebelumnya rata).
- Rute, logika progres baca, tombol "Tandai selesai dibaca", dan navigasi prev/next tidak berubah.

### Fase 2 — Pembahasan soal (bank 8.987 menjadi 8.972 soal)

- **74 pembahasan diperbaiki**: 35 materi-mod ditulis ulang terstruktur per-opsi + bobot jadi map per-opsi (pola materi-332/333/334); 11 komunitasbelajar ditulis ulang dengan jawaban terverifikasi; **28 komunitasbelajar dikosongkan (null)** karena pembahasannya milik soal lain dan tidak bisa diverifikasi.
- **347 bobot komunitasbelajar TKP** dikonversi dari skalar 5 menjadi map per-opsi (dari penanda "Skor N:" di pembahasan; di semua 347, opsi skor-5 sama dengan kunci tercatat).
- **15 duplikat sejati dihapus** (stem DAN opsi identik; pasangan kunci bertentangan diputuskan dari pembahasan/bobot: komunitas-553 dihapus, 1137 dipertahankan kunci E; komunitas-557 dihapus, 385 dipertahankan kunci B). Pasangan stem-sama-opsi-beda (mis. jadiasn02-1/02-2, kidocp-823/867) **tidak** dihapus karena soal yang sah dan berbeda.
- Perbaikan diterapkan di chunk app DAN `bank-soal.json` kanonis (backup: `~/workspace/cpns/bank-soal/bank-soal-pre-readability-2026-11-15.json`).
- **Tidak ada kunci jawaban yang diubah.** 17 temuan kunci bermasalah dicatat di bawah untuk putusan user.

## Ringkasan per dokumen

| Dokumen | Rewrite | Judul | Kata sebelum | Kata sesudah |
|---|---:|---:|---:|---:|
| tiu-analogi-verbal | 3/4 | 0 | 1.670 | 1.660 |
| tiu-handbook-figural | 12/13 | 0 | 3.827 | 3.207 |
| tiu-handbook-numerik | 10/11 | 0 | 3.898 | 3.462 |
| tiu-handbook-verbal | 11/11 | 0 | 3.710 | 4.030 |
| tiu-hitung-cepat | 8/8 | 3 | 1.867 | 2.136 |
| tiu-modul | 58/58 | 8 | 16.360 | 15.479 |
| tiu-tabel-pangkat | 0/4 | 0 | 224 | 224 |
| tkp-cheat-sheet | 6/6 | 0 | 2.064 | 2.075 |
| tkp-karakter-perilaku | 2/12 | 0 | 8.408 | 8.388 |
| tkp-kartu-sakti | 26/33 | 0 | 3.952 | 3.921 |
| tkp-modul | 18/18 | 1 | 3.174 | 3.017 |
| tkp-rangkuman-temenasn | 10/11 | 0 | 1.954 | 1.850 |
| twk-bang-arya | 0/6 | 0 | 1.048 | 1.048 |
| twk-cheat-sheet | 6/6 | 0 | 1.403 | 1.349 |
| twk-integritas-pilar | 0/2 | 0 | 1.808 | 1.808 |
| twk-keyword-bela-negara | 1/1 | 1 | 267 | 251 |
| twk-modul-ringkasan | 59/61 | 22 | 19.498 | 19.009 |
| twk-rangkuman-temenasn | 17/18 | 1 | 3.503 | 3.572 |
| twk-rangkuman-tryout | 1/1 | 0 | 1.208 | 1.089 |
| **Total** | **248/284** | **36** | **79.843** | **77.575** |

Seksi yang sengaja tidak ditulis ulang bodinya (sudah cukup/tidak ada isi bermakna untuk ditambah, tapi tetap dapat poin_inti): tiu-tabel-pangkat s01-s04 (tabel), twk-bang-arya s01-s06 (kurasi v2.3.3), twk-integritas-pilar s01-s02, tkp-karakter-perilaku s01-s08/s10/s12, tkp-kartu-sakti s07-s10/s12/s13/s18, tkp-rangkuman-temenasn s06, twk-modul-ringkasan s31/s60, twk-rangkuman-temenasn s11, tiu-analogi-verbal s04, tiu-handbook-figural s09/s14, tiu-handbook-numerik s09/s13.

## Seksi yang ditulis ulang (sebelum/sesudah jumlah kata)

### tiu-analogi-verbal (3 dari 4 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| tiu-analogi-verbal-s01 | A. Definisi Analogi Verbal | 91 | 114 |
| tiu-analogi-verbal-s02 | B. Bentuk-bentuk Soal Analogi Verbal | 191 | 176 |
| tiu-analogi-verbal-s03 | C. Pola Hubungan yg Paling Sering Muncul di Tes CPNS | 279 | 261 |

### tiu-handbook-figural (12 dari 13 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| tiu-handbook-figural-s02 | Bagian I: Dasar Kemampuan Figural | 951 | 773 |
| tiu-handbook-figural-s03 | Bagian II: Analogi Gambar | 613 | 457 |
| tiu-handbook-figural-s04 | Bagian III: Ketidaksamaan | 414 | 354 |
| tiu-handbook-figural-s05 | Bagian IV: Serial Gambar | 669 | 506 |
| tiu-handbook-figural-s06 | Bagian V: Strategi Mengerjakan Figural | 304 | 259 |
| tiu-handbook-figural-s07 | Bagian VI: Jebakan yang Wajib Dikenali | 168 | 126 |
| tiu-handbook-figural-s08 | Bagian VII: Formula Pemeriksaan Cepat | 62 | 80 |
| tiu-handbook-figural-s10 | Bagian IX: Level Penguasaan Figural | 92 | 98 |
| tiu-handbook-figural-s11 | Bagian X: Diagnosis Kesalahan | 102 | 100 |
| tiu-handbook-figural-s12 | Bagian XI: Peta Penguasaan | 54 | 64 |
| tiu-handbook-figural-s13 | Bagian XII: Cheat Sheet Figural | 86 | 95 |
| tiu-handbook-figural-s15 | Penutup: Rangkuman Satu Halaman | 261 | 244 |

### tiu-handbook-numerik (10 dari 11 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| tiu-handbook-numerik-s02 | Bagian I: Peta Besar TIU Numerik | 225 | 173 |
| tiu-handbook-numerik-s03 | Bagian II: Berhitung | 850 | 765 |
| tiu-handbook-numerik-s04 | Bagian III: Deret Angka | 477 | 392 |
| tiu-handbook-numerik-s05 | Bagian IV: Perbandingan Kuantitatif | 493 | 398 |
| tiu-handbook-numerik-s06 | Bagian V: Soal Cerita | 1000 | 839 |
| tiu-handbook-numerik-s07 | Bagian VI: Hitung Cepat | 301 | 293 |
| tiu-handbook-numerik-s08 | Bagian VII: Jebakan TIU Numerik | 200 | 196 |
| tiu-handbook-numerik-s10 | Bagian IX: Cheat Sheet | 148 | 181 |
| tiu-handbook-numerik-s11 | Bagian X: Materi Pengayaan | 80 | 78 |
| tiu-handbook-numerik-s12 | Bagian XI: Prioritas Belajar | 74 | 97 |

### tiu-handbook-verbal (11 dari 11 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| tiu-handbook-verbal-s02 | Bagian I: Peta Besar TIU Verbal | 293 | 224 |
| tiu-handbook-verbal-s03 | Bagian II: Analogi | 468 | 895 |
| tiu-handbook-verbal-s04 | Bagian III: Silogisme | 1001 | 861 |
| tiu-handbook-verbal-s05 | Bagian IV: Penalaran Analitis | 1112 | 1067 |
| tiu-handbook-verbal-s06 | Bagian V: Teknik Eliminasi | 107 | 117 |
| tiu-handbook-verbal-s07 | Bagian VI: Error Pattern yang Harus Dihindari | 182 | 165 |
| tiu-handbook-verbal-s08 | Bagian VII: Sistem Cepat Verbal | 33 | 150 |
| tiu-handbook-verbal-s10 | Bagian IX: Checklist Sebelum Memilih Jawaban | 106 | 139 |
| tiu-handbook-verbal-s11 | Bagian X: Cheat Sheet TIU Verbal | 158 | 179 |
| tiu-handbook-verbal-s12 | Bagian XI: Pola Penguasaan Materi | 68 | 75 |
| tiu-handbook-verbal-s13 | Penutup: Ringkasan Akhir | 182 | 158 |

### tiu-hitung-cepat (8 dari 8 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| tiu-hitung-cepat-s02 | A. Jenis-Jenis Bilangan | 116 | 164 |
| tiu-hitung-cepat-s03 | 2. Asosiatif (Pengelompokan) | 420 | 422 |
| tiu-hitung-cepat-s04 | B. Operasi Hitung | 313 | 312 |
| tiu-hitung-cepat-s05 | C. Pecahan Istimewa | 439 | 375 |
| tiu-hitung-cepat-s06 | Contoh: Mengubah dan Mengurutkan Pecahan | 81 | 79 |
| tiu-hitung-cepat-s07 | D. Pangkat dan Akar Pangkat | 361 | 517 |
| tiu-hitung-cepat-s08 | E. Konversi Satuan | 55 | 132 |
| tiu-hitung-cepat-s09 | F. Tangga Satuan | 82 | 135 |

### tiu-modul (58 dari 58 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| tiu-modul-s01 | Ringkasan Materi | 266 | 255 |
| tiu-modul-s02 | Ringkas 1: Sinonim/Persamaan Kata | 426 | 231 |
| tiu-modul-s03 | A. Pelarangan | 36 | 91 |
| tiu-modul-s04 | Daftar Sinonim (A) | 86 | 260 |
| tiu-modul-s05 | Daftar Sinonim (B-Z) | 1412 | 1383 |
| tiu-modul-s06 | Ringkas 2 | 276 | 259 |
| tiu-modul-s07 | Trik Antonim dan Daftar Antonim (A) | 167 | 226 |
| tiu-modul-s08 | Antonim | 64 | 105 |
| tiu-modul-s09 | Daftar Antonim (C-W) | 592 | 826 |
| tiu-modul-s10 | Ringkas 3: Analogi/Korelasi Makna | 686 | 310 |
| tiu-modul-s12 | Ringkas 4: Pengelompokan Kata | 215 | 183 |
| tiu-modul-s13 | A. Tes Aritmetika dan Aljabar | 95 | 92 |
| tiu-modul-s14 | A. Macam-Macam Bilangan | 398 | 307 |
| tiu-modul-s15 | Pengurangan Bilangan: Bulat Bertanda | 223 | 267 |
| tiu-modul-s16 | C. Perpangkatan | 136 | 185 |
| tiu-modul-s17 | D. Penarikan Akar | 223 | 249 |
| tiu-modul-s18 | E. Operasi Hitung Campuran | 151 | 145 |
| tiu-modul-s19 | F. Mengurutkan Bilangan Bulat | 192 | 152 |
| tiu-modul-s20 | G. Pembulatan atau Penaksiran | 413 | 336 |
| tiu-modul-s21 | B. Kelipatan Persekutuan Terkecil | 164 | 178 |
| tiu-modul-s22 | C. Faktor Persekutuan Terbesar | 246 | 231 |
| tiu-modul-s23 | A. Pengertian Pecahan | 63 | 62 |
| tiu-modul-s24 | B. Jenis-Jenis Pecahan | 335 | 248 |
| tiu-modul-s25 | C. Penyederhanaan dan Pengurutan Pecahan | 416 | 306 |
| tiu-modul-s26 | Operasi Pecahan Desimal, Perbandingan, dan Skala | 628 | 461 |
| tiu-modul-s27 | Ringkas 4: Aritmetika Sosial | 241 | 179 |
| tiu-modul-s28 | A. Perhitungan Untung dan Rugi | 348 | 282 |
| tiu-modul-s29 | B. Perhitungan Bunga | 313 | 265 |
| tiu-modul-s30 | Ringkas 5: Debit | 33 | 106 |
| tiu-modul-s31 | Ringkas 6: Pengukuran | 23 | 44 |
| tiu-modul-s32 | A. Ukuran Sudut | 684 | 602 |
| tiu-modul-s33 | D. Ukuran Volume | 229 | 222 |
| tiu-modul-s34 | E. Ukuran Berat | 175 | 209 |
| tiu-modul-s35 | G. Ukuran Waktu | 334 | 287 |
| tiu-modul-s36 | Ringkas 7: Bangun Datar | 27 | 44 |
| tiu-modul-s37 | A. Segitiga | 132 | 177 |
| tiu-modul-s38 | C. Segitiga Tumpul dan Teorema Pythagoras | 109 | 147 |
| tiu-modul-s39 | B. Persegi panjang | 225 | 230 |
| tiu-modul-s40 | D. Trapesium | 225 | 241 |
| tiu-modul-s41 | F. Belah ketupat | 63 | 122 |
| tiu-modul-s42 | G. Layang-Layang | 202 | 219 |
| tiu-modul-s43 | I. Simetri Lipat dan Simetri Putar | 206 | 231 |
| tiu-modul-s44 | Ringkas 8: Bangun Ruang | 1342 | 1027 |
| tiu-modul-s45 | Ringkas 9: Sistem Koordinat: A. Sistem Koordinat | 230 | 228 |
| tiu-modul-s46 | B. Pencerminan | 190 | 159 |
| tiu-modul-s47 | Ringkas 10: Statistika: A. Pengertian Data | 80 | 83 |
| tiu-modul-s48 | C. Penyajian Data | 354 | 343 |
| tiu-modul-s49 | D. Pengurutan Data | 76 | 108 |
| tiu-modul-s50 | Pembahasan: Urutan Data Tinggi Badan | 47 | 95 |
| tiu-modul-s51 | E. Rata-Rata Suatu Data | 51 | 88 |
| tiu-modul-s52 | F. Modus Suatu Data | 42 | 76 |
| tiu-modul-s53 | Ringkas 11: Barisan dan Deret | 101 | 192 |
| tiu-modul-s54 | A. Barisan dan Deret Angka | 407 | 443 |
| tiu-modul-s55 | Ringkas 12: Aljabar | 520 | 366 |
| tiu-modul-s56 | Ringkas 13: Kemampuan Kuantitatif | 164 | 227 |
| tiu-modul-s57 | B. Tes Penalaran Logis | 231 | 219 |
| tiu-modul-s58 | Silogisme | 238 | 243 |
| tiu-modul-s59 | C. Tes Penalaran Analitis | 809 | 627 |

### tkp-cheat-sheet (6 dari 6 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| tkp-cheat-sheet-s01 | Tema Profesionalisme | 297 | 264 |
| tkp-cheat-sheet-s02 | Tema Pelayanan Publik | 319 | 323 |
| tkp-cheat-sheet-s03 | Tema Jejaring Kerja | 365 | 371 |
| tkp-cheat-sheet-s04 | Tema Sosial Budaya | 343 | 362 |
| tkp-cheat-sheet-s05 | Tema Teknologi Informasi dan Komunikasi | 363 | 369 |
| tkp-cheat-sheet-s06 | Tema Anti Radikalisme | 377 | 386 |

### tkp-karakter-perilaku (2 dari 12 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| tkp-karakter-perilaku-s09 | Orientasi Pelayanan | 780 | 785 |
| tkp-karakter-perilaku-s11 | Kepedulian Lingkungan | 621 | 596 |

### tkp-kartu-sakti (26 dari 33 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| tkp-kartu-sakti-s01 | Profesionalisme: Fleksibilitas Berpikir (FB) | 95 | 95 |
| tkp-kartu-sakti-s02 | Jejaring Kerja: Inovasi (lnov) | 100 | 102 |
| tkp-kartu-sakti-s03 | Jejaring Kerja: Berpikir Analitis (BA) | 123 | 122 |
| tkp-kartu-sakti-s04 | Pelayanan Publik: Berpikir Konseptual (BK) | 122 | 117 |
| tkp-kartu-sakti-s05 | Profesionalisme: Adaptasi terhadap Perubahan (AtP) | 122 | 123 |
| tkp-kartu-sakti-s06 | Profesionalisme: Integritas (lnt) | 145 | 131 |
| tkp-kartu-sakti-s11 | Profesionalisme: Semangat Berprestasi (SB) | 105 | 104 |
| tkp-kartu-sakti-s14 | Jejaring Kerja: Kepemimpinan (Kp) | 111 | 111 |
| tkp-kartu-sakti-s15 | Jejaring Kerja: Membimbing (M) | 129 | 129 |
| tkp-kartu-sakti-s16 | Pelayanan Publik: Berorientasi Pada Pelayanan (BpP) | 105 | 105 |
| tkp-kartu-sakti-s17 | Pelayanan Publik: Kesadaran Akan Keselamatan Kerja (K3) | 111 | 111 |
| tkp-kartu-sakti-s19 | Profesionalisme: Negosiasi (Nego) | 122 | 122 |
| tkp-kartu-sakti-s20 | Teknologi Informasi dan Komunikasi: Kewirausahaan (Ke) | 103 | 103 |
| tkp-kartu-sakti-s21 | Teknologi Informasi dan Komunikasi: Pencarian Informasi (PI) | 128 | 122 |
| tkp-kartu-sakti-s22 | Teknologi Informasi dan Komunikasi: Perhatian terhadap Keter | 131 | 134 |
| tkp-kartu-sakti-s23 | Teknologi Informasi dan Komunikasi: Komunikasi Lisan | 128 | 131 |
| tkp-kartu-sakti-s24 | Teknologi Informasi dan Komunikasi: Komunikasi Tertulis | 140 | 133 |
| tkp-kartu-sakti-s25 | Profesionalisme: Pengambilan Keputusan | 122 | 120 |
| tkp-kartu-sakti-s26 | Jejaring Kerja: Pengorganisasian | 115 | 115 |
| tkp-kartu-sakti-s27 | Profesionalisme: Perencanaan | 107 | 106 |
| tkp-kartu-sakti-s28 | Jejaring Kerja: Manajemen Perubahan | 111 | 111 |
| tkp-kartu-sakti-s29 | Pelayanan Publik: Berorientasi pada Kualitas | 136 | 136 |
| tkp-kartu-sakti-s30 | Profesionalisme: Manajemen Konflik | 105 | 105 |
| tkp-kartu-sakti-s31 | Sosial Budaya: Tanggap Terhadap Pengaruh Budaya | 144 | 143 |
| tkp-kartu-sakti-s32 | Sosial Budaya: Empati | 122 | 122 |
| tkp-kartu-sakti-s33 | Sosial Budaya: Interaksi Sosial | 126 | 124 |

### tkp-modul (18 dari 18 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| tkp-modul-s01 | Ringkasan Materi | 104 | 112 |
| tkp-modul-s02 | A. Aspek Integritas | 170 | 151 |
| tkp-modul-s03 | B. Aspek Kejujuran | 165 | 153 |
| tkp-modul-s04 | C. Aspek Kemampuan | 159 | 155 |
| tkp-modul-s05 | D. Aspek Kemampuan | 144 | 145 |
| tkp-modul-s06 | E. Aspek Kemampuan: Pengendalian Diri | 187 | 144 |
| tkp-modul-s07 | F. Aspek Semangat | 251 | 203 |
| tkp-modul-s08 | G. Aspek Inisiatif | 142 | 144 |
| tkp-modul-s09 | H. Aspek Kreativitas | 190 | 190 |
| tkp-modul-s10 | I. Aspek Ketekunan | 178 | 184 |
| tkp-modul-s11 | J. Aspek Orientasi | 75 | 79 |
| tkp-modul-s12 | K. Aspek Menghargai | 390 | 366 |
| tkp-modul-s13 | M. Aspek Kepercayaan Diri | 138 | 137 |
| tkp-modul-s14 | N. Aspek Toleransi | 99 | 106 |
| tkp-modul-s15 | O. Aspek Kepedulian | 91 | 90 |
| tkp-modul-s17 | P. Aspek Efisiensi | 371 | 340 |
| tkp-modul-s18 | R. Aspek Bekerja | 138 | 138 |
| tkp-modul-s19 | S. Aspek Teknik | 182 | 180 |

### tkp-rangkuman-temenasn (10 dari 11 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| tkp-rangkuman-temenasn-s01 | Anti Radikalisme | 98 | 101 |
| tkp-rangkuman-temenasn-s02 | Ciri-ciri Radikalisme | 117 | 140 |
| tkp-rangkuman-temenasn-s03 | Jejaring Kerja | 246 | 191 |
| tkp-rangkuman-temenasn-s04 | Prinsip dalam Membangun Jejaring Kerja (Kemitraan) | 280 | 247 |
| tkp-rangkuman-temenasn-s05 | TKP - Pelayanan Publik | 304 | 283 |
| tkp-rangkuman-temenasn-s07 | Etiket Pelayanan Publik | 106 | 120 |
| tkp-rangkuman-temenasn-s08 | Profesionalisme | 170 | 155 |
| tkp-rangkuman-temenasn-s09 | Teknologi Informasi dan Komunikasi (TIK) | 91 | 77 |
| tkp-rangkuman-temenasn-s10 | Sosial Budaya | 121 | 133 |
| tkp-rangkuman-temenasn-s11 | Pola Tindak Sistem Sosial Budaya Indonesia | 232 | 214 |

### twk-cheat-sheet (6 dari 6 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| twk-cheat-sheet-s01 | Nasionalisme | 158 | 150 |
| twk-cheat-sheet-s02 | Pilar Negara | 217 | 203 |
| twk-cheat-sheet-s03 | Bela Negara | 258 | 232 |
| twk-cheat-sheet-s04 | Integritas | 222 | 211 |
| twk-cheat-sheet-s05 | Bahasa Indonesia | 445 | 426 |
| twk-cheat-sheet-s06 | Checklist Persiapan Tes SKD | 103 | 127 |

### twk-keyword-bela-negara (1 dari 1 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| twk-keyword-bela-negara-s01 | Bela Negara, Nasionalisme, Patriotisme, dan Cinta Tanah Air | 267 | 251 |

### twk-modul-ringkasan (59 dari 61 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| twk-modul-ringkasan-s01 | Ringkasan Materi | 119 | 116 |
| twk-modul-ringkasan-s02 | B. Dasar dan Ideologi Negara | 118 | 95 |
| twk-modul-ringkasan-s03 | C. Sejarah Perumusan Pancasila | 190 | 162 |
| twk-modul-ringkasan-s04 | D. Nilai-Nilai Pancasila | 174 | 166 |
| twk-modul-ringkasan-s05 | E. Perbandingan Ideologi | 107 | 158 |
| twk-modul-ringkasan-s06 | F. Sikap Positif terhadap Pancasila | 112 | 74 |
| twk-modul-ringkasan-s07 | A. Hakikat Konstitusi | 105 | 139 |
| twk-modul-ringkasan-s08 | B. Macam-Macam Konstitusi dan Sistematika UUD 1945 | 495 | 445 |
| twk-modul-ringkasan-s09 | E. Berbagai Penyimpangan | 419 | 408 |
| twk-modul-ringkasan-s10 | C. Amandemen UUD 1945 | 465 | 408 |
| twk-modul-ringkasan-s11 | Ringkas 3: Bhinneka Tunggal Ika: A. Sejarah Penemuan Bhinnek | 130 | 122 |
| twk-modul-ringkasan-s12 | B. Landasan Hukum Bhinneka | 215 | 167 |
| twk-modul-ringkasan-s13 | C. Lambang Negara Indonesia | 151 | 155 |
| twk-modul-ringkasan-s14 | D. Konsep Dasar Bhinneka | 193 | 172 |
| twk-modul-ringkasan-s15 | E. Prinsip Bhinneka Tunggal Ika | 89 | 90 |
| twk-modul-ringkasan-s16 | F. Paham Bhinneka Tunggal Ika | 44 | 70 |
| twk-modul-ringkasan-s17 | G. Prinsip-Prinsip yang Terkandung dalam Bhinneka Tunggal Ik | 609 | 587 |
| twk-modul-ringkasan-s18 | Ringkas 4: Sistem Tata Negara | 164 | 160 |
| twk-modul-ringkasan-s19 | C. Prinsip-Prinsip Demokrasi | 437 | 404 |
| twk-modul-ringkasan-s20 | I. Pemilihan Umum (Pemilu) di Indonesia | 152 | 141 |
| twk-modul-ringkasan-s21 | C. Lanjutan Pemilu dan Hakikat Kedaulatan | 177 | 179 |
| twk-modul-ringkasan-s22 | K. Macam-Macam Kedaulatan | 58 | 64 |
| twk-modul-ringkasan-s23 | L. Teori-Teori Kedaulatan | 251 | 236 |
| twk-modul-ringkasan-s24 | N. Kedaulatan Rakyat di Indonesia | 728 | 679 |
| twk-modul-ringkasan-s25 | P. Sistem Pemerintahan di Indonesia | 123 | 121 |
| twk-modul-ringkasan-s26 | O. Tata Urutan Perundang-undangan Nasional | 224 | 246 |
| twk-modul-ringkasan-s27 | C. Peraturan Desa dan Peraturan Perundang-undangan | 428 | 402 |
| twk-modul-ringkasan-s28 | T. Otonomi Daerah | 548 | 552 |
| twk-modul-ringkasan-s29 | U. Partisipasi Masyarakat | 124 | 131 |
| twk-modul-ringkasan-s30 | Ringkas 5: Hak Asasi Manusia (HAM): A. Hakikat Hak Asasi Man | 165 | 175 |
| twk-modul-ringkasan-s32 | C. Instrumen HAM | 46 | 92 |
| twk-modul-ringkasan-s33 | D. Piagam Perlindungan dan Penegakan HAM | 109 | 116 |
| twk-modul-ringkasan-s34 | E. Hak Asasi Manusia (HAM) di Indonesia | 154 | 154 |
| twk-modul-ringkasan-s35 | F. Kasus Pelanggaran HAM di Indonesia | 115 | 124 |
| twk-modul-ringkasan-s36 | G. Cara Menangani Pelanggaran HAM | 46 | 66 |
| twk-modul-ringkasan-s37 | H. Lembaga Perlindungan HAM | 554 | 462 |
| twk-modul-ringkasan-s38 | B. Faktor-Faktor yang Mendorong Timbulnya Pergerakan Nasiona | 53 | 60 |
| twk-modul-ringkasan-s39 | C. Organisasi Pergerakan | 247 | 266 |
| twk-modul-ringkasan-s40 | Lanjutan Organisasi Pergerakan dan Pendudukan Militer Jepang | 407 | 394 |
| twk-modul-ringkasan-s41 | E. Perlawanan Rakyat | 363 | 344 |
| twk-modul-ringkasan-s42 | F. Badan Penyelidik Usaha-Usaha Persiapan Kemerdekaan Indone | 550 | 516 |
| twk-modul-ringkasan-s43 | G. Panitia Persiapan Kemerdekaan Indonesia (PPKI) | 427 | 412 |
| twk-modul-ringkasan-s44 | H. Peristiwa Rengasdengklok | 340 | 354 |
| twk-modul-ringkasan-s45 | K. Konflik Indonesia dengan Belanda | 1422 | 1350 |
| twk-modul-ringkasan-s46 | R. Pemberontakan | 1094 | 1079 |
| twk-modul-ringkasan-s47 | R. Pemberontakan (lanjutan 2) | 523 | 484 |
| twk-modul-ringkasan-s48 | A. Peranan Perserikatan Bangsa-Bangsa | 87 | 89 |
| twk-modul-ringkasan-s49 | B. Peranan Konferensi Asia di New Delhi | 682 | 657 |
| twk-modul-ringkasan-s50 | A. Politik Luar Negeri Indonesia | 90 | 93 |
| twk-modul-ringkasan-s51 | C. Konferensi Asia Afrika (KAA) | 438 | 443 |
| twk-modul-ringkasan-s52 | D. Association of Southeast Asian Nations (ASEAN) | 255 | 255 |
| twk-modul-ringkasan-s53 | E. Perserikatan Bangsa-Bangsa | 49 | 93 |
| twk-modul-ringkasan-s54 | C. Tujuan PBB dan Peranan Indonesia | 120 | 125 |
| twk-modul-ringkasan-s55 | F. Gerakan Non Blok (GNB) | 97 | 96 |
| twk-modul-ringkasan-s56 | Kemampuan berbahasa Indonesia | 91 | 113 |
| twk-modul-ringkasan-s57 | B. Ejaan yang Disempurnakan (EYD) | 1473 | 1412 |
| twk-modul-ringkasan-s58 | M. Tanda Baca, Kata, dan Tata Kalimat | 1129 | 1141 |
| twk-modul-ringkasan-s59 | K. Tata Makna | 220 | 231 |
| twk-modul-ringkasan-s61 | A. Gagasan Utama Bacaan | 925 | 886 |

### twk-rangkuman-temenasn (17 dari 18 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| twk-rangkuman-temenasn-s01 | 1. Muh. Yamin | 65 | 65 |
| twk-rangkuman-temenasn-s02 | 3. Ir. Soekarno | 297 | 148 |
| twk-rangkuman-temenasn-s03 | Prosedur Pemberhentian Presiden dan Ringkasan UUD 1945 | 1356 | 1396 |
| twk-rangkuman-temenasn-s04 | 1. Bela Negara | 309 | 321 |
| twk-rangkuman-temenasn-s05 | 2. Kesadaran Berbangsa | 56 | 78 |
| twk-rangkuman-temenasn-s06 | 3. Setia kepada Pancasila | 66 | 83 |
| twk-rangkuman-temenasn-s07 | 4. Rela Berkorban untuk: Bangsa dan Negara | 72 | 100 |
| twk-rangkuman-temenasn-s08 | 5. Memiliki Kemampuan: Awal Bela Negara | 107 | 115 |
| twk-rangkuman-temenasn-s09 | Mewujudkan Negara | 60 | 83 |
| twk-rangkuman-temenasn-s10 | Pancasila sebagai Ideologi Terbuka | 282 | 272 |
| twk-rangkuman-temenasn-s12 | Kemanusiaan Yang Adil dan Beradab | 103 | 119 |
| twk-rangkuman-temenasn-s13 | Persatuan Indonesia | 231 | 249 |
| twk-rangkuman-temenasn-s14 | Keadilan Sosial Bagi Seluruh Rakyat Indonesia | 150 | 166 |
| twk-rangkuman-temenasn-s15 | Pokok Pikiran Persatuan | 44 | 53 |
| twk-rangkuman-temenasn-s16 | Pokok Pikiran Keadilan Sosial | 56 | 60 |
| twk-rangkuman-temenasn-s17 | Pokok Pikiran Kedaulatan Rakyat | 70 | 82 |
| twk-rangkuman-temenasn-s18 | Pokok Pikiran Ketuhanan | 57 | 60 |

### twk-rangkuman-tryout (1 dari 1 seksi)

| Seksi | Judul baru | Kata sebelum | Kata sesudah |
|---|---|---:|---:|
| twk-rangkuman-tryout-s01 | Rangkuman Materi dari Tryout | 1208 | 1089 |

## Fase 2 — detail pembahasan

### Ditulis ulang terstruktur per-opsi + bobot per-opsi (35, materi-mod)

materi-296, materi-297, materi-298, materi-299, materi-300, materi-301, materi-303, materi-304, materi-305, materi-306, materi-307, materi-308, materi-309, materi-310, materi-311, materi-312, materi-313, materi-314, materi-315, materi-316, materi-317, materi-318, materi-319, materi-320, materi-321, materi-322, materi-323, materi-324, materi-325, materi-326, materi-327, materi-328, materi-329, materi-330, materi-331

### Ditulis ulang dengan jawaban terverifikasi (11, komunitasbelajar)

komunitas-511, komunitas-519, komunitas-521, komunitas-522, komunitas-524, komunitas-528, komunitas-529, komunitas-533, komunitas-534, komunitas-883, komunitas-1013

### Dikosongkan / null (28, komunitasbelajar — pembahasan milik soal lain, tak terverifikasi)

komunitas-512, komunitas-513, komunitas-514, komunitas-515, komunitas-516, komunitas-517, komunitas-518, komunitas-520, komunitas-523, komunitas-525, komunitas-526, komunitas-527, komunitas-530, komunitas-531, komunitas-532, komunitas-634, komunitas-640, komunitas-905, komunitas-906, komunitas-922, komunitas-1012, komunitas-1014, komunitas-1016, komunitas-1019, komunitas-1020, komunitas-1108, komunitas-1110, komunitas-1112

Pola yang ditemukan: blok pembahasan bergeser (mis. pembahasan 1012 milik 1013; definisi kosakata 511-521 milik soal 522-531).

### Bobot dikonversi ke map per-opsi (347, komunitasbelajar TKP)

Di semua 347 soal, opsi skor-5 sama dengan kunci tercatat — bukti kuat pembahasan memang milik soalnya. 6 soal tidak dikonversi karena dihapus sebagai duplikat.

### Duplikat sejati dihapus (15)

komunitas-553 (pertahankan 1137, kunci E), komunitas-557 (pertahankan 385, kunci B), komunitas-44, komunitas-69, komunitas-942, komunitas-765, komunitas-846, kidocp-748, kidocp-1572, kidocp-985, kidocp-465, kidocp-956, kidocp-961, tes12-226, tes12-264. Pasangan komunitas-461 vs 768 TIDAK dihapus (opsi E berbeda substansial, varian soal yang berbeda).

## Temuan kunci jawaban — BUTUH PUTUSAN USER (17, sudah diverifikasi hitung ulang)

Tidak ada kunci yang diubah di run ini. Semua temuan di bawah diverifikasi dengan hitung ulang / cek fakta langsung dari soal dan opsinya:

| Soal | Kunci tercatat | Seharusnya | Bukti |
|---|---|---|---|
| komunitas-1012 | A (530rb) | D (560rb) | 50×600rb + 25×560rb + 25p = 100×580rb menjadi p = 560rb |
| komunitas-1014 | B (6/5) | D (1/4) | (0,07a+0,08b)/(a+b)=0,078 menjadi b=4a, a/b=1/4 |
| komunitas-1019 | B (86) | D (82) | (91+88+86+78+x)/5=85 menjadi x=82 |
| komunitas-1020 | B (2 jam) | D (4 jam) | Jarak A-B tetap 192 km, kecepatan sama 48 km/jam, jadi tetap 4 jam; jumlah bensin pengecoh |
| komunitas-1112 | B (x>y) | C (x=y) | x=p×q, y=q×p |
| komunitas-1110 | C (32 orang) | A (8 orang) | 64 orang × 0,5 hari = 32 orang-hari; 32/4 = 8 orang |
| komunitas-1108 | A (30%) | B (32%) | 1 − 0,8×0,85 = 32% |
| komunitas-634 | C (6/detik) | A (0,6/detik) | (2334−1254)/1800 detik = 0,6 |
| komunitas-922 | A (6%) | D (11%) | (1,2X+1,02X−2X)/2X = 11% |
| komunitas-512 | C (Beliung) | D (Sarkofagus) | Peti kubur batu = sarkofagus |
| komunitas-513 | D (Prasasti Tugu) | C (Yupa) | Peninggalan paling terkenal Kutai = Yupa |
| komunitas-906 | E (UNESCO) | A (UNTEA) | Komisi PBB untuk Irian Barat = UNTEA |
| komunitas-1126 | A | C | Pembahasan soalnya sendiri bilang "didapat karena diminta" |
| komunitas-905 | A (Inggris) | tidak ada opsi benar | Blok fasis PD II = Jerman/Italia/Jepang; tidak ada di opsi |
| komunitas-1016 | C | soal rusak | Pangkat hilang dari OCR ("x = -(2) dan y = (-2)"), tidak bisa dijawab apa adanya |
| komunitas-640 | C | soal tak terjawab | Premis perbandingan tinggi badan hilang, hanya ada pernyataan opsi |
| komunitas-715 | D (Kebingungan) | meragukan, kemungkinan C (Ketidakpastian) | KBBI: ambiguitas = bermakna dua / ketidaktentuan; pembahasan soal sendiri menyebut "ketidakpastian" |

## Catatan, keraguan, dan sisa pekerjaan

- **materi-297 opsi D (Skor 4)** meragukan: ikut pungli "terkadang" diberi skor 4/5 di sumber OCR. Dipertahankan apa adanya dari sumber, tidak diubah.
- **tkp-kartu-sakti-s17 Level 0** ("Menentukan pentingnya faktor keselamatan kerja") meragukan, kemungkinan OCR dari kalimat negatif; dipertahankan verbatim.
- **Level kartu sakti yang hilang** di sumber (mis. s04 tanpa L1-2, s29 tanpa L4) TIDAK dikarang; penomoran asli dipertahankan.
- **35 soal slideshare-lama** punya pola bobot yang sama dengan komunitasbelajar (35/35 opsi skor-5 cocok dengan kunci) tapi belum dikonversi ke map per-opsi — follow-up Fase 2.
- **Perbaikan lookup QA (hanya di salinan `qa-materi2.mjs`, bukan `qa.mjs` utama):** `cariKunci`/`cariSoal` kini mendisambiguasi stem duplikat dengan seluruh opsi, bukan hanya opsi A. Run 1 gagal di cek "Fase 3 jadwal" karena pasangan kembar kidocp-823/867 (stem + opsi A sama, opsi B-E beda, keduanya soal sah) — lookup lama mengambil kandidat pertama yang salah. Perbaikan ini layak dibawa ke `qa.mjs` utama oleh parent.
- **Judul yang masih berupa fragmen tapi isinya tidak cukup jelas untuk diperbaiki dengan yakin:** tidak ada yang tersisa di cakupan ini; semua judul artefak yang ditemukan sudah diperbaiki dari isi sectionnya.
- **twk-rangkuman-temenasn-s03** kini memuat ringkasan UUD 1945 per BAB (dipindah dari fragmen tabel di s02) — judul disesuaikan menjadi "Prosedur Pemberhentian Presiden dan Ringkasan UUD 1945".

## Screenshot

`~/workspace/qa-lolosin/screenshots-materi-readability/` — render check (awalan `d-` desktop, `m-` mobile):

- `d-tiu-handbook-numerik-s06.png` + `d-full-numerik-s06.png` — mode baca layar penuh + kartu Poin inti (Soal Cerita)
- `d-tiu-handbook-figural-s02.png`, `d-tiu-handbook-verbal-s03.png`, `d-tiu-handbook-verbal-s05.png` — handbook TIU
- `d-twk-modul-ringkasan-s58.png` — sub-daftar bertingkat
- `d-twk-rangkuman-temenasn-s03.png` — section 1.396 kata
- `m-numerik-s06.png`, `m-temenasn-s03.png` — mobile, kartu Poin inti di atas konten
- `d-pembahasan-materi-332.png`, `d-pembahasan-materi-333.png` — pembahasan per-opsi + panel nilai tiap opsi
- Screenshot full QA (dashboard, drill, tryout, simulasi, mobile, formasi) ada di direktori yang sama dengan nama standar `qa.mjs`.

---

## Lampiran: hasil full QA (372 cek, semua PASS)

## Dashboard

| Cek | Hasil | Bukti |
|---|---|---|
| Render + heading sapaan | ✅ PASS | load 2569ms, URL http://127.0.0.1:4211/Lolosin/ |
| Kartu Level/XP tampil | ✅ PASS | Level 1 |
| Kartu streak tampil | ✅ PASS |  |
| Hero tanpa angka total soal/materi (v2) | ✅ PASS |  |
| Layout desktop lebar (main > 1000px, v2) | ✅ PASS | main width 1280px |
| Osi tampil di hero dashboard (v2.2) | ✅ PASS |  |
| Osi hero dashboard besar (lebar ~160px, v2.2) | ✅ PASS | lebar 170px |
| Nama "Osi" terlihat di hero dashboard (v2.2) | ✅ PASS |  |
| Balon ucapan Osi tampil (profil baru, v2.2) | ✅ PASS |  |
| Caption "Osi" di hero + 2 empty state (v2.2) | ✅ PASS | 3 elemen teks "Osi" |
| Quick actions Belajar/Latihan/Tryout | ✅ PASS |  |
| PetCard peliharaan tampil (v2.2) | ✅ PASS |  |
| Footer beneran tampil (v2.2) | ✅ PASS |  |
| Teaser game tampil + link ke /main (v2.2) | ✅ PASS |  |
| Tidak ada horizontal overflow (desktop) | ✅ PASS |  |
| Ringkasan tryout terakhir tampil di dashboard | ✅ PASS |  |

## Fase 3 kosong

| Cek | Hasil | Bukti |
|---|---|---|
| Kartu ulas empty state (profil baru) | ✅ PASS |  |
| Kartu fokus empty state (profil baru) | ✅ PASS |  |
| Panel prediksi empty state (profil baru) | ✅ PASS |  |
| Tidak ada skor terskala dari nol data | ✅ PASS |  |
| Mobile: kartu ulas empty state | ✅ PASS |  |
| Mobile: kartu fokus empty state | ✅ PASS |  |
| Mobile: panel prediksi empty state | ✅ PASS |  |

## PWA

| Cek | Hasil | Bukti |
|---|---|---|
| manifest.webmanifest termuat (200) | ✅ PASS |  |
| manifest start_url = /Lolosin/ | ✅ PASS | start_url=/Lolosin/ |
| manifest scope = /Lolosin/ | ✅ PASS | scope=/Lolosin/ |
| manifest icons ada (SVG) | ✅ PASS | ["icons/icon.svg","icons/maskable.svg"] |
| Service worker ter-register + aktif | ✅ PASS | {"scope":"http://127.0.0.1:4211/Lolosin/","active":true,"state":"activated","controller":true} |
| Halaman dikontrol SW setelah reload | ✅ PASS |  |

## Belajar

| Cek | Hasil | Bukti |
|---|---|---|
| Daftar materi tampil (12 entri grup, v2.3.1) | ✅ PASS | 12 link materi |
| Tanpa statistik di daftar materi (v2.2) | ✅ PASS |  |
| Intro "dirapikan per topik" dipertahankan (v2.2) | ✅ PASS |  |
| Motif aksen per subtes tampil (v2.2) | ✅ PASS |  |
| Deskripsi singkat per materi tampil (v2.2) | ✅ PASS |  |
| Tanpa judul beratribusi di daftar materi (v2.1) | ✅ PASS |  |
| Materi TWK terbuka, judul tanpa atribusi (v2.1) | ✅ PASS | h1: Rangkuman Tabel TWK \| http://127.0.0.1:4211/Lolosin/#/belajar/twk-bang-arya |
| Detail materi tanpa baris "Sumber:" (v2.1) | ✅ PASS |  |
| Daftar seksi dokumen tampil | ✅ PASS | 7 link seksi |
| Seksi TWK terbuka + isi tampil | ✅ PASS | h1: Poin Setiap Sila Pancasila \| body 2080 karakter |
| Tombol back ikon saja di halaman seksi (v2.2) | ✅ PASS |  |
| Tidak ada teks "Semua materi" di halaman seksi (v2.2) | ✅ PASS |  |
| Tombol back tetap terlihat setelah scroll (sticky, v2.2) | ✅ PASS |  |
| Tandai selesai dibaca memberi +5 XP | ✅ PASS | XP 0 -> 5 |
| Status seksi berubah jadi Sudah dibaca | ✅ PASS |  |
| Dokumen TIU tabel pangkat terbuka | ✅ PASS | h1: Tabel Bilangan Pangkat 2, 3, dan 4 (1–100) |
| Tabel pangkat 2 tampil + 100 nilai benar | ✅ PASS | h3: "Tabel Pangkat 2 (1–100)" \| 100 baris dicek, 0 salah \| contoh: [["1","1"],["2","4"]] … [["100","10.000"]] |
| Tabel pangkat 3 tampil + 100 nilai benar | ✅ PASS | h3: "Tabel Pangkat 3 (1–100)" \| 100 baris dicek, 0 salah \| contoh: [["1","1"],["2","8"]] … [["100","1.000.000"]] |
| Rute grup /belajar/twk-ringkasan terbuka ("Ringkasan Materi TWK", tanpa Sumber, v2.1) | ✅ PASS | h1: Ringkasan Materi TWK \| 81 link seksi |
| Rute grup /belajar/tiu-verbal terbuka ("Kemampuan Verbal", tanpa Sumber, v2.1) | ✅ PASS | h1: Kemampuan Verbal \| 16 link seksi |
| Rute grup /belajar/tiu-numerik terbuka ("Kemampuan Numerik", tanpa Sumber, v2.1) | ✅ PASS | h1: Kemampuan Numerik \| 20 link seksi |
| Rute grup /belajar/tkp-ringkasan terbuka ("Ringkasan Materi TKP", tanpa Sumber, v2.1) | ✅ PASS | h1: Ringkasan Materi TKP \| 30 link seksi |
| Motif Garuda TWK tampil di daftar Belajar (v2.2.1) | ✅ PASS |  |
| Motif simbol matematika TIU tampil (v2.2.1) | ✅ PASS |  |
| Motif jabat tangan TKP tampil (v2.2.1) | ✅ PASS |  |

## Latihan

| Cek | Hasil | Bukti |
|---|---|---|
| Topik Analogi Verbal ditemukan | ✅ PASS |  |
| Drill dimulai (soal tampil) | ✅ PASS | http://127.0.0.1:4211/Lolosin/#/latihan/jalan |
| Tombol Jawab disabled sebelum memilih (v2.2) | ✅ PASS |  |
| Pilih opsi saja belum menjawab (v2.2) | ✅ PASS |  |
| Panel pembahasan muncul setelah Jawab | ✅ PASS |  |
| Opsi jawaban tampil (minimal 4, v2.2) | ✅ PASS | 5 tombol opsi |
| Kunci jawaban ditemukan di bank lokal untuk semua soal drill | ✅ PASS | 10/10 ketemu |
| Halaman hasil drill tampil (Sesi selesai!) | ✅ PASS | skor tampil: 5/10, benar versi UI: 5/10 |
| Skor tampil konsisten dengan jawaban benar (5/10) | ✅ PASS | skor tampil 5/10, benar terhitung 5 |
| XP bertambah sesuai aturan (+10/benar, +50 selesai) | ✅ PASS | XP 5 -> 105 (delta 100, harapan 100 dari 5 benar) |
| XP drill 2 sesuai aturan (+10/benar, +50 selesai) | ✅ PASS | delta 90, harapan 90 dari 4 benar |

## Anti-ulang

| Cek | Hasil | Bukti |
|---|---|---|
| Drill 2 tidak mengulang soal drill 1 (topik sama) | ✅ PASS | 0 dari 10 berulang |
| Tidak ada pesan rotasi (pool topik masih cukup) | ✅ PASS |  |

## Fase 3 antrean

| Cek | Hasil | Bukti |
|---|---|---|
| Soal salah masuk antrean ulas (jumlah = jawaban salah drill 1+2) | ✅ PASS | antrean 11, harapan 11 (salah drill1 5 + drill2 6) |
| Entri antrean jatuh tempo besok, interval 1 hari, streak 0 | ✅ PASS | contoh: due=2026-11-16 interval=1 streak=0 (besok=2026-11-16) |
| Kartu ulas empty state saat belum ada yang jatuh tempo hari ini | ✅ PASS |  |
| Kartu ulas menampilkan jumlah soal jatuh tempo | ✅ PASS | Soal yang perlu diulas hari ini: 11 soal |

## Fase 3 fokus

| Cek | Hasil | Bukti |
|---|---|---|
| Tally topik tercatat (TIU|Analogi Verbal, 20 jawaban) | ✅ PASS | {"correct":9,"total":20} |
| Kartu fokus menampilkan subtopik terlemah + akurasi yang benar | ✅ PASS | 9 benar dari 20 |
| Tombol drill topik terlemah ada | ✅ PASS |  |
| Baris Belum dicoba tampil | ✅ PASS |  |
| Dashboard tanpa overflow (kartu Fase 3) | ✅ PASS |  |

## Fase 3 mode ulas

| Cek | Hasil | Bukti |
|---|---|---|
| Navigasi ke #/latihan/ulas | ✅ PASS | http://127.0.0.1:4211/Lolosin/#/latihan/ulas |
| Halaman tergulir ke atas, judul tidak tertutup header | ✅ PASS | scrollY=0 h1.y=141.234375 header.h=73.234375 |
| Sesi ulas tampil (Soal 1 dari 10, maks 10) | ✅ PASS | Soal 1 dari 10 |
| Mode ulas tanpa overflow | ✅ PASS |  |

## Fase 3 jadwal

| Cek | Hasil | Bukti |
|---|---|---|
| Jawaban benar di mode ulas memajukan jadwal (interval 1 -> 3, streak 1, due +3 hari) | ✅ PASS | interval=3 streak=1 due=2026-11-18 (harapan due 2026-11-18) |
| Hitungan ulasan benar bertambah (stats.reviewsCorrect = 1) | ✅ PASS | reviewsCorrect=1 |
| Jawaban benar di mode ulas memberi +10 XP | ✅ PASS | XP 195 -> 205 |
| Jawaban salah di mode ulas mereset jadwal (interval 1, streak 0, due besok) | ✅ PASS | interval=1 streak=0 due=2026-11-16 (harapan due 2026-11-16) |

## Tryout

| Cek | Hasil | Bukti |
|---|---|---|
| Halaman intro tryout tampil | ✅ PASS |  |
| Aturan main tampil sebagai card game (v2.2) | ✅ PASS |  |
| Motif per subtes tampil di halaman tryout (v2.2.1) | ✅ PASS |  |
| Modal konfirmasi mulai tampil (v2.2) | ✅ PASS |  |
| Timer tampil (~27 menit) | ✅ PASS | timer: 27:00 |
| Palet navigator 30 soal tampil | ✅ PASS | 30 tombol palet |
| Tandai ragu-ragu berfungsi | ✅ PASS |  |
| Palet menandai soal 2 sebagai ragu-ragu | ✅ PASS |  |
| Navigasi via palet ke soal 15 | ✅ PASS | Soal 15 dari 30 |
| Semua 30 soal terjawab | ✅ PASS | 30 tombol palet bertanda sudah dijawab |
| Dialog konfirmasi submit tampil | ✅ PASS |  |
| Pindah ke halaman hasil (#/tryout/hasil) | ✅ PASS | http://127.0.0.1:4211/Lolosin/#/tryout/hasil |
| Halaman hasil tampil (lulus/belum lulus) | ✅ PASS | h1: Belum lulus, terus berlatih ya! |
| Skor total tampil | ✅ PASS | Total mini 32/150 |
| Skor per seksi tampil (nama + nilai + passing grade + benar x/10) | ✅ PASS | passing-grade muncul 3x, "benar: x/10" muncul 3x |
| Jumlah skor 3 seksi == total mini | ✅ PASS | seksi: 5 + 5 + 22 = 32 vs total 32 |
| Breakdown per soal tampil 30 soal | ✅ PASS | 30 entri breakdown |
| Status lulus per seksi tampil + konsisten dengan skor vs passing grade | ✅ PASS | badge: [Belum lulus, Belum lulus, Belum lulus], harapan: [Belum lulus, Belum lulus, Belum lulus] dari skor 5/5/22 |
| XP +100 setelah menyelesaikan tryout | ✅ PASS | XP 205 -> 305 (delta 100) |
| Riwayat tryout tersimpan (1 entri) | ✅ PASS | history: 1 |
| Tidak ada catatan leaderboard di hasil tryout kilat (status mini) | ✅ PASS |  |

## Fase 3 prediksi

| Cek | Hasil | Bukti |
|---|---|---|
| Panel prediksi tampil di halaman hasil | ✅ PASS |  |
| Skor terskala TWK benar (5 x 3 = 15 dari 150) | ✅ PASS |  |
| Selisih TWK vs passing grade asli benar (50 poin lagi) | ✅ PASS |  |
| Pita TWK benar (Masih jauh, fokus di sini dulu) | ✅ PASS |  |
| Skor terskala TIU benar (5 x 3.5 = 17,5 dari 175) | ✅ PASS |  |
| Selisih TIU vs passing grade asli benar (62,5 poin lagi) | ✅ PASS |  |
| Pita TIU benar (Masih jauh, fokus di sini dulu) | ✅ PASS |  |
| Skor terskala TKP benar (22 x 4.5 = 99 dari 225) | ✅ PASS |  |
| Selisih TKP vs passing grade asli benar (57 poin lagi) | ✅ PASS |  |
| Pita TKP benar (Masih jauh, fokus di sini dulu) | ✅ PASS |  |
| Teks belum ada tren (baru 1 tryout) | ✅ PASS |  |
| Kalimat jujur tampil | ✅ PASS |  |
| Ringkasan riwayat 1 tryout tampil | ✅ PASS | Dari 1 tryout mini, terakhir 15 Nov 2026TWKTes Wawasan KebangsaanMasih jauh, fokus di sini duluTWK 15 dari 150Passing grade: 65 · 50 poin lagiTIUTes Intelegensia UmumMasih jauh, fokus di sini duluTIU 17,5 dari 175Passing grade: 80 · 62,5 poin lagiTKPTes Karakteristik PribadiMasih jauh, fokus di sini duluTKP 99 dari 225Passing grade: 156 · 57 poin lagiBelum ada tren, ikut tryout lagi untuk melihat perkembanganmu |
| Panel muncul setelah breakdown per soal | ✅ PASS |  |
| Panel ringkas di dashboard menampilkan skor terskala yang benar | ✅ PASS | TWK 15 dari 150 \| TIU 17,5 dari 175 \| TKP 99 dari 225 |

## Simulasi CAT

| Cek | Hasil | Bukti |
|---|---|---|
| Dua kartu mode tampil (Tryout kilat + Simulasi CAT) | ✅ PASS |  |
| Kartu kilat: 30 soal, 27 menit, +100 XP | ✅ PASS |  |
| Kartu simulasi: 110 soal, 100 menit, +300 XP | ✅ PASS |  |
| Kartu simulasi menyebut komposisi 30 TWK / 35 TIU / 45 TKP | ✅ PASS |  |
| Passing grade mini tampil (TWK 22, TIU 23, TKP 35 dari 50) | ✅ PASS |  |
| Passing grade asli tampil (TWK 65, TIU 80, TKP 156 dari 150/175/225) | ✅ PASS |  |
| Riwayat menampilkan entri mini sebelumnya (Tryout mini, total /150) | ✅ PASS |  |
| Halaman pilih mode tanpa overflow (desktop) | ✅ PASS |  |
| Timer simulasi mulai 100:00 | ✅ PASS | timer: 100:00 |
| Palet navigator 110 soal tampil | ✅ PASS | 110 tombol palet |
| Palet dikelompokkan per seksi (TWK 1–30, TIU 31–65, TKP 66–110) | ✅ PASS |  |
| Penghitung 0/110 dijawab di awal | ✅ PASS |  |
| Label mode Simulasi CAT tampil di header sesi | ✅ PASS |  |
| Sesi simulasi tanpa overflow (desktop) | ✅ PASS |  |
| Jawaban tercatat (penghitung 1/110) | ✅ PASS |  |
| Palet menandai soal 1 sudah dijawab | ✅ PASS |  |
| Tandai ragu-ragu berfungsi di simulasi | ✅ PASS |  |
| Kunci ditemukan di bank lokal untuk semua 110 soal | ✅ PASS | 110/110 ketemu |
| Urutan seksi benar (TWK soal 1-30, TIU 31-65, TKP 66-110) | ✅ PASS | Q1=TWK Q30=TWK Q31=TIU Q65=TIU Q66=TKP Q110=TKP |
| Semua 110 soal terjawab (penghitung 110/110) | ✅ PASS |  |
| Palet menandai 110 soal sudah dijawab | ✅ PASS | 110 tombol palet bertanda sudah dijawab |
| Dialog konfirmasi submit simulasi tampil | ✅ PASS |  |
| Pindah ke halaman hasil (#/tryout/hasil) | ✅ PASS | http://127.0.0.1:4211/Lolosin/#/tryout/hasil |
| Judul hasil sesuai kelolosan (lulus) | ✅ PASS | h1: Selamat, kamu lulus! \| skor harapan TWK 125 / TIU 175 / TKP 225 |
| Total tampil /550 sesuai hitungan (525/550) | ✅ PASS | Total 525/550 |
| Skor per seksi tampil sesuai hitungan jawaban (TWK/TIU/TKP) | ✅ PASS | tampil: 125/175/225 \| harapan: 125/175/225 |
| Jumlah benar per seksi tampil (x/30, x/35, x/45) | ✅ PASS | benar: 25/30, benar: 35/35, benar: 45/45 |
| Status lulus per seksi konsisten dengan passing grade ASLI | ✅ PASS | badge: [Lulus, Lulus, Lulus], harapan: [Lulus, Lulus, Lulus] |
| Breakdown per soal tampil 110 soal | ✅ PASS | 110 entri breakdown |
| Pill +300 XP tampil di halaman hasil | ✅ PASS |  |
| Catatan leaderboard not-configured tampil di hasil simulasi | ✅ PASS |  |
| Skor not-configured tidak masuk antrean pending | ✅ PASS | key tidak ada |
| XP +300 setelah menyelesaikan simulasi | ✅ PASS | XP 305 -> 605 (delta 300) |
| Riwayat bertambah: entri full mode=full, skor sesuai hitungan | ✅ PASS | {"mode":"full","twk":125,"tiu":175,"tkp":225,"passed":true,"correct":{"TWK":25,"TIU":35,"TKP":45},"date":"2026-11-15T08:33:40.342Z"} |
| Entri mini lama tetap mode=mini, skor tidak berubah | ✅ PASS | {"mode":"mini","twk":5,"tiu":5,"tkp":22,"passed":false,"correct":{"TWK":1,"TIU":1,"TKP":3},"date":"2026-11-15T08:32:22.280Z"} |
| Lencana 'Pejuang CAT' diraih setelah 1 simulasi | ✅ PASS | langkah-pertama, penantang-tryout, pemburu-100, pejuang-cat, lolos-simulasi |
| Lencana 'Lolos Simulasi' diraih (simulasi lulus) | ✅ PASS | langkah-pertama, penantang-tryout, pemburu-100, pejuang-cat, lolos-simulasi |
| Misi 'simulasi-1' tidak berubah (bukan misi hari ini) | ✅ PASS | misi hari ini: [baca-tkp, baca-twk, drill-2], progress simulasi-1=0 |
| Soal salah dari simulasi masuk antrean ulas (jumlah pas) | ✅ PASS | antrean 36 -> 41 (harapan +5), salah tidak masuk: 0 |
| Entri ulas dari simulasi jatuh tempo besok, interval 1 hari | ✅ PASS | {"questionId":"materi-119","materi":"TWK","subtopik":"Integritas","due":"2026-11-16","intervalDays":1,"streakCorrect":0} |
| Panel prediksi tampil di halaman hasil simulasi | ✅ PASS |  |
| Prediksi TWK memakai skor MENTAH simulasi (125 dari 150, tanpa skala) | ✅ PASS |  |
| Selisih prediksi TWK benar (60 poin di atas passing grade) | ✅ PASS |  |
| Pita prediksi TWK benar (Aman, pertahankan) | ✅ PASS |  |
| Prediksi TIU memakai skor MENTAH simulasi (175 dari 175, tanpa skala) | ✅ PASS |  |
| Selisih prediksi TIU benar (95 poin di atas passing grade) | ✅ PASS |  |
| Pita prediksi TIU benar (Aman, pertahankan) | ✅ PASS |  |
| Prediksi TKP memakai skor MENTAH simulasi (225 dari 225, tanpa skala) | ✅ PASS |  |
| Selisih prediksi TKP benar (69 poin di atas passing grade) | ✅ PASS |  |
| Pita prediksi TKP benar (Aman, pertahankan) | ✅ PASS |  |
| Ringkasan sumber menyebut 1 simulasi CAT dan 1 tryout mini | ✅ PASS | Dari 1 simulasi CAT dan 1 tryout mini, terakhir 15 Nov 2026TWKTes Wawasan KebangsaanAman, pertahankanTWK 125 dari 150Passing grade: 65 · 60 poin di atas passing gradeNaik 110 poin dari tryout sebelumnya |
| Kalimat jujur versi simulasi tampil | ✅ PASS |  |
| Tren TWK benar (Naik 110 poin dari tryout sebelumnya.) | ✅ PASS |  |
| Tren TIU benar (Naik 157,5 poin dari tryout sebelumnya.) | ✅ PASS |  |
| Tren TKP benar (Naik 126 poin dari tryout sebelumnya.) | ✅ PASS |  |
| Kartu tryout terakhir menampilkan simulasi (total /550 + label Simulasi CAT 110 soal) | ✅ PASS |  |
| Panel ringkas dashboard menampilkan skor mentah simulasi | ✅ PASS | TWK 125 dari 150 \| TIU 175 dari 175 \| TKP 225 dari 225 |
| Panel ringkas menyebut sumber simulasi CAT | ✅ PASS |  |
| Showcase lencana menampilkan 'Pejuang CAT' sebagai diraih | ✅ PASS |  |
| Showcase lencana menampilkan 'Lolos Simulasi' sebagai diraih | ✅ PASS |  |

## Konfirmasi drill

| Cek | Hasil | Bukti |
|---|---|---|
| Modal "Akhiri sesi drill ini?" muncul + menyebut bonus hilang | ✅ PASS |  |
| "Lanjut latihan" menutup modal, masih di drill | ✅ PASS |  |
| "Ya, akhiri" kembali ke halaman Latihan | ✅ PASS |  |

## Mobile

| Cek | Hasil | Bukti |
|---|---|---|
| Dashboard render + tanpa overflow | ✅ PASS | {"scrollW":390,"clientW":390,"overflow":false} |
| Bottom nav "Belajar" -> #/belajar, tanpa overflow | ✅ PASS | url=http://127.0.0.1:4211/Lolosin/#/belajar overflow=false scrollW=390 |
| Bottom nav "Latihan" -> #/latihan, tanpa overflow | ✅ PASS | url=http://127.0.0.1:4211/Lolosin/#/latihan overflow=false scrollW=390 |
| Bottom nav "Tryout" -> #/tryout, tanpa overflow | ✅ PASS | url=http://127.0.0.1:4211/Lolosin/#/tryout overflow=false scrollW=390 |
| Bottom nav "Main" -> #/main, tanpa overflow | ✅ PASS | url=http://127.0.0.1:4211/Lolosin/#/main overflow=false scrollW=390 |
| Bottom nav "Beranda" -> #/, tanpa overflow | ✅ PASS | url=http://127.0.0.1:4211/Lolosin/#/ overflow=false scrollW=390 |
| Detail dokumen tanpa overflow | ✅ PASS |  |
| Seksi materi tanpa overflow | ✅ PASS |  |
| Tabel pangkat tanpa overflow halaman | ✅ PASS | scrollW=390 |
| Drill dimulai, tanpa overflow | ✅ PASS |  |
| Panel pembahasan muncul di drill mobile | ✅ PASS |  |
| Tryout dimulai (timer tampil), tanpa overflow | ✅ PASS |  |
| Tryout (palet + soal) tanpa overflow | ✅ PASS | scrollW=390 |
| Halaman hasil tryout tampil + tanpa overflow | ✅ PASS | h1: Belum lulus, terus berlatih ya! \| scrollW=390 |

## Simulasi mobile

| Cek | Hasil | Bukti |
|---|---|---|
| Dua kartu mode tampil di mobile (kilat + simulasi 110 soal) | ✅ PASS |  |
| Halaman pilih mode tanpa overflow (390px) | ✅ PASS |  |
| Timer simulasi 100:00 di mobile | ✅ PASS | timer: 100:00 |
| Palet 110 soal tampil di mobile | ✅ PASS | 110 tombol palet |
| Sesi simulasi tanpa overflow (390px) | ✅ PASS |  |
| Modal "Batalkan tryout ini?" muncul + menyebut jawaban hilang | ✅ PASS |  |
| "Lanjut mengerjakan" menutup modal, timer masih jalan | ✅ PASS |  |
| Batalkan kembali ke halaman pilih mode | ✅ PASS |  |

## Fase 3 mobile

| Cek | Hasil | Bukti |
|---|---|---|
| Kartu ulas menampilkan 3 soal jatuh tempo | ✅ PASS |  |
| Kartu fokus menampilkan Deret Tabel 4 benar dari 10 | ✅ PASS |  |
| Panel ringkas menampilkan skor terskala seed (TWK 66, TIU 87,5, TKP 180) | ✅ PASS |  |
| Dashboard seeded tanpa overflow (390px) | ✅ PASS | {"scrollW":390,"clientW":390,"overflow":false} |
| Mode ulas terbuka di mobile (Soal 1 dari 3) | ✅ PASS | http://127.0.0.1:4211/Lolosin/#/latihan/ulas |
| Judul Ulas Soal tidak tertutup header (gulir ke atas) | ✅ PASS | scrollY=0 h1.y=117 header.h=65 |
| Mode ulas tanpa overflow (390px) | ✅ PASS |  |

## Bujuk Osi

| Cek | Hasil | Bukti |
|---|---|---|
| Kartu "Bujuk Osi" tampil saat streak putus (v2.2.1) | ✅ PASS |  |
| Osi ngambek: kalimat sewot tampil di hero (v2.2.1) | ✅ PASS |  |
| Aturan revive dijelaskan jujur (v2.2.1) | ✅ PASS |  |
| Store: streak 0 + streakBroken 5 tersimpan (v2.2.1) | ✅ PASS | {"streak":0,"broken":{"lostStreak":5}} |
| Ketuk "Bujuk Osi" mengarah ke Latihan (v2.2.1) | ✅ PASS |  |
| Revive via drill: streak pulih ke 5 + broken state hilang (v2.2.1) | ✅ PASS | {"streak":5,"broken":null} |
| Setelah revive: kartu Bujuk hilang + Osi normal lagi (v2.2.1) | ✅ PASS |  |
| Belajar tanpa membujuk: streak mulai dari 1 + broken state hilang (v2.2.1) | ✅ PASS | {"streak":1,"broken":null} |
| Setelah belajar biasa: kartu Bujuk hilang (v2.2.1) | ✅ PASS |  |

## Simulasi seeded

| Cek | Hasil | Bukti |
|---|---|---|
| Panel ringkas menampilkan skor mentah seed (TWK 70, TIU 85, TKP 160) | ✅ PASS |  |
| Ringkasan sumber: Dari 1 simulasi CAT | ✅ PASS |  |
| Kalimat jujur versi simulasi tampil | ✅ PASS |  |
| Kartu tryout terakhir menampilkan 315/550 + label Simulasi CAT 110 soal | ✅ PASS |  |
| Riwayat menampilkan entri full (Simulasi CAT, total 315/550) | ✅ PASS |  |
| Halaman hasil dari riwayat full menampilkan total 315/550 | ✅ PASS |  |
| Halaman hasil dari riwayat menampilkan benar 14/30, 17/35, 32/45 | ✅ PASS |  |
| Halaman hasil dari riwayat tanpa breakdown (tanpa state soal) | ✅ PASS |  |

## Migrasi

| Cek | Hasil | Bukti |
|---|---|---|
| Key legacy dipindah ke guest key + legacy dihapus (v2.2.1) | ✅ PASS | {"legacyAda":false,"xp":777,"streak":4} |
| Progres lama tampil setelah migrasi (777 XP, streak 4) (v2.2.1) | ✅ PASS |  |

## Supabase placeholder

| Cek | Hasil | Bukti |
|---|---|---|
| /auth tampil dengan penjelasan fitur akun belum aktif | ✅ PASS |  |
| /auth placeholder tanpa form (tidak ada input email/password) | ✅ PASS |  |
| /auth placeholder tanpa overflow | ✅ PASS |  |
| Tombol Balik ke beranda kembali ke dashboard | ✅ PASS | http://127.0.0.1:4211/Lolosin/#/ |
| /leaderboard tampil dengan state belum aktif | ✅ PASS |  |
| /leaderboard placeholder tanpa tombol Muat ulang (by design: belum ada yang dimuat) | ✅ PASS |  |
| /leaderboard placeholder tanpa overflow | ✅ PASS |  |
| CTA Latihan dulu aja mengarah ke #/tryout | ✅ PASS | http://127.0.0.1:4211/Lolosin/#/tryout |
| Top nav punya 7 item incl Main + Peringkat + Formasi (desktop, v2.3) | ✅ PASS | Beranda \| Belajar \| Latihan \| Tryout \| Main \| Peringkat \| Formasi |
| Top nav Peringkat mengarah ke #/leaderboard (desktop, v2) | ✅ PASS | http://127.0.0.1:4211/Lolosin/#/leaderboard |
| Top bar: pill XP + streak tampil, tanpa pill akun (AuthStatus null) | ✅ PASS | 0 XP · Lv 1 \| 0 hari |
| Nol request ke supabase.co di mode placeholder | ✅ PASS | 0 request |
| Mobile: /leaderboard state belum aktif, tanpa overflow | ✅ PASS |  |
| Mobile: bottom nav 6 item incl Main + Peringkat (v2.2) | ✅ PASS | Beranda \| Belajar \| Latihan \| Tryout \| Main \| Peringkat |
| Mobile: nav Peringkat ke #/leaderboard, tanpa overflow | ✅ PASS | http://127.0.0.1:4211/Lolosin/#/leaderboard |
| Mobile: top bar pill XP + streak, tanpa pill akun, tanpa overflow | ✅ PASS |  |
| Mobile: /auth penjelasan belum aktif, tanpa overflow | ✅ PASS |  |

## Landing

| Cek | Hasil | Bukti |
|---|---|---|
| Hero marketing tampil (H1 baru + CTA Daftar gratis, v2.1) | ✅ PASS |  |
| Strip lama "Belajar nggak sendirian" dihapus (v2.1) | ✅ PASS |  |
| Fitur disebut tanpa angka soal/materi | ✅ PASS |  |
| Seksi Free vs Premium tampil (premium segera hadir) | ✅ PASS |  |
| CTA penutup tampil | ✅ PASS |  |
| Dashboard tidak tampil saat belum login | ✅ PASS |  |
| Landing tanpa overflow (desktop) | ✅ PASS |  |
| Seksi gamifikasi tampil (aria-label Fitur gamifikasi, v2.1) | ✅ PASS |  |
| Bento gamifikasi 7 kartu preview (v2.1) | ✅ PASS | 7 kartu |
| Pill "Contoh tampilan" tampil (v2.1) | ✅ PASS |  |
| Preview level/XP contoh tampil (Level 7 · Ksatria SKD, 2.150 XP, v2.1) | ✅ PASS |  |
| Tangga gelar + placeholder leaderboard tampil ("Kamu di sini", "Kamu?", v2.1) | ✅ PASS |  |
| Osi tampil di hero landing (v2.2) | ✅ PASS |  |
| Osi hero landing besar (lebar ~240px, v2.2) | ✅ PASS | lebar 259px |
| Nama "Osi" terlihat di hero, teks "maskot Lolosin" sudah dihapus (v2.2.1) | ✅ PASS |  |
| Seksi "Kenalan, ini Osi!" tampil (v2.2) | ✅ PASS |  |
| Maskot interaktif: balon ucapan berganti saat ditekan (v2.2) | ✅ PASS |  |
| Kartu .reveal muncul saat digulir (opacity 0 -> 1, v2.1) | ✅ PASS | opacity 0 -> 1 |
| Mobile: landing tampil tanpa overflow | ✅ PASS |  |
| Mobile: Osi + seksi gamifikasi + seksi Kenalan tampil (v2.2) | ✅ PASS |  |

## Supabase form

| Cek | Hasil | Bukti |
|---|---|---|
| Top bar mode configured (tamu): tombol Masuk + Daftar tampil | ✅ PASS |  |
| /auth form mode Masuk tampil (fake configured) | ✅ PASS |  |
| Tombol Masuk dengan Google tampil (v2.2) | ✅ PASS |  |
| Password default tersembunyi + tombol mata ada (v2.2.1) | ✅ PASS |  |
| Ketuk mata: password terlihat + label jadi Sembunyikan (v2.2.1) | ✅ PASS |  |
| Ketuk lagi: password tersembunyi kembali (v2.2.1) | ✅ PASS |  |
| Toggle ke Daftar: h1 Daftar + field username tampil, tanpa formasi (v2.2) | ✅ PASS |  |
| Validasi daftar: username terlalu pendek ditolak | ✅ PASS |  |
| Validasi daftar: username karakter tidak valid ditolak | ✅ PASS |  |
| Toggle kembali ke Masuk: h1 Masuk, field username hilang | ✅ PASS |  |
| Validasi masuk: submit kosong menampilkan error email + password | ✅ PASS |  |
| Validasi masuk: email tidak valid ditolak | ✅ PASS |  |
| Validasi masuk: password < 6 karakter ditolak | ✅ PASS |  |
| Submit valid gagal network: pesan ramah tampil, tetap di /auth, tanpa crash | ✅ PASS | Ada yang salah, coba lagi ya. |
| /leaderboard configured: banner tamu + tombol Muat ulang ada | ✅ PASS |  |
| /leaderboard configured: juara minggu lalu empty state | ✅ PASS |  |
| /leaderboard configured: ranking minggu ini empty state (fetch gagal diblokir -> []) | ✅ PASS |  |
| /leaderboard configured tanpa overflow | ✅ PASS |  |
| Klik Muat ulang: halaman tetap tampil tanpa crash | ✅ PASS |  |
| /profil tamu dialihkan ke /auth (v2.2) | ✅ PASS | http://127.0.0.1:4212/Lolosin/#/auth |

## Game hub

| Cek | Hasil | Bukti |
|---|---|---|
| Hub Main tampil: 5 kartu game (v2.2.1) | ✅ PASS |  |
| Tamu: ajakan masuk untuk Battle/Sesi (v2.2) | ✅ PASS |  |
| Hub tanpa overflow (v2.2) | ✅ PASS |  |
| Kuis Kilat terbuka untuk tamu (v2.2) | ✅ PASS |  |
| Kuis Kilat dimulai: soal tampil (v2.2) | ✅ PASS |  |
| Kartu Kilat terbuka untuk tamu (v2.2.1) | ✅ PASS |  |
| Kartu Kilat dimulai: kartu 1 dari 20 tampil (v2.2.1) | ✅ PASS |  |
| Kartu dibalik: tombol Hafal/Belum muncul (v2.2.1) | ✅ PASS |  |
| Tandai Hafal: lanjut kartu 2 + tersimpan lokal (v2.2.1) | ✅ PASS | 1 id hafal |
| Akhiri sesi kembali ke layar awal + badge 1 hafal (v2.2.1) | ✅ PASS |  |
| Benar/Salah Kilat terbuka untuk tamu (v2.2.1) | ✅ PASS |  |
| Benar/Salah dimulai: klaim + tombol Benar/Salah + timer (v2.2.1) | ✅ PASS |  |
| Jawab Benar: lanjut ke pernyataan 2 (v2.2.1) | ✅ PASS |  |
| Battle tamu: ajakan login tampil (v2.2) | ✅ PASS |  |
| Sesi tamu: ajakan login tampil (v2.2) | ✅ PASS |  |

## Layout

| Cek | Hasil | Bukti |
|---|---|---|
| Footer punya identitas sendiri: bg gelap + border atas amber (v2.2.1) | ✅ PASS |  |
| Footer tetap berisi navigasi + copyright (v2.2.1) | ✅ PASS |  |
| Tombol jump sembunyi di posisi atas (v2.2.1) | ✅ PASS |  |
| Tombol jump muncul setelah scroll (v2.2.1) | ✅ PASS |  |
| Tombol "Ke bawah" menggulir ke dasar (v2.2.1) | ✅ PASS | scrollY 4289 dari maks 4330 |
| Tombol "Ke atas" menggulir ke atas (v2.2.1) | ✅ PASS | scrollY 5 |
| Mobile: tombol jump muncul setelah scroll (v2.2.1) | ✅ PASS |  |
| Mobile: tombol jump tidak menumpuk bottom nav (v2.2.1) | ✅ PASS | jump bawah 764px, nav atas 771px |

## Formasi

| Cek | Hasil | Bukti |
|---|---|---|
| Nav desktop Formasi mengarah ke #/formasi (tamu, v2.3) | ✅ PASS |  |
| Banner beta + label Data contoh tampil (v2.3) | ✅ PASS |  |
| Banner menyebut SSCASN + peringatan situs palsu (v2.3) | ✅ PASS |  |
| Jumlah hasil awal 34 dari 34 + 34 kartu (v2.3) | ✅ PASS | 34 kartu |
| Filter provinsi NTB: 6 hasil (v2.3) | ✅ PASS |  |
| Reset filter mengembalikan 34 hasil (v2.3) | ✅ PASS |  |
| Cari "dokter": 2 hasil (v2.3) | ✅ PASS |  |
| Filter kualifikasi S1 Hukum: 4 hasil (v2.3) | ✅ PASS |  |
| Filter gaji minimal Rp6 jt: 4 hasil (v2.3) | ✅ PASS |  |
| Filter instansi Kemenkeu: 3 hasil (v2.3) | ✅ PASS |  |
| Filter jenis instansi daerah: 11 hasil (v2.3) | ✅ PASS |  |
| Empty state tampil saat filter tidak menemukan apa-apa (v2.3) | ✅ PASS |  |
| Reset dari empty state mengembalikan 34 hasil (v2.3) | ✅ PASS |  |
| Detail expand: unit penempatan + tautan SSCASN tampil (v2.3) | ✅ PASS |  |
| Halaman formasi tanpa overflow (desktop, v2.3) | ✅ PASS |  |
| Tautan footer Formasi mengarah ke #/formasi (v2.3) | ✅ PASS |  |
| Mobile: halaman formasi tampil tanpa overflow (v2.3) | ✅ PASS |  |
| Mobile: filter provinsi NTB berfungsi (v2.3) | ✅ PASS |  |
| Dashboard: kartu teaser formasi tampil berlabel beta (v2.3) | ✅ PASS |  |
| Dashboard: teaser mengarah ke #/formasi (v2.3) | ✅ PASS |  |

## Materi Baru

| Cek | Hasil | Bukti |
|---|---|---|
| index.json: 19 dokumen, 284 seksi, 77.575 kata (v2.5 readability) | ✅ PASS | 19 dokumen, 284 seksi, 77575 kata |
| Semua seksi punya poin_inti 3-5 butir (v2.5) | ✅ PASS | 284 seksi, tanpa poin_inti: 0 |
| Tidak ada baris tembok >600 karakter di konten manapun (v2.5) | ✅ PASS | tembok: 0 |
| Tidak ada em-dash di konten/poin_inti (v2.5) | ✅ PASS | em-dash: 0 |
| index.json memuat 2 dokumen baru (v2.3.1) | ✅ PASS |  |
| tiu-analogi-verbal kini 4 seksi (s04 analogi tiga kata, v2.3.1) | ✅ PASS | 4 seksi, 1660 kata |
| Daftar Belajar memuat 2 dokumen baru (v2.3.1) | ✅ PASS |  |
| Dokumen TKP baru terbuka: 12 seksi, tanpa baris Sumber (v2.3.1) | ✅ PASS | h1: Karakter dan Perilaku Kerja ASN \| 12 kartu seksi |
| Seksi TKP Integritas: tabel dasar hukum jadi bullet, tanpa atribusi/URL (v2.3.1) | ✅ PASS | 8302 karakter |
| Seksi TKP Integritas tanpa overflow (desktop, v2.3.1) | ✅ PASS |  |
| Dokumen TWK baru terbuka: 2 seksi (v2.3.1) | ✅ PASS | h1: Integritas dan Pilar Negara \| 2 kartu seksi |
| Seksi Pilar Negara: substansi MK ada, atribusi situs dibuang (v2.3.1) | ✅ PASS |  |
| Seksi Analogi Tiga Kata tampil + isi lengkap (v2.3.1) | ✅ PASS | 8860 karakter |
| Mobile: seksi baru tampil tanpa overflow (v2.3.1) | ✅ PASS |  |

## Dashboard v2.3.2

| Cek | Hasil | Bukti |
|---|---|---|
| PetCard di kolom kiri di bawah kartu streak (v2.3.2) | ✅ PASS | streak x=34 b=734 \| pet x=34 t=759 r=627 \| misi x=653 |
| Picker outfit: 5 tombol gaya tampil (v2.3.2) | ✅ PASS | 5 tombol |
| Streak 0: hanya Polos aktif, Syal/Kacamata terkunci (v2.3.2) | ✅ PASS |  |
| Syarat outfit terkunci tampil ("streak 3 hari") (v2.3.2) | ✅ PASS |  |
| Grid teaser 3 kolom di lg (v2.3.2) | ✅ PASS | 3 kolom |
| Misi harian tetap tampil 3 misi (v2.3.2) | ✅ PASS | 3 kartu misi |
| Dashboard tanpa overflow (desktop, v2.3.2) | ✅ PASS |  |
| Streak 7: Kacamata terbuka, Mahkota masih terkunci (v2.3.2) | ✅ PASS |  |
| Pilih Syal: aria-pressed + tersimpan di localStorage (v2.3.2) | ✅ PASS | aria-pressed=true, storage=syal |
| Pilihan outfit bertahan setelah reload (v2.3.2) | ✅ PASS | aria-pressed=true |
| Tombol Bagikan foto + Bagikan teks tampil (v2.3.2) | ✅ PASS |  |
| Bagikan foto mengunduh PNG kartu 1080x1350 (v2.3.2) | ✅ PASS | osi-streak-lolosin.png, 265 KB, 1080x1350 |
| Status "Foto tersimpan" tampil setelah unduh (v2.3.2) | ✅ PASS |  |
| Mobile: dashboard tanpa overflow (v2.3.2) | ✅ PASS |  |
| Mobile: PetCard muat penuh dalam viewport (v2.3.2) | ✅ PASS | x=16..374 / 390 |

## Avatar + Notifikasi v2.3.4

| Cek | Hasil | Bukti |
|---|---|---|
| Mode tamu: lonceng tidak tampil (v2.3.4) | ✅ PASS |  |
| Default: hero Osi varian wisuda, topi tampil (v2.3.4) | ✅ PASS | {"topi":true,"headphone":false,"kacamata":false} |
| Ketuk Osi: balon ucapan berganti (v2.3.4) | ✅ PASS | "Aku nemenin kamu belajar hari ini!" -> "Kamu bisa, gas terus!" |
| Varian musik: hero tanpa topi + headphone tampil (v2.3.4) | ✅ PASS | {"topi":false,"headphone":true,"kacamata":false} |
| Varian musik: PetCard tetap pakai topi (v2.3.4) | ✅ PASS | topi di PetCard: true |
| Varian musik: Mascot dekoratif Tryout tetap pakai topi (v2.3.4) | ✅ PASS | topi: true |
| Varian musik: Mascot dekoratif Fokus tetap pakai topi (v2.3.4) | ✅ PASS | topi: true |
| Varian kacamata + streak putus: kacamata + topi tampil di hero (v2.3.4) | ✅ PASS | {"topi":true,"headphone":false,"kacamata":true} |
| Varian kacamata + streak putus: Osi ngambek, mood marah menang (v2.3.4) | ✅ PASS |  |
| Mobile varian musik: hero tanpa topi + headphone tampil (v2.3.4) | ✅ PASS | {"topi":false,"headphone":true,"kacamata":false} |
| Mobile: dashboard tanpa overflow (v2.3.4) | ✅ PASS |  |
| Mobile mode tamu: lonceng tidak tampil (v2.3.4) | ✅ PASS |  |

## Request Supabase diblokir by-design (bukan cacat app)

Run fake-configured (section 11) memblokir semua request ke `*.supabase.co` lewat route interception Playwright supaya tidak ada panggilan API live. 17 request diblokir (supabase-js me-retry fetch gagal beberapa kali dengan backoff, jadi satu load bisa memunculkan beberapa percobaan), masing-masing juga memunculkan console error browser `Failed to load resource: net::ERR_FAILED` (17 console error, lokasi URL supabase.co):

- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/auth/v1/token?grant_type=password — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-qa-lolosin.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`

## Screenshot

- `qa-lolosin/screenshots/01-dashboard-desktop.png`
- `qa-lolosin/screenshots/02-belajar-seksi-twk.png`
- `qa-lolosin/screenshots/03-belajar-tabel-pangkat.png`
- `qa-lolosin/screenshots/04-latihan-hasil-drill1.png`
- `qa-lolosin/screenshots/05-tryout-hasil.png`
- `qa-lolosin/screenshots/06-mobile-dashboard.png`
- `qa-lolosin/screenshots/07-mobile-drill.png`
- `qa-lolosin/screenshots/08-mobile-tryout-hasil.png`
- `qa-lolosin/screenshots/d-full-numerik-s06.png`
- `qa-lolosin/screenshots/d-pembahasan-materi-332.png`
- `qa-lolosin/screenshots/d-pembahasan-materi-333.png`
- `qa-lolosin/screenshots/d-tiu-handbook-figural-s02.png`
- `qa-lolosin/screenshots/d-tiu-handbook-figural-s06.png`
- `qa-lolosin/screenshots/d-tiu-handbook-numerik-s02.png`
- `qa-lolosin/screenshots/d-tiu-handbook-numerik-s06.png`
- `qa-lolosin/screenshots/d-tiu-handbook-verbal-s03.png`
- `qa-lolosin/screenshots/d-tiu-handbook-verbal-s05.png`
- `qa-lolosin/screenshots/d-tiu-modul-s10.png`
- `qa-lolosin/screenshots/d-twk-modul-ringkasan-s58.png`
- `qa-lolosin/screenshots/d-twk-rangkuman-temenasn-s01.png`
- `qa-lolosin/screenshots/d-twk-rangkuman-temenasn-s03.png`
- `qa-lolosin/screenshots/fase3-qa-01-dashboard-fokus-desktop.png`
- `qa-lolosin/screenshots/fase3-qa-02-mode-ulas-desktop.png`
- `qa-lolosin/screenshots/fase3-qa-03-panel-prediksi-hasil.png`
- `qa-lolosin/screenshots/fase3-qa-04-dashboard-mobile-seeded.png`
- `qa-lolosin/screenshots/fase3-qa-05-mode-ulas-mobile.png`
- `qa-lolosin/screenshots/m-numerik-s06.png`
- `qa-lolosin/screenshots/m-temenasn-s03.png`
- `qa-lolosin/screenshots/simulasi-qa-01-pilih-mode-desktop.png`
- `qa-lolosin/screenshots/simulasi-qa-02-simulasi-jalan-desktop.png`
- `qa-lolosin/screenshots/simulasi-qa-03-hasil-simulasi-full.png`
- `qa-lolosin/screenshots/simulasi-qa-04-simulasi-jalan-mobile.png`
- `qa-lolosin/screenshots/simulasi-qa-05-pilih-mode-mobile.png`
- `qa-lolosin/screenshots/simulasi-qa-06-hasil-seeded-full.png`
- `qa-lolosin/screenshots/simulasi-qa-07-dashboard-setelah-simulasi.png`
- `qa-lolosin/screenshots/supabase-qa-01-auth-placeholder-desktop.png`
- `qa-lolosin/screenshots/supabase-qa-02-leaderboard-placeholder-desktop.png`
- `qa-lolosin/screenshots/supabase-qa-03-leaderboard-placeholder-mobile.png`
- `qa-lolosin/screenshots/supabase-qa-04-bottomnav-mobile.png`
- `qa-lolosin/screenshots/supabase-qa-05-topbar-desktop.png`
- `qa-lolosin/screenshots/supabase-qa-06-auth-masuk-fake.png`
- `qa-lolosin/screenshots/supabase-qa-07-auth-daftar-fake.png`
- `qa-lolosin/screenshots/supabase-qa-08-auth-validasi-fake.png`
- `qa-lolosin/screenshots/supabase-qa-09-leaderboard-configured-fake.png`
- `qa-lolosin/screenshots/supabase-qa-10-auth-placeholder-mobile.png`
- `qa-lolosin/screenshots/v21-dashboard-desktop.png`
- `qa-lolosin/screenshots/v21-dashboard-mobile.png`
- `qa-lolosin/screenshots/v21-landing-desktop.png`
- `qa-lolosin/screenshots/v21-landing-full-desktop.png`
- `qa-lolosin/screenshots/v21-landing-mobile.png`
- `qa-lolosin/screenshots/v22-kuis-kilat-desktop.png`
- `qa-lolosin/screenshots/v22-main-hub-desktop.png`
- `qa-lolosin/screenshots/v221-benar-salah-desktop.png`
- `qa-lolosin/screenshots/v221-bujuk-osi-revive.png`
- `qa-lolosin/screenshots/v221-kartu-kilat-desktop.png`
- `qa-lolosin/screenshots/v23-formasi-desktop.png`
- `qa-lolosin/screenshots/v23-formasi-mobile.png`
- `qa-lolosin/screenshots/v231-materi-mobile.png`
- `qa-lolosin/screenshots/v231-materi-tkp-integritas.png`
- `qa-lolosin/screenshots/v232-dashboard-desktop.png`
- `qa-lolosin/screenshots/v232-dashboard-mobile.png`
- `qa-lolosin/screenshots/v232-dashboard-seed.png`
- `qa-lolosin/screenshots/v234-hero-default.png`
- `qa-lolosin/screenshots/v234-hero-kacamata-putus.png`
- `qa-lolosin/screenshots/v234-hero-musik-mobile.png`
- `qa-lolosin/screenshots/v234-hero-musik.png`
