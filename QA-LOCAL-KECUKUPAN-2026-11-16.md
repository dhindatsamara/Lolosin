# QA Lokal Paket Kecukupan Data — 2026-11-16

**Verdict: SIAP — 47/47 PASS, 0 FAIL.** Paket konten (18 soal TIU
Kecukupan Data orisinal + cheat sheet TIU bagian ke-7) di branch
`konten-kecukupan-data` (worktree `~/workspace/lolosin-kecukupan`,
commit konten `17e089b`, tip branch `fdd3c9f`) lolos seluruh QA tertarget: bank, materi, build,
dan render Playwright. **0 bug app ditemukan** — tidak ada commit
perbaikan; working tree bersih di `17e089b`. Pasca-QA, koordinator
menambahkan satu commit metadata (`fdd3c9f`, lihat § Catatan
pasca-QA) yang tidak mengubah soal, kunci, atau isi materi.
Kunci ke-18 soal sudah
diverifikasi buta independen 18/18 COCOK (bukti terpisah, lihat
§ Verifikasi kunci), dan QA ini membuktikan soal yang terintegrasi
identik field-per-field dengan draft terverifikasi tersebut.
**Tidak ada commit, merge, atau push** (koordinator yang commit
laporan ini setelah merge).

| | |
|---|---|
| **Worktree** | `~/workspace/lolosin-kecukupan`, branch `konten-kecukupan-data` |
| **Commit konten** | `17e089b` + `fdd3c9f` (perbaikan metadata pasca-QA, lihat § Catatan pasca-QA; 0 commit perbaikan bug app — QA tidak menemukan bug) |
| **Base** | `1e2c39f` (HEAD push gabungan v2.5–v2.8) |
| **Script QA data** | `/tmp/qa-kecukupan.py` (26 cek bank + materi) |
| **Script QA render** | `~/workspace/qa-lolosin/qa-kecukupan-render.mjs` (13 cek Playwright, run 3 final) |
| **Script capture** | `~/workspace/qa-lolosin/qa-kecukupan-capture.mjs` (tangkap soal baru + verifikasi pembahasan) |
| **Laporan QA lengkap** | `~/workspace/qa-lolosin/qa-kecukupan-report.md` |
| **Screenshot** | `~/workspace/qa-lolosin/screenshots-kecukupan/` (4 file) |
| **Server QA** | port 4233 (`python3 -m http.server`, serve `dist/` worktree; port QA v2.8 4227/4228 tidak disentuh) |
| **Build** | `npm run build` (mencakup `tsc`) exit 0, env Supabase placeholder |

## Hasil QA (final)

| Kelompok | Cek | PASS | FAIL |
|---|---|---|---|
| Cakupan diff vs base `1e2c39f` | 1 | 1 | 0 |
| Bank soal + materi (script Python) | 26 | 26 | 0 |
| Section s01–s06 tak berubah vs base | 1 | 1 | 0 |
| Build (`npm run build`, mencakup tsc) | 1 | 1 | 0 |
| Konten baru di chunk hasil build | 3 | 3 | 0 |
| Render Playwright (run 3) | 13 | 13 | 0 |
| Capture soal baru + pembahasan | 2 | 2 | 0 |
| **Total** | **47** | **47** | **0** |

Console error (non-lingkungan): **0**. Page error: **0**.

## Ringkasan angka

- **Bank: 8.979 soal** (TIU 4.033; `questions-tiu-3.json` 343, dari
  325 + 18 baru). **ID unik di seluruh bank**, 0 duplikat.
- **Ke-18 soal baru quizable** (kunci + pembahasan + 5 opsi
  non-null), subtopik `Kecukupan Data`, materi TIU, sumber
  `Lolosin (orisinal)`. Distribusi kunci A 4, B 4, C 4, D 3, E 3.
- **Stem unik**: 0 duplikat di antara 18 soal baru; 0 duplikat
  persis dan 0 near-duplikat (Jaccard >= 0,90) vs 105 soal
  kecukupan data lama.
