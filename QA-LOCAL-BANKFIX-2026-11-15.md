# QA Lokal Bankfix Lolosin — 2026-11-15

**Verdict: LULUS** — semua cek QA bankfix lolos. Bank soal 8.972 → **8.969 soal**.
14 kunci diperbaiki, 3 soal rusak dihapus, **256 pembahasan baru** ditulis.
Branch `bankfix-2026-11-15`, commit `193edb8` (worktree `/tmp/lolosin-bankfix`,
base master `400eb4b`). **Belum di-merge ke master, belum di-push.**
Bank kanonik `~/workspace/cpns/bank-soal/bank-soal.json` sudah diperbarui
(backup: `bank-soal-pre-bankfix-2026-11-15.json`, dibuat sebelum perubahan apa pun).

Perintah user (19:43): soal rusak/ga lengkap DIBUANG, kunci + pembahasan yang
salah DIPERBAIKI, soal tanpa pembahasan DITULIS pembahasannya (matematika dulu).

## Ringkasan angka

| | Sebelum | Sesudah |
|---|---|---|
| Total soal | 8.972 | **8.969** |
| Quiz-usable (punya kunci) | 8.353 | 8.350 |
| Tanpa kunci (tidak masuk kuis) | 619 | 619 |
| Quiz-usable tanpa pembahasan | 273 | **14** (sisa temuan baru, lihat §5) |
| Kunci diperbaiki | — | **14** |
| Soal dihapus | — | **3** |
| Pembahasan baru | — | **256** (TWK 182, TKP 56, TIU 18) |
| Pembahasan dibersihkan | — | 1 (komunitas-1126, sufiks sampah) |

Pembahasan baru per worker: W1 TWK Campuran 93, W2 TWK lain 89, W3 TKP 56,
W4 TIU 18. Total ID berubah: 258 (14 kunci + 257 pembahasan, 13 soal kena
keduanya). Chunk app agregat == bank kanonik (0 beda isi).

## 1. Perbaikan 14 kunci (semua dihitung/dicek ulang dari soal + opsi)

| Soal | Lama → Baru | Bukti (hitung ulang koordinator) |
|---|---|---|
| komunitas-1012 | A → **D** (560rb) | 50×600rb + 25×560rb + 25p = 100×580rb → p = 560rb |
| komunitas-1014 | B → **D** (1/4) | (0,07a+0,08b)/(a+b)=0,078 → b=4a → a/b=1/4 |
| komunitas-1019 | B → **D** (82) | (91+88+86+78+x)/5=85 → x=82 |
| komunitas-1020 | B → **D** (4 jam) | Jarak A-B tetap 192 km, kecepatan sama 48 km/jam → tetap 4 jam; bensin pengecoh |
| komunitas-1112 | B → **C** (x=y) | x=p×q, y=q×p |
| komunitas-1110 | C → **A** (8 orang) | 64 orang × 0,5 hari = 32 orang-hari; 32/4 = 8 orang |
| komunitas-1108 | A → **B** (32%) | 1 − 0,8×0,85 = 32% |
| komunitas-634 | C → **A** (0,6/detik) | (2334−1254)/1800 detik = 0,6 |
| komunitas-922 | A → **D** (11%) | (1,2X+1,02X−2X)/2X = 11% |
| komunitas-512 | C → **D** (Sarkofagus) | Peti kubur batu = sarkofagus |
| komunitas-513 | D → **C** (Yupa) | Peninggalan paling terkenal Kutai = Yupa |
| komunitas-906 | E → **A** (UNTEA) | Komisi PBB untuk Irian Barat = UNTEA |
| komunitas-1126 | A → **C** | Pembahasan soalnya sendiri bilang "didapat karena diminta" |
| komunitas-715 | D → **C** (Ketidakpastian) | **JUDGMENT CALL** — lihat §2 |

