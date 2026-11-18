# QA Lokal Lolosin - 2026-11-18 (v2.9-parse: full parse 3 sumber Drive + materi UUD 1945)

**Target:** http://127.0.0.1:4237/ (placeholder) + http://127.0.0.1:4238/ (fake Supabase), build dari worktree `~/workspace/lolosin-v29parse` branch `v2.9-parse`.
**Metode:** Playwright + Chromium headless di VM. Script: `~/workspace/qa-lolosin/qa-v29parse.mjs` (adaptasi qa-v283.mjs). Screenshot: `~/workspace/qa-lolosin/screenshots-v29parse/`. Laporan lengkap harness: `~/workspace/qa-lolosin/qa-v29parse-report.md`.

## Verdict: SIAP

Total cek: **796** | PASS: **796** | FAIL: **0** | SKIP: **50** (tercatat dengan alasan, pola sama seperti v2.8.3) | Console error (non-lingkungan): 0 | Page error: 0 | Request gagal/>=400 (non-lingkungan): 0 | Console warning: 0

`tsc -b`: 0 error (bagian dari `npm run build`, dua build: placeholder + fake).

## Isi rilis ini (base de40af2, 8 commit)

### Soal baru: 272

| Sumber | Jumlah | ID | Catatan |
|---|---|---|---|
| FR CPNS LENGKAP (274 butir TWK) | 254 | fr-001..fr-274 (minus yang dikecualikan) | Opsi ditulis dari nol, kunci + pembahasan per opsi, fakta diverifikasi per butir |
| UUD 1945 kelompok pasal | 12 | uud-001..uud-012 | Soal orisinal, kunci terverifikasi |
| Seri 1-8 (soal baru yang bersih) | 6 | seri-baru-001..002, seri-baru-101..104 | Hanya yang bersih; sisanya sudah ada di bank atau cacat sumber |

Butir FR yang dikecualikan (20): duplikat bank, terlalu samar, atau faktanya tidak bisa diverifikasi. fr-191 dibuang koordinator karena duplikat uud-011 (soal anggaran pendidikan 20 persen yang sama persis).

### Kunci + pembahasan baru

- HOTS CATBKN 2023: **97 kunci + pembahasan per opsi** ditambahkan ke soal catbkn-2023 yang tadinya tanpa kunci (hitung ulang yang numerik). 9 soal catbkn-2023 tetap tanpa kunci: 7 cacat sumber + 2 ambigu (catbkn-2023-52 dua opsi benar sekaligus, catbkn-2023-43 kunci bertumpu pada asumsi hari Senin yang tidak dipaksa soal).
- Seri 1-8: **758 pembahasan di-upgrade** ke standar per opsi (Seri 1-4: 382, Seri 5-8: 376).

### Perbaikan kunci dan bobot (semua dengan bukti)

- Bankfix sampel (disetujui): komunitas-830 kunci D ke C (median, hitung ulang membuktikan C 19) + opsi komunitas-61 diperbaiki (teks sampah).
- Seri-A: **14 kunci bank diperbaiki** (bukti: pembahasan sumber sendiri bertentangan dengan kuncinya, hitung ulang, atau kutipan konstitusi verbatim). 3 kunci sumber salah lainnya bank sudah benar (komunitas-248, 715, 731).
- Bobot TKP terbalik persis (salah transkripsi): komunitas-560 (Seri-B) dan komunitas-580 (Seri-A) diperbaiki ke bobot sumber; komunitas-956 C/D tertukar diperbaiki.
- Stem: komunitas-699 "PMPN" ke "PNPM"; catbkn-2023-39 typo "Ahtar" ke "Akhtar".

### Soal cacat yang dihapus: 4

Aturan bankfix: soal rusak dihapus. sslama-33 (tidak ada opsi tak baku), sslama-59 (jawaban P,V tidak ada di opsi), komunitas-796 (dua pengecualian valid), komunitas-740 (dua jawaban benar + stem kehilangan konteks bacaan).

### Materi baru: UUD 1945 per Kelompok Pasal

Dokumen baru `twk-uud-1945-kelompok-pasal` (12 seksi, 4.133 kata, lengkap pasal 1-37, tabel pengelompokan pasal, poin_inti 3-5 butir per seksi). Wording orisinal Lolosin (bukan salinan thread @persiapanskd); isi pasal diverifikasi per pasal terhadap teks MPR. Total materi: **21 dokumen, 308 seksi, 86.945 kata**.

