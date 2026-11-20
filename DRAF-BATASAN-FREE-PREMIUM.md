# Draf Batasan Free vs Premium Lolosin

Disusun: 2026-11-15 — untuk direview Dhinda sebelum dibangun.
Revisi: 2026-11-15 20:11 — 5 keputusan Dhinda dimasukkan (ditandai ✅).
Revisi: 2026-11-19 — Simulasi CAT mandiri DIHAPUS, diganti Tryout Akbar
sebagai satu-satunya simulasi CAT lengkap (keputusan Dhinda 10:33).
Revisi: 2026-11-19 19:14 — Pembahasan Akbar untuk user gratis kebuka
Senin 00:00 WIB setelah event; premium langsung (keputusan Dhinda).
Status: DRAF. Belum ada yang diimplementasikan; semua yang sekarang gratis
tetap gratis selama masa beta (Premium Beta di Profil).

## Model Tryout Akbar (keputusan Dhinda 2026-11-19)

- Simulasi CAT lengkap (110 soal, kapan saja) DIHAPUS — tidak ada lagi
  dua TO yang dobel. Satu-satunya simulasi CAT lengkap adalah
  **Tryout Akbar, tiap Minggu jam 09:00–11:00 WIB** (10:00–12:00 WITA).
  Untuk latihan harian, user pakai Tryout Kilat (30 soal).
- Tryout Akbar **wajib login** (partisipasi dihitung per akun).
- **Gratis 2 kali ikut Akbar** (seumur akun gratis, angka tentatif);
  setelah itu ikut Akbar = premium. Premium tanpa batas.
- **Skor realtime (live scoreboard ala CAT BKN) = premium**, tampil
  langsung selama event. User gratis TIDAK bisa lihat skor realtime;
  papan peringkat terbuka untuk mereka **jam 16:00 WIB** (17:00 WITA).
  Skor PRIBADI tetap langsung terlihat begitu selesai mengerjakan.
- **Pembahasan per soal Akbar: premium langsung kebuka** begitu selesai
  mengerjakan; user gratis kebuka **Senin 00:00 WIB** setelah event
  Minggu itu (keputusan Dhinda 2026-11-19 19:14, menggantikan aturan
  premium-selamanya).
- Papan peringkat mingguan (Peringkat) = hasil Tryout Akbar minggu itu
  saja. Juara mingguan dipilih dari hasil Akbar (migrasi 006 mengubah
  announce_weekly_winners agar hanya menghitung jendela Akbar).

## Prinsip (dari Dhinda)

1. **Inti belajar gratis selamanya.** Materi, latihan, dan tryout adalah
   alasan orang datang; tidak ada yang dipagari sampai belajarnya terhambat.
2. **Premium = ekstra, bukan kebutuhan.** Yang berbayar adalah pendalaman,
   kemudahan, dan fitur sosial lanjutan — bukan akses ke ilmu dasar.
3. **Batasnya jelas dan jujur.** Tidak ada paywall tersembunyi di tengah
   belajar; tiap fitur premium ditandai sejak awal.
4. **Jalan gratis menuju premium tetap ada.** Juara mingguan dapat premium
   30/14/7 hari (diubah dari 7/5/3, keputusan 2026-11-19 20:52); code
   giveaway dari Dhinda; semua lewat sistem redeem code.

## Batasan yang diusulkan

### Gratis (selamanya)

✅ **Selama beta: semua user bisa akses semua fitur seperti premium**
(keputusan Dhinda 2026-11-15). Batasan di bawah berlaku setelah beta selesai.

| Fitur | Catatan |
|---|---|
| Semua materi Belajar (284 bagian) | Termasuk cheat sheet, tabel, diagram, Poin inti |
| Latihan per topik (drill 10 soal) | Tanpa batas, anti-repeat tetap jalan |
| Tryout kilat (mini CAT, 30 soal) | ✅ Maks 10x per bulan; pembahasan gratis |
| Tryout Akbar (simulasi CAT 110 soal, Minggu 09:00–11:00 WIB) | ✅ Gratis 2x seumur akun (tentatif); wajib login; skor pribadi langsung terlihat; papan peringkat terbuka jam 16:00 WIB; pembahasan kebuka Senin 00:00 WIB |
| ~~Simulasi CAT lengkap (110 soal)~~ | DIHAPUS 2026-11-19 — diganti Tryout Akbar |
| Ulas soal salah (spaced repetition) | Inti belajar, tidak dipagari |
| Rencana belajar personal (dasar) | ✅ Rencana dasar gratis; yang ADAPTIF premium (lihat bawah) |
| Prediksi kelulusan | Dihitung dari hasil tryout, tetap gratis |
| Leaderboard mingguan | Hasil Tryout Akbar minggu itu; free lihat mulai 16:00 WIB, premium realtime selama event |
| Game solo: Kuis Kilat, Kartu Kilat, Benar/Salah Kilat | Gratis |
| Battle 1v1 | ✅ Gratis (buat dan ikut) |
| Ikut sesi Quizizz orang lain | Gratis (supaya room host premium bisa terisi) |
| Streak, misi harian, lencana, Osi | Gamifikasi inti gratis |
| Browser Formasi | Gratis (juga pintu masuk trafik) |

### Premium

