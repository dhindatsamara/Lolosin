-- ============================================================================
-- Migrasi 010: Hadiah juara mingguan naik jadi 30/14/7 hari
-- ============================================================================
--
-- Prasyarat: migrasi 006 sudah dijalankan (fungsi
-- announce_weekly_winners definisi 006).
--
-- Latar: keputusan Dhinda 2026-11-19 20:52 menaikkan hadiah juara
-- mingguan dari 7/5/3 hari jadi 30/14/7 hari. v2.13.1 mengubah pesan
-- di app + teks email + copy landing, TAPI fungsi
-- announce_weekly_winners() di 006 masih meng-hardcode 7/5/3 saat
-- membuat kode klaim (kolom codes.premium_days). Tanpa migrasi ini,
-- cron Senin akan mengirim email yang bilang "30 hari" padahal
-- kodenya hanya memberi 7/5/3 hari.
--
-- Isi migrasi ini: announce_weekly_winners() DITULIS ULANG dengan isi
-- SAMA PERSIS seperti 006, kecuali dua blok CASE hadiah (loop utama
-- dan backfill): juara 1 jadi 30 hari, juara 2 jadi 14 hari, juara 3
-- jadi 7 hari. Ranking, jendela Akbar, idempotency, backfill, dan
-- masa berlaku kode (30 hari) TIDAK berubah. Kode yang sudah dibuat
-- sebelum migrasi ini tidak berubah (premium_days-nya sudah
-- tersimpan di tabel codes).
--
-- PENTING: jalankan migrasi ini SEBELUM cron pengumuman Senin
-- 01:00 UTC (09:00 WITA). Urutan jalan migrasi yang tertunda:
-- 006, 007, 008, 009, 010.

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
  v_akbar_start timestamptz;
  v_akbar_end timestamptz;
  v_winner record;
  v_days int;
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_i int;
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
      -- Hanya minggu yang punya hasil di dalam jendela Akbar-nya
      -- (Minggu week_start + 6 hari, 02:00-04:00 UTC). Minggu yang
      -- hasil 'full'-nya hanya di luar jam event tidak diumumkan.
      and w.finished_at >= (((w.week_start + interval '6 days')::timestamp + interval '2 hours') at time zone 'UTC')
      and w.finished_at < (((w.week_start + interval '6 days')::timestamp + interval '4 hours') at time zone 'UTC')
      and not exists (
        select 1 from public.weekly_winners ww
        where ww.week_start = w.week_start and ww.scope = 'global'
      )
    order by w.week_start
  loop
    -- Jendela event Akbar minggu ini: [Minggu 02:00 UTC, Minggu
    -- 04:00 UTC). Minggu = Senin week_start + 6 hari.
    v_akbar_start := ((v_week + interval '6 days')::timestamp + interval '2 hours') at time zone 'UTC';
    v_akbar_end := ((v_week + interval '6 days')::timestamp + interval '4 hours') at time zone 'UTC';

    -- Juara global: skor terbaik per user di dalam jendela Akbar,
    -- seri diputus aturan Dhinda 2026-11-15: total tertinggi, lalu
    -- yang lolos semua ambang batas, lalu yang paling dulu selesai.
    -- v2.8: premium_until selalu NULL. Premium juara TIDAK lagi
    -- diberikan langsung dari sini; juara menebus kode hadiahnya
    -- di app (Profil, bagian Premium) dan premium aktif lewat
    -- redeem_code.
    insert into public.weekly_winners
      (week_start, scope, rank, user_id, total, premium_until, badge_awarded)
    select
      v_week, 'global', ranked.rn, ranked.user_id, ranked.total,
      null,
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
          and t.finished_at >= v_akbar_start
          and t.finished_at < v_akbar_end
        order by t.user_id, t.total desc, t.passed desc, t.finished_at asc
      ) b
    ) ranked
    where ranked.rn <= 3
    on conflict (week_start, scope, rank) do nothing;

    -- Hadiah juara global v2.8: SATU kode klaim single-use per juara.
    -- Kode berlaku 30 hari sejak dibuat, lalu disimpan ke
    -- weekly_winners.code supaya app dan Edge Function email bisa
    -- menampilkannya. Guard "code is null" menjaga supaya tidak ada
    -- kode ganda bila fungsi jalan ulang untuk minggu yang sama.
    for v_winner in
      select ww.user_id, ww.rank
      from public.weekly_winners ww
      where ww.week_start = v_week
        and ww.scope = 'global'
        and ww.code is null
    loop
      v_days := case v_winner.rank
        when 1 then 30
        when 2 then 14
        else 7 end;

      -- Kode klaim 10 karakter, unik. Alfabet sama seperti
      -- create_redeem_code (tanpa huruf dan angka yang mirip).
      loop
        v_code := '';
        for v_i in 1..10 loop
          v_code := v_code || substr(
            v_alphabet,
            floor(random() * length(v_alphabet) + 1)::int,
            1
          );
        end loop;
        exit when not exists (
          select 1 from public.codes where code = v_code
        );
      end loop;

      insert into public.codes
        (code, premium_days, max_uses, expires_at, note)
      values (
        v_code,
        v_days,
        1,
        now() + interval '30 days',
        'Juara mingguan ' || v_week::text || ' rank ' || v_winner.rank
      );

      update public.weekly_winners
      set code = v_code
      where week_start = v_week
        and scope = 'global'
        and rank = v_winner.rank;
    end loop;

    -- Juara per formasi: scope per formasi yang diikuti minggu itu,
    -- hanya dari hasil di dalam jendela Akbar. Pengelompokan memakai
    -- formasi yang dinormalisasi (huruf kecil, spasi dirapikan),
    -- supaya "Analis Kebijakan" dan "analis kebijakan" jadi satu
    -- ranking. Nama scope yang disimpan adalah ejaan asli pertama
    -- (alfabetis) dari varian itu. Juara per formasi hanya dapat
    -- badge, TANPA premium (keputusan 2026-11-15): premium_until
    -- NULL, code NULL.
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
          and t.finished_at >= v_akbar_start
          and t.finished_at < v_akbar_end
          and p.formasi is not null
          and btrim(p.formasi) <> ''
        order by t.user_id, t.total desc, t.passed desc, t.finished_at asc
      ) b
    ) ranked
    where ranked.rn <= 3
    on conflict (week_start, scope, rank) do nothing;
  end loop;

  -- Backfill (jaring pengaman): juara global mana pun yang code-nya
  -- masih NULL mendapat kode, satu per baris. Ini hanya terjadi bila
  -- sebuah run terpotong di tengah jalan (misal database restart
  -- setelah insert juara tapi sebelum kode dibuat): minggu itu sudah
  -- dianggap diumumkan sehingga loop utama melewatinya, dan tanpa
  -- backfill ini juaranya tidak pernah mendapat kode. Baris yang
  -- sudah punya kode tidak disentuh, jadi tidak ada kode ganda.
  for v_winner in
    select ww.week_start, ww.rank
    from public.weekly_winners ww
    where ww.scope = 'global'
      and ww.code is null
    order by ww.week_start, ww.rank
  loop
    v_week := v_winner.week_start;
    v_days := case v_winner.rank
      when 1 then 30
      when 2 then 14
      else 7 end;

    loop
      v_code := '';
      for v_i in 1..10 loop
        v_code := v_code || substr(
          v_alphabet,
          floor(random() * length(v_alphabet) + 1)::int,
          1
        );
      end loop;
      exit when not exists (
        select 1 from public.codes where code = v_code
      );
    end loop;

    insert into public.codes
      (code, premium_days, max_uses, expires_at, note)
    values (
      v_code,
      v_days,
      1,
      now() + interval '30 days',
      'Juara mingguan ' || v_week::text || ' rank ' || v_winner.rank
    );

    update public.weekly_winners
    set code = v_code
    where week_start = v_week
      and scope = 'global'
      and rank = v_winner.rank
      and code is null;
  end loop;

  return query
    select ww.week_start, ww.scope, ww.rank, ww.user_id, ww.total
    from public.weekly_winners ww
    order by ww.week_start desc, ww.scope, ww.rank;
end;
$$;

-- Hanya dipanggil dari pg_cron (jalan sebagai postgres) dan SQL Editor.
-- Client app tidak boleh memicu pengumuman.
revoke all on function public.announce_weekly_winners() from public;