## Bank akhir

| Metrik | Sebelum | Sesudah |
|---|---|---|
| Total soal | 8.979 | **9.247** |
| Quiz-usable (punya kunci) | 8.360 | **8.725** |
| Tanpa kunci | 619 | **522** |
| Quiz-usable tanpa pembahasan | 0 | **0** |
| TWK / TIU / TKP | 2.929 / 4.033 / 2.017 | **3.195 / 4.035 / 2.017** |

Master kanonis `~/workspace/cpns/bank-soal/bank-soal.json` sudah disinkron ulang dari chunk (9.247, ID identik).

Verifikasi teks baru: 0 em-dash dan 0 kata "seksi" di semua soal baru, pembahasan baru, dan materi baru. Satu-satunya "seksi" di seluruh bank adalah "kepala seksi" di komunitas-650 (pengecualian yang diizinkan: nama jabatan).

## Temuan QA run 1 (791/796, 5 FAIL) dan perbaikan

1. **Tembok >600 karakter (cacat konten, diperbaiki):** 5 seksi materi UUD (s03, s04, s05, s06, s10) punya 8 baris konten lebih dari 600 karakter. Paragraf dipecah di batas kalimat/klausa di file sumber md tanpa mengubah satu kata pun; rebuild materi bersih (total kata tetap 86.945; hanya file UUD yang berubah).
2. **Drill-down TWK 4 ke 5 grup (ekspektasi harness kedaluwarsa):** grup ke-5 adalah doc UUD baru, tampil benar dengan judul "UUD 1945 per Kelompok Pasal". Ekspektasi harness diperbarui 4 ke 5 (dua cek).
3. **Sync merge streak 0 (seed harness kedaluwarsa, bukan bug app):** seed server memakai tanggal tetap 2026-11-15; pada 18 Nov aktivitas itu sudah 3 hari lalu sehingga normalisasi streak app (benar) mereset streak 20 ke 0. Seed diubah relatif terhadap hari ini (HARI_INI -1 / -2). Semua cek merge lain sudah PASS di run 1, membuktikan sesi fake dikenali.

## Catatan build (penting untuk worktree berikutnya)

Build pertama di worktree ini crash saat load (`TypeError: Cannot read properties of null (reading 'useState')`): bundle berisi React dua kali. Penyebabnya salinan `node_modules` dari repo utama `~/workspace/lolosin` (versi paket identik, tapi struktur symlink-nya membuat rolldown me-resolve React lewat dua jalur). Solusi: pakai `node_modules` dari worktree v2.8.3 (build bersih, 1 salinan React, terverifikasi). **Worktree berikutnya: salin node_modules dari `~/workspace/lolosin-v283` (atau fresh `npm install`), JANGAN dari `~/workspace/lolosin`.** Diverifikasi dengan rebuild sumber v2.8.3 (1 salinan) dan rebuild sumber v2.9-parse dengan node_modules v2.8.3 (1 salinan).

## Cacat bank yang ditemukan tapi belum diperbaiki (untuk ronde bankfix berikutnya)

- Opsi/stem terpotong atau rusak: komunitas-351, 628, 630, 638 (Seri-B), komunitas-809, 254, 245, 821, 738, 728, 824, 842, 775 (Seri-A).
- Stem kehilangan konteks bacaan: komunitas-227, 228, 255, 739, 741.
- Stem kehilangan superskrip: komunitas-246, 827. Stem menanyakan hal yang salah: komunitas-828.
- Soal cacat matematis: komunitas-340 (seri7-50).
- Salah ketik opsi/stem: komunitas-839, 795, 807, 812, 226.
- 15 butir meragukan Seri-A (diikuti kunci sumber, dicatat di laporan pekerja).
- 9 soal catbkn-2023 tetap tanpa kunci (lihat di atas).

Detail lengkap ada di laporan pekerja: `~/workspace/lolosin-v29parse-scratch/seri-a-report.md` dan `seri-b-report.md`.

## Yang belum dikerjakan di rilis ini

- Push ke GitHub: TIDAK dilakukan (butuh approval Dhinda saat hadir). Branch `v2.9-parse` di-merge ke `master` lokal saja; push gabungan (v2.5-v2.8.3 + v2.9-parse) perlu regenerasi manifest karena HEAD master berubah.
- Admin panel, rank sendiri di Peringkat, dan penutupan 2 celah keamanan pra-beta: diputuskan untuk versi setelah push gabungan.
