# QA Lokal Lolosin — 2026-11-15 (Iterasi v2.3.2: PetCard Osi di kolom streak + picker outfit + bagikan foto + rapikan beranda)

**Target:** http://127.0.0.1:4193/Lolosin/ (python http.server, root /tmp/lolosin-serve, build terbaru dari `~/workspace/lolosin/dist`)
**Metode:** Playwright + Chromium headless di VM (browser cloud tidak bisa mencapai localhost). Script: `~/workspace/qa-lolosin/qa.mjs`. Screenshot: `~/workspace/qa-lolosin/screenshots/`.

## Verdict: SIAP

Total cek: **357** | PASS: **357** | FAIL: **0** | Console error (non-lingkungan): 0 | Page error: 0 | Request gagal/≥400 (non-lingkungan): 0 | Console warning: 0

> **Catatan:** font self-hosted via Fontsource (sejak redesign) — 0 request font eksternal di run ini.

## Dashboard

| Cek | Hasil | Bukti |
|---|---|---|
| Render + heading sapaan | ✅ PASS | load 2693ms, URL http://127.0.0.1:4193/Lolosin/ |
| Kartu Level/XP tampil | ✅ PASS | Level 1 |
| Kartu streak tampil | ✅ PASS |  |
| Hero tanpa angka total soal/materi (v2) | ✅ PASS |  |
| Layout desktop lebar (main > 1000px, v2) | ✅ PASS | main width 1280px |
| Osi tampil di hero dashboard (v2.2) | ✅ PASS |  |
| Osi hero dashboard besar (lebar ~160px, v2.2) | ✅ PASS | lebar 175px |
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
| Service worker ter-register + aktif | ✅ PASS | {"scope":"http://127.0.0.1:4193/Lolosin/","active":true,"state":"activated","controller":true} |
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
| Materi TWK terbuka, judul tanpa atribusi (v2.1) | ✅ PASS | h1: Rangkuman Tabel TWK \| http://127.0.0.1:4193/Lolosin/#/belajar/twk-bang-arya |
| Detail materi tanpa baris "Sumber:" (v2.1) | ✅ PASS |  |
| Daftar seksi dokumen tampil | ✅ PASS | 7 link seksi |
| Seksi TWK terbuka + isi tampil | ✅ PASS | h1: Poin Setiap Sila Pancasila \| body 1033 karakter |
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
| Drill dimulai (soal tampil) | ✅ PASS | http://127.0.0.1:4193/Lolosin/#/latihan/jalan |
| Tombol Jawab disabled sebelum memilih (v2.2) | ✅ PASS |  |
| Pilih opsi saja belum menjawab (v2.2) | ✅ PASS |  |
| Panel pembahasan muncul setelah Jawab | ✅ PASS |  |
| Opsi jawaban tampil (minimal 4, v2.2) | ✅ PASS | 5 tombol opsi |
| Kunci jawaban ditemukan di bank lokal untuk semua soal drill | ✅ PASS | 10/10 ketemu |
| Halaman hasil drill tampil (Sesi selesai!) | ✅ PASS | skor tampil: 5/10, benar versi UI: 5/10 |
| Skor tampil konsisten dengan jawaban benar (5/10) | ✅ PASS | skor tampil 5/10, benar terhitung 5 |
| XP bertambah sesuai aturan (+10/benar, +50 selesai) | ✅ PASS | XP 5 -> 105 (delta 100, harapan 100 dari 5 benar) |
| XP drill 2 sesuai aturan (+10/benar, +50 selesai) | ✅ PASS | delta 60, harapan 60 dari 1 benar |

## Anti-ulang

| Cek | Hasil | Bukti |
|---|---|---|
| Drill 2 tidak mengulang soal drill 1 (topik sama) | ✅ PASS | 0 dari 10 berulang |
| Tidak ada pesan rotasi (pool topik masih cukup) | ✅ PASS |  |

## Fase 3 antrean

| Cek | Hasil | Bukti |
|---|---|---|
| Soal salah masuk antrean ulas (jumlah = jawaban salah drill 1+2) | ✅ PASS | antrean 14, harapan 14 (salah drill1 5 + drill2 9) |
| Entri antrean jatuh tempo besok, interval 1 hari, streak 0 | ✅ PASS | contoh: due=2026-11-16 interval=1 streak=0 (besok=2026-11-16) |
| Kartu ulas empty state saat belum ada yang jatuh tempo hari ini | ✅ PASS |  |
| Kartu ulas menampilkan jumlah soal jatuh tempo | ✅ PASS | Soal yang perlu diulas hari ini: 14 soal |

