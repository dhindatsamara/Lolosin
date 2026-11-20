# Panduan migrasi 012: pengamanan pra-beta (v2.15.2)

## Kenapa migrasi ini ada

Tiga celah ditutup sebelum beta berakhir 13 Desember 2026:

1. **Skor bisa dipalsukan lewat API.** Skor tryout dikirim dari
   client dan dipercaya begitu saja; siapa pun bisa insert skor
   150/175/225 dan jadi juara mingguan. Migrasi ini memasang
   trigger validasi di `tryout_results` yang menolak skor tidak
   masuk akal (di luar rentang, TWK/TIU bukan kelipatan 5, jumlah
   benar melebihi jumlah soal, status lulus tidak cocok dengan
   ambang, tanggal selesai di masa depan, atau `week_start`
   bukan Senin dari tanggal selesai).
2. **User bisa menjadikan dirinya premium lewat API.** Policy
   `profiles_update_own` mengizinkan user menulis kolom
   `is_premium` dan `premium_until` sendiri. Migrasi ini
   memasang trigger penjaga di `profiles` yang menolak
   perubahan `is_premium`, `premium_until`, dan `is_admin`
   bila request datang langsung dari client (role
   anon/authenticated). REVOKE kolom saja TIDAK cukup
   (ditemukan saat QA v2.15.2, diuji di Postgres lokal):
   Supabase memberi hak UPDATE tingkat tabel ke role
   authenticated, dan Postgres mengizinkan update kolom bila
   role memegang hak tingkat tabel ATAU hak kolom itu, jadi
   pencabutan kolom tidak memblokir apa pun. Itu berarti
   REVOKE `is_admin` di migrasi 009 pun sebenarnya tidak
   memblokir apa pun; trigger ini menutup celah itu juga.
   REVOKE tetap dipertahankan sebagai lapisan tambahan. Yang
   tetap bisa mengeset premium: admin-actions (service role),
   redeem code dan hadiah juara (fungsi security definer), dan
   toggle Premium Beta yang sejak v2.15.2 lewat RPC baru
   `set_beta_premium` (hanya berfungsi selama beta).
3. **Proyek free tier bisa auto-pause.** Setelah sekitar 7 hari
   tanpa aktivitas, Supabase mematikan proyek dan pg_cron ikut
   berhenti. Migrasi ini menjadwalkan job keepalive harian
   lewat pg_cron (lihat catatan jujur di bawah).

## Cara menjalankan

1. Buka Supabase dashboard proyek lolosin, menu SQL Editor.
2. Paste seluruh isi file
   `supabase/migrations/012_hardening_pra_beta.sql` dari repo
   (cabang master, sesudah merge v2.15.2).
3. Klik Run. Tunggu sampai sukses tanpa error.

## Urutan

Jalankan SETELAH migrasi 006-011. Tidak ada tenggat Senin pagi
seperti migrasi 010, tapi jalankan sebelum beta berakhir
(13 Desember 2026) supaya celah premium tertutup sebelum
premium berbayar jalan.

## Verifikasi

Jalankan query-query ini di SQL Editor:

**1. Trigger penjaga profil terpasang (harus 2 baris):**

```sql
select trigger_name, event_object_table
from information_schema.triggers
where trigger_name = 'profiles_guard_protected_columns';
```

Dua baris, bukan satu: `information_schema.triggers`
mengembalikan satu baris per event, dan trigger ini jalan
untuk INSERT dan UPDATE. Trigger inilah perlindungan utama
kolom premium/admin (bukan REVOKE, lihat penjelasan di atas).

**2. REVOKE kolom tercatat (lapisan tambahan):**

```sql
select grantee, privilege_type
from information_schema.column_privileges
where table_name = 'profiles'
  and column_name in ('is_premium', 'premium_until', 'is_admin')
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('UPDATE', 'INSERT');
```

Hasilnya 12 baris (2 role x 3 kolom x 2 hak), BUKAN 0 baris:
`column_privileges` ikut menampilkan hak tingkat tabel yang
diberikan Supabase ke role client, dan hak tingkat tabel itu
tetap ada walaupun REVOKE kolom sudah jalan. Query ini hanya
memeriksa lapisan tambahan; yang benar-benar memblokir adalah
trigger di poin 1.

**3. Policy profiles tidak memberi jalan lain:**

```sql
select policyname, cmd
from pg_policies
where tablename = 'profiles'
order by policyname;
```

Yang diharapkan: `profiles_select_public` (SELECT),
`profiles_insert_own` (INSERT),
`profiles_update_own` (UPDATE),
`profiles_delete_own` (DELETE). Policy-policy ini tetap ada,
tapi trigger penjaga yang menutup akses premium/admin:
Postgres menolak update kolom yang dilindungi walaupun policy
mengizinkan barisnya.

**4. Trigger validasi skor terpasang (harus 1 baris):**

```sql
select trigger_name, event_object_table
from information_schema.triggers
where trigger_name = 'tryout_results_validate';
```

**5. RPC beta premium ada (harus 1 baris):**

```sql
select proname
from pg_proc
where proname = 'set_beta_premium';
```

**6. Job keepalive terjadwal (harus 1 baris):**

```sql
select jobname, schedule, command
from cron.job
where jobname = 'keepalive-supabase';
```

