# Otomatisasi juara mingguan Lolosin (diimplementasikan di v2.7, migrasi 004)

Disusun 2026-11-14 siang (WITA), setelah integrasi Supabase + leaderboard v1
selesai (commit lokal `16440c0`, QA 216/216, push ke GitHub masih menunggu
approval Dhinda).

STATUS 2026-11-15: SUDAH DIIMPLEMENTASIKAN di v2.7, migrasi 004
(`supabase/migrations/004_redeem_codes_progress.sql`). Fungsi
`announce_weekly_winners` di migrasi 004 adalah fungsi dari dokumen
ini, ditambah dua hal: (a) premium langsung ke
`profiles.premium_until` tiap juara global (diperpanjang dari tanggal
aktif terjauh), dan (b) satu kode klaim single-use per juara global
di tabel `codes`. Blok `pg_cron` ada di akhir file 004 (dikomentari,
dijalankan terpisah setelah ekstensi diaktifkan). Panduan menjalankan
untuk Dhinda: `docs/PANDUAN-MIGRASI-004.md`. Dokumen ini tetap
disimpan sebagai referensi desain dan aturan yang diputuskan.

STATUS 2026-11-15 (v2.8, migrasi 005): DESAIN DIUBAH JADI CODE-ONLY.
Pemberian premium langsung di 004 ternyata double-grant: juara
mendapat premium langsung PLUS satu kode, sehingga premium bertumpuk
bila kodenya di-redeem. Sejak v2.8, `announce_weekly_winners`
(migrasi 005, nama + signature return sama, jadwal pg_cron lama
tetap jalan) HANYA membuat satu kode single-use per juara global
(7/5/3 hari sesuai rank, berlaku 30 hari) dan menyimpannya ke
`weekly_winners.code`; `premium_until` di `weekly_winners` selalu
NULL dan tidak ada lagi update `profiles.premium_until` di fungsi
ini. Premium juara HANYA aktif lewat redeem kode di app (Profil,
bagian Premium). Kode juga dikirim ke email juara oleh Edge Function
`kirim-kode-pemenang` (Resend API, dipicu pg_cron + pg_net tiap
Senin 09:05 WITA, 5 menit setelah pengumuman) dan ditampilkan di
gift notice dalam app beserta tombol salin + CTA tebus. Email
diambil dari `auth.users` lewat Admin API, karena tabel `profiles`
tidak punya kolom email. Panduan menjalankan untuk Dhinda:
`docs/PANDUAN-MIGRASI-005.md`.

## Masalah yang diselesaikan

Keputusan hadiah sudah dikunci 2026-11-13 dan DIPERBARUI 2026-11-15:
juara 1 global dapat premium 7 hari + badge prestise, juara 2 premium
5 hari + badge, juara 3 premium 3 hari + badge. Juara per formasi
hanya dapat badge prestise, TANPA premium (keputusan 2026-11-15).
Di v1 yang sudah dibangun, yang ada baru setengahnya:

- Tabel `weekly_winners` sudah dibuat di migrasi
  `supabase/migrations/001_leaderboard.sql`, tapi TIDAK PERNAH diisi.
  Tidak ada kode apa pun yang menulis ke tabel itu.
- `src/lib/leaderboard.ts` (`fetchLastWeekTop3`) menghitung tiga besar
  minggu lalu secara live dari `tryout_results`, tanpa cron dan tanpa
  membaca `weekly_winners`.
- Tidak ada lencana juara mingguan di `src/lib/badges.ts` (13 lencana,
  tidak ada yang mingguan).
- Tidak ada flag premium di `src/lib/store.ts` (grep `premium` kosong).
  App juga belum punya fitur berbayar yang dikunci, jadi `premium_until`
  di v1 otomatisasi ini baru tercatat, penegakannya menyusul saat
  subscription dibangun.

Jadi hari ini juara mingguan hanya tampil sebagai "tiga besar minggu lalu"
di halaman Peringkat, tanpa premium dan tanpa badge. Dokumen ini menutup
celah itu.

## Keputusan desain (sudah dicocokkan ke kode v1)

- Minggu = Senin sampai Minggu, zona Asia/Makassar. Sama persis dengan
  `getMondayWITA` / `getPreviousWeekStart` di `src/lib/leaderboard.ts`.
  Satu minggu hanya diumumkan setelah minggunya selesai.