## Fase 3 fokus

| Cek | Hasil | Bukti |
|---|---|---|
| Tally topik tercatat (TIU|Analogi Verbal, 20 jawaban) | ✅ PASS | {"correct":6,"total":20} |
| Kartu fokus menampilkan subtopik terlemah + akurasi yang benar | ✅ PASS | 6 benar dari 20 |
| Tombol drill topik terlemah ada | ✅ PASS |  |
| Baris Belum dicoba tampil | ✅ PASS |  |
| Dashboard tanpa overflow (kartu Fase 3) | ✅ PASS |  |

## Fase 3 mode ulas

| Cek | Hasil | Bukti |
|---|---|---|
| Navigasi ke #/latihan/ulas | ✅ PASS | http://127.0.0.1:4193/Lolosin/#/latihan/ulas |
| Halaman tergulir ke atas, judul tidak tertutup header | ✅ PASS | scrollY=0 h1.y=141.234375 header.h=73.234375 |
| Sesi ulas tampil (Soal 1 dari 10, maks 10) | ✅ PASS | Soal 1 dari 10 |
| Mode ulas tanpa overflow | ✅ PASS |  |

## Fase 3 jadwal

| Cek | Hasil | Bukti |
|---|---|---|
| Jawaban benar di mode ulas memajukan jadwal (interval 1 -> 3, streak 1, due +3 hari) | ✅ PASS | interval=3 streak=1 due=2026-11-18 (harapan due 2026-11-18) |
| Hitungan ulasan benar bertambah (stats.reviewsCorrect = 1) | ✅ PASS | reviewsCorrect=1 |
| Jawaban benar di mode ulas memberi +10 XP | ✅ PASS | XP 165 -> 175 |
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
| Pindah ke halaman hasil (#/tryout/hasil) | ✅ PASS | http://127.0.0.1:4193/Lolosin/#/tryout/hasil |
| Halaman hasil tampil (lulus/belum lulus) | ✅ PASS | h1: Belum lulus, terus berlatih ya! |
| Skor total tampil | ✅ PASS | Total mini 19/150 |
| Skor per seksi tampil (nama + nilai + passing grade + benar x/10) | ✅ PASS | passing-grade muncul 3x, "benar: x/10" muncul 3x |
| Jumlah skor 3 seksi == total mini | ✅ PASS | seksi: 0 + 5 + 14 = 19 vs total 19 |
| Breakdown per soal tampil 30 soal | ✅ PASS | 30 entri breakdown |
| Status lulus per seksi tampil + konsisten dengan skor vs passing grade | ✅ PASS | badge: [Belum lulus, Belum lulus, Belum lulus], harapan: [Belum lulus, Belum lulus, Belum lulus] dari skor 0/5/14 |
| XP +100 setelah menyelesaikan tryout | ✅ PASS | XP 175 -> 275 (delta 100) |
| Riwayat tryout tersimpan (1 entri) | ✅ PASS | history: 1 |
| Tidak ada catatan leaderboard di hasil tryout kilat (status mini) | ✅ PASS |  |

## Fase 3 prediksi

| Cek | Hasil | Bukti |
|---|---|---|
| Panel prediksi tampil di halaman hasil | ✅ PASS |  |
| Skor terskala TWK benar (0 x 3 = 0 dari 150) | ✅ PASS |  |
| Selisih TWK vs passing grade asli benar (65 poin lagi) | ✅ PASS |  |
| Pita TWK benar (Masih jauh, fokus di sini dulu) | ✅ PASS |  |
| Skor terskala TIU benar (5 x 3.5 = 17,5 dari 175) | ✅ PASS |  |
| Selisih TIU vs passing grade asli benar (62,5 poin lagi) | ✅ PASS |  |
| Pita TIU benar (Masih jauh, fokus di sini dulu) | ✅ PASS |  |
| Skor terskala TKP benar (14 x 4.5 = 63 dari 225) | ✅ PASS |  |
| Selisih TKP vs passing grade asli benar (93 poin lagi) | ✅ PASS |  |
| Pita TKP benar (Masih jauh, fokus di sini dulu) | ✅ PASS |  |
| Teks belum ada tren (baru 1 tryout) | ✅ PASS |  |
| Kalimat jujur tampil | ✅ PASS |  |
| Ringkasan riwayat 1 tryout tampil | ✅ PASS | Dari 1 tryout mini, terakhir 15 Nov 2026TWKTes Wawasan KebangsaanMasih jauh, fokus di sini duluTWK 0 dari 150Passing grade: 65 · 65 poin lagiTIUTes Intelegensia UmumMasih jauh, fokus di sini duluTIU 17,5 dari 175Passing grade: 80 · 62,5 poin lagiTKPTes Karakteristik PribadiMasih jauh, fokus di sini duluTKP 63 dari 225Passing grade: 156 · 93 poin lagiBelum ada tren, ikut tryout lagi untuk melihat perkembanganmu |
| Panel muncul setelah breakdown per soal | ✅ PASS |  |
| Panel ringkas di dashboard menampilkan skor terskala yang benar | ✅ PASS | TWK 0 dari 150 \| TIU 17,5 dari 175 \| TKP 63 dari 225 |

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
| Pindah ke halaman hasil (#/tryout/hasil) | ✅ PASS | http://127.0.0.1:4193/Lolosin/#/tryout/hasil |
| Judul hasil sesuai kelolosan (lulus) | ✅ PASS | h1: Selamat, kamu lulus! \| skor harapan TWK 125 / TIU 175 / TKP 225 |
| Total tampil /550 sesuai hitungan (525/550) | ✅ PASS | Total 525/550 |
| Skor per seksi tampil sesuai hitungan jawaban (TWK/TIU/TKP) | ✅ PASS | tampil: 125/175/225 \| harapan: 125/175/225 |
| Jumlah benar per seksi tampil (x/30, x/35, x/45) | ✅ PASS | benar: 25/30, benar: 35/35, benar: 45/45 |
| Status lulus per seksi konsisten dengan passing grade ASLI | ✅ PASS | badge: [Lulus, Lulus, Lulus], harapan: [Lulus, Lulus, Lulus] |
| Breakdown per soal tampil 110 soal | ✅ PASS | 110 entri breakdown |
| Pill +300 XP tampil di halaman hasil | ✅ PASS |  |
| Catatan leaderboard not-configured tampil di hasil simulasi | ✅ PASS |  |
| Skor not-configured tidak masuk antrean pending | ✅ PASS | key tidak ada |
| XP +300 setelah menyelesaikan simulasi | ✅ PASS | XP 275 -> 575 (delta 300) |
| Riwayat bertambah: entri full mode=full, skor sesuai hitungan | ✅ PASS | {"mode":"full","twk":125,"tiu":175,"tkp":225,"passed":true,"correct":{"TWK":25,"TIU":35,"TKP":45},"date":"2026-11-15T07:07:34.349Z"} |
| Entri mini lama tetap mode=mini, skor tidak berubah | ✅ PASS | {"mode":"mini","twk":0,"tiu":5,"tkp":14,"passed":false,"correct":{"TWK":0,"TIU":1,"TKP":1},"date":"2026-11-15T07:06:19.361Z"} |
| Lencana 'Pejuang CAT' diraih setelah 1 simulasi | ✅ PASS | langkah-pertama, penantang-tryout, pemburu-100, pejuang-cat, lolos-simulasi |
| Lencana 'Lolos Simulasi' diraih (simulasi lulus) | ✅ PASS | langkah-pertama, penantang-tryout, pemburu-100, pejuang-cat, lolos-simulasi |
| Misi 'simulasi-1' tidak berubah (bukan misi hari ini) | ✅ PASS | misi hari ini: [baca-tkp, baca-twk, drill-2], progress simulasi-1=0 |
| Soal salah dari simulasi masuk antrean ulas (jumlah pas) | ✅ PASS | antrean 42 -> 47 (harapan +5), salah tidak masuk: 0 |
| Entri ulas dari simulasi jatuh tempo besok, interval 1 hari | ✅ PASS | {"questionId":"jhar-cpns-skd-2026-p1-024","materi":"TWK","subtopik":"pilar negara","due":"2026-11-16","intervalDays":1,"streakCorrect":0} |
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
| Ringkasan sumber menyebut 1 simulasi CAT dan 1 tryout mini | ✅ PASS | Dari 1 simulasi CAT dan 1 tryout mini, terakhir 15 Nov 2026TWKTes Wawasan KebangsaanAman, pertahankanTWK 125 dari 150Passing grade: 65 · 60 poin di atas passing gradeNaik 125 poin dari tryout sebelumnya |
| Kalimat jujur versi simulasi tampil | ✅ PASS |  |
| Tren TWK benar (Naik 125 poin dari tryout sebelumnya.) | ✅ PASS |  |
| Tren TIU benar (Naik 157,5 poin dari tryout sebelumnya.) | ✅ PASS |  |
| Tren TKP benar (Naik 162 poin dari tryout sebelumnya.) | ✅ PASS |  |
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
| Bottom nav "Belajar" -> #/belajar, tanpa overflow | ✅ PASS | url=http://127.0.0.1:4193/Lolosin/#/belajar overflow=false scrollW=390 |
| Bottom nav "Latihan" -> #/latihan, tanpa overflow | ✅ PASS | url=http://127.0.0.1:4193/Lolosin/#/latihan overflow=false scrollW=390 |
| Bottom nav "Tryout" -> #/tryout, tanpa overflow | ✅ PASS | url=http://127.0.0.1:4193/Lolosin/#/tryout overflow=false scrollW=390 |
| Bottom nav "Main" -> #/main, tanpa overflow | ✅ PASS | url=http://127.0.0.1:4193/Lolosin/#/main overflow=false scrollW=390 |
| Bottom nav "Beranda" -> #/, tanpa overflow | ✅ PASS | url=http://127.0.0.1:4193/Lolosin/#/ overflow=false scrollW=390 |
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
| Mode ulas terbuka di mobile (Soal 1 dari 3) | ✅ PASS | http://127.0.0.1:4193/Lolosin/#/latihan/ulas |
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
| Tombol Balik ke beranda kembali ke dashboard | ✅ PASS | http://127.0.0.1:4193/Lolosin/#/ |
| /leaderboard tampil dengan state belum aktif | ✅ PASS |  |
| /leaderboard placeholder tanpa tombol Muat ulang (by design: belum ada yang dimuat) | ✅ PASS |  |
| /leaderboard placeholder tanpa overflow | ✅ PASS |  |
| CTA Latihan dulu aja mengarah ke #/tryout | ✅ PASS | http://127.0.0.1:4193/Lolosin/#/tryout |
| Top nav punya 7 item incl Main + Peringkat + Formasi (desktop, v2.3) | ✅ PASS | Beranda \| Belajar \| Latihan \| Tryout \| Main \| Peringkat \| Formasi |
| Top nav Peringkat mengarah ke #/leaderboard (desktop, v2) | ✅ PASS | http://127.0.0.1:4193/Lolosin/#/leaderboard |
| Top bar: pill XP + streak tampil, tanpa pill akun (AuthStatus null) | ✅ PASS | 0 XP · Lv 1 \| 0 hari |
| Nol request ke supabase.co di mode placeholder | ✅ PASS | 0 request |
| Mobile: /leaderboard state belum aktif, tanpa overflow | ✅ PASS |  |
| Mobile: bottom nav 6 item incl Main + Peringkat (v2.2) | ✅ PASS | Beranda \| Belajar \| Latihan \| Tryout \| Main \| Peringkat |
| Mobile: nav Peringkat ke #/leaderboard, tanpa overflow | ✅ PASS | http://127.0.0.1:4193/Lolosin/#/leaderboard |
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
| Osi hero landing besar (lebar ~240px, v2.2) | ✅ PASS | lebar 275px |
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
| /profil tamu dialihkan ke /auth (v2.2) | ✅ PASS | http://127.0.0.1:4194/Lolosin/#/auth |

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
| index.json: 19 dokumen, 284 seksi, 79.612 kata (v2.3.1) | ✅ PASS | 19 dokumen, 284 seksi, 79612 kata |
| index.json memuat 2 dokumen baru (v2.3.1) | ✅ PASS |  |
| tiu-analogi-verbal kini 4 seksi (s04 analogi tiga kata, v2.3.1) | ✅ PASS | 4 seksi, 1670 kata |
| Daftar Belajar memuat 2 dokumen baru (v2.3.1) | ✅ PASS |  |
| Dokumen TKP baru terbuka: 12 seksi, tanpa baris Sumber (v2.3.1) | ✅ PASS | h1: Karakter dan Perilaku Kerja ASN \| 12 kartu seksi |
| Seksi TKP Integritas: tabel dasar hukum jadi bullet, tanpa atribusi/URL (v2.3.1) | ✅ PASS | 7290 karakter |
| Seksi TKP Integritas tanpa overflow (desktop, v2.3.1) | ✅ PASS |  |
| Dokumen TWK baru terbuka: 2 seksi (v2.3.1) | ✅ PASS | h1: Integritas dan Pilar Negara \| 2 kartu seksi |
| Seksi Pilar Negara: substansi MK ada, atribusi situs dibuang (v2.3.1) | ✅ PASS |  |
| Seksi Analogi Tiga Kata tampil + isi lengkap (v2.3.1) | ✅ PASS | 7934 karakter |
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

## Request Supabase diblokir by-design (bukan cacat app)

Run fake-configured (section 11) memblokir semua request ke `*.supabase.co` lewat route interception Playwright supaya tidak ada panggilan API live. 17 request diblokir (supabase-js me-retry fetch gagal beberapa kali dengan backoff, jadi satu load bisa memunculkan beberapa percobaan), masing-masing juga memunculkan console error browser `Failed to load resource: net::ERR_FAILED` (17 console error, lokasi URL supabase.co):

- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/auth/v1/token?grant_type=password — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-09&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`
- `[supabase-fake] FAILED https://fake-lolosin-qa.supabase.co/rest/v1/tryout_results?select=user_id%2Ctwk%2Ctiu%2Ctkp%2Ctotal%2Cpassed&week_start=eq.2026-11-02&mode=eq.full&order=total.desc&limit=500 — net::ERR_FAILED`

## Screenshot

- `qa-lolosin/screenshots/01-dashboard-desktop.png`
- `qa-lolosin/screenshots/02-belajar-seksi-twk.png`
- `qa-lolosin/screenshots/03-belajar-tabel-pangkat.png`
- `qa-lolosin/screenshots/04-latihan-hasil-drill1.png`
- `qa-lolosin/screenshots/05-tryout-hasil.png`
- `qa-lolosin/screenshots/06-mobile-dashboard.png`
- `qa-lolosin/screenshots/07-mobile-drill.png`
- `qa-lolosin/screenshots/08-mobile-tryout-hasil.png`
- `qa-lolosin/screenshots/09-belajar-desktop.png`
- `qa-lolosin/screenshots/10-latihan-desktop.png`
- `qa-lolosin/screenshots/11-tryout-intro-desktop.png`
- `qa-lolosin/screenshots/12-belajar-mobile.png`
- `qa-lolosin/screenshots/13-latihan-mobile.png`
- `qa-lolosin/screenshots/14-tryout-palet-desktop.png`
- `qa-lolosin/screenshots/15-dashboard-gamifikasi-desktop.png`
- `qa-lolosin/screenshots/15-dashboard-gamifikasi-mobile.png`
- `qa-lolosin/screenshots/17-perayaan-naik-level.png`
- `qa-lolosin/screenshots/fase3-01-dashboard-seeded.png`
- `qa-lolosin/screenshots/fase3-02-dashboard-mobile.png`
- `qa-lolosin/screenshots/fase3-03-mode-ulas.png`
- `qa-lolosin/screenshots/fase3-04-drill-fokus.png`
- `qa-lolosin/screenshots/fase3-05-tryout-hasil-panel.png`
- `qa-lolosin/screenshots/fase3-06-dashboard-kosong.png`
- `qa-lolosin/screenshots/fase3-qa-01-dashboard-fokus-desktop.png`
- `qa-lolosin/screenshots/fase3-qa-02-mode-ulas-desktop.png`
- `qa-lolosin/screenshots/fase3-qa-03-panel-prediksi-hasil.png`
- `qa-lolosin/screenshots/fase3-qa-04-dashboard-mobile-seeded.png`
- `qa-lolosin/screenshots/fase3-qa-05-mode-ulas-mobile.png`
- `qa-lolosin/screenshots/simulasi-hasil-full.png`
- `qa-lolosin/screenshots/simulasi-home.png`
- `qa-lolosin/screenshots/simulasi-qa-01-pilih-mode-desktop.png`
- `qa-lolosin/screenshots/simulasi-qa-02-simulasi-jalan-desktop.png`
- `qa-lolosin/screenshots/simulasi-qa-03-hasil-simulasi-full.png`
- `qa-lolosin/screenshots/simulasi-qa-04-simulasi-jalan-mobile.png`
- `qa-lolosin/screenshots/simulasi-qa-05-pilih-mode-mobile.png`
- `qa-lolosin/screenshots/simulasi-qa-06-hasil-seeded-full.png`
- `qa-lolosin/screenshots/simulasi-qa-07-dashboard-setelah-simulasi.png`
- `qa-lolosin/screenshots/simulasi-tryout-info.png`
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
- `qa-lolosin/screenshots/v2-landing-desktop.png`
- `qa-lolosin/screenshots/v2-landing-mobile.png`
- `qa-lolosin/screenshots/v21-dashboard-desktop.png`
- `qa-lolosin/screenshots/v21-dashboard-mobile.png`
- `qa-lolosin/screenshots/v21-landing-desktop.png`
- `qa-lolosin/screenshots/v21-landing-full-desktop.png`
- `qa-lolosin/screenshots/v21-landing-gamifikasi.png`
- `qa-lolosin/screenshots/v21-landing-kenalan.png`
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
