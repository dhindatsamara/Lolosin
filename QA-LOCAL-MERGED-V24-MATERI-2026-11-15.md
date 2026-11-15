# QA Lokal Gabungan — v2.4 Dashboard + Perbaikan Materi (v2.5 readability)

Tanggal: 2026-11-15 (malam WITA)
Commit yang diuji: `cb5a957` (merge `materi-readability` ke master; orang tua `acf02a4` v2.4 + `4eb80f1` materi; 0 konflik saat merge)
Hasil akhir: **FULL QA 396/396 PASS, 0 FAIL (EXIT=0) + RENDER CHECK 110/110 PASS**
Verdict: **SIAP PUSH** (menunggu user bangun + approval, sesuai aturan: jangan push selagi user tidur)

## Cara QA dijalankan

- Worktree terisolasi `/tmp/lolosin-qa-merged` @ `cb5a957` (detached HEAD). Tree utama tidak disentuh untuk build/QA.
- Build placeholder (`VITE_SUPABASE_URL=https://placeholder.supabase.co`, bundle `index-Bhs1ZciH.js`) disalin ke `/tmp/lolosin-qa-merged-serve/main/Lolosin`, disajikan python http.server port **4213**.
- Build fake (`https://fake-lolosin-qa.supabase.co`, bundle `index-cMTAp4fp.js`) disalin ke `/tmp/lolosin-qa-merged-serve/fake/Lolosin`, disajikan python http.server port **4214**.
- Skrip: salinan `~/workspace/qa-lolosin/qa-merged.mjs` dari `qa.mjs` terbaru (393 cek) + 3 cek data v2.5 = 396 cek. `qa.mjs` utama TIDAK diubah. Log: `~/workspace/qa-lolosin/qa-run-merged.log`. Laporan otomatis skrip: `~/workspace/qa-lolosin/qa-merged-report.md`.
- `QA_APP_DIR=/tmp/lolosin-qa-merged`. Durasi run: ~4 menit.
- Server masih menyala saat laporan ini ditulis (4213 pid 21082, 4214 pid 21081) untuk inspeksi manual parent bila perlu.

## Penyesuaian ekspektasi di qa-merged.mjs (vs qa.mjs)

1. §13 hitung kata: 79.843 → **77.575** (nilai dari `index.json` hasil rewrite).
2. §13 `tiu-analogi-verbal` kata: 1.670 → **1.660** (nilai dari `index.json`).
3. Tiga cek data v2.5 dibawa dari `qa-materi2.mjs`: semua seksi punya `poin_inti` 3-5 butir; tidak ada baris tembok >600 karakter; tidak ada em-dash di konten/`poin_inti`.
4. Perbaikan lookup dibawa dari `qa-materi2.mjs`: `cariKunci`/`cariSoal` mencocokkan SELURUH opsi (bukan hanya A) lewat helper `cocokOpsi`/`cariKandidat` — tanpa ini kembar kidocp-823/867 (stem + opsi A sama, B-E beda, keduanya soal sah) membuat QA flaky.
5. Port 4173/4174 → 4213/4214; REPORT_PATH dialihkan ke `~/workspace/qa-lolosin/qa-merged-report.md` supaya tidak menimpa `QA-LOCAL-2026-11-13.md` di repo.
6. Tidak ada ekspektasi jumlah soal lain di qa.mjs yang perlu diubah (tidak ada cek yang meng-hardcode total bank 8.987 atau per-subtes).

## Full QA — 396/396 PASS

Semua 16 seksi lolos tanpa satu pun FAIL. Console errors (non-env): 0. Page errors: 0. Console warnings: 0. Request gagal/>=400 (non-env): 0. (17 request Supabase diblokir by-design di run fake seksi 11, seperti run-run sebelumnya.)

Sorotan per seksi:

- §1 Dashboard (v2.4): tile pintasan 4 item, teaser/profil/progres baca hilang dari beranda, PetCard + footer tampil.
- §3 Belajar: 12 entri grup; tabel pangkat 2 dan 3 masing-masing 100 nilai benar, 0 salah.
- §4-5 Latihan: lookup kunci 10/10 ketemu; skor 5/10 konsisten; XP +100 sesuai aturan; drill 2 tanpa pengulangan (0/10 berulang).
- §5b Fase 3: antrean ulas 14 soal; jadwal maju 1 -> 3 hari saat benar, reset saat salah; XP +10.
- §6 Tryout mini: total 38/150 konsisten (10+15+13); prediksi terskala benar (TWK 30, TIU 52,5, TKP 58,5).
- §6b Simulasi CAT: lookup 110/110 ketemu (perbaikan lookup v2.5 bekerja); skor tampil = harapan (TWK 125 / TIU 175 / TKP 225, total 525/550); benar 25/30, 35/35, 45/45; lencana Pejuang CAT + Lolos Simulasi diraih; antrean ulas +5.
- §7-9 Mobile + seeded: tanpa overflow di semua halaman; seed Fase 3 dan simulasi konsisten.
- §10 Placeholder: nav desktop 6 item tanpa Peringkat; bottom nav 5 item tanpa Peringkat; footer Peringkat ke #/leaderboard; 0 request ke supabase.co.
- §11 Fake env: landing + bento 7 kartu + Osi; form auth + validasi; game hub 5 kartu; Kuis Kilat, Kartu Kilat, Benar/Salah Kilat jalan untuk tamu.
- §12 Formasi: 34/34, semua filter (NTB 6, dokter 2, S1 Hukum 4, gaji 4, Kemenkeu 3, daerah 11), tile dashboard BETA ke #/formasi.
- §13 Materi Baru (angka baru): 19 dokumen, 284 seksi, **77.575 kata**; 284/284 `poin_inti` 3-5 butir; **0 tembok >600 karakter**; **0 em-dash**; tiu-analogi-verbal 4 seksi / 1.660 kata; seksi TKP Integritas (8.433 karakter, tanpa overflow), Pilar Negara (100/PUU-XI/2013 ada), Analogi Tiga Kata (8.991 karakter) — semua lolos termasuk cek konten "Nilai dasar akuntabel" (di JSON tertulis `Nilai dasar *akuntabel*` dengan Markdown miring, ter-render sebagai teks yang dicari).
- §14 Dashboard v2.3.2: PetCard di bawah streak (x=34, misi x=653); picker 5 gaya; gating streak 0/7; Bagikan foto mengunduh PNG 1080x1350 (265 KB).
- §15 Avatar + notifikasi: tamu tanpa lonceng; varian musik (headphone, tanpa topi); marah menang saat streak putus; PetCard + maskot dekoratif tetap bertopi.
- §16 Dashboard v2.4 (24 cek): urutan seksi hero (107) → streak (595) → pintasan (1316) → fokus (1441) → progres (1793) → ulas (2077) → riwayat (2210) → lencana (2599); **kolom streak/misi selisih 0px** (guest 1282=1282, streak 30 1240=1240); lencana strip 81px + "Lihat semua" ke grid 13; gating avatar streak 0/7/30 (jatuh ke wisuda/kacamata/mahkota sesuai aturan); tombol "Lihat peringkat" di bawah passing grade → #/leaderboard; footer: 3 tautan resmi benar + target _blank, disclaimer "bukan situs resmi pemerintah", mailto `lolosin.app@gmail.com?subject=Saran%20untuk%20Lolosin`; mobile tanpa overflow, tile 2 kolom, celah tumpukan 20px.

## Render check materi — 110/110 PASS

Skrip: `~/workspace/qa-lolosin/render-materi-merged.mjs` (salinan `render-materi.mjs` yang diarahkan ke build gabungan port 4213 + `APP_DIR=/tmp/lolosin-qa-merged`). Log: `~/workspace/qa-lolosin/render-merged.log`. Screenshot: `~/workspace/qa-lolosin/screenshots-merged-materi/`.