| Fitur | Kenapa premium |
|---|---|
| ✅ Host SEMUA (sesi Quizizz, turnamen, room khusus) | Aturan bersih: host = premium, 1v1 = gratis |
| Peta kelemahan visual | Analisis akurasi per subtopik + tren naik/turun; data sudah ada, tampilannya yang premium |
| ✅ Rencana belajar ADAPTIF | Rencana yang menyesuaikan otomatis dari hasil latihan/tryout; rencana dasar tetap gratis |
| Riwayat tryout lengkap + tren skor | Free: 5 tryout terakhir; Premium: semua riwayat + grafik tren per subtes |
| Tryout kilat tanpa batas + ikut Tryout Akbar tiap Minggu | Kuota free: 10 kilat per bulan + 2 Akbar seumur akun |
| Skor realtime Tryout Akbar (live scoreboard) | Live selama event; free baru lihat papan jam 16:00 WIB |
| ✅ Pembahasan langsung Tryout Akbar | Premium: pembahasan per soal 110 soal langsung kebuka; gratis: kebuka Senin 00:00 WIB setelah event |
| Outfit/aksesoris Osi edisi premium | Kosmetik saja; outfit streak tetap gratis |
| Akses awal fitur baru | Termasuk tryout akbar kursi prioritas bila ramai |

### Yang TIDAK akan dipremiumkan

- Pembahasan soal di drill dan tryout kilat (per-opsi). Ini hak belajar,
  bukan fitur mewah. Pembahasan per soal TRYOUT AKBAR (110 soal):
  premium langsung kebuka; user gratis kebuka Senin 00:00 WIB setelah
  event (keputusan 2026-11-19 19:14, menggantikan aturan premium-
  selamanya dari 2026-11-15 20:20); skor, nilai per subtes, dan
  prediksi Akbar tetap gratis langsung.
- Materi baru yang ditambahkan nanti (termasuk dari bank soal Drive).
- Diskusi per soal: baca gratis untuk semua, nulis (komentar + balasan) hanya Premium (keputusan 2026-11-19 19:46, menggantikan "komunitas harus terbuka" dari 2026-11-15).

## Harga (keputusan Dhinda 2026-11-15)

- ✅ **Rp30.000/bulan, diskon jadi Rp20.000/bulan** (untuk marketing:
  harga coret 30k → 20k, diskon 33%). Bingkai sebagai "harga peluncuran"
  supaya diskonnya jujur, bukan diskon palsu permanen. (Diubah dari 25k →
  15k, keputusan 2026-11-19 20:43.)
- Paket 3 bulan, 6 bulan, dan tahunan DIHAPUS (keputusan 2026-11-20):
  Paket SKD 69 ribu membuat ketiganya tidak masuk akal (lebih mahal
  dari Paket SKD yang lifetime). Tinggal 2 paket: Paket SKD + bulanan.
- Prinsip harga: setelah diskon, minimal Rp15.000/user/bulan (keputusan
  2026-11-19 20:45). Semua paket di atas memenuhi lantai ini.
- ✅ **Paket SKD: Rp99.000 sekali bayar, diskon jadi Rp69.000** (semua
  fitur premium selamanya, LIFETIME; paket utama/hero, keputusan
  2026-11-19 20:51; lifetime diputuskan Dhinda 2026-11-20,
  menggantikan rencana awal "sampai SKD berakhir"; teknisnya
  premium_until diisi 31 Desember 2099). Langganan bulanan Rp20rb
  tetap ada buat yang mau coba dulu. Lantai 15k/bulan tetap
  dipenuhi paket Bulanan (Rp20rb/bulan).
- Pembayaran (dibangun v2.15): QRIS manual dulu seperti warung,
  gateway bila sudah ramai.
- Jalur gratis ke premium: juara mingguan (30/14/7 hari), code giveaway
  dari Dhinda, dan Premium Beta selama masa beta.

## Penegakan (catatan teknis)

- Status premium di `profiles.is_premium` + tanggal kedaluwarsa
  (tambah kolom bila perlu di migrasi 004, bareng tabel redeem code).
- Cek premium di client + RLS di server untuk fitur yang sensitif
  (host sesi, peta kelemahan).
- Selama beta, toggle "Premium Beta" di Profil memberi semua akses
  premium; toggle dimatikan saat monetisasi resmi jalan.
- Redeem code memberi premium sejumlah hari; code pemenang mingguan
  dikirim otomatis ke email (butuh SMTP kustom — sedang disiapkan).
- Kode hadiah menumpuk (stack): harinya ditambahkan ke masa premium
  yang masih aktif, jadi sisa premium tidak hangus (keputusan 2026-11-20).

## Pertanyaan terbuka untuk Dhinda

1. ~~Periode kuota free: per minggu atau per bulan?~~ — TERJAWAB
   2026-11-15 20:12: **per minggu**.
2. ~~Pembahasan simulasi gratis~~ — TERJAWAB 2026-11-15 20:20:
   simulasi gratis dapat SKOR + nilai per subtes + prediksi kelolosan,
   tapi TIDAK dapat pembahasan per soal; pembahasan lengkap simulasi
   adalah fitur premium.
   REVISI 2026-11-19 19:14: untuk Akbar, gratis tetap dapat pembahasan,
   kebuka Senin 00:00 WIB setelah event; premium langsung.
3. ~~Harga tahunan~~ — TERJAWAB 2026-11-15 20:13: **Rp120.000/tahun**.
4. ~~Simulasi CAT: gratis tanpa batas atau dibatasi?~~ — TERJAWAB (v2.11):
   simulasi CAT mandiri DIHAPUS, diganti Tryout Akbar tiap Minggu; free 2x
   seumur akun, premium ikut tiap Minggu.
5. ~~Rencana belajar personal: gratis atau premium?~~ — TERJAWAB:
   dasar gratis, adaptif premium.
6. ~~Harga: Rp15rb atau Rp10rb?~~ — TERJAWAB: Rp20rb diskon Rp12rb.
7. ~~Host battle turnamen vs host sesi~~ — TERJAWAB: host semua premium.