12 dari 14 soal ini juga mendapat pembahasan baru yang ditulis berdasarkan
kunci BENAR (9 TIU + 3 TWK); 715 sudah punya pembahasan yang mendukung C;
1126 pembahasannya dibersihkan dari sufiks sampah ("PEMBAHASAN SOAL TES TKP…")
dan typo opsi C "Seuatu" → "Sesuatu".

## 2. Judgment call: komunitas-715 (satu-satunya perbaikan kunci yang memakai penilaian)

Soal: AMBIGUITAS = ______ (kunci lama D Kebingungan → baru C Ketidakpastian).
Ini BUKAN hasil hitung pasti, melainkan penilaian berbasis dua bukti:
(1) KBBI: ambiguitas = "bermakna dua; ketidaktentuan, ketidakjelasan" —
"Ketidakpastian" dekat ke ketidaktentuan, sedangkan "Kebingungan" adalah
akibat (perasaan), bukan makna katanya; (2) pembahasan soal sendiri menyebut
"ketidaktentuan, ketidakjelasan" dan "kemungkinan adanya makna lebih dari satu".
Bila user tidak setuju, kembalikan ke D dengan satu baris patch.

## 3. Penghapusan 3 soal rusak

| Soal | Alasan |
|---|---|
| komunitas-905 | Tidak ada opsi benar: blok fasis PD II = Jerman/Italia/Jepang, tidak ada di opsi |
| komunitas-1016 | Pangkat hilang dari OCR ("x = -(2) dan y = (-2)"), tidak bisa dijawab apa adanya |
| komunitas-640 | Premis perbandingan tinggi badan hilang, hanya ada pernyataan opsi |

Dihapus dari chunk app DAN bank kanonik. ID soal lain tidak berubah
(tanpa penomoran ulang).

## 4. Pembahasan baru (256)

| Keluarga | Jumlah | Catatan |
|---|---|---|
| TWK Campuran (W1) | 93 | Termasuk 512/513/906 dengan kunci benar |
| TWK lain (W2) | 89 | Sistem Tata Negara, Pancasila, UUD 1945, dll |
| TKP (W3) | 56 | Semua selaras bobot per-opsi (kunci = bobot 5) |
| TIU (W4) | 18 | Termasuk 9 soal koreksi kunci, langkah hitung lengkap |

Aturan dipatuhi: tanpa em-dash, tanpa kata utuh "seksi", matematika
menunjukkan langkah hitung, TKP selaras bobot. Cek otomatis: 0 pembahasan
yang menyebut huruf kunci lain sebagai jawaban (5 temuan awal terbukti
positif palsu: "opsi B tidak lengkap…" dst — menyebut opsi lain sebagai
opsi yang salah, bukan sebagai jawaban).

## 5. Sisa: 14 soal bermasalah BARU (tidak diubah sepihak — butuh putusan user)

Ditemukan worker saat menulis pembahasan; semuanya sudah saya verifikasi
ulang dari soal + opsinya. Ke-14 ini masih TANPA pembahasan.

**Kandidat perbaiki kunci (6 — jawaban benarnya jelas):**

| Soal | Kunci sekarang → seharusnya | Bukti |
|---|---|---|
| komunitas-515 | C → **A** | Gerakan 3A: Jepang pemimpin/pelindung/cahaya Asia |
| komunitas-517 | A → **B** | Shimao International Plaza (2005, 60 lantai) ada di Shanghai |
| komunitas-518 | B → **D** | ber- pada "berbaju" = memakai; yang sama "bersepatu" |
| komunitas-523 | D → **C** | IMPRESI = kesan |
| komunitas-525 | A → **D** | KAPABEL >< ___ : "piawai" adalah sinonim, antonimnya "bodoh" |
| komunitas-530 | D → **C** | MOBIL:BENSIN (butuh bahan bakar) sejajar MANUSIA:MAKAN |

**Kandidat hapus (8 — tidak ada opsi benar / jawaban ganda / ambigu):**

