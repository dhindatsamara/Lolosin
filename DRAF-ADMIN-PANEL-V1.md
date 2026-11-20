# Draf Admin Panel v1 + Peringkat Sendiri (Lolosin)

Disiapkan 2026-11-18 (Rabu) siang, buat dikonfirmasi Dhinda sebelum dibangun.
Keputusan dasar: Dhinda 2026-11-17 15:55, admin panel tetap dibangun biar gampang ngatur,
peringkat sendiri di halaman Peringkat wajib ada. Dibangun SETELAH push gabungan
(v2.5 sampai v2.8.3 + parse penuh), bukan dicampur ke push itu.

## 1. Admin panel v1, scope yang diusulkan

Satu halaman `/admin`, khusus akun admin (Dhinda). Isinya 5 modul:

1. **Statistik singkat**: total user, user baru minggu ini, tryout minggu ini,
   simulasi selesai minggu ini.
2. **Daftar user**: cari berdasarkan username/email, lihat progres (XP, streak,
   tryout terakhir), kasih atau cabut premium manual, lihat status premium sampai kapan.
3. **Kode redeem**: bikin kode baru (nominal hari premium), lihat daftar kode,
   mana yang sudah dipakai dan oleh siapa.
4. **Juara mingguan**: daftar juara tiap minggu, status email kode sudah terkirim atau belum,
   kirim ulang kalau gagal.
5. **Ringkasan bank soal**: total soal per subtes (TWK/TIU/TKP), soal tanpa kunci,
   soal tanpa pembahasan. Cuma ringkasan, bukan edit soal.

**Di luar v1** (nanti kalau perlu): kelola pengumuman, ekspor data.
Tambah/edit soal dan kelola materi lewat panel DITOLAK Dhinda
2026-11-20 10:34 (bukan cuma ditunda): penambahan soal/materi tetap
lewat Cupen supaya diolah dan difilter dulu, baru push ke GitHub,
karena khawatir kualitasnya jelek kalau lewat panel.

## 2. Peringkat sendiri di halaman Peringkat

- Setiap user yang login melihat kartu "Peringkatmu" di atas leaderboard:
  peringkat global (misal #12 dari 340) plus peringkat per formasi.
- Peringkat memakai aturan tie-break yang sudah diputuskan 2026-11-15 20:52:
  total skor tertinggi, lalu lulus 3 ambang (TWK 65, TIU 80, TKP 156),
  lalu yang paling dulu selesai.
- Guest (belum login) tidak melihat kartu ini, cuma leaderboard umum.

## 3. Keputusan Dhinda (2026-11-20 10:19, sudah dikonfirmasi)

1. **Cara kenali admin**: kolom `is_admin` di tabel `profiles` lewat migrasi
   baru (009). Dhinda setuju.
2. **Scope**: 5 modul TETAP semua, termasuk modul 5 (ringkasan bank soal).
   Dhinda bertanya kenapa modul 5 dicoret, lalu sempat mengira modul 5
   adalah ringkasan materi; setelah dijelaskan bahwa modul 5 adalah
   angka-angka bank soal (total per subtes, soal tanpa kunci, soal
   tanpa pembahasan) untuk memantau, Dhinda mengonfirmasi TETAP
   (2026-11-20 10:31). Modul 5 read-only: menambah soal/materi lewat
   panel TIDAK masuk v1 (tetap lewat kode/file bank seperti sekarang);
   modulnya dipakai untuk memverifikasi hasil penambahan (total naik,
   tidak ada kunci/pembahasan yang hilang).
3. **Aksi premium dari panel** lewat Edge Function khusus. Dhinda minta
   dipandu langkah demi langkah saat setup/deployment-nya.

## 4. Catatan keamanan (jangan dilupakan)

Dua celah dari pre-push review tetap berlaku dan wajib ditutup sebelum beta berakhir:
skor leaderboard dikirim dari client (bisa dipalsukan), dan policy update `profiles`
kemungkinan membiarkan user set premium sendiri lewat API. Admin panel v1 tidak boleh
nambah celah baru: semua aksi admin harus dicek di sisi server, bukan cuma disembunyikan
di tampilan.

## 5. Urutan kerja setelah push gabungan

1. ~~Dhinda konfirmasi 3 pertanyaan di bagian 3.~~ SELESAI 2026-11-20.
2. Migrasi (kalau pakai `is_admin`) + route `/admin` + 5 modul + kartu peringkat sendiri.
3. QA lokal + review screenshot/video sebelum push, sesuai aturan push Dhinda.