- Yang diranking hanya simulasi CAT lengkap (`mode = 'full'`, 110 soal).
  Tryout kilat (`mini`) tidak masuk, sesuai aturan v1.
- Satu user satu skor per minggu: skor TERBAIK yang dipakai, bukan jumlah
  percobaan. Sama dengan aturan anti-spam v1.
- Seri (total sama) — ATURAN DIPUTUSKAN Dhinda 2026-11-15 20:52:
  (1) skor total tertinggi menang; (2) kalau total seri, yang LOLOS
  SEMUA ambang batas (TWK ≥65, TIU ≥80, TKP ≥156) menang atas yang
  ada subtesnya tidak lolos — cermin aturan CPNS beneran, gagal satu
  subtes = tidak lolos walau total tinggi; (3) kalau masih seri, yang
  lebih dulu selesai menang (finished_at paling awal). Di SQL:
  `order by total desc, passed desc, finished_at asc` — kolom
  `passed` di `tryout_results` sudah berarti lolos ketiga ambang
  (lihat `passedOverall` di `src/lib/quiz.ts`).
- Scope: `global` untuk semua user, plus satu scope per formasi yang
  diikuti minggu itu. Formasi dikelompokkan setelah dinormalisasi
  (trim, huruf kecil, spasi ganda dirapikan), persis
  `normalizeFormasi` di `src/lib/leaderboard.ts`, supaya
  "Analis Kebijakan" dan "analis kebijakan" tidak jadi dua ranking.
  Nama scope yang disimpan adalah ejaan asli pertama yang ditemui.
- `premium_until`: DI v2.7 dihitung dari jam pengumuman berjalan
  (now()), juara 1 tambah 7 hari, juara 2 tambah 5 hari, juara 3
  tambah 3 hari. SEJAK v2.8 (migrasi 005) kolom ini SELALU NULL:
  premium tidak lagi diberikan langsung, juara menebus kode
  hadiahnya di app dan premium aktif lewat `redeem_code`. Hadiah
  per peringkat tetap sama (7/5/3 hari), hanya cara aktifnya yang
  berubah. Hanya scope global yang dapat kode hadiah; juara per
  formasi `premium_until`-nya NULL dan `code`-nya NULL (badge saja).
- Idempotent dan bisa mengejar ketertinggalan: fungsi memproses SEMUA
  minggu yang sudah selesai tapi belum diumumkan, bukan hanya minggu
  lalu. Jadi kalau satu minggu terlewat, minggu itu tetap diumumkan
  di run berikutnya, hanya tertunda, bukan hilang.

## Kenapa fungsi SQL, bukan Edge Function

Pekerjaan ini murni SQL (ranking + insert). Supabase punya `pg_cron`
untuk menjadwalkan pemanggilan fungsi SQL langsung, tanpa HTTP,
tanpa Edge Function, tanpa service role key, tanpa Vault. Lebih
sedikit rahasia, lebih sedikit yang bisa rusak. Edge Function hanya
dibutuhkan kalau nanti pengumuman mau memicu sesuatu di luar database
(misal kirim notifikasi), dan itu belum ada di rencana.

## Batasan free tier Supabase (penting, sudah terverifikasi)

- Proyek free tier auto-pause setelah sekitar 7 hari tanpa aktivitas
  API. Saat pause, `pg_cron` berhenti dan job yang terlewat tidak
  jalan sendiri.
- Karena itu fungsi di bawah dirancang mengejar semua minggu yang
  tertinggal saat pertama kali jalan lagi. Selagi ada user yang
  mengirim skor simulasi, aktivitas itu sendiri menjaga proyek tetap
  bangun. Kalau seminggu penuh tidak ada satu pun simulasi, job bisa
  terlewat dan perlu dijalankan manual sekali dari SQL Editor
  (`select public.announce_weekly_winners();`).
- Keepalive eksternal (ping terjadwal dari luar Supabase) adalah
  keputusan terpisah, belum diputuskan. Jangan dicampur ke langkah ini.

## Langkah 1: fungsi pengumuman (SQL, jalankan di SQL Editor)

