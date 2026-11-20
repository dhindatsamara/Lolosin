# Panduan migrasi 010: hadiah juara mingguan 30/14/7 hari

## Kenapa migrasi ini ada

Hadiah juara mingguan naik dari 7/5/3 hari jadi 30/14/7 hari
(keputusan 2026-11-19). Aplikasi, email, dan halaman utama sudah
diubah di v2.13.1, tapi fungsi pengumuman juara di database
(`announce_weekly_winners`, dari migrasi 006) masih membuat kode
hadiah dengan jumlah hari lama. Tanpa migrasi ini, email Senin akan
bilang "30 hari" padahal kodenya cuma memberi 7/5/3 hari.

## Cara menjalankan

1. Buka Supabase dashboard proyek lolosin, menu SQL Editor.
2. Paste seluruh isi file `supabase/migrations/010_winner_prize_30_14_7.sql`
   dari repo (cabang master, sesudah merge v2.13.2).
3. Klik Run. Tunggu sampai sukses tanpa error.

## Urutan

Jalankan migrasi yang tertunda secara berurutan: 006, 007, 008,
009, baru 010. Migrasi 010 harus jalan SEBELUM cron pengumuman
Senin 01:00 UTC (09:00 WITA), kalau tidak juara minggu itu tetap
dapat kode 7/5/3 hari.

## Verifikasi

Jalankan query ini di SQL Editor, harus mengembalikan 30, 14, 7:

```sql
select
  pg_get_functiondef('public.announce_weekly_winners()'::regprocedure)
  ~ 'when 1 then 30' as juara1_30,
  pg_get_functiondef('public.announce_weekly_winners()'::regprocedure)
  ~ 'when 2 then 14' as juara2_14,
  pg_get_functiondef('public.announce_weekly_winners()'::regprocedure)
  ~ 'else 7 end' as juara3_7;
```

## Catatan

- Kode hadiah yang sudah dibuat sebelum migrasi ini tidak berubah:
  jumlah harinya sudah tersimpan di tabel `codes`.
- Ranking, jendela Akbar, dan masa berlaku kode (30 hari) tidak
  berubah. Hanya jumlah hari hadiahnya yang naik.
