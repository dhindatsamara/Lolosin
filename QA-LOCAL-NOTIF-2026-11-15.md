# QA Lokal Lolosin — v2.3.4 (Osi beranda ikut avatar + lonceng notifikasi)

**Tanggal:** 2026-11-15
**Commit yang diuji:** `a95196e` ("v2.3.4: Osi beranda ikut avatar pilihan + lonceng notifikasi undangan battle")
**Target:** worktree terisolasi `/tmp/lolosin-qa-v234` (HEAD terpisah `a95196e`), build placeholder env
(`VITE_BASE_PATH=/Lolosin/` + `VITE_SUPABASE_URL=https://placeholder.supabase.co`)
dilayani `vite preview` port **4197**; build kedua env Supabase palsu
(`https://fake-lolosin-qa.supabase.co`) dilayani `python3 -m http.server` port **4198**
untuk seksi 11 (semua request ke `*.supabase.co` diblokir by-design, tanpa panggilan API live).
**Metode:** Playwright + Chromium headless di VM. Script: `~/workspace/qa-lolosin/qa.mjs`
(seksi 15 baru, 12 cek) dijalankan lewat salinan `qa-v234.mjs` (port 4197/4198),
`QA_APP_DIR=/tmp/lolosin-qa-v234`. Log: `~/workspace/qa-lolosin/qa-run-v234.log`.
Screenshot: `~/workspace/qa-lolosin/screenshots/v234-*.png`.

## Verdict: SIAP

Total cek: **369** | PASS: **369** | FAIL: **0** | Console error (non-lingkungan): 0 |
Page error: 0 | Request gagal/≥400 (non-lingkungan): 0 | Console warning: 0

## Hasil seksi 15 (baru, 12/12 PASS)

| Cek | Hasil | Bukti |
|---|---|---|
| Mode tamu: lonceng tidak tampil | PASS | 0 tombol "Notifikasi" di header |
| Default: hero Osi varian wisuda, topi tampil | PASS | topi=true, headphone=false, kacamata=false |
| Ketuk Osi: balon ucapan berganti | PASS | "Aku nemenin kamu belajar hari ini!" -> "Kamu bisa, gas terus!" |
| Varian musik: hero tanpa topi + headphone tampil | PASS | topi=false, headphone=true, kacamata=false |
| Varian musik: PetCard tetap pakai topi | PASS | topi di PetCard: true |
| Varian musik: Mascot dekoratif Tryout tetap pakai topi | PASS | topi: true |
| Varian musik: Mascot dekoratif Fokus tetap pakai topi | PASS | topi: true |
| Varian kacamata + streak putus: kacamata + topi tampil di hero | PASS | topi=true, headphone=false, kacamata=true |
| Varian kacamata + streak putus: Osi ngambek, mood marah menang | PASS | balon "Hmph! Kemarin kamu nggak belajar." tampil |
| Mobile varian musik: hero tanpa topi + headphone tampil | PASS | topi=false, headphone=true |
| Mobile: dashboard tanpa overflow | PASS | |
| Mobile mode tamu: lonceng tidak tampil | PASS | 0 tombol "Notifikasi" di header |

Verifikasi visual screenshot: `v234-hero-musik.png` (Osi headphone tanpa topi, rapi),
`v234-hero-kacamata-putus.png` (Osi berkacamata + topi, mulut cemberut + balon "Hmph!" +
kartu Bujuk Osi tampil; alis marah tertutup kacamata, tapi mood ngambek tetap terbaca
dari mulut + balon + kartu Bujuk). Header tamu tanpa lonceng di kedua screenshot.

## Perbaikan cek basi selama QA (bukan cacat v2.3.4)

Run pertama: 368/369, 1 FAIL di seksi 13 ("Materi Baru — index.json: 19 dokumen,
284 seksi, 79.612 kata"). Penyebab: ekspektasi kata di `qa.mjs` masih angka v2.3.1
(79.612), sedangkan rewrite v2.3.3 menaikkan total jadi 79.843 kata (tercatat di
REDESIGN-V2.md) tanpa memperbarui cek itu. v2.3.4 tidak menyentuh materi sama sekali.
Cek diperbarui ke 79.843 kata (label jadi "v2.3.1 + v2.3.3"), lalu QA penuh diulang:
**369/369 PASS**.

## Yang TIDAK bisa diuji di QA lokal (butuh akun + Supabase live)

Alur lonceng saat ada undangan (badge angka, panel daftar undangan, Terima/Tolak,
badge hilang setelah panel dibuka) tidak bisa diuji di VM: mode lokal tidak ada user
login dan Supabase palsu tidak punya data battle. Kode mengikuti persis pola yang
sudah teruji di BattlePage (`getIncomingInvites`, `acceptBattleInvite`,
`abandonBattle`, `getBattleUsernames`, polling 3 detik) dan TypeScript lolos tanpa
error, tapi verifikasi end-to-end harus dilakukan manual setelah push (lihat
"Cara uji manual" di laporan penyelesaian). QA lokal hanya mengunci sisi tamu:
lonceng absen saat belum login, di desktop dan mobile.