STATUS: sudah diimplementasikan di migrasi 004
(`supabase/migrations/004_redeem_codes_progress.sql`, v2.7), dengan
tambahan pemberian premium langsung ke profil juara global dan satu
kode klaim per juara global. SEJAK v2.8, migrasi 005
(`supabase/migrations/005_discussions_winners_fix.sql`) MENIMPA
fungsi ini dengan versi code-only: ranking + insert sama persis,
tapi premium langsung DIHAPUS (premium_until selalu NULL, tidak ada
update profiles) dan kode hadiah disimpan ke `weekly_winners.code`.
Versi di migrasi 005 adalah versi yang berlaku; listing di bawah
ini adalah draf aslinya dan disimpan sebagai referensi.

```sql
-- Mengumumkan juara semua minggu yang sudah selesai tapi belum diumumkan.
-- Aman dijalankan ulang: baris yang sudah ada dilewati (unique
-- week_start, scope, rank di tabel weekly_winners).
create or replace function public.announce_weekly_winners()
returns table (
  week_start date,
  scope text,
  rank int,
  user_id uuid,
  total int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week date;
  v_monday_now date;
begin
  -- Senin minggu berjalan, zona Asia/Makassar. Minggu yang diumumkan
  -- harus sudah selesai, jadi hanya minggu sebelum Senin ini.
  v_monday_now := (now() at time zone 'Asia/Makassar')::date
    - ((extract(isodow from (now() at time zone 'Asia/Makassar')::date)::int - 1));

  for v_week in
    select distinct w.week_start
    from public.tryout_results w
    where w.mode = 'full'
      and w.week_start < v_monday_now
      and not exists (
        select 1 from public.weekly_winners ww
        where ww.week_start = w.week_start and ww.scope = 'global'
      )
    order by w.week_start
  loop
    -- Juara global: skor terbaik per user, seri diputus aturan
    -- Dhinda 2026-11-15: total tertinggi, lalu yang lolos semua
    -- ambang batas, lalu yang paling dulu selesai.
    insert into public.weekly_winners
      (week_start, scope, rank, user_id, total, premium_until, badge_awarded)
    select
      v_week, 'global', ranked.rn, ranked.user_id, ranked.total,
      case ranked.rn
        when 1 then now() + interval '7 days'
        when 2 then now() + interval '5 days'
        else now() + interval '3 days' end,
      false
    from (
      select
        b.user_id, b.total, b.finished_at,
        row_number() over (
          order by b.total desc, b.passed desc, b.finished_at asc
        ) as rn
      from (
        select distinct on (t.user_id)
          t.user_id, t.total, t.passed, t.finished_at
        from public.tryout_results t
        where t.mode = 'full' and t.week_start = v_week
        order by t.user_id, t.total desc, t.passed desc, t.finished_at asc
      ) b
    ) ranked
    where ranked.rn <= 3
    on conflict (week_start, scope, rank) do nothing;

    -- Juara per formasi: scope per formasi yang diikuti minggu itu.
    -- Pengelompokan memakai formasi yang dinormalisasi (huruf kecil,
    -- spasi dirapikan), supaya "Analis Kebijakan" dan
    -- "analis kebijakan" jadi satu ranking. Nama scope yang disimpan
    -- adalah ejaan asli pertama (alfabetis) dari varian itu.
    -- Juara per formasi hanya dapat badge, TANPA premium
    -- (keputusan 2026-11-15): premium_until NULL.
    insert into public.weekly_winners
      (week_start, scope, rank, user_id, total, premium_until, badge_awarded)
    select
      v_week, ranked.scope_display, ranked.rn, ranked.user_id, ranked.total,
      null,
      false
    from (
      select
        b.scope_norm,
        min(b.scope_raw) over (partition by b.scope_norm) as scope_display,
        b.user_id, b.total, b.finished_at,
        row_number() over (
          partition by b.scope_norm
          order by b.total desc, b.passed desc, b.finished_at asc
        ) as rn
      from (
        select distinct on (t.user_id)
          lower(btrim(regexp_replace(p.formasi, '\s+', ' ', 'g'))) as scope_norm,
          btrim(p.formasi) as scope_raw,
          t.user_id, t.total, t.passed, t.finished_at
        from public.tryout_results t
        join public.profiles p on p.id = t.user_id
        where t.mode = 'full'
          and t.week_start = v_week
          and p.formasi is not null
          and btrim(p.formasi) <> ''
        order by t.user_id, t.total desc, t.passed desc, t.finished_at asc
      ) b
    ) ranked
    where ranked.rn <= 3
    on conflict (week_start, scope, rank) do nothing;
  end loop;

  return query
    select ww.week_start, ww.scope, ww.rank, ww.user_id, ww.total
    from public.weekly_winners ww
    order by ww.week_start desc, ww.scope, ww.rank;
end;
$$;
```

