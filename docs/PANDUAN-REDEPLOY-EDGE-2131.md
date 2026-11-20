# Panduan redeploy Edge Function kirim-kode-pemenang (v2.13.1)

Hadiah juara mingguan naik dari 7/5/3 hari jadi 30/14/7 hari. Kodenya
sudah diubah di `supabase/functions/kirim-kode-pemenang/index.ts`, tapi
Edge Function yang jalan di Supabase masih versi lama. Redeploy manual
lewat dashboard (Cupen tidak punya akses deploy Edge Function).

## Langkah

1. Buka Supabase dashboard proyek lolosin.
2. Menu Edge Functions, buka fungsi `clever-action` (nama tampilannya
   kirim-kode-pemenang).
3. Buka editor kode, hapus seluruh isi `index.ts` yang lama.
4. Paste seluruh isi file baru dari repo:
   `supabase/functions/kirim-kode-pemenang/index.ts`
   (cabang master, sesudah merge v2.13.1).
5. Klik Deploy, tunggu sampai statusnya sukses.

## Verifikasi

- Cek di dashboard bahwa fungsi sudah terdeploy (waktu deploy terbaru).
- Hadiah baru berlaku mulai pengumuman juara Senin berikutnya
  (cron `kirim-email-pemenang` Senin 01:05 UTC). Tidak ada hadiah lama
  yang berubah: kode yang sudah dibuat sebelumnya tetap memakai
  jumlah hari saat kode itu dibuat.
- Kode hadiah tetap menumpuk (stack) dengan premium yang masih aktif.