| Soal | Alasan |
|---|---|
| komunitas-514 | "Yang bukan pelopor ASEAN": kelima opsi adalah pendiri ASEAN |
| komunitas-516 | Semua opsi salah sejarah (Rusia tidak pernah menguasai Prancis, dst) |
| komunitas-520 | se- "segenggam" = satu; B, D, E ketiganya bermakna satu (3 jawaban benar) |
| komunitas-527 | LECO >< ___ : B, C, D, E keempatnya bermakna kecil |
| komunitas-531 | PIANO:ORGAN: D (drum-gitar) dan E (panci-wajan) sama-sama pasangan sejenis |
| komunitas-532 | Harga beli = 75.000/1,3 = Rp57.692,31, tidak ada di opsi (kunci C = hitung terbalik) |
| tes12-111 | HAM UUD 1945: opsi A dan B sama-sama benar |
| tes12-163 | Bawaslu: opsi C (sengketa HASIL Pemilu) adalah wewenang MK (Pasal 24C); kunci D "semua benar" jadi salah; tidak ada opsi yang sepenuhnya benar |

## 6. Catatan lain (tidak menghambat)

- **Bobot TKP sumber kadang tidak intuitif** (mis. hots-708 memberi alternatif
  solusi berbobot 1; hots-722 "dengan cara apapun" berbobot 5; hots-735
  menonjolkan kelebihan diri berbobot 5). Pembahasan mengikuti data bobot
  apa adanya (kunci = bobot 5 di semua soal). Bila user mau, bobot-bobot
  ini bisa diaudit terpisah — bukan bagian bankfix.
- **hots-251**: opsi A benar intinya (KNIP jadi legislatif pasca-Maklumat
  14 Nov 1945) tapi frasa "turut serta menetapkan GBHN" anakronistik
  (GBHN baru era MPR 1973). Pembahasan tidak mengulang klaim itu; redaksi
  opsi sebaiknya dibersihkan di ronde berikutnya.
- **tes12-114**: opsi A menyebut "pemimpin daerah" yang teknisnya dipilih
  lewat Pilkada, bukan Pemilu. Pembahasan menjelaskan A paling tepat di
  antara opsi yang ada; redaksi opsi sebaiknya diperbaiki.
- **Insiden W2 (sudah diperbaiki)**: dump awal worker sempat menggeser
  pemetaan ID di sekitar tes12-4/5/6 sehingga patch tes12-5 dan tes12-6
  sempat tertukar; rekonsiliasi menemukan dan memperbaiki keduanya, dan
  saya verifikasi ulang tes12-4 s.d. tes12-8 cocok dengan soalnya.
- **split-questions.py tidak reproduksibel byte-per-byte**: chunk tkp-1
  tersimpan pretty-print (indent=1), 6 chunk lain compact; batas chunk
  bergeser bila di-split ulang dari kanonik. Patch diterapkan langsung ke
  chunk dengan format dipertahankan (round-trip terverifikasi identik),
  bukan lewat re-split. Agregat chunk == kanonik.
- **Ukuran push**: 6 file chunk berubah, total 7,5 MB → butuh 2 batch push
  (saran: batch 1 = tiu-1 + tiu-2 + tkp-2 ≈ 3,5 MB; batch 2 = tkp-1 +
  twk-1 + twk-2 ≈ 4,0 MB — batch 2 mepet batas ~4 MB, pertimbangkan
  3 batch bila ragu). tiu-3 tidak berubah.

## 7. Hasil QA otomatis (skrip `~/workspace/lolosin-bankfix/qa_bankfix.py`)

Semua PASS (12/12): JSON valid; total 8.969; 3 hapusan tidak ada di mana pun;
14 kunci baru benar; tidak ada kunci lain berubah; chunk == kanonik; tanpa
pembahasan hanya 14 sisa yang dilaporkan; 0 em-dash; 0 kata "seksi" utuh;
0 pembahasan menyebut kunci lain; hanya ID yang diharapkan berubah (258 ID).

File kerja: `~/workspace/lolosin-bankfix/` (work file w1–w4, patch-w*.jsonl,
`apply_patches.py`, `qa_bankfix.py`, `target-17.json`).
