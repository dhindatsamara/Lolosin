# Riset sumber data formasi CPNS untuk menu browser formasi Lolosin

Disusun 2026-11-15 siang (WITA), menindaklanjuti janji riset setelah v2.2.1
live. Dhinda minta menu browser formasi CPNS yang dibuka, dengan filter
wilayah, jurusan, gaji, dll. (chat utama 2026-11-15 11:31 WITA).

## Kabar besar untuk Dhinda pribadi: CPNS 2026 dibuka November ini

- Rencana pembukaan disampaikan Menteri Sekretaris Negara Prasetyo Hadi
  dalam konferensi pers bersama pimpinan DPR RI pada **6 November 2026**:
  pendaftaran CPNS 2026 dilakukan pada **November 2026**.
- Perkiraan kuota: **~160.000 formasi** (pengganti ASN purnatugas).
- **Tanggal pasti belum diumumkan** BKN / KemenPANRB. Kabar tanggal
  20 November yang beredar di medsos **belum terkonfirmasi** — jangan
  dipegang.
- Formasi prioritas: Polisi Hutan, Manggala Agni, Guru Sekolah
  Terintegrasi, Guru Sekolah Unggul Garuda. Instansi yang sudah
  mengumumkan kebutuhan: Mahkamah Agung 2.830 formasi, Kementerian
  Keuangan 1.915 formasi.
- SSCASN jadi pencarian teratas Google Trends Indonesia pada Sabtu,
  14 November 2026.
- Satu-satunya portal resmi: https://sscasn.bkn.go.id. Waspada situs
  palsu (typo sacasn / ssacsn / scasn) yang mencuri NIK + nomor KK.

Sumber (dicek 2026-11-15 12:18 WITA):
- https://www.rival.co.id/18981/kenapa-sscasn-trending-cpns-2026-dibuka-november-ini-formasi-prioritasnya
- https://makassarchannel.com/siap-siap-pemerintah-membuka-rekrutmen-cpns-ini-formasi-dan-dokumen-persyaratan/
- https://klikfakta.biz.id/artikel/cpns-2026-kapan-dibuka-status-resmi

## Status portal SSCASN saat dicek (2026-11-15 12:18 WITA)

- Portal https://sscasn.bkn.go.id bisa dibuka. Beranda saat ini hanya
  menampilkan **Seleksi Sekolah Kedinasan 2026**; "TIMELINE PENGADAAN:
  Data tahapan belum tersedia."
- Ada tautan **Formasi** di navigasi, tapi rincian formasi CPNS 2026
  **belum dipublikasikan** di sana.
- Artinya: data formasi resmi 2026 belum ada yang bisa diambil hari ini.

## Bagaimana data formasi diterbitkan (pola tahun-tahun sebelumnya)

- Rincian formasi dipublikasikan serentak lewat portal SSCASN saat
  pendaftaran dibuka, di menu **Informasi Formasi**: filter instansi,
  lalu tabel jabatan + unit penempatan (satker) + alokasi kuota +
  **rentang penghasilan** + tautan PDF pengumuman resmi tiap instansi.
- Tiap instansi juga wajib mengunggah PDF pengumuman formasi di situs
  resminya masing-masing.
- Tidak ada API publik / dataset master (Excel/JSON) resmi yang bisa
  diunduh sekaligus. Data 2024 yang beredar (mis. spreadsheet Google
  rekap Kemendikbud, PDF rekap BKD Jateng) adalah rekap per instansi
  dari tahun lalu, bukan sumber resmi tunggal.
- Filter yang Dhinda mau semuanya didukung oleh struktur data SSCASN:
  wilayah (dari unit penempatan), jurusan (kualifikasi pendidikan per
  jabatan), gaji (rentang penghasilan di tabel formasi).

## Kesimpulan untuk pembangunan menu

- **Menu belum bisa dibangun dari data asli hari ini** — rincian
  formasi CPNS 2026 belum diumumkan. Membangun dari data CPNS 2024
  sebagai isi akan menyesatkan (formasi 2024 sudah tutup).
- Jalur yang benar: bangun UI + struktur datanya sekarang (skema:
  instansi, jabatan, kualifikasi/jurusan, unit penempatan/wilayah,
  kuota, rentang gaji, link PDF pengumuman), lalu isi datanya begitu
  BKN mengumumkan rincian formasi — kemungkinan akhir November 2026,
  bersamaan dengan pembukaan pendaftaran.
- Alternatif sementara: menu yang mengarahkan ke halaman Formasi
  SSCASN + daftar pengumuman instansi, tanpa data sendiri. Kurang
  berguna dibanding menunggu data asli.
- Yang perlu dipantau: pengumuman BKN / portal SSCASN. Begitu menu
  Informasi Formasi 2026 muncul, data bisa diambil (manual per
  instansi, karena tidak ada API).

## Yang belum diputuskan (butuh jawaban Dhinda)

1. Tunggu data resmi 2026 lalu bangun menu lengkap (rekomendasi), atau
   bangun UI-nya dulu dengan data contoh berlabel jelas?
2. Cakupan awal: semua instansi nasional, atau mulai dari instansi
   yang paling dicari + Pemprov NTB / Mataram dulu?
