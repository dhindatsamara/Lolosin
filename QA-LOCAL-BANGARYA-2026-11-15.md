# QA Lokal — Tulis Ulang 6 Seksi Rangkuman Tabel TWK (v2.3.3)

Tanggal: 2026-11-15. Pelapor: user (screenshot seksi twk-bang-arya-s17
"Sembilan Nilai Integritas": tembok huruf kapital, tidak enak dibaca).
Perintah: tulis ulang 6 seksi lewat pipeline, verifikasi render di browser,
commit lokal. TIDAK menjalankan QA penuh (qa.mjs dipakai agen lain secara
paralel untuk iterasi dashboard v2.3.2); cek render memakai skrip mandiri
`~/workspace/qa-lolosin/cek-bangarya.mjs` (salinan di `/tmp/cek-bangarya.mjs`).

## Verdict: SIAP

Cek render: **43/43 PASS, 0 FAIL** (7 cek x 6 seksi + 1 cek mobile).
Rebuild: 18 dokumen lain byte-identik; ID 6 seksi tidak berubah.

## Sebelum vs sesudah (per seksi)

Semua seksi: huruf kapital semua hilang, `catatan` mind-map dihapus, typo
diperbaiki ("Indoneisia", "tumbuhm", "terintegritas", "BHINEKA TUNGGA IKA",
"Hamengkubuwana", "menyebrangi", "PERBE DAAN", "IIKUTI"). Format MarkdownLite:
subheading `##` + bullet/daftar bernomor + label **tebal**. Tanpa em-dash,
tanpa atribusi, tanpa URL.

| Seksi | Sebelum | Sesudah |
|---|---|---|
| s02 Poin Setiap Sila Pancasila (60 -> 99 kata) | 1 paragraf kapital: 5 nilai + makna menempel tanpa urutan | Daftar bernomor 5 sila: rumusan resmi + nilai + maknanya masing-masing |
| s08 Timeline UUD 1945 (291 -> 281 kata) | Paragraf kapital + ekor "NILAI DASAR BELA NEGARA" acak (angka liar "1"/"3" menempel) | 7 subheading per periode (UUD 1945, RIS 1949, UUDS 1950, kembali ke UUD 1945, Orde Baru, transisi, amandemen) + bullet berisi tanggal dan ciri tiap periode + kata kunci tebal. Ekor bela negara dibuang: materinya sudah ada di twk-keyword-bela-negara.json dkk. |
| s17 Sembilan Nilai Integritas (69 -> 166 kata) | "9NILAI INTEGRITAS DISIPLIN ADIL BERTANGGUNGJAWAB JUJUR TERDAPAT UNSUR..." (tembok kapital, definisi tertukar urutan) | Intro + akronim JUMAT BERSEPEDA KK + 3 kelompok (nilai inti / nilai sikap / nilai etos kerja), tiap nilai dengan definisi singkat |
| s25 Penggunaan Huruf Kapital (202 -> 201 kata) | Aturan kapital menempel tanpa kelompok, contoh tercampur | 3 kelompok (kapital di awal / kapital kalau diikuti nama / tidak kapital), tiap aturan + contoh dalam `kode` |
| s32 Prinsip Nasionalisme dan Bhinneka Tunggal Ika (122 -> 153 kata) | 5 prinsip + 4 definisi + fragmen "PERBE DAAN 01" kapital | 5 prinsip ber-bullet + subheading "Istilah yang sering tertukar" (nasionalisme/patriotisme/cinta tanah air/bela negara) + Bhinneka Tunggal Ika + prinsip *common denominator* |
| s37 NKRI dalam UUD 1945 (73 -> 148 kata) | 5 pasal/alinea kapital + fragmen "MIND MAP" | 5 subheading per pasal (Pasal 1 ayat 1, Pasal 18 ayat 1, Pasal 37 ayat 5, Alinea keempat, Pasal 31 ayat 1), masing-masing dengan isi + kutipan pasal + kata kunci tebal |

Total dokumen: 817 -> 1.048 kata. Total Belajar: 79.612 -> 79.843 kata
(19 dokumen, 284 seksi, 591 halaman tetap).

## Fakta yang dicek ulang (bukan karangan)

- 5 sila: rumusan resmi dari Pembukaan UUD 1945 alinea keempat (cek silang
  dengan file riset twk-pilar-negara.md).
