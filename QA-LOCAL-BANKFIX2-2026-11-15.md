# QA Lokal Bankfix Ronde 2 — 2026-11-15

**Verdict: SIAP** — ke-14 temuan baru ronde 1 sudah diterapkan sesuai aturan user
(soal rusak dibuang, kunci salah diperbaiki). Semua 14 diverifikasi ulang dari
soal + opsinya sebelum diubah; tidak ada perkecualian.

| | |
|---|---|
| **Worktree** | `/tmp/lolosin-bankfix2`, branch `bankfix2-2026-11-15`, base master `db43c00` |
| **Commit** | `8c48c12` (2 file chunk: `questions-tiu-2.json`, `questions-twk-2.json`) |
| **Backup kanonik** | `~/workspace/cpns/bank-soal/bank-soal-pre-bankfix2-2026-11-15.json` |
| **Bank soal** | 8.969 → **8.961 soal** |
| **Quiz-usable tanpa pembahasan** | 14 → **0** |

## 1. Kunci diperbaiki (6 — semua terverifikasi + pembahasan baru ditulis)

| Soal | Kunci lama → baru | Bukti |
|---|---|---|
| komunitas-515 | C → **A** | Gerakan 3A: Jepang Pemimpin Asia, Jepang Pelindung Asia, Jepang Cahaya Asia. "Jepang saudara Asia" (C) bukan semboyan 3A |
| komunitas-517 | A → **B** | Shimao International Plaza (60 lantai) ada di Shanghai. Pyongyang (A) itu ibu kota Korea Utara, bukan di China |
| komunitas-518 | B → **D** | ber- pada "berbaju" = memakai. Yang sama maknanya "bersepatu" (memakai sepatu). "Bersepeda" (B) = mengendarai sepeda |
| komunitas-523 | D → **C** | IMPRESI = kesan (KBBI: kesan; pengaruh) |
| komunitas-525 | A → **D** | KAPABEL = cakap/mampu; antonimnya "bodoh". "Piawai" (A) itu sinonim (mahir), bukan antonim |
| komunitas-530 | D → **C** | MOBIL butuh BENSIN sebagai bahan bakar, sejajar MANUSIA butuh MAKAN sebagai sumber energi |

Ke-6 soal di atas juga mendapat pembahasan baru (benar, terverifikasi, tanpa
em-dash, tanpa kata utuh "seksi").

## 2. Soal dihapus (8 — semua terverifikasi rusak, tidak bisa diperbaiki kunci)

| Soal | Alasan |
|---|---|
| komunitas-514 | "Yang bukan pelopor ASEAN": kelima opsi adalah 5 pendiri ASEAN (Adam Malik, Abdul Razak, S. Rajaratnam, N. Ramos, Thanat Khoman). Tidak ada jawaban benar |
| komunitas-516 | Semua opsi salah sejarah: Rusia tidak pernah menguasai Prancis; Polandia tidak pernah diduduki Inggris; Jerman diduduki 4 negara, bukan AS saja |
| komunitas-520 | se- "segenggam" = satu; B (sedesa), D (selembar), E (sebulan) ketiganya bermakna satu (3 jawaban benar). Kunci lama A ("selembut") malah bermakna "seperti" |
| komunitas-527 | LECO >< ___ : B (mungil), C (kerdil), D (cebol), E (kurcaci) keempatnya bermakna kecil (4 jawaban benar) |
| komunitas-531 | PIANO:ORGAN: D (drum-gitar) dan E (panci-wajan) sama-sama pasangan sejenis (2 jawaban benar) |
| komunitas-532 | Harga beli = 75.000 / 1,3 = Rp57.692,31, tidak ada di opsi. Kunci lama C (Rp97.500) = hitung terbalik (75.000 × 1,3) |
| tes12-111 | HAM UUD 1945: opsi A (pekerjaan, pendidikan, kesehatan) dan B (berpendapat, berserikat, beragama) sama-sama benar |
| tes12-163 | Opsi C (sengketa HASIL Pemilu) adalah wewenang MK (Pasal 24C UUD 1945), bukan Bawaslu; jadi kunci D "semua benar" salah dan tidak ada opsi yang sepenuhnya benar |

## 3. Verifikasi (dari disk, skrip cek otomatis)

- Bank kanonik vs backup: tepat 6 record berubah (hanya field `kunci` +
  `pembahasan`), tepat 8 record hilang, 0 record baru.
- Quiz-usable (punya kunci) tanpa pembahasan: **0**. Soal tanpa kunci tetap
  619 (bukan quiz-usable, tidak disentuh ronde ini).
- Agregat 7 chunk = 8.961 soal; ID chunk == ID kanonik; 0 perbedaan isi
  chunk vs kanonik. Semua file JSON valid (7 chunk + kanonik ter-parse).
- Ke-8 ID yang dihapus tidak ada lagi di kanonik maupun chunk.
- Round-trip format terverifikasi byte-identik sebelum patch (kanonik
  indent=1, chunk compact); patch langsung ke chunk, tanpa re-split.
- Pembahasan baru: 0 em-dash, 0 kata utuh "seksi".

## 4. Perkecualian

Tidak ada. Ke-6 kunci terbukti benar dan ke-8 soal terbukti rusak; semuanya
diterapkan sesuai rencana. Tidak ada perubahan lain di luar cakupan ini.