- **Kepatuhan**: 0 em-dash dan 0 kata "seksi" di konten baru
  (soal + cheat sheet s07 + poin inti), termasuk di halaman
  render s07.
- **Materi: 82.812 kata, 296 sections**, 20 dokumen.
  `tiu-cheat-sheet.json` 7 sections; s01–s06 byte-identik dengan
  base; s07 "Kecukupan Data" (+335 kata: 2.208 ke 2.543) dengan
  poin inti 5 butir, identik dengan draft `poin_inti-s07.txt`.
- **Diff vs base: hanya 4 file** — `questions-tiu-3.json`,
  `tiu-cheat-sheet.json`, `index.json`, `build_materi.py`
  (2 baris: entri daftar file + poin inti s07).
- **Build**: exit 0; ke-18 ID `kecukupan-001`–`kecukupan-018` ada
  di chunk `assets/questions-*.js`; `tiu-cheat-sheet-s07` ada di
  chunk `assets/index-*.js`.
- **Drill**: topik "Kecukupan Data" di halaman Latihan TIU
  menampilkan **112 soal (94 lama + 18 baru)**; peluang satu
  drill 10 soal memuat >= 1 soal baru = 84%.

## Verifikasi kunci (bukti independen, bukan diulang di QA ini)

Verifikasi buta independen oleh verifier terpisah
(`~/workspace/kecukupan-draft/VERIFIKASI-KUNCI.md`, 2026-11-16):
semua soal diselesaikan dari stem-nya saja tanpa melihat kunci
atau pembahasan penulis; semua hitungan dicek ulang dengan
Python (termasuk enumerasi untuk soal 003 dan 008).

- **COCOK: 18 dari 18. TIDAK COCOK: 0.**
- Semua hitungan di cheat sheet benar; semua pembahasan
  benar-benar membuktikan kuncinya (derivasi unik atau contoh
  tandingan eksplisit); semua angka di pembahasan terverifikasi.
- Tidak ada duplikasi dengan 105 soal lama (satu kemiripan
  tematik dicatat: kecukupan-013 vs
  jhar-cpns-skd-kisi-terbaru-230, Jaccard 0,65 — beda yang
  ditanya, beda pernyataan (2), beda kunci; dinilai bukan
  duplikat, tidak perlu perbaikan).
- Teks opsi A–E identik persis dengan rumusan yang sudah dipakai
  32 soal bank (seri tiu2026); 0 em-dash dan 0 kata "seksi" di
  semua file draft.

QA ini menambahkan mata rantai yang hilang: **ke-18 soal di
worktree identik field-per-field** (id, kunci, materi,
pembahasan, pilihan, soal, subtopik, sumber) dengan
`~/workspace/kecukupan-draft/questions.json` yang terverifikasi
itu, dan poin inti s07 identik dengan `poin_inti-s07.txt`.
Jadi kunci yang terverifikasi buta adalah kunci yang akan
masuk ke push gabungan.

## Render Playwright (run 3, 13/13 PASS)

| Cek | Hasil |
|---|---|
| s07: judul "Kecukupan Data" tampil | PASS |
| s07: PoinIntiCard dirender 2x by design (mobile + sidebar) | PASS |
| s07: kartu Poin inti terlihat dengan 5 butir | PASS |
| s07: poin inti memuat "ditentukan secara unik" | PASS |
| s07: konten memuat contoh x² = 36 | PASS |
| s07: konten memuat "Format lima opsi" | PASS |
| s07: konten memuat rumusan opsi A | PASS |
| s07: tanpa em-dash di halaman | PASS |
| Drill: baris topik "Kecukupan Data" ada di Latihan TIU | PASS |
| Drill: baris topik menampilkan 112 soal | PASS |
| Drill: soal baru tertangkap (kecukupan-006, soal ke-6, attempt 1) | PASS |
| 0 console error non-lingkungan | PASS |
| 0 page error non-lingkungan | PASS |