Catatan: `security definer` dibutuhkan karena fungsi membaca
`tryout_results` dan menulis `weekly_winners`, yang tidak bisa
ditulis dari client (sengaja, sesuai RLS di migrasi 001). Fungsi ini
hanya dipanggil dari `pg_cron` dan dari SQL Editor, bukan dari app.

## Langkah 2: jadwal mingguan (SQL, jalankan di SQL Editor)

STATUS: blok jadwal ini ada di akhir migrasi 004 (dikomentari),
dijalankan terpisah setelah ekstensi `pg_cron` diaktifkan. Lihat
`docs/PANDUAN-MIGRASI-004.md` langkah 3 dan 4.

```sql
-- Aktifkan pg_cron (sekali saja, dari Dashboard > Database > Extensions
-- atau dari SQL Editor bila diizinkan).
create extension if not exists pg_cron;

-- Setiap Senin 01:00 UTC = 09:00 WITA, umumkan juara minggu lalu
-- (plus minggu mana pun yang tertinggal).
select cron.schedule(
  'umumkan-juara-mingguan',
  '0 1 * * 1',
  $$ select public.announce_weekly_winners(); $$
);
```

Cek jadwal dan riwayat jalan di `select * from cron.job;` dan
`select * from cron.job_run_details order by start_time desc limit 10;`.

## Langkah 3: app membaca hadiah (checklist implementasi, belum dikerjakan)

1. `src/lib/badges.ts`: tambah definisi lencana ke-14, misal
   id `juara-mingguan`, nama "Juara Mingguan", ikon mahkota.
   Lencana ini TIDAK bisa dicek dari state lokal seperti 13 lencana
   lain, karena juaranya ditentukan server. Pemberiannya harus
   dipicu dari hasil baca `weekly_winners`.
2. `src/lib/store.ts`: tambah field `premiumUntil: string | null`
   di state, supaya status premium bertahan antar sesi.
3. `src/lib/leaderboard.ts`: tambah `fetchMyWins()` yang membaca
   `weekly_winners` untuk user login (`user_id` = id sendiri,
   `premium_until` > now()). Dipanggil saat login dan saat halaman
   Peringkat dibuka. Kalau ada baris baru, tambahkan lencana
   `juara-mingguan` dan simpan `premiumUntil` terjauh. CATATAN v2.8:
   bagian "simpan premiumUntil" ini SUDAH TIDAK BERLAKU.
   `checkWeeklyWins` sekarang hanya memberi lencana + gift notice
   berisi kode hadiah; premium aktif saat user menebus kodenya.
4. `LeaderboardPage.tsx`: ganti "tiga besar minggu lalu" live dengan
   baris dari `weekly_winners` (atau tampilkan keduanya dengan label
   jelas), supaya yang tampil adalah juara resmi yang sudah diumumkan.
5. QA lokal seperti biasa (skrip Playwright yang sudah ada) + 1 run
   manual: isi 3 skor dummy minggu lalu di project Supabase, jalankan
   `select public.announce_weekly_winners();`, verifikasi 3 baris
   global muncul dengan `premium_until` yang benar, lalu hapus data
   dummy. Setelah itu push + deploy seperti biasa.

## Yang belum diputuskan (butuh jawaban Dhinda sebelum dibangun)

- Penegakan premium (fitur apa yang terkunci kalau tidak premium)
  belum ada di app, jadi di langkah ini premium hanya tercatat dan
  ditampilkan. Penegakannya diputuskan saat subscription dibangun
  (batasan free vs premium sudah diputuskan 2026-11-15, lihat
  `DRAF-BATASAN-FREE-PREMIUM.md`).