- Timeline: KNIP memegang legislatif karena MPR/DPR belum terbentuk; 14 Nov
  1945 sistem berubah parlementer; RIS federasi; UUDS 1950 Demokrasi Liberal
  + kabinet silih berganti; Dekret 5 Juli 1959; Supersemar 11 Mar 1966;
  transisi Habibie s.d. lepasnya Timor Timur; amandemen 4x (1999, 2000,
  2001, 2002), Pembukaan tidak boleh diubah.
- 9 nilai KPK + akronim JUMAT BERSEPEDA KK + pengelompokan 3 aspek: dari
  file riset twk-integritas.md (ACLC/KPK/PejuangCPNS).
- Pasal: Pasal 1 ayat 1 ("Negara Indonesia ialah Negara Kesatuan, yang
  berbentuk Republik."), Pasal 18 ayat 1 (pembagian provinsi/kabupaten/kota),
  Pasal 37 ayat 5 (bentuk NKRI tidak dapat diubah), Pasal 31 ayat 1
  ("Setiap warga negara berhak mendapat pendidikan.").
- Huruf kapital: seluruh 16 aturan + contoh dipertahankan dari konten lama,
  hanya dikelompokkan dan diperbaiki ejaannya.

## Cara kerja (pipeline, bukan edit JSON manual)

- `BANG_ARYA_REWRITE` di `build_materi.py`: peta sid -> konten kurasi
  (sumber kanonis). `filter_doc_sections` mengganti konten 6 seksi, menghapus
  `catatan`, menghitung ulang kata; strip/clean dilewati untuk seksi kurasi.
- `verify_bang_arya_rewrite()` baru (dipanggil di main setelah
  `verify_baru_content`): gagalkan build bila ID berubah, `catatan` tersisa,
  ada "mind map"/em-dash/URL/atribusi, ada kata kapital semua di luar akronim
  sah (ACRONYMS + UUDS/JUMAT/BERSEPEDA/KNIP), atau seksi > 1500 kata.
- `catatan_kualitas` dokumen diperbarui (tidak lagi menyebut artefak tabel).
- Docstring modul + SCHEMA.md mencatat pengecualian tulis-ulang ini.
- Rebuild dengan `~/workspace/venv-materi` (pypdf==7.0.1, pin dipatuhi).

## Verifikasi rebuild

- 18 dokumen lain + inventaris.json: byte-identik dengan snapshot sebelum
  rebuild (`/tmp/bangarya-before/`). Hanya `twk-bang-arya.json` dan
  `index.json` berubah.
- ID 6 seksi, judul, subtopik: tidak berubah (progres baca aman).
- `catatan` mind-map: 0 tersisa. Em-dash di JSON baru: 0. Frasa "mind map": 0.
  URL/http: 0. Typo lama: 0.

## Verifikasi render (Playwright, server preview sendiri port 4195)

CATATAN: port 4193 ternyata sudah dipakai server QA agen lain (bundle lama,
konten lama ikut teruji di percobaan pertama: 25 FAIL). Pindah ke port 4195
dan pastikan bundle yang dilayani adalah hasil build baru (index-D-RDn6Lf.js)
sebelum menjalankan cek.

Per seksi (7 cek): judul benar; terstruktur (heading/list/tebal cukup);
tanpa tembok kapital (di luar akronim sah); tanpa "mind map"; tanpa em-dash;
tanpa overflow horizontal; tanpa console/page error. Plus 1 cek mobile 390px
(s17, tanpa overflow). Hasil: 43/43 PASS.

Struktur hasil render per seksi: s02 daftar bernomor 5 item + 5 label tebal;
s08 7 subheading + 7 list + 16 tebal; s17 3 subheading + 3 list + 10 tebal;
s25 3 subheading + 3 list + 15 tebal; s32 3 subheading + 2 list + 9 tebal;
s37 5 subheading + 7 tebal.

Screenshot (di /tmp): bangarya-twk-bang-arya-s02/s08/s17/s25/s32/s37.png
(full page desktop) + bangarya-s17-mobile.png. Screenshot s17 dan s08
diperiksa visual: subheading, bullet, dan label tebal tampil rapi, bukan
lagi tembok kapital.

## Yang TIDAK dilakukan

- QA penuh qa.mjs (sengaja dilewati: dipakai agen lain paralel).
- Push (menunggu parent verifikasi + user approve).
- File agen lain tidak disentuh (HomePage/PetCard/pet.ts/share.ts/qa.mjs).