Capture tambahan (script terpisah): soal baru **kecukupan-008**
tertangkap di soal ke-6 attempt 1, dijawab dengan kunci yang
benar (E), feedback "Benar!" + 10 XP tampil, dan **teks
pembahasan yang tampil cocok dengan bank** (60 karakter pertama
terverifikasi; screenshot full page memperlihatkan seluruh
pembahasan + panel jawaban tiap opsi).

## Screenshot

`~/workspace/qa-lolosin/screenshots-kecukupan/`:

| File | Isi |
|---|---|
| `01-cheat-sheet-s07.png` | Halaman bagian s07 (judul, "Bagian 7 dari 7", konten + kartu Poin inti) |
| `01b-cheat-sheet-s07-full.png` | Halaman s07 full page |
| `02-drill-kecukupan-data.png` | Drill TIU · Kecukupan Data, soal baru kecukupan-008 (soal 6 dari 10) |
| `03-drill-pembahasan.png` | Pembahasan kecukupan-008 full page (jawaban E benar, panel tiap opsi, teks pembahasan) |

## Riwayat run render

| Run | Hasil | Catatan |
|---|---|---|
| 1 | 6 PASS, 3 FAIL | Semua FAIL adalah bug harness, bukan bug app: (a) Poin inti terhitung 10 karena kartu dirender 2x (mobile + sidebar); (b) ekspektasi string format opsi salah (konten memakai huruf kecil "pernyataan (1) saja cukup"); (c) locator topik salah mengklik "Semua topik TIU" sehingga 4 drill semuanya campuran TIU (40 soal, 0 soal baru — wajar, peluangnya ~4%). |
| 2 | 12 PASS, 1 FAIL | Satu FAIL harness: locator `:visible` pada PoinIntiCard mengambil turunan pertama (judul), bukan kartu. Drill sudah benar: kecukupan-001 tertangkap soal ke-9 attempt 1. |
| 3 | **13/13 PASS** | Final. kecukupan-006 tertangkap soal ke-6 attempt 1. |

## Catatan pasca-QA (koordinator, sebelum merge)

Catatan non-blocking no. 1 di bawah (metadata `sumber`/`deskripsi`
cheat sheet TIU yang basi) diperbaiki koordinator sebagai commit
`fdd3c9f` ("konten: perbaiki metadata cheat sheet TIU (deskripsi +
sumber 7 file riset)"): `deskripsi` kini menyebut strategi soal
kecukupan data, `sumber` menjadi "(7 file riset, 2026-11-15 dan
2026-11-16)", `catatan_kualitas` mencatat penambahan bagian
2026-11-16. Regenerasi materi (venv-materi, pypdf 7.0.1)
diverifikasi: diff vs `17e089b` hanya 3 field metadata itu
(+ `deskripsi` di `index.json`), total tetap 20 dokumen /
82.812 kata / 296 sections; build dijalankan ulang, exit 0,
konten baru terkonfirmasi di bundle. Soal, kunci, dan isi materi
tidak berubah, jadi hasil QA 47/47 di atas tetap berlaku.

## Catatan non-blocking (bukan bug, opsional diperbaiki)

1. ~~Metadata `tiu-cheat-sheet.json` agak basi: field `sumber`
   masih "(6 file riset, 2026-11-15)" (kini 7 file) dan
   `deskripsi` belum menyebut kecukupan data. Tidak memengaruhi
   tampilan maupun fungsi.~~ **DIPERBAIKI pasca-QA** (commit
   `fdd3c9f`, lihat § Catatan pasca-QA).
2. Toast "+10 XP · Jawaban benar!" menutupi sebaris panel
   jawaban tiap opsi selama ~1 detik (transien, perilaku standar
   di semua drill; terlihat di screenshot 03).
3. Diskusi per soal tampil "Fitur akun belum aktif" untuk tamu
   (v2.8, butuh login) — perilaku yang diharapkan, bukan cacat
   paket ini.