- 10 section yang ditulis ulang (desktop): masing-masing judul tampil, kartu Poin inti tampil, ada subjudul h2 (3-16 h2), tanpa em-dash, tanpa artefak "CON TO H", tanpa angka lingkaran, tanpa overflow (+0px), artikel lebar 850px (mode baca layar penuh).
- Termasuk `tiu-handbook-numerik-s06` "Soal Cerita" (tembok terburuk: dulu 1 baris 4.993 karakter) — kini 16 h2 + kartu Poin inti 5 butir. Diverifikasi visual dari screenshot `d-full-numerik-s06.png`: struktur rapi, contoh soal dengan rumus, sidebar Poin inti, navigasi Sebelumnya/Berikutnya, footer terisi.
- Mobile (390px): s06 + temenasn-s03 tanpa overflow; sidebar desktop tersembunyi; kartu Poin inti tampil di atas konten. Diverifikasi visual dari `m-numerik-s06.png`.
- Pembahasan materi-332 + materi-333: terstruktur per-opsi (5 penanda poin), tanpa em-dash, soal target muncul di drill.
- Cek substansi: "Peri kemanusiaan" tampil, "Peri keadilan" hilang (koreksi Yamin); sub-daftar bertingkat dirender (2 sub-ul).

## Verifikasi data (dari worktree, independen dari Playwright)

- Materi: 19 dokumen, **284 seksi, 77.575 kata, 284/284 punya `poin_inti`** (3-5 butir).
- Bank soal: **8.972 soal** (TWK 2.935, TIU 4.020, TKP 2.017) — turun 15 dari 8.987 sesuai penghapusan duplikat sejati (TWK -2, TIU -6, TKP -7).
- `komunitas-553` TIDAK ADA; `komunitas-1137` ADA (kunci E dipertahankan).
- Em-dash: **0** di seluruh `src/data/*.json` dan **0** di seluruh `src/**/*.ts(x)`.
- Catatan: hitungan "57 stem duplikat" dari QA v2.4 sebagian besar false positive (stem instruksi template seperti jadiasn02-1/02-2 dengan opsi berbeda adalah soal sah yang berbeda); dedupe yang benar memakai stem + opsi, dan itulah yang dilakukan cabang materi.

## FAIL: tidak ada

Tidak ada FAIL, tidak ada regresi gabungan yang terdeteksi. Nilai-nilai pengukuran §16 identik dengan run v2.4 di cabangnya sendiri (urutan seksi dalam px sama persis), dan nilai §13/§6b identik dengan run cabang materi — merge tidak mengubah perilaku apa pun.

## Batasan yang masih berlaku (bukan temuan QA ini)

- Uji alur undangan battle 2 akun (lonceng notifikasi) tetap butuh tes manual dengan 2 akun login + Supabase live — tidak bisa di-QA lokal.
- 17 temuan kunci jawaban yang meragukan dari audit materi (13 kunci salah dengan bukti hitung + 4 soal bermasalah) TIDAK diubah oleh cabang materi — menunggu putusan user. Bukan regresi; detail di laporan readability cabang materi.
- UI AvatarPicker terkunci belum terverifikasi lokal (butuh akun login); logika gating yang sama terbukti lewat hero di 4 skenario (§16).

## File terkait

- Log full QA: [qa-run-merged.log](sandbox://workspace/qa-lolosin/qa-run-merged.log)
- Laporan otomatis skrip: [qa-merged-report.md](sandbox://workspace/qa-lolosin/qa-merged-report.md)
- Skrip QA gabungan: [qa-merged.mjs](sandbox://workspace/qa-lolosin/qa-merged.mjs)
- Log render check: [render-merged.log](sandbox://workspace/qa-lolosin/render-merged.log)
- Screenshot Soal Cerita desktop: [d-full-numerik-s06.png](sandbox://workspace/qa-lolosin/screenshots-merged-materi/d-full-numerik-s06.png)
- Screenshot Soal Cerita mobile: [m-numerik-s06.png](sandbox://workspace/qa-lolosin/screenshots-merged-materi/m-numerik-s06.png)