- Pengiriman code pemenang lewat email memakai sistem redeem code
  (diputuskan 2026-11-15 19:45). Sistem redeem code sudah dibangun
  di v2.7 (migrasi 004: tabel `codes` dan `code_redemptions`, RPC
  `redeem_code` dan `create_redeem_code`). Email otomatis DIBANGUN
  di v2.8: Edge Function `kirim-kode-pemenang` (Resend API) yang
  dijadwalkan pg_cron + pg_net tiap Senin 09:05 WITA, mengirim
  kode ke email juara global yang `email_sent_at`-nya masih NULL
  (lihat migrasi 005 + `docs/PANDUAN-MIGRASI-005.md`). SMTP custom
  Supabase tetap hanya untuk email auth, jadi email hadiah memang
  tidak pernah lewat SMTP Supabase.

## Keputusan 2026-11-15 (sudah dikunci, masuk draf ini)

- Hadiah dibedakan per peringkat: juara 1 premium 7 hari, juara 2
  premium 5 hari, juara 3 premium 3 hari, semua plus badge prestise.
- Juara per formasi: badge prestise saja, TANPA premium. Premium
  hanya untuk juara global.
- Aturan seri DIPUTUSKAN 2026-11-15 20:52: total tertinggi, lalu yang
  lolos semua ambang batas (TWK ≥65, TIU ≥80, TKP ≥156), lalu yang
  paling dulu selesai.
- Hadiah juara mingguan ditulis di web sebagai marketing (landing
  page + halaman Peringkat, v2.2.3).

## Cakupan tambahan yang diminta Dhinda (2026-11-15, belum dirancang)

- **Gift lewat notifikasi**: tiap juara menerima hadiahnya sebagai
  gift yang muncul lewat notifikasi di akunnya (bukan diam-diam
  tercatat). Butuh desain: tabel notifikasi atau penanda gift di
  client, tampilan klaim gift, dan penanda sudah diklaim.
- **Kode klaim premium (dev)**: Dhinda sebagai dev bisa membagikan
  kode yang bisa diklaim user untuk mendapatkan premium. Sudah
  dibangun di v2.7: sisi database (migrasi 004: tabel `codes` dan
  `code_redemptions`, RPC `redeem_code` dan `create_redeem_code`,
  pencegahan klaim ganda lewat primary key) dan sisi app (field
  redeem di halaman Profil bagian Premium + generator kode dev
  khusus akun Dhinda).
- **Tryout akbar**: tryout terjadwal yang benar-benar realtime
  seperti simulasi CAT CPNS (semua peserta mulai bersamaan di jadwal
  yang ditentukan). Ini varian besar dari "TO live mingguan"
  (diferensiasi Fase 3 no. 4). Butuh desain terpisah: penjadwalan
  event, pendaftaran, mulai serentak, dan leaderboard live.

## Verifikasi yang sudah dilakukan untuk draf ini

- Skema tabel + RLS dibaca dari
  `supabase/migrations/001_leaderboard.sql` (165 baris): kolom
  `weekly_winners` cocok dengan yang dipakai fungsi di atas, termasuk
  unique `(week_start, scope, rank)`.
- `src/lib/leaderboard.ts` dibaca: minggu Senin-WITA, hanya mode
  `full`, skor terbaik per user, normalisasi formasi, dan
  `fetchLastWeekTop3` live tanpa `weekly_winners`, semua terkonfirmasi.
- `src/lib/badges.ts` dibaca: 13 lencana, tidak ada lencana mingguan.
- `src/lib/store.ts` dicek: tidak ada field premium.
- `pg_cron` di free tier + risiko auto-pause dicek lewat pencarian
  web 2026-11-14: `pg_cron` tersedia sebagai extension Supabase,
  tapi berhenti saat proyek pause, dan job yang terlewat tidak
  jalan otomatis. Itu alasan fungsi ini mengejar minggu tertinggal.
- Fungsi SQL di atas BELUM dijalankan di database mana pun. Sintaks
  perlu dites di SQL Editor Supabase sebelum dipakai. Jangan
  menganggap draf ini sudah terverifikasi jalan. Hal yang sama
  berlaku untuk versi di migrasi 004: belum dites terhadap database
  live, baru dicek baca ulang.