Bila query 6 kosong, ekstensi pg_cron belum aktif: aktifkan di
Dashboard > Database > Extensions, lalu run ulang file migrasi
ini (aman di-run ulang).

## Tes cepat kunci premium (opsional)

Simulasikan request client sebagai user biasa: update
`is_premium` harus DITOLAK trigger, sementara update `formasi`
harus JALAN. Ganti `00000000-0000-0000-0000-000000000000`
dengan id user sendiri dari tabel profiles (baris `dhindaimup`).
Tidak ada data yang berubah: update pertama gagal sebelum
menulis, update kedua menulis nilai formasi yang sama.

```sql
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000000", "role": "authenticated"}';
set role authenticated;

-- Harus GAGAL: kolom premium dan admin hanya bisa diubah dari server.
update public.profiles set is_premium = true
where id = '00000000-0000-0000-0000-000000000000';

-- Harus JALAN (0 error, 1 baris terpengaruh): formasi bukan kolom lindung.
update public.profiles set formasi = formasi
where id = '00000000-0000-0000-0000-000000000000';

reset role;
```

Bila update pertama BERHASIL (tidak ada error), trigger
penjaga tidak terpasang: cek lagi hasil Run migrasi dan query
verifikasi poin 1.

## Tes cepat trigger (opsional)

Insert skor mustahil dari SQL Editor harus DITOLAK (trigger
jalan untuk semua role, termasuk postgres di SQL Editor).
Ganti `00000000-0000-0000-0000-000000000000` dengan id user
asli dari tabel profiles:

```sql
insert into public.tryout_results
  (user_id, mode, twk, tiu, tkp, passed, finished_at, week_start)
values
  ('00000000-0000-0000-0000-000000000000', 'full', 150, 175, 225,
   true, now(), (now() at time zone 'Asia/Makassar')::date);
```

Harus gagal dengan pesan `week_start ... bukan Senin dari
finished_at ...` (atau pesan validasi lain). Jangan pakai
tanggal Senin yang benar untuk tes ini, karena insert skor
sempurna yang konsisten akan LOLOS trigger dan masuk
leaderboard (itu batasan yang diketahui, lihat catatan).

## Keepalive yang dijamin jalan (langkah manual)

Catatan jujur: job pg_cron di migrasi ini belum tentu dihitung
Supabase sebagai aktivitas, karena penghitung jeda tidak aktif
didasarkan pada permintaan API/DB yang datang dari luar.
Mekanisme yang dijamin jalan adalah ping dari luar, sekali
setiap 3 hari (di dalam jendela 7 hari dengan margin aman).
Pilih salah satu:

**Opsi A: GitHub Actions (disarankan).** File workflow TIDAK
bisa di-push dari integrasi, jadi tambahkan manual lewat web
GitHub: repo Lolosin > Add file > Create new file, path
`.github/workflows/supabase-keepalive.yml`, isi:

```yaml
name: Supabase Keep-Alive
on:
  schedule:
    - cron: "0 0 */3 * *"
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase REST
        run: |
          curl -s -o /dev/null -w "%{http_code}\n" \
            "https://rhoyeloqiorbspsucljt.supabase.co/rest/v1/profiles?select=id&limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

Lalu tambahkan secret repo `SUPABASE_ANON_KEY` (Settings >
Secrets and variables > Actions): isinya publishable/anon key
dari Supabase Dashboard > Project Settings > API. Setelah
file tersimpan, tes manual dari tab Actions > Run workflow.

**Opsi B: cron-job.org (tanpa file repo).** Daftar gratis di
cron-job.org, buat job baru: URL
`https://rhoyeloqiorbspsucljt.supabase.co/rest/v1/profiles?select=id&limit=1`,
jadwal tiap 3 hari, header `apikey` dan `Authorization:
Bearer ...` dengan anon key yang sama seperti Opsi A.

Bila proyek sudah terlanjur pause sebelum keepalive jalan,
ping tidak bisa membangunkannya: buka dashboard Supabase lalu
Restore/Resume proyek secara manual.

## Sesudah beta berakhir (13 Desember 2026)

Opsional, pertahanan ekstra: bersihkan nilai `is_premium` yang
tertinggal dari toggle beta supaya tidak ada baris premium
kadaluwarsa di database:

```sql
update public.profiles set is_premium = false where is_premium;
```

Langkah ini TIDAK wajib: semua pengecekan premium (app dan
policy diskusi) sudah mengabaikan `is_premium` setelah beta
berakhir. Jangan jalankan sebelum 14 Desember 2026, karena
toggle beta masih dipakai selama beta.

## Catatan

- Trigger validasi TIDAK menangkap skor palsu yang masih
  masuk akal (mis. 140/160/200 dengan jumlah benar yang
  cocok). Validasi penuh butuh bank soal di server (hitung
  ulang dari kolom `answers`); itu hardening lanjutan, bukan
  bagian migrasi ini.
- Skor asli dari app selalu lolos trigger karena dihitung
  dari jawaban yang sama dengan aturan yang sama. Skor lama
  dari antrean percobaan ulang juga lolos (tanggal selesai
  di masa lalu tetap diizinkan).
- Toggle Premium Beta di Profil tetap jalan selama beta
  (lewat RPC `set_beta_premium`). Sesudah beta berakhir,
  toggle menampilkan pesan masa beta sudah berakhir.
