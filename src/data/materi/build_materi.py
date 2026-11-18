#!/usr/bin/env python3
"""Build konten materi belajar Lolosin dari sumber di ~/workspace/cpns/materi/.

Output: ~/workspace/lolosin/src/data/materi/*.json (+ index.json).
Hanya membersihkan + menstrukturkan teks sumber; TIDAK menulis ulang isi materi
(kecuali 6 seksi Bang Arya yang dikurasi tulis-ulang pada v2.3.3 karena
ekstraksi mind-map/tabel aslinya tidak berurutan dan tidak enak dibaca;
fakta dicek dari konten lama + file riset baru/).
Jalankan dengan: ~/workspace/venv-whisper/bin/python /tmp/build_materi.py
(atau ~/workspace/venv-materi/bin/python, dibuat 2026-11-15 khusus pipeline ini).

PENTING - PIN VERSI pypdf==7.0.1: pypdf 7.1.0 mengekstrak teks PDF sedikit
berbeda (kata terpecah "me njadi" jadi "menjadi", judul terlewat jadi
terdeteksi) sehingga ID seksi bisa BERGESER (twk-rangkuman-temenasn s18/s19
pada 2026-11-15) dan progres baca user rusak. Jangan upgrade pypdf tanpa
membandingkan ulang seluruh JSON hasil rebuild dengan snapshot sebelumnya.
"""
import json, os, re, zipfile
from collections import Counter

SRC = os.path.expanduser("~/workspace/cpns/materi")
# OUT mengikuti lokasi skrip ini (bukan path absolut ke working tree
# utama), supaya rebuild dari worktree mana pun menulis ke worktree itu
# sendiri. Di working tree utama hasilnya sama seperti sebelumnya.
OUT = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- helpers
ACRONYMS = {
    "TWK","TIU","TKP","SKD","SKB","UUD","NKRI","HAM","BPUPKI","PPKI","PNS","ASN",
    "CAT","BKN","DPR","MPR","DPD","MA","MK","KY","HOTS","KBBI","ABCSIROPP","TIK",
    "FB","BA","KB","DNA","SMA","SD","SMP","RI","WNI","WNA","UU","PP","PERPU",
    "KPK","POLRI","TNI","AD","AL","AU","KBBI","APBN","APBD","PBB","ASEAN",
    "CPNS","KAA","GNB",
}
LOWER_WORDS = {"dan","di","dari","yang","atau","ke","dalam","untuk","pada","dengan",
               "sebagai","oleh","tentang","per","tanpa","serta","hingga","sampai",
               "adalah","itu","ini","juga","bagi","antar","antara","atas","bawah",
               "yg","dgn","utk","dlm","pd","tsb","dll","dr"}

def smart_title(s):
    """Title-case untuk judul ALL-CAPS, jaga akronim & kata tugas kecil."""
    words = s.split()
    out = []
    for i, w in enumerate(words):
        clean = w.strip(".,:;()\"'«»")
        if clean.upper() in ACRONYMS:
            out.append(w.upper() if i == 0 or True else w)
        elif re.fullmatch(r"[IVX]{1,6}", clean):
            out.append(clean)
        elif clean.lower() in LOWER_WORDS and i != 0:
            out.append(clean.lower())
        else:
            out.append(w[:1].upper() + w[1:].lower())
    return " ".join(out)

def despace(line):
    """'H I T U N G  C E P A T' -> 'HITUNG CEPAT'; aman untuk 'p -> q'."""
    toks = line.split()
    if len(toks) < 4:
        return line
    # cari run terpanjang huruf tunggal berurutan
    best = cur = 0
    for t in toks:
        if len(t) == 1 and t.isalpha():
            cur += 1
            best = max(best, cur)
        else:
            cur = 0
    if best < 3:
        return line
    out, buf = [], ""
    for t in toks:
        if len(t) == 1 and t.isalpha():
            buf += t
        else:
            if buf:
                out.append(buf); buf = ""
            out.append(t)
    if buf:
        out.append(buf)
    return " ".join(out)

PAGE_MARKER = re.compile(r"^---\s*HALAMAN\s+\d+\s*---\s*$")
STANDALONE_NUM = re.compile(r"^\d{1,3}\s*(/\s*\d{1,3})?$")
SYMBOL_ONLY = re.compile(r"^[^\w\s]+$")
BAD_CHARS = set("~^`@#$\\_")

DROP_LINE_RES = [
    re.compile(r"^Cheat Sheet (TWK|TKP) 2024"),  # footer sampul cheat sheet
    re.compile(r"^NO ASPEK .*KOMPETENSI LEVEL DESKRIPSI$"),  # header tabel Kartu Sakti
]
HANDBOOK_DROP_RES = [
    re.compile(r"^BAGIAN\s*[IVX]{1,5}(\s*·.*)?$"),  # label header "BAGIAN II · ANALOGI"
    re.compile(r"^(PENGANTAR|PENUTUP|LAMPIRAN)(\s*·.*)?$"),  # label header bagian
    re.compile(r"^ISI HANDBOOK$"),
    re.compile(r"^DAFTAR ISI$"),
]

# ------------------------------------------------------------------
# ------------------------------------------------------------------
# Pembersih em-dash (U+2014). Disalin dari
# ~/workspace/cpns/scripts/clean_emdash.py (skrip pembersihan
# 2026-11-13, teruji via dry-run terhadap semua konteks). Konten OCR
# memakai em-dash sebagai OCR dari "=" (mis. "2x2 =4"), panah
# logika (p->q), rentang, dan pemisah klausa. Aturan peka konteks;
# dipanggil di akhir clean_line() supaya rebuild dari PDF/OCR mentah
# tetap bersih. Karakter em-dash ditulis sebagai escape \u2014 di
# bawah ini (bukan literal) supaya file ini bebas literal em-dash.
# JANGAN ubah logika ini tanpa menjalankan ulang validasi dry-run.
FUNCTION_WORDS = {
    "untuk", "dan", "atau", "yang", "dari", "di", "ke", "dalam", "dengan",
    "adalah", "itu", "ini", "juga", "bagi", "antar", "antara", "atas",
    "bawah", "oleh", "sebagai", "tentang", "tanpa", "serta", "hingga",
    "sampai", "maka", "tetapi", "namun", "karena", "jika", "ketika",
    "saat", "sebelum", "sesudah", "setelah", "merupakan", "yaitu",
    "yakni", "pun", "lah", "kah",
}
MONTHS = {
    "januari", "februari", "maret", "april", "mei", "juni", "juli",
    "agustus", "september", "oktober", "november", "desember",
}
UNITS = {
    "km", "hm", "dam", "m", "dm", "cm", "mm", "kg", "hg", "dag", "g",
    "dg", "cg", "mg", "liter", "l", "dl", "cl", "ml", "hl", "dal",
    "galon", "barel", "ka", "ha", "daa", "da", "ca", "ma", "cc",
    "inci", "kaki", "yard", "mil", "ons", "kuintal", "ton", "are",
    "detik", "menit", "jam", "hari", "minggu", "bulan", "tahun",
    "rp", "rupiah", "persen", "derajat", "meter", "cm2", "cm3",
    "m2", "m3", "km2",
}
MATH_TERMS = {
    "bruto", "neto", "tara", "modal", "bunga", "rugi", "untung", "laba",
    "kpk", "fpb", "luas", "volume", "keliling", "jarak", "kecepatan",
    "debit", "perbandingan", "persentase", "rabat", "diskon",
    "penjualan", "pembelian", "diameter", "frekuensi",
}
TOKEN_STRIP = ".,;:()\"'«»“”‘’[]{}<>?!*#$@%^&|\\/_+=~`\u2014–"
def _tok(s):
    return s.strip(TOKEN_STRIP)


def _prev_token(text, pos):
    # token = run non-spasi tanpa em-dash ("\u20149" -> "9", bukan "\u20149")
    m = re.search(r"([^\s\u2014]+)[ \t]*$", text[:pos])
    return _tok(m.group(1)) if m else ""


def _prev_tokens(text, pos, n=2):
    """n token terakhir sebelum pos (sudah strip). Dibatasi 60 karakter."""
    toks = re.findall(r"[^\s\u2014]+", text[max(0, pos - 60):pos])
    return [_tok(t) for t in toks[-n:]]


def _is_power_token(tok):
    # "s2", "t2", "x2", "s?2" \u2014 variabel berpangkat hasil OCR (s², t², x²)
    return bool(re.fullmatch(r"[A-Za-z][^A-Za-z0-9]*\d+", tok or ""))


def _next_token(text, pos):
    m = re.match(r"[ \t\u2014]*([^\s\u2014]+)", text[pos:])
    return _tok(m.group(1)) if m else ""


def _is_numeric_token(tok):
    if not tok:
        return False
    t = tok.replace(".", "").replace(",", "")
    if t and t[0] in "+-":
        t = t[1:]
    if t and t[0].isdigit():
        return True
    return tok.lower().startswith("rp") or tok.startswith("%")


def _is_pure_int(tok):
    """Bilangan bulat (boleh pemisah ribuan '.'): '10', '1.850' -> int."""
    if not tok:
        return None
    if re.fullmatch(r"\d{1,3}(\.\d{3})*", tok):
        return int(tok.replace(".", ""))
    if re.fullmatch(r"\d+", tok):
        return int(tok)
    return None


def _is_time_token(tok):
    return bool(re.fullmatch(r"\d{1,2}[.:]\d{2}", tok or ""))


def _is_formula_token(tok):
    return bool(re.fullmatch(r"[A-Za-z0-9]*[xX×][A-Za-z0-9]+", tok or ""))


def _is_single_lower(tok):
    return len(tok) == 1 and tok.islower() and tok.isalpha()


def _window_tokens(text, a, b, n=2):
    """n token terakhir sebelum a + n token pertama sesudah b (lowercase)."""
    left = re.findall(r"[^\s\u2014]+", text[max(0, a - 60):a])[-n:]
    right = re.findall(r"[^\s\u2014]+", text[b:b + 60])[:n]
    return ([_tok(t).lower() for t in left],
            [_tok(t).lower() for t in right])


def _is_minus_window(text, a, b):
    """'bruto - tara' / 'harga beli - rugi' / 'pembelian - harga penjualan'."""
    prev2, next2 = _window_tokens(text, a, b)
    left = {"bruto", "pembelian", "penjualan"}
    right = {"tara", "rugi", "penjualan"}
    if not (left & set(prev2)):
        return False
    if right & set(next2):
        return True
    # "harga" langsung sesudah dash: "Rugi harga pembelian [dash-dash] harga
    # penjualan" (kata "penjualan" terpotong ke baris berikut saat build
    # memproses per-baris, jadi jendela kanan hanya melihat "harga").
    # Hanya token PERTAMA (bukan 2 token) agar "Harga penjualan [dash-dash]
    # Rp18.000,00 Harga pembelian ..." tidak ikut terbalik.
    return bool(next2) and next2[0] == "harga"


def clean_materi_text(s, debug=False):
    """Aturan materi, single-pass (posisi keputusan = koordinat asli)."""
    if "\u2014" not in s:
        return (s, []) if debug else s
    decisions = []
    out, i, pos, n = [], 0, 0, len(s)
    while True:
        m = s.find("\u2014", pos)
        if m == -1:
            break
        # --- run ketat: rentang [-\u2014]+ yang mengandung dash ini ---
        rs, re_ = m, m + 1
        while rs > 0 and s[rs - 1] in "-\u2014":
            rs -= 1
        while re_ < n and s[re_] in "-\u2014":
            re_ += 1
        if re_ - rs >= 2:
            run_left = s[rs - 1] if rs > 0 else ""
            run_right = s[re_] if re_ < n else ""
            prev = _prev_token(s, rs)
            nxt = _next_token(s, re_)
            if run_left == "\n" or run_right == "\n":
                rep, rule = "", "run-tepi-baris-drop"
            elif _is_time_token(prev) and _is_time_token(nxt):
                rep, rule = "-", "run-rentang-waktu"
            elif _is_minus_window(s, rs, re_):
                rep, rule = "-", "run-minus-rumus"
            else:
                rep, rule = "=", "run-dash->="
            decisions.append((rs, rule, rep, prev, nxt))
            out.append(s[i:rs]); out.append(rep); i = re_; pos = re_
            continue
        # --- run berspasi: "\u2014 \u2014" ---
        m2 = re.match(r"\u2014(?:[ \t]+\u2014)+", s[m:])
        if m2:
            prev = _prev_token(s, m)
            nxt = _next_token(s, m + len(m2.group(0)))
            decisions.append((m, "run-spasi->=", "=", prev, nxt))
            out.append(s[i:m]); out.append("="); i = m + len(m2.group(0))
            pos = i
            continue
        # --- dash tunggal ---
        a = m
        while a > 0 and s[a - 1] in " \t":
            a -= 1
        b = m + 1
        while b < n and s[b] in " \t":
            b += 1
        left = s[a - 1] if a > 0 else ""
        right = s[b] if b < n else ""
        prev = _prev_token(s, a)
        nxt = _next_token(s, b)
        prev_l, nxt_l = prev.lower(), nxt.lower()
        had_space = (a < m) or (b > m + 1)
        # ellipsis "..." bukan akhir kalimat / bukan simbol
        left_dot = left == "." and not (a >= 2 and s[a - 2] == ".")
        right_dot = right == "." and not (b + 1 < n and s[b + 1] == ".")
        if left in "!?," or left_dot:
            rep, rule = " ", "drop-setelah-titik/koma"
        elif right == ",":
            rep, rule = "", "drop-koma-sudah-ada"
        elif left in "\n" or right in "\n" or left == "" or right == "":
            rep, rule = "", "drop-tepi-baris"
        elif right_dot:
            rep, rule = (" -" if a < m else "-"), "simbol-sebelum-titik"
        elif left in "»«" or right in "»«":
            rep, rule = (" - " if had_space else "-"), "simbol-antara-»«"
        elif (re.fullmatch(r"(19|20)\d\d", prev)
              and any(mn in s[b:b + 20].lower() for mn in MONTHS)):
            rep, rule = "-", "rentang-tanggal"
        elif _is_time_token(prev) and _is_time_token(nxt):
            rep, rule = " - ", "rentang-waktu"
        elif _is_single_lower(prev) and _is_single_lower(nxt):
            rep, rule = " → ", "panah-logika"
        elif _is_minus_window(s, a, b):
            rep, rule = " - ", "minus-rumus"
        elif nxt_l not in FUNCTION_WORDS and (
            _is_numeric_token(nxt)
            or nxt_l.strip("?") in UNITS
            or _is_formula_token(nxt)
            or prev_l in MATH_TERMS
            or _is_single_lower(prev)
            or _is_single_lower(nxt)
            or (_is_power_token(nxt) and not _is_power_token(prev))
            or (_is_numeric_token(prev)
                and _prev_tokens(s, a, 2)[:1] in (["x"], ["X"], ["×"]))
        ):
            # deret bilangan berurutan (10, 9, 8, ...) bukan persamaan,
            # KECUALI ekspresi dalam kurung / jumlah dua suku ("(2+2) = 4")
            pv, nv = _is_pure_int(prev), _is_pure_int(nxt)
            if pv is not None and nv is not None and abs(pv - nv) <= 2:
                is_sum = False
                if s[a - 1] == ")":
                    is_sum = True  # "(2+2) = 4"
                else:
                    nums = [_is_pure_int(t) for t in _prev_tokens(s, a, 4)]
                    nums = [x for x in nums if x is not None][-2:]
                    if len(nums) == 2 and nums[0] + nums[1] == nv:
                        is_sum = True  # "2 + 2 = 4"
                if is_sum:
                    rep, rule = " = ", "sama-dengan"
                else:
                    rep, rule = ", ", "koma-deret"
            else:
                rep, rule = " = ", "sama-dengan"
        elif prev and prev[-1].isdigit() and nxt and nxt[0].isdigit():
            rep, rule = "-", "digit-digit"
        else:
            rep, rule = ", ", "koma"
        decisions.append((m, rule, rep, prev, nxt))
        out.append(s[i:a]); out.append(rep); i = b; pos = b
    out.append(s[i:])
    res = "".join(out)
    return (res, decisions) if debug else res



def clean_line(ln):
    ln = ln.replace("\u00a0", " ")
    ln = despace(ln)
    ln = re.sub(r"\s+", " ", ln).strip()
    # buang penanda brand inline (Analitica, berbagai varian OCR)
    ln = re.sub(r"@&?\s*Analitica(\.id)?", "", ln)
    ln = re.sub(r"\bby Analitica\.id\b", "", ln)
    ln = re.sub(r"\bAnalitica(\.id)?\b", "", ln)  # sisa token "Analitica" tanpa @
    ln = re.sub(r"\s*#\d+\b", "", ln)  # artefak ikon "#0"
    # buang ikon bullet hasil OCR di awal baris: "@ Poin..." "& Poin..." "$ Kata..."
    ln = re.sub(r"^[@&$#]+\s*", "", ln)
    # "e Definisi: ..." -> "Definisi: ..." (ikon 'e' hasil OCR)
    if ":" in ln:
        ln = re.sub(r"^e\s+(?=[A-Z])", "", ln)
    ln = re.sub(r"\s+", " ", ln).strip(" -–\u2014")
    ln = clean_materi_text(ln)  # hapus em-dash (aturan peka konteks)
    return ln

def find_repeated_edge_lines(pages, min_count=3, min_frac=0.15):
    """Baris yang muncul di tepi (3 baris awal/akhir) banyak halaman = header/footer."""
    c = Counter()
    n = len(pages)
    for pg in pages:
        lines = [clean_line(l) for l in pg.splitlines()]
        lines = [l for l in lines if l]
        edge = set(lines[:3] + lines[-3:])
        for l in edge:
            if 3 <= len(l) <= 120 and not l.endswith(":") and not re.match(r"^[A-Z]\.\s", l):
                c[l] += 1
    thresh = max(min_count, int(n * min_frac))
    return {l for l, k in c.items() if k >= thresh}

DROP_SUBSTRINGS = ["kelasujiantryout.com", "paperlessbyvivi"]
DROP_LINE_PREFIX = ["Dapatkan bahan belajar", "Akses lengkap bahan belajar"]

def clean_pages(pages, extra_drop=None, drop_res=None, handbook=False):
    """pages: list[str] teks mentah per halaman -> list[str] baris bersih."""
    repeated = find_repeated_edge_lines(pages)
    drop = set(extra_drop or [])
    res = list(DROP_LINE_RES) + list(drop_res or [])
    if handbook:
        res += HANDBOOK_DROP_RES
    all_lines = []
    for pg in pages:
        for raw in pg.splitlines():
            ln = clean_line(raw)
            if not ln:
                all_lines.append("")
                continue
            if PAGE_MARKER.match(raw.strip()):
                continue
            if STANDALONE_NUM.match(ln):
                continue
            if len(ln) == 1:  # satu huruf/karakter = fragmen, bukan isi
                continue
            if SYMBOL_ONLY.match(ln):
                continue
            # baris pendek yang didominasi simbol + tanda kutip = artefak OCR
            if len(ln) < 20 and any(c in ln for c in '()"“”'):
                alnum = sum(c.isalnum() for c in ln) / len(ln)
                if alnum < 0.5:
                    continue
            if ln in repeated or ln in drop:
                continue
            if any(r.match(ln) for r in res):
                continue
            if any(s in ln for s in DROP_SUBSTRINGS):
                continue
            if any(ln.startswith(p) for p in DROP_LINE_PREFIX):
                continue
            if ("HANDBOOK TIU" in ln and "SKD CPNS" in ln) or "HANDBOOKTIU" in ln:
                continue
            all_lines.append(ln)
    # dehyphenation antar-baris: "keber-\nsamaan" -> "kebersamaan",
    # tapi "soal-\nsoal" (reduplikasi) tetap "soal-soal"
    out = []
    i = 0
    while i < len(all_lines):
        ln = all_lines[i]
        if ln.endswith("-") and i + 1 < len(all_lines) and all_lines[i + 1]:
            nxt = all_lines[i + 1]
            m = re.match(r"^([A-Za-z]+)", nxt)
            frag = re.search(r"([A-Za-z]+)-$", ln)
            if m and frag and nxt[0].islower():
                if m.group(1).lower() == frag.group(1).lower():
                    out.append(ln + nxt)  # pertahankan hyphen reduplikasi
                else:
                    out.append(ln[:-1] + nxt)
                i += 2
                continue
        out.append(ln)
        i += 1
    return out

# ---------------------------------------------------------------- headings
LABEL_PREFIX = ("pembahasan", "jawab", "contoh", "tips", "trik", "catatan",
                "kunci jawaban", "soal no", "latihan soal")
ROMAN = {"i","ii","iii","iv","v","vi","vii","viii","ix","x","xi","xii"}

def is_caps_heading(ln):
    alpha = [c for c in ln if c.isalpha()]
    if len(alpha) < 4:
        return False
    if sum(1 for c in alpha if c.isupper()) / len(alpha) < 0.8:
        return False
    words = ln.split()
    if len(words) < 2:  # satu kata saja = fragmen, bukan judul
        return False
    if len(words) > 12 or len(ln) > 100:
        return False
    # artefak OCR / referensi hukum, bukan judul
    if any(ch in ln for ch in "|,()") or any(c.isdigit() for c in ln):
        return False
    if "NO." in ln.upper() or "NOMOR" in ln:
        return False
    # judul asli punya minimal satu kata >= 4 huruf ("S SVW XYZ", "A B", "GL GE" tidak)
    if not any(len(w.strip("·-")) >= 4 for w in words):
        return False
    # semua kata tanpa vokal = fragmen tabel/alfabet ("S SVW XYZ", "B B Dd B")
    if not any(re.search(r"[aeiouAEIOU]", w) for w in words):
        return False
    # 4+ konsonan berurutan dalam satu kata = sampah OCR ("LLAABCXX")
    if any(re.search(r"[^aeiouAEIOU\W\d_]{4,}", w) for w in words):
        return False
    if ln.rstrip(":").strip().upper() in ("TIPS","TRIK","CONTOH","PEMBAHASAN","JAWABAN","CATATAN"):
        return False
    return True

def is_heading(ln, pdf_source, subtopik_keywords):
    """Deteksi judul bab/subbab pada satu baris."""
    if len(ln) < 3 or len(ln) > 100:
        return False
    low = ln.lower().strip()
    # pola "Ringkas N: ..." dicek PALING AWAL: judulnya mengandung ':' sehingga
    # pemeriksaan titik-dua di bawah akan menolaknya bila dicek belakangan.
    if re.match(r"^Ringkas\s+\d+\s*:", ln):
        return True
    # "ChecklistPersiapan" (judul halaman checklist cheat sheet, tersambung OCR)
    if "checklist" in low and len(ln) <= 60:
        return True
    if ln[-1] in ".?!,:;":
        return False
    if any(low.startswith(p) for p in LABEL_PREFIX):
        return False
    if ":" in ln[:-1]:  # ada ':' di tengah -> label/kalimat, bukan judul
        return False
    if re.search(r"\d", ln) and sum(c.isdigit() for c in ln) > len(ln) * 0.4:
        return False
    # pola "BAB / BAGIAN ..."
    if re.match(r"^(BAB|BAGIAN|Bagian|UNIT)\s+[IVXL0-9]+", ln):
        return True
    # huruf "A. Judul ..."
    m = re.match(r"^([A-Z])\.\s+(.+)$", ln)
    if m and len(m.group(2)) >= 8 and m.group(2)[0].isupper():
        return True
    # bernomor "1. Judul ..." (tanpa titik akhir), hanya sumber PDF yang rapi;
    # di OCR, butir bernomor hampir selalu item daftar, bukan judul.
    # Batas 40 karakter + tanpa '=' / nomor bersarang agar soal contoh tidak jadi judul.
    m = re.match(r"^\d{1,2}\.\s+(.+)$", ln)
    if (pdf_source and m and 10 <= len(m.group(1)) <= 40
            and len(m.group(1).split()) >= 2
            and "=" not in m.group(1) and not re.search(r"\d+[.\)]", m.group(1))):
        return True
    # ALL-CAPS
    if is_caps_heading(ln):
        return True
    # cocok persis dengan subtopik / kata kunci subtopik (huruf awal kapital;
    # "toleransi" huruf kecil = fragmen kolom, bukan judul). Awalan "Tema " diabaikan,
    # begitu pula satu huruf artefak di akhir ("... Komunikasi N").
    check = low[5:] if low.startswith("tema ") else low
    check = re.sub(r"\s+[a-z]$", "", check)
    if check in subtopik_keywords and ln[0].isupper():
        return True
    # Title Case singkat (hanya sumber PDF yang rapi)
    if pdf_source:
        words = ln.split()
        if 2 <= len(words) <= 9 and len(ln) <= 60:
            if words[0].lower().strip(".,:;()\"'«»-") in LOWER_WORDS:
                return False  # "Dalam UU ..." = fragmen kalimat
            ok = True
            for w in words:
                c = w.strip(".,:;()\"'«»-")
                if not c:
                    continue
                if len(c) == 1:
                    ok = False  # kata satu huruf ("P A Kandungan") = fragmen diagram
                    break
                if c.lower() in LOWER_WORDS or c.upper() in ACRONYMS:
                    continue
                if not c[0].isupper():
                    ok = False
                    break
            if ok:
                return True
    return False

LIST_RE = re.compile(r"^(?:[•\-\*\u2013\u2014]\s+|\(\s*[ivxlcdm0-9]+\s*\)\s+|[a-z]\.\s+|\d{1,2}[.\)]\s+|[A-E]\.\s+)")

LETTER_CAND_RE = re.compile(r"^([A-E])\.\s+(.{8,})$")

def find_option_lines(lines, min_run=3):
    """Baris opsi soal (A./B./C./D./E. berurutan naik, jarak <= 25 baris).

    Opsi soal terlihat persis seperti subbab huruf ("A. ..."), tapi selalu muncul
    berurutan A->B->C... dalam jarak dekat DAN diikuti/didahului penanda
    "Jawaban:" / "Pembahasan" / "Skor" (modul mengulang tiap soal di pembahasan:
    opsi ulangan didahului penanda, bukan diikuti). Subbab asli tidak
    berdekatan dengan penanda itu (modul TWK bahkan tidak punya soal sama sekali).
    Jarak 25 baris diperlukan karena OCR dua kolom menyisipkan teks antarkolom
    dan opsi ulangan diselingi penjelasan skor.
    min_run=2 untuk OCR (opsi yang selamat sering tinggal 2 huruf),
    min_run=3 untuk PDF rapi (subbab A/B yang pendek + "Pembahasan:" di dekatnya
    bisa salah terdeteksi sebagai run 2 butir).
    """
    cands = []  # (idx, huruf)
    for i, ln in enumerate(lines):
        m = LETTER_CAND_RE.match(ln)
        if m:
            cands.append((i, m.group(1)))
    # penanda jawaban/pembahasan per baris
    marker = []
    for ln in lines:
        low = ln.lower()
        marker.append(low.startswith("jawaban") or low.startswith("pembahasan")
                      or "skor" in low)
    option_idx = set()
    run = []
    for idx, letter in cands:
        if run and idx - run[-1][0] <= 25 and ord(letter) > ord(run[-1][1]):
            run.append((idx, letter))
        else:
            _close_run(run, marker, option_idx, min_run)
            run = [(idx, letter)]
    _close_run(run, marker, option_idx, min_run)
    # Ulangan opsi di pembahasan: hanya A dan E yang tersisa sebagai kandidat
    # (B/C/D hilang karena OCR), jadi tidak membentuk run. Cirinya: penanda
    # "Skor" dalam 12 baris setelahnya (skor per opsi). Subbab asli tidak
    # pernah diikuti "Skor" dalam jarak sedekat itu.
    for idx, letter in cands:
        if idx in option_idx:
            continue
        if any("skor" in lines[j].lower()
               for j in range(idx + 1, min(idx + 13, len(lines)))):
            option_idx.add(idx)
    return option_idx

def _close_run(run, marker, option_idx, min_run=3):
    # Ambang 2 butir (OCR): opsi yang selamat dari OCR sering tinggal 2 huruf
    # (saudaranya hilang/garbled). Syarat penanda jawaban tetap melindungi
    # subbab asli (modul TWK tanpa soal: 0 run lolos).
    if len(run) < min_run:
        return
    if any(l not in "ABCDE" for _, l in run):
        return
    # penanda jawaban dalam 25 baris setelah opsi terakhir, atau 15 baris
    # sebelum opsi pertama (ulangan soal di pembahasan)
    start, end = run[0][0], run[-1][0]
    if any(marker[end + 1:end + 26]) or any(marker[max(0, start - 15):start]):
        option_idx.update(i for i, _ in run)

def is_list_item(ln):
    return bool(LIST_RE.match(ln))

def normalize_list(ln):
    m = re.match(r"^[•\-\*\u2013\u2014]\s+(.*)$", ln)
    if m:
        return "- " + m.group(1)
    return ln

TERMINAL = ".!?:;"

DANGLING = {"kepada","terhadap","di","dari","dan","yang","untuk","dalam",
            "dengan","sebagai","atau","per","pada","ke","oleh","tentang",
            "bagi","antar","tanpa","adalah","ialah","yaitu","yakni","se",
            "sebuah","para","sampai","hingga","serta"}

EMBEDDED_HEAD_RE = re.compile(r"^(.+[.!?])\s+([A-Z]\.\s+[A-Z].{7,80})$")
EMBEDDED_RINGKAS_RE = re.compile(r"^(.+[.!?])\s+(Ringkas\s+\d+\s*:.*)$")

def build_blocks(lines, pdf_source, subtopik_keywords, detect_headings=True,
                   subtopik_list=None):
    """Baris -> blok: heading / body / list."""
    # 1) pisah judul yang menempel di akhir kalimat (OCR dua kolom):
    #    "atau gagasan. B. Dasar dan Ideologi Negara" -> 2 baris
    split_lines = []
    for ln in lines:
        m = EMBEDDED_HEAD_RE.match(ln) or EMBEDDED_RINGKAS_RE.match(ln)
        if m:
            split_lines.extend([m.group(1), m.group(2)])
        else:
            split_lines.append(ln)
    lines = split_lines
    # 2) gabung "Ringkas N:" yang berdiri sendiri dengan judul di baris berikut
    merged_lines = []
    i = 0
    while i < len(lines):
        ln = lines[i]
        if re.match(r"^Ringkas\s+\d+\s*:?\s*$", ln) and i + 1 < len(lines):
            nxt = lines[i + 1]
            if (nxt and len(nxt) <= 60 and nxt[-1] not in ".?!,,;"
                    and not is_list_item(nxt)):
                merged_lines.append(ln.rstrip(":") + ": " + nxt)
                i += 2
                continue
        merged_lines.append(ln)
        i += 1
    lines = merged_lines

    option_idx = find_option_lines(lines, min_run=2 if not pdf_source else 3) if detect_headings else set()

    # kata kunci subtopik untuk mendeteksi baris daftar tema sampul
    sub_keys = []
    for st in (subtopik_list or []):
        for k in re.split(r"[:,;/]", st):
            k = k.strip().lower()
            if len(k) >= 4:
                sub_keys.append(k)

    blocks = []
    cur = []
    skip = set()

    def flush_body():
        if cur:
            blocks.append({"text": " ".join(cur), "kind": "body"})
            cur.clear()

    for li, ln in enumerate(lines):
        if li in skip:
            continue
        if not ln:
            flush_body()
            continue
        # baris daftar tema sampul (ALL-CAPS, memuat >= 2 nama subtopik) -> buang
        if sub_keys and is_caps_heading(ln):
            low_ln = ln.lower()
            if sum(1 for k in sub_keys if k in low_ln) >= 2:
                continue
        if detect_headings and li not in option_idx and is_heading(ln, pdf_source, subtopik_keywords):
            flush_body()
            # judul terpotong di kata gantung ("3. Setia kepada" + "Pancasila ..."):
            # sambung dengan baris berikut bila pendek & bukan kalimat utuh
            last_w = ln.rstrip(":").split()[-1].lower().strip(".,:;()\"'«»-") if ln.split() else ""
            if last_w in DANGLING and li + 1 < len(lines):
                nxt = lines[li + 1]
                if (nxt and len(nxt) <= 60 and nxt[-1] not in ".?!,:;"
                        and not is_list_item(nxt) and (li + 1) not in option_idx
                        and not is_heading(nxt, pdf_source, subtopik_keywords)):
                    ln = ln + " " + nxt
                    skip.add(li + 1)
            blocks.append({"text": ln, "kind": "heading"})
            continue
        if is_list_item(ln):
            flush_body()
            blocks.append({"text": normalize_list(ln), "kind": "list"})
            continue
        # lanjutan item list yang belum berakhir (baris terpotong)
        if blocks and blocks[-1]["kind"] == "list" and not cur:
            last = blocks[-1]["text"]
            if last and last[-1] not in TERMINAL and len(last) < 400:
                blocks[-1]["text"] = last + " " + ln
                continue
        cur.append(ln)
    flush_body()
    return blocks

def clean_heading_text(t):
    t = t.strip().rstrip(":").strip()
    # "ChecklistPersiapan" (tersambung OCR) -> judul rapi
    if "checklistpersiapan" in t.lower().replace(" ", ""):
        return "Checklist Persiapan Tes SKD"
    # buang satu huruf artefak di akhir judul ("... Komunikasi N"), kecuali angka Romawi
    m = re.match(r"^(.{10,})\s+([A-HJ-Z])$", t)
    if m:
        t = m.group(1)
    # "Ringkas 2: diubah dan disesuaikan dengan" -> "Ringkas 2": ekor yang
    # seluruhnya huruf kecil adalah teks isi yang tersisip (OCR dua kolom),
    # bukan judul bab. Ekor sampah simbol ("PROLOG »« ....") juga dibuang.
    m = re.match(r"^(Ringkas\s+\d+)\s*:\s*(.+)$", t)
    if m:
        tail = m.group(2).strip().rstrip("/-–\u2014 ").strip()
        if not re.search(r"[A-Z]", tail):
            return m.group(1)
        nonalnum = sum(1 for c in tail if not c.isalnum() and c != " ")
        if "»" in tail or "«" in tail or (tail and nonalnum / len(tail) > 0.4):
            return m.group(1)
        return m.group(1) + ": " + tail
    if re.match(r"^(BAB|BAGIAN)\s+[IVXL0-9]+\s*[-–\u2014]?\s*$", t):
        return t
    alpha = [c for c in t if c.isalpha()]
    if alpha and sum(1 for c in alpha if c.isupper()) / len(alpha) >= 0.8 and len(alpha) >= 4:
        # ALL-CAPS -> smart title case (jaga prefix "A. " / "1. ")
        m = re.match(r"^(([A-Z]|\d{1,2})\.\s+)(.+)$", t)
        if m:
            return m.group(1) + smart_title(m.group(3))
        return smart_title(t)
    return t

def garbage_ratio(text):
    words = text.split()
    if not words:
        return 0.0
    bad = 0
    for w in words:
        if any(c in BAD_CHARS for c in w):
            bad += 1
        elif len(w) == 1 and not w.isalnum():
            bad += 1
    return bad / len(words)

def match_subtopik(judul, subtopik, fallback):
    low = judul.lower()
    for st in subtopik:
        keys = [k.strip().lower() for k in re.split(r"[:,;/]", st) if k.strip()]
        for k in keys:
            if len(k) >= 4 and k in low:
                return st
    # kata kunci tunggal yang khas
    for st in subtopik:
        for w in re.findall(r"[a-z]{5,}", st.lower()):
            if w in low and w not in ("materi", "tes", "soal", "cpns"):
                return st
    return fallback

def build_sections(blocks, doc_id, subtopik, max_words=1500, target=1100,
                   default_title="Pengantar"):
    """Blok -> sections [{id, subtopik, judul, konten, kata, catatan?}]."""
    raw = []  # (judul, [blok teks])
    cur_title, cur_blocks = None, []
    for b in blocks:
        if b["kind"] == "heading":
            if cur_title is None and not cur_blocks:
                cur_title = clean_heading_text(b["text"])
            elif cur_title is not None and not cur_blocks:
                # judul berurutan -> gabung
                cur_title = cur_title + ": " + clean_heading_text(b["text"])
            else:
                raw.append((cur_title or default_title, cur_blocks))
                cur_title, cur_blocks = clean_heading_text(b["text"]), []
        else:
            cur_blocks.append(b["text"])
    if cur_title is not None or cur_blocks:
        raw.append((cur_title or default_title, cur_blocks))

    # tanpa judul sama sekali -> chunk per ~target kata
    if len(raw) == 1 and raw[0][0] == default_title and not any(
            b["kind"] == "heading" for b in blocks):
        raw = chunk_blocks(raw[0][1], target, default_title)

    sections = []
    for judul, blks in raw:
        # bagi section yang terlalu panjang di batas paragraf
        chunks = split_long(blks, max_words, target)
        for ci, ch in enumerate(chunks):
            t = judul if ci == 0 else f"{judul} (lanjutan {ci + 1})"
            konten = "\n\n".join(ch).strip()
            if not konten:
                continue
            sections.append({"judul": t, "konten": konten})

    # gabung section sangat kecil (<40 kata) ke section sebelumnya,
    # judulnya dipertahankan sebagai subjudul markdown.
    # Judul bab "Ringkas N: ..." tidak pernah digabung (struktur utama modul),
    # kecuali bila isinya < 15 kata (fragmen, bukan bab sungguhan).
    def _is_chapter(title, nwords):
        return title.lower().startswith("ringkas") and nwords >= 15
    merged = []
    for s in sections:
        nw = len(s["konten"].split())
        if merged and nw < 40 and not _is_chapter(s["judul"], nw):
            merged[-1]["konten"] += "\n\n## " + s["judul"] + "\n\n" + s["konten"]
        else:
            merged.append(s)
    # bila section pertama kecil dan ada section berikut, gabung ke berikut
    if (len(merged) > 1 and len(merged[0]["konten"].split()) < 40
            and not _is_chapter(merged[0]["judul"], len(merged[0]["konten"].split()))):
        merged[1]["konten"] = ("## " + merged[0]["judul"] + "\n\n" + merged[0]["konten"]
                               + "\n\n" + merged[1]["konten"])
        merged.pop(0)
    # gabung section berurutan yang judulnya sama persis (header tema berulang
    # di tiap halaman, mis. "Bahasa Indonesia" di cheat sheet)
    dedup = []
    for s in merged:
        if dedup and s["judul"] == dedup[-1]["judul"]:
            dedup[-1]["konten"] += "\n\n" + s["konten"]
        else:
            dedup.append(s)
    merged = dedup

    out = []
    prev_sub = subtopik[0] if subtopik else "Umum"
    for i, s in enumerate(merged, 1):
        st = match_subtopik(s["judul"], subtopik, prev_sub)
        prev_sub = st
        sec = {
            "id": f"{doc_id}-s{i:02d}",
            "subtopik": st,
            "judul": s["judul"],
            "konten": s["konten"],
            "kata": len(s["konten"].split()),
        }
        gr = garbage_ratio(s["konten"])
        if gr > 0.10:
            sec["catatan"] = ("Hasil OCR bagian ini kurang rapi (tata letak dua kolom/kartu "
                              "atau karakter salah baca); isi dipertahankan apa adanya.")
        out.append(sec)
    return out

def split_sentences(block, target):
    """Bagi satu paragraf raksasa per kalimat hingga ~target kata per potong."""
    sents = re.split(r"(?<=[.!?])\s+", block)
    chunks, cur, cur_n = [], [], 0
    for s in sents:
        n = len(s.split())
        if cur and cur_n + n > target and cur_n >= 300:
            chunks.append(" ".join(cur))
            cur, cur_n = [], 0
        cur.append(s)
        cur_n += n
    if cur:
        chunks.append(" ".join(cur))
    return chunks

def split_long(blks, max_words, target):
    # pecah dulu blok tunggal yang melebihi batas (mis. baris tabel yang menyatu)
    expanded = []
    for b in blks:
        if len(b.split()) > max_words:
            expanded.extend(split_sentences(b, target))
        else:
            expanded.append(b)
    blks = expanded
    total = sum(len(b.split()) for b in blks)
    if total <= max_words:
        return [blks]
    chunks, cur, cur_n = [], [], 0
    for b in blks:
        n = len(b.split())
        if cur and cur_n + n > target and cur_n >= 400:
            chunks.append(cur)
            cur, cur_n = [], 0
        cur.append(b)
        cur_n += n
    if cur:
        chunks.append(cur)
    return chunks

def chunk_blocks(blks, target, base_title):
    chunks = split_long(blks, target + 400, target)
    if len(chunks) == 1:
        return [(base_title, chunks[0])]
    return [(f"Bagian {i + 1}", c) for i, c in enumerate(chunks)]

# ---------------------------------------------------------------- extraction
def extract_pdf_pages(path):
    from pypdf import PdfReader
    r = PdfReader(path)
    return [(p.extract_text() or "") for p in r.pages]

def extract_ocr_pages(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    parts = re.split(r"---\s*HALAMAN\s+\d+\s*---", text)
    return [p for p in parts if p.strip()]

def extract_docx_paragraphs(path):
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    paras = re.findall(r"<w:p[ >].*?</w:p>", xml, re.S)
    out = []
    for p in paras:
        t = "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p))
        t = re.sub(r"\s+", " ", t).strip()
        out.append(t)
    return out

def subtopik_keywords(subtopik):
    keys = set()
    for st in subtopik:
        keys.add(st.lower())
        for k in re.split(r"[:,;/]", st):
            k = k.strip().lower()
            if len(k) >= 4:
                keys.add(k)
    return keys

def make_doc(cfg, blocks):
    sections = build_sections(blocks, cfg["id"], cfg["subtopik"])
    kata = sum(s["kata"] for s in sections)
    doc = {
        "id": cfg["id"],
        "judul": cfg["judul"],
        "materi": cfg["materi"],
        "deskripsi": cfg["deskripsi"],
        "sumber": cfg.get("sumber", cfg["file"]),
        "halaman": cfg["halaman"],
        "kata": kata,
        "subtopik": cfg["subtopik"],
        "sections": sections,
    }
    if cfg.get("catatan_kualitas"):
        doc["catatan_kualitas"] = cfg["catatan_kualitas"]
    return doc

def process_generic(cfg):
    kind = cfg["kind"]
    if kind == "ocr":
        pages = extract_ocr_pages(os.path.join(SRC, cfg["file"]))
        pdf_source = False
    elif kind == "pdf":
        pages = extract_pdf_pages(os.path.join(SRC, cfg["file"]))
        pdf_source = True
    elif kind == "docx":
        paras = extract_docx_paragraphs(os.path.join(SRC, cfg["file"]))
        pages = ["\n\n".join(paras)]
        pdf_source = True
    else:
        raise ValueError(kind)
    if cfg.get("drop_ad_pages"):
        # buang halaman iklan tryout premium (bukan materi belajar)
        pages = [p for p in pages if "tryout premium" not in p.lower()]
    lines = clean_pages(pages, extra_drop=cfg.get("extra_drop"))
    blocks = build_blocks(lines, pdf_source, subtopik_keywords(cfg["subtopik"]),
                          subtopik_list=cfg["subtopik"])
    return make_doc(cfg, blocks)

# ---------------------------------------------------------------- config
# subtopik & catatan_kualitas disalin dari inventaris-materi.json
DOCS = [
    dict(id="twk-modul-ringkasan", judul="Ringkasan Materi TWK CPNS (Modul TWK)",
         materi="TWK", kind="ocr", file="ocr/Mod-TWK-Ringkasan.txt", halaman=93,
         deskripsi="Ringkasan materi TWK lengkap: Pancasila, UUD 1945, Bhinneka Tunggal Ika, tata negara, HAM, sejarah nasional, dan hubungan internasional.",
         subtopik=["Pancasila","UUD 1945","Bhinneka Tunggal Ika","Sistem Tata Negara Indonesia",
                   "Hak Asasi Manusia (HAM)","Sejarah Nasional Indonesia",
                   "Hubungan Internasional Indonesia Semasa Perjuangan","Politik Luar Negeri Indonesia",
                   "Kemampuan Berbahasa Indonesia","Pemahaman Bacaan"],
         catatan_kualitas="Hasil OCR modul scan; tata letak dua kolom kadang mengacaukan urutan baca dan ada karakter salah baca."),
    dict(id="twk-cheat-sheet", judul="Cheat Sheet TWK 2024 by Analitica.id",
         materi="TWK", kind="ocr", file="ocr/Cheat-Sheet-TWK-2024-Analitica.txt", halaman=10,
         drop_ad_pages=True,
         deskripsi="Kartu ringkas TWK: poin penting, kata kunci, dan tips menjawab soal per tema.",
         subtopik=["Nasionalisme","Pilar Negara","Bela Negara","Integritas","Bahasa Indonesia",
                   "Pancasila","UUD 1945","NKRI"],
         catatan_kualitas="Hasil OCR cheat sheet bergaya kartu/infografis; poin-poin kunci dan kata kunci per tema."),
    dict(id="twk-rangkuman-temenasn", judul="Rangkuman TWK TemanASN",
         materi="TWK", kind="pdf", file="skd_cpns_2/skd cpns 2/rangkuman TWK-temanASN.pdf", halaman=11,
         deskripsi="Rangkuman ringkas TWK berorientasi hafalan: tokoh, tanggal, dan rumusan penting.",
         subtopik=["Sejarah Perumusan Pancasila","Pancasila (lima sila)","Bangsa dan Negara",
                   "Bela Negara","Pancasila sebagai Ideologi Terbuka","Pokok Pikiran Pembukaan UUD 1945",
                   "Prosedur pemberhentian Presiden"],
         catatan_kualitas="PDF berteks, ekstraksi baik."),
    dict(id="twk-rangkuman-tryout", judul="Rangkuman TWK dari Tryout",
         materi="TWK", kind="docx", file="skd_cpns_2/skd cpns 2/RANGKUMAN TWK DARI TRYOUT.docx", halaman=3,
         deskripsi="Catatan materi TWK yang dirangkum dari soal-soal tryout: nasionalisme, gratifikasi, integritas, dan wawasan kebangsaan.",
         subtopik=["Nasionalisme","Gratifikasi dan anti-korupsi (9 nilai anti-korupsi)","Bela Negara",
                   "Integritas","Bhinneka Tunggal Ika","Pergerakan Nasional",
                   "Pancasila dan UUD 1945 (hubungan kausal organis)","Wawasan Nusantara","Fungsi DPR",
                   "Kewarganegaraan (ius soli)","Deklarasi Juanda","Tujuan NKRI"],
         catatan_kualitas="DOCX; rangkuman catatan dari soal-soal tryout (materi, bukan bank soal)."),
    dict(id="twk-keyword-bela-negara", judul="Implementasi Keyword: Bela Negara, Patriotisme, Nasionalisme",
         materi="TWK", kind="pdf", file="skd_cpns_1/skd cpns 1/ImplementasiKeyword_penerapan_Bela_Negara,_Patriotisme,_Nasionalisme.pdf", halaman=2,
         deskripsi="Bela negara lengkap: pembeda empat konsep yang sering tertukar, dasar hukum dan lima nilai dasar, bentuk partisipasi warga, dan jenis ancaman terhadap negara.",
         subtopik=["Bela Negara","Patriotisme","Nasionalisme","Cinta Tanah Air","Perbedaan keyword keempat konsep"],
         catatan_kualitas="PDF 2 hal bergaya infografis; sebagian isi berupa gambar/tabel sehingga teks terekstrak hanya sebagian."),
    dict(id="tiu-modul", judul="Ringkasan Materi TIU CPNS (Modul TIU)",
         materi="TIU", kind="ocr", file="ocr/Mod-MATERI-TIU-CPNS.txt", halaman=98,
         deskripsi="Ringkasan materi TIU: penalaran verbal, analitis, logis, silogisme, aritmetika, deret angka, dan hitung cepat.",
         subtopik=["Penalaran verbal: sinonim, antonim, analogi","Penalaran analitis","Penalaran logis",
                   "Silogisme","Aritmetika dan aljabar","Deret angka","Kecepatan berhitung",
                   "Pecahan dan perbandingan"],
         catatan_kualitas="Hasil OCR modul scan; rumus dan notasi matematika kadang kacau (perlu cek manual). Tidak mencakup materi figural/gambar."),
    dict(id="tiu-analogi-verbal", judul="Materi Analogi Verbal TIU | TemanASN",
         materi="TIU", kind="pdf", file="skd_cpns_2/skd cpns 2/tiu-analogi-verbal.pdf", halaman=4,
         deskripsi="Materi analogi verbal: definisi, bentuk-bentuk analogi, dan contoh analogi profesi dan tempat kerja.",
         subtopik=["Definisi analogi verbal","Bentuk-bentuk soal analogi (dua kata, kalimat)",
                   "Contoh analogi profesi dan tempat kerja"],
         catatan_kualitas="PDF berteks, ekstraksi baik."),
    dict(id="tiu-hitung-cepat", judul="Hitung Cepat | TemanASN",
         materi="TIU", kind="pdf", file="skd_cpns_2/skd cpns 2/tiu-hitung-cepat.pdf", halaman=10,
         deskripsi="Teknik hitung cepat: jenis dan sifat bilangan (ABCSIROPP), pecahan, dan trik berhitung.",
         subtopik=["Jenis bilangan (ABCSIROPP)","Sifat-sifat bilangan","Pecahan","Teknik hitung cepat"],
         catatan_kualitas="PDF berteks, ekstraksi cukup baik meski ada kata yang menempel tanpa spasi di beberapa bagian (artefak layout). 6 blok 'Contoh Soal'."),
    dict(id="tkp-modul", judul="Ringkasan Materi TKP CPNS (Modul TKP)",
         materi="TKP", kind="ocr", file="ocr/Mod-MATERI-TKP-CPNS.txt", halaman=60,
         deskripsi="Ringkasan materi TKP per aspek: integritas, adaptasi, pengendalian diri, semangat berprestasi, pelayanan, dan lainnya.",
         subtopik=["Integritas","Kejujuran","Kemampuan beradaptasi","Pengendalian diri",
                   "Semangat berprestasi","Inisiatif","Kreativitas dan inovasi","Ketekunan",
                   "Orientasi pelayanan","Toleransi","Kepedulian lingkungan","Efisiensi kerja"],
         catatan_kualitas="Hasil OCR modul scan; tata letak dua kolom kadang mengacaukan urutan baca."),
    dict(id="tkp-cheat-sheet", judul="Cheat Sheet TKP 2024 by Analitica.id",
         materi="TKP", kind="ocr", file="ocr/TKP.txt", halaman=10,
         drop_ad_pages=True,
         deskripsi="Kartu ringkas TKP: kata kunci dan ciri soal per aspek (profesionalisme, pelayanan publik, jejaring kerja, sosial budaya, TIK, anti radikalisme).",
         subtopik=["Profesionalisme","Pelayanan publik","Jejaring kerja","Sosial budaya",
                   "Teknologi informasi dan komunikasi","Anti radikalisme"],
         catatan_kualitas="Hasil OCR cheat sheet bergaya kartu multi-kolom; tata letak kartu kadang mengacaukan urutan baca teks hasil OCR."),
    dict(id="tkp-rangkuman-temenasn", judul="Rangkuman TKP TemenASN",
         materi="TKP", kind="pdf", file="skd_cpns_2/skd cpns 2/RANGKUMAN TKP TemenASN.pdf", halaman=10,
         deskripsi="Rangkuman narasi per aspek TKP: ciri-ciri, prinsip, dan cara menghadapi soal.",
         subtopik=["Anti radikalisme","Jejaring kerja","Pelayanan publik dan etiket pelayanan",
                   "Profesionalisme","Teknologi informasi dan komunikasi (TIK)","Sosial budaya"],
         catatan_kualitas="PDF berteks, ekstraksi baik. Tanpa soal latihan."),
]

# ---------------------------------------------------------------- Handbook (khusus)
# Handbook adalah PDF visual landscape: teks fragmen tersebar sehingga deteksi
# judul generik menghasilkan judul sampah. Strukturnya diambil dari label
# BAGIAN di header tiap halaman + judul dari Daftar Isi (hal. 2, terverifikasi).
# Halaman sampul, daftar isi, disclaimer, dan promosi (video/buku) dilewati.
HANDBOOKS = {
    "tiu-handbook-verbal": dict(
        judul="Handbook TIU SKD CPNS Seri 1 | Kemampuan Verbal",
        file="bahan_belajar/1. Bahan Belajar/Handbook_TIU_SKD_CPNS_Seri1_Kemampuan_Verbal_Landscape-1-1.pdf",
        halaman=46,
        deskripsi="Handbook kemampuan verbal: analogi, silogisme, penalaran analitis, teknik eliminasi, dan error pattern.",
        subtopik=["Analogi","Silogisme","Penalaran analitis","Teknik eliminasi","Error pattern",
                  "Sistem cepat verbal"],
        catatan_kualitas="PDF berteks landscape, ekstraksi baik.",
        pengantar="Catatan Acuan Seleksi", penutup="Ringkasan Akhir",
        bagian={"I": "Peta Besar TIU Verbal", "II": "Analogi", "III": "Silogisme",
                "IV": "Penalaran Analitis", "V": "Teknik Eliminasi",
                "VI": "Error Pattern yang Harus Dihindari", "VII": "Sistem Cepat Verbal",
                "VIII": "Mini Drill", "IX": "Checklist Sebelum Memilih Jawaban",
                "X": "Cheat Sheet TIU Verbal", "XI": "Pola Penguasaan Materi"}),
    "tiu-handbook-numerik": dict(
        judul="Handbook TIU SKD CPNS Seri 2 | Kemampuan Numerik",
        file="bahan_belajar/1. Bahan Belajar/Handbook_TIU_SKD_CPNS_Seri2_Kemampuan_Numerik_Landscape-1-1.pdf",
        halaman=44,
        deskripsi="Handbook kemampuan numerik: berhitung, deret angka, perbandingan kuantitatif, soal cerita, dan hitung cepat.",
        subtopik=["Berhitung","Deret angka","Perbandingan kuantitatif","Soal cerita","Hitung cepat",
                  "Jebakan TIU numerik"],
        catatan_kualitas="PDF berteks landscape, ekstraksi baik.",
        pengantar="Catatan Acuan", penutup="Ringkasan Akhir",
        bagian={"I": "Peta Besar TIU Numerik", "II": "Berhitung", "III": "Deret Angka",
                "IV": "Perbandingan Kuantitatif", "V": "Soal Cerita", "VI": "Hitung Cepat",
                "VII": "Jebakan TIU Numerik", "VIII": "Mini Drill", "IX": "Cheat Sheet",
                "X": "Materi Pengayaan", "XI": "Prioritas Belajar"}),
    "tiu-handbook-figural": dict(
        judul="Handbook TIU SKD CPNS Seri 3 | Kemampuan Figural",
        file="bahan_belajar/1. Bahan Belajar/Handbook_TIU_SKD_CPNS_Seri3_Kemampuan_Figural_Landscape-1-1.pdf",
        halaman=57,
        deskripsi="Handbook kemampuan figural: analogi gambar, ketidaksamaan, serial gambar, dan strategi mengerjakan soal gambar.",
        subtopik=["Analogi gambar","Ketidaksamaan","Serial gambar","Strategi mengerjakan figural",
                  "Jebakan figural","Formula pemeriksaan cepat"],
        catatan_kualitas="PDF berteks landscape, ekstraksi baik. Materi figural sangat bergantung pada gambar sehingga teks saja tidak cukup, perlu cek visual/gambar saat dipakai sebagai konten belajar.",
        pengantar="Catatan Acuan", penutup="Rangkuman Satu Halaman",
        bagian={"I": "Dasar Kemampuan Figural", "II": "Analogi Gambar", "III": "Ketidaksamaan",
                "IV": "Serial Gambar", "V": "Strategi Mengerjakan Figural",
                "VI": "Jebakan yang Wajib Dikenali", "VII": "Formula Pemeriksaan Cepat",
                "VIII": "Mini Latihan Konseptual", "IX": "Level Penguasaan Figural",
                "X": "Diagnosis Kesalahan", "XI": "Peta Penguasaan",
                "XII": "Cheat Sheet Figural", "XIII": "Inti Handbook"}),
}

def handbook_page_label(page_text):
    """Label bagian dari header halaman, atau 'skip' untuk sampul/TOC/promo."""
    lines = [clean_line(l) for l in page_text.splitlines()]
    lines = [l for l in lines if l]
    # pencocokan PER BARIS (tanpa spasi): pencocokan pada teks gabungan memberi
    # positif palsu di batas kata ("...KONDISI"+"HANDBOOK..." -> "ISIHANDBOOK").
    for ln in lines:
        ns = ln.replace(" ", "").upper()
        if "BELAJARLEWATVIDEO" in ns or "REKOMENDASIBUKU" in ns:
            return "skip-promo"
        if "CATATANPENTING" in ns:
            return "skip-disclaimer"
        if ns in ("ISIHANDBOOK", "DAFTARISI"):
            return "skip-toc"
    joined = " ".join(lines)
    for ln in lines:
        m = re.match(r"^BAGIAN\s*([IVX]{1,5})\b", ln)
        if m:
            return ("bagian", m.group(1))
        if re.match(r"^PENGANTAR\b", ln):
            return ("pengantar",)
        if re.match(r"^PENUTUP\b", ln):
            return ("penutup",)
        if re.match(r"^LAMPIRAN\b", ln):
            sub = "kunci" if ("KUNCIJAWABAN" in joined or "KUNCI JAWABAN" in joined) else "latihan"
            return ("lampiran", sub)
    return None

def process_handbook(doc_id):
    cfg = HANDBOOKS[doc_id]
    pages = extract_pdf_pages(os.path.join(SRC, cfg["file"]))
    # label per halaman (hal. 1 = sampul, selalu dilewati)
    labels = []
    for i, pg in enumerate(pages):
        if i == 0:
            labels.append("skip-cover")
            continue
        labels.append(handbook_page_label(pg))
    # halaman tanpa label mewarisi label sebelumnya
    last = None
    for i, lb in enumerate(labels):
        if lb is None:
            labels[i] = last
        elif isinstance(lb, tuple):
            last = lb
    # kelompokkan halaman berurutan dengan label sama
    groups = []
    for i, lb in enumerate(labels):
        if not isinstance(lb, tuple):
            continue
        if groups and groups[-1][0] == lb:
            groups[-1][1].append(i)
        else:
            groups.append((lb, [i]))
    sections = []
    n = 0
    for lb, idxs in groups:
        if lb[0] == "bagian":
            judul = f"Bagian {lb[1]}: {cfg['bagian'][lb[1]]}"
            sub = match_subtopik(cfg["bagian"][lb[1]], cfg["subtopik"], cfg["subtopik"][0])
            catatan = None
        elif lb[0] == "pengantar":
            judul = f"Pengantar: {cfg['pengantar']}"
            sub = cfg["subtopik"][0]
            catatan = None
        elif lb[0] == "penutup":
            judul = f"Penutup: {cfg['penutup']}"
            sub = cfg["subtopik"][0]
            catatan = None
        else:  # lampiran
            judul = ("Lampiran: Kunci Jawaban dan Pembahasan" if lb[1] == "kunci"
                     else "Lampiran: Latihan Soal Bergambar")
            sub = "Mini latihan konseptual"
            catatan = ("Soal-soal ini bergambar; teks hanya memuat instruksi dan pembahasan, "
                       "gambar soalnya tidak tersedia dalam teks.")
        lines = clean_pages([pages[i] for i in idxs], handbook=True)
        blocks = build_blocks(lines, True, set(), detect_headings=False)
        texts = [b["text"] for b in blocks]
        chunks = split_long(texts, 1500, 1100)
        for ci, ch in enumerate(chunks):
            konten = "\n\n".join(ch).strip()
            if not konten:
                continue
            n += 1
            sec = {"id": f"{doc_id}-s{n:02d}", "subtopik": sub,
                   "judul": judul if ci == 0 else f"{judul} (lanjutan {ci + 1})",
                   "konten": konten, "kata": len(konten.split())}
            if catatan and ci == 0:
                sec["catatan"] = catatan
            sections.append(sec)
    doc = {"id": doc_id, "judul": cfg["judul"], "materi": "TIU",
           "deskripsi": cfg["deskripsi"], "sumber": cfg["file"],
           "halaman": cfg["halaman"], "kata": sum(s["kata"] for s in sections),
           "subtopik": cfg["subtopik"], "sections": sections,
           "catatan_kualitas": cfg["catatan_kualitas"]}
    skipped = [i + 1 for i, lb in enumerate(labels) if isinstance(lb, str)]
    print(f"  {doc_id}: halaman dilewati (sampul/TOC/promo/disclaimer): {skipped}")
    return doc

# ---------------------------------------------------------------- Kartu Sakti (khusus)
# PDF tabel: tiap baris = satu kompetensi (aspek + nama + kode + deskripsi level 0-6
# + kata kunci). Diparse per kompetensi, bukan per halaman.
KARTU_GROUPS = ["Kemampuan Berfikir (KB)", "Mengelola Diri (MD)",
                "Mengelola Orang Lain (MO)", "Mengelola Tugas (MT)",
                "Mengelola Sosial dan Budaya (SB)", "Kemampuan Menghubungkan"]
KARTU_ASPEK = ["Profesionalisme", "Jejaring Kerja", "Pelayanan Publik",
               "Sosial Budaya", "Teknologi Informasi dan Komunikasi",
               "Teknologi Informasi", "Integritas",
               "Adaptasi", "Pengendalian Diri", "Kerja Sama"]
KARTU_ROW_RE = re.compile(r"^(\d{1,2})\s+(.+?)\s*\(([A-Za-z0-9]{1,8})\)\s+0\s+(.+)$")
KARTU_ROW_NOCODE_RE = re.compile(r"^(\d{1,2})\s+(.+?)\s+0\s+(.+)$")
KARTU_LEVEL_RE = re.compile(r"^([0-6])\s+(.+)$")
KARTU_TRAILING_LEVEL_RE = re.compile(r"^(.{4,}?)\s+([0-6])$")
KARTU_FOOTER = {"PROFESIONALISME", "JEJARING KERJA", "SOSIAL BUDAYA",
                "PELAYANAN PUBLIK", "TIK"}

def process_kartu_sakti():
    cfg = dict(id="tkp-kartu-sakti", judul="Kartu Sakti TKP | Master", materi="TKP",
               deskripsi="Referensi cepat TKP: definisi kompetensi, deskripsi level 0–6, dan kata kunci per aspek.",
               sumber="skd_cpns_1/skd cpns 1/Kartu Sakti TKP - Master.pdf", halaman=7,
               subtopik=["Profesionalisme","Jejaring kerja","Pelayanan publik","Sosial budaya",
                         "Teknologi Informasi dan Komunikasi","Integritas","Adaptasi","Pengendalian diri","Kerja sama"],
               catatan_kualitas="PDF berteks berupa tabel aspek-kompetensi-level (definisi + deskripsi level 0–6 + kata kunci). Referensi cepat, bukan materi narasi; tanpa soal latihan.")
    pages = extract_pdf_pages(os.path.join(SRC, cfg["sumber"]))
    lines = clean_pages(pages)
    # pisah baris yang menempel: "...sudut pandang. 5 Mengakomodir..." -> 2 baris,
    # juga "kegiatan 6 Menentukan ..." (nomor level menempel tanpa titik)
    split_lines = []
    for ln in lines:
        if not ln:
            split_lines.append(ln)
            continue
        parts = re.split(r"(?<=[.!?])\s+(?=[0-6]\s+[A-Z])", ln)
        out = []
        for p in parts:
            # hanya pisah sebelum level 1-6: " 0 " adalah penanda level-0 baris
            # kompetensi tanpa kode ("25 ... Keputusan 0 Membuat ...") dan
            # tidak boleh terbelah
            out.extend(re.split(r"(?<=[a-z])\s+(?=[1-6]\s+[A-Z][a-z])", p))
        split_lines.extend(out)
    lines = split_lines

    entries = []
    cur = None
    group = None
    kw_mode = False      # penanda KATA KUNCI sudah lewat
    in_kw = False        # sedang membaca teks kata kunci ("Mampu ...")
    pending_level = None # nomor level yang teksnya menyusul ("KATA KUNCI : 5")
    last_level = None
    seen_level = False
    warnings = []

    def flush():
        nonlocal cur
        if cur:
            entries.append(cur)
        cur = None

    def new_entry(no, rest, kode, lvl0):
        nonlocal kw_mode, in_kw, pending_level, last_level, seen_level
        aspek = None
        for a in sorted(KARTU_ASPEK, key=len, reverse=True):
            if rest.lower().startswith(a.lower()):
                aspek = a
                break
        if aspek is None:
            warnings.append(f"baris kompetensi tanpa aspek dikenal: {rest[:60]!r}")
            aspek = rest.split()[0]
            kompetensi = rest
        else:
            kompetensi = rest[len(aspek):].strip()
        kw_mode = in_kw = False
        pending_level = None
        last_level = 0
        seen_level = False
        return {"nomor": int(no), "aspek": aspek, "kompetensi": kompetensi,
                "kode": kode, "kelompok": group, "definisi": [],
                "level": {0: lvl0}, "katakunci": []}

    for ln in lines:
        if not ln or ln in KARTU_FOOTER:
            continue
        if ln in KARTU_GROUPS:
            group = ln
            continue
        m = KARTU_ROW_RE.match(ln)
        if not m:
            m2 = KARTU_ROW_NOCODE_RE.match(ln)
            # baris tanpa kode hanya sah bila diawali nama aspek yang dikenal
            if m2 and any(m2.group(2).startswith(a) for a in KARTU_ASPEK):
                m = m2
        if m:
            flush()
            if len(m.groups()) == 4:
                no, rest, kode, lvl0 = m.groups()
            else:
                no, rest, lvl0 = m.groups()
                kode = ""
            cur = new_entry(no, rest, kode, lvl0)
            continue
        if cur is None:
            continue
        if "KATA KUNCI" in ln:
            kw_mode = True
            in_kw = False
            rest = ln.split("KATA KUNCI", 1)[1].strip(": ").strip()
            if not rest:
                continue
            if re.fullmatch(r"[0-6]", rest):  # "KATA KUNCI : 5" (teks level menyusul)
                pending_level = int(rest)
                continue
            ln = rest
        lm = KARTU_LEVEL_RE.match(ln)
        if lm:
            last_level = int(lm.group(1))
            seen_level = True
            pending_level = None
            in_kw = False
            cur["level"][last_level] = lm.group(2)
            continue
        tm = KARTU_TRAILING_LEVEL_RE.match(ln)
        if tm and (kw_mode or seen_level):
            # "... dalam keputusan 6" -> teks + nomor level yang menyusul
            ln = tm.group(1)
            pending_level = int(tm.group(2))
            if kw_mode and in_kw:
                cur["katakunci"].append(ln)
                in_kw = False
            elif pending_level is not None and seen_level:
                cur["level"].setdefault(pending_level, "")
                # teks sebelum angka adalah lanjutan level sebelumnya/kata kunci;
                # bila sedang di kata kunci, masukkan ke kata kunci
                if in_kw:
                    cur["katakunci"].append(ln)
                elif last_level is not None:
                    cur["level"][last_level] += " " + ln
            continue
        if kw_mode and ln.startswith("Mampu"):
            in_kw = True
            pending_level = None
            cur["katakunci"].append(ln)
            continue
        if in_kw:
            cur["katakunci"].append(ln)
            continue
        if pending_level is not None:
            cur["level"][pending_level] = (
                cur["level"].get(pending_level, "") + " " + ln).strip()
            seen_level = True
            last_level = pending_level
            continue
        if seen_level and last_level is not None:
            # lanjutan baris level sebelumnya (sel terpotong)
            cur["level"][last_level] += " " + ln
        else:
            cur["definisi"].append(ln)
    flush()

    sections = []
    for i, e in enumerate(entries, 1):
        st = next((s for s in cfg["subtopik"] if s.lower() == e["aspek"].lower()), e["aspek"])
        parts = []
        if e["kelompok"]:
            parts.append(f"Kelompok: {e['kelompok']}")
        definisi = " ".join(e["definisi"]).strip()
        if definisi:
            parts.append(f"Definisi: {definisi}")
        # v2.5: deskripsi level dirender sebagai tabel beneran
        # (MarkdownLite sudah mendukung tabel markdown).
        lv_rows = ["| Level | Deskripsi |", "|---|---|"]
        lv_rows += [f"| {n} | {e['level'][n]} |"
                    for n in sorted(e["level"]) if e["level"][n]]
        parts.append("\n".join(lv_rows))
        kw = " ".join(e["katakunci"]).strip()
        if kw:
            parts.append(f"Kata kunci: {kw}")
        konten = "\n\n".join(parts)
        judul = f"{e['aspek']}: {e['kompetensi']}" + (f" ({e['kode']})" if e["kode"] else "")
        sections.append({"id": f"tkp-kartu-sakti-s{i:02d}", "nomor": e["nomor"],
                         "subtopik": st, "judul": judul,
                         "konten": konten, "kata": len(konten.split())})
    for w in warnings:
        print("  PERINGATAN kartu sakti:", w)
    print(f"  kartu sakti: {len(entries)} kompetensi terparse")
    doc = {"id": cfg["id"], "judul": cfg["judul"], "materi": cfg["materi"],
           "deskripsi": cfg["deskripsi"], "sumber": cfg["sumber"],
           "halaman": cfg["halaman"], "kata": sum(s["kata"] for s in sections),
           "subtopik": cfg["subtopik"], "sections": sections,
           "catatan_kualitas": cfg["catatan_kualitas"]}
    return doc

# ---------------------------------------------------------------- Bang Arya (khusus)
# Rentang halaman dari pemindaian header topik per halaman (2026-11-13):
# tiap topik = 1-3 hal mind map + hal soal + hal "PEMBAHASAN <TOPIK>".
BANG_ARYA_RANGES = [
    ("Pengantar", 1, 4, "Umum"),
    ("Soal Pancasila", 5, 16, "Pancasila"),
    ("Pembahasan Pancasila", 17, 21, "Pancasila"),
    ("Soal Bela Negara", 22, 34, "Bela Negara"),
    ("Pembahasan Bela Negara", 35, 42, "Bela Negara"),
    ("Soal Integritas", 43, 56, "Integritas"),
    ("Pembahasan Integritas", 57, 63, "Integritas"),
    ("Soal Bahasa Indonesia", 64, 78, "Bahasa Indonesia"),
    ("Pembahasan Bahasa Indonesia", 79, 83, "Bahasa Indonesia"),
    ("Soal Nasionalisme dan Bhinneka Tunggal Ika", 84, 97, "Nasionalisme dan Bhinneka Tunggal Ika"),
    ("Pembahasan Nasionalisme dan Bhinneka Tunggal Ika", 98, 102, "Nasionalisme dan Bhinneka Tunggal Ika"),
    ("Soal Pilar Negara", 103, 114, "Pilar Negara"),
    ("Pembahasan Pilar Negara", 115, 121, "Pilar Negara"),
]
BANG_ARYA_DROP = {
    "KANG ARYA CPNS", "MASTERY TWK", "MASTERY TWK 2024", "TWK", "CPNS",
    "PANCASILA", "BELA NEGARA", "INTEGRITAS", "BAHASA INDONESIA",
    "NASIONALISME DAN BHINEKA TUNGGA IKA", "PILAR NEGARA",
    "PEMBAHASAN PANCASILA", "PEMBAHASAN BELA NEGARA", "PEMBAHASAN INTEGRITAS",
    "PEMBAHASAN BAHASA INDONESIA", "PEMBAHASAN NASIONALISME DAN BHINEKA TUNGGA IKA",
    "PEMBAHASAN PILAR NEGARA", "FULL SOAL PENALASAN", "MIRIP ASLI",
    "LEBIH DARI 200 SOAL", "DILENGKAPI JAWABAN", "SOAL HOTS",
    "Join Grup Telegram", "bit.ly/KangAryaCPNS", "Follow TikTok", "@kang.arya.cpns",
    "JULI 2024", "SALAM,", "KANG ARYA & FAMILY", "Terima Kasih",
}

def process_bang_arya():
    cfg = dict(id="twk-bang-arya", judul="Rangkuman Tabel TWK",
               materi="TWK",
               deskripsi="Rangkuman tabel TWK: poin setiap sila Pancasila, timeline UUD 1945, sembilan nilai integritas, penggunaan huruf kapital, prinsip nasionalisme, dan NKRI dalam UUD 1945.",
               sumber="skd_cpns_2/skd cpns 2/TWK BANG ARYA.pdf", halaman=121,
               subtopik=["Pancasila","Bela Negara","Pilar Negara","Integritas",
                         "Nasionalisme dan Bhinneka Tunggal Ika","Bahasa Indonesia"],
               catatan_kualitas="PDF berteks, kualitas ekstraksi baik. Hanya 6 rangkuman yang dipertahankan; soal latihan dan pembahasan dikeluarkan dari Belajar. Isi 6 bagian dikurasi tulis-ulang terstruktur (v2.3.3) karena ekstraksi mind-map/tabel aslinya tidak berurutan.")
    pages = extract_pdf_pages(os.path.join(SRC, cfg["sumber"]))
    assert len(pages) == 121, f"Bang Arya: {len(pages)} halaman, perkiraan 121"
    sections = []
    n = 0
    for judul, p1, p2, sub in BANG_ARYA_RANGES:
        rng_pages = pages[p1 - 1:p2]
        lines = clean_pages(rng_pages, extra_drop=BANG_ARYA_DROP)
        blocks = build_blocks(lines, True, set(), detect_headings=False)
        texts = [b["text"] for b in blocks]
        chunks = split_long(texts, 1500, 1100)
        for ci, ch in enumerate(chunks):
            konten = "\n\n".join(ch).strip()
            if not konten:
                continue
            n += 1
            sec = {
                "id": f"twk-bang-arya-s{n:02d}",
                "subtopik": sub,
                "judul": judul if ci == 0 else f"{judul} (lanjutan {ci + 1})",
                "konten": konten,
                "kata": len(konten.split()),
            }
            if ci == 0 and judul.startswith("Soal "):
                sec["catatan"] = ("Bagian awal section ini berasal dari halaman mind map: "
                                  "kata kunci terekstrak tidak berurutan; isi dipertahankan apa adanya.")
            sections.append(sec)
    doc = {
        "id": cfg["id"], "judul": cfg["judul"], "materi": cfg["materi"],
        "deskripsi": cfg["deskripsi"], "sumber": cfg["sumber"], "halaman": cfg["halaman"],
        "kata": sum(s["kata"] for s in sections), "subtopik": cfg["subtopik"],
        "sections": sections, "catatan_kualitas": cfg["catatan_kualitas"],
    }
    return doc

# ---------------------------------------------------------------- Tabel pangkat (khusus)
def process_tabel_pangkat():
    # Hitung ulang secara programatis, digit OCR TIDAK dipercaya.
    t2 = [[n, n ** 2] for n in range(1, 101)]
    t3 = [[n, n ** 3] for n in range(1, 101)]
    t4 = [[n, n ** 4] for n in range(1, 101)]
    # spot check terhadap nilai yang terbaca benar di OCR / matematika dasar
    assert t2[50] == [51, 2601] and t2[75] == [76, 5776] and t2[99] == [100, 10000]
    assert t3[0] == [1, 1] and t3[9] == [10, 1000] and t3[99] == [100, 1000000]
    assert t4[0] == [1, 1] and t4[1] == [2, 16] and t4[99] == [100, 100000000]

    def preview(t, p):
        rows = "\n".join(f"{n}^{p} = {v:,}".replace(",", ".") for n, v in t[:10])
        return rows

    sections = [
        {"id": "tiu-tabel-pangkat-s01", "subtopik": "Tabel pangkat 2 (1–100)",
         "judul": "Cara Memakai Tabel Pangkat",
         "konten": ("Tabel ini berisi nilai pangkat 2, 3, dan 4 untuk bilangan 1–100. "
                    "Semua angka dihitung ulang secara programatis (bukan disalin dari hasil OCR), "
                    "jadi dijamin benar.\n\n"
                    "Cara memakai: cari bilangan dasarnya di kolom pertama, lalu baca hasilnya di kolom kedua. "
                    "Contoh: 7² = 49, 7³ = 343, 7⁴ = 2.401.\n\n"
                    "Tips menghafal untuk TIU: hafalkan pangkat 2 dari 1–30, pangkat 3 dari 1–20, dan pangkat 4 "
                    "dari 1–10. Pola digit terakhir juga membantu: kuadrat hanya bisa berakhiran 0, 1, 4, 5, 6, atau 9."),
         "kata": 0},
        {"id": "tiu-tabel-pangkat-s02", "subtopik": "Tabel pangkat 2 (1–100)",
         "judul": "Tabel Pangkat 2 (1–100)",
         "konten": ("Nilai kuadrat bilangan 1–100. Data lengkap ada di field `tabel.pangkat2` "
                    "sebagai pasangan [bilangan, hasil].\n\nContoh (1–10):\n\n" + preview(t2, 2)),
         "kata": 0},
        {"id": "tiu-tabel-pangkat-s03", "subtopik": "Tabel pangkat 3 (1–100)",
         "judul": "Tabel Pangkat 3 (1–100)",
         "konten": ("Nilai pangkat tiga bilangan 1–100. Data lengkap ada di field `tabel.pangkat3` "
                    "sebagai pasangan [bilangan, hasil].\n\nContoh (1–10):\n\n" + preview(t3, 3)),
         "kata": 0},
        {"id": "tiu-tabel-pangkat-s04", "subtopik": "Tabel pangkat 4 (1–100)",
         "judul": "Tabel Pangkat 4 (1–100)",
         "konten": ("Nilai pangkat empat bilangan 1–100. Data lengkap ada di field `tabel.pangkat4` "
                    "sebagai pasangan [bilangan, hasil].\n\nContoh (1–10):\n\n" + preview(t4, 4)),
         "kata": 0},
    ]
    for s in sections:
        s["kata"] = len(s["konten"].split())
    doc = {
        "id": "tiu-tabel-pangkat",
        "judul": "Tabel Bilangan Pangkat 2, 3, dan 4 (1–100)",
        "materi": "TIU",
        "deskripsi": "Tabel pangkat 2, 3, dan 4 untuk bilangan 1–100 (dihitung ulang secara programatis, bukan dari OCR).",
        "sumber": ("ocr/tabel-pangkat-2-3.txt (pangkat 2–3) + "
                   "skd_cpns_2/skd cpns 2/tabel-bilangan-pangkat-4-dari-1_compress.pdf (pangkat 4); "
                   "semua angka dihitung ulang, digit OCR tidak dipakai"),
        "halaman": 5,
        "kata": sum(s["kata"] for s in sections),
        "subtopik": ["Tabel pangkat 2 (1–100)", "Tabel pangkat 3 (1–100)",
                     "Tabel pangkat 4 (1–100)"],
        "sections": sections,
        "tabel": {"pangkat2": t2, "pangkat3": t3, "pangkat4": t4},
        "catatan_kualitas": "Digit tabel hasil OCR ada yang salah baca (mis. '51? 2.601', '61? SIA'), sehingga seluruh angka dihitung ulang secara programatis dan diverifikasi dengan spot check.",
    }
    return doc

# ---------------------------------------------------------------- Materi baru (riset 2026-11-15)
# File Markdown di ~/workspace/cpns/materi/baru/ - hasil riset free-access
# (artikel web + situs resmi) untuk menutup gap audit isi materi
# (laporan: ~/workspace/cpns/materi/MATERI-BARU-2026-11-15.md).
# Struktur tiap file: judul H1, header sumber (blockquote "> ..." untuk TKP,
# seksi "## Sumber" + paragraf Catatan untuk TWK/TIU), lalu konten markdown
# (subjudul ##, paragraf, daftar "- " / "1. ", **tebal**).
# Header sumber TIDAK masuk JSON app (aturan: tanpa atribusi "by siapa" di
# app; sumber tetap tercatat di file .md internal). Kalimat atribusi yang
# terselip di dalam konten juga dibuang (daftar di _ATRIBUSI_DROP_RES).
# Verifikasi akhir (verify_baru_content) menggagalkan build bila ada
# atribusi/URL/em-dash/soal yang lolos ke konten baru.
BARU_DIR = os.path.join(SRC, "baru")

# Kalimat/klausa atribusi di dalam konten (bukan header) yang dibuang utuh.
# Ditemukan dengan grep atas 15 file (2026-11-15); substansi materinya
# (fakta Putusan MK, daftar 9 nilai + akronim) dipertahankan, hanya klaim
# "dicek di situs X" / "berdasarkan situs X" yang dibuang.
_ATRIBUSI_DROP_RES = [
    # "(Catatan istilah ini berdasarkan PejuangCPNS; Wikipedia mencatat ...)"
    # NB: tanpa \s* di akhir - pola lama memakan baris kosong pemisah
    # paragraf sehingga heading "## Pilar 1" menempel ke paragraf di atasnya.
    re.compile(r"\(Catatan istilah ini berdasarkan [^)]*\)[ \t]*"),
    # "Daftar dan akronim ini terkonfirmasi sama di situs KPK, ACLC KPK, dan PejuangCPNS."
    re.compile(r"Daftar dan akronim ini terkonfirmasi sama[^.]*\.[ \t]*"),
]

# Token yang TIDAK BOLEH muncul di konten baru (verifikasi akhir).
_BARU_FORBIDDEN_RES = [
    re.compile(r"https?://"),
    re.compile(r"belajarbro|pejuangcpns|pejuangpns|suratplus|datadikdasmen|"
               r"studipedia|latihansoal|knowt|gencendekia|tipscv|"
               r"digitaleducation|utbk\.or|wikipedia", re.I),
    re.compile(r"kunci jawaban|latihan soal", re.I),
    re.compile(r"app lolosin|file ini", re.I),
    re.compile(r"diakses 2026"),
    re.compile(r"\u2014"),  # em-dash
]

def _convert_table_block(rows):
    """Dulu: baris tabel markdown (| A | B |) -> daftar bullet.
    v2.5: tidak dipakai lagi, MarkdownLite sudah merender tabel markdown
    apa adanya (lihat parse_baru_markdown). Dipertahankan supaya riwayat
    konversi lama tetap terbaca; jangan dipakai untuk konten baru."""
    data = []
    for r in rows:
        cells = [c.strip() for c in r.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
            continue  # baris pemisah |---|---|
        data.append(cells)
    if len(data) < 2:
        return []
    out = []
    for cells in data[1:]:  # baris pertama = header kolom
        if len(cells) >= 2:
            out.append(f"- **{cells[0]}**: " + " - ".join(cells[1:]))
        elif cells:
            out.append("- " + cells[0])
    return out

def parse_baru_markdown(path):
    """Satu file .md baru -> konten bersih (markdown ringan app).
    Membuang: judul H1, header sumber (blockquote awal / seksi '## Sumber'
    + paragraf Catatan), garis '---'. Tabel markdown diteruskan apa adanya
    (v2.5: MarkdownLite merender tabel), quote konten ('> ...' sesudah
    konten dimulai) dibuka jadi paragraf biasa. Em-dash dibersihkan via
    clean_materi_text."""
    lines = open(path, encoding="utf-8").read().splitlines()
    out = []
    i = 0
    in_sumber_section = False
    seen_content_heading = False
    while i < len(lines):
        ln = lines[i]
        stripped = ln.strip()
        # judul H1 (judul seksi diatur dari konfigurasi, bukan dari file)
        if stripped.startswith("# ") and not stripped.startswith("## "):
            i += 1
            continue
        # seksi "## Sumber" -> buang sampai subjudul berikutnya / garis ---
        if re.match(r"^##\s+Sumber\s*$", stripped):
            in_sumber_section = True
            i += 1
            continue
        if in_sumber_section:
            if stripped.startswith("## ") or stripped == "---":
                in_sumber_section = False
                # jangan consume: baris ini diproses normal di bawah
            else:
                i += 1
                continue
        # garis pemisah
        if stripped == "---":
            i += 1
            continue
        # paragraf meta "Catatan: ..." tentang app (bukan materi)
        if stripped.startswith("Catatan:") and "Lolosin" in stripped:
            i += 1
            continue
        # blockquote: sebelum konten dimulai = header sumber (buang);
        # sesudahnya = kutipan isi (buka jadi paragraf biasa)
        if stripped.startswith(">"):
            if not seen_content_heading:
                i += 1
                continue
            text = stripped[1:].strip()
            if text:
                out.append(text)
            i += 1
            continue
        # tabel markdown: kumpulkan blok baris '|' berurutan, teruskan
        # apa adanya (v2.5: MarkdownLite merender tabel markdown).
        if stripped.startswith("|"):
            block = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i].strip())
                i += 1
            out.extend(block)
            continue
        if stripped.startswith("## "):
            seen_content_heading = True
        out.append(ln)
        i += 1
    konten = "\n".join(out)
    # buang kalimat atribusi di dalam konten
    for rx in _ATRIBUSI_DROP_RES:
        konten = rx.sub("", konten)
    konten = re.sub(r"\n{3,}", "\n\n", konten).strip()
    # jaga-jaga: heading "## "/"### " harus selalu memulai blok baru
    # (MarkdownLite memisah blok dengan baris kosong)
    konten = re.sub(r"(?<!\n)\n(#{2,3} )", r"\n\n\1", konten)
    konten = re.sub(r"[ \t]{2,}", " ", konten)
    konten = clean_materi_text(konten)
    return konten

# Urutan seksi TKP mengikuti subtopik tkp-modul (supaya dua dokumen TKP
# per-aspek sejajar urutannya).
BARU_TKP = [
    ("tkp-integritas.md", "Integritas", "Integritas"),
    ("tkp-kejujuran.md", "Kejujuran", "Kejujuran"),
    ("tkp-adaptasi.md", "Kemampuan Beradaptasi", "Kemampuan beradaptasi"),
    ("tkp-pengendalian-diri.md", "Pengendalian Diri", "Pengendalian diri"),
    ("tkp-semangat-berprestasi.md", "Semangat Berprestasi", "Semangat berprestasi"),
    ("tkp-inisiatif.md", "Inisiatif", "Inisiatif"),
    ("tkp-kreativitas-inovasi.md", "Kreativitas dan Inovasi", "Kreativitas dan inovasi"),
    ("tkp-ketekunan.md", "Ketekunan", "Ketekunan"),
    ("tkp-orientasi-pelayanan.md", "Orientasi Pelayanan", "Orientasi pelayanan"),
    ("tkp-toleransi.md", "Toleransi", "Toleransi"),
    ("tkp-kepedulian-lingkungan.md", "Kepedulian Lingkungan", "Kepedulian lingkungan"),
    ("tkp-efisiensi-kerja.md", "Efisiensi Kerja", "Efisiensi kerja"),
]

BARU_TWK = [
    ("twk-integritas.md", "Integritas", "Integritas"),
    ("twk-pilar-negara.md", "Pilar Negara", "Pilar Negara"),
    # v2.6 (poin 8): penebalan Integritas, s01 sudah membahas 9 nilai KPK
    # secara mendalam, jadi dua seksi baru ini tidak mengulanginya.
    ("twk-gratifikasi-suap-pemerasan.md", "Gratifikasi, Suap, dan Pemerasan", "Integritas"),
    ("twk-lhkpn-whistleblowing.md", "LHKPN dan Jalur Pelaporan", "Integritas"),
]

# Cheat sheet TIU baru (v2.6, poin 6): 6 seksi rumus cepat + trik,
# mengikuti pola cheat sheet TWK/TKP (6 seksi per dokumen).
BARU_TIU_CHEAT = [
    ("tiu-cheat-sheet-hitung-cepat.md", "Hitung Cepat dan Persen", "Hitung cepat dan persen"),
    ("tiu-cheat-sheet-deret.md", "Deret dan Barisan", "Deret dan barisan"),
    ("tiu-cheat-sheet-soal-cerita.md", "Soal Cerita Numerik", "Soal cerita numerik"),
    ("tiu-cheat-sheet-analogi-verbal.md", "Analogi dan Sinonim-Antonim Verbal", "Analogi dan sinonim-antonim verbal"),
    ("tiu-cheat-sheet-silogisme-logika.md", "Silogisme dan Logika", "Silogisme dan logika"),
    ("tiu-cheat-sheet-figural.md", "Figural", "Figural"),
    ("tiu-cheat-sheet-kecukupan-data.md", "Kecukupan Data", "Kecukupan data"),
]

# Penebalan Bela Negara (v2.6, poin 8): 3 seksi baru di dokumen
# twk-keyword-bela-negara (s01 pembeda empat konsep dipertahankan;
# seksi baru tidak mengulang isi s01). Ditambahkan lewat
# append_baru_bela_negara() seperti append_baru_tiu().
BARU_BELA_NEGARA = [
    ("twk-bela-negara-dasar-hukum.md", "Dasar Hukum dan Pengertian Bela Negara", "Bela Negara"),
    ("twk-bela-negara-partisipasi.md", "Bentuk Partisipasi Warga dalam Bela Negara", "Bela Negara"),
    ("twk-bela-negara-ancaman.md", "Ancaman terhadap Negara dan Sikap Bela Negara", "Bela Negara"),
]

# UUD 1945 per kelompok pasal (v2.9-parse, 2026-11-18): 12 seksi
# orisinal Lolosin, teknik hafalan per kelompok pasal.
BARU_TWK_UUD = [
    ("twk-uud-1945-s01.md", "Cara menghafal UUD 1945 per kelompok pasal", "UUD 1945"),
    ("twk-uud-1945-s02.md", "Pasal 1-3: Bentuk negara dan MPR", "UUD 1945"),
    ("twk-uud-1945-s03.md", "Pasal 4-16: Presiden dan Wakil Presiden", "UUD 1945"),
    ("twk-uud-1945-s04.md", "Pasal 17-18B: Kementerian dan pemerintahan daerah", "UUD 1945"),
    ("twk-uud-1945-s05.md", "Pasal 19-22B: DPR dan pembentukan undang-undang", "UUD 1945"),
    ("twk-uud-1945-s06.md", "Pasal 22C-22E: DPD dan pemilihan umum", "UUD 1945"),
    ("twk-uud-1945-s07.md", "Pasal 23-23G: Keuangan negara dan BPK", "UUD 1945"),
    ("twk-uud-1945-s08.md", "Pasal 24-25A: Kekuasaan kehakiman dan wilayah negara", "UUD 1945"),
    ("twk-uud-1945-s09.md", "Pasal 26-28J: Warga negara dan hak asasi manusia", "UUD 1945"),
    ("twk-uud-1945-s10.md", "Pasal 29-34: Agama, pertahanan, pendidikan, ekonomi, kesejahteraan", "UUD 1945"),
    ("twk-uud-1945-s11.md", "Pasal 35-36C: Identitas negara", "UUD 1945"),
    ("twk-uud-1945-s12.md", "Pasal 37: Perubahan UUD dan angka-angka kunci", "UUD 1945"),
]

def _baru_section(doc_id, n, fname, judul, subtopik):
    konten = parse_baru_markdown(os.path.join(BARU_DIR, fname))
    if len(konten.split()) < 50:
        raise SystemExit(f"materi baru {fname}: konten kosong/terlalu pendek "
                         f"setelah parse ({len(konten.split())} kata)")
    return {"id": f"{doc_id}-s{n:02d}", "subtopik": subtopik,
            "judul": judul, "konten": konten,
            "kata": len(konten.split())}

def process_baru_docs():
    """Dokumen baru dari riset 2026-11-15 (TKP 12 aspek + TWK + cheat
    sheet TIU). TWK kini 4 seksi (2 awal + gratifikasi/suap/pemerasan +
    LHKPN, v2.6 poin 8). Cheat sheet TIU 6 seksi (v2.6 poin 6).
    Analogi tiga kata (TIU) bukan dokumen baru: ditambahkan sebagai seksi
    ke tiu-analogi-verbal di append_baru_tiu() (satu subtopik pelengkap di
    tempatnya). Dokumen baru tampil sebagai entri sendiri di Belajar
    (fallback buildGroups di src/lib/materi.ts)."""
    docs = []
    tkp_sections = [_baru_section("tkp-karakter-perilaku", i + 1, *row)
                    for i, row in enumerate(BARU_TKP)]
    docs.append({
        "id": "tkp-karakter-perilaku",
        "judul": "Karakter dan Perilaku Kerja ASN",
        "materi": "TKP",
        "deskripsi": "Pendalaman 12 aspek TKP: integritas, kejujuran, adaptasi, pengendalian diri, semangat berprestasi, inisiatif, kreativitas dan inovasi, ketekunan, orientasi pelayanan, toleransi, kepedulian lingkungan, dan efisiensi kerja.",
        "sumber": "baru/tkp-*.md (12 file riset free-access, 2026-11-15)",
        "halaman": 0,  # riset web, tanpa halaman sumber (lihat SCHEMA.md)
        "kata": sum(s["kata"] for s in tkp_sections),
        "subtopik": [row[2] for row in BARU_TKP],
        "sections": tkp_sections,
        "catatan_kualitas": "Materi disusun dari sumber free-access (artikel web dan situs resmi) pada 2026-11-15 untuk menutup gap audit isi materi; sumber tiap aspek tercatat di file .md internal.",
    })
    twk_sections = [_baru_section("twk-integritas-pilar", i + 1, *row)
                    for i, row in enumerate(BARU_TWK)]
    docs.append({
        "id": "twk-integritas-pilar",
        "judul": "Integritas dan Pilar Negara",
        "materi": "TWK",
        "deskripsi": "Pendalaman integritas dan pilar negara: sembilan nilai integritas versi KPK, pembeda gratifikasi, suap, dan pemerasan, LHKPN dan jalur pelaporan, serta Empat Pilar MPR RI sebagai satu kesatuan.",
        "sumber": "baru/twk-integritas.md + baru/twk-pilar-negara.md + baru/twk-gratifikasi-suap-pemerasan.md + baru/twk-lhkpn-whistleblowing.md (riset free-access, 2026-11-15)",
        "halaman": 0,  # riset web, tanpa halaman sumber (lihat SCHEMA.md)
        "kata": sum(s["kata"] for s in twk_sections),
        # dedupe: 3 dari 4 seksi bersubtopik "Integritas"
        "subtopik": list(dict.fromkeys(row[2] for row in BARU_TWK)),
        "sections": twk_sections,
        "catatan_kualitas": "Materi disusun dari sumber free-access (artikel web dan situs resmi KPK/MPR) pada 2026-11-15 untuk menutup gap audit isi materi; sumber tiap subtopik tercatat di file .md internal.",
    })
    tiu_sections = [_baru_section("tiu-cheat-sheet", i + 1, *row)
                    for i, row in enumerate(BARU_TIU_CHEAT)]
    docs.append({
        "id": "tiu-cheat-sheet",
        "judul": "Cheat Sheet TIU",
        "materi": "TIU",
        "deskripsi": "Kartu ringkas TIU: rumus hitung cepat dan persen, pola deret, trik soal cerita numerik, analogi verbal, silogisme dan logika, pola gambar figural, dan strategi soal kecukupan data.",
        "sumber": "baru/tiu-cheat-sheet-*.md (7 file riset, 2026-11-15 dan 2026-11-16)",
        "halaman": 0,  # riset web, tanpa halaman sumber (lihat SCHEMA.md)
        "kata": sum(s["kata"] for s in tiu_sections),
        "subtopik": [row[2] for row in BARU_TIU_CHEAT],
        "sections": tiu_sections,
        "catatan_kualitas": "Materi disusun dari rumus dan kaidah standar pada 2026-11-15, bagian Kecukupan Data ditambahkan 2026-11-16; semua contoh hitung diverifikasi ulang dengan perhitungan mandiri; sumber tiap bagian tercatat di file .md internal.",
    })
    uud_sections = [_baru_section("twk-uud-1945-kelompok-pasal", i + 1, *row)
                    for i, row in enumerate(BARU_TWK_UUD)]
    docs.append({
        "id": "twk-uud-1945-kelompok-pasal",
        "judul": "UUD 1945 per Kelompok Pasal: Hafalan Pasal 1-37",
        "materi": "TWK",
        "deskripsi": "Cara menghafal UUD 1945 per kelompok pasal, bukan satu per satu: peta 11 kelompok pasal 1-37, isi pokok tiap pasal, dan angka-angka kunci yang sering keluar di ujian.",
        "sumber": "baru/twk-uud-1945-s*.md (12 file orisinal Lolosin, 2026-11-18)",
        "halaman": 0,  # orisinal, tanpa halaman sumber (lihat SCHEMA.md)
        "kata": sum(s["kata"] for s in uud_sections),
        "subtopik": ["UUD 1945"],
        "sections": uud_sections,
        "catatan_kualitas": "Materi orisinal Lolosin, ditulis dari naskah UUD 1945 (domain publik) pada 2026-11-18; teknik hafalan per kelompok pasal diadaptasi dari ide umum, wording orisinal; isi tiap pasal diverifikasi terhadap naskah resmi MPR.",
    })
    return docs

def append_baru_tiu(docs):
    """Analogi tiga kata (riset 2026-11-15) sebagai seksi baru di dokumen
    analogi verbal yang sudah ada. ID melanjutkan nomor seksi terakhir
    (s04 saat ini); subtopik baru ditambahkan ke daftar dokumen."""
    for doc in docs:
        if doc["id"] != "tiu-analogi-verbal":
            continue
        konten = parse_baru_markdown(os.path.join(BARU_DIR, "tiu-analogi-tiga-kata.md"))
        max_n = max(int(s["id"].rsplit("-s", 1)[1]) for s in doc["sections"])
        doc["sections"].append({
            "id": f"tiu-analogi-verbal-s{max_n + 1:02d}",
            "subtopik": "Bentuk-bentuk soal analogi (tiga kata)",
            "judul": "Analogi Tiga Kata",
            "konten": konten,
            "kata": len(konten.split()),
        })
        doc["kata"] = sum(s["kata"] for s in doc["sections"])
        if "Bentuk-bentuk soal analogi (tiga kata)" not in doc["subtopik"]:
            doc["subtopik"].append("Bentuk-bentuk soal analogi (tiga kata)")
        print(f"  tiu-analogi-verbal: +1 seksi analogi tiga kata "
              f"(s{max_n + 1:02d}, {len(konten.split())} kata)")
        return
    raise SystemExit("append_baru_tiu: dokumen tiu-analogi-verbal tidak ditemukan")

def append_baru_bela_negara(docs):
    """Tiga seksi baru (riset 2026-11-15, v2.6 poin 8) di dokumen keyword
    bela negara yang sudah ada (s01 pembeda empat konsep dipertahankan).
    ID melanjutkan nomor seksi terakhir (s02-s04 saat ini); subtopik
    "Bela Negara" sudah ada di daftar dokumen."""
    for doc in docs:
        if doc["id"] != "twk-keyword-bela-negara":
            continue
        max_n = max(int(s["id"].rsplit("-s", 1)[1]) for s in doc["sections"])
        for j, (fname, judul, subtopik) in enumerate(BARU_BELA_NEGARA):
            konten = parse_baru_markdown(os.path.join(BARU_DIR, fname))
            n = max_n + 1 + j
            if len(konten.split()) < 50:
                raise SystemExit(f"materi baru {fname}: konten kosong/terlalu "
                                 f"pendek setelah parse ({len(konten.split())} kata)")
            doc["sections"].append({
                "id": f"twk-keyword-bela-negara-s{n:02d}",
                "subtopik": subtopik,
                "judul": judul,
                "konten": konten,
                "kata": len(konten.split()),
            })
            print(f"  twk-keyword-bela-negara: +1 seksi {judul} "
                  f"(s{n:02d}, {len(konten.split())} kata)")
        doc["kata"] = sum(s["kata"] for s in doc["sections"])
        return
    raise SystemExit("append_baru_bela_negara: dokumen twk-keyword-bela-negara "
                     "tidak ditemukan")

def verify_baru_content(docs):
    """Gagalkan build bila konten baru mengandung atribusi/URL/em-dash/soal.
    Hanya memeriksa dokumen/seksi baru (tkp-karakter-perilaku,
    twk-integritas-pilar, tiu-cheat-sheet, tiu-analogi-verbal-s04,
    twk-keyword-bela-negara-s02 ke atas)."""
    baru_ids = {"tkp-karakter-perilaku", "twk-integritas-pilar", "tiu-cheat-sheet"}
    errors = []
    for doc in docs:
        secs = []
        if doc["id"] in baru_ids:
            secs = doc["sections"]
            for field in ("judul", "deskripsi"):
                for rx in _BARU_FORBIDDEN_RES:
                    if rx.search(doc.get(field, "")):
                        errors.append(f"{doc['id']}.{field}: cocok {rx.pattern!r}")
        elif doc["id"] == "tiu-analogi-verbal":
            secs = [s for s in doc["sections"] if s["id"] == "tiu-analogi-verbal-s04"]
        elif doc["id"] == "twk-keyword-bela-negara":
            secs = [s for s in doc["sections"]
                    if int(s["id"].rsplit("-s", 1)[1]) >= 2]
        for s in secs:
            for field in ("judul", "konten"):
                for rx in _BARU_FORBIDDEN_RES:
                    m = rx.search(s[field])
                    if m:
                        errors.append(f"{s['id']}.{field}: cocok {rx.pattern!r} "
                                      f"({m.group(0)[:60]!r})")
            if s["kata"] > 1500:
                errors.append(f"{s['id']}: {s['kata']} kata, melebihi batas 1500")
    if errors:
        raise SystemExit("verifikasi materi baru GAGAL:\n  " + "\n  ".join(errors))
    print("  verifikasi materi baru: OK (tanpa atribusi/URL/em-dash/soal)")

# ---------------------------------------------------------------- filter isi (audit 2026-11-15)
# Kebijakan: Belajar hanya berisi MATERI belajar murni (penjelasan, rangkuman,
# rumus, tabel, contoh pengerjaan). Soal latihan/tryout (stem + opsi A-E +
# kunci/pembahasan), pengantar/cover/daftar isi, dan seksi duplikat TIDAK masuk
# Belajar; soal tempatnya di Latihan/Tryout. Filter berjalan SETELAH semua
# dokumen dibangun (ID seksi sudah ditetapkan), supaya ID seksi yang
# dipertahankan tidak bergeser (progres baca tersimpan memakai ID seksi).
# Laporan lengkap: ~/workspace/cpns/materi/AUDIT-ISI-2026-11-15.md
OPT_RE = re.compile(r"^[A-E][.)]\s+\S")
OPT_LOWER_RE = re.compile(r"^[a-e][.)]\s+\S")
INLINE_OPT_RE = re.compile(r"(?<![A-Za-z0-9])[A-E]\.\s+[A-Z0-9\"(]")
ANS_RE = re.compile(r"^(jawaban|pembahasan)\s*:", re.I)
ANS_INLINE_RE = re.compile(r"jawaban\s*:\s*[A-Ea-e0-9]", re.I)
SCORE_RE = re.compile(r"^skor\s*\d+\s*:?", re.I)
SCORE_INLINE_RE = re.compile(r"skor\s*\d+\s*:", re.I)
SCORE_END_RE = re.compile(r"\.\s*skor\s*\d+\s*:?\s*$", re.I)
CONTOH_RE = re.compile(r"^contoh(\s+soal)?\s*:?\s*$", re.I)
LETTER_RE = re.compile(r"^[A-E][.)]\s*$")
CONTOH_NUM_RE = re.compile(r"^contoh\s*:\s*\d+[.)]?\s*$", re.I)
GUARD_RE = re.compile(r"^(TIPS|TRIK)\s*:|^##\s+\S|^Ringkas\s+\d+\s*:|^(BAB|BAGIAN)\s+[IVXL0-9]+")
COVER_RE = re.compile(
    r"^##\s*Pengantar\s*$"
    r"|^Cheat Sheet (TWK|TKP) 2024\s*(@\s*2024)?\s*$"
    r"|^\d+\s+Cheat Sheet (TWK|TKP) 2024"
    r"|^STEM mulai di sini\s*$")
_EXPLAIN_START = re.compile(
    r"^(jadi|sehingga|maka|polanya|dengan menggunakan|terlihat|menunjukkan|pembahasan|jawaban|skor)\b", re.I)
_BARE_STEM_RE = re.compile(r"^\w[\w\s]{0,30}:\s*\.{2,}\s*$")
SHAPE_RE = re.compile(r"[○□△◇▲▼●■★☆⬜⬛]")

def _clean(p):
    return p.strip().strip("“”\"'").strip()

def _body(p):
    """Teks paragraf tanpa awalan markdown heading '## ' (dipakai klasifikasi)."""
    t = _clean(p)
    return re.sub(r"^##\s+", "", t)

def _is_stem(p):
    t = _clean(p)
    if not t:
        return False
    if t.endswith(("....", "...", "?")) and 3 <= len(t.split()) <= 80:
        return True
    if " : " in t and len(t) < 200:
        return True
    if re.match(r"^Soal\s+\d+\b", t, re.I):
        return True
    return False
    # NOTE: klausul "dimulai angka" dan akhiran ":" SENGAJA tidak ada:
    # "2. Luas dan volume kubus" / "3. Jaring-jaring tabung" adalah judul
    # materi bernomor, dan "a. Urutkan pecahan ... Contoh:" berakhir ":".
    # Stem bernomor yang pendek (< 15 kata) tetap kena aturan fragmen.

def _is_fragment(p, lower_max=10):
    """Paragraf pendek (fragmen OCR). Fragmen awalan huruf kecil hanya dihitung
    bila < lower_max kata, supaya kelanjutan kalimat materi tidak ikut
    terhapus. Jalan maju memakai lower_max=6 (lebih ketat: materi sesudah
    zona soal lebih sering berupa kelanjutan kalimat)."""
    t = _clean(p)
    w = len(t.split())
    if w >= 15:
        return False
    if t and t[0].islower() and w >= lower_max:
        return False
    return True

def _is_heading_like(p):
    """Subjudul materi (mis. 'Kata Kunci Tema Profesionalisme'): pendek,
    tanpa tanda akhir kalimat, mayoritas kata berawalan kapital."""
    t = _clean(p)
    if t.lower().startswith(("contoh soal", "soal ")):
        return False
    words = t.split()
    if not (2 <= len(words) < 12):
        return False
    if t[-1] in ".!?…:,":
        return False
    caps = sum(1 for w in words if w[:1].isupper())
    return caps >= len(words) - 1

def strip_question_zones(konten, lowercase_options=False):
    """Hapus paragraf zona soal (stem + opsi A-E + jawaban/pembahasan + skor).
    Kembalikan (konten_baru, n_paragraf_dihapus, n_zona)."""
    paras = konten.split("\n\n")
    n = len(paras)
    opt_re = OPT_LOWER_RE if lowercase_options else OPT_RE
    kind = []
    for p in paras:
        t = _clean(p)
        b = _body(p)
        if SHAPE_RE.search(t):
            # contoh gambar figural ("A. ○ B. □ C. △ D. ..."): label gambar,
            # bukan opsi pilihan ganda -> jangan pernah jadi seed soal.
            kind.append("OTHER")
        elif COVER_RE.match(t):
            kind.append("COVER")
        elif LETTER_RE.match(b):
            kind.append("LETTER")
        elif opt_re.match(b) or OPT_RE.match(b):
            kind.append("OPT")
        elif ANS_RE.match(b):
            kind.append("ANS")
        elif SCORE_RE.match(b):
            kind.append("SCORE")
        elif CONTOH_RE.match(b) or CONTOH_NUM_RE.match(b):
            kind.append("CONTOH")
        elif len(t.split()) <= 40 and ANS_INLINE_RE.search(t):
            # "A. 6 Jawaban: D Pembahasan:" (jawaban inline bernilai huruf/angka)
            kind.append("ANS_INLINE")
        elif (len(t.split()) <= 150
                and (SCORE_INLINE_RE.search(t) or SCORE_END_RE.search(t))):
            # "Skor 5:" di tengah paragraf fusi dua kolom, atau label di akhir.
            # "Rahasia Mendapatkan Skor 5" (tanpa titik dua, bukan di akhir)
            # sengaja TIDAK kena: itu subjudul tips materi.
            kind.append("SCORE_INLINE")
        elif len(t.split()) <= 100 and len(INLINE_OPT_RE.findall(t)) >= 3:
            # INLINE hanya untuk paragraf kecil: paragraf materi handbook bisa
            # 300-700 kata dan mengandung "A. ..." sebagai notasi, bukan opsi.
            kind.append("INLINE")
        elif GUARD_RE.match(b) or (t.startswith("##") and not opt_re.match(b)):
            kind.append("GUARD")
        else:
            kind.append("OTHER")
    # OPT hanya valid bila bagian dari RANGKAIAN opsi (>= 2 paragraf opsi dalam
    # jendela +-4), dekat jawaban (<= 4 paragraf), atau setelah stem/Contoh:
    # "A. Kubus" / "B. Balok" adalah subjudul materi, bukan opsi.
    opt_idx = [i for i, k in enumerate(kind) if k == "OPT"]
    ans_idx = [i for i, k in enumerate(kind) if k in ("ANS", "ANS_INLINE", "SCORE", "SCORE_INLINE")]
    valid_opt = set()
    for i in opt_idx:
        if any(0 < abs(j - i) <= 4 for j in opt_idx):
            valid_opt.add(i)
        elif any(abs(j - i) <= 4 for j in ans_idx):
            valid_opt.add(i)
        elif any(kind[j] == "CONTOH" or _is_stem(paras[j])
                 for j in range(max(0, i - 2), i)):
            valid_opt.add(i)
    seeds = set()
    # LETTER ("A." telanjang, teks opsi di paragraf berikut) jadi seed bila
    # ada konteks soal dalam +-4 paragraf (opsi/jawaban/Contoh/stem/"Saya").
    for i, k in enumerate(kind):
        if k != "LETTER":
            continue
        lo, hi = max(0, i - 4), min(n, i + 5)
        if any(kind[j] in ("ANS", "ANS_INLINE", "SCORE", "SCORE_INLINE", "CONTOH")
               or (kind[j] == "OPT" and j in valid_opt)
               or _is_stem(paras[j]) or " Saya " in f" {_clean(paras[j])} "
               for j in range(lo, hi) if j != i):
            seeds.add(i)
    # CONTOH hanya jadi seed bila ada OPT/ANS/SCORE dalam 4 paragraf berikut
    for i, k in enumerate(kind):
        if k in ("ANS", "ANS_INLINE", "SCORE", "SCORE_INLINE", "INLINE", "COVER"):
            seeds.add(i)
        elif k == "OPT" and i in valid_opt:
            seeds.add(i)
        elif k == "CONTOH":
            if any(kind[j] in ("ANS", "ANS_INLINE", "SCORE", "SCORE_INLINE", "INLINE") or
                   (kind[j] == "OPT" and j in valid_opt)
                   for j in range(i + 1, min(i + 5, n))):
                seeds.add(i)
    if not seeds:
        return konten, 0, 0
    # gabung seed jadi zona: celah <= 3 paragraf non-seed, tidak melewati GUARD
    zones = []
    seed_list = sorted(seeds)
    start = prev = seed_list[0]
    for s in seed_list[1:]:
        gap = list(range(prev + 1, s))
        if s - prev <= 4 and not any(kind[g] == "GUARD" for g in gap):
            prev = s
        else:
            zones.append((start, prev))
            start = prev = s
    zones.append((start, prev))
    # perluas tiap zona dengan jalan mundur (stem/premis) dan jalan maju
    # (penjelasan pembahasan), dengan penjaga materi.
    drop = set()
    for (a, b) in zones:
        drop.update(range(a, b + 1))
    final = []
    for (a, b) in zones:
        na, nb = a, b
        has_letter = any(kind[i] == "LETTER" for i in range(a, b + 1))
        # --- jalan mundur (maks 10 paragraf) ---
        seen_numbered = False
        for _ in range(10):
            j = na - 1
            if j < 0 or j in drop:
                break
            t = _clean(paras[j])
            if kind[j] == "GUARD" or "TIPS:" in t or "TRIK:" in t:
                break
            if re.match(r"^[a-z][.)]\s", t):
                break  # sub-daftar materi ("a. Syarat Cukup")
            if _is_heading_like(paras[j]):
                break  # subjudul materi ("Kata Kunci Tema ...")
            if kind[j] == "CONTOH" or t.lower().startswith("contoh"):
                na = j
                break  # "Contoh:" = awal blok soal; sebelumnya materi
            if " Saya " in f" {t} " and len(t.split()) < 30:
                na = j  # teks opsi TKP orang pertama ("Saya mendelegasikan...")
                continue
            if kind[j] in ("OPT", "LETTER") or _is_fragment(paras[j]) or _is_stem(paras[j]):
                if re.match(r"^\d{1,3}[.)]\s", t):
                    if seen_numbered:
                        break
                    seen_numbered = True
                na = j
                continue
            break
        # --- jalan maju (maks 8 paragraf) ---
        eaten = 0
        for _ in range(8):
            j = nb + 1
            if j >= n or j in drop:
                break
            t = _clean(paras[j])
            if kind[j] == "GUARD" or "TIPS:" in t or "TRIK:" in t:
                break
            if _is_heading_like(paras[j]):
                break
            if kind[j] in ("OPT", "LETTER", "ANS", "ANS_INLINE", "SCORE", "SCORE_INLINE", "INLINE"):
                nb = j
                eaten += 1
                continue
            if _EXPLAIN_START.match(t):
                nb = j
                eaten += 1
                continue
            if "dengan menggunakan" in t.lower() and len(t.split()) < 40:
                nb = j
                eaten += 1
                continue
            if re.search(r"Pola\s+\d+\s+adalah", t) and len(t.split()) < 40:
                nb = j
                eaten += 1
                continue
            if "menunjukkan" in t.lower() and len(t.split()) < 40:
                nb = j  # "Daerah arsiran menunjukkan ..." (penjelasan jawaban)
                eaten += 1
                continue
            if _is_stem(paras[j]):
                nb = j  # stem soal berikutnya (urutan kolom OCR teracak)
                eaten += 1
                continue
            if "hasilnya" in t.lower() and len(t.split()) < 40:
                nb = j  # "Hasilnya adalah ..." (ujung penjelasan pembahasan)
                eaten += 1
                continue
            if eaten >= 1 and re.match(r"^Jika\b", t) and len(t.split()) < 30:
                nb = j  # premis soal logika berikutnya ("Jika Lutfi lulus...")
                eaten += 1
                continue
            if _is_fragment(paras[j], lower_max=10 if has_letter else 6):
                nb = j
                eaten += 1
                continue
            break
        final.append((na, nb))
    for (a, b) in final:
        drop.update(range(a, b + 1))
    kept = [(i, p) for i, p in enumerate(paras) if i not in drop and p.strip()]
    # --- pembersihan sisa (hanya untuk seksi yang memang ada zonanya) ---
    def _drop_second_pass(items):
        """Satu putaran pembersihan residu; kembalikan daftar baru + jumlah hapus."""
        out = []
        removed_idx = set()
        for pos, (i, p) in enumerate(items):
            t = _clean(p)
            b = _body(p)
            drop_it = False
            if SHAPE_RE.search(t):
                pass  # contoh gambar figural: bukan opsi
            elif OPT_RE.match(b) or (lowercase_options and OPT_LOWER_RE.match(b)):
                # opsi yatim; subjudul materi huruf ("A. Kubus", "D. Tabung")
                # dilindungi kecuali pendek-berawalan kata kerja ("E. Melaporkan...")
                m = re.match(r"^[A-Ea-e][.)]\s+(\S+)", b)
                verb = m and re.match(r"^(me|ber|di|tidak)", m.group(1), re.I)
                if len(t.split()) > 5 or verb:
                    drop_it = True
            elif " Saya " in f" {t} " and (t[:1].islower() or t.endswith("...") or len(t.split()) < 12):
                drop_it = True  # fragmen soal TKP orang pertama
            elif re.match(r"^(TIPS|Tips)\s*:", t) and " Saya " in f" {t} ":
                drop_it = True  # tips palsu = opsi yang terfusi label TIPS
            elif LETTER_RE.match(b):
                drop_it = True  # huruf opsi telanjang ("A.")
            elif _BARE_STEM_RE.match(t):
                drop_it = True  # "Kampiun : ..." (stem telanjang)
            elif re.match(r"^contoh\s+soal\s+tipe\b", t, re.I):
                drop_it = True  # prompt soal gambar tanpa gambar
            elif CONTOH_RE.match(b) and pos == len(items) - 1:
                drop_it = True  # penanda "Contoh:" yatim di akhir seksi
            if drop_it:
                removed_idx.add(i)
            else:
                out.append((i, p))
        # fragmen huruf kecil < 10 kata yang bersebelahan dengan paragraf hapus
        # (indeks paragraf asli dipakai supaya posisi tidak bergeser)
        if removed_idx:
            out2 = []
            for (i, p) in out:
                t = _clean(p)
                if (t[:1].islower() and len(t.split()) < 10
                        and any(abs(i - r) <= 1 for r in removed_idx)):
                    continue
                out2.append((i, p))
            return out2, len(items) - len(out2)
        return out, len(items) - len(out)
    kept, _ = _drop_second_pass(kept)
    kept, _ = _drop_second_pass(kept)
    # judul pendek yang ujungnya menempel fragmen opsi ("Antonim/Lawan Kata
    # A. Pembukaan"): pangkas fragmen opsinya, simpan judulnya.
    _trimmed_head = []
    for (i, p) in kept:
        t = _clean(p)
        if (_is_heading_like(p) and len(t.split()) < 12
                and not t.lower().startswith(("bagian", "bab ", "modul", "topik", "seksi"))):
            m = re.search(r"\s+[A-E][.)]\s+\S+(?:\s+\S+){0,2}\s*$", t)
            if m:
                head = t[:m.start()].strip()
                if len(head.split()) >= 2:
                    _trimmed_head.append((i, head))
                    continue
        _trimmed_head.append((i, p))
    kept = _trimmed_head
    # potong stem "Soal N ..." di ujung paragraf materi (mis. akhir Silogisme)
    trimmed = []
    for (i, p) in kept:
        t = _clean(p)
        m = re.search(r"\s*(Contoh(\s+\w+){0,2})?\s*Soal\s+\d+\b.*$", t, re.S)
        if m and t.endswith(("...", "?")):
            head = t[:m.start()].strip()
            if len(head) >= 100:
                trimmed.append((i, head))
            # else: paragraf murni stem -> buang
        else:
            trimmed.append((i, p))
    kept = trimmed
    # paragraf akhir yang berupa stem ("..."): paragraf pendek dibuang utuh;
    # paragraf panjang dipangkas kalimat-kalimat stem di ujungnya (maks 3
    # kalimat, total <= 60 kata, sisa kepala >= 30 kata) - mis. tabel POIN
    # SETIAP SILA yang ujungnya menempel stem soal pertama.
    for _ in range(2):
        if not kept or not _clean(kept[-1][1]).endswith(("...", "....")):
            break
        idx, para = kept[-1]
        words = len(_clean(para).split())
        if words <= 30:
            kept.pop()
            continue
        sents = re.split(r"(?<=[.!?])\s+|(?<=[.!?][\"”'])\s+", _clean(para))
        if len(sents) <= 1:
            break  # satu kalimat tanpa pemisah: stem menempel tak terpisah,
            # simpan utuh (materinya lebih berharga daripada ekor stemnya)
        tail_w = 0
        cut = len(sents)
        while cut > 0 and (len(sents) - cut) < 3:
            w = len(sents[cut - 1].split())
            if tail_w + w > 60:
                break  # kalimat ini masuk kepala, bukan ekor stem
            tail_w += w
            cut -= 1
        head = " ".join(sents[:cut]).strip()
        if cut > 0 and len(head.split()) >= 30 and tail_w <= 60:
            kept[-1] = (idx, head)
        else:
            kept.pop()
    # kalimat terakhir paragraf akhir berupa awal stem/bacaan soal
    # ("Dalam sebuah proyek ..." / "Pemerintah provinsi telah menyusun ..."):
    # buang kalimat itu saja bila kepala paragraf tetap >= 30 kata.
    _SCEN_SENT = (r"^(Dalam sebuah|Dalam suatu|Di sebuah|Seorang|Pada suatu|"
                  r"Suatu hari|Ketika sedang|"
                  r"Pemerintah \w+ telah (menyusun|melakukan|mengadakan|"
                  r"mengeluarkan|menerapkan))\b")
    if kept:
        idx, para = kept[-1]
        t = _clean(para)
        sents = re.split(r"(?<=[.!?])\s+|(?<=[.!?][\"”'])\s+", t)
        if len(sents) >= 2:
            if re.match(_SCEN_SENT, sents[-1]):
                head = " ".join(sents[:-1]).strip()
                if len(head.split()) >= 30:
                    kept[-1] = (idx, head)
            else:
                # stem menempel di TENGAH kalimat terakhir tanpa titik
                # pemisah ("... masing-masing Di sebuah desa terpencil ..."):
                # pangkas di frasa pembuka skenario bila kepala >= 30 kata
                # dan ekornya kalimat utuh (>= 8 kata, <= 60 kata).
                m = re.search(r"\s+(Dalam sebuah|Dalam suatu|Di sebuah|Suatu hari|Pada suatu)\s+",
                              sents[-1])
                if m:
                    head = " ".join(sents[:-1] + [sents[-1][:m.start()].strip()]).strip()
                    tail = sents[-1][m.start():].strip()
                    if (len(head.split()) >= 30
                            and 8 <= len(tail.split()) <= 60):
                        kept[-1] = (idx, head)
        elif len(sents) < 2:
            # stem menempel tanpa titik pemisah (tabel tanpa tanda baca):
            # pangkas di frasa pembuka skenario bila kepala >= 30 kata.
            m = re.search(r"\b(Dalam sebuah|Dalam suatu|Di sebuah)\b", t)
            if m and m.start() > 0:
                head, tail = t[:m.start()].strip(), t[m.start():].strip()
                if (len(head.split()) >= 30
                        and 8 <= len(tail.split()) <= 60):
                    kept[-1] = (idx, head)
    # --- tail-cleanup: residu soal di ujung seksi (stem skenario, fragmen
    # pembahasan, kalimat menggantung). Dijalankan berulang (maks 3 putaran)
    # karena tiap penghapusan bisa membuka residu baru di ujung.
    _SCEN_STRONG = (r"(?:Dalam sebuah|Dalam suatu|Di sebuah|Suatu hari|"
                    r"Pada suatu|Suatu ketika|Ketika sedang)")
    _SCEN_WEAK = r"(?:Pada akhir|Seorang|Pemerintah \w+ telah)"
    _DANGLING_END = ("yang", "dan", "atau", "dengan", "untuk", "dari", "ke",
                     "pada", "adalah", "sebagai", "jika", "ketika", "lalu",
                     "kemudian", "yaitu")

    def _is_scen_para(t):
        """Paragraf stem skenario (< 60 kata, bukan contoh hitung)."""
        if len(t.split()) >= 60 or "=" in t or "Rp" in t:
            return False
        if re.match(r"^(?:\d{1,3}[.)]\s*)?" + _SCEN_STRONG + r"\b", t):
            return True
        if (re.match(r"^(?:\d{1,3}[.)]\s*)?" + _SCEN_WEAK + r"\b", t)
                and ("saya" in t.lower() or "kami" in t.lower())):
            return True
        return False

    def _is_tail_residue(t):
        """Paragraf ekor yang jelas-jelas residu soal (dipakai aturan
        'Contoh:' berjangkar): stem skenario, fragmen huruf kecil, atau
        paragraf yang kalimat terakhirnya menggantung."""
        if _is_scen_para(t):
            return True
        if t[:1].islower() and len(t.split()) < 30:
            return True
        sents = re.split(r"(?<=[.!?])\s+|(?<=[.!?][\"”'])\s+", t)
        if sents:
            last = sents[-1].strip().rstrip(".!?…").strip()
            lw = last.split()[-1].lower() if last.split() else ""
            if lw in _DANGLING_END:
                return True
        return False

    tail_dropped = False
    for _outer in range(3):
        changed = False
        # (1) paragraf akhir berupa stem skenario ("Dalam sebuah proyek ..."):
        # pembuka kuat langsung dibuang; pembuka lemah ("Pada akhir",
        # "Seorang") hanya bila bernada orang pertama ("saya"/"kami").
        # Awalan nomor soal ("1. Dalam suatu ...") diabaikan.
        for _ in range(3):
            if not kept:
                break
            if _is_scen_para(_clean(kept[-1][1])):
                kept.pop()
                changed = True
                tail_dropped = True
                continue
            break
        # (2) "Contoh:" berjangkar di 3 paragraf terakhir: bila semua
        # paragraf sesudahnya adalah residu soal, buang dari "Contoh:".
        for pos in range(max(0, len(kept) - 3), len(kept)):
            if CONTOH_RE.match(_body(kept[pos][1])):
                after = [_clean(p) for _, p in kept[pos + 1:]]
                if after and all(_is_tail_residue(t) for t in after):
                    del kept[pos:]
                    changed = True
                    tail_dropped = True
                    break
        # (3) stem skenario di posisi KEDUA dari akhir (diikuti paragraf
        # nasihat singkat, mis. "Ditolak adalah hal yang wajar, ...").
        if len(kept) >= 2:
            last_t = _clean(kept[-1][1])
            prev_t = _clean(kept[-2][1])
            if len(last_t.split()) < 35 and _is_scen_para(prev_t):
                del kept[-2]
                changed = True
                tail_dropped = True
        # (4) kalimat terakhir paragraf akhir menggantung ("... Semestinya
        # yang"): buang kalimat yang tak lengkap itu (berakhir kata
        # sambung/preposisi). Paragraf satu kalimat hanya dibuang utuh bila
        # < 20 kata (fragmen); paragraf >= 20 kata disimpan meski ujungnya
        # terpotong (contoh jawaban cheat-sheet 36 kata).
        for _ in range(2):
            if not kept:
                break
            idx, para = kept[-1]
            t = _clean(para)
            sents = re.split(r"(?<=[.!?])\s+|(?<=[.!?][\"”'])\s+", t)
            if not sents:
                break
            last = sents[-1].strip().rstrip(".!?…").strip()
            last_word = last.split()[-1].lower() if last.split() else ""
            if last_word not in _DANGLING_END:
                break
            if len(sents) >= 2:
                head = " ".join(sents[:-1]).strip()
                if len(head.split()) >= 10:
                    kept[-1] = (idx, head)
                    changed = True
                    tail_dropped = True
                    continue
            if len(t.split()) < 20:
                kept.pop()
                changed = True
                tail_dropped = True
                continue
            break
        # (5) fragmen huruf kecil di ujung - HANYA bila tail-cleanup sudah
        # menghapus sesuatu (tanpa jangkar ini, kelanjutan kalimat materi
        # yang terbelah paragraf ikut terhapus, mis. "tanggungjawab utama
        # atau mengorbankan waktu kerja ...").
        if tail_dropped:
            for _ in range(2):
                if not kept:
                    break
                t = _clean(kept[-1][1])
                if t[:1].islower() and len(t.split()) < 30:
                    kept.pop()
                    changed = True
                    continue
                break
        # (6) penanda "Contoh:" yang jadi yatim di akhir
        if kept and CONTOH_RE.match(_body(kept[-1][1])):
            kept.pop()
            changed = True
            tail_dropped = True
        if not changed:
            break
    konten_baru = "\n\n".join(p for _, p in kept).strip()
    # rapikan penanda menggantung di ujung konten ("Pilihan:", "Jawaban:")
    konten_baru = re.sub(r"\s*(Pilihan|Jawaban|Pembahasan)\s*:\s*$", "", konten_baru)
    return konten_baru, len(paras) - len(kept), len(final)

# Judul seksi yang SELALU menandakan bukan materi belajar (dipakai di semua
# dokumen). "Soal ..." sengaja TIDAK ada di sini: "Soal Cerita" handbook
# numerik adalah materi teknik (tanpa opsi), bukan bank soal.
TITLE_DROP_RES = [
    re.compile(r"^pembahasan\b", re.I),        # "Pembahasan Pancasila ..."
    re.compile(r"^pengantar\b", re.I),         # pengantar handbook + hitung cepat
    re.compile(r"mini drill", re.I),           # "Bagian VIII: Mini Drill"
    re.compile(r"mini latihan", re.I),         # "Mini Latihan Konseptual"
    re.compile(r"^lampiran:", re.I),           # lampiran soal + kunci jawaban
    re.compile(r"^latihan\b", re.I),           # "Latihan: Volume Bangun Ruang"
    re.compile(r"^kata pengantar\b", re.I),
    re.compile(r"^daftar isi\b", re.I),
]

# Seksi yang dihapus utuh karena judulnya tidak menandai isi soal
# (judul hasil OCR kacau / seksi duplikat). Alasan per seksi ada di laporan audit.
SECTION_DROP = {
    ("tiu-modul", "tiu-modul-s11"),            # "D. KamarTidur": 100% soal analogi
    ("tkp-modul", "tkp-modul-s16"),            # "A. Diam saja karena jika saya": 1 soal utuh
    ("tkp-cheat-sheet", "tkp-cheat-sheet-s07"),  # duplikat twk-cheat-sheet-s06
}

# Bang Arya adalah BUKU SOAL: hanya 6 seksi tabel/rangkuman yang diselamatkan
# (judul baru = isi tabelnya, tanpa atribusi). Semua seksi lain dibuang,
# termasuk bacaan cerita Bahasa Indonesia (stimulus soal, bukan materi).
BANG_ARYA_SALVAGE = {
    "twk-bang-arya-s02": "Poin Setiap Sila Pancasila",
    "twk-bang-arya-s08": "Timeline UUD 1945",
    "twk-bang-arya-s17": "Sembilan Nilai Integritas",
    "twk-bang-arya-s25": "Penggunaan Huruf Kapital",
    "twk-bang-arya-s32": "Prinsip Nasionalisme dan Bhinneka Tunggal Ika",
    "twk-bang-arya-s37": "NKRI dalam UUD 1945",
}

# v2.3.3: TULIS ULANG KURASI 6 seksi Bang Arya. Hasil ekstraksi mind-map/tabel
# PDF asli tidak bisa dipakai apa adanya: huruf kapital semua, kata kunci
# menempel tanpa struktur, ada typo ("Indoneisia", "tumbuhm"). Konten di bawah
# ini adalah sumber kanonis untuk ke-6 seksi (menggantikan hasil ekstraksi di
# filter_doc_sections); fakta diambil dari konten lama + file riset
# ~/workspace/cpns/materi/baru/twk-integritas.md dan twk-pilar-negara.md.
# Format MarkdownLite: heading ##, bullet "- ", daftar bernomor, **tebal**,
# *miring*, `kode`. Tanpa em-dash, tanpa atribusi, tanpa huruf kapital semua
# (kecuali akronim). ID seksi TIDAK diubah (progres baca user aman).
BANG_ARYA_REWRITE = {
    "twk-bang-arya-s02": '''Setiap sila Pancasila punya nilai intinya masing-masing. Ini ringkasannya:

| Sila | Nilai inti | Poinnya |
|---|---|---|
| 1. Ketuhanan Yang Maha Esa | Ketuhanan | Saling toleransi dan menghormati keyakinan, ketuhanan, dan peribadahan orang lain. |
| 2. Kemanusiaan yang adil dan beradab | Kemanusiaan | Manusia diperlakukan sesuai harkat dan martabatnya, tanpa diskriminasi dan tanpa menghina fisik. |
| 3. Persatuan Indonesia | Persatuan | Keragaman bangsa dan negara justru menyatukan, bukan memecah belah. |
| 4. Kerakyatan yang dipimpin oleh hikmat kebijaksanaan dalam permusyawaratan/perwakilan | Musyawarah mufakat | Tidak boleh memaksakan kehendak, dan keputusan bersama harus dihormati. |
| 5. Keadilan sosial bagi seluruh rakyat Indonesia | Keadilan | Hak pribadi ada batasnya: tidak boleh merugikan orang lain.''',

    "twk-bang-arya-s08": '''Perjalanan konstitusi Indonesia dari proklamasi sampai amandemen, diringkas per periode:

| Periode | Konstitusi | Sistem dan catatan penting |
|---|---|---|
| 18 Agustus 1945 - 27 Desember 1949 | UUD 1945 | Disahkan **PPKI** sehari setelah proklamasi. MPR dan DPR belum terbentuk, jadi kekuasaan legislatif diserahkan kepada **KNIP** (Komite Nasional Indonesia Pusat). 14 November 1945: sistem pemerintahan berubah menjadi **parlementer**, kabinet bertanggung jawab kepada KNIP. |
| 27 Desember 1949 - 17 Agustus 1950 | Konstitusi RIS 1949 | Sistem **parlementer**. Bentuk negara **federasi**: Republik Indonesia Serikat (RIS), yang terdiri dari negara-negara bagian. |
| 17 Agustus 1950 - 5 Juli 1959 | UUDS 1950 | Berlaku **Demokrasi Parlementer**, yang sering disebut **Demokrasi Liberal**. Kabinet **silih berganti** karena sering jatuh lewat mosi tidak percaya. |
| 5 Juli 1959 - 11 Maret 1966 | Kembali ke UUD 1945 | 5 Juli 1959: Presiden Soekarno mengeluarkan **Dekret Presiden** yang memberlakukan kembali UUD 1945 dan membubarkan Konstituante. UUDS 1950 tidak berlaku lagi. |
| 11 Maret 1966 - 21 Mei 1998 | UUD 1945 masa Orde Baru | Dimulai dengan Surat Perintah 11 Maret (**Supersemar**) 1966. Pemerintah menyatakan akan melaksanakan UUD 1945 dan Pancasila secara **murni dan konsekuen**. Dalam praktiknya, kekuasaan presiden sangat besar dan MPR memegang **kekuasaan tertinggi**. |
| 21 Mei 1998 - 19 Oktober 1999 | Masa transisi | Presiden Soeharto digantikan oleh **B.J. Habibie**. Periode ini berakhir setelah **Timor Timur** lepas dari NKRI. |
| 1999 - 2002 | Periode perubahan UUD 1945 | Tuntutan perubahan muncul karena pasal-pasal UUD 1945 dinilai terlalu **luwes**, sehingga memberi ruang kekuasaan yang sangat besar kepada presiden. UUD 1945 **diamandemen empat kali**: 1999, 2000, 2001, dan 2002. Yang diubah hanya batang tubuhnya; Pembukaan UUD 1945 tidak boleh diubah.''',

    "twk-bang-arya-s17": '''KPK merumuskan sembilan nilai integritas sebagai tameng dari perilaku koruptif. Gampang diingat lewat akronim **JUMAT BERSEPEDA KK**: Jujur, Mandiri, Tanggung jawab, Berani, Sederhana, Peduli, Disiplin, Adil, Kerja Keras.

| Nilai | Kelompok | Artinya |
|---|---|---|
| Jujur | Nilai inti | Lurus hati, tidak berbohong dan tidak curang. Laporan ditulis sesuai kenyataan, kesalahan diakui, bukan ditutupi. |
| Disiplin | Nilai inti | Melakukan yang seharusnya pada waktu yang tepat, dan taat pada peraturan yang berlaku. |
| Tanggung jawab | Nilai inti | Siap menanggung akibat perbuatannya, menuntaskan kewajiban, dan memperbaiki kesalahan. |
| Berani | Nilai sikap | Berani berkata benar dan menolak yang salah, tidak gentar menghadapi ancaman atau bahaya. Misalnya berani menolak suap. |
| Adil | Nilai sikap | Memperlakukan semua pihak secara setara, bertindak sesuai kewenangan, dan tidak sewenang-wenang. |
| Peduli | Nilai sikap | Memperhatikan orang lain dan lingkungan sekitar, termasuk berani menegur atau melaporkan penyimpangan. |
| Mandiri | Nilai etos kerja | Berusaha dengan kemampuan sendiri, tidak bergantung pada bantuan yang tidak semestinya dan tidak memakai "orang dalam". |
| Kerja keras | Nilai etos kerja | Gigih dan fokus sampai tujuan tercapai, tidak asal-asalan. |
| Sederhana | Nilai etos kerja | Hidup sesuai kebutuhan, bersahaja, dan tidak berlebih-lebihan.''',

    "twk-bang-arya-s25": '''Kapan huruf kapital dipakai dan kapan tidak, diringkas dalam satu tabel:

| Kategori | Aturan | Contoh |
|---|---|---|
| Kapital di awal | Awal kalimat | `Kita harus belajar.` |
| Kapital di awal | Awal petikan langsung | Kakak bertanya, “Jam berapa acaranya?” |
| Kapital di awal | Kata sapaan | `Besok Adik akan pulang.` dan `Siapa nama Anda?` |
| Kapital kalau diikuti nama | Nama orang | Adam Malik. |
| Kapital kalau diikuti nama | Gelar yang diikuti nama orang | Tuanku Imam Bonjol, Imam Syafi’i. |
| Kapital kalau diikuti nama | Nama jabatan yang diikuti nama orang, instansi, atau tempat | Presiden Republik Indonesia, Sultan Hamengkubuwono X. |
| Kapital kalau diikuti nama | Nama negara atau instansi | Republik Indonesia, Kementerian Luar Negeri. |
| Kapital kalau diikuti nama | Nama peristiwa sejarah | Perang Dingin, Perang Dunia II. |
| Kapital kalau diikuti nama | Nama diri geografi | Asia Tenggara, Amerika Utara, Danau Singkarak, Sungai Citarum. |
| Kapital kalau diikuti nama | Nama bangsa, suku, dan bahasa (kata awalnya huruf kecil, namanya kapital) | bangsa Indonesia, suku Indian, bahasa Inggris. |
| Kapital kalau diikuti nama | Nama tahun, bulan, hari, dan hari raya (kata awalnya huruf kecil, namanya kapital) | tahun Hijriah, hari Selasa, bulan Juli, hari raya Idul Fitri. |
| Kapital kalau diikuti nama | Gambaran khas daerah atau suku | ukiran Jepara, tari Melayu. |
| Tidak kapital | Jabatan tanpa nama orang | `Beliau baru saja diangkat menjadi gubernur.` |
| Tidak kapital | Peristiwa tanpa nama | `Nuklir dapat menyebabkan terjadinya perang dunia.` |
| Tidak kapital | Nama geografi tanpa nama diri | `berenang di laut`, `menyeberangi sungai`.''',

    "twk-bang-arya-s32": '''## Lima prinsip nasionalisme

| Prinsip | Artinya |
|---|---|
| Kesatuan | Satu dalam wilayah, bangsa, bahasa, ideologi, dan sistem politik. |
| Kebebasan | Bebas beragama, berbicara, berpendapat, berkelompok, dan berorganisasi. |
| Kesamaan | Sama dalam kedudukan hukum, hak, dan kewajiban. |
| Kepribadian | Punya harga diri, rasa bangga, dan rasa sayang terhadap kepribadian dan identitas bangsa. |
| Prestasi | Bercita-cita mewujudkan kesejahteraan, kebesaran, dan kemanusiaan bangsanya. |

## Istilah yang sering tertukar

| Istilah | Artinya |
|---|---|
| Nasionalisme | Paham yang menempatkan kesetiaan tertinggi kepada bangsa dan negara, diwujudkan lewat sikap dan tindakan untuk identitas negara. |
| Patriotisme | Sikap rela mengorbankan segalanya demi negara dan bangsa. |
| Cinta tanah air | Cara berpikir dan berbuat yang menunjukkan cinta terhadap tanah air. |
| Bela negara | Sikap dan tindakan setiap warga sesuai kewajibannya untuk mendukung tujuan negara.

## Bhinneka Tunggal Ika

Bhinneka Tunggal Ika berarti berbeda-beda tetapi tetap satu. Keberagaman tidak membuat bangsa pecah: carilah persamaan di tengah perbedaan supaya tercipta kedamaian.

Prinsipnya adalah *common denominator*: menerima dan terbuka terhadap perbedaan.''',

    "twk-bang-arya-s37": '''Pasal-pasal kunci tentang NKRI dalam UUD 1945, diringkas dalam satu tabel:

| Pasal | Isi dan maknanya |
|---|---|
| Pasal 1 ayat 1: bentuk negara | "Negara Indonesia ialah Negara Kesatuan, yang berbentuk Republik." Artinya bentuk negara Indonesia adalah **kesatuan**, sedangkan bentuk pemerintahannya adalah **republik**. Kekuasaan tertinggi ada di pemerintah pusat, dan kepala negara adalah presiden yang dipilih. |
| Pasal 18 ayat 1: wilayah NKRI | NKRI dibagi atas **daerah provinsi**, dan provinsi dibagi atas **kabupaten dan kota**. Masing-masing punya pemerintahan daerah sendiri. |
| Pasal 37 ayat 5: NKRI tidak bisa diubah | Khusus mengenai bentuk Negara Kesatuan Republik Indonesia, **tidak dapat dilakukan perubahan**. Inilah yang membuat NKRI disebut final dan harga mati. |
| Alinea keempat Pembukaan UUD 1945 | Alinea keempat memuat dasar negara **Pancasila** dan menyatakan bahwa negara Indonesia disusun sebagai Negara Republik Indonesia yang **berkedaulatan rakyat**. Di sinilah ditegaskan bahwa bangsa Indonesia hidup, tumbuh, dan berkembang dalam satu wilayah kesatuan yang saling terintegrasi. |
| Pasal 31 ayat 1: hak atas pendidikan | "Setiap warga negara berhak mendapat pendidikan."''',
}

# ------------------------------------------------------- Tulis ulang keterbacaan (v2.5)
# Audit 2026-11-15: 43 seksi Belajar berupa tembok teks (baris >600 karakter,
# terpanjang ~5.000) + stub tipis yang kurang isi. Isi kurasi di bawah ini
# menggantikan hasil ekstraksi PDF yang tidak terstruktur; ID seksi
# dipertahankan supaya progres baca lama tetap cocok. Konten kurasi dicek
# verify_readability_rewrite() (tanpa em-dash/URL/atribusi, tanpa baris tembok).
# Map diisi dari file rewrite kurator (/tmp/rewrite-*.py); jangan edit manual.
READABILITY_REWRITE = {
    "tiu-analogi-verbal-s01": '''## Apa itu analogi verbal?

**Analogi verbal** disebut juga padanan kata atau kesetaraan hubungan antar kata.

Dalam soal analogi, kamu diminta mencari kata atau kelompok kata yang membentuk hubungan yang sama dengan pasangan kata yang sudah diketahui, lalu menerapkan hubungan itu pada situasi lain.

## Kemampuan yang diuji

Soal ini tidak hanya menguji penguasaan bahasa. Kamu juga perlu:

- **Logika dan daya nalar** untuk menemukan pola hubungan antar kata.
- **Pengetahuan umum** yang luas, karena kata-katanya bisa berasal dari bidang apa saja.
- **Berpikir abstrak** untuk menangkap makna tersirat di balik kata atau kelompok kata.

Singkatnya, analogi mengukur seberapa jauh kamu memahami arti kata dan hubungan di antara kata-kata itu, bukan sekadar hafalan kosakata.''',
    "tiu-analogi-verbal-s02": '''## Bentuk yang sering muncul

Ada dua bentuk soal analogi verbal yang paling sering muncul:

### 1. Analogi dua kata

Kamu diminta mencari hubungan pada sepasang kata yang diketahui, lalu mencari pasangan kata lain yang punya hubungan yang sama.

Contoh polanya: TELINGA : DENGAR = MATA : LIHAT. Telinga berfungsi untuk mendengar, mata berfungsi untuk melihat.

### 2. Analogi kalimat

Kamu diminta mencari kalimat yang hubungannya sepadan dengan kalimat soal. Kuncinya: fokus pada hubungan subjek dan objek di dalam kalimat.

## Cara mengerjakan analogi kalimat

1. **Tentukan objeknya.** Objek biasanya berada setelah predikat (kata kerja).
2. **Cari hubungan antar objeknya.** Hubungan apa yang mengikat objek-objek itu?
3. **Cari objek yang setara di pilihan jawaban.** Pilih yang hubungannya paling sepadan.

## Contoh pengerjaan

Misalnya kalimat soal memakai kata kerja "memainkan" dengan objek "gitar" dan "ukulele". Gitar dan ukulele adalah jenis alat musik yang dimainkan dengan cara dipetik.

Jadi, jawaban yang tepat adalah pasangan alat musik petik juga, misalnya **kecapi dan sape**.

Ingat: yang dicari bukan sekadar kata yang mirip, melainkan pasangan yang hubungannya sama persis dengan soal.''',
    "tiu-analogi-verbal-s03": '''## 1. Fungsi benda

Pola: benda : fungsi = benda : fungsi.

Contoh: TELINGA : DENGAR = MATA : LIHAT. Telinga berfungsi untuk mendengar, mata berfungsi untuk melihat.

## 2. Persamaan kata (sinonim)

Pola: kata : padanannya = kata : padanannya.

Contoh: MUDAH : GAMPANG = ... : ... Mudah sama artinya dengan gampang.

## 3. Lawan kata (antonim)

Pola: sifat : lawan katanya = sifat : lawan katanya.

Contoh: GELAP : TERANG = BASAH : KERING. Gelap lawannya terang, basah lawannya kering.

## 4. Profesi dan tempat kerja

Pola: profesi : yang dikerjakan atau tempat kerjanya = profesi : yang dikerjakan atau tempat kerjanya.

Contoh profesi: WARTAWAN : BERITA. Salah satu tugas wartawan adalah mencari berita.

Contoh tempat kerja: TELLER : BANK. Teller bekerja di bank.

## 5. Sebab dan akibat

Pola: sebab : akibat = sebab : akibat, berlaku juga sebaliknya.

Contoh: HUJAN : BANJIR = KEMARAU : KEKERINGAN. Hujan yang berlebih menyebabkan banjir, kemarau yang berlebih mengakibatkan kekeringan.

## 6. Umum dan khusus

Pola: umum : khusus = umum : khusus, berlaku juga sebaliknya.

Contoh: ZEBRA : BINATANG = MAWAR : BUNGA. Zebra adalah salah satu jenis binatang, mawar adalah salah satu jenis bunga.

## 7. Benda dan bagiannya

Pola: kata benda : bagiannya = kata benda : bagiannya.

Contoh: RUMAH : ATAP = KEPALA : RAMBUT. Salah satu bagian rumah adalah atap, salah satu bagian kepala adalah rambut.

## 8. Benda dan ilmunya

Pola: kata benda : ilmu yang mempelajarinya = kata benda : ilmu yang mempelajarinya.

Contoh: PSIKOLOGI : PERILAKU. Psikologi adalah ilmu yang mempelajari perilaku.''',
    "tiu-handbook-figural-s02": '''## Gambar Adalah Kumpulan Data

Kemampuan figural bukan sekadar soal melihat gambar. Kamu sebenarnya diminta menjalankan proses: mengamati gambar, mengenali variabelnya, menemukan pola, menguji aturan, memprediksi gambar berikutnya, lalu memilih jawaban.

Karena itu, pandanglah gambar sebagai kumpulan informasi, bukan satu objek visual utuh. Satu gambar bisa menyimpan beberapa variabel sekaligus:

- jumlah objek
- bentuk
- orientasi
- posisi
- warna atau arsiran
- hubungan antarobjek
- simetri
- garis terbuka atau tertutup

Soal mudah biasanya hanya memakai satu variabel. Soal yang lebih sulit bisa memakai dua variabel atau lebih sekaligus.

## Jumlah

Periksa jumlah dulu, karena ini variabel paling mudah diverifikasi secara objektif.

**Contoh soal:** `●` lalu `●●` lalu `●●●`, berikutnya apa? Jumlah bertambah satu setiap tahap, polanya +1 objek, jadi tahap berikutnya `●●●●`.

Tapi jangan hanya menghitung objek utama. Pada soal yang lebih kompleks, pola bisa tersembunyi dalam jumlah garis internal, sudut, perpotongan, titik, daerah tertutup, atau titik sentuh.

## Bentuk

Perhatikan apakah bentuknya tetap, berubah, bertambah, berkurang, bergantian, atau berubah secara siklis.

**Contoh soal:** `○`, `△`, `□`, `○`, `△`, ... Bingkai berganti lingkaran, segitiga, persegi, lalu berulang. Ini bukan rotasi, bentuknya berubah secara berulang dengan periode 3 tahap. Berikutnya adalah `□`.

## Rotasi

Rotasi adalah perubahan orientasi karena objek diputar terhadap titik tertentu. Besar sudutnya bisa 45°, 90°, 180°, 270°, atau lainnya, tapi jangan pernah mengasumsikan. Besar dan arah rotasi harus disimpulkan dari hubungan antargambar.

Dua hal yang wajib ditemukan: arah rotasi (searah atau berlawanan arah jarum jam) dan besar rotasi.

**Contoh soal:** `↑`, `→`, `↓`, `←`. Setiap tahap berputar 90° searah jarum jam.

**Prinsip penting:** jangan hanya mengatakan "panah berubah arah". Nyatakan secara spesifik: "panah berputar 90° searah jarum jam pada setiap tahap". Aturan yang spesifik jauh lebih mudah diuji ke seluruh gambar.

## Pencerminan

Pencerminan berbeda dengan rotasi. Objek bisa dicerminkan terhadap sumbu vertikal, sumbu horizontal, atau garis diagonal tertentu.

Misalnya suatu gambar punya tonjolan di sisi kanan. Kalau dicerminkan terhadap sumbu vertikal, tonjolan pindah ke sisi kiri, dan titik penanda ikut pindah ke sisi seberang.

**Teknik penting:** jangan hanya mengikuti bentuk luar. Ikuti penanda asimetris seperti titik, garis pendek, arsiran, tonjolan, atau simbol asimetris. Gunakan bagian yang asimetris sebagai titik acuan.

Cara membedakan rotasi dan pencerminan: baca urutan pola searah jarum jam. Misalnya urutan aslinya hitam, garis, putih, titik. Setelah rotasi, urutannya tetap. Setelah pencerminan, urutannya terbalik: hitam, titik, putih, garis.

- Kalau seluruh objek hanya berubah orientasi sementara hubungan antarbagian tetap, kemungkinan besar itu rotasi.
- Kalau hubungan kiri-kanan atau orientasi internal menjadi terbalik, periksa kemungkinan pencerminan.

## Posisi dan Perpindahan

Objek bisa berpindah tempat tanpa berubah orientasi.

**Contoh soal:** bintang berpindah kiri atas, kanan atas, kanan bawah, kiri bawah. Artinya bintang bergerak satu sudut searah jarum jam, sementara lingkaran di pusat tidak berubah.

Perpindahan bisa berupa satu langkah, dua langkah, searah jarum jam, berlawanan arah jarum jam, melompat, atau berpindah diagonal.

Jangan menyamakan posisi dengan rotasi. Misalnya sebuah segitiga tetap menghadap ke atas tetapi berpindah dari sudut kiri atas ke kanan atas. Yang berubah hanya letaknya, jadi itu perubahan posisi, bukan rotasi.

## Arsiran dan Isian

Arsiran bisa menjadi variabel yang berdiri sendiri. Periksa apakah ada bidang yang kosong menjadi hitam, hitam menjadi kosong, arsiran bergantian, arsiran berpindah, jumlah bidang hitam berubah, atau dua warna bertukar.

**Contoh soal:** `○`, `●`, `○`, `●`, ? Polanya kosong, hitam, kosong, hitam, jadi berikutnya `○`.

## Simetri

Suatu gambar bisa punya simetri vertikal, simetri horizontal, simetri rotasi, atau tidak punya simetri tertentu.

Pada soal ketidaksamaan, misalnya empat gambar punya satu jenis simetri sedangkan satu tidak. Gambar yang tidak memenuhi karakteristik mayoritas itu bisa menjadi jawaban.

Tapi simetri tidak boleh dipakai sendirian kalau tidak menjelaskan seluruh kelompok secara konsisten.

## Terbuka dan Tertutup

Periksa apakah garis membentuk bangun tertutup atau punya celah.

**Contoh soal:** A lingkaran, B persegi, C segitiga, D bentuk menyerupai lingkaran tetapi punya celah. A, B, dan C adalah bangun tertutup, hanya D yang terbuka. Kalau itu satu-satunya perbedaan yang konsisten, jawabannya D.

## Ganjil dan Genap

Ketika gambar tampak sangat mirip, hitung komponennya.

**Contoh soal:** jumlah titik pada empat opsi adalah A 4, B 6, C 5, D 8. A, B, dan D genap, hanya C yang ganjil. Kalau itu pola kelompoknya, C yang berbeda.

Ganjil-genap adalah salah satu teknik analisis, bukan kategori resmi soal figural.

## Metode J-R-A-P

Supaya pemeriksaan gambar lebih cepat, gunakan mnemonik ini:

- **J, Jumlah.** Berapa objek, titik, garis, atau bagiannya?
- **R, Rotasi.** Apakah orientasinya berubah?
- **A, Arsiran.** Apakah warna atau isinya berubah?
- **P, Posisi.** Apakah objek berpindah tempat?

Kalau belum menemukan pola, perluas menjadi J-R-A-P + B-S-T:

- **B, Bentuk**
- **S, Simetri**
- **T, Terbuka/Tertutup**

J-R-A-P adalah metode bantu belajar, bukan istilah resmi dalam kisi-kisi SKD.''',
    "tiu-handbook-figural-s03": '''## Konsep Analogi

Salah satu bentuk dasar analogi adalah A : B = C : ?. Tugasmu adalah menemukan transformasi yang mengubah A menjadi B, lalu menerapkan transformasi yang sama pada C. Kalau T(A) = B, maka T(C) = D.

Yang penting: tugasmu bukan mencari gambar yang sekadar mirip dengan B. Tugasmu adalah menemukan hubungan A terhadap B, kemudian menerapkan hubungan itu pada C.

## Algoritma Analogi

Ikuti prosedur ini langkah demi langkah.

1. **Fokus pada A ke B.** Abaikan C dulu. Tanyakan: apa yang berubah dari A menjadi B?
2. **Nyatakan transformasinya.** Misalnya +1 titik, rotasi 90° searah jarum jam, cermin vertikal, hitam menjadi putih, pindah satu sudut, atau jumlah garis -1.
3. **Periksa apa yang tetap.** Selain perubahan, kenali karakteristik yang tidak berubah. Misalnya bentuk luar tetap, jumlah objek tetap, titik tetap berada di dalam, atau hubungan antarobjek tetap.
4. **Terapkan transformasi pada C.** Jangan membuat aturan baru untuk C. Kalau A ke B adalah +1 titik, maka C juga harus +1 titik.
5. **Prediksi.** Bayangkan dulu bagaimana bentuk D.
6. **Cocokkan dengan opsi.** Gunakan pilihan jawaban untuk mengonfirmasi prediksi dan melakukan eliminasi.

## Analogi Satu Transformasi

**Contoh 1, jumlah.** A: `●`, B: `●●`, C: `▲▲▲`. A ke B jumlah objek +1, jadi C mengalami transformasi yang sama: `▲▲▲▲`.

**Contoh 2, rotasi.** A: `↑`, B: `→`, C: `←`. A ke B adalah rotasi 90° searah jarum jam. Maka `←` menjadi `↑`. Jawabannya `↑`.

**Contoh 3, perubahan isian.** A: `○`, B: `●`, C: `□`. Aturannya kosong menjadi terisi. Maka `□` menjadi `■`. Jawabannya `■`.

## Analogi Transformasi Gabungan

Soal yang lebih kompleks bisa memakai lebih dari satu perubahan. Misalnya A adalah panah putih menghadap atas, B adalah panah hitam menghadap kanan. Transformasinya ada dua: rotasi 90° searah jarum jam, dan putih menjadi hitam.

Kalau C adalah panah putih menghadap kiri, maka arah kiri menjadi arah atas dan putih menjadi hitam. Jadi D adalah panah hitam menghadap atas.

## Pecah Transformasi Menjadi Variabel

Untuk soal kompleks, pecah transformasi menjadi variabel terpisah, misalnya T1 rotasi, T2 arsiran, T3 jumlah.

Analisis satu variabel pada satu waktu, kemudian gabungkan hasilnya. Cara ini lebih aman dibanding mencoba memahami seluruh transformasi sekaligus secara visual.

## Urutan Transformasi

Kalau ada beberapa operasi, urutannya bisa memengaruhi hasil. Rotasi lalu pindah titik belum tentu menghasilkan posisi yang sama dengan pindah titik lalu rotasi.

Perhatikan apakah elemen internal berputar bersama objek atau berpindah secara independen. Ini penting pada soal analogi tingkat lanjut.

## Jebakan Analogi

Pengecoh sering dibuat dengan melanggar satu aturan saja. Misalnya rotasi benar tetapi arsiran salah, arsiran benar tetapi arah salah, semua benar kecuali jumlah, atau hanya menyerupai gambar B. Hanya satu opsi yang memenuhi semua transformasi.

Jadi jangan bertanya "mana yang kelihatannya paling benar?" Tanyakan: "variabel apa yang salah pada pilihan ini?"''',
    "tiu-handbook-figural-s04": '''## Konsep Ketidaksamaan

Ketidaksamaan memintamu mencari satu gambar yang tidak mengikuti karakteristik kelompok. Prinsip dasarnya: mayoritas mengikuti aturan yang sama, satu gambar melanggar.

Jangan mencari "gambar yang terlihat paling aneh". Carilah karakteristik yang konsisten pada mayoritas pilihan.

## Algoritma Ketidaksamaan

1. **Cari persamaan mayoritas.** Periksa jumlah, orientasi, bentuk, simetri, arsiran, posisi, hubungan bagian, dan terbuka atau tertutup.
2. **Bentuk hipotesis.** Misalnya: "Semua gambar mempunyai empat garis."
3. **Uji seluruh opsi.** Misalnya A 4 garis, B 4 garis, C 5 garis, D 4 garis, E 4 garis. A, B, D, dan E dibatasi 4 garis, C dibatasi 5 garis. C melanggar karakteristik mayoritas, jadi jawabannya C.
4. **Uji konsistensi.** Aturan yang baik harus menjelaskan seluruh anggota kelompok, bukan hanya dua atau tiga pilihan.

## Ketidaksamaan Berdasarkan Jumlah

**Contoh soal:** jumlah titik pada empat opsi adalah A 2, B 2, C 3, D 2. Kalau jumlah titik merupakan satu-satunya pembeda, jawabannya C.

Pada soal yang lebih sulit, hitung garis internal, daerah, sudut, perpotongan, atau titik sentuh.

## Ketidaksamaan Berdasarkan Relasi

Tidak semua pola berhubungan dengan jumlah. Misalnya empat gambar mempunyai titik hitam di dalam bangun, satu gambar mempunyai titik hitam di luar bangun. Gambar yang titiknya di luar itulah yang berbeda.

Hubungan yang perlu diperiksa antara lain dalam-luar, atas-bawah, kiri-kanan, menyentuh-tidak menyentuh, memotong-tidak memotong, dan sejajar-tidak sejajar.

## Rotasi dan Cermin dalam Ketidaksamaan

Misalnya ada lima gambar berbentuk sama. Empat dapat diperoleh dari satu bentuk dasar hanya dengan rotasi, satu merupakan hasil pencerminan. Cara memeriksanya:

1. Pilih satu ciri asimetris.
2. Perhatikan hubungannya terhadap bagian lain.
3. Bayangkan gambar diputar.
4. Lihat apakah hubungan internal tetap.
5. Kalau hubungan kiri-kanan terbalik, periksa kemungkinan pencerminan.

Contohnya: urutan pola searah jarum jam pada A, B, D, dan E selalu hitam, garis, putih, titik. Pada C urutannya terbalik, sehingga C adalah hasil pencerminan.

## Pola 4:1 sebagai Heuristik

Kalau ada lima opsi, pola 4:1 sering menjadi petunjuk kuat pada ketidaksamaan. Tapi jangan menganggapnya aturan mutlak.

Kalau pemeriksaan pertama menghasilkan 3:2, jangan langsung membuang hipotesis. Mungkin masih ada variabel kedua yang membedakan satu opsi dari empat lainnya.

Tujuan akhirnya tetap sama: menemukan satu gambar yang secara konsisten berbeda dari mayoritas.''',
    "tiu-handbook-figural-s05": '''## Konsep Serial

Serial menguji kemampuan menemukan hubungan dalam rangkaian gambar. Bentuk sederhananya: G1, G2, G3, G4, lalu ?.

Berbeda dengan analogi, pola serial tidak sebaiknya disimpulkan hanya dari satu transisi. Aturan dari G1 ke G2 perlu diverifikasi terhadap G2 ke G3 dan G3 ke G4, baru setelah itu pola diteruskan.

Urutannya: identifikasi, verifikasi, lanjutkan.

## Pola Rotasi Tetap

**Contoh soal:** `↑`, `→`, `↓`, `←`. Polanya rotasi 90° searah jarum jam. Tahap berikutnya kembali ke posisi awal: `↑`.

## Pola Jumlah

**Contoh soal:** `●`, `●●`, `●●●`, `●●●●`. Polanya jumlah +1. Tahap berikutnya `●●●●●`.

## Pola Posisi

Misalnya titik bergerak kiri atas, kanan atas, kanan bawah, kiri bawah. Polanya berpindah satu sudut searah jarum jam.

## Pola Arsiran

**Contoh soal:** putih, hitam, putih, hitam. Polanya A-B-A-B. Berikutnya putih.

## Pola Bentuk Siklis

**Contoh soal:** `○`, `△`, `□`, `○`, `△`, ... Siklusnya lingkaran, segitiga, persegi, dengan periode 3. Tahap berikutnya `□`.

## Pola Selang-seling

Kalau perubahan dari satu gambar ke gambar berikutnya tampak tidak konsisten, periksa posisi ganjil dan genap secara terpisah.

**Contoh soal:** `↑`, `●`, `→`, `○`, `↓`, `●`, ... Posisi ganjil (1, 3, 5) berisi panah yang berputar 90°: `↑`, `→`, `↓`. Posisi genap (2, 4, 6) berisi lingkaran: `●`, `○`, `●`. Jadi sebenarnya ada dua rangkaian independen yang berjalan bersamaan.

## Pola Ganda

Suatu serial bisa punya beberapa variabel sekaligus. Misalnya arah panah berubah `↑`, `→`, `↓`, `←` sementara jumlah titik berubah 1, 2, 3, 4.

Dua variabel berubah bersamaan, jadi prediksi berikutnya harus memenuhi kedua pola sekaligus. Jangan hanya memilih gambar dengan arah yang benar kalau jumlah titiknya salah.

## Pola Siklus

Tidak semua serial memakai penambahan. Contoh: A, B, C, D, A, B. Siklus empat tahap: setelah D kembali ke A.

Untuk menentukan tahap ke-n, gunakan sisa pembagian. Contoh tahap ke-10: 10 dibagi 4 menghasilkan sisa 2, maka tahap ke-10 sama dengan posisi tahap ke-2 dalam siklus, yaitu B.

## Pola Perubahan Bertingkat

**Contoh soal:** jumlah titik di sekeliling lingkaran adalah 1, 2, 4, 7, 11, ... Selisihnya +1, +2, +3, +4, jadi selisih berikutnya +5. Maka 11 + 5 = 16. Kalau pola disajikan dalam bentuk gambar, ubah gambar menjadi data numerik dulu.

## Tabulasi Mental

Pada serial kompleks, pecah informasi menjadi tabel mental: untuk setiap tahap, catat jumlah, arah, arsiran, dan posisinya secara terpisah.

Misalnya tahap 1 jumlah 1, arah atas, arsiran putih, posisi kiri; tahap 2 jumlah 2, arah kanan, arsiran hitam, posisi atas; dan seterusnya.

Dengan cara ini gambar tidak lagi terlihat sebagai satu pola rumit, karena setiap variabel dianalisis secara terpisah.

## Prioritas Pemeriksaan Serial

Ketika pola belum terlihat, gunakan urutan praktis ini: jumlah, posisi, orientasi, arsiran, bentuk, hubungan internal. Urutan ini bukan aturan mutlak. Tujuannya adalah memulai dari karakteristik yang paling objektif dan mudah diuji.

## Eliminasi pada Serial

Misalnya hasil prediksimu adalah 4 titik, panah menghadap kiri, arsiran hitam. Lakukan eliminasi bertahap:

1. Jumlah bukan 4, coret. Gugur: A dan E.
2. Arah bukan kiri, coret. Gugur: B.
3. Arsiran bukan hitam, coret. Gugur: C.

Tersisa D. Tidak perlu menganalisis seluruh detail setiap opsi sejak awal.''',
    "tiu-handbook-figural-s06": '''## Prediksi Sebelum Bergantung pada Opsi

Kalau memungkinkan, bentuklah prediksi sebelum terlalu bergantung pada pilihan jawaban. Pilihan jawaban tetap bisa digunakan untuk menguji hipotesis, membedakan dua kemungkinan pola, dan melakukan eliminasi. Tapi prediksi dulu, baru cocokkan.

## Satu Variabel Sekali Waktu

Kalau gambar berputar, berubah warna, berpindah, dan bertambah titik sekaligus, jangan mencoba membaca semuanya sekaligus. Lakukan beberapa pass:

- Pass 1: jumlah
- Pass 2: orientasi
- Pass 3: posisi
- Pass 4: arsiran

Setelah itu gabungkan hasilnya.

## Gunakan Invarian

Invarian adalah karakteristik yang tetap. Pada soal figural, selalu tanyakan dua hal: apa yang berubah, dan apa yang tetap? Keduanya sama penting.

Misalnya jumlah objek selalu 4, titik selalu berada di dalam, dua garis selalu tegak lurus, dan satu bidang selalu hitam.

## Bedakan Pola dan Kebetulan

Suatu aturan harus konsisten dengan seluruh data yang tersedia. Kalau cocok pada gambar 1 ke 2 tapi gagal pada gambar 2 ke 3, teori itu harus dibuang atau direvisi.

## Prioritaskan Aturan yang Efisien

Kalau sebuah pola sederhana sudah menjelaskan seluruh tahap dan menghasilkan satu jawaban yang konsisten, jangan menambahkan transformasi yang tidak diperlukan.

Gunakan prinsip sederhana, konsisten, dan didukung seluruh gambar. Bukan berarti aturan yang paling rumit pasti paling benar.

## Manajemen Waktu

Tidak perlu memaksakan setiap soal figural selesai dalam jumlah detik yang sama.

- **Tahap belajar:** utamakan akurasi mengenali pola.
- **Tahap latihan lanjutan:** kurangi waktu pengerjaan secara bertahap.
- **Saat CAT:** kalau satu soal memerlukan terlalu banyak percobaan pola, lanjutkan ke soal lain dan kembali kalau waktu memungkinkan.

Tujuannya adalah mengelola waktu keseluruhan tes secara efektif.''',
    "tiu-handbook-figural-s07": '''Dua belas jebakan ini paling sering muncul di soal figural. Kenali polanya supaya tidak jatuh ke lubang yang sama.

- **Rotasi dianggap cermin.** Gunakan ciri asimetris sebagai titik acuan.
- **Posisi dianggap rotasi.** Periksa apakah orientasi objek ikut berubah.
- **Hanya melihat bentuk luar.** Hitung elemen internal.
- **Jumlah sama tetapi hubungan berbeda.** Periksa dalam/luar, sentuh/tidak, potong/tidak.
- **Hanya melihat satu transisi serial.** Verifikasi dengan transisi berikutnya.
- **Terkecoh opsi.** Bentuk hipotesis sebelum memilih.
- **Mengabaikan arsiran.** Perlakukan warna sebagai variabel terpisah.
- **Memaksakan satu rangkaian.** Periksa pola ganjil-genap.
- **Terlalu cepat menggunakan pola 4:1.** Uji juga variabel kedua.
- **Dua aturan berjalan bersamaan.** Pisahkan masing-masing variabel.
- **Pola benar tetapi urutan transformasi salah.** Perhatikan urutan operasi.
- **Terlalu rumit mencari pola.** Kembali ke variabel objektif.''',
    "tiu-handbook-figural-s08": '''## Enam Pertanyaan Pertama

Ketika soal muncul, tanyakan enam hal ini:

- Ada berapa? (jumlah)
- Menghadap ke mana? (orientasi)
- Berada di mana? (posisi)
- Apa yang hitam atau putih? (arsiran)
- Apa yang berubah?
- Apa yang tetap?

## Kalau Pola Belum Terlihat

Lanjutkan dengan lima pertanyaan ini:

- Apakah terjadi pencerminan?
- Apakah jumlahnya ganjil atau genap?
- Apakah bentuknya terbuka atau tertutup?
- Apakah ada dua pola berselang-seling?
- Apakah ada dua variabel yang berubah bersamaan?''',
    "tiu-handbook-figural-s10": '''Penguasaan figural bisa diukur dalam lima level. Cek kamu sudah sampai mana.

- **Level 1, Identifikasi.** Mampu mengenali jumlah, orientasi, posisi, dan arsiran.
- **Level 2, Transformasi.** Mampu membedakan rotasi, pencerminan, perpindahan, dan perubahan bentuk.
- **Level 3, Kombinasi.** Mampu menganalisis dua variabel sekaligus, misalnya rotasi + jumlah atau posisi + arsiran.
- **Level 4, Multilayer.** Mampu mengenali pola ganjil-genap, dua serial independen, siklus, perubahan bertingkat, dan urutan transformasi.
- **Level 5, Kecepatan dan Akurasi.** Dapat mengenali pola secara efisien tanpa mencoba terlalu banyak hipotesis.

Target belajar bukan sekadar pernah melihat jenis soal, tetapi mampu memahami struktur logikanya.''',
    "tiu-handbook-figural-s11": '''## Catat Penyebabnya, Bukan Hanya Jawabannya

Jangan hanya mencatat "jawaban saya B, ternyata D". Catat penyebab kesalahannya.

**Contoh catatan:** jenis soal serial, pola rotasi + arsiran. Kesalahan: hanya memperhatikan rotasi. Petunjuk yang terlewat: arsiran berubah putih, hitam, putih, hitam. Perbaikan: gunakan J-R-A-P sebelum menjawab.

## Klasifikasi Kesalahan

- **K1.** Tidak menemukan pola.
- **K2.** Menemukan pola tetapi salah arah.
- **K3.** Salah membedakan rotasi dan cermin.
- **K4.** Melewatkan variabel kedua.
- **K5.** Salah menghitung elemen.
- **K6.** Terpancing pilihan jawaban.
- **K7.** Terlalu lama mempertahankan hipotesis yang salah.

Kalau kesalahan tertentu berulang, arahkan belajarmu secara khusus pada kelemahan tersebut.''',
    "tiu-handbook-figural-s12": '''Tiga kompetensi inti figural dan apa saja yang perlu dikuasai di masing-masingnya.

## Analogi

- **Inti:** transformasi, transfer aturan, prediksi.
- **Variasi:** jumlah, rotasi, cermin, posisi, arsiran, kombinasi.

## Ketidaksamaan

- **Inti:** karakteristik mayoritas, satu pelanggar.
- **Variasi:** jumlah, ganjil/genap, bentuk, simetri, orientasi, relasi, terbuka/tertutup.

## Serial

- **Inti:** identifikasi, verifikasi, lanjutkan.
- **Variasi:** rotasi, jumlah, posisi, arsiran, siklus, selang-seling, pola ganda, perubahan bertingkat.''',
    "tiu-handbook-figural-s13": '''## Analogi

- A ke B bagaimana? Tentukan transformasinya.
- Terapkan transformasi yang sama pada C.
- Prediksi D.

## Ketidaksamaan

- Apa karakteristik mayoritas?
- Opsi mana yang melanggarnya?
- Verifikasi seluruh pilihan.

## Serial

- Tahap 1 ke 2 bagaimana?
- Apakah tahap 2 ke 3 mengonfirmasi?
- Periksa variabel lain.
- Prediksi tahap berikutnya.

## Urutan Pemeriksaan Praktis

Jumlah, rotasi atau orientasi, arsiran, posisi, bentuk, simetri, hubungan internal, terbuka atau tertutup.

J-R-A-P adalah empat langkah pertama urutan ini: Jumlah, Rotasi, Arsiran, Posisi. Kalau pola belum terlihat, perluas dengan B-S-T: Bentuk, Simetri, Terbuka/Tertutup.''',
    "tiu-handbook-figural-s15": '''## Tiga Kompetensi Inti

Kemampuan figural berfokus pada tiga kompetensi inti: analogi, ketidaksamaan, dan serial. Variabel analisis utamanya adalah jumlah, rotasi, posisi, arsiran, bentuk, simetri, dan relasi.

## Ringkasan per Jenis

- **Analogi.** Temukan transformasi dari A ke B, kemudian gunakan transformasi yang sama terhadap C.
- **Ketidaksamaan.** Cari karakteristik mayoritas dan satu pelanggar.
- **Serial.** Cari pola dari tahap 1 ke 2, verifikasi melalui tahap 2 ke 3, baru prediksi tahap selanjutnya.

## Kalau Bingung, Ingat Ini

- Kalau pola rumit, pisahkan setiap variabel.
- Kalau perubahan tampak tidak konsisten, periksa pola ganjil-genap atau selang-seling.
- Kalau gambar tampak hampir sama, hitung objek, garis, titik, sudut, daerah, dan perpotongan.
- Kalau bingung antara rotasi dan cermin, gunakan ciri asimetris sebagai titik acuan.
- Kalau dua opsi sangat mirip, periksa detail terkecil: orientasi, titik, arsiran, posisi internal, dan jumlah bagian.

## Aturan Emas Figural

Jangan sekadar mencari gambar yang terlihat benar. Temukan hubungannya, uji polanya, prediksi hasilnya, baru pilih jawaban.

## Catatan Akhir

Rotasi, pencerminan, jumlah, posisi, arsiran, simetri, pola ganjil-genap, pola ganda, dan teknik lainnya adalah pengembangan pembelajaran untuk membantu membaca pola visual, bukan submateri resmi tambahan.

Materi visual-spasial seperti jaring-jaring kubus dan rotasi kubus 3D tidak ditempatkan sebagai materi inti di sini.

Ketentuan teknis seleksi seperti jumlah soal, nilai ambang batas, dan sistem penilaian mengikuti peraturan resmi pada tahun seleksi masing-masing.

Fokus belajar tetap berada pada kemampuan yang paling penting: membaca gambar sebagai data, menemukan hubungan, memverifikasi pola, dan menjawab secara logis.''',
    "tiu-handbook-numerik-s02": '''## Apa yang Sebenarnya Diuji?

TIU Numerik bukan sekadar tes menghitung.

Kamu dituntut mampu memahami informasi kuantitatif, mengenali hubungan antarangka, dan menentukan operasi matematika yang tepat.

Kamu juga dituntut menyederhanakan persoalan, menguji kecukupan informasi, membandingkan dua kuantitas, mengenali pola, dan menarik kesimpulan secara logis.

## Empat Domain Inti

- **Berhitung.** Perhitungan sederhana secara tepat dan efisien.
- **Deret Angka.** Mengenali pola dan hubungan antarangka.
- **Perbandingan Kuantitatif.** Membandingkan dua besaran berdasarkan informasi yang tersedia.
- **Soal Cerita.** Mengubah informasi naratif menjadi hubungan matematis.

## Strategi Dasar

Gunakan urutan ini: pahami, sederhanakan, pilih strategi, hitung, cek. Jangan langsung melakukan operasi panjang.

**Contoh soal:** 49 × 51. Daripada perkalian panjang, gunakan identitas `(a - b)(a + b) = a² - b²`. Jadi 49 × 51 = (50 - 1)(50 + 1) = 50² - 1² = 2500 - 1 = 2499.

Kalau suatu soal membutuhkan percobaan terlalu panjang sementara soal lain lebih mudah dikerjakan, tinggalkan sementara dan kembali setelah soal yang lebih pasti selesai. Ini strategi pengerjaan, bukan ketentuan resmi mengenai batas waktu per soal.''',
    "tiu-handbook-numerik-s03": '''## Urutan Operasi

Gunakan urutan ini: kurung dulu, lalu pangkat atau akar, lalu kali atau bagi, terakhir tambah atau kurang. Untuk operasi dengan tingkat yang sama, kerjakan dari kiri ke kanan.

**Contoh soal:** 48 ÷ 6 × 4. Kerjakan 48 ÷ 6 = 8, kemudian 8 × 4 = 32. Jangan mengerjakan 6 × 4 dulu, karena tidak ada tanda kurung. Hasil 48 ÷ (6 × 4) = 2 adalah salah.

## Bilangan Bulat dan Tanda

Aturan perkalian dan pembagian tanda: tanda sama menghasilkan positif, tanda beda menghasilkan negatif.

**Contoh soal:** -12 - 15 = -27.

**Jebakan penting:** pangkat dikerjakan dulu, baru tanda minus. Jadi -3² = -(3²) = -9, sedangkan (-3)² = 9. Kurung mengubah makna ekspresi.

## Pecahan

**Penjumlahan dan pengurangan.** Penyebut harus disamakan dulu. Contoh: 3/4 + 5/6. KPK dari 4 dan 6 adalah 12. Jadi 9/12 + 10/12 = 19/12.

**Perkalian.** `a/b × c/d = (a × c)/(b × d)`. Sederhanakan faktor sebelum mengalikan. Contoh: 15/28 × 14/25. Karena 15/25 = 3/5 dan 14/28 = 1/2, maka hasilnya 3/5 × 1/2 = 3/10.

**Pembagian.** `a/b ÷ c/d = a/b × d/c`, dengan b, c, d tidak nol. Bagi pecahan sama dengan kalikan dengan kebalikan pecahan pembagi.

## Pecahan, Desimal, dan Persen

Konversi berikut sebaiknya dikuasai di luar kepala:

| Pecahan | Desimal | Persen |
|---|---|---:|
| 1/2 | 0,5 | 50% |
| 1/3 | 0,333... | 33 1/3% |
| 2/3 | 0,666... | 66 2/3% |
| 1/4 | 0,25 | 25% |
| 3/4 | 0,75 | 75% |
| 1/5 | 0,2 | 20% |
| 2/5 | 0,4 | 40% |
| 3/5 | 0,6 | 60% |
| 4/5 | 0,8 | 80% |
| 1/8 | 0,125 | 12,5% |
| 3/8 | 0,375 | 37,5% |
| 5/8 | 0,625 | 62,5% |
| 7/8 | 0,875 | 87,5% |

**Trik persen bolak-balik:** a% dari b sama dengan b% dari a, karena keduanya sama dengan ab/100. Contoh: 16% dari 25 bisa diubah menjadi 25% dari 16, yaitu 1/4 × 16 = 4.

## Perubahan Persentase

Kalau nilai awal A naik p%: `A baru = A(1 + p/100)`. Kalau turun p%: `A baru = A(1 - p/100)`.

**Contoh soal:** 240 meningkat 25%. Maka 240 × 1,25 = 300.

**Jebakan:** naik 20% kemudian turun 20% tidak kembali ke nilai awal. Misalnya 100 naik 20% menjadi 120, kemudian turun 20% menjadi 120 × 0,8 = 96. Terjadi penurunan bersih 4%.

## Diskon Bertingkat

Dua diskon tidak langsung dijumlahkan. Kalau harga awal H mendapat diskon a% kemudian b%: `H akhir = H(1 - a/100)(1 - b/100)`.

**Contoh soal:** harga Rp500.000 mendapat diskon 20% kemudian 10%. Maka 500.000 × 0,8 × 0,9 = 500.000 × 0,72 = Rp360.000. Diskon efektifnya 100% - 72% = 28%, bukan 30%.

## Pangkat

Hukum dasar pangkat:

- `a^m × a^n = a^(m+n)`
- `a^m ÷ a^n = a^(m-n)`, a tidak nol
- `(a^m)^n = a^(m × n)`
- `(ab)^n = a^n × b^n`
- `a^0 = 1`, a tidak nol
- `a^(-n) = 1/a^n`, a tidak nol

**Contoh soal:** 2^7 × 2^3 ÷ 2^5 = 2^(7+3-5) = 2^5 = 32.

## Akar

Untuk bilangan real nonnegatif a dan b: `√(ab) = √a × √b`.

**Contoh soal:** √72 = √(36 × 2) = 6√2.

**Kuadrat penting yang sebaiknya dihafal:** 11² = 121, 12² = 144, 13² = 169, 14² = 196, 15² = 225, 16² = 256, 17² = 289, 18² = 324, 19² = 361, 20² = 400.

## Identitas Aljabar

Tiga identitas penting:

- `(a + b)² = a² + 2ab + b²`
- `(a - b)² = a² - 2ab + b²`
- `a² - b² = (a + b)(a - b)`

**Contoh soal:** 103² - 97² = (103 + 97)(103 - 97) = 200 × 6 = 1200. Tidak perlu menghitung masing-masing kuadrat.

## Persamaan Linear

Prinsip utama: lakukan hal yang sama di kedua sisi, dan isolasi variabel dengan langkah sesingkat mungkin.

**Contoh soal:** 3x + 7 = 31. Maka 3x = 24, x = 8.

**Contoh soal lain:** 4x - 8 = 2x + 10. Maka 2x = 18, x = 9.

## Rasio

**Kalau diketahui jumlah.** Misalnya A : B = 3 : 5 dan A + B = 64. Jumlah bagian 3 + 5 = 8. Satu bagian 64 ÷ 8 = 8. Maka A = 3 × 8 = 24 dan B = 5 × 8 = 40.

**Kalau diketahui selisih.** Misalnya A : B = 7 : 4 dan A - B = 24. Selisih bagian 7 - 4 = 3. Satu bagian 24 ÷ 3 = 8. Maka A = 7 × 8 = 56 dan B = 4 × 8 = 32.''',
    "tiu-handbook-numerik-s04": '''## Urutan Analisis Deret

Jangan mencari pola rumit sebelum memeriksa pola sederhana. Gunakan urutan ini: selisih, rasio, selisih bertingkat, berselang, operasi kombinasi, pola khusus. Pola yang dipilih harus konsisten terhadap seluruh suku yang tersedia.

## Deret Aritmetika

Ciri: selisih antar suku berurutan selalu sama.

**Contoh soal:** 7, 12, 17, 22, ... Selisihnya +5, +5, +5. Maka suku berikutnya 22 + 5 = 27.

## Deret Geometri

Ciri: rasio antar suku berurutan selalu sama.

**Contoh soal:** 5, 15, 45, 135, ... Polanya ×3. Maka suku berikutnya 135 × 3 = 405.

## Selisih Bertingkat

**Contoh soal:** 3, 8, 15, 24, 35, ... Selisih pertama 5, 7, 9, 11. Selisih kedua 2, 2, 2. Jadi selisih berikutnya 13. Maka 35 + 13 = 48.

## Pola Kuadrat

**Contoh soal:** 4, 9, 16, 25, 36, ... Ini adalah 2², 3², 4², 5², 6². Maka berikutnya 7² = 49. Pola ini juga bisa dikenali melalui selisih: 5, 7, 9, 11, 13.

## Deret Berselang

**Contoh soal:** 2, 20, 5, 25, 8, 30, 11, ... Pisahkan posisi ganjil dan genap. Posisi ganjil 2, 5, 8, 11 polanya +3. Posisi genap 20, 25, 30 polanya +5. Suku berikutnya setelah 11 berada pada jalur genap: 30 + 5 = 35.

## Operasi Bergantian

**Contoh soal:** 4, 12, 15, 45, 48, ... Polanya ×3, +3, ×3, +3, ... Maka 48 × 3 = 144.

Kalau pola terlihat tidak teratur, periksa posisi ganjil dan genap, operasi yang bergantian, atau kelompok dua atau tiga suku.

## Operasi Progresif

**Contoh soal:** 2, 5, 17, 71, 359, ... Perhatikan pengali dan penambahnya ikut naik: 2 × 2 + 1 = 5, 5 × 3 + 2 = 17, 17 × 4 + 3 = 71, 71 × 5 + 4 = 359.

Maka berikutnya 359 × 6 + 5 = 2154 + 5 = 2159. Jenis ini menuntutmu memperhatikan perubahan pada operator sekaligus konstantanya.

## Fibonacci dan Rekurensi

Deret Fibonacci dasar: 1, 1, 2, 3, 5, 8, 13, ... dengan aturan setiap suku adalah jumlah dua suku sebelumnya.

Soal bisa memakai variasi hubungan rekursif. **Contoh soal:** 2, 3, 8, 19, 46, ... Aturannya Un = 2Un-1 + Un-2. Cek: 2 × 3 + 2 = 8, 2 × 8 + 3 = 19, 2 × 19 + 8 = 46. Maka suku berikutnya 2 × 46 + 19 = 92 + 19 = 111.''',
    "tiu-handbook-numerik-s05": '''## Prinsip P dan Q

Bentuk umum perbandingan kuantitatif adalah membandingkan kuantitas P (ekspresi pertama) dengan kuantitas Q (ekspresi kedua).

Kemungkinan hubungannya ada empat: P lebih besar dari Q, P lebih kecil dari Q, P sama dengan Q, atau hubungan tidak dapat ditentukan.

Jangan menghitung P dan Q secara terpisah kalau keduanya bisa dibandingkan langsung.

## Metode Selisih

Bandingkan P - Q. Kalau P - Q > 0 maka P > Q. Kalau P - Q < 0 maka P < Q. Kalau P - Q = 0 maka P = Q.

**Contoh soal:** P = 5x + 7, Q = 5x + 3. Maka P - Q = 4. Karena 4 > 0 untuk setiap x, maka P > Q. Tidak perlu mengetahui nilai x.

## Faktor Bersama

**Contoh soal:** P = 27 × 48, Q = 24 × 54. Hitung efisien: 27 × 48 = 27 × (50 - 2) = 1350 - 54 = 1296. Sedangkan 24 × 54 = 24 × (50 + 4) = 1200 + 96 = 1296. Jadi P = Q.

## Informasi Tidak Cukup

Misalnya P = x² dan Q = x, tanpa informasi tambahan mengenai x. Kalau x = 2, maka P = 4 dan Q = 2, jadi P > Q.

Kalau x = 1/2, maka P = 1/4 dan Q = 1/2, jadi P < Q. Kalau x = 1, maka P = Q.

Karena hubungan berubah-ubah tergantung nilai x, jawabannya: hubungan tidak dapat ditentukan.

Jangan menganggap variabel positif, negatif, bulat, atau lebih besar dari 1, kecuali disebutkan dalam soal.

## Kuadrat vs Bilangan

Kalau x > 1 dan P = x², Q = x, maka x² > x sehingga P > Q. Kalau 0 < x < 1, berlaku x² < x. Di x = 1, P = Q. Tapi kalau hanya diketahui x > 0, hubungan belum tentu, karena x bisa di bawah atau di atas 1.

## Hati-hati dengan Rasio P/Q

Membandingkan P/Q bisa berguna kalau tanda dan nilai Q diketahui. Tapi metode rasio tidak boleh dipakai sembarangan kalau Q mungkin nol, tanda Q belum diketahui, atau P dan Q bisa bernilai negatif.

**Contoh bahayanya:** misal P = -6 dan Q = -3. Maka P/Q = 2 > 1, seolah P > Q, padahal -6 < -3. Membagi dengan bilangan negatif membalik arah pertidaksamaan. Untuk kondisi umum, metode P - Q biasanya lebih aman.''',
    "tiu-handbook-numerik-s06": '''## Metode Terjemahan

Padatkan soal menjadi empat hal: diketahui, ditanya, hubungan, hitung.

**Contoh soal:** jumlah usia A dan B adalah 42 tahun. A enam tahun lebih tua dari B. Tulis: A + B = 42 dan A = B + 6. Substitusi: (B + 6) + B = 42, jadi 2B = 36, B = 18. Maka A = 24.

## Perbandingan Senilai

Pada hubungan senilai, kedua besaran berubah dalam arah yang sama secara proporsional.

**Contoh soal:** 5 buku berharga Rp60.000. Jika harga setiap buku sama, 8 buku berharga berapa? Harga satu buku 60.000 ÷ 5 = Rp12.000. Jadi 8 buku berharga 8 × 12.000 = Rp96.000. Gunakan metode ini hanya kalau hubungan benar-benar proporsional.

## Perbandingan Berbalik Nilai

Pada hubungan berbalik nilai, ketika satu besaran meningkat, besaran lain turun dalam proporsi tertentu.

**Contoh soal:** 8 pekerja dapat menyelesaikan pekerjaan dalam 15 hari. Jika produktivitas setiap pekerja sama, berapa hari untuk 12 pekerja? Total kerja tetap 8 × 15 = 120 hari-orang. Jadi 12t = 120, t = 10 hari.

Asumsi penting: volume pekerjaan sama, produktivitas setiap pekerja sama, dan kondisi kerja tidak berubah.

## Kerja Bersama

Kalau A menyelesaikan pekerjaan dalam a hari, lajunya 1/a per hari. Kalau B membutuhkan b hari, lajunya 1/b per hari. Kalau bekerja bersama, lajunya dijumlahkan. Untuk dua pekerja: `t = (a × b)/(a + b)`.

**Contoh soal:** A 12 hari, B 18 hari. Maka t = (12 × 18)/(12 + 18) = 216/30 = 7,2 hari. Cek: A 1/12 per hari, B 1/18 per hari, bersama 5/36 per hari, jadi 36/5 = 7,2 hari.

Shortcut ini berlaku untuk dua sumber kerja positif dengan laju konstan. Untuk tiga pekerja: `t = 1/(1/a + 1/b + 1/c)`.

## Pipa dan Kebocoran

Pipa yang mengisi memberi laju positif, kebocoran atau pengosongan memberi laju negatif.

**Contoh soal:** pipa A dapat mengisi tangki dalam 4 jam. Kebocoran dapat mengosongkan tangki penuh dalam 12 jam. Laju bersih 1/4 - 1/12 = 3/12 - 1/12 = 2/12 = 1/6 per jam. Maka tangki penuh dalam 6 jam.

## Jarak, Kecepatan, dan Waktu

Hubungan dasar: `s = v × t`, `v = s/t`, `t = s/v`. Pastikan satuan konsisten: 1 jam = 60 menit, 1 km = 1000 m, 1 m/s = 3,6 km/jam, 1 km/jam = 5/18 m/s.

## Berpapasan

Kalau dua objek bergerak saling mendekat dengan kecepatan konstan, kecepatan relatifnya `vr = v1 + v2`. Kalau jarak awal keduanya s, waktu bertemu `t = s/(v1 + v2)`.

**Contoh soal:** dua kota berjarak 270 km. Mobil A 60 km/jam, mobil B 75 km/jam, bergerak saling mendekat pada waktu yang sama. Maka t = 270/(60 + 75) = 270/135 = 2 jam.

## Menyusul

Kalau dua objek bergerak searah dan objek lebih cepat berada di belakang, kecepatan relatifnya `vr = v cepat - v lambat`. Kalau jarak awal antarkeduanya s, waktu menyusul `t = s/(v cepat - v lambat)`, dengan v cepat lebih besar dari v lambat.

**Contoh soal:** A unggul 30 km dan bergerak 60 km/jam. B bergerak 75 km/jam. Kecepatan relatif 75 - 60 = 15 km/jam. Maka t = 30/15 = 2 jam.

## Kecepatan Rata-rata

Rumus umum: kecepatan rata-rata = total jarak dibagi total waktu. Jangan otomatis menggunakan rata-rata sederhana dari dua kecepatan.

**Contoh soal:** pergi 60 km dengan kecepatan 60 km/jam dan kembali 60 km dengan kecepatan 40 km/jam. Total jarak 120 km. Total waktu 60/60 + 60/40 = 1 + 1,5 = 2,5 jam.

Kecepatan rata-rata 120 ÷ 2,5 = 48 km/jam, bukan 50 km/jam. Perjalanan yang lambat memakan waktu lebih lama, jadi bobotnya lebih besar.

## Rata-rata

Rumus: rata-rata = jumlah data dibagi banyak data. Kalau rata-rata n data adalah r, jumlah datanya n × r.

**Contoh soal:** rata-rata nilai 8 pegawai adalah 72. Totalnya 8 × 72 = 576. Setelah satu pegawai ditambahkan, rata-rata 9 pegawai menjadi 74. Total baru 9 × 74 = 666. Nilai pegawai baru 666 - 576 = 90.

## Rata-rata Gabungan

Kelompok pertama jumlah n1 dengan rata-rata x1, kelompok kedua jumlah n2 dengan rata-rata x2. Rata-rata gabungan: `(n1 × x1 + n2 × x2)/(n1 + n2)`.

**Contoh soal:** 20 orang mempunyai rata-rata 70, 30 orang mempunyai rata-rata 80. Maka (20 × 70 + 30 × 80)/50 = (1400 + 2400)/50 = 3800/50 = 76. Titik seimbangnya condong ke kelompok yang lebih banyak anggotanya.

## Untung dan Rugi

Kalau soal menggunakan harga beli sebagai basis: untung = harga jual - harga beli, %untung = untung/harga beli × 100%. Rugi = harga beli - harga jual, %rugi = rugi/harga beli × 100%.

Tapi selalu periksa redaksi soal. Kalau soal secara eksplisit meminta persentase terhadap harga jual atau basis lain, gunakan basis yang disebutkan soal.

## Bagian dan Sisa

Kalau pekerjaan yang selesai 3/8, sisanya 1 - 3/8 = 5/8. Konsep sederhana seperti ini sering tersembunyi di dalam narasi panjang.

## Proporsi

Kalau A : B = m : n, maka A/B = m/n. Penggunaan proporsi hanya sah kalau hubungan antarbesaran memang proporsional. Jangan menggunakan perbandingan silang secara mekanis pada setiap soal. Cek dulu: senilai (searah) atau berbalik nilai (berlawanan)?''',
    "tiu-handbook-numerik-s07": '''## Kuadrat Bilangan Berakhiran 5

Untuk bilangan 10a + 5 berlaku: `(10a + 5)² = 100a(a + 1) + 25`.

**Contoh soal:** 85². Ambil angka depan 8: 8 × (8 + 1) = 8 × 9 = 72, tempelkan 25: 7225.

## Perkalian dengan 11

Untuk bilangan dua digit ab, kalau a + b < 10, digit hasilnya adalah a, a + b, b.

**Contoh soal:** 32 × 11. Jumlah 3 + 2 = 5, jadi 3, 5, 2, hasilnya 352.

Kalau jumlah digit 10 atau lebih, lakukan carry. **Contoh soal:** 78 × 11. Jumlah 7 + 8 = 15. Tulis 5 di posisi tengah dan carry 1: 7 + 1, 5, 8, hasilnya 858.

## Perkalian 5, 25, dan 125

- **Kali 5:** n × 5 = (n ÷ 2) × 10.
- **Kali 25:** karena 25 = 100/4, maka n × 25 = (n ÷ 4) × 100. Contoh: 48 × 25 = 12 × 100 = 1200.
- **Kali 125:** karena 125 = 1000/8, maka n × 125 = (n ÷ 8) × 1000. Contoh: 32 × 125 = 4 × 1000 = 4000.

Rumus-rumus ini tetap benar untuk bilangan yang tidak habis dibagi 2, 4, atau 8, tetapi mungkin tidak lagi menjadi metode hitung tercepat karena menghasilkan pecahan sementara.

## Dekat dengan Bilangan Bulat

**Contoh soal:** 99 × 47 = (100 - 1) × 47 = 4700 - 47 = 4653.

**Contoh soal:** 1002 × 18 = (1000 + 2) × 18 = 18000 + 36 = 18036.

## Aproksimasi

Aproksimasi paling berguna saat pilihan jawaban berjauhan.

**Contoh soal:** 19,8 × 50,2. Pendekatannya 20 × 50 = 1000. Nilai tepatnya 993,96. Kalau pilihannya A 96, B 204, C 512, D 994, E 1850, maka D dapat dikenali dengan cepat.''',
    "tiu-handbook-numerik-s08": '''Lima belas jebakan ini paling sering muncul di TIU Numerik. Hafalkan daftarnya, lalu biasakan cek 5 detik sebelum memilih jawaban.

## Berhitung

- Salah urutan operasi.
- Salah membaca tanda negatif.
- Menjumlahkan diskon bertingkat.
- Menganggap kenaikan dan penurunan persentase saling menghapus.
- Salah menentukan basis persentase.

## Deret

- Memaksakan pola deret.
- Mengabaikan pola ganjil-genap.
- Terlalu lama mempertahankan satu hipotesis pola yang gagal.

## Perbandingan Kuantitatif

- Mengasumsikan variabel positif tanpa informasi.
- Menggunakan rasio P/Q ketika tanda penyebut tidak diketahui.

## Soal Cerita

- Menggunakan rata-rata sederhana untuk kecepatan rata-rata.
- Menganggap semua hubungan sebagai perbandingan senilai.
- Tidak menyamakan satuan.

## Umum

- Menghitung bilangan besar ketika sebenarnya dapat disederhanakan.
- Menggunakan shortcut tanpa memeriksa syarat penggunaannya.

## Cek 5 Detik

Sebelum memilih jawaban, tanyakan:

- Apakah satuannya benar?
- Apakah tandanya benar?
- Apakah basis persentasenya benar?
- Apakah asumsi yang saya gunakan diberikan soal?
- Apakah pola berlaku untuk seluruh suku?
- Apakah hasilnya masuk akal?

**Contoh soal:** 5 pekerja membutuhkan 12 hari. Jika produktivitas setiap pekerja sama dan jumlah pekerja menjadi 10, waktu penyelesaian seharusnya menurun, bukan meningkat. Tanpa menghitung pun jawaban 24 hari dapat langsung dicurigai.''',
    "tiu-handbook-numerik-s10": '''## Persen

- p% dari x = (p/100) × x.
- a% dari b = b% dari a.

## Perubahan Nilai

- Naik p%: A baru = A(1 + p/100).
- Turun p%: A baru = A(1 - p/100).

## Diskon Bertingkat

H akhir = H(1 - a)(1 - b), dengan a dan b dalam bentuk desimal. Contoh: diskon 20% berarti a = 0,2.

## Jarak, Kecepatan, Waktu

- s = v × t.
- Berpapasan: t = s/(v1 + v2), untuk dua objek yang saling mendekat dengan kecepatan konstan.
- Menyusul: t = s/(v cepat - v lambat).

## Kerja Bersama

t = 1/(1/t1 + 1/t2). Untuk dua pekerja, bisa juga dipakai t = (t1 × t2)/(t1 + t2).

## Rata-rata

- Rata-rata: jumlah data dibagi banyak data.
- Rata-rata gabungan: (n1 × x1 + n2 × x2)/(n1 + n2).

## Selisih Kuadrat

a² - b² = (a + b)(a - b).

## Perbandingan Kuantitatif

Utamakan pemeriksaan P - Q sebelum menghitung P dan Q secara terpisah.

## Analisis Deret

Urutan cek: selisih, rasio, selisih bertingkat, berselang, kombinasi, pola khusus.''',
    "tiu-handbook-numerik-s11": '''## Pola Huruf dan Alfanumerik

Huruf bisa diubah menjadi angka dengan konversi A = 1, B = 2, C = 3, sampai Z = 26. Setelah diubah, pola huruf dikerjakan seperti deret angka biasa.

**Contoh soal:** B, E, I, N, T, ... Posisi alfabetnya 2, 5, 9, 14, 20. Selisihnya +3, +4, +5, +6. Selisih berikutnya +7, jadi 20 + 7 = 27. Karena alfabet hanya 26 huruf, sistemnya siklik: 27 kembali ke 1, yaitu A. Jawabannya A.''',
    "tiu-handbook-numerik-s12": '''Susun belajarmu dalam empat level, dari fondasi sampai soal tingkat lanjut.

- **Level 1, Fondasi.** Operasi hitung, pecahan, desimal, persen, rasio, persamaan sederhana.
- **Level 2, Aplikasi.** Deret angka, perubahan persentase, rata-rata, kerja bersama, jarak-waktu-kecepatan.
- **Level 3, Penalaran.** Perbandingan kuantitatif, variabel dengan kondisi, pola bertingkat, pola kombinasi, soal cerita multi informasi.
- **Level 4, Advanced.** Informasi tidak lengkap, kuantitas dengan beberapa kemungkinan nilai, deret multioperasi, soal kerja dengan perubahan laju.
- **Level 4, lanjutan.** Perjalanan dengan beberapa segmen, perubahan persentase berurutan, persoalan yang membutuhkan eliminasi opsi.

Kuasai satu level sampai mantap sebelum naik ke level berikutnya.''',
    "tiu-handbook-verbal-s02": '''Hampir seluruh soal verbal TIU dapat disederhanakan menjadi tiga pertanyaan. Kenali dulu tipe soalnya, baru tentukan cara menjawabnya.

## Tiga Pertanyaan Utama

- **Analogi.** "Apa hubungan yang tepat antara unsur-unsur tersebut?" Analogi menguji hubungan.
- **Silogisme.** "Apa yang pasti dapat disimpulkan dari premis?" Silogisme menguji implikasi dan kesimpulan.
- **Analitis.** "Susunan atau kondisi mana yang memenuhi seluruh aturan?" Analitis menguji kondisi.

## Pola Berpikir Dasar

Jangan langsung memilih jawaban hanya karena sebuah opsi terlihat masuk akal. Benar secara umum belum tentu benar secara logis.

Distraktor biasanya punya ciri-ciri ini:

- Masih berkaitan dengan topik soal.
- Benar dalam kehidupan sehari-hari.
- Terdengar logis.
- Menggunakan kata yang terdapat pada soal.
- Tetapi tidak memenuhi hubungan atau aturan yang diminta.

Jawaban yang tepat berada di pusat: ia memenuhi hubungan atau aturan yang diminta soal. Alur kerjanya selalu sama: kenali, sederhanakan, uji, eliminasi.

## Strategi Waktu

Pada SKD, seluruh jenis soal dikerjakan dalam satu rangkaian waktu. Karena itu, hemat waktu pada soal yang pola jawabannya dapat ditemukan dengan cepat.

Target waktu latihan yang dapat digunakan:

- Analogi sederhana: 15-30 detik.
- Silogisme langsung: 20-40 detik.
- Analogi kompleks: 30-45 detik.
- Silogisme majemuk: 30-60 detik.
- Analitis: 45-120 detik.

Angka tersebut merupakan strategi latihan, bukan ketentuan resmi pengerjaan per soal. Hemat waktu pada soal sederhana agar tersedia waktu untuk soal analitis yang membutuhkan lebih banyak penalaran.''',
    "tiu-handbook-verbal-s03": '''## Hakikat Analogi

Analogi menguji kemampuan menemukan relasi tertentu antara dua konsep, kemudian mencari pasangan lain yang mempunyai relasi sepadan.

Bentuk dasarnya adalah `A : B = C : D`. Yang dicari bukan sekadar A berhubungan dengan B dan C berhubungan dengan D. Yang dicari adalah hubungan A terhadap B sama dengan hubungan C terhadap D.

## Tiga Unsur Penting

### 1. Jenis hubungan

Contoh: KAYU : MEJA. Kayu merupakan bahan pembentuk meja. Hubungannya: bahan ke produk.

### 2. Arah hubungan

KAYU : MEJA berarti bahan ke produk. Berbeda dengan MEJA : KAYU yang berarti produk ke bahan. Jenis hubungan mungkin sama, tetapi arahnya berbeda.

### 3. Tingkat kekhususan

Contoh: DOKTER : STETOSKOP. Jangan berhenti pada hubungan yang terlalu umum seperti "manusia berhubungan dengan benda".

Rumuskan lebih spesifik: dokter menggunakan stetoskop sebagai salah satu alat dalam pekerjaannya. Semakin tepat hubungan yang dirumuskan, semakin mudah mengevaluasi pilihan jawaban.

## Pola Analogi yang Sering Muncul

- **Sinonim**, makna sepadan. Contoh: Cermat : Teliti.
- **Antonim**, makna berlawanan. Contoh: Optimis : Pesimis.
- **Tingkat atau intensitas**, tingkat sifat berbeda. Contoh: Hangat : Panas.
- **Sebab akibat**, A menyebabkan B. Contoh: Hujan : Genangan.
- **Bagian ke keseluruhan**, A merupakan bagian B. Contoh: Roda : Mobil.
- **Keseluruhan ke bagian**, A memiliki B. Contoh: Buku : Halaman.
- **Bahan ke produk**, A menjadi bahan B. Contoh: Kayu : Meja.
- **Produk ke bahan**, A dibuat dari B. Contoh: Kertas : Kayu.
- **Alat ke fungsi**, A digunakan untuk melakukan B. Contoh: Gunting : Memotong.
- **Profesi ke alat**, A menggunakan B. Contoh: Dokter : Stetoskop.
- **Profesi ke tempat**, A bekerja pada B. Contoh: Hakim : Pengadilan.
- **Objek ke tempat**, A ditempatkan atau disimpan pada B. Contoh: Pesawat : Hanggar.
- **Wadah ke isi**, A dapat menampung B. Contoh: Botol : Air.
- **Pelaku ke hasil**, A menghasilkan B. Contoh: Pengarang : Novel.
- **Ilmu ke objek kajian**, A mempelajari B. Contoh: Botani : Tumbuhan.
- **Instrumen ke objek pengamatan**, A digunakan mengamati B. Contoh: Mikroskop : Sel.
- **Instrumen ke besaran**, A mengukur B. Contoh: Termometer : Suhu.
- **Awal ke hasil perkembangan**, A berkembang menjadi B. Contoh: Benih : Tanaman.
- **Simbol ke makna**, A merepresentasikan B. Contoh: Merpati : Perdamaian.

Hafalkan bentuk kalimat hubungannya, bukan kata-katanya.

## Teknik Kalimat Penghubung

Jangan menggunakan hubungan yang terlalu longgar. Contoh: TERMOMETER : SUHU. Jangan hanya berpikir "termometer berhubungan dengan suhu". Buat kalimat yang lebih tepat: termometer merupakan instrumen untuk mengukur suhu.

Jika pilihan memiliki NERACA : MASSA, kalimatnya menjadi: neraca merupakan instrumen untuk mengukur massa. Strukturnya sama: instrumen ke besaran yang diukur.

## Teknik Substitusi

Ubah hubungan menjadi formula abstrak. Contoh: ARSITEK : BANGUNAN. Hubungannya: pelaku ke objek yang dirancang.

Dari pilihan Hakim : Pengadilan, Pengarang : Novel, Dokter : Rumah sakit, Guru : Sekolah, dan Polisi : Jalan, yang paling mendekati adalah Pengarang : Novel, dengan formula pelaku ke hasil karya.

Pasangan yang lebih identik lagi: ARSITEK : BANGUNAN = PENGARANG : NOVEL, dengan relasi pencipta ke hasil karya.

## Perhatikan Arah

Contoh: BENANG : KAIN, hubungannya bahan ke produk. Pasangan ini tidak setara dengan ROTI : TEPUNG, karena hubungannya produk ke bahan. Jenis hubungan berkaitan dengan bahan dan produk, tetapi arahnya terbalik.

## Jangan Terjebak Asosiasi

Contoh: HAKIM : PALU. Hubungan yang dimaksud dapat berupa profesi ke alat yang digunakan.

Maka HAKIM : PENGADILAN bukan pasangan dengan relasi yang sama, karena hubungannya profesi ke tempat kerja. Kata-katanya masih berada dalam tema yang sama, tetapi hubungan logisnya berbeda.

## Analogi Dua Lapis

Contoh: KUNCI : PINTU = PASSWORD : ...

- A. Komputer
- B. Akun
- C. Internet
- D. Keyboard
- E. Data

Jawaban: B. Akun. Kunci digunakan sebagai sarana untuk memperoleh akses fisik melalui pintu. Password digunakan sebagai kredensial untuk memperoleh akses terhadap akun. Hubungannya: sarana akses ke objek yang dilindungi.

## Analogi Tiga Unsur

Bentuknya: `A : B : C = D : E : F`. Contoh: PELUKIS : KUAS : KANVAS = PENULIS : PENA : KERTAS. Strukturnya pelaku ke alat ke media. Setiap unsur harus memiliki posisi hubungan yang sepadan.

## Empat Jebakan Utama

1. **Satu tema.** PILOT : KOKPIT tidak otomatis sama dengan DOKTER : OBAT. Pilot ke tempat kerja, dokter ke objek yang digunakan atau diberikan.
2. **Hubungan terlalu umum.** MATA : MELIHAT, hubungannya organ ke fungsi. Jangan memilih pasangan hanya karena mempunyai pola "benda melakukan sesuatu".
3. **Arah terbalik.** BENANG : KAIN berbeda dengan ROTI : TEPUNG. Yang satu bahan ke produk, yang lain produk ke bahan.
4. **Hubungan hampir sama.** TERMOMETER : SUHU lebih tepat dibaca instrumen ke besaran yang diukur, daripada sekadar alat ke sesuatu.

## Contoh Analogi

**Contoh 1.** EDITOR : NASKAH = KURATOR : ...

Jawaban: Koleksi. Editor bekerja terhadap naskah sebagai objek utama pekerjaannya. Kurator mengelola koleksi sebagai objek utama pekerjaannya. Polanya: profesi ke objek yang dikelola.

**Contoh 2.** BOTANI : TUMBUHAN = ZOOLOGI : ...

Jawaban: Hewan. Botani mempelajari tumbuhan. Zoologi mempelajari hewan. Polanya: cabang ilmu ke objek kajian.

**Contoh 3.** TERMOMETER : SUHU = NERACA : ...

Jawaban: Massa. Termometer digunakan untuk mengukur suhu. Neraca digunakan untuk mengukur massa. Polanya: instrumen ke besaran yang diukur.

## Rumus Cepat

Ketika melihat `A : B = ?`, lakukan langkah ini secara berurutan:

1. Hubungkan A ke B.
2. Buat kalimat hubungan.
3. Tentukan arah.
4. Tentukan tingkat kekhususan.
5. Uji pilihan satu per satu.

Mulai dari hubungan pada stem, bukan dari pilihan jawaban.''',
    "tiu-handbook-verbal-s04": '''## Prinsip Fundamental

Pada silogisme, jangan bertanya: "Apakah kesimpulan ini masuk akal?" Tanyakan: "Apakah kesimpulan tersebut harus benar jika seluruh premis dianggap benar?"

Kata kuncinya adalah PASTI. Kesimpulan yang hanya mungkin, sering terjadi, masuk akal, atau dapat terjadi, belum tentu merupakan kesimpulan logis.

## Implikasi

Bentuknya: `p -> q`, dibaca "Jika p, maka q". Contoh: Jika sistem aktif, indikator menyala. Di sini `p` adalah sistem aktif dan `q` adalah indikator menyala. Setiap p berada di dalam q.

## Modus Ponens

Formula: `p -> q`, `p`, maka `q`. Bentuk ini VALID.

Contoh: Jika peserta lolos verifikasi, peserta memperoleh kartu ujian. Peserta lolos verifikasi. Maka peserta memperoleh kartu ujian.

## Modus Tollens

Formula: `p -> q`, bukan `q`, maka bukan `p`. Bentuk ini VALID.

Contoh: Jika mesin beroperasi, indikator utama menyala. Indikator utama tidak menyala. Maka mesin tidak beroperasi.

## Dua Kesalahan Logika Utama

### A. Affirming the consequent

Contoh: Jika hujan, jalan basah. Jalan basah. Tidak dapat disimpulkan bahwa pasti hujan. Jalan mungkin basah karena sebab lain.

Bentuknya: `p -> q`, `q`, maka `p`. TIDAK VALID.

### B. Denying the antecedent

Contoh: Jika hujan, jalan basah. Tidak hujan. Tidak dapat disimpulkan bahwa jalan pasti tidak basah. Walau tidak hujan, jalan tetap bisa basah karena sebab lain.

Bentuknya: `p -> q`, bukan `p`, maka bukan `q`. TIDAK VALID.

Bandingkan keempatnya:

- `p -> q`, `p`, maka `q`. VALID.
- `p -> q`, bukan `q`, maka bukan `p`. VALID.
- `p -> q`, `q`, maka `p`. TIDAK VALID.
- `p -> q`, bukan `p`, maka bukan `q`. TIDAK VALID.

## Silogisme Hipotetis

Formula: `p -> q`, `q -> r`, maka `p -> r`. Pernyataan `q` menjadi jembatan yang menyambungkan `p` ke `r`.

Contoh: Jika peserta memahami konsep, peserta mampu mengenali pola. Jika peserta mampu mengenali pola, peserta dapat melakukan eliminasi dengan lebih efektif. Maka: jika peserta memahami konsep, peserta dapat melakukan eliminasi dengan lebih efektif.

## Rantai Panjang

Jika `A -> B`, `B -> C`, `C -> D`, maka `A -> D`.

Contoh: Lolos verifikasi ke memperoleh kartu ujian. Memperoleh kartu ujian ke dapat mengikuti tes. Mengikuti tes ke memperoleh hasil tes. Maka: lolos verifikasi ke dapat mengikuti tes ke memperoleh hasil tes.

Syarat penting: setiap premis harus mempunyai titik sambung logis. Jangan menyatukan dua pernyataan yang tidak mempunyai penghubung.

## Kontraposisi

Dari `p -> q` diperoleh bentuk ekuivalen: bukan `q` ke bukan `p`.

Contoh: Jika seseorang anggota kelompok X, maka ia memiliki kartu keanggotaan X. Maka: jika seseorang tidak memiliki kartu keanggotaan X, berdasarkan premis tersebut ia bukan anggota kelompok X.

Namun `q -> p` tidak otomatis benar.

## Kuantor

### A. Universal positif

Semua A adalah B, ditulis `A` subset `B`. Artinya seluruh anggota A termasuk dalam B.

### B. Universal negatif

Tidak satu pun A adalah B. Artinya A dan B tidak mempunyai anggota yang sama, atau irisan A dan B adalah himpunan kosong.

### C. Partikular positif

Sebagian A adalah B. Artinya terdapat minimal satu anggota yang merupakan A sekaligus B.

### D. Partikular negatif

Sebagian A bukan B. Artinya terdapat minimal satu anggota A yang tidak termasuk B.

## "Sebagian" Bukan "Hanya Sebagian"

Pernyataan: Sebagian pegawai mengikuti pelatihan. Artinya setidaknya terdapat satu pegawai yang mengikuti pelatihan. Pernyataan ini tidak otomatis berarti sebagian pegawai lainnya tidak mengikuti pelatihan.

Bisa saja seluruh pegawai mengikuti pelatihan, informasi itu tidak diberikan. Jangan menambahkan informasi yang tidak terdapat dalam premis.

## Rantai Kuantor

Premis:

1. Semua analis adalah pegawai.
2. Semua pegawai memiliki kartu identitas kantor.

Maka: Semua analis memiliki kartu identitas kantor. Secara himpunan: Analis subset Pegawai, Pegawai subset Pemilik Identitas, sehingga Analis subset Pemilik Identitas.

## Universal + Sebagian

Premis:

1. Semua A adalah B.
2. Sebagian A adalah C.

Karena setiap A termasuk B, maka anggota yang sekaligus A dan C juga termasuk B. Kesimpulan: Sebagian C adalah B.

## Dua Premis "Sebagian"

Premis: Sebagian A adalah B. Sebagian B adalah C. Tidak otomatis berarti sebagian A adalah C. Mengapa? Karena anggota B yang merupakan A dapat berbeda dengan anggota B yang merupakan C.

Contoh: Sebagian pegawai adalah atlet. Sebagian atlet adalah mahasiswa. Tidak dapat disimpulkan bahwa sebagian pegawai adalah mahasiswa.

## Negasi Kuantor

- Pernyataan "Semua A adalah B", negasinya: Sebagian A bukan B.
- Pernyataan "Sebagian A bukan B", negasinya: Semua A adalah B.
- Pernyataan "Tidak ada A yang B", negasinya: Sebagian A adalah B.
- Pernyataan "Sebagian A adalah B", negasinya: Tidak ada A yang B.

## Negasi Pernyataan Majemuk

- Konjungsi: negasi dari `p dan q` adalah `bukan p atau bukan q`.
- Disjungsi: negasi dari `p atau q` adalah `bukan p dan bukan q`.
- Implikasi: negasi dari `jika p maka q` adalah `p dan bukan q`.

Contoh negasi implikasi. Pernyataan: Jika Rani belajar, maka Rani lulus. Negasinya: Rani belajar dan Rani tidak lulus.

Ingat pola De Morgan: `dan` bertukar jadi `atau`, `p` bertukar jadi `bukan p`, dan implikasi berubah jadi `p dan bukan q`.

Catatan: dalam logika formal dasar, kata "atau" biasanya berarti OR inklusif, yaitu salah satu atau keduanya dapat benar, kecuali dinyatakan lain.

## Jangan Membalik Premis

Diketahui: Semua dokter adalah sarjana. Artinya Dokter subset Sarjana. Hal ini tidak berarti Sarjana subset Dokter. Jadi tidak dapat disimpulkan bahwa semua sarjana adalah dokter.''',
    "tiu-handbook-verbal-s05": '''## Hakikat Soal Analitis

Soal analitis umumnya mempunyai tiga unsur: objek, aturan, dan pertanyaan.

- **Objek:** A, B, C, D, E, dan seterusnya.
- **Aturan:** syarat dan batasan.
- **Pertanyaan:** pasti, mungkin, dan sebagainya.

Tugasmu adalah menemukan kondisi atau susunan yang memenuhi seluruh aturan secara bersamaan. Bukan menebak susunan yang terlihat masuk akal.

## Empat Langkah Utama

### Langkah 1: Simbolkan

Narasi panjang harus disederhanakan. Contoh: Andi lebih tinggi daripada Budi menjadi `A > B`. E tidak boleh berada di posisi pertama menjadi `E` bukan 1. C berada tepat setelah D menjadi blok `[DC]`.

Simbol mengurangi beban memori dan mempercepat deduksi.

### Langkah 2: Cari jangkar

Jangkar adalah aturan yang paling membatasi kemungkinan. Contoh: `A = 1` lebih kuat daripada `A < B`, karena `A = 1` langsung menetapkan satu posisi tertentu.

### Langkah 3: Gabungkan aturan

Jika `A < B` dan `B < C`, maka `A < B < C`. Jangan menyimpan tiga informasi sebagai fakta terpisah apabila dapat dibuat menjadi satu rantai.

### Langkah 4: Uji pilihan

Untuk pertanyaan "Manakah yang mungkin benar?", tidak selalu perlu mencari seluruh susunan. Cukup uji pilihan dan cari satu susunan valid yang membuat pilihan tersebut benar.

## Kata Kunci Pertanyaan

- **PASTI BENAR.** Pernyataan harus benar pada seluruh susunan valid. Satu counterexample cukup untuk menggugurkan sebuah pilihan.
- **MUNGKIN BENAR.** Pernyataan cukup benar pada minimal satu susunan valid.
- **TIDAK MUNGKIN BENAR.** Pernyataan tidak boleh terjadi pada susunan valid mana pun.
- **KECUALI.** Cari pilihan yang tidak memenuhi karakteristik yang dimiliki pilihan lainnya.

Jangan lupa membaca orientasi pertanyaan sebelum melakukan analisis.

## Model Urutan

Lima peserta: A, B, C, D, E. Aturan:

1. B sebelum C.
2. A setelah C.
3. D sebelum B.

Dapat digabungkan menjadi: `D < B < C < A`. E belum terikat aturan apa pun. Tanpa mencoba semua permutasi, kita sudah tahu:

- D pasti sebelum B, C, dan A.
- B pasti sebelum A.
- C pasti sebelum A.
- A tidak mungkin pertama.
- D tidak mungkin terakhir.

## Posisi Tepat dan Blok

Jika B tepat sebelum C, buat blok `[BC]` dan anggap sebagai satu kesatuan. Untuk lima posisi, blok `[BC]` dapat mulai di posisi 1, 2, 3, atau 4. Teknik blok jauh lebih efisien daripada menempatkan B dan C secara terpisah.

## Makna "Di Antara"

Jika soal menyatakan B berada di antara A dan C, maka urutan relatif yang mungkin adalah `A < B < C` atau `C < B < A`. B tidak otomatis harus berdampingan dengan A dan C. Susunan A, X, B, Y, C tetap sah karena ada objek lain di antaranya.

Jika soal menghendaki ketiganya berada berurutan tanpa objek lain di antaranya, harus terdapat keterangan tambahan seperti "B tepat di antara A dan C" atau ketentuan posisi lain yang ekuivalen. Ini merupakan perbedaan penting.

## Model Perbandingan

Diketahui: `R > P`, `P > T`, `S > R`, `T > Q`. Gabungkan menjadi: `S > R > P > T > Q`, dari tertinggi ke terendah.

- Tertinggi: S.
- Tepat di bawah P: T.
- Lebih tinggi daripada T tetapi lebih rendah daripada S: R atau P.

Selalu periksa apakah soal meminta satu jawaban pasti, satu kemungkinan, semua kemungkinan, atau hanya hubungan relatif.

## Model Kelompok

Enam orang A sampai F dibagi ke dalam dua kelompok. Aturan:

- A harus bersama B.
- C tidak boleh bersama D.
- E harus berbeda kelompok dengan A.

Simbolnya: `A = B`, `C` bukan `D`, `E` bukan `A`. Jika posisi kelompok A diketahui, posisi B dan E langsung terkunci: B ikut A, E berada di kelompok seberang.

C dan D terpisah, dan keduanya bisa bertukar kelompok. Kerjakan aturan yang menghasilkan konsekuensi paling banyak terlebih dahulu.

## Model Penjadwalan

Lima kegiatan P sampai T dijadwalkan Senin sampai Jumat. Aturan: P sebelum R. Q tepat satu hari setelah S. T bukan Senin. R dilaksanakan Jumat.

Urutan kerja:

1. Mulai dari aturan absolut: R = Jumat.
2. Kemudian buat blok: `[SQ]`.
3. Kemudian: T bukan Senin.
4. Dan: P sebelum R.

Blok `[SQ]` bergeser bersama, dan tidak dapat memakai Jumat karena sudah ditempati R. P berada di mana pun sebelum Jumat. Barulah susunan diuji.

## Model Tabel Kondisi

Tiga pegawai: Alya, Bima, Citra, masing-masing menangani satu tugas: Arsip, Data, Layanan. Diketahui:

1. Bima menangani Arsip.
2. Alya tidak menangani Data.
3. Setiap orang menangani tugas berbeda.

Buat tabel silang dan coret kombinasi yang mustahil. Bima sudah pasti Arsip. Alya tidak boleh Data dan tidak boleh Arsip karena sudah dipegang Bima, jadi Alya menangani Layanan. Sisa satu tugas untuk Citra.

Maka: Alya = Layanan, Bima = Arsip, Citra = Data.

## Deduksi Sebelum Permutasi

Lima objek dapat mempunyai `5! = 120` susunan. Karena itu, jangan langsung membuat seluruh kemungkinan.

Urutan kerja yang efektif: gunakan aturan absolut, buat blok, buat rantai, perhatikan larangan, lalu uji pilihan. Constraint first, bukan permutation first.

## Prioritas Aturan

Contoh: `A = 3` lebih membatasi daripada `A` bukan 5. Yang pertama menyisakan 1 kemungkinan, yang kedua masih menyisakan 4 kemungkinan.

Prioritas umum: posisi pasti, tepat sebelum atau sesudah, blok, urutan relatif, larangan posisi. Namun prioritas sebenarnya tetap bergantung pada seberapa besar aturan tersebut mengurangi kemungkinan.

## Contoh Analitis Lanjut

Enam peserta A, B, C, D, E, F duduk pada posisi 1 sampai 6. Diketahui:

1. C tepat setelah A.
2. D sebelum A.
3. B bukan posisi pertama atau keenam.
4. F setelah C.
5. E sebelum B.

Bentuk blok: `[AC]`. Dari aturan lain: `D < A < C < F` dan `E < B`.

Tanpa membuat seluruh susunan, dapat diperoleh deduksi posisi ini:

- D hanya bisa di posisi 1, 2, atau 3.
- A hanya bisa di posisi 2, 3, atau 4.
- C hanya bisa di posisi 3, 4, atau 5.
- F pasti di posisi 6.
- B hanya bisa di posisi 2, 3, atau 5.
- E hanya bisa di posisi 1, 2, atau 4.

Mengapa F pasti di posisi 6? Posisi 6 tidak mungkin ditempati B (aturan 3), tidak mungkin ditempati E (E harus sebelum B, jadi E paling jauh di posisi 4), dan tidak mungkin ditempati D, A, atau C (F harus setelah C). Jadi F pasti di posisi 6.

Satu susunan yang valid: D = 1, A = 2, C = 3, E = 4, B = 5, F = 6. Dari 720 permutasi (`6!`), hanya 6 susunan yang memenuhi seluruh aturan.

Inti analitis: temukan konsekuensi logis sebelum mencoba menyusun semua objek.''',
    "tiu-handbook-verbal-s06": '''Teknik eliminasi adalah cara menggugurkan pilihan yang salah tanpa harus menyelesaikan seluruh soal. Caranya berbeda untuk tiap jenis pertanyaan.

## 1. Pasti Benar

Cari opsi yang tidak dapat dibantah oleh susunan valid. Untuk menggugurkan sebuah pilihan, cukup temukan satu counterexample: satu susunan valid yang membuat pilihan tersebut salah sudah cukup menggugurkannya.

## 2. Mungkin Benar

Tidak perlu membuktikan semua susunan. Cukup temukan satu susunan valid yang membuat pernyataan pada pilihan tersebut benar.

## 3. Tidak Mungkin Benar

Cari kontradiksi. Suatu opsi gugur jika menyebabkan salah satu hal ini:

- Dua objek menempati posisi yang sama.
- Blok terpisah.
- Urutan terbalik.
- Posisi terlarang ditempati.
- Jumlah anggota kelompok salah.
- Atau salah satu aturan tidak terpenuhi.''',
    "tiu-handbook-verbal-s07": '''Tandai kesalahan yang paling sering kamu lakukan, lalu ulangi latihan pada pola tersebut.

## Analogi

- **Kesalahan:** memilih analogi karena topiknya sama. **Akibat:** hubungan sebenarnya berbeda.
- **Kesalahan:** mengabaikan arah analogi. **Akibat:** relasi terbalik dianggap benar.
- **Kesalahan:** menggunakan hubungan terlalu umum. **Akibat:** beberapa pilihan terlihat benar.

## Silogisme

- **Kesalahan:** membalik "semua A adalah B". **Akibat:** kesimpulan silogisme salah.
- **Kesalahan:** menganggap `q -> p` dari `p -> q`. **Akibat:** affirming the consequent.
- **Kesalahan:** menganggap bukan `p` ke bukan `q`. **Akibat:** denying the antecedent.
- **Kesalahan:** menganggap "sebagian" berarti "tidak semua". **Akibat:** menambahkan informasi yang tidak ada di premis.
- **Kesalahan:** menyatukan dua premis "sebagian". **Akibat:** membentuk irisan yang belum tentu ada.

## Analitis

- **Kesalahan:** menganggap "di antara" berarti berdampingan. **Akibat:** susunan analitis salah.
- **Kesalahan:** mengabaikan kata "tepat". **Akibat:** blok posisi rusak.
- **Kesalahan:** membuat semua permutasi sejak awal. **Akibat:** boros waktu.

## Umum

- **Kesalahan:** salah membaca "kecuali". **Akibat:** orientasi jawaban terbalik.
- **Kesalahan:** mengandalkan intuisi. **Akibat:** mudah terkena distraktor.''',
    "tiu-handbook-verbal-s08": '''Sistem cepat ini adalah urutan pertanyaan yang kamu ajukan pada diri sendiri sebelum memilih jawaban. Hafalkan urutannya sampai otomatis.

## Analogi

1. **Hubungan apa?** Tentukan hubungan antara kedua kata pada stem.
2. **Arah mana?** Pastikan arah hubungan tidak terbalik.
3. **Sespesifik apa?** Rumuskan hubungan setepat mungkin, bukan sekadar "berhubungan".
4. **Pasangan mana yang identik?** Cari pilihan dengan jenis, arah, dan kekhususan hubungan yang sama.

## Silogisme

1. **Premis.** Baca dan pahami seluruh premis.
2. **Simbol.** Ubah premis menjadi simbol agar mudah dihubungkan.
3. **Hubungkan.** Sambungkan premis yang punya titik temu.
4. **Apa yang pasti?** Pilih kesimpulan yang wajib benar, bukan yang hanya mungkin.

## Analitis

1. **Simbolkan.** Ubah narasi menjadi simbol, blok, dan rantai.
2. **Cari jangkar.** Mulai dari aturan yang paling membatasi.
3. **Buat blok atau rantai.** Gabungkan aturan yang saling terkait.
4. **Deduksi.** Tarik konsekuensi logis sebelum mencoba susunan.
5. **Uji pilihan.** Periksa tiap pilihan terhadap seluruh aturan.''',
    "tiu-handbook-verbal-s10": '''Jalankan checklist ini sebelum memilih jawaban. Satu pertanyaan yang terlewat bisa berarti satu soal meleset.

## Analogi

- Sudahkah hubungan utama ditentukan?
- Apakah arah hubungan sama?
- Apakah tingkat kekhususannya sama?
- Apakah pilihan dipilih berdasarkan hubungan, bukan tema?
- Apakah terdapat pilihan yang hanya "terlihat berkaitan"?

## Silogisme

- Apakah kesimpulan pasti benar?
- Apakah implikasi dibalik?
- Apakah terjadi affirming the consequent?
- Apakah terjadi denying the antecedent?
- Apakah kuantor berubah?
- Apakah ada informasi baru yang tidak terdapat dalam premis?

## Analitis

- Apakah seluruh aturan sudah disimbolkan?
- Mana aturan paling membatasi?
- Apakah terdapat posisi absolut?
- Apakah terdapat blok?
- Apakah terdapat rantai?
- Apakah "di antara" atau "tepat di antara" sudah dibedakan?
- Apakah soal meminta pasti, mungkin, tidak mungkin, atau kecuali?
- Apakah pilihan telah diuji terhadap seluruh syarat?''',
    "tiu-handbook-verbal-s11": '''## Analogi

Hubungan lebih penting daripada tema. Periksa tiga hal: jenis, arah, kekhususan.

Buat satu kalimat: A berhubungan dengan B sebagaimana C berhubungan dengan D.

## Silogisme

Bentuk yang VALID:

- Modus ponens: `p -> q`, `p`, maka `q`.
- Modus tollens: `p -> q`, bukan `q`, maka bukan `p`.
- Silogisme hipotetis: `p -> q`, `q -> r`, maka `p -> r`.

Bentuk yang TIDAK VALID:

- `p -> q`, `q`, maka `p`.
- `p -> q`, bukan `p`, maka bukan `q`.

## Kuantor

- Semua A adalah B berarti A subset B. Hal ini tidak berarti B subset A.
- Sebagian A adalah B berarti minimal satu A merupakan B. Bukan berarti hanya sebagian A merupakan B.
- Negasi "Semua A adalah B" adalah "Sebagian A bukan B".
- Negasi "Tidak ada A yang B" adalah "Sebagian A adalah B".

## Analitis

Urutan kerja: simbol, jangkar, blok atau rantai, deduksi, uji, eliminasi.

- **Pasti.** Benar pada semua kemungkinan valid.
- **Mungkin.** Benar pada minimal satu kemungkinan valid.
- **Tidak mungkin.** Tidak benar pada satu pun kemungkinan valid.''',
    "tiu-handbook-verbal-s12": '''Materi sebaiknya dipelajari dengan porsi seimbang. Tujuannya bukan menghafal ratusan pola soal. Tujuannya adalah membuatmu mampu mengenali struktur persoalan secara otomatis.

## Pembagian Porsi

- **Konsep inti:** 20%.
- **Teknik penyelesaian:** 20%.
- **Pola dan jebakan:** 20%.
- **Contoh bertingkat:** 20%.
- **Soal HOTS:** 20%.

## Alur Belajar

Ikuti urutan ini: konsep, pola, jebakan, contoh, drill, review. Kuasai satu tahap sebelum pindah ke tahap berikutnya, dan ulangi dari awal saat menemukan pola yang masih salah.''',
    "tiu-handbook-verbal-s13": '''## Tiga Pertanyaan yang Benar

### Analogi

Jangan bertanya: "Kata mana yang paling berhubungan?" Tanyakan: "Pasangan mana yang memiliki jenis, arah, dan tingkat hubungan yang sama?"

### Silogisme

Jangan bertanya: "Kesimpulan mana yang masuk akal?" Tanyakan: "Kesimpulan mana yang wajib benar berdasarkan premis?"

### Analitis

Jangan bertanya: "Susunan mana yang kelihatannya cocok?" Tanyakan: "Susunan mana yang memenuhi seluruh kondisi tanpa satu pun pelanggaran?"

## Formula Final

- **Analogi:** hubungan, arah, kekhususan, substitusi.
- **Silogisme:** premis, simbol, deduksi, kesimpulan pasti.
- **Analitis:** aturan, jangkar, blok atau rantai, deduksi, eliminasi.

## Catatan Penutup

TIU verbal bukan tes untuk mencari peserta yang paling banyak menghafal istilah. TIU verbal menguji apakah kamu dapat:

- Menemukan hubungan secara presisi.
- Membedakan kesimpulan pasti dari asumsi.
- Mengubah informasi panjang menjadi struktur sederhana.
- Mengeliminasi informasi yang tidak relevan.
- Bekerja secara logis di bawah keterbatasan waktu.

Karena itu, prinsip belajar yang paling penting adalah: jangan menghafal jawaban. Kuasai struktur berpikir di balik jawabannya.''',
    "tiu-hitung-cepat-s02": '''## Jenis-Jenis Bilangan

- **Asli.** Bilangan bulat positif tanpa angka nol: 1, 2, 3, 4, dan seterusnya.
- **Cacah.** Bilangan bulat positif ditambah angka nol: 0, 1, 2, 3, dan seterusnya.
- **Bulat.** Bilangan negatif, angka nol, dan bilangan positif: ..., -2, -1, 0, 1, 2, ...
- **Prima.** Bilangan yang hanya memiliki faktor 1 dan bilangan itu sendiri: 2, 3, 5, 7, dan seterusnya. Angka 1 bukan bilangan prima.
- **Rasional.** Bilangan yang dapat ditulis sebagai pecahan `a/b` dengan `b` bukan nol. Contoh: 3/4, 1/2, 5/6, 7/8.
- **Irasional.** Bilangan yang tidak dapat ditulis sebagai pecahan. Contoh: akar 2, akar 3, akar 5, akar 7, dan seterusnya.
- **Pecahan.** Bilangan rasional yang dapat ditulis sebagai pecahan biasa, pecahan campuran, desimal, dan persen. Contoh: 1/2 = 0,5 = 50%.

## A. Sifat-Sifat Bilangan

Sifat-sifat pada penjumlahan dan pengurangan:

### 1. Komutatif (Pertukaran)

`a + b = b + a`

Sifat komutatif berlaku untuk penjumlahan dan perkalian. Sifat ini tidak berlaku untuk pengurangan dan pembagian.''',
    "tiu-hitung-cepat-s03": '''## 2. Asosiatif (Pengelompokan)

`(a + b) + c = a + (b + c)`

## 3. Identitas

`a + 0 = 0 + a = a`

## 4. Tertutup

Bila `a` dan `b` merupakan bilangan bulat, maka `a + b` juga bilangan bulat.

## Penjumlahan dan Pengurangan Bilangan Bertanda

- `a + (-b) = a - b`
- `-a + (-b) = -(a + b)`
- `a - (-b) = a + b`

## Sifat-Sifat pada Pembagian

1. Bilangan yang dibagi 1 hasilnya adalah bilangan itu sendiri: `a : 1 = a`.
2. Bilangan yang dibagi dengan bilangan itu sendiri hasilnya adalah 1: `a : a = 1`, dengan `a` bukan nol.
3. Bilangan 0 dibagi dengan bilangan apa saja hasilnya adalah 0: `0 : a = 0`, dengan `a` bukan nol.
4. Bilangan apa saja dibagi dengan 0 hasilnya tidak terdefinisi: `a : 0` tidak terdefinisi.

## Sifat-Sifat pada Perkalian

1. Bilangan yang dikali 1 hasilnya adalah bilangan itu sendiri: `a x 1 = a`.
2. Bilangan yang dikali dengan bilangan itu sendiri hasilnya adalah pangkat 2 bilangan itu sendiri: `a x a = a` kuadrat.
3. Bilangan 0 dikali dengan bilangan apa saja hasilnya adalah 0: `a x 0 = 0`.

## Aturan Tanda

Dalam perkalian dan pembagian juga berlaku:

- `a x (-b) = -ab`
- `(-a) x b = -ab`
- `(-a) x (-b) = ab`
- `a : (-b) = -(a/b)`
- `(-a) : b = -(a/b)`
- `(-a) : (-b) = a/b`

Ringkasan aturan tanda: positif kali positif sama dengan positif, positif kali negatif sama dengan negatif, negatif kali positif sama dengan negatif, negatif kali negatif sama dengan positif. Aturan yang sama berlaku untuk pembagian.

## Contoh Soal

**1. Hitunglah penjumlahan dan pengurangan berikut ini!**

- a. `-2 + -5 = -(2 + 5) = -7`
- b. `8 - (-4) = 8 + 4 = 12`
- c. `-6 - (-9) = -6 + 9 = 3`

**2. Hitunglah perkalian pecahan campuran berikut ini!**

`1 1/2 x 2 1/4`

Jawab: jadikan kedua pecahan campuran menjadi pecahan biasa, lalu kalikan pembilang dengan pembilang dan penyebut dengan penyebut.

`1 1/2 x 2 1/4 = 3/2 x 9/4 = 27/8 = 3 3/8`

**3. Hitunglah pembagian pecahan campuran berikut ini!**

`2 1/2 : 1 1/4`

Jawab: ubah tanda bagi menjadi tanda kali disertai bertukarnya posisi penyebut dan pembilang pada pecahan kedua, lalu kalikan pembilang dengan pembilang dan penyebut dengan penyebut.

`2 1/2 : 1 1/4 = 5/2 : 5/4 = 5/2 x 4/5 = 20/10 = 2`''',
    "tiu-hitung-cepat-s04": '''Dalam menyelesaikan operasi campuran pada bilangan bulat yang terdiri dari penjumlahan, pengurangan, perkalian, dan pembagian, aturan yang berlaku adalah sebagai berikut:

1. Operasi penjumlahan dan pengurangan sama kuatnya.
2. Operasi perkalian dan pembagian sama kuatnya.
3. Operasi perkalian dan pembagian memiliki kedudukan yang lebih kuat daripada operasi penjumlahan dan pengurangan. Karena itu, dahulukan perkalian dan pembagian, kemudian penjumlahan dan pengurangan.
4. Jika terdapat operasi campuran yang disertai tanda kurung, kerjakan yang berada di dalam kurung terlebih dahulu, kemudian ikuti kembali aturan ke-3.

## Contoh Soal

**1. Hitunglah operasi campuran berikut ini!**

- a. `(-100) x 8 : 25 = (-800) : 25 = -32`
- b. `150 + (-110) x 9 : 11 : 10 + 89 = 150 + (-990) : 11 : 10 + 89 = 150 + (-90) : 10 + 89 = 150 + (-9) + 89 = 230`
- c. `(6 : 2) + (9 x -4) - (-2) = 3 + (-36) + 2 = -31`

**2. Pada siang hari suhu di sebuah daerah dapat mencapai 35 derajat Celsius, sementara suhu pada malam hari 11 derajat lebih rendah. Berapa suhu udara di daerah tersebut pada malam hari?**

Jawab: suhu pada siang hari 35 derajat Celsius. Suhu pada malam hari 11 derajat lebih rendah dari suhu pada siang hari. Jadi suhu pada malam hari = 35 - 11 = 24 derajat Celsius.

**3. Perbedaan suhu Semarang dan Dieng**

Di kota Semarang, Jawa Tengah, suhu rata-rata pada siang hari dapat mencapai 24 derajat Celsius. Sementara itu, dataran tinggi Dieng yang juga berada di Jawa Tengah suhu rata-ratanya pada siang hari -1 derajat Celsius.

Berapa perbedaan suhu kedua daerah tersebut?

Jawab: cari selisih suhu keduanya, suhu yang tinggi dikurangi suhu yang rendah. Suhu di Kota Semarang 24 derajat Celsius. Suhu di Dieng -1 derajat Celsius. Maka selisih suhu kedua daerah tersebut adalah `24 - (-1) = 25` derajat Celsius.''',
    "tiu-hitung-cepat-s05": '''Pecahan istimewa adalah pecahan yang sering digunakan dalam soal. Hafalkan nilai desimal dan persennya agar hitungan menjadi lebih cepat.

![Lingkaran dibagi tiga bagian sama besar: satu bagian diarsir berarti 1/3, dua bagian diarsir berarti 2/3](gambar:pecahan)

## Nilai Desimal dan Persen yang Sering Muncul

| Pecahan | Desimal | Persen |
|---|---|---:|
| 1/2 | 0,5 | 50% |
| 1/3 | 0,333 | 33,3% |
| 2/3 | 0,667 | 66,7% |
| 1/4 | 0,25 | 25% |
| 2/4 | 0,5 | 50% |
| 3/4 | 0,75 | 75% |
| 1/5 | 0,2 | 20% |
| 2/5 | 0,4 | 40% |
| 3/5 | 0,6 | 60% |
| 4/5 | 0,8 | 80% |
| 1/6 | 0,167 | 16,7% |
| 2/6 | 0,333 | 33,3% |
| 3/6 | 0,5 | 50% |
| 4/6 | 0,667 | 66,7% |
| 5/6 | 0,833 | 83,3% |
| 1/7 | 0,143 | 14,3% |
| 2/7 | 0,286 | 28,6% |
| 3/7 | 0,429 | 42,9% |
| 4/7 | 0,571 | 57,1% |
| 5/7 | 0,714 | 71,4% |
| 6/7 | 0,857 | 85,7% |
| 1/8 | 0,125 | 12,5% |
| 2/8 | 0,25 | 25% |
| 3/8 | 0,375 | 37,5% |
| 4/8 | 0,5 | 50% |
| 5/8 | 0,625 | 62,5% |
| 6/8 | 0,75 | 75% |
| 7/8 | 0,875 | 87,5% |
| 1/9 | 0,111 | 11,1% |
| 2/9 | 0,222 | 22,2% |
| 3/9 | 0,333 | 33,3% |
| 4/9 | 0,444 | 44,4% |
| 5/9 | 0,556 | 55,6% |
| 6/9 | 0,667 | 66,7% |
| 7/9 | 0,778 | 77,8% |
| 8/9 | 0,889 | 88,9% |
| 1/10 | 0,1 | 10% |
| 2/10 | 0,2 | 20% |
| 3/10 | 0,3 | 30% |
| 4/10 | 0,4 | 40% |
| 5/10 | 0,5 | 50% |
| 6/10 | 0,6 | 60% |
| 7/10 | 0,7 | 70% |
| 8/10 | 0,8 | 80% |
| 9/10 | 0,9 | 90% |

Catatan: nilai pecahan berpenyebut 3, 6, 7, dan 9 sebenarnya berulang tak berujung, angka di atas dibulatkan ke 3 desimal.

## Penjumlahan dan Pengurangan Pecahan

Hal-hal yang perlu diperhatikan dalam penjumlahan dan pengurangan pecahan:

1. Untuk pecahan biasa, samakan penyebut terlebih dahulu menggunakan KPK.
2. Untuk pecahan desimal, urutkan komanya terlebih dahulu sebelum menjumlahkan atau menguranginya.
3. Untuk pecahan campuran, ubah bentuknya ke pecahan biasa terlebih dahulu lalu samakan penyebutnya.

Contoh: `1/4 + 1/6 = 3/12 + 2/12 = 5/12`. KPK dari 4 dan 6 adalah 12.

## Contoh Soal

**1. Ubahlah pecahan 13/4 menjadi pecahan campuran!**

Jawab: `13 : 4 = 3` sisa 1, jadi `13/4 = 3 1/4`. Angka 3 adalah hasil bagi, 1 adalah sisa pembagian, dan 4 adalah penyebut.''',
    "tiu-hitung-cepat-s06": '''## 2. Ubahlah pecahan 5 1/6 menjadi pecahan biasa!

Jawab: `5 1/6 = ((5 x 6) + 1)/6 = 31/6`.

## 3. Urutkan pecahan berikut mulai dari yang terbesar: 2 3/4, 4/5, 50%, dan 0,833!

Jawab: untuk mengurutkan pecahan tersebut, langkah pertama adalah menyamakan bentuknya, misalnya menjadikan seluruh pecahan ke dalam bentuk desimal.

- `2 3/4 = 2,75`
- `4/5 = 0,8`
- `50% = 0,5`
- `0,833` tetap.

Urutan dari yang terbesar adalah: 2 3/4, 0,833, 4/5, 50%.''',
    "tiu-hitung-cepat-s07": '''## Pangkat

Pangkat berfungsi untuk menyederhanakan penulisan. `a` pangkat `n` sama dengan `a x a x a x ... x a` sebanyak `n` kali. Keterangan: `a` adalah bilangan pokok, `n` adalah pangkat.

Ada dua jenis bilangan berpangkat: bilangan berpangkat bulat positif dan bilangan berpangkat bulat negatif.

### Bilangan berpangkat bulat positif memiliki sifat:

1. `a pangkat m x a pangkat n = a pangkat (m + n)`
2. `a pangkat m : a pangkat n = a pangkat (m - n)`
3. `(a pangkat m) pangkat n = a pangkat (m x n)`
4. `(a x b) pangkat m = a pangkat m x b pangkat m`
5. `(a/b) pangkat m = a pangkat m / b pangkat m`, dengan `b` bukan nol.

### Bilangan berpangkat bulat negatif memiliki sifat:

`a pangkat (-n) = 1 / a pangkat n` dan `a pangkat n = 1 / a pangkat (-n)`.

## Contoh Soal Pangkat

**1. Tentukan hasil dari 2 pangkat 3 dikali 2 pangkat 4!**

Jawab: `2 pangkat 3 x 2 pangkat 4 = 2 pangkat (3 + 4) = 2 pangkat 7 = 2 x 2 x 2 x 2 x 2 x 2 x 2 = 128`.

**2. Jika 10 pangkat n = 2, tentukan nilai dari 10 pangkat 2n dikali 9!**

Jawab: `10 pangkat 2n x 9 = (10 pangkat n) pangkat 2 x 9 = 2 pangkat 2 x 9 = 4 x 9 = 36`.

**3. Jika 2 pangkat (-n) = 1/64, tentukan nilai n!**

Jawab: `2 pangkat (-n) = 1 / 2 pangkat n`, jadi `1 / 2 pangkat n = 1/64`, maka `2 pangkat n = 64 = 2 pangkat 6`, jadi `n = 6`.

## Akar Pangkat

Akar pangkat dua adalah nilai suatu bilangan yang berpangkat 1/2. Sementara akar pangkat tiga adalah nilai suatu bilangan yang berpangkat 1/3. Adapun sifat-sifat akar adalah sebagai berikut:

- Akar pangkat `n` dari `a` sama dengan `a` pangkat `1/n`.
- Akar pangkat `n` dari `a` pangkat `m` sama dengan `a` pangkat `m/n`.
- Akar pangkat `n` dari `a` dikali akar pangkat `n` dari `b` sama dengan akar pangkat `n` dari `a x b`.
- Akar pangkat `n` dari `a` dibagi akar pangkat `n` dari `b` sama dengan akar pangkat `n` dari `a/b`.
- Akar pangkat `n` dari `a`, dipangkatkan `m`, sama dengan akar pangkat `n` dari `a` pangkat `m`.

## Contoh Soal Akar

**1. Jika akar a ditambah akar b = 9 dan akar a dikurangi akar b = 8, tentukan nilai a - b!**

Jawab: `a - b = (akar a + akar b) x (akar a - akar b) = 9 x 8 = 72`.

**2. Nilai x = (2 pangkat 2 x 2 pangkat 3 x 2 pangkat 5) pangkat 1/2 dan y = akar pangkat tiga dari 8 pangkat 2. Tentukan hubungan x dan y!**

Jawab: `x = (2 pangkat (2 + 3 + 5)) pangkat 1/2 = (2 pangkat 10) pangkat 1/2 = 2 pangkat 5 = 32`. `y = 8 pangkat 2/3 = (2 pangkat 3) pangkat 2/3 = 2 pangkat 2 = 4`. Jadi `x = 8y`.''',
    "tiu-hitung-cepat-s08": '''Satuan adalah unit yang digunakan sebagai nilai standar bagi pembanding alat ukur.

Ada satuan yang digunakan untuk satu dimensi seperti panjang, massa, dan waktu. Ada satuan yang digunakan untuk dua dimensi seperti luas, dan ada satuan yang digunakan untuk tiga dimensi seperti volume.

Prinsip utamanya: dua nilai atau lebih baru dapat dijumlahkan, dikurangkan, atau dibandingkan jika satuannya sudah sama.

## Kesetaraan yang Sering Dipakai

- Panjang: 1 km = 1.000 m; 1 m = 100 cm; 1 cm = 10 mm.
- Massa: 1 kg = 1.000 g; 1 ton = 1.000 kg.
- Volume: 1 liter = 1.000 mL; 1 m kubik = 1.000 liter.
- Waktu: 1 jam = 60 menit = 3.600 detik; 1 menit = 60 detik.

Tangga satuan panjang, massa, luas, dan volume dibahas di bagian berikutnya.''',
    "tiu-hitung-cepat-s09": '''Saat mengubah satuan luas, tiap turun satu anak tangga dikali 100 dan tiap naik satu anak tangga dibagi 100. Untuk satuan volume, tiap anak tangga dikali atau dibagi 1.000.

## Contoh Soal

**1. Panjang papan tulis adalah 1,75 m. Lebar papan tulis adalah 1 m. Tuliskan luas papan tulis!**

Jawab: `L = p x l = 1,75 m x 1 m = 1,75 m` persegi.

**2. Sebuah lapangan dengan panjang 20 m dan lebar 15 m. Tentukan luas lapangan dalam satuan cm persegi!**

Jawab: `L = p x l = 20 m x 15 m = 300 m` persegi. Dari m persegi ke cm persegi perlu menuruni 2 buah anak tangga. Jika menuruni sebuah anak tangga dikali 100, maka dua anak tangga dikali 10.000. `300 m persegi = 300 x 10.000 = 3.000.000 cm` persegi.''',
    "tiu-modul-s01": '''## Ringkasan Materi Tes Inteligensia Umum (TIU)

Tes Inteligensia Umum digunakan untuk mengukur kemampuan peserta tes CPNS dalam hal yang berkaitan dengan penalaran verbal, kuantitatif, logika, dan analisis.

Kemampuan ini berguna dalam menghadapi dunia pelayanan publik di berbagai instansi pemerintahan seperti kementerian, lembaga nasional, maupun pemerintah daerah.

Kemampuan ini dipakai saat memecahkan masalah dan mengambil keputusan atau kebijakan di instansi tersebut.

Diharapkan keputusan atau kebijakan yang diambil berdasarkan suatu pertimbangan atau penalaran yang logis dan masuk akal. Oleh karena itu, kemampuan ini dapat dilatih dengan mengerjakan soal Tes Inteligensia Umum yang terdiri dari:

1. Penalaran verbal atau kebahasaan.
2. Penalaran nonverbal, angka, numerik, atau kuantitatif.
3. Penalaran logis dan analitis.

## Penalaran Verbal/Kebahasaan

Penalaran verbal terdiri atas sinonim (persamaan kata), antonim (lawan kata), dan analogi (korelasi makna atau padanan kata). TIU pada bagian ini bertujuan mengukur pemahaman seseorang terhadap kata.

Oleh karena itu, kamu dituntut untuk menguasai kata (kosakata) sebaik mungkin, karena pada bagian ini terkadang kamu diminta untuk menentukan kata yang mempunyai arti yang paling dekat atau paling berlawanan dengan yang diberikan.

Dengan kata lain, melalui tes ini, perbendaharaan kata seseorang dapat diketahui.

## Tips

1. Biasakan dan gunakanlah Kamus Besar Bahasa Indonesia (KBBI). Saat ini telah tersedia Kamus Besar Bahasa Indonesia (KBBI) online maupun offline.
2. Tambah perbendaharaan kata setiap harinya dengan membaca berita dari media cetak atau mendengarkannya melalui media elektronik, kemudian cari tahu makna atau definisi katanya melalui Kamus Besar Bahasa Indonesia (KBBI).

**Trik:** perhatikanlah pola soal dan pola jawaban. Dengan demikian, kamu akan semakin terlatih dan mahir menjawab dengan tepat.''',
    "tiu-modul-s02": '''Tes sinonim menguji kemampuanmu menentukan persamaan kata, yaitu mencari satu kata yang maknanya paling dekat dengan kata yang ditanyakan di soal.

Kuncinya adalah perbendaharaan kata yang luas, karena banyak kata di soal yang jarang dipakai sehari-hari.

## Tips memperkaya kosakata

1. **Perbanyak membaca.** Baca kamus, artikel berita, dan bacaan lain. Semakin sering ketemu kata baru, semakin mudah mengenalinya di soal.
2. **Perbanyak mendengarkan berita.** Istilah yang sering muncul di berita, seperti kata serapan, istilah teknik, kedokteran, sains, dan pertanian, sering keluar di tes sinonim.
3. **Gunakan kamus.** Begitu ketemu kata yang tidak kamu pahami, langsung cari artinya di kamus bahasa Indonesia atau kamus bahasa Inggris-Indonesia.

## Trik mengerjakan soal

1. **Jangan memilih kata yang bunyinya mirip dengan soal.** Jawaban yang bunyinya mirip biasanya hanya jebakan, meski tidak selalu salah.
2. **Pakai kalimat umum.** Kalau kamu tidak mengenal kata di soal, coba masukkan kata itu ke dalam kalimat yang paling umum, lalu ganti dengan pilihan jawaban yang ada. Pilihan yang membuat kalimat tetap masuk akal kemungkinan besar benar.
3. **Kembalikan ke bahasa aslinya.** Untuk kata serapan yang tidak kamu pahami, kembalikan ke bahasa asalnya (biasanya bahasa Inggris), lalu cari artinya di kamus.
4. **Kelola waktu dengan baik.** Kerjakan dengan cepat, tepat, dan teliti. Jangan menghabiskan waktu hanya untuk satu soal karena penasaran.

## Contoh soal

Dispensasi : ...

Jawab: **pengecualian**. Dispensasi artinya pembebasan dari suatu aturan atau kewajiban, jadi sinonimnya adalah pengecualian.''',
    "tiu-modul-s03": '''## A. Pelarangan

Pelarangan berarti larangan, yaitu tindakan melarang atau tidak memperbolehkan sesuatu.

Kata-kata yang berkaitan dengan pelarangan:

- **Pencegahan.** Sejalan dengan pelarangan, yaitu mencegah sesuatu terjadi.
- **Perizinan.** Berlawanan dengan pelarangan, yaitu memperbolehkan sesuatu.
- **Kelonggaran.** Berlawanan dengan pelarangan, yaitu memberi kelonggaran atau tidak seketat larangan.
- **Hadiah.** Tidak ada hubungannya dengan pelarangan.

## Trik: Kembalikan ke Bahasa Aslinya

Untuk kata serapan yang artinya belum dikenal, kembalikan kata tersebut ke bahasa aslinya. Contoh: kata mortalitas diserap ke dalam Bahasa Indonesia. Bahasa Inggris dari mortalitas adalah mortality, yang artinya angka kematian.''',
    "tiu-modul-s04": '''Daftar kata berikut bisa kamu pelajari sebagai acuan kosakata sinonim. Hafalkan kata yang belum kamu kenal, lalu coba pakai dalam kalimat supaya lebih mudah diingat.

## Daftar sinonim huruf A

- Absolut : mutlak
- Absorpsi : penyerapan
- Absah : sah
- Absen : bolos
- Abolisi : penghapusan
- Abonemen : berlangganan
- Abrasi : pengikisan
- Acuan : rujukan
- Adagium : pepatah, peribahasa
- Adaptasi : penyesuaian
- Ad interim : sementara
- Adiktif : bersifat candu
- Afeksi : kasih sayang
- Afinitas : kedekatan, ketertarikan
- Afirmasi : penegasan
- Agitasi : ajakan, persuasi
- Agraria : pertanahan
- Agresi : serangan
- Agunan : jaminan
- Ajun : ajudan, asisten
- Akreditasi : pengakuan
- Akselerasi : percepatan
- Akseptor : penerima
- Aktual : nyata, terkini
- Akurasi : ketelitian
- Akurat : tepat, jitu
- Alegori : kias
- Algoritma : prosedur pemecahan masalah
- Aliansi : asosiasi, persekutuan
- Alternatif : cara lain
- Amatir : pemula
- Ambigu : bermakna ganda
- Ambiguitas : ketidakjelasan
- Ambisi : hasrat, keinginan kuat
- Andal : terpercaya
- Anemia : kurang darah
- Anggaran : rencana belanja
- Angkara : kejahatan
- Anjung : panggung
- Anomali : penyimpangan, tidak normal
- Anonim : tanpa nama
- Anulir : pembatalan
- Apatis : acuh tak acuh
- Aforisma : pepatah, kata mutiara
- Arbitrer : sewenang-wenang
- Aristokrat : bangsawan
- Arketipe : model
- Arogan : congkak
- Artifisial : buatan
- Asa : harapan
- Autentik : asli, sah''',
    "tiu-modul-s05": '''Pelajari daftar sinonim berikut, fokus pada kata yang sering keluar dan yang belum kamu kenal.

## Huruf B

- Bab : perkara
- Bagak : pemberani
- Bahana : gema, dengung
- Baku : standar, pokok
- Bala : bencana
- Bara : api
- Benchmark : patokan, tolok ukur
- Bibliografi : daftar pustaka
- Boga : makanan
- Bonafide : dapat dipercaya
- Bonanza : keberuntungan besar
- Bonus : hadiah
- Botani : nabati

## Huruf C

- Canggih : modern, mutakhir
- Ciri : karakteristik
- Citra : gambaran
- Congkak : sombong

## Huruf D

- Daur : siklus
- Dedikasi : pengabdian
- Deduksi : kesimpulan
- Defisit : kekurangan
- Degradasi : kemerosotan
- Dehidrasi : kehilangan cairan tubuh
- Dekade : dasawarsa, sepuluh tahun
- Dekadensi : kemerosotan moral
- Dekrit : keputusan
- Delik : tindak pidana
- Delusi : khayalan, ilusi
- Dependen : tergantung
- Dependensi : ketergantungan
- Deportasi : pengusiran
- Depresi : kemurungan
- Deskripsi : pemaparan
- Deskriptif : gambaran
- Destruktif : merusak
- Detensi : penahanan
- Dinamis : bergerak
- Dispensasi : pengecualian
- Doktrin : ajaran, dogma
- Donasi : bantuan
- Duplikat : replika

## Huruf E

- Efisien : hemat, berdaya guna
- Egaliter : sederajat
- Egois : individualis
- Eksekusi : pelaksanaan
- Eksentrik : aneh
- Eksodus : hijrah, mengungsi
- Ekspansi : perluasan
- Ekspedisi : pengiriman
- Eksploitasi : pemanfaatan
- Eksplorasi : pengkajian, pendalaman
- Ekspresi : ungkapan
- Ekstra : tambahan
- Ekuator : khatulistiwa
- Ekuivalen : sama, sebanding
- Elusif : sukar dipahami
- Embargo : larangan
- Embarkasi : keberangkatan
- Endemi : penyakit yang menetap di suatu daerah
- Enigmatis : misterius
- Epilog : penutup
- Epidemi : wabah
- Era : zaman, masa
- Esensi : hakikat
- Estetis : elok, indah
- Etika : akhlak
- Etnis : kesukuan
- Evakuasi : pemindahan
- Evaluasi : penilaian
- Evaporasi : penguapan
- Evolusi : perubahan

## Huruf F

- Faksi : golongan, kelompok
- Faktor : penyebab, unsur
- Faktual : nyata, objektif
- Fakultatif : tidak wajib
- Fana : tidak kekal
- Fatamorgana : halusinasi
- Fantastis : luar biasa
- Fauna : dunia hewan
- Fenomena : gejala
- Feodal : aristokrasi
- Fiksi : khayalan
- Fiktif : palsu
- Fiskal : perpajakan
- Flora : dunia tumbuhan
- Fluktuatif : labil
- Friksi : perselisihan
- Fungi : cendawan, jamur

## Huruf G

- Gaji : honor
- Galat : keliru
- Gambaran : deskripsi, imajinasi
- Gasal : ganjil
- Gema : bahana, dengung
- Generik : umum, lazim
- Grasi : pengampunan

## Huruf H

- Herbivora : pemakan tumbuhan
- Hibrida : hasil persilangan
- Hijrah : mengungsi
- Hipokrit : munafik
- Hipotenusa : sisi miring
- Hipotesis : dugaan awal
- Homogen : sejenis

## Huruf I

- Identitas : ciri-ciri
- Ideologi : pemikiran
- Ikhtiar : usaha
- Ikhtisar : ringkasan
- Ilusi : khayalan
- Imajinasi : gambaran
- Imbas : efek, dampak
- Imitasi : tiruan
- Implisit : tersirat
- Impuls : dorongan
- Imun : kebal
- Individualis : egois
- Informal : santai
- Injeksi : suntikan
- Inklusif : merangkul semua
- Inovasi : kebaruan, penemuan
- Insentif : bonus
- Insidental : sewaktu-waktu
- Insomnia : sulit tidur
- Inspeksi : peninjauan
- Inspirasi : ilham, gagasan
- Instruksi : perintah, komando
- Integrasi : pembauran
- Intelektual : cendekiawan
- Interval : sela
- Intuisi : naluri, insting
- Izin : wenang

## Huruf J

- Jati diri : identitas diri
- Jurnal : buletin, bacaan

## Huruf K

- Kaidah : aturan, norma
- Kalkulasi : perhitungan
- Kampiun : juara
- Kapital : modal
- Kapitalisasi : pemodalan
- Karakteristik : ciri
- Karnivora : pemakan daging
- Kawan : mitra
- Kelas : tingkatan
- Kitab : buku
- Klan : suku
- Klasifikasi : pengelompokan
- Klimaks : puncak
- Kolateral : jaminan
- Kolega : rekan
- Kolusi : kongkalikong
- Komoditas : produk
- Komplemen : pelengkap
- Komprehensif : luas, lengkap
- Kondusif : aman
- Konkaf : cekung
- Konklusi : kesimpulan
- Konkret : nyata, faktual
- Konstitusi : undang-undang
- Kontras : perbedaan nyata
- Kontribusi : bantuan, jasa
- Konveks : cembung
- Konvensi : kesepakatan
- Konvensional : kolot
- Koordinator : manajer
- Korelasi : hubungan
- Kredibel : andal
- Kronologi : urutan peristiwa
- Krusial : penting
- Kuota : jatah

## Huruf L

- Laba : untung, profit
- Labil : fluktuatif
- Laten : tersembunyi
- Laik : layak, pantas
- Latif : lembut, halus
- Legalitas : keabsahan
- Leksikon : kamus, kosakata

## Huruf M

- Majemuk : plural
- Makar : tipu muslihat
- Manuskrip : dokumen, naskah
- Masa : waktu
- Masif : padat, besar-besaran
- Materialistis : kebendaan
- Mawas diri : introspeksi
- Memangkas : memotong
- Militan : gigih berjuang
- Mitra : kawan
- Mobilitas : gerak
- Moderat : lunak, rasional
- Monarki : kerajaan
- Mortalitas : angka kematian
- Mutakhir : modern, terbaru
- Mutlak : absolut

## Huruf N

- Nabati : botani
- Naluri : insting, intuisi
- Narasi : cerita, kisah
- Negosiasi : perundingan
- Nisbi : relatif
- Nomaden : berpindah-pindah
- Notulen : catatan, risalah
- Nuansa : perbedaan halus

## Huruf O

- Objektif : apa adanya, tidak memihak
- Omnivora : pemakan segala
- Orisinil : asli, autentik
- Otodidak : belajar sendiri
- Otoritas : wewenang
- Out of date : kedaluwarsa

## Huruf P

- Pagu : plafon
- Pandir : bodoh, dungu
- Panorama : pemandangan
- Paradigma : kerangka berpikir
- Paradoks : bertentangan
- Paralel : sejajar
- Pasca : sesudah
- Pedagogi : pengajaran, pendidikan
- Permisif : liberal, terbuka
- Persuasi : ajakan
- Petisi : gugatan
- Pionir : pelopor, perintis
- Polemik : kontroversi
- Pra : sebelum
- Prefiks : awalan
- Preventif : pencegahan
- Primer : utama, pokok
- Profit : keuntungan
- Prohibisi : larangan
- Proletar : rakyat jelata
- Prolog : pembuka
- Prominen : terkenal, terkemuka
- Promosi : pemasaran
- Propaganda : ajakan, kampanye
- Proteksi : perlindungan
- Provokasi : pancingan, sugesti

## Huruf R

- Rabat : potongan harga, diskon
- Rancu : kacau
- Random : acak
- Reboisasi : penghijauan
- Referensi : rujukan
- Refleksi : pencerminan
- Registrasi : pendaftaran
- Rehabilitasi : perbaikan
- Reklamasi : pengurukan lahan
- Rekonsiliasi : perdamaian
- Relatif : nisbi
- Remisi : pengurangan hukuman
- Replika : duplikat, tiruan
- Resesi : kemerosotan ekonomi
- Resistan : tahan, kebal
- Revolusi : perubahan
- Rigid : kaku

## Huruf S

- Saksama : cermat
- Sekte : aliran, mazhab
- Seremoni : upacara
- Siklus : daur
- Singular : tunggal
- Sinopsis : ikhtisar, intisari
- Sintesis : penggabungan
- Skeptis : ragu-ragu
- Sporadis : kadang-kadang, jarang
- Stagnasi : kemandekan
- Statis : diam
- Stigma : ciri negatif
- Substansi : intisari
- Sufiks : akhiran
- Suksesi : pergantian pemimpin
- Sumbang : tidak selaras
- Supervisi : pengawasan
- Supremasi : kekuasaan tertinggi
- Swasembada : mandiri

## Huruf T

- Tanggalkan : lepaskan
- Tangkal : cegah
- Tentatif : belum pasti
- Teritori : wilayah
- Tolan : sahabat
- Transisi : peralihan
- Tunaaksara : buta huruf
- Tunadaksa : cacat tubuh
- Tunagrahita : cacat mental
- Tunanetra : buta
- Tunarungu : tuli
- Tunasusila : pelacur
- Tunawicara : bisu
- Tunawisma : gelandangan

## Huruf U

- Ugahari : sedang, sederhana
- Up to date : baru
- Utopis : bersifat khayal

## Huruf V

- Validitas : kesahihan
- Vandalisme : perusakan
- Versus : lawan
- Virtual : maya
- Virulen : ganas, berbahaya
- Visual : dapat dilihat
- Vital : esensial, fundamental
- Volunter : sukarelawan

## Huruf W, Y, Z

- Warisan : harta benda
- Warkat : surat
- Wenang : izin
- Yurisdiksi : wilayah hukum
- Zenit : puncak''',
    "tiu-modul-s06": '''## Antonim/Lawan Kata

Antonim adalah kata yang artinya bertentangan dengan kata tertentu. Contoh: prolog adalah pembukaan atau pendahuluan, sehingga antonimnya adalah penutup.

Layaknya tes sinonim, tes antonim juga untuk mengukur seberapa luas wawasan seseorang. Orang yang mengenali banyak kata biasanya adalah orang yang rajin membaca, terutama kata-kata yang berasal dari disiplin ilmu yang beragam.

Pada saat mengerjakan jenis tes ini sangat diharapkan peserta mampu berkonsentrasi dengan baik, karena terkadang pilihan jawaban berisi kata-kata pengecoh, termasuk yang merupakan sinonim dari kata pada soal.

Oleh karena itu, ketelitian sangatlah diperlukan.

## Tips

1. Tingkatkan kemampuan perbendaharaan kata dengan memperbanyak membaca buku ataupun membaca berita dari media cetak, dan mendengarkan berita dari media massa.
2. Cari tahu arti perbendaharaan kata yang belum diketahui dengan membuka Kamus Besar Bahasa Indonesia (KBBI).
3. Perkayalah perbendaharaan kata dalam bahasa Inggris karena hal tersebut sangat membantu dalam menyelesaikan soal.
4. Hindari menghabiskan waktu untuk menjawab hanya satu soal karena penasaran. Waktu yang diberikan sangat terbatas, maka kerjakan soal ini dengan cepat dan teliti.

Hati-hati dan konsentrasi! Pada saat mengerjakan soal tes antonim, jangan sampai kamu berpikir bahwa kamu sedang mencari sinonim atau persamaannya. Ini sering terjadi pada peserta tes.

Ketika di tengah-tengah tes, ia tidak sadar telah mencari jawaban yang merupakan sinonimnya, bukan lawan katanya.

Apalagi biasanya soal sinonim dan antonim berdekatan waktu pengerjaannya sehingga memungkinkan peserta tes kurang konsentrasi dalam mengerjakan soal.

Ingat bahwa kamu sedang mencari antonim (lawan kata) dari sebuah kata. Oleh karena itu, jangan sampai terjebak dengan kata pada pilihan ganda yang merupakan sinonim dari soal. Konsentrasi penuh sangat diperlukan di sini.''',
    "tiu-modul-s07": '''Tes antonim menguji kemampuanmu menentukan lawan kata. Banyak yang salah jawab karena tergesa-gesa, padahal yang dicari adalah kata yang maknanya berlawanan, bukan yang mirip.

## Trik mengerjakan soal

1. **Jika ada dua pilihan yang mirip artinya, pilih yang paling berbeda.** Pilihan yang mirip biasanya hanya pengecoh.
2. **Cari dua jawaban yang berlawanan.** Jika di antara pilihan jawaban ada dua kata yang saling berlawanan, kemungkinan besar jawaban yang tepat adalah salah satunya.
3. **Untuk kata Latin atau ilmiah, utamakan jawaban yang mirip dengan soal.** Kata serapan sering punya lawan kata yang bentuknya mirip dengan kata aslinya.

## Contoh soal

TERKATUNG >< ...

Pilihannya: melayang, pasti, ombak, terperosok, terbenam.

Jawab: **terbenam**. Terkatung artinya mengambang di permukaan air, jadi lawannya adalah terbenam. Banyak yang tergesa-gesa menjawab melayang, padahal melayang justru mirip dengan terkatung.

Contoh lain:

- ANTIPATI >< **simpati**
- KONKAF >< **konveks** (cekung lawannya cembung)

## Daftar antonim huruf A

- Abadi >< fana
- Abolisi >< pemberatan
- Absurd >< masuk akal
- Abstrak >< konkret
- Acuh >< peduli
- Adik >< kakak
- Adiluhung >< hina
- Ahli >< awam, amatir
- Aktual >< kedaluwarsa
- Akuisisi >< pengeluaran
- Alam fana >< alam baka
- Amar >< larangan
- Amatir >< kampiun, ahli
- Anak >< orang tua
- Angkara >< kebaikan
- Anomali >< normal
- Antagonis >< protagonis
- Antipati >< simpati''',
    "tiu-modul-s08": '''Daftar kata berikut bisa kamu pelajari sebagai acuan kosakata antonim. Perhatikan kata yang bentuknya mirip dengan sinonimnya, karena itu sering jadi jebakan di soal.

## Daftar antonim huruf A dan B

- Apatis >< antusias, peduli
- Apriori >< aposteriori
- Aristokrat >< jelata
- Asli >< duplikat
- Atrofi >< pembesaran
- Autentik >< palsu
- Awam >< ahli, pakar
- Badung >< penurut
- Bahadur >< pengecut
- Baka >< fana
- Berdikari >< bergantung
- Berhasil >< gagal
- Berpihak >< netral
- Bersih >< kotor
- Bersimbah >< kering
- Besar >< kecil
- Bongsor >< kerdil
- Bukit >< lembah''',
    "tiu-modul-s09": '''Daftar kata berikut bisa kamu pelajari sebagai acuan kosakata antonim. Hafalkan pasangan yang belum kamu kenal, dan perhatikan kata yang bentuknya mirip dengan sinonimnya karena sering jadi jebakan di soal.

## Huruf C

- Canggih >< sederhana
- Cerewet >< pendiam
- Chaos >< teratur
- Cucu >< kakek
- Curam >< landai
- Curang >< sportif

## Huruf D

- Daif >< kuat
- Debit >< kredit
- Deduksi >< induksi
- Degenerasi >< kemajuan
- Delusi >< nyata
- Demosi >< promosi
- Dependen >< independen, mandiri
- Destruktif >< konstruktif
- Deteriorasi >< kemajuan
- Diam >< bergerak
- Dinamis >< statis
- Diskrepansi >< kecocokan

## Huruf E

- Eksekutif >< legislatif
- Eksplisit >< implisit
- Ekspresi >< impresi
- Elastis >< kaku
- Elusif >< mudah dipahami
- Emigrasi >< imigrasi
- Empati >< tidak peduli
- Epilog >< prolog
- Eternal >< fana

## Huruf F

- Fakir >< kaya
- Fana >< abadi
- Fiksi >< realita
- Fisik >< mental
- Fonem >< morfem

## Huruf G

- Gagal >< berhasil
- Galib >< khusus
- Gasal >< genap
- Gawat >< aman
- Gegai >< kokoh
- Gelap >< terang
- Generik >< khusus
- Gentar >< berani
- Gembira >< sedih
- Gersang >< subur
- Gulita >< benderang

## Huruf H

- Hadir >< absen
- Hampa >< berisi
- Heterogen >< homogen
- Hidup >< mati
- Higienis >< kotor
- Hina >< mulia
- Hirau >< lalai
- Homogen >< heterogen
- Horizontal >< vertikal

## Huruf I

- Ibu >< anak
- Imigrasi >< emigrasi
- Independen >< dependen
- Induksi >< deduksi
- Inferior >< superior
- Inflasi >< deflasi
- Inklusif >< eksklusif
- Input >< output
- Insidental >< rutin
- Insinuasi >< terang-terangan
- Internal >< eksternal
- Intro >< penutup
- Isolator >< konduktor

## Huruf J

- Jaga >< tidur
- Jahat >< baik
- Jauh >< dekat
- Jawab >< tanya

## Huruf K

- Kaku >< elastis
- Kaleidoskop >< seragam
- Kapabel >< tidak mampu
- Kebal >< rentan
- Kebijakan >< kecerobohan
- Kedaluwarsa >< masih berlaku
- Kendala >< pendukung
- Kerdil >< bongsor
- Kesempatan >< hambatan
- Khas >< umum
- Kohesi >< adhesi
- Kolektif >< personal
- Konduktor >< isolator
- Konkaf >< konveks
- Konkret >< abstrak
- Konservasi >< eksploitasi
- Konsonan >< vokal
- Konstruktif >< destruktif
- Konsumen >< produsen
- Kontinu >< terputus-putus
- Konveks >< konkaf
- Konvergen >< divergen
- Krusial >< sepele

## Huruf L

- Laba >< rugi
- Labil >< stabil
- Lancung >< asli
- Landai >< curam
- Laten >< tampak
- Legal >< ilegal
- Legislatif >< eksekutif
- Longgar >< ketat

## Huruf M

- Makar >< jujur
- Mandiri >< bergantung
- Maya >< nyata
- Mayor >< minor
- Mobilitas >< diam
- Modern >< tradisional
- Monoton >< berubah-ubah
- Muda >< tua
- Muskil >< mudah

## Huruf N

- Nahas >< untung
- Negasi >< konfirmasi
- Netral >< berpihak
- Nisbi >< mutlak
- Niskala >< berwujud
- Nomaden >< menetap
- Normal >< abnormal
- Nyalang >< terpejam

## Huruf O dan P

- Objektif >< subjektif
- Obsolet >< baru
- Ofensif >< defensif
- Oponen >< kawan
- Optimis >< pesimis
- Ortodoks >< modern
- Otokrasi >< demokrasi
- Output >< input
- Pancarona >< sewarna
- Pandir >< pintar
- Panjang >< pendek
- Pasti >< ragu
- Pejal >< berongga
- Penting >< remeh
- Pertemuan >< perpisahan
- Plural >< tunggal
- Poligami >< monogami
- Pra >< pasca
- Praktis >< teoretis
- Prefiks >< sufiks
- Presensi >< absen
- Progresif >< regresif
- Proletar >< kapitalis
- Prolog >< epilog
- Prominen >< biasa
- Protagonis >< antagonis
- Putus >< sambung

## Huruf R, S, T

- Kuasi >< nyata
- Rabun >< jelas
- Rawan >< aman
- Remisi >< penambahan
- Retro >< progresif
- Revolusi >< evolusi
- Rongga >< rapat
- Sederhana >< canggih
- Sekuler >< keagamaan
- Semacam >< beraneka
- Senang >< sedih
- Separasi >< penyatuan
- Simpati >< antipati
- Sinkron >< sumbang
- Skeptis >< yakin
- Sporadis >< sering
- Sportif >< curang
- Stabil >< labil
- Stagnan >< berubah
- Sumbang >< selaras
- Surai >< berhimpun
- Takeoff >< landing
- Takzim >< acuh
- Tanya >< jawab
- Tentatif >< pasti
- Terbit >< tenggelam
- Terkatung >< terbenam
- Tertib >< kacau
- Tesis >< antitesis
- Tetiran >< asli
- Tinggi >< rendah
- Tua >< muda

## Huruf U, V, W

- Ultima >< awal
- Umum >< khusus
- Universal >< parsial
- Utopis >< nyata
- Verbal >< tulisan
- Virulen >< baik
- Vokal >< konsonan
- Waruga >< jiwa
- Wreda >< muda''',
    "tiu-modul-s10": '''Tes analogi menguji kemampuanmu menentukan padanan kata yang sesuai dengan pola. Caranya adalah menemukan hubungan antara pasangan kata di soal, lalu mencari pasangan jawaban yang hubungannya sama. Terkadang pengetahuan umum juga dibutuhkan.

## Hubungan antarkata yang sering muncul

1. Sinonim
2. Antonim
3. Waktu
4. Bagian dari
5. Definisi
6. Temuan dan tokoh penemunya
7. Istilah dalam suatu bidang pengetahuan
8. Sebab dan akibat
9. Kata benda dan kata sifat
10. Benda (alat) dan fungsinya
11. Pancaindra dan penyakitnya
12. Mata uang dan negara

## Tips mengerjakan soal

1. **Teliti, cermat, dan cepat.** Pahami soal dengan cepat, dan begitu kamu sudah mantap dengan satu jawaban, langsung jawab lalu pindah ke soal berikutnya.
2. **Banyak berlatih.** Semakin sering berlatih, semakin cepat kamu mengenali pola hubungan antarkata.
3. **Jangan terpaku pada soal sulit.** Kalau ada soal yang terasa sulit, beri tanda lalu pindah ke soal yang lebih mudah. Kembali lagi kalau masih ada sisa waktu.
4. **Perluas hubungan kata.** Kalau hubungan katanya belum jelas, baca ulang soalnya atau coba rangkai kata-kata itu menjadi sebuah kalimat.

## Trik pola A : B = C : D

1. **Hubungan ruas kiri setara dengan hubungan ruas kanan.** Hubungan di ruas kiri tidak boleh lebih tinggi atau lebih rendah levelnya dari hubungan di ruas kanan.
2. **Cari kata kunci atau hubungan yang unik dari soal.** Jawaban yang benar harus punya hubungan yang sama persis seperti di soal.
3. **Perhatikan arah hubungan.** Jangan sampai terjebak pola yang terbalik. Misalnya, ALAT : FUNGSI tidak sama dengan FUNGSI : ALAT. Arah hubungan ruas kiri harus searah dengan ruas kanan.
4. **Perluas menjadi kalimat.** Kalau belum yakin, buatlah kata-kata di pilihan jawaban menjadi kalimat dengan hubungan yang sama. Kalau maknanya mirip dengan soal, itulah jawabannya.

## Contoh soal

PENA : MENULIS = ...

Jawab: **KUAS : MELUKIS**. Hubungannya adalah alat dan fungsinya: pena dipakai untuk menulis, kuas dipakai untuk melukis.''',
    "tiu-modul-s12": '''Tes pengelompokan kata meminta kamu menganalisis satu kata yang tidak identik atau tidak serupa dengan kata-kata lainnya dalam satu kelompok.

Tes ini menguji kemampuan verbal dan keluasan wawasanmu: semakin luas wawasanmu, semakin banyak perbendaharaan kata yang kamu kenali.

## Trik mengerjakan soal

1. **Kelompokkan kata-kata di soal sesuai bidangnya.** Kalau ada satu kata yang berbeda dari kelompoknya, itulah jawabannya.
2. **Mulailah dari soal yang kamu anggap mudah.**
3. **Hubungkan kata-kata di soal dengan sebuah kalimat.** Cara ini membantu melihat kata mana yang tidak nyambung dengan yang lain.

## Contoh soal

Mobil, motor, bus, kapal. Kata manakah yang tidak masuk kelompok?

Jawab: **kapal**. Mobil, motor, dan bus adalah kendaraan darat, sedangkan kapal adalah kendaraan laut.

## Penalaran nonverbal

Tes penalaran nonverbal sangat erat kaitannya dengan angka dan operasi hitung. Di dalamnya ada tes penalaran numerikal (aljabar, aritmetika, deret, kecepatan berhitung, kemampuan kuantitatif), tes penalaran logis, dan tes penalaran analitis.

Tes ini mengukur kemampuan menghitung dengan cermat, cepat, dan teliti, serta logika berpikir dalam menyelesaikan masalah.

Kemampuan ini berhubungan dengan keahlian yang dibutuhkan di dunia kerja, yaitu kecermatan, ketelitian, kecepatan, dan cara kerja yang sistematis.''',
    "tiu-modul-s13": '''Tes aritmetika dan aljabar menguji kemampuanmu menyelesaikan soal-soal matematika sederhana. Untuk menaklukkannya, pelajari lagi konsep dan rumus dasar matematika yang pernah didapat di SD dan SMP.

Kunci menghadapi soal jenis ini adalah pemahaman soal, ketelitian, dan penguasaan matematika dasar. Berikut rangkumannya.

## Bilangan prima

Bilangan prima adalah bilangan asli yang tepat memiliki 2 faktor, yaitu 1 dan dirinya sendiri.

Contoh: 2, 3, 5, 7, 11, 13, 17, 19, ...

Perhatikan bahwa 1 bukan bilangan prima karena hanya punya satu faktor, yaitu 1 itu sendiri. Dan 2 adalah satu-satunya bilangan prima yang genap.''',
    "tiu-modul-s14": '''## Macam-macam bilangan

1. **Bilangan bulat** terdiri dari bilangan bulat positif, nol, dan bilangan bulat negatif. Contoh: ..., -3, -2, -1, 0, 1, 2, 3, ...
2. **Bilangan asli** adalah bilangan bulat positif yang bukan nol, yaitu 1, 2, 3, 4, 5, 6, ...
3. **Bilangan cacah** adalah bilangan bulat positif yang dimulai dari nol, yaitu 0, 1, 2, 3, 4, 5, ...
4. **Bilangan prima** adalah bilangan asli yang tepat memiliki 2 faktor, yaitu 1 dan dirinya sendiri. Contoh: 2, 3, 5, 7, 11, ...
5. **Bilangan rasional** adalah bilangan yang dapat dinyatakan sebagai pembagian dua bilangan bulat. Contoh: 1/2, 3/4, 2, -5.
6. **Bilangan irasional** adalah bilangan yang tidak dapat dinyatakan sebagai pembagian dua bilangan bulat. Contoh: akar 2, akar 3, pi.
7. **Bilangan pecahan** adalah bagian dari bilangan rasional yang dapat ditulis dalam bentuk `a/b`, dengan a dan b bilangan bulat dan b tidak sama dengan nol. Contoh: 1/2, 3/5.

## Operasi hitung penjumlahan

Sifat-sifat pada penjumlahan:

- **Komutatif (pertukaran):** `a + b = b + a`. Pertukaran letak bilangan tidak mengubah hasil.
- **Asosiatif (pengelompokan):** `(a + b) + c = a + (b + c)`. Perubahan pengelompokan bilangan tidak mengubah hasil.
- **Identitas:** `a + 0 = 0 + a = a`. Bilangan ditambah nol hasilnya bilangan itu sendiri.

## Trik penjumlahan bilangan bulat bertanda

Menjumlahkan bilangan bulat bisa dibantu garis bilangan. Bilangan negatif ditunjukkan panah ke kiri, bilangan positif panah ke kanan.

Bilangan pertama dimulai dari 0, bilangan kedua dimulai dari ujung panah bilangan pertama, dan hasilnya diukur dari 0 sampai ujung bilangan kedua.

Contoh:

1. Positif tambah positif: `4 + 2 = 6`
2. Positif tambah negatif: `5 + (-3) = 2`
3. Negatif tambah positif: `-5 + 2 = -3`
4. Negatif tambah negatif: `-3 + (-2) = -5`
5. Tiga bilangan: `5 + 4 + (-6) = 3`''',
    "tiu-modul-s15": '''## Pengurangan bilangan bulat bertanda

Pengurangan dapat diartikan sebagai menambah dengan lawan. Jadi `a - b` sama dengan `a + (-b)`.

Contoh:

- `-4 - 7 = -4 + (-7) = -11`
- `-3 - (-5) = -3 + 5 = 2`
- `3 - (-7) = 3 + 7 = 10`

## Perkalian

Sifat-sifat perkalian:

- **Komutatif (pertukaran):** `a x b = b x a`. Pertukaran letak bilangan tidak mengubah hasil.
- **Asosiatif (pengelompokan):** `(a x b) x c = a x (b x c)`. Perubahan pengelompokan bilangan tidak mengubah hasil.
- **Distributif terhadap penjumlahan:** `a x (b + c) = (a x b) + (a x c)`
- **Distributif terhadap pengurangan:** `a x (b - c) = (a x b) - (a x c)`
- **Identitas:** `a x 1 = 1 x a = a`. Bilangan dikali satu hasilnya bilangan itu sendiri.

## Pembagian

Pembagian dapat diartikan sebagai lawan dari perkalian. Notasinya adalah tanda `:` atau `/`.

Sifat-sifat pembagian:

- Setiap bilangan dibagi 1 hasilnya bilangan itu sendiri: `a : 1 = a`
- Setiap bilangan dibagi dengan bilangan itu sendiri sama dengan 1: `a : a = 1`, dengan `a` bukan nol
- Bilangan nol dibagi bilangan berapa saja sama dengan 0: `0 : a = 0`, dengan `a` bukan nol
- Bilangan berapa saja dibagi nol sama dengan tidak terdefinisi: `a : 0 = tidak terdefinisi`

## Aturan tanda pada perkalian dan pembagian

- Apabila tanda bilangan yang dikalikan atau dibagi **sama**, hasilnya bertanda positif (+).
- Apabila tanda bilangan yang dikalikan atau dibagi **beda**, hasilnya bertanda negatif (-).

Contoh: `(-4) x (-3) = 12`, sedangkan `(-4) x 3 = -12`.''',
    "tiu-modul-s16": '''## Bentuk umum perpangkatan

Perpangkatan adalah operasi perkalian berulang.

Contoh:

- `3^2 = 3 x 3 = 9`, dibaca tiga pangkat dua atau tiga kuadrat
- `4^3 = 4 x 4 x 4 = 64`, dibaca empat pangkat tiga
- `5^4 = 5 x 5 x 5 x 5 = 625`, dibaca lima pangkat empat

Secara umum: `a^n = a x a x a x ... x a` sebanyak n faktor. Di sini `a^n` adalah bilangan berpangkat, `a` adalah bilangan pokok, dan `n` adalah pangkat.

## Bilangan kuadrat (bilangan pangkat dua)

Bilangan kuadrat adalah bilangan hasil perkalian dua bilangan yang sama.

Contoh: 1, 4, 9, 16, 25, 36, 49, 64, 81, 100, ...

Ditulis dalam bentuk pangkat: `1 = 1^2`, `4 = 2^2`, `9 = 3^2`, `16 = 4^2`, `25 = 5^2`, `36 = 6^2`.

## Bilangan kubik (bilangan pangkat tiga)

Bilangan kubik adalah bilangan hasil perkalian tiga bilangan yang sama.

Contoh: 1, 8, 27, 64, 125, 216, 343, 512, 729, 1000, ...

Ditulis dalam bentuk pangkat: `1 = 1^3`, `8 = 2^3`, `27 = 3^3`, `64 = 4^3`, `125 = 5^3`, `216 = 6^3`.''',
    "tiu-modul-s17": '''Operasi penarikan akar adalah kebalikan dari perpangkatan. Notasinya adalah tanda akar.

Contoh:

- Akar pangkat dua dari 9 adalah 3, karena `3^2 = 9`
- Akar pangkat tiga dari 27 adalah 3, karena `3^3 = 27`
- Akar pangkat dua dari 64 adalah 8, karena `8^2 = 64`

## Penarikan akar pangkat dua

Penarikan akar pangkat dua dapat dilakukan dengan faktorisasi prima atau cara bersusun.

**Menggunakan faktorisasi prima**

Contoh: Berapa akar dari 36?

Jawab: `36 = 2 x 2 x 3 x 3 = 2^2 x 3^2`, jadi akar 36 = `2 x 3 = 6`.

**Menggunakan cara bersusun**

Contoh: Berapa akar dari 625?

Langkah-langkahnya:

1. Pisahkan dua angka dari belakang: 6 dan 25.
2. Carilah bilangan yang jika dikuadratkan hasilnya kurang dari atau sama dengan 6. Bilangan itu adalah 2, karena `2 x 2 = 4`.
3. Kurangkan 6 - 4 = 2, lalu turunkan 25 sehingga menjadi 225.
4. Angka hasil pertama dijumlahkan: `2 + 2 = 4`.
5. Cari bilangan pengisi sehingga `4... x ... = 225`. Bilangan itu adalah 5, karena `45 x 5 = 225`.
6. Jadi, akar 625 = 25.

## Penarikan akar pangkat tiga

Penarikan akar pangkat tiga mudah dilakukan dengan faktorisasi prima.

Contoh:

- Akar pangkat tiga dari 125: `125 = 5 x 5 x 5 = 5^3`, jadi hasilnya 5.
- Akar pangkat tiga dari 9.261: `9.261 = 3 x 3 x 3 x 7 x 7 x 7 = 3^3 x 7^3`, jadi hasilnya `3 x 7 = 21`.''',
    "tiu-modul-s18": '''Operasi hitung campuran adalah gabungan beberapa operasi penjumlahan (+), pengurangan (-), perkalian (x), atau pembagian (:). Urutan pengerjaannya sebagai berikut.

1. Operasi di dalam tanda kurung dikerjakan paling awal.
2. Operasi pangkat dan akar dikerjakan setelah kurung.
3. Operasi perkalian dan pembagian lebih kuat dari penjumlahan dan pengurangan.
4. Operasi yang sama kuat (setingkat) dikerjakan dengan urutan mulai dari kiri. Penjumlahan dan pengurangan setingkat, perkalian dan pembagian setingkat.

## Contoh soal

1. `38.200 + 20 x 45.000 = ...`

Jawab: perkalian didahulukan.

`20 x 45.000 = 900.000`, lalu `38.200 + 900.000 = 938.200`.

2. `2 x (2.314 + 856) - 4.512 : 16 = ...`

Jawab: operasi dalam tanda kurung didahulukan, lalu perkalian dan pembagian karena sama kuat dan lebih kuat dari pengurangan.

`2.314 + 856 = 3.170`, lalu `2 x 3.170 = 6.340`.

`4.512 : 16 = 282`.

Terakhir, `6.340 - 282 = 6.058`.''',
    "tiu-modul-s19": '''Pada garis bilangan, bilangan nol berada di tengah. Di sebelah kanan 0 adalah bilangan bulat positif atau bilangan asli, dan di sebelah kiri 0 adalah bilangan bulat negatif.

Semakin ke kanan nilai bilangan semakin besar, semakin ke kiri nilai bilangan semakin kecil.

## Contoh soal

1. Urutan bilangan -8, 1, -2, 3 dari yang terkecil adalah -8, -2, 1, 3.
2. Urutan bilangan -6, 8, -4, 0, 1, -2 dari yang terbesar adalah 8, 1, 0, -2, -4, -6.

## Tips

1. Apabila suatu bilangan berada di sebelah kanan bilangan lain, bilangan itu lebih besar. Notasi "lebih besar" dilambangkan dengan tanda `>`. Contoh: `8 > 3`.
2. Apabila suatu bilangan berada di sebelah kiri bilangan lain, bilangan itu lebih kecil. Notasi "lebih kecil" dilambangkan dengan tanda `<`. Contoh: `3 < 8`.
3. Bilangan negatif dapat diartikan sebagai lawan dari bilangan positif. Contoh: lawan dari 4 adalah -4, lawan dari -18 adalah 18.''',
    "tiu-modul-s20": '''Untuk perhitungan cepat, bilangan dapat didekati dengan cara pembulatan atau penaksiran.

## Pembulatan dalam puluhan terdekat

Aturan:

- Apabila satuannya 1, 2, 3, dan 4, dibulatkan ke bawah menjadi 0.
- Apabila satuannya 5, 6, 7, 8, dan 9, dibulatkan ke atas menjadi 10.

Contoh: 23 dibulatkan ke puluhan terdekat menjadi 20. 657 dibulatkan ke puluhan terdekat menjadi 660.

## Pembulatan dalam ratusan terdekat

Aturan:

- Apabila puluhannya kurang dari 50, dihilangkan.
- Apabila puluhannya 50 atau lebih, dibulatkan ke atas menjadi 100.

Contoh: 445 dibulatkan ke ratusan terdekat menjadi 400. 6.725 dibulatkan ke ratusan terdekat menjadi 6.700.

## Pembulatan dalam ribuan terdekat

Aturan:

- Apabila ratusannya kurang dari 500, dihilangkan.
- Apabila ratusannya 500 atau lebih, dibulatkan ke atas menjadi 1.000.

Contoh: 9.137 dibulatkan ke ribuan terdekat menjadi 9.000. 4.810 dibulatkan ke ribuan terdekat menjadi 5.000.

## Penaksiran hasil operasi hitung

Menaksir hasil operasi hitung adalah memperkirakan hasil setelah masing-masing bilangan dibulatkan ke puluhan, ratusan, ribuan terdekat, dan seterusnya.

Contoh: nilai taksiran `1.820 + 2.310` jika dibulatkan ke ratusan terdekat adalah `1.800 + 2.300 = 4.100`.

Contoh pemecahan masalah yang melibatkan uang: jika 1 kg apel harganya Rp13.000,00 dan 1 kg jeruk harganya Rp12.700,00, hitunglah harga 2 kg apel dan 3 kg jeruk dengan pembulatan ke ribuan terdekat!

Jawab: `(2 x 13.000) + (3 x 12.700) = 26.000 + 38.100 = 64.100`. Dibulatkan ke ribuan terdekat menjadi Rp64.000,00.

## Kelipatan dan faktor bilangan

**Kelipatan bilangan** adalah bilangan-bilangan hasil perkalian bilangan itu dengan bilangan asli.

Contoh: kelipatan bilangan 5 adalah 5, 10, 15, 20, 25, ...

**Faktor bilangan** adalah bilangan-bilangan yang dapat membagi habis bilangan itu. Faktor prima suatu bilangan adalah faktor bilangan yang merupakan bilangan prima.

Contoh: faktor dari 42 adalah 1, 2, 3, 6, 7, 14, 21, 42. Faktor prima dari 42 adalah 2, 3, dan 7.

**Faktorisasi prima** suatu bilangan adalah hasil perkalian faktor-faktor prima dari bilangan tersebut.

Contoh: faktorisasi prima dari 12 adalah `2 x 2 x 3 = 2^2 x 3`. Faktorisasi prima dari 30 adalah `2 x 3 x 5`.''',
    "tiu-modul-s21": '''KPK (Kelipatan Persekutuan Terkecil) dari dua bilangan atau lebih adalah kelipatan persekutuan terkecil dari bilangan-bilangan tersebut.

## Menentukan KPK dengan faktorisasi prima

Untuk menentukan KPK, kalikan semua faktor prima dengan pangkat terbesar.

Contoh: tentukan KPK dari 32 dan 48!

Jawab:

- Faktorisasi prima dari 32 adalah `2 x 2 x 2 x 2 x 2 = 2^5`.
- Faktorisasi prima dari 48 adalah `2 x 2 x 2 x 2 x 3 = 2^4 x 3`.
- Faktor prima yang berbeda dengan pangkat tertinggi adalah `2^5` dan 3.
- Jadi, KPK dari 32 dan 48 adalah `2^5 x 3 = 32 x 3 = 96`.

## Menentukan KPK dengan cara sengkedan

Bilangan 32 dan 48 dibagi dengan faktor prima yang sama sampai habis, lalu kalikan semua faktor pembaginya.

`32 dan 48 dibagi 2 menjadi 16 dan 24, dibagi 2 menjadi 8 dan 12, dibagi 2 menjadi 4 dan 6, dibagi 2 menjadi 2 dan 3, lalu 2 dan 3 dibagi 2 dan 3.`

KPK = `2 x 2 x 2 x 2 x 2 x 3 = 96`.''',
    "tiu-modul-s22": '''FPB (Faktor Persekutuan Terbesar) dari dua bilangan atau lebih adalah faktor persekutuan terbesar dari bilangan-bilangan tersebut.

## Menentukan FPB dengan faktorisasi prima

Untuk menentukan FPB, kalikan semua faktor prima yang sama dan memiliki pangkat terkecil.

Contoh: tentukan FPB dari 300 dan 350!

Jawab:

- Faktorisasi prima dari 300 adalah `2 x 2 x 3 x 5 x 5 = 2^2 x 3 x 5^2`.
- Faktorisasi prima dari 350 adalah `2 x 5 x 5 x 7 = 2 x 5^2 x 7`.
- Faktor prima yang sama dengan pangkat paling kecil adalah 2 dan `5^2`.
- Jadi, FPB = `2 x 5^2 = 2 x 25 = 50`.

## Menentukan FPB dengan cara sengkedan

Bilangan 300 dan 350 dibagi dengan faktor prima yang sama sampai habis. FPB diperoleh dengan mengalikan semua faktor persekutuannya.

`300 dan 350 dibagi 2 menjadi 150 dan 175, dibagi 5 menjadi 30 dan 35, dibagi 5 menjadi 6 dan 7.`

FPB = `2 x 5 x 5 = 50`.

## Aplikasi FPB dan KPK

FPB dan KPK dipakai untuk menyelesaikan permasalahan sehari-hari.

Contoh: dua orang menyalakan senter bersama-sama. A menyalakan senter setiap 2 detik dan B setiap 5 detik. Setelah berapa detik A dan B akan menyalakan senter bersama untuk yang kedua kalinya?

Jawab: permasalahan ini berkaitan dengan KPK. KPK dari 2 dan 5 adalah 10. Jadi, mereka akan menyalakan senter bersamaan lagi setelah 10 detik.''',
    "tiu-modul-s23": '''Pecahan adalah bilangan yang dapat dinyatakan dalam bentuk `a/b`, dengan a dan b bilangan bulat dan b tidak sama dengan nol.

- a disebut **pembilang**
- b disebut **penyebut**

Pecahan dapat juga dikatakan sebagai bagian yang berukuran sama dari sesuatu yang utuh. Misalnya, sebuah roti dibagi menjadi 3 bagian yang sama besar, maka setiap bagian nilainya 1/3. Pembilangnya 1 dan penyebutnya 3.''',
    "tiu-modul-s24": '''## Jenis-jenis pecahan

1. **Pecahan biasa.** Contoh: 1/2, 3/4, 5/8.
2. **Pecahan desimal.** Contoh: 0,5 dibaca nol koma lima; 3,4 dibaca tiga koma empat; 5,25 dibaca lima koma dua lima.
3. **Pecahan persen (per seratus).** Contoh: 15% = 15/100, 40% = 40/100, 120% = 120/100.
4. **Pecahan campuran.** Contoh: 1 1/2, 2 3/4.

## Mengubah pecahan biasa menjadi pecahan desimal

Ada dua cara:

- **Pembagian bersusun**, yaitu membagi pembilang dengan penyebut sampai habis. Contoh: 3 : 5 = 0,6, jadi 3/5 = 0,6.
- **Mengubah penyebut menjadi 10, 100, 1.000, atau kelipatannya.** Contoh: 3/5 = 6/10 = 0,6; 3/4 = 75/100 = 0,75; 5/8 = 625/1.000 = 0,625.

## Mengubah pecahan desimal menjadi pecahan biasa

Satu angka di belakang koma artinya persepuluh, dua angka di belakang koma artinya perseratus, dan tiga angka di belakang koma artinya perseribu.

Contoh: `0,35 = 35/100 = 7/20`. `0,256 = 256/1.000 = 32/125`.

## Mengubah pecahan biasa menjadi persen

Persen adalah perseratus. Ubahlah penyebut pecahan menjadi 100.

Contoh: `3/4 = 75/100 = 75%`.

## Mengubah persen menjadi pecahan biasa

Membagi persen dengan 100.

Contoh: `20% = 20/100 = 1/5`.

## Mengubah pecahan biasa menjadi pecahan campuran

Pecahan biasa yang pembilangnya lebih besar dari penyebut dapat diubah menjadi pecahan campuran dengan pembagian bersusun.

Contoh: 16/5 = 3 1/5, karena 16 dibagi 5 hasilnya 3 sisa 1.

## Mengubah pecahan campuran menjadi pecahan biasa

Contoh: `2 3/5 = (2 x 5 + 3)/5 = 13/5`. `3 1/4 = (3 x 4 + 1)/4 = 13/4`.''',
    "tiu-modul-s25": '''## Menyederhanakan pecahan

Tidak semua pecahan dapat disederhanakan. Caranya adalah menentukan pecahan senilai, yaitu mengalikan atau membagi pembilang dan penyebut dengan bilangan yang sama.

Contoh:

- Pecahan yang senilai dengan 2/3 adalah 4/6, karena pembilang dan penyebut sama-sama dikali 2.
- `24/72 = 1/3`, karena pembilang dan penyebut sama-sama dibagi 24.

## Mengurutkan pecahan

Untuk pecahan yang berpenyebut sama, cukup perhatikan pembilangnya: semakin besar pembilang, semakin besar nilainya.

Untuk pecahan yang berpenyebut tidak sama, samakan dulu penyebutnya dengan menentukan KPK penyebut.

Contoh: urutkan 1/2, 2/3, dan 3/4 dari yang terkecil!

Jawab: KPK dari 2, 3, dan 4 adalah 12. `1/2 = 6/12`, `2/3 = 8/12`, `3/4 = 9/12`. Jadi urutannya adalah 1/2, 2/3, 3/4.

## Operasi hitung pecahan

**Penjumlahan.** Jika penyebut sudah sama, jumlahkan pembilangnya dan penyebutnya tetap. Jika penyebut belum sama, samakan dulu.

Contoh: `3/8 + 1/6 = 9/24 + 4/24 = 13/24` (KPK dari 8 dan 6 adalah 24).

Contoh campuran: `4 2/3 + 1 3/4 = 14/3 + 7/4 = 56/12 + 21/12 = 77/12 = 6 5/12`.

**Pengurangan.** Jika penyebut sudah sama, kurangkan pembilangnya. Jika belum sama, samakan dulu.

Contoh: `3/4 - 1/3 = 9/12 - 4/12 = 5/12`.

Contoh campuran: `2 1/2 - 1 1/4 = 5/2 - 5/4 = 10/4 - 5/4 = 5/4 = 1 1/4`.

**Perkalian.** Pembilang dikali pembilang dan penyebut dikali penyebut: `(a/b) x (c/d) = (a x c)/(b x d)`.

Contoh: `2/3 x 3/5 = 6/15 = 2/5`.

Contoh campuran: `2 1/3 x 1 1/2 = 7/3 x 3/2 = 21/6 = 7/2 = 3 1/2`.

**Pembagian.** Ubah pembagian menjadi perkalian dengan membalik pembaginya: `(a/b) : (c/d) = (a/b) x (d/c)`.

Contoh: `3/4 : 1/2 = 3/4 x 2/1 = 6/4 = 3/2 = 1 1/2`.

Contoh campuran: `2 1/3 : 1 1/2 = 7/3 : 3/2 = 7/3 x 2/3 = 14/9 = 1 5/9`.''',
    "tiu-modul-s26": '''## Operasi hitung pecahan desimal

**Penjumlahan.** Urutkan pecahan sesuai nilai tempatnya, luruskan tanda komanya, lalu jumlahkan seperti biasa.

Contoh: `2,273 + 10,51 = 12,783`.

**Pengurangan.** Sama seperti penjumlahan, luruskan dulu tanda komanya.

Contoh: `6,547 - 2,19 = 4,357`.

**Perkalian.** Perhatikan banyaknya angka di belakang koma dari bilangan-bilangan yang dikalikan.

Contoh:

- `2,7 x 2 = 5,4` (satu angka di belakang koma)
- `3,41 x 0,5 = 1,705` (tiga angka di belakang koma)
- `4,63 x 2,01 = 9,3063` (empat angka di belakang koma)

**Pembagian.** Sebaiknya pembagi diubah dulu menjadi bilangan bulat dengan mengalikan pembagi dan bilangan yang dibagi dengan 10, 100, 1.000, atau kelipatannya.

Contoh: `4,5 : 0,9 = 45 : 9 = 5`.

Contoh: `3,75 : 2,5 = 375 : 250 = 1,5`.

## Perbandingan

Perbandingan adalah membandingkan dua nilai atau lebih yang sejenis, misalnya tinggi dengan tinggi atau berat dengan berat.

Contoh: suatu kelas terdiri dari 24 siswa putri dan 16 siswa putra. Perbandingan jumlah siswa putri dan siswa putra adalah 24 : 16, yang dapat disederhanakan menjadi 3 : 2.

**Perbandingan dua nilai.** Bentuk umum: A : B = a : b.

- Menghitung nilai A jika B diketahui: `A = (a/b) x B`
- Menghitung nilai B jika A diketahui: `B = (b/a) x A`
- Jika jumlah A dan B diketahui: `B = (b/(a+b)) x (A+B)`
- Jika selisih A dan B diketahui: `A = (a/(a-b)) x (A-B)`

Contoh: umur A : umur B = 2 : 5. Selisih umur A dan B adalah 6 tahun. Tentukan umur A!

Jawab: selisih perbandingan adalah `5 - 2 = 3`. Umur A = `(2/3) x 6 = 4` tahun.

**Perbandingan tiga nilai.** Bentuk umum: A : B : C = a : b : c.

Contoh: jumlah uang A, B, dan C adalah Rp180.000,00. Uang A : uang B : uang C = 2 : 3 : 4. Berapa uang mereka masing-masing?

Jawab: jumlah perbandingan adalah `2 + 3 + 4 = 9`.

- Uang A = `(2/9) x 180.000 = Rp40.000,00`
- Uang B = `(3/9) x 180.000 = Rp60.000,00`
- Uang C = `(4/9) x 180.000 = Rp80.000,00`

## Skala

Skala adalah perbandingan ukuran pada gambar dengan ukuran sebenarnya. Misalnya pada peta tertulis skala 1 : 2.500.000, artinya 1 cm pada peta mewakili 2.500.000 cm pada ukuran sebenarnya.

Rumus: `skala = ukuran pada gambar / ukuran sebenarnya`.

Akibatnya:

- Ukuran pada gambar = ukuran sebenarnya x skala
- Ukuran sebenarnya = ukuran pada gambar / skala

Contoh: panjang dan lebar ruang tamu adalah 6 m dan 5 m. Apabila digambar dengan skala 1 : 100, berapakah ukuran panjang dan lebar ruangan pada gambar?

Jawab: panjang pada gambar = `600 cm x (1/100) = 6 cm`. Lebar pada gambar = `500 cm x (1/100) = 5 cm`.''',
    "tiu-modul-s27": '''Aritmetika sosial banyak menggunakan aplikasi persen, yaitu menyelesaikan masalah sehari-hari yang berkaitan dengan persen. Persen (%) adalah perseratus.

Contoh kejadian sehari-hari yang berkaitan dengan persen antara lain:

- Menentukan untung, rugi, dan potongan harga pada jual beli
- Menentukan bunga simpan pinjam uang di koperasi atau bank
- Menentukan berat bruto dan neto pada barang

## Pengertian untung dan rugi

- **Untung** adalah harga penjualan lebih besar dari harga pembelian.
- **Rugi** adalah harga penjualan lebih kecil dari harga pembelian.

Rumusnya:

- Untung = harga penjualan - harga pembelian
- Rugi = harga pembelian - harga penjualan
- Harga penjualan = harga pembelian + untung
- Harga penjualan = harga pembelian - rugi

## Trik mengerjakan soal cerita

1. Buat permisalan untuk hal yang diketahui di soal. Tipe soal cerita akan lebih mudah dikerjakan kalau yang diketahui sudah dibuat permisalan.
2. Perkiraan waktu mengerjakan tiap soal adalah 1 menit. Jangan terpaku pada soal yang sulit, jawablah dari soal yang dianggap mudah. Beri tanda pada langkah pengerjaan yang macet supaya kalau ada sisa waktu, kamu tidak perlu mengulang dari awal.''',
    "tiu-modul-s28": '''## Pengertian untung dan rugi

Seorang penjual dikatakan memperoleh keuntungan apabila dapat menjual barang dagangannya dengan harga yang lebih tinggi dari harga pembelian.

Sebaliknya, jika pedagang menjual dengan harga yang lebih rendah dari harga pembelian, pedagang itu mengalami kerugian.

Contoh: Pak Adi membeli ayam dengan harga Rp20.000,00. Beberapa hari kemudian, ia menjual ayam itu dengan harga Rp18.000,00.

a. Untung atau rugikah yang dialami Pak Adi?

b. Berapa untung atau ruginya?

Jawab: harga penjualan (Rp18.000,00) lebih kecil dari harga pembelian (Rp20.000,00), jadi Pak Adi mengalami kerugian. Besar kerugiannya adalah `Rp20.000,00 - Rp18.000,00 = Rp2.000,00`.

## Persentase untung atau rugi

Persentase untung atau rugi adalah menuliskan untung atau rugi yang semula dalam satuan rupiah menjadi bentuk persen. Rumusnya:

- Untung = persentase untung x harga beli
- Rugi = persentase rugi x harga beli
- Persentase untung = (untung / harga pembelian) x 100%
- Persentase rugi = (rugi / harga pembelian) x 100%

Contoh: seorang pedagang memperoleh keuntungan 5%. Jika harga pembelian Rp100.000,00, tentukan besar keuntungannya!

Jawab: untung = `5% x Rp100.000,00 = Rp5.000,00`.

Contoh: Pak Darmo menjual buah-buahan. Karena ada buah yang busuk, Pak Darmo menderita kerugian 20% atau Rp20.000,00. Berapa rupiah hasil penjualan buah-buahan Pak Darmo?

Jawab: rugi = persentase rugi x harga beli, jadi `Rp20.000,00 = 20% x harga beli`, sehingga harga beli = Rp100.000,00. Harga penjualan = harga pembelian - rugi = `Rp100.000,00 - Rp20.000,00 = Rp80.000,00`.

Contoh: Ali membeli beras 100 kg seharga Rp200.000,00. Beras itu kemudian dijual dengan keuntungan 10%. Hitunglah besar keuntungan dan harga jual per kilogram!

Jawab:

1. Keuntungan = `10% x Rp200.000,00 = Rp20.000,00`.
2. Harga jual seluruhnya = `Rp200.000,00 + Rp20.000,00 = Rp220.000,00`. Harga jual per kilogram = `Rp220.000,00 : 100 = Rp2.200,00`.''',
    "tiu-modul-s29": '''## Perhitungan bunga

Bunga adalah keuntungan yang diberikan bank kepada nasabah (penabung) dalam jangka waktu tertentu. Rumusnya:

- Bunga (dalam rupiah) = bunga dalam persen x modal
- Bunga (dalam persen) = (bunga dalam rupiah / modal) x 100%

Contoh: Ali menabung uang Rp180.000,00 di bank dengan bunga 8% per tahun. Berapakah bunga 1 tahun dan uang Ali setelah menabung selama 2 tahun?

Jawab:

a. Bunga 1 tahun = `8% x Rp180.000,00 = Rp14.400,00`.

b. Uang setelah 2 tahun = modal + bunga 2 tahun = `Rp180.000,00 + (2 x Rp14.400,00) = Rp180.000,00 + Rp28.800,00 = Rp208.800,00`.

## Bruto, neto, dan tara

- **Bruto** adalah berat benda dengan bungkus (berat kotor).
- **Neto** adalah berat benda tanpa bungkus (berat bersih).
- **Tara** adalah berat bungkus (selisih antara bruto dan neto).

Contoh: berat kecap dan botolnya disebut bruto, berat kecapnya saja disebut neto, dan berat botolnya disebut tara.

Rumusnya:

- Bruto = neto + tara
- Neto = bruto - tara
- Tara = bruto - neto

Contoh: Boni membeli gula pasir satu karung. Pada karung tertulis bruto 90 kg dan tara 5%. Hitunglah netonya!

Jawab: tara = `5% x 90 kg = 4,5 kg`. Neto = `90 kg - 4,5 kg = 85,5 kg`.

Contoh: pada satu kantong terigu tertulis bruto 50 kg dan neto 48,5 kg. Berapa taranya dan berapa persen taranya?

Jawab: tara = `50 kg - 48,5 kg = 1,5 kg`. Tara dalam persen = `(1,5 / 50) x 100% = 3%`.

## Rabat atau diskon

Rabat atau diskon adalah potongan harga yang diberikan penjual kepada pembeli, dan biasanya dinyatakan dalam persen.''',
    "tiu-modul-s30": '''## Ringkas 5: Debit

Debit adalah kecepatan aliran zat cair yang mengalir pada waktu tertentu. Debit sama dengan volume per waktu.

Rumus: `d = v / t`, dengan `d` adalah debit, `v` adalah volume, dan `t` adalah waktu. Dari rumus ini diperoleh juga `v = d x t` dan `t = v / d`.

Satuan debit yang sering dipakai adalah liter per detik, liter per menit, dan m kubik per jam.

## Contoh Soal

Sebuah bak berisi 120 liter air terisi penuh dalam 10 menit. Berapa debit aliran airnya?

Jawab: `d = v / t = 120 liter / 10 menit = 12 liter per menit`.''',
    "tiu-modul-s31": '''## Ringkas 6: Pengukuran

Pengukuran adalah proses menghitung ukuran suatu benda dengan alat tertentu. Hasil pengukuran disebut ukuran.

## Jenis Ukuran yang Dipelajari

- Ukuran sudut.
- Ukuran volume.
- Ukuran berat.
- Ukuran waktu.

Setiap jenis ukuran mempunyai satuan dan cara mengubahnya masing-masing.''',
    "tiu-modul-s32": '''## Ukuran sudut

Sudut adalah bangun yang dibentuk oleh dua sinar garis yang bersekutu di titik pangkalnya. Masing-masing sinar garis disebut kaki sudut, sedangkan pangkal kedua sinar garis disebut titik sudut.

Alat untuk mengukur besar sudut adalah busur derajat. Satuan sudut adalah derajat. Satu putaran penuh atau satu lingkaran penuh sama dengan 360 derajat.

Contoh: sudut setengah putaran = `1/2 x 360 derajat = 180 derajat`.

### Sudut antara dua jarum jam

Sudut antara dua jarum jam adalah sudut terkecil yang dibentuk oleh jarum panjang dan jarum pendek.

- Satu putaran penuh jarum pendek ditempuh dalam 12 langkah (12 jam). Jadi, setiap langkah jarum pendek menunjukkan `360 : 12 = 30 derajat`.
- Satu putaran penuh jarum panjang ditempuh dalam 60 langkah (60 menit). Jadi, setiap langkah jarum panjang menunjukkan `360 : 60 = 6 derajat`.
- Jarum pendek juga bergeser 0,5 derajat setiap menit.

Contoh: tentukan besar sudut yang dibentuk jarum jam pada pukul 02.20!

Jawab: posisi jarum pendek = `(2 + 20/60) x 30 derajat = 70 derajat`. Posisi jarum panjang = `20 x 6 derajat = 120 derajat`. Selisihnya = `120 - 70 = 50 derajat`.

Contoh: tentukan besar sudut yang dibentuk jarum jam pada pukul 07.24!

Jawab: posisi jarum pendek = `(7 + 24/60) x 30 derajat = 222 derajat`. Posisi jarum panjang = `24 x 6 derajat = 144 derajat`. Selisihnya = `222 - 144 = 78 derajat`.

Contoh: tentukan besar sudut yang dibentuk jarum jam pada pukul 10.08!

Jawab: posisi jarum pendek = `(10 + 8/60) x 30 derajat = 304 derajat`. Posisi jarum panjang = `8 x 6 derajat = 48 derajat`. Selisihnya = `304 - 48 = 256 derajat`. Karena yang dicari adalah sudut terkecil, jawabannya adalah `360 - 256 = 104 derajat`.

## Ukuran panjang

Panjang adalah ukuran jarak dari ujung ke ujung. Urutan satuan panjang dari besar ke kecil adalah km, hm, dam, m, dm, cm, mm.

Tips:

- Setiap turun satu tingkat berarti mengalikan 10 atau menambah satu nol.
- Setiap naik satu tingkat berarti membagi 10 atau mengurangi satu nol.

Contoh:

- `1 km = 10 hm = 100 dam = 1.000 m`
- `1,375 km = 13,75 hm = 137,5 dam = 1.375 m`
- `1.000 m = 100 dam = 10 hm = 1 km`
- `1.625 m = 162,5 dam = 16,25 hm = 1,625 km`

Satuan panjang yang lain adalah: 1 inci = 2,54 cm; 1 kaki = 12 inci = 30,48 cm; 1 yard = 3 kaki = 91,44 cm.

## Ukuran luas

Luas adalah ukuran panjang lebarnya bidang, misalnya taman, lapangan, dan petak sawah. Satuan luas merupakan pangkat dua dari satuan panjang. Urutannya adalah km2, hm2, dam2, m2, dm2, cm2, mm2.

Tips:

- Setiap turun satu tingkat berarti mengalikan 100 atau menambah 2 nol.
- Setiap naik satu tingkat berarti membagi 100 atau mengurangi 2 nol.

Contoh:

- `1 m2 = 100 dm2 = 10.000 cm2 = 1.000.000 mm2`
- `0,1625 km2 = 16,25 hm2 = 1.625 dam2 = 162.500 m2`
- `1.000.000 m2 = 10.000 dam2 = 100 hm2 = 1 km2`
- `137.500 m2 = 13.750 dam2 = 137,5 hm2 = 0,1375 km2`

Satuan luas yang lain adalah are. Urutannya adalah ka, ha, daa, a, da, ca, ma. Setiap turun satu tingkat dikali 10, setiap naik satu tingkat dibagi 10.

Contoh: `1 a = 10 da = 100 ca = 1.000 ma`. `5,678 ka = 56,78 ha = 567,8 daa = 5.678 a`. `9.876 a = 987,6 daa = 98,76 ha = 9,876 ka`.

Kesetaraan antarsatuan luas: `1 ha = 1 hm2`, `1 a = 1 dam2`, `1 ca = 1 m2`.''',
    "tiu-modul-s33": '''Volume adalah isi atau besarnya benda dalam ruang. Satuan volume diperoleh dengan mengalikan satuan panjang, satuan lebar, dan satuan tinggi. Urutan satuan volume dari besar ke kecil adalah km3, hm3, dam3, m3, dm3, cm3, mm3.

Tips:

- Setiap turun satu tingkat berarti mengalikan 1.000 atau menambah tiga nol.
- Setiap naik satu tingkat berarti membagi 1.000 atau mengurangi tiga nol.

Contoh:

- `1 km3 = 1.000 hm3 = 1.000.000 dam3 = 1.000.000.000 m3`
- `0,375 km3 = 375 hm3 = 375.000 dam3 = 375.000.000 m3`
- `875.000.000 m3 = 875.000 dam3 = 875 hm3 = 0,875 km3`

Catatan: sentimeter kubik (cm3) sama dengan cc.

## Satuan volume liter

Selain satuan kubik, kita mengenal satuan volume liter. Urutannya adalah kl, hl, dal, l, dl, cl, ml.

Tips:

- Setiap turun satu tingkat berarti mengalikan 10 atau menambah satu nol.
- Setiap naik satu tingkat berarti membagi 10 atau mengurangi satu nol.

Contoh:

- `1 kl = 10 hl = 100 dal = 1.000 l`
- `1,234 l = 12,34 dl = 123,4 cl = 1.234 ml`
- `1.750 l = 175 dal = 17,5 hl = 1,75 kl`

Kesetaraan yang sering dipakai: `1 liter = 1 dm3`, `1 ml = 1 cm3 = 1 cc`.

Satuan volume yang lain adalah: 1 galon = 3,785 liter; 1 barel = 42 galon = 159 liter.''',
    "tiu-modul-s34": '''## Ukuran berat

Urutan satuan berat dari besar ke kecil adalah kg, hg, dag, g, dg, cg, mg.

Tips:

- Setiap turun satu tingkat berarti mengalikan 10 atau menambah satu nol.
- Setiap naik satu tingkat berarti membagi 10 atau mengurangi satu nol.

Contoh:

- `1 kg = 10 hg = 100 dag = 1.000 g`
- `1,25 kg = 12,5 hg = 125 dag = 1.250 g`
- `135 dag = 13,5 hg = 1,35 kg = 1.350 g`

Satuan ukuran berat yang lain adalah:

- 1 ton = 10 kuintal = 1.000 kg
- 1 kuintal = 100 kg
- 1 kg = 2 pon
- 1 pon = 500 gram
- 1 ons = 100 gram
- 1 pikul = 100 kati = 62,5 kg
- 1 kati = 625 gram

## Ukuran kuantitas

Satuan kuantitas menunjukkan jumlah dari sekumpulan benda.

- 1 lusin = 12 buah
- 1 gros = 144 buah
- 1 kodi = 20 buah
- 1 rim = 500 lembar

Contoh: `3 rim = 3 x 500 lembar = 1.500 lembar`. `10 kodi = 10 x 20 buah = 200 buah`. `5 lusin = 5 x 12 buah = 60 buah`. `2 gros = 2 x 144 buah = 288 buah`.''',
    "tiu-modul-s35": '''## Ukuran waktu

Dalam satu hari satu malam ada 24 jam. Penulisan pukul 12.00 malam sampai pukul 12.00 siang adalah 00.00 sampai 12.00, sedangkan pukul 12.00 siang sampai pukul 12.00 malam adalah 12.00 sampai 24.00.

Contoh: pukul lima lebih 20 menit pagi ditulis 05.20. Pukul lima lebih 20 menit sore ditulis 17.20.

Beberapa satuan ukuran waktu yang lain adalah:

- 1 abad = 100 tahun
- 1 dekade = 10 tahun
- 1 windu = 8 tahun
- 1 lustrum = 5 tahun
- 1 tahun = 365 hari (1 tahun kabisat = 366 hari)
- 1 tahun = 12 bulan
- 1 semester = 6 bulan
- 1 caturwulan = 4 bulan
- 1 triwulan = 3 bulan
- 1 bulan = 4 minggu
- 1 minggu = 7 hari
- 1 hari = 24 jam
- 1 jam = 60 menit
- 1 menit = 60 detik
- 1 jam = 3.600 detik

Contoh: hasil dari 2 jam + 30 menit - 600 detik adalah berapa menit?

Jawab: 2 jam = 120 menit, 600 detik = 10 menit. Jadi, `120 + 30 - 10 = 140 menit`.

## Jarak dan kecepatan

Jarak adalah besaran yang menunjukkan jauh dekatnya suatu benda. Satuannya sama dengan satuan panjang, yakni km, hm, dam, m, dm, cm, mm.

Kecepatan adalah jarak yang ditempuh setiap waktu, dirumuskan:

- Kecepatan = jarak / waktu
- Jarak = kecepatan x waktu
- Waktu = jarak / kecepatan

Contoh: Andi berangkat dari kota Yogyakarta pukul 07.00 naik sepeda motor dengan kecepatan 40 km/jam, sampai Klaten pukul 08.00. Berapa jarak kota Yogyakarta dengan kota Klaten?

Jawab: lama perjalanan = `08.00 - 07.00 = 1 jam`. Jarak = `1 jam x 40 km/jam = 40 km`.''',
    "tiu-modul-s36": '''## Ringkas 7: Bangun Datar

Bangun datar adalah bangun geometri yang berbentuk datar, hanya mempunyai panjang dan lebar.

Bangun datar yang akan kita pelajari adalah segitiga, persegi panjang, persegi, trapesium, jajargenjang, belah ketupat, layang-layang, dan lingkaran. Setiap bangun mempunyai rumus luas dan keliling masing-masing.''',
    "tiu-modul-s37": '''## Sifat-sifat segitiga

Segitiga adalah bangun datar yang dibentuk oleh 3 titik yang letaknya tidak segaris dan saling dihubungkan. Jumlah sudut dalam sebuah segitiga adalah 180 derajat.

Berdasarkan panjang sisinya, segitiga dibagi menjadi 3 jenis:

- **Segitiga sembarang**, panjang ketiga sisinya berlainan.
- **Segitiga sama kaki**, panjang dua sisinya sama.
- **Segitiga sama sisi**, panjang ketiga sisinya sama.

Berdasarkan besar sudutnya, segitiga dibagi menjadi 3 jenis:

- **Segitiga siku-siku**, besar salah satu sudutnya 90 derajat.
- **Segitiga lancip**, ketiga sudutnya merupakan sudut lancip (0 sampai 90 derajat).
- **Segitiga tumpul**, salah satu sudutnya merupakan sudut tumpul (90 sampai 180 derajat).

## Keliling dan luas segitiga

- Keliling segitiga = sisi + sisi + sisi
- Luas segitiga = 1/2 x alas x tinggi, dengan alas dan tinggi selalu tegak lurus

Contoh: tentukan keliling segitiga sama sisi yang panjang sisinya 12 cm!

Jawab: keliling segitiga = `12 + 12 + 12 = 36 cm`.

Contoh: tentukan luas segitiga yang alasnya 10 cm dan tingginya 6 cm!

Jawab: luas segitiga = `1/2 x 10 x 6 = 30 cm2`.''',
    "tiu-modul-s38": '''## Segitiga tumpul

Segitiga tumpul adalah segitiga yang salah satu sudutnya merupakan sudut tumpul, yaitu sudut yang besarnya lebih dari 90 derajat dan kurang dari 180 derajat.

## Teorema Pythagoras

Untuk membantu perhitungan luas atau keliling segitiga siku-siku, kita mengenal teorema Pythagoras. Teorema ini menyatakan bahwa kuadrat sisi miring pada segitiga siku-siku sama dengan jumlah kuadrat sisi siku-sikunya, dirumuskan:

`a^2 + b^2 = c^2`

dengan c adalah sisi miring (sisi terpanjang) dan a, b adalah sisi siku-sikunya.

Contoh: tentukan keliling segitiga siku-siku yang sisi siku-sikunya 3 cm dan 4 cm!

Jawab: cari dulu sisi miringnya dengan teorema Pythagoras.

`c^2 = 3^2 + 4^2 = 9 + 16 = 25`, jadi `c = 5 cm`.

Keliling segitiga = `3 + 4 + 5 = 12 cm`.

Tripel Pythagoras yang sering muncul adalah 3, 4, 5; 5, 12, 13; 6, 8, 10; 8, 15, 17; dan 9, 12, 15.''',
    "tiu-modul-s39": '''## Persegi panjang

Persegi panjang adalah bangun datar yang dibentuk oleh empat titik yang tidak segaris dan saling dihubungkan.

Sifat-sifat persegi panjang:

- Sisi yang berhadapan sama panjang.
- Keempat sudutnya siku-siku, besarnya 90 derajat.
- Memiliki 2 sumbu simetri.
- Diagonalnya saling membagi dua sama panjang.
- Dapat menempati bingkainya dengan 4 cara.

Keliling dan luas persegi panjang:

- Keliling persegi panjang = `2 x (p + l)`
- Luas persegi panjang = `p x l`

dengan p adalah panjang dan l adalah lebar.

Contoh: tentukan keliling dan luas persegi panjang yang panjangnya 9 dm dan lebarnya 35 cm!

Jawab: ubah dulu satuannya, 9 dm = 90 cm.

Keliling = `2 x (90 + 35) = 2 x 125 = 250 cm`.

Luas = `90 x 35 = 3.150 cm2`.

## Persegi

Persegi adalah persegi panjang yang ukuran panjang dan lebarnya sama.

Sifat-sifat persegi:

- Keempat sisinya sama panjang.
- Keempat sudutnya siku-siku, besarnya 90 derajat.
- Memiliki 4 sumbu simetri.
- Diagonalnya berpotongan tegak lurus dan saling membagi dua sama panjang.
- Dapat menempati bingkainya dengan 8 cara.

Keliling dan luas persegi:

- Keliling persegi = `4 x sisi`
- Luas persegi = `sisi x sisi = s^2`

Contoh: tentukan keliling dan luas persegi yang panjang rusuknya 12 cm!

Jawab: keliling persegi = `4 x 12 = 48 cm`. Luas persegi = `12 x 12 = 144 cm2`.''',
    "tiu-modul-s40": '''## Trapesium

Trapesium adalah bangun datar yang dibentuk oleh 4 titik sudut dan 2 sisi yang berhadapan sejajar.

Ada 3 jenis trapesium, yaitu:

- **Trapesium sama kaki**, sifat-sifatnya: memiliki sepasang sisi sejajar, memiliki sepasang sisi yang sama panjang, dan memiliki dua pasang sudut yang sama besar.
- **Trapesium siku-siku**, sifat-sifatnya: memiliki 2 sudut siku-siku yang besarnya 90 derajat, serta memiliki 1 sudut tumpul dan 1 sudut lancip.
- **Trapesium sembarang**, sifatnya: keempat sudutnya memiliki besar yang berbeda-beda.

Keliling dan luas trapesium:

- Keliling trapesium = sisi + sisi + sisi + sisi
- Luas trapesium = `((a + b) x t) / 2`

dengan a dan b adalah sepasang sisi yang sejajar dan t adalah tinggi.

Contoh: tentukan luas trapesium yang sisi sejajarnya 4 dan 10, dengan tinggi 14!

Jawab: luas trapesium = `((4 + 10) x 14) / 2 = (14 x 14) / 2 = 98` satuan luas.

## Jajargenjang

Sifat-sifat jajargenjang:

- Sisi yang berhadapan sejajar dan sama panjang.
- Sudut yang berhadapan besarnya sama.
- Diagonalnya saling membagi dua sama panjang.
- Dapat menempati bingkainya dengan 2 cara.

Keliling dan luas jajargenjang:

- Keliling jajargenjang = sisi + sisi + sisi + sisi
- Luas jajargenjang = `alas x tinggi`

Contoh: tentukan keliling dan luas jajargenjang yang alasnya 10 cm, sisi miringnya 6 cm, dan tingginya 8 cm!

Jawab: keliling = `2 x (10 + 6) = 32 cm`. Luas = `10 x 8 = 80 cm2`.''',
    "tiu-modul-s41": '''## Sifat-sifat belah ketupat

Belah ketupat adalah bangun datar segi empat yang keempat sisinya sama panjang.

Sifat-sifat belah ketupat:

- Keempat sisinya sama panjang.
- Sudut yang berhadapan sama besar.
- Diagonalnya berpotongan tegak lurus dan saling membagi dua sama panjang.
- Memiliki 2 sumbu simetri.
- Dapat menempati bingkainya dengan 4 cara.

## Keliling dan luas belah ketupat

- Keliling belah ketupat = `4 x sisi`
- Luas belah ketupat = `(d1 x d2) / 2`

dengan d1 dan d2 adalah diagonal-diagonal belah ketupat.

Contoh: tentukan keliling dan luas belah ketupat yang sisinya 10 cm dan diagonalnya 12 cm dan 16 cm!

Jawab: keliling = `4 x 10 = 40 cm`. Luas = `(12 x 16) / 2 = 96 cm2`.''',
    "tiu-modul-s42": '''## Layang-layang

Sifat-sifat layang-layang:

- Sepasang sisinya sama panjang.
- Sepasang sudut yang berhadapan sama besar.
- Diagonalnya berpotongan tegak lurus dan saling membagi dua sama panjang.
- Memiliki sebuah sumbu simetri.
- Dapat menempati bingkainya dengan 2 cara.

Keliling dan luas layang-layang:

- Keliling layang-layang = sisi + sisi + sisi + sisi
- Luas layang-layang = `(d1 x d2) / 2`

dengan d1 dan d2 adalah diagonal-diagonal layang-layang.

Contoh: tentukan luas layang-layang yang diagonalnya 8 cm dan 12 cm!

Jawab: luas = `(8 x 12) / 2 = 48 cm2`.

## Lingkaran

Lingkaran adalah tempat kedudukan titik-titik yang berjarak sama dari titik pusat.

Sifat-sifat lingkaran:

- Memiliki 1 titik pusat.
- Memiliki jari-jari yang panjangnya setengah dari diameter (d = 2r).
- Jumlah sudutnya 360 derajat.
- Mempunyai simetri lipat dan simetri putar yang tak hingga banyaknya.
- Mempunyai sumbu simetri yang tak hingga banyaknya.

Keliling dan luas lingkaran:

- Keliling lingkaran = `2 x pi x r = pi x d`
- Luas lingkaran = `pi x r^2 = (pi x d^2) / 4`

dengan pi = 22/7 atau 3,14.

Contoh: tentukan keliling lingkaran yang diameternya 14 cm!

Jawab: keliling = `22/7 x 14 = 44 cm`.

Contoh: tentukan luas lingkaran yang jari-jarinya 7 cm!

Jawab: luas = `22/7 x 7 x 7 = 154 cm2`.''',
    "tiu-modul-s43": '''Sebuah bangun datar yang seimbang dikatakan bersifat simetri. Ada dua jenis simetri yang dikenal, yaitu simetri lipat dan simetri putar.

## Simetri lipat

Simetri lipat membagi sebuah bidang datar menjadi dua bagian yang tepat sama besar dengan cara melipatnya. Garis lipatnya disebut sumbu simetri. Bangun yang memiliki simetri lipat adalah bangun yang simetris.

Contoh banyaknya sumbu simetri:

- Persegi: 4 sumbu simetri
- Persegi panjang: 2 sumbu simetri
- Segitiga sama sisi: 3 sumbu simetri
- Segitiga sama kaki: 1 sumbu simetri
- Belah ketupat: 2 sumbu simetri
- Lingkaran: tak hingga sumbu simetri

## Simetri putar

Simetri putar adalah banyaknya cara memutar bangun datar agar dapat menempati bingkainya jika bangun datar tersebut diputar sejauh satu putaran penuh.

Bangun yang diputar sekali dengan pusat putaran dan dapat menempati bingkainya (kembali ke posisi semula) dikatakan memiliki simetri putar tingkat 1.

Bangun yang diputar dua kali dan dapat kembali ke posisi semula dikatakan memiliki simetri putar tingkat 2, dan seterusnya.

Contoh: belah ketupat diputar setengah putaran (180 derajat) searah jarum jam dengan pusat putaran di perpotongan diagonalnya, lalu diputar setengah putaran lagi, sehingga kembali ke posisi semula.

Dengan dua kali putaran, belah ketupat sudah kembali ke posisi semula. Oleh karena itu, belah ketupat memiliki simetri putar tingkat 2.

Contoh tingkat simetri putar: persegi tingkat 4, persegi panjang tingkat 2, segitiga sama sisi tingkat 3, segitiga sama kaki tingkat 1, dan lingkaran tak hingga.''',
    "tiu-modul-s44": '''Bangun ruang adalah bangun 3 dimensi karena mempunyai tiga ukuran, yaitu ukuran panjang, ukuran lebar, dan ukuran tinggi. Berikut ini beberapa jenis bangun ruang beserta sifat-sifatnya.

## Kubus

Sifat-sifat kubus:

- Banyaknya sisi: 6 (berbentuk persegi)
- Banyaknya titik sudut: 8
- Banyaknya rusuk: 12, terdiri dari 4 rusuk tegak dan 8 rusuk mendatar
- Terdapat 12 diagonal sisi (masing-masing sisi mempunyai 2 diagonal sisi)
- Terdapat 4 diagonal ruang

Luas dan volume kubus:

- Luas kubus = `6 x s^2`
- Volume kubus = `s x s x s = s^3`

dengan s adalah panjang rusuk kubus.

Contoh: tentukan luas dan volume kubus yang panjang rusuknya 7 cm!

Jawab: luas kubus = `6 x 7^2 = 6 x 49 = 294 cm2`. Volume kubus = `7^3 = 343 cm3`.

## Balok

Sifat-sifat balok:

- Banyaknya sisi: 6 (berbentuk persegi panjang), pasangan sisi yang berhadapan sama besar
- Banyaknya titik sudut: 8
- Banyaknya rusuk: 12, terdiri dari 4 rusuk panjang, 4 rusuk lebar, dan 4 rusuk tinggi

Luas dan volume balok:

- Luas balok = `2 x ((p x l) + (p x t) + (l x t))`
- Volume balok = `p x l x t`

dengan p adalah panjang, l adalah lebar, dan t adalah tinggi.

Contoh: diketahui balok dengan ukuran 12 cm x 10 cm x 8 cm. Tentukan luas permukaan dan volumenya!

Jawab: luas = `2 x ((12 x 10) + (12 x 8) + (10 x 8)) = 2 x (120 + 96 + 80) = 2 x 296 = 592 cm2`. Volume = `12 x 10 x 8 = 960 cm3`.

## Prisma tegak segitiga

Prisma adalah bangun ruang yang dibatasi dua bidang yang sejajar (atap dan alas) dan beberapa bidang tegak yang memotong bidang sejajar tersebut. Jenis prisma ditentukan oleh bentuk atap dan alasnya.

Ciri-ciri prisma tegak segitiga:

- Mempunyai 5 sisi
- Bentuk alas dan atapnya segitiga
- Rusuk tegak sama panjang
- Mempunyai 6 titik sudut
- Mempunyai 9 rusuk

Untuk prisma segi-n berlaku: banyak sisi = n + 2, banyak rusuk = 3n, banyak titik sudut = 2n.

Luas dan volume prisma tegak segitiga:

- Luas prisma = `2 x luas alas + luas sisi tegak`
- Volume prisma = `luas alas x tinggi`

Contoh: diketahui prisma tegak segitiga ABC.DEF. Alasnya berbentuk segitiga siku-siku ABC di titik B dengan panjang AB = 8 cm dan BC = 6 cm. Bila tinggi prisma = 10 cm, tentukan volume prisma tersebut!

Jawab: luas segitiga ABC = `1/2 x 8 x 6 = 24 cm2`. Volume prisma = `24 x 10 = 240 cm3`.

## Tabung

Tabung adalah prisma tegak yang alas dan tutupnya berbentuk lingkaran.

Sifat-sifat tabung:

- Alas dan tutupnya berbentuk lingkaran
- Mempunyai 2 rusuk
- Mempunyai 3 bidang sisi

Luas dan volume tabung:

- Volume tabung = `luas alas x tinggi = pi x r^2 x t`
- Luas tabung = `luas alas + luas tutup + luas selimut = 2 x pi x r x (r + t)`

Contoh: tentukan luas permukaan tabung yang jari-jarinya 14 cm dan tingginya 10 cm!

Jawab: luas tabung = `2 x (22/7) x 14 x (14 + 10) = 88 x 24 = 2.112 cm2`.

## Limas

Limas adalah bangun ruang yang terbentuk dari sebuah bidang datar segi banyak yang dihubungkan dengan sejumlah segitiga ke suatu titik tertentu. Jenis limas disesuaikan dengan segi banyak yang menyusun alasnya.

Ciri-ciri limas segitiga (T.ABC):

- Alasnya berbentuk segitiga
- Mempunyai 4 titik sudut
- Mempunyai 4 sisi
- Mempunyai 6 rusuk

Ciri-ciri limas segi empat (T.ABCD):

- Alasnya berbentuk segi empat
- Mempunyai 5 sisi
- Mempunyai 5 titik sudut
- Mempunyai 8 rusuk

Untuk limas segi-n berlaku: banyak sisi = n + 1, banyak rusuk = 2n, banyak titik sudut = n + 1.

Luas dan volume limas:

- Luas limas = `luas alas + luas sisi tegak`
- Volume limas = `(1/3) x luas alas x tinggi`

Contoh: diketahui limas T.ABCD dengan alas ABCD berbentuk persegi dengan sisi 10 cm dan tinggi limas 12 cm. Tentukan luas sisi-sisi limas dan volumenya!

Jawab: tinggi segitiga sisi tegak adalah 13 cm, karena `akar(12^2 + 5^2) = akar(144 + 25) = akar(169) = 13`.

Luas sisi-sisi limas = luas alas + 4 x luas segitiga tegak = `(10 x 10) + 4 x (1/2 x 10 x 13) = 100 + 260 = 360 cm2`.

Volume limas = `(1/3) x 10 x 10 x 12 = 400 cm3`.

## Kerucut

Kerucut adalah limas yang alasnya berbentuk lingkaran.

Sifat-sifat kerucut:

- Mempunyai 2 permukaan, yaitu alas dan selimut
- Mempunyai 1 titik sudut
- Alasnya berbentuk lingkaran

Luas dan volume kerucut:

- Luas kerucut = `luas alas + luas selimut = pi x r x (r + s)`
- Volume kerucut = `(1/3) x pi x r^2 x t`

dengan r adalah jari-jari lingkaran alas, t adalah tinggi kerucut, dan s adalah panjang garis pelukis yang dapat dicari dengan teorema Pythagoras: `s^2 = r^2 + t^2`.

Contoh: diketahui kerucut dengan jari-jari alas 7 cm dan tinggi 24 cm. Bila pi = 22/7, tentukan volume dan luas sisi-sisi kerucut!

Jawab: garis pelukis `s^2 = 24^2 + 7^2 = 576 + 49 = 625`, jadi `s = 25 cm`.

Volume kerucut = `(1/3) x (22/7) x 7 x 7 x 24 = 1.232 cm3`.

Luas sisi kerucut = `(22/7) x 7 x (7 + 25) = 22 x 32 = 704 cm2`.

## Bola

Bola adalah tempat kedudukan titik-titik yang jaraknya sama terhadap titik tertentu yang disebut pusat bola.

Sifat-sifat bola: bola mempunyai 1 sisi, tetapi tidak mempunyai rusuk dan titik sudut.

Luas dan volume bola:

- Luas (kulit) bola = `4 x pi x r^2`
- Volume bola = `(4/3) x pi x r^3`

Contoh: buah jeruk berbentuk bola dengan diameter 14 cm. Buah jeruk tersebut diiris menjadi dua belahan yang sama. Tentukan volume dan luas belahan jeruk!

Jawab: jari-jari jeruk adalah 7 cm.

Volume belahan jeruk = `1/2 x (4/3) x (22/7) x 7^3 = 718,67 cm3`.

Luas belahan jeruk (termasuk bidang irisan yang berbentuk lingkaran) = `3 x pi x r^2 = 3 x (22/7) x 7 x 7 = 462 cm2`.''',
    "tiu-modul-s45": '''Bidang koordinat adalah perpotongan dua garis yang saling tegak lurus. Kedua garis tersebut disebut garis sumbu. Sumbu mendatar disebut sumbu X dan sumbu tegak disebut sumbu Y.

Kedua garis sumbu berpotongan di sebuah titik yang disebut titik pusat atau titik asal dan diberi nama titik O (0,0). Sumbu X dan sumbu Y dibagi dalam skala yang sama.

Koordinat adalah pasangan bilangan yang dipakai untuk menunjukkan letak titik dalam bidang. Sistem penulisan pasangan bilangan absis dan ordinat disebut sistem koordinat.

Perhatikan titik A(3, 4). Pasangan bilangan (3, 4) disebut koordinat titik A. Bilangan yang ditulis pertama, yaitu 3, disebut absis, artinya x = 3. Bilangan yang ditulis kedua, yaitu 4, disebut ordinat, artinya y = 4.

Contoh:

- Titik A(3, 4) artinya memiliki absis 3 dan ordinat 4.
- Titik B(4, -1) artinya memiliki absis 4 dan ordinat -1.
- Titik C(0, -3) artinya memiliki absis 0 dan ordinat -3.
- Titik D(-6, -4) artinya memiliki absis -6 dan ordinat -4.

Contoh membaca koordinat: lima titik berikut ditulis lengkap dengan absis dan ordinatnya.

- Titik A(4, 4), absis = 4 dan ordinat = 4
- Titik B(-5, 2), absis = -5 dan ordinat = 2
- Titik C(2, -4), absis = 2 dan ordinat = -4
- Titik D(-3, -2), absis = -3 dan ordinat = -2
- Titik E(0, -5), absis = 0 dan ordinat = -5''',
    "tiu-modul-s46": '''Pencerminan disebut juga refleksi. Dalam bidang koordinat, yang dapat dijadikan sumbu pencerminan antara lain sumbu X dan sumbu Y.

## Pencerminan terhadap sumbu X

Titik A(2, 3) dicerminkan terhadap sumbu X, hasil pencerminannya adalah titik A'(2, -3).

Secara umum: pencerminan terhadap sumbu X mengubah titik (x, y) menjadi (x, -y). Absisnya tetap, ordinatnya berubah tanda.

Contoh: diketahui segitiga PQR dengan koordinat P(-5, 2), Q(-2, 1), dan R(-3, 3). Tentukan koordinat bayangan segitiga PQR jika dicerminkan terhadap sumbu X!

Jawab: bayangan titik-titiknya adalah P'(-5, -2), Q'(-2, -1), dan R'(-3, -3).

## Pencerminan terhadap sumbu Y

Titik A(2, 3) dicerminkan terhadap sumbu Y, hasil pencerminannya adalah titik A'(-2, 3).

Secara umum: pencerminan terhadap sumbu Y mengubah titik (x, y) menjadi (-x, y). Absisnya berubah tanda, ordinatnya tetap.

Contoh: diketahui segitiga PQR dengan koordinat P(-5, 2), Q(-2, 1), dan R(-3, 3). Tentukan koordinat bayangan segitiga PQR jika dicerminkan terhadap sumbu Y!

Jawab: bayangan titik-titiknya adalah P'(5, 2), Q'(2, 1), dan R'(3, 3).''',
    "tiu-modul-s47": '''## Pengertian data

Data adalah keterangan atau informasi yang benar dan nyata mengenai suatu hal (berdasarkan fakta). Data dapat berupa angka-angka (nilai) atau sifat.

Contoh: dalam 5 kali ulangan matematika, Iqbal mendapat nilai 8, 9, 7, 6, dan 7.

Contoh: data berat badan 4 bayi yang baru dilahirkan adalah 3,1 kg, 2,9 kg, 3,5 kg, dan 3,4 kg.

## Pengumpulan data

Data dapat dikumpulkan melalui beberapa cara, antara lain:

1. Melakukan pencatatan langsung
2. Melakukan wawancara
3. Melakukan penelitian
4. Menyebarkan angket (kuesioner)''',
    "tiu-modul-s48": '''Data yang telah dikumpulkan dapat disajikan dalam beberapa bentuk, antara lain tabel, diagram batang, diagram garis, diagram lingkaran, dan diagram gambar.

Tujuan data disajikan dalam bentuk tabel atau diagram adalah untuk memudahkan orang lain dalam membaca data yang disajikan.

Contoh: Amin mengumpulkan data hasil panen palawija di Desa Suka Makmur selama 4 tahun. Data yang diperoleh adalah sebagai berikut.

- Tahun 2005 hasilnya 25 ton
- Tahun 2006 hasilnya 30 ton
- Tahun 2007 hasilnya 45 ton
- Tahun 2008 hasilnya 40 ton
- Jumlah seluruhnya 140 ton

## Tabel

Data di atas dapat disajikan dalam tabel dengan kolom tahun dan kolom hasil panen (dalam ton):

| Tahun | Hasil panen (ton) |
|---|---:|
| 2005 | 25 |
| 2006 | 30 |
| 2007 | 45 |
| 2008 | 40 |
| Jumlah | 140 |

## Diagram batang

Diagram batang adalah diagram yang disajikan menggunakan batang atau balok. Tinggi setiap batang menunjukkan besarnya data. Misalnya batang tahun 2007 paling tinggi karena hasilnya 45 ton, dan batang tahun 2005 paling pendek karena hasilnya 25 ton.

## Diagram garis

Diagram garis adalah diagram yang disajikan dalam bentuk garis.

Titik-titik data dihubungkan dengan garis sehingga terlihat naik turunnya hasil panen dari tahun ke tahun: naik dari 25 ton (2005) ke 30 ton (2006), naik lagi ke 45 ton (2007), lalu turun ke 40 ton (2008).

## Diagram lingkaran

Diagram lingkaran adalah diagram yang disajikan menggunakan lingkaran yang dibagi menjadi beberapa bagian.

Jumlah sudut dalam satu lingkaran adalah 360 derajat. Besar sudut untuk masing-masing data dapat dihitung dengan cara membagi data dengan jumlah seluruh data, lalu dikali 360 derajat. Hasilnya di bawah ini dibulatkan ke derajat terdekat.

- Hasil panen tahun 2005: `(25/140) x 360 derajat = 64 derajat`
- Hasil panen tahun 2006: `(30/140) x 360 derajat = 77 derajat`
- Hasil panen tahun 2007: `(45/140) x 360 derajat = 116 derajat`
- Hasil panen tahun 2008: `(40/140) x 360 derajat = 103 derajat`

Jumlah keempat sudutnya adalah 360 derajat.

## Diagram gambar

Diagram gambar adalah diagram yang disajikan dalam bentuk gambar yang mewakili data. Misalnya satu gambar mewakili 2 ton, sehingga hasil panen 25 ton digambarkan dengan gambar sebanyak 25 dibagi 2.''',
    "tiu-modul-s49": '''Data yang telah dikumpulkan dapat diurutkan dari yang terbesar hingga yang terkecil atau sebaliknya.

- Data tertinggi adalah data yang nilainya paling besar.
- Data terendah adalah data yang nilainya paling kecil.

Contoh: hasil pengukuran tinggi badan murid kelas VI (dalam cm) adalah sebagai berikut.

150, 140, 153, 145, 152, 160, 165, 147, 154, 151, 149, 155, 156, 140, 156, 156

a. Urutkan data tersebut dari yang terkecil!

b. Berapa cm tinggi anak yang paling tinggi?

Jawab:

a. Urutan dari yang terkecil adalah: 140, 140, 145, 147, 149, 150, 151, 152, 153, 154, 155, 156, 156, 156, 160, 165.

b. Tinggi anak yang paling tinggi adalah 165 cm.''',
    "tiu-modul-s50": '''Data tinggi badan murid kelas VI (dalam cm) dari soal sebelumnya dapat diurutkan agar nilai tertinggi dan terendahnya mudah dibaca. Data tertinggi merupakan data yang nilainya paling besar. Data terendah merupakan data yang nilainya paling kecil.

## a. Urutan data dari yang terkecil

140, 140, 145, 147, 149, 150, 151, 152, 153, 154, 155, 156, 156, 156, 160, 165

## b. Tinggi badan anak yang paling tinggi

165 cm, yaitu data terakhir setelah diurutkan dari yang terkecil.

## c. Tinggi badan anak yang paling pendek

140 cm, yaitu data pertama setelah diurutkan dari yang terkecil.''',
    "tiu-modul-s51": '''## E. Rata-Rata Suatu Data

Rata-rata sama dengan jumlah data dibagi banyak data. Rumus: `rata-rata = jumlah data / banyak data`.

## Contoh Soal

Dalam 8 kali ulangan matematika, Andri memperoleh nilai sebagai berikut: 60, 75, 78, 80, 80, 90, 68, dan 80. Berapa rata-rata nilai ulangan matematika Andri?

Jawab: jumlah data = `60 + 75 + 78 + 80 + 80 + 90 + 68 + 80 = 611`. Banyak data = 8. Rata-rata = `611 / 8 = 76,375`. Jadi, nilai rata-rata ulangan Andri adalah 76,375.''',
    "tiu-modul-s52": '''## F. Modus Suatu Data

Modus adalah data yang paling sering muncul.

## Contoh Soal

Nilai ulangan 11 orang murid adalah 5, 8, 7, 6, 6, 6, 7, 7, 5, 8, dan 7. Berapa modusnya?

Jawab: hitung kemunculan tiap nilai. Nilai 5 muncul 2 kali, nilai 6 muncul 3 kali, nilai 7 muncul 4 kali, dan nilai 8 muncul 2 kali. Data yang paling banyak muncul adalah 7, yaitu sebanyak 4 kali. Jadi modusnya adalah 7.''',
    "tiu-modul-s53": '''## Ringkas 11: Barisan dan Deret

Tes Inteligensia Umum bagian Tes Deret menguji peserta untuk menentukan pola angka atau huruf dari satu suku ke suku berikutnya. Tes ini terbagi menjadi dua bentuk, yaitu bentuk angka dan bentuk huruf.

Tentunya bentuk-bentuk tersebut berasal dari suatu pola atau irama tertentu.

Untuk mengerjakan tes ini, peserta harus mampu menganalisis pola urutan paling logis dan konsisten dari angka-angka atau huruf-huruf yang diberikan. Terkadang seolah ada dua jawaban yang memungkinkan.

Namun demikian, sesungguhnya hanya ada satu pilihan jawaban yang benar sehingga operasi hitung sederhana tetap dibutuhkan.

## Pola yang Sering Muncul

- **Tambah atau kurang tetap.** Contoh: 3, 6, 9, 12, ... (tambah 3).
- **Kali atau bagi tetap.** Contoh: 2, 4, 8, 16, ... (kali 2).
- **Kuadrat.** Contoh: 1, 4, 9, 16, ... (1 kuadrat, 2 kuadrat, 3 kuadrat, 4 kuadrat).
- **Jumlah dua suku sebelumnya.** Contoh: 1, 1, 2, 3, 5, 8, ... (tiap suku adalah jumlah dua suku sebelumnya).
- **Selang-seling dua pola.** Contoh: 2, 5, 4, 7, 6, 9, ... (suku ganjil tambah 2, suku genap tambah 2).
- **Pola huruf.** Contoh: A, C, E, G, ... (loncat satu huruf, berikutnya I).''',
    "tiu-modul-s54": '''## Tips

1. **Kreatif.** Menemukan pola adalah hasil keterampilan mengutak-atik bilangan, dan hal ini tentu saja dapat dilatih.
2. **Cermat dan teliti.** Perhatikan tanda bilangan, misalnya positif atau negatif, karena sangat memengaruhi dalam menemukan pola dan menghitung bilangan selanjutnya.
3. **Banyak berlatih.** Kenali berbagai macam variasi pola. Semakin terbiasa, semakin singkat waktu pengerjaanmu, karena waktu yang tersedia sangat terbatas.

## Trik menemukan pola

1. **Perhatikan deret angka secara keseluruhan**, kemudian amati perubahan pola dari satu bilangan ke bilangan berikutnya.
2. **Pelajari variasi pola barisan yang sering muncul:**
   - Pola barisan Fibonacci, yaitu setiap angka selanjutnya berasal dari penjumlahan dua bilangan sebelumnya.
   - Pola penjumlahan atau pengurangan tetap, sering disebut pola barisan aritmetika.
   - Pola perkalian atau pembagian tetap, sering disebut pola barisan geometri.
   - Pola pangkat tetap.
   - Pola penjumlahan, pengurangan, perkalian, pembagian, atau pangkat yang meningkat.
   - Pola penjumlahan, pengurangan, perkalian, pembagian, atau pangkat dengan bilangan genap.
   - Pola penjumlahan, pengurangan, perkalian, pembagian, atau pangkat dengan bilangan ganjil.
   - Pola operasi aljabar variasi.
   - Pola selang-seling tanda.
   - Pola penjumlahan bertingkat.
   - Pola loncat bilangan.
3. **Jangan terpaku pada satu pola.** Karena ada banyak sekali variasi pola barisan, jika kamu tidak menemukan pola yang diharapkan, cobalah kemungkinan pola yang lain.
4. **Pola harus konsisten.** Temukan pola di awal bilangan, lalu cek apakah pola itu masih berlaku di bilangan selanjutnya. Kalau angka yang dicari ada di tengah, perhatikan pola di kiri dan kanannya.
5. **Dahulukan mengerjakan soal yang kamu anggap mudah.**

## Contoh soal

Tentukan dua bilangan selanjutnya dari barisan 3, 7, 9, 14, 27, 28, ...

Jawab: perhatikan suku ganjil dan suku genap secara terpisah.

Suku ganjil: 3, 9, 27, ... (dikali 3), jadi suku berikutnya adalah 81. Suku genap: 7, 14, 28, ... (dikali 2), jadi suku berikutnya adalah 56. Barisan lengkapnya adalah 3, 7, 9, 14, 27, 28, 81, 56.

## Barisan huruf

1. Ubah barisan huruf menjadi barisan angka dulu (A = 1, B = 2, C = 3, dan seterusnya), lalu temukan polanya. Contoh: C = 3, H = 8, M = 13, R = 18, W = 23; D = 4, I = 9, N = 14, S = 19, X = 24; E = 5, J = 10, O = 15, T = 20, Y = 25.
2. Apabila masih kesulitan, manfaatkan jari tangan untuk menentukan huruf pada suku berikutnya.
3. Apabila huruf yang dicari terletak di tengah-tengah, perhatikan pola di sebelah kiri dan kanannya.

Contoh: a, b, b, c, c, c, d, d, d, d, ... Huruf selanjutnya adalah e, karena polanya adalah huruf a muncul 1 kali, b muncul 2 kali, c muncul 3 kali, d muncul 4 kali, dan e muncul 5 kali.''',
    "tiu-modul-s55": '''Tes ini digunakan untuk mengukur kemampuan berhitung, ketelitian, dan kecermatan seseorang.

Kemampuan tersebut ada hubungannya dengan kecenderungan sikap seseorang dalam menghadapi permasalahan di dunia kerja, seperti seberapa cermat, teliti, dan sistematis cara pandang orang tersebut saat menyelesaikan permasalahan.

Soal jenis ini sebenarnya cukup sederhana karena hanya merupakan hitungan dasar berupa operasi penjumlahan, pengurangan, perkalian, dan pembagian. Yang diperlukan adalah ketelitian dan kecepatan berhitung.

## Trik

1. **Pelajari operasi dasar**, yaitu penjumlahan, pengurangan, perkalian, pembagian, pangkat, dan akar pangkat.
2. **Pelajari urutan kekuatan operasi hitung.** Urutannya dari yang paling kuat:
   - Operasi apa pun yang ada di dalam tanda kurung paling kuat dan didahulukan.
   - Setelah itu, operasi pangkat dan akar pangkat. Keduanya sama kuat.
   - Setelah itu, operasi kali dan bagi. Keduanya sama kuat, dan lebih kuat dari tambah dan kurang.
   - Paling akhir, operasi tambah dan kurang. Keduanya sama kuat.
3. **Cermati tanda negatif.** Aturannya:
   - Perkalian atau pembagian dengan tanda yang sama hasilnya positif.
   - Perkalian atau pembagian dengan tanda yang beda hasilnya negatif.
4. **Gunakan teknik pembulatan atau penaksiran.** Angka yang kurang enak dihitung bisa didekati dengan pembulatan, penaksiran, atau mengubah pecahan ke desimal dan sebaliknya.
   - Bilangan ganjil x 2 = bilangan genap.
   - Bilangan x 0 = 0.
   - Bilangan x 1 = bilangan itu sendiri.
   - Bilangan kelipatan 9 mempunyai jumlah angka-angkanya yang merupakan kelipatan 9.
   - Bilangan x 5 hasilnya satuannya 5 atau 0.
5. **Buat permisalan.** Tipe soal cerita akan lebih mudah dikerjakan apabila hal yang diketahui pada soal dapat dibuat dalam permisalan.
6. **Pelajari teknik mencoret angka** agar perhitungan lebih sederhana. Teknik mencoret pada operasi perkalian dengan bilangan pecahan dapat dilakukan apabila bentuk pecahannya adalah pecahan sederhana, bukan pecahan campuran.
7. **Kelola waktu.** Perkiraan waktu tiap soal adalah 1 menit. Jangan terpaku di soal sulit, jawab yang mudah dulu, dan beri tanda pada langkah yang macet.

## Contoh soal

Apabila 97.336 diakar pangkat tiga, hasilnya adalah bilangan yang bersatuan 6, karena bilangan berpangkat tiga yang bersatuan 6 berasal dari bilangan yang bersatuan 6. Jadi, jawaban yang paling mungkin adalah 46 atau 56.

Selanjutnya coba misalkan `50^3 = 125.000`, hasilnya sudah melebihi 97.336. Ini artinya 56 salah, karena `56^3` pasti lebih besar dari `50^3`. Jadi jawabannya adalah 46.''',
    "tiu-modul-s56": '''Dalam tes ini, peserta harus mampu membuat penalaran logis terhadap satu atau serangkaian persamaan angka-angka yang ada.

## Trik pertidaksamaan

1. **Perhatikan urutan.** Apabila A < B dan B < C, hubungannya adalah A < B < C dan A < C.
2. **Operasi yang sama di seluruh ruas tidak mengubah urutan.** Diketahui A < B < C, maka:
   - Ditambah p di semua ruas: `A + p < B + p < C + p` (urutan tetap)
   - Dikurang p di semua ruas: `A - p < B - p < C - p` (urutan tetap)
   - Dikali p (positif) di semua ruas: `A x p < B x p < C x p` (urutan tetap)
   - Dibagi p (positif) di semua ruas: `A : p < B : p < C : p` (urutan tetap)
3. **Dikali atau dibagi bilangan negatif membalik urutan.** Diketahui A < B < C, apabila dikali negatif di seluruh ruas, tanda pertidaksamaannya dibalik. Urutannya menjadi `-A > -B > -C`.
4. **Ambil kasus secara acak dan cobalah beberapa bilangan.** Coba angka dari salah satu interval di soal, lalu cek apakah angka itu memenuhi semua aturan urutan yang ada.

Contoh: diketahui `2 < x < 5`. Nilai x yang mungkin adalah 3 atau 4 (jika x bilangan bulat). Coba masukkan nilai tersebut ke syarat lain di soal untuk mempersempit kemungkinan jawaban.''',
    "tiu-modul-s57": '''Penalaran logis menguji peserta untuk mendayagunakan logikanya dalam memahami pernyataan ataupun informasi yang diberikan. Polanya adalah peserta diminta menentukan kesimpulan dari beberapa pernyataan singkat yang diberikan di soal.

Hindari perasaan (opini pribadi) dalam menyelesaikan soal tersebut, karena soal yang diberikan membutuhkan jawaban dari hasil analisis secara logis.

## Tips

1. Pahami dan analisis setiap pernyataan yang diberikan di soal.
2. Ambil kesimpulan logis sesuai dengan pernyataan yang telah diberikan di soal (fakta di soal).
3. Kesimpulan yang diambil merupakan hasil analisis gabungan dari semua pernyataan yang diberikan di soal.
4. Hindari opini. Kerjakanlah sesuai fakta yang terdapat di pernyataan soal.
5. Konsentrasi, fokus, rileks, dan jangan panik.
6. Pergunakan waktu sebaik mungkin. Jangan terpaku di soal sulit, beri tanda lalu pindah ke soal yang lebih mudah, dan kembali lagi kalau ada sisa waktu.

## Teknik penarikan kesimpulan

**Modus Ponens**

- Pernyataan 1: jika p maka q
- Pernyataan 2: p
- Kesimpulan: q

Contoh:

- Pernyataan 1: Jika Mandalika lulus ujian maka ia mendapat beasiswa.
- Pernyataan 2: Mandalika lulus ujian.
- Kesimpulan: Ia mendapat beasiswa.

**Modus Tollens**

- Pernyataan 1: jika p maka q
- Pernyataan 2: bukan q
- Kesimpulan: bukan p

Contoh:

- Pernyataan 1: Jika Mandalika lulus ujian maka ia mendapat beasiswa.
- Pernyataan 2: Mandalika tidak mendapat beasiswa.
- Kesimpulan: Mandalika tidak lulus ujian.''',
    "tiu-modul-s58": '''## Silogisme hipotetis

- Pernyataan 1: jika p maka q
- Pernyataan 2: jika q maka r
- Kesimpulan: jika p maka r

Contoh:

- Pernyataan 1: Jika Mandalika lulus ujian maka ia mendapat beasiswa.
- Pernyataan 2: Jika Mandalika mendapat beasiswa maka biaya pendidikan menjadi ringan.
- Kesimpulan: Jika Mandalika lulus ujian maka biaya pendidikan menjadi ringan.

## Analisis pernyataan dengan diagram Venn

Untuk soal yang tidak bisa dikerjakan dengan teknik penarikan kesimpulan di atas, kamu membutuhkan analisis pernyataan yang telah disediakan di soal. Pelajari analisis kejadian berdasarkan diagram Venn berikut.

**Semua A bersifat B**

Artinya: setiap anggota A memiliki sifat seperti B. Ada anggota B yang tidak memiliki sifat seperti A.

**Ada C yang bersifat A dan B**

Artinya: setiap anggota C memiliki sifat seperti A sekaligus seperti B. Ada anggota A yang tidak memiliki sifat seperti B. Ada anggota B yang tidak memiliki sifat seperti A.

**A dan B tidak ada hubungan**

Artinya: kejadian saling lepas, tidak ada hubungan antara dua kejadian. Tidak ada A yang bersifat B. Tidak ada B yang bersifat A.

**Sifat tidak langsung**

Artinya: semua A bersifat B, semua B bersifat C, maka semua A bersifat C.

## Arti kata "semua" dan "beberapa"

- "Semua" memiliki arti yang sama dengan "setiap". Apabila suatu kejadian melibatkan "semua", berarti setiap anggota tersebut tanpa terkecuali.
- "Beberapa" memiliki arti yang sama dengan "ada", "sementara", atau "sebagian". Apabila suatu kejadian melibatkan "beberapa", berarti hanya sebagian anggotanya atau cukup disebut ada.''',
    "tiu-modul-s59": '''Dalam soal jenis ini, kamu diminta mempelajari suatu cerita singkat dan kemudian melakukan penalaran terhadap setiap pertanyaan berdasarkan informasi dari cerita.

Umumnya jawaban dari soal jenis ini tidak terlihat langsung dalam cerita, jadi kamu harus melakukan penalaran dulu untuk menemukan jawaban yang benar.

## Tips

1. Cermati dan pahami soal cerita.
2. Fokus, konsentrasi, cermat, dan teliti saat mengerjakan.
3. Beri tanda pada kata kunci soal cerita.
4. Permudah dengan membuat ilustrasi gambar atau catatan.
5. Banyak berlatih.

## Model penalaran analitis

**Model perbandingan.** Pada model ini kasus yang terjadi di soal berupa perbandingan dua atau lebih nilai. Kemudian kamu diminta menyimpulkan atau menganalisis hubungan dari beberapa perbandingan tersebut.

Prinsip menyelesaikannya sama seperti yang sudah diuraikan di ringkasan materi aritmetika dasar pada bagian perbandingan.

**Model urutan.** Model perbandingan sering kali muncul bersamaan dengan model urutan.

Urutan yang terjadi di soal cerita memiliki kata kunci "kurang dari", "lebih dari", dan "sama dengan".

Kamu bisa memberi tanda `<` untuk kata kunci "kurang dari", tanda `>` untuk kata kunci "lebih dari", dan tanda `=` untuk kata kunci "sama dengan".

Beberapa contoh kasus yang berkaitan dengan urutan adalah skor, peringkat, pemenang, tercepat, terpandai, termahir, prioritas pengerjaan, atau kunjungan.

**Model hubungan antarsyarat.** Beberapa kejadian berasal dari suatu kondisi yang memenuhi syarat tertentu, hubungannya adalah "sebab akibat", "syarat-hasil", atau "jika ... maka ...".

Cermati keterangan dan kata kunci pada soal cerita sehingga dapat menyimpulkan dengan tepat.

Syarat terbagi menjadi syarat cukup, syarat perlu, dan syarat mutlak.

- **Syarat cukup.** Pernyataan P dikatakan syarat cukup dari pernyataan Q jika P terjadi pastilah terjadi Q. Dengan kata lain, adanya P menjamin adanya Q.

Contoh: P adalah Budi bujangan, Q adalah belum menikah. Mengetahui Budi bujangan sudah cukup untuk mengetahui ia belum menikah.

- **Syarat perlu.** Pernyataan Q dikatakan syarat perlu dari pernyataan P jika Q mutlak diperlukan untuk terjadinya P. Dengan kata lain, mustahil ada P tanpa ada Q.

Contoh: P adalah Budi bujangan, Q adalah belum menikah. Jelas jika Budi sudah menikah maka ia tidak bujangan lagi. Jadi, belum menikah adalah syarat perlu untuk menjadi bujangan.

- **Syarat mutlak.** Artinya adalah syarat yang harus atau mutlak terjadi, P jika dan hanya jika Q.

Contoh: P adalah air turun dari langit, Q adalah terjadi hujan. Air turun dari langit jika dan hanya jika terjadi hujan.

Dengan demikian, air turun dari langit adalah syarat mutlak terjadinya hujan, dan terjadinya hujan juga merupakan syarat mutlak air turun dari langit.

**Model kombinasi.** Permasalahan yang sering muncul pada model ini antara lain:

- Penyusunan jadwal suatu kegiatan
- Kemungkinan banyaknya cara yang terjadi
- Kemungkinan posisi dengan syarat tertentu, seperti posisi duduk atau posisi wilayah
- Pemilihan atau penunjukan objek dan calon berdasarkan syarat tertentu, seperti penugasan pekerjaan

Untuk mempermudah pengerjaannya, kamu bisa menggunakan catatan atau ilustrasi gambar sesuai aturan penempatan di soal tersebut.

## Trik melihat jawaban

Cara paling cepat saat menyelesaikan soal cerita tes penalaran analitis adalah dengan mencermati pilihan jawaban yang disediakan.

Terkadang kamu tidak perlu mencari jawaban sesuai keterangan pada soal, tetapi cukup memilih jawaban yang paling tepat sesuai syarat dan kondisi pada soal tersebut.

## Bonus: penalaran spasial

Tes penalaran spasial digunakan untuk menguji kemampuanmu memvisualisasikan sesuatu benda dan membuat pengertiannya, serta berpikir secara abstrak melalui benda atau simbol-simbol.

Kemampuan penalaran spasial meliputi visualisasi dan manipulasi dua dimensi bentuk atau pola.

Pertanyaan-pertanyaan pada tes penalaran spasial berupa klasifikasi, analogi, hubungan dan konsistensi logis, melengkapi gambar, dan lain-lain.

Tips: cermat, teliti, dan konsentrasi; pergunakan waktu sebaik mungkin; banyak berlatih.

Trik:

1. Analisis bentuk dan pahami pola.
2. Analisis bentuk dapat berupa pencerminan, perputaran, perbandingan, atau penambahan bentuk pola titik, garis, atau bulatan pada gambar.
3. Lakukan prediksi bentuk pada pola lanjutan.
4. Perhatikan detail gambar yang disediakan di soal, terutama untuk tipe tes klasifikasi karena kamu diminta memilih gambar di luar pola yang telah ditentukan.''',
    "tkp-cheat-sheet-s01": '''Profesionalisme adalah kemampuan menjalankan tugas dan fungsi jabatan secara tuntas, akurat, dan penuh tanggung jawab.

## Kata Kunci

- **Tugas dan fungsi**: menjalankan tugas sesuai tanggung jawab jabatan.
- **Efektif dan efisien**: hasil maksimal tanpa membuang sumber daya.
- **Komitmen tinggi**: berorientasi pada outcome (dampak), bukan hanya output (keluaran).
- **Tanggung jawab**: melaksanakan pekerjaan dengan integritas dan kejujuran.
- **Pengembangan diri**: terus belajar dan menerima masukan untuk meningkatkan kompetensi.
- **Etika profesional**: menghormati norma kerja, jujur, dan dapat dipercaya.

## Ciri-ciri Soal

- Soal menampilkan situasi gangguan atau hambatan dalam menjalankan tugas.
- Kamu diminta memilih tindakan yang tetap menjalankan tugas meski ada halangan.
- Soal menguji keputusan yang mencerminkan integritas dan kompetensi.

## Tips Menjawab

- Pilih jawaban yang berorientasi pada pelaksanaan tugas, meski ada gangguan.
- Hindari jawaban yang mencerminkan sikap menghindari tanggung jawab atau menunda pekerjaan.
- Utamakan jawaban yang menunjukkan tindakan nyata dan solusi konkret.
- Pilih jawaban yang menunjukkan efisiensi dan efektivitas dalam bekerja.

## Rahasia Mendapatkan Skor 5

- Pilih jawaban yang mencerminkan komitmen tinggi, misalnya tetap melanjutkan tugas meski menghadapi kendala.
- Pilih opsi proaktif, seperti mencari solusi alternatif agar pekerjaan selesai tepat waktu.
- Hindari jawaban yang berfokus pada mengeluh atau menyalahkan situasi.
- Pilih jawaban yang menunjukkan kemampuan mengelola waktu dan sumber daya secara efektif.

## Contoh Jawaban Terbaik

Jika harus memilih antara menyelesaikan pekerjaan tepat waktu atau membantu rekan yang kesulitan, pilih jawaban yang menunjukkan kamu mengatur waktu dengan baik: selesaikan pekerjaan utama dulu, lalu tawarkan bantuan setelahnya. Hindari jawaban yang mengabaikan tanggung jawab utama atau mengorbankan waktu kerja secara berlebihan untuk membantu rekan.''',
    "tkp-cheat-sheet-s02": '''Pelayanan publik adalah kemampuan menampilkan perilaku keramahtamahan dalam bekerja secara efektif, agar kebutuhan dan kepuasan masyarakat terpenuhi sesuai tugas dan wewenang.

## Kata Kunci

- **Kepuasan masyarakat**: memberikan pelayanan yang optimal dan memuaskan sesuai kebutuhan masyarakat.
- **Keramahan dan empati**: menyapa dan melayani masyarakat dengan sikap ramah, sabar, dan penuh empati.
- **Prosedur yang jelas**: mematuhi prosedur standar operasional dan menyampaikan informasi secara transparan.
- **Aksesibilitas**: memastikan pelayanan dapat dijangkau semua kalangan, tanpa diskriminasi.
- **Tanggap dan responsif**: cepat menanggapi keluhan dan kebutuhan masyarakat.
- **Profesionalisme**: mengedepankan etika pelayanan yang baik sesuai tanggung jawab dan wewenang.

## Ciri-ciri Soal

- Soal menampilkan situasi di mana kamu harus memilih tindakan untuk memenuhi kebutuhan masyarakat.
- Situasi mengharuskan kamu memilih cara yang adil dan transparan dalam memberikan pelayanan.
- Soal menilai kemampuan memahami masalah masyarakat dan memberikan solusi yang tepat.

## Tips Menjawab

- Utamakan pelayanan maksimal: pilih jawaban yang menunjukkan kamu berusaha memberikan pelayanan terbaik dan memuaskan, meski menghadapi tantangan.
- Patuh pada prosedur: jawaban harus mencerminkan tindakan sesuai prosedur, tetapi tetap berorientasi pada penyelesaian masalah masyarakat.
- Transparan dan komunikatif: pilih jawaban yang menunjukkan kamu memberi informasi yang jelas dan membantu masyarakat memahami proses pelayanan.
- Tidak diskriminatif: hindari jawaban yang menunjukkan sikap pilih kasih atau diskriminasi dalam memberikan pelayanan.

## Rahasia Mendapatkan Skor 5

- Pilih jawaban yang menunjukkan kamu mengutamakan kepentingan masyarakat dengan berupaya memenuhi kebutuhan mereka sebaik mungkin.
- Pilih opsi yang mencerminkan inisiatif proaktif, seperti mencari cara meningkatkan kualitas pelayanan tanpa diminta.
- Hindari jawaban yang menunjukkan sikap defensif atau menyalahkan kondisi, fokuslah pada solusi.
- Pilih jawaban yang menampilkan kamu menyelesaikan masalah masyarakat dengan cara yang efisien dan efektif, serta memberikan hasil yang nyata.

## Contoh Jawaban Terbaik

Jika masyarakat mengeluh tentang panjangnya antrean, pilih jawaban yang menunjukkan kamu mengambil inisiatif untuk menambah petugas, memperbaiki sistem antrean, atau mencari solusi lain yang dapat mengurangi waktu tunggu, sambil tetap memberikan pelayanan yang ramah dan informatif kepada masyarakat yang menunggu.''',
    "tkp-cheat-sheet-s03": '''Jejaring kerja adalah kemampuan membangun dan membina hubungan, bekerja sama, berbagi informasi, dan berkolaborasi dengan orang lain secara efektif.

## Kata Kunci

- **Kerja sama**: kemampuan bekerja sama dengan orang lain untuk mencapai tujuan bersama.
- **Kolaborasi**: membangun hubungan dan berbagi informasi yang efektif dengan rekan kerja atau tim.
- **Kepemimpinan**: mampu memimpin tim dengan baik, membagi tugas, dan memberikan arahan yang jelas.
- **Komunikasi efektif**: menyampaikan ide, instruksi, atau informasi dengan cara yang mudah dipahami.
- **Pemecahan konflik**: menyelesaikan perselisihan atau konflik di antara anggota tim dengan adil dan bijaksana.
- **Kepentingan bersama**: mengutamakan kepentingan tim dan organisasi di atas kepentingan pribadi.

## Ciri-ciri Soal

- Soal menampilkan situasi di mana kamu harus berkolaborasi atau berkomunikasi dengan orang lain untuk menyelesaikan suatu pekerjaan.
- Situasi menuntut kamu menangani konflik atau masalah antar anggota tim secara efektif.
- Soal menguji kemampuan memimpin tim atau mengatur pembagian tugas agar pekerjaan berjalan lancar.

## Tips Menjawab

- Utamakan kerja sama dan kolaborasi: pilih jawaban yang menunjukkan kamu mendukung kerja sama tim dan terbuka terhadap pendapat orang lain.
- Pemimpin yang baik: jika soal melibatkan kepemimpinan, pilih jawaban yang menunjukkan kamu mampu memberikan arahan yang jelas, membagi tugas secara adil, dan mendukung anggota tim.
- Komunikasi yang efektif: pilih jawaban yang menunjukkan kamu mampu berkomunikasi dengan baik, mendengarkan pendapat, dan memberikan feedback yang konstruktif.
- Solusi terbaik untuk semua pihak: jika ada konflik, pilih jawaban yang menunjukkan kamu mencari solusi yang adil dan tidak memihak.

## Rahasia Mendapatkan Skor 5

- Pilih jawaban yang menunjukkan kamu mengutamakan kepentingan bersama dan berusaha menjaga harmoni dalam tim.
- Pilih opsi yang mencerminkan inisiatif untuk menyatukan tim, seperti mengajak diskusi, memberikan motivasi, atau membantu anggota yang kesulitan.
- Hindari jawaban yang mencerminkan sikap mengabaikan masalah atau menyalahkan orang lain.
- Pilih jawaban yang menunjukkan kamu aktif mencari solusi untuk mengatasi hambatan yang dihadapi tim, misalnya dengan melakukan brainstorming atau mencari bantuan dari pihak lain jika diperlukan.

## Contoh Jawaban Terbaik

Jika tim mengalami konflik karena perbedaan pendapat, pilih jawaban yang menunjukkan kamu mengajak semua anggota tim untuk berdiskusi, mencari titik temu, dan menemukan solusi yang dapat diterima oleh semua pihak. Hindari jawaban yang menunjukkan kamu memihak salah satu pihak atau mengambil keputusan sepihak tanpa diskusi terlebih dahulu.''',
    "tkp-cheat-sheet-s04": '''Sosial budaya adalah kemampuan beradaptasi dan bekerja secara efektif dalam masyarakat majemuk yang terdiri atas beragam agama, suku, dan budaya.

## Kata Kunci

- **Adaptasi**: mampu menyesuaikan diri dengan lingkungan kerja yang beragam, baik dari segi budaya, agama, maupun kebiasaan.
- **Toleransi**: menghargai perbedaan pendapat, latar belakang, dan budaya orang lain.
- **Empati**: memahami dan merasakan apa yang dirasakan orang lain, serta peduli terhadap masalah mereka.
- **Interaksi sosial**: mampu berkomunikasi dan berinteraksi dengan baik dengan semua kalangan.
- **Kerja sama**: membangun hubungan baik dengan orang lain tanpa memandang latar belakang mereka.
- **Menghindari diskriminasi**: tidak membedakan perlakuan terhadap siapa pun berdasarkan suku, agama, ras, atau golongan.

## Ciri-ciri Soal

- Soal menampilkan situasi di mana kamu harus berinteraksi dengan orang lain yang memiliki latar belakang budaya, suku, atau agama yang berbeda.
- Situasi mengharuskan kamu memilih tindakan yang menunjukkan sikap toleransi dan menghormati perbedaan.
- Soal menguji kemampuan menyelesaikan masalah sosial di tempat kerja, seperti perbedaan pendapat atau konflik antar kelompok.

## Tips Menjawab

- Utamakan sikap toleransi dan menghargai: pilih jawaban yang menunjukkan kamu menghormati perbedaan budaya, agama, atau pendapat orang lain.
- Mengutamakan kepentingan bersama: hindari jawaban yang menunjukkan sikap egois atau hanya mementingkan kepentingan pribadi atau kelompok tertentu.
- Komunikasi yang baik: pilih jawaban yang menunjukkan kamu berusaha berkomunikasi dengan baik dan mendengarkan pendapat orang lain.
- Bersikap netral dan bijaksana: jangan memihak atau menunjukkan favoritisme terhadap kelompok tertentu, tunjukkan sikap adil dan bijak.

## Rahasia Mendapatkan Skor 5

- Pilih jawaban yang menunjukkan kamu mengutamakan kepentingan bersama dan menghargai perbedaan dengan bijak.
- Pilih opsi yang menunjukkan kamu aktif membangun komunikasi positif dengan orang-orang dari berbagai latar belakang.
- Hindari jawaban yang mencerminkan sikap menolak atau menghindari kelompok tertentu atau menyalahkan orang lain.
- Pilih jawaban yang menunjukkan kamu berusaha menciptakan lingkungan kerja yang harmonis dan nyaman bagi semua pihak.

## Contoh Jawaban Terbaik

Jika terdapat konflik antara dua rekan kerja yang berasal dari latar belakang budaya yang berbeda, pilih jawaban yang menunjukkan kamu mengajak kedua pihak untuk berdiskusi bersama, memahami sudut pandang masing-masing, dan mencari solusi yang bisa diterima bersama. Hindari jawaban yang menunjukkan kamu langsung memihak salah satu pihak atau mengabaikan konflik tersebut tanpa penyelesaian.''',
    "tkp-cheat-sheet-s05": '''Teknologi Informasi dan Komunikasi (TIK) adalah kemampuan memanfaatkan teknologi secara efektif untuk meningkatkan kinerja dan mempermudah pekerjaan.

## Kata Kunci

- **Pemanfaatan teknologi**: kemampuan menggunakan teknologi untuk meningkatkan efisiensi dan produktivitas kerja.
- **Inovasi**: menggunakan teknologi untuk menciptakan cara baru dalam menyelesaikan pekerjaan.
- **Problem solving**: mengatasi masalah teknis atau hambatan dalam penggunaan teknologi.
- **Adaptasi teknologi**: mampu belajar dan menyesuaikan diri dengan teknologi baru yang diterapkan dalam organisasi.
- **Efisiensi kerja**: memanfaatkan teknologi untuk mempercepat proses kerja dan meminimalkan kesalahan.
- **Keamanan informasi**: menjaga data dan informasi tetap aman dari ancaman dan kebocoran.

## Ciri-ciri Soal

- Soal melibatkan situasi di mana kamu harus memanfaatkan teknologi untuk menyelesaikan pekerjaan atau mengatasi masalah.
- Situasi meminta kamu menunjukkan penggunaan teknologi untuk meningkatkan produktivitas dan mempermudah pekerjaan.
- Soal menguji kemampuan memecahkan masalah teknis atau meningkatkan efisiensi kerja melalui teknologi.

## Tips Menjawab

- Pilih solusi teknologi yang relevan: jika soal menampilkan masalah yang bisa diselesaikan dengan teknologi, pilih jawaban yang menunjukkan kamu menggunakan alat atau aplikasi yang tepat.
- Utamakan efisiensi dan efektivitas: pilih jawaban yang menunjukkan kamu memilih solusi berbasis teknologi dalam menyelesaikan suatu tantangan atau kendala di tempat kerja.
- Selalu belajar dan beradaptasi: jika soal berkaitan dengan penerapan teknologi baru, pilih jawaban yang menunjukkan kamu terbuka untuk belajar dan beradaptasi dengan teknologi tersebut.
- Keamanan informasi: pilih jawaban yang menunjukkan kamu menjaga keamanan dan kerahasiaan data dalam menggunakan teknologi.

## Rahasia Mendapatkan Skor 5

- Pilih jawaban yang menunjukkan kamu menggunakan teknologi secara optimal untuk menyelesaikan pekerjaan dengan lebih cepat dan akurat.
- Pilih opsi yang menunjukkan kamu proaktif dalam mencari solusi berbasis teknologi, seperti mempelajari aplikasi baru atau mengusulkan penggunaan teknologi yang lebih efisien.
- Hindari jawaban yang menunjukkan sikap menghindari penggunaan teknologi atau memilih cara manual yang kurang efisien.
- Pilih jawaban yang menunjukkan kamu menyadari pentingnya keamanan informasi dan selalu berhati-hati dalam menggunakan data digital.

## Contoh Jawaban Terbaik

Jika dihadapkan pada masalah keterlambatan penyelesaian laporan akibat kendala teknis pada sistem, pilih jawaban yang menunjukkan kamu mencari alternatif solusi teknologi, seperti menggunakan aplikasi cadangan, menghubungi tim IT untuk memperbaiki masalah, atau mencari cara manual sementara yang tidak terlalu menghambat pekerjaan. Hindari jawaban yang menunjukkan kamu menyerah pada kendala teknis tanpa mencari jalan keluar.''',
    "tkp-cheat-sheet-s06": '''Anti radikalisme adalah sikap tegas menolak segala bentuk radikalisme dan kekerasan, serta menjaga keutuhan bangsa dengan cara yang bijaksana.

## Kata Kunci

- **Kepedulian sosial**: memahami pentingnya kerukunan dan toleransi dalam masyarakat.
- **Menolak kekerasan**: sikap tegas menolak segala bentuk kekerasan dan tindakan yang mengarah pada radikalisme.
- **Toleransi beragama**: menghargai perbedaan keyakinan dan berinteraksi dengan baik dengan semua orang tanpa memandang latar belakang agama.
- **Kesatuan dan persatuan**: mengutamakan keutuhan bangsa di atas kepentingan pribadi atau kelompok tertentu.
- **Deteksi dini**: mampu mengenali tanda-tanda awal radikalisme dan mengambil tindakan preventif.
- **Mendukung perdamaian**: berkontribusi aktif dalam menciptakan lingkungan yang damai dan bebas dari konflik.

## Ciri-ciri Soal

- Soal menampilkan situasi di mana kamu harus memilih tindakan yang mencerminkan penolakan terhadap radikalisme dan menghormati keberagaman.
- Situasi menguji kemampuan menghadapi atau merespons sikap intoleransi atau tindakan provokatif.
- Soal mengharuskan kamu memilih tindakan yang menunjukkan dukungan terhadap perdamaian dan menjaga keutuhan sosial.

## Tips Menjawab

- Pilih jawaban yang menunjukkan sikap menolak radikalisme: pilih jawaban yang menunjukkan kamu tegas menolak paham radikalisme dan segala bentuk tindakan kekerasan.
- Hindari jawaban yang toleran terhadap kekerasan: jangan memilih jawaban yang mengandung pembenaran terhadap tindakan kekerasan atau intoleransi, sekecil apa pun.
- Utamakan kerukunan dan persatuan: pilih jawaban yang menunjukkan kamu mendorong perdamaian, kerukunan, dan saling menghargai antarwarga.
- Lapor dan deteksi dini: pilih jawaban yang menunjukkan kamu segera melaporkan atau mengambil tindakan jika mengetahui adanya potensi radikalisme.

## Rahasia Mendapatkan Skor 5

- Pilih jawaban yang menunjukkan kamu menolak tegas segala bentuk radikalisme dan menjaga keutuhan bangsa dengan cara yang bijaksana.
- Pilih opsi yang menunjukkan kamu proaktif dalam mempromosikan toleransi, seperti mengadakan diskusi lintas agama atau kegiatan yang mengedepankan nilai-nilai kebersamaan.
- Hindari jawaban yang menunjukkan sikap mengabaikan atau membiarkan tindakan radikal atau intoleran terjadi tanpa respons yang tepat.
- Pilih jawaban yang menunjukkan kamu bersikap aktif dalam meredam konflik dan menjaga lingkungan yang damai, misalnya dengan menjadi mediator atau mengajak semua pihak untuk berdialog.

## Contoh Jawaban Terbaik

Jika seorang rekan kerja mengajak kamu mengikuti diskusi yang bernuansa provokatif atau menyebarkan paham intoleransi, pilih jawaban yang menunjukkan kamu menolak ajakan tersebut secara tegas, memberikan pemahaman bahwa tindakan tersebut tidak sesuai dengan nilai-nilai kebersamaan, dan segera melaporkan kepada pihak yang berwenang. Hindari jawaban yang menunjukkan kamu ragu untuk menolak atau mengabaikan situasi tersebut tanpa mengambil tindakan.''',
    "tkp-karakter-perilaku-s09": '''## Pengertian

**Orientasi pada pelayanan** adalah sikap yang mengutamakan kepentingan masyarakat dalam memberikan pelayanan: memberikan pelayanan secara adil dan profesional, peka terhadap kebutuhan dan keluhan publik, berusaha memberikan solusi terbaik, dan menjaga kualitas pelayanan secara konsisten.

ASN pada hakikatnya adalah pelayan publik, bukan pihak yang dilayani. Orientasi pelayanan menjadi cerminan utama kualitas birokrasi dan wajah negara di mata masyarakat.

Penting dipahami: dalam TKP, orientasi pada pelayanan **tidak sekadar ramah atau sopan**, tetapi mencakup **empati, tanggung jawab, kecepatan, ketepatan, dan kesungguhan dalam memenuhi kebutuhan masyarakat sesuai aturan yang berlaku**. ASN yang berorientasi pada pelayanan menempatkan kepentingan masyarakat di atas kenyamanan pribadi.

## Pelayanan Publik menurut Peraturan

**Pelayanan publik** adalah kegiatan atau rangkaian kegiatan dalam rangka pemenuhan kebutuhan pelayanan sesuai dengan peraturan perundang-undangan bagi setiap warga negara dan penduduk atas barang, jasa, dan/atau pelayanan administratif yang disediakan oleh penyelenggara pelayanan publik (UU Nomor 25 Tahun 2009 tentang Pelayanan Publik).

Fungsi ASN menurut UU Nomor 20 Tahun 2023 tentang ASN Pasal 10 ada tiga: pelaksana kebijakan publik, **pelayan publik**, dan perekat dan pemersatu bangsa.

Tugas ASN menurut Pasal 11 meliputi memberikan pelayanan publik yang profesional dan berkualitas.

Asas pelayanan publik (UU 25/2009 Pasal 4): kepentingan umum, kepastian hukum, kesamaan hak, keseimbangan hak dan kewajiban, keprofesionalan, partisipatif, persamaan perlakuan/tidak diskriminatif, keterbukaan, akuntabilitas, fasilitas dan perlakuan khusus bagi kelompok rentan, ketepatan waktu, serta kecepatan, kemudahan, dan keterjangkauan.

Perilaku etis penyelenggara pelayanan (UU 25/2009 Pasal 34) antara lain: adil, cermat, santun, tegas, profesional, tidak mempersulit, patuh pada peraturan, akuntabel, menjaga kerahasiaan, dan menghindari konflik kepentingan.

## Berorientasi Pelayanan dalam Core Values ASN BerAKHLAK

Berorientasi Pelayanan adalah nilai pertama dalam core values ASN **BerAKHLAK** (Berorientasi Pelayanan, Akuntabel, Kompeten, Harmonis, Loyal, Adaptif, Kolaboratif), yang diluncurkan melalui SE MenPANRB Nomor 20 Tahun 2021 dengan employer branding "Bangga Melayani Bangsa", dan kemudian dimuat dalam UU Nomor 20 Tahun 2023 tentang ASN.

Panduan perilaku nilai Berorientasi Pelayanan:

1. **Memahami dan memenuhi kebutuhan masyarakat**, secara aktif mendengarkan, mengidentifikasi, dan memenuhi kebutuhan serta harapan masyarakat secara efektif dan efisien.
2. **Ramah, cekatan, solutif, dan dapat diandalkan**, memberikan pelayanan yang jujur, responsif, akurat, efisien, dan sopan.
3. **Melakukan perbaikan tiada henti**, bertanggung jawab atas tindakan dan hasil, fokus pada output dan outcome, serta terus meningkatkan kinerja tim. Motonya: hari ini lebih baik dari kemarin, esok lebih baik dari hari ini.

## Mengapa Orientasi Pelayanan Sangat Penting

- ASN adalah garda terdepan pelayanan publik.
- Kualitas pelayanan menentukan kepercayaan masyarakat.
- Pelayanan buruk mencerminkan kegagalan birokrasi.
- Negara membutuhkan ASN yang humanis dan solutif.

Layanan yang baik membutuhkan tiga unsur yang tidak terpisahkan: penyelenggara (ASN), penerima (masyarakat), dan hasil berupa kepuasan. Budaya pelayanan yang buruk, lambat, berbelit, dan mempersulit, adalah citra negatif yang harus diberantas; sebaliknya, pelayanan prima membangun kepercayaan publik dan citra instansi.

## Ciri ASN yang Berorientasi pada Pelayanan

- Ramah dan sopan dalam berinteraksi; menyapa dan tersenyum.
- Mendengarkan keluhan masyarakat dengan sungguh-sungguh (mendengarkan aktif).
- Tidak mempersulit proses pelayanan; memberikan penjelasan yang jelas dan jujur.
- Cepat dan tepat waktu, cekatan, dan solutif.
- Tetap profesional meski menghadapi masyarakat yang emosional.
- Menepati janji, menyelesaikan tugas sampai tuntas, dan memastikan masyarakat mudah mendapatkan layanan.

## Nilai-Nilai Dasar

1. **Empati**, mampu memahami kondisi, perasaan, dan kebutuhan masyarakat.
2. **Kepedulian**, tidak bersikap acuh tak acuh terhadap keluhan dan masalah publik.
3. **Keadilan**, memberikan pelayanan tanpa diskriminasi, sesuai aturan.
4. **Profesionalisme**, tetap bekerja sesuai SOP meski dalam tekanan.
5. **Tanggung jawab**, berusaha memastikan pelayanan selesai dengan baik dan tuntas.

## Contoh Perilaku di Tempat Kerja

- **Menghadapi keluhan masyarakat** (pelayanan dianggap lambat): mendengarkan keluhan dengan sabar, meminta maaf atas ketidaknyamanan, dan memberikan solusi sesuai prosedur.
- **Masyarakat bersikap emosional** (nada bicara tinggi, sikap tidak menyenangkan): tetap tenang, sopan, dan fokus pada penyelesaian masalah, tidak membalas emosi.
- **Permintaan masyarakat tidak sesuai aturan:** menjelaskan aturan dengan bahasa yang mudah dipahami dan tetap membantu mencari solusi yang diperbolehkan.
- **Beban kerja tinggi** (antrean panjang, banyak permintaan layanan): tetap melayani dengan profesional dan berusaha menjaga kualitas pelayanan.
- **Perilaku sehari-hari yang mencerminkan orientasi pelayanan:** menyapa dan memberi salam, berpenampilan rapi, menjelaskan setiap tindakan yang dilakukan, mengucapkan terima kasih, memperlakukan rekan kerja seperti pelanggan, dan mengingat nama pelanggan.

## Dampak Rendahnya Orientasi Pelayanan

ASN yang kurang berorientasi pada pelayanan berpotensi bersikap cuek atau tidak peduli, memperlambat proses pelayanan, memicu konflik dengan masyarakat, dan menurunkan kepercayaan publik. Karena itu, orientasi pelayanan menjadi indikator utama dalam TKP.

## Ringkasan Inti

- ASN adalah pelayan masyarakat; kepentingan publik harus diutamakan.
- Empati dan profesionalisme adalah kunci; pelayanan harus adil dan bertanggung jawab.
- Citra negara tercermin dari kualitas pelayanan ASN.
- Kerangka berpikir: **Empati → Sabar → Profesional → Solutif → Tanggung Jawab**.
- Sikap yang harus dihindari: bersikap acuh tak acuh, membalas emosi masyarakat, menyalahkan sistem tanpa solusi, memprioritaskan kenyamanan pribadi, dan bersikap tidak sopan.''',
    "tkp-karakter-perilaku-s11": '''## Pengertian

**Kepedulian lingkungan** adalah sikap dan tindakan yang selalu berupaya mencegah kerusakan lingkungan alam di sekitarnya, sekaligus mengembangkan upaya untuk memperbaiki kerusakan alam yang sudah terjadi. Dalam Tes Karakteristik Pribadi (TKP), aspek ini mengukur sikap, kesadaran, dan tanggung jawab calon ASN terhadap kelestarian lingkungan, baik lingkungan kerja maupun lingkungan hidup secara luas.

Dalam TKP, kepedulian lingkungan **bukan sekadar menjaga kebersihan**. Aspek ini mencakup kesadaran ekologis, perilaku bertanggung jawab, serta komitmen terhadap pembangunan yang berwawasan lingkungan. ASN dituntut tidak hanya fokus pada tugas administratif, tetapi juga menjadi teladan dalam menjaga lingkungan demi kepentingan generasi sekarang dan mendatang.

Perilaku peduli lingkungan (pro-environmental behavior) adalah perilaku yang melindungi lingkungan atau menghormati lingkungan yang sehat.

Perilaku ini ditunjukkan dalam dua arah: mengurangi dampak negatif terhadap lingkungan (misalnya tidak menghasilkan sampah berlebih) dan meningkatkan dampak positif (misalnya menanam pohon dan memakai produk ramah lingkungan).

## Mengapa Aspek Ini Penting bagi ASN

- Lingkungan hidup merupakan aset bangsa.
- Kerusakan lingkungan berdampak langsung pada masyarakat.
- ASN berperan sebagai teladan perilaku publik.
- Pemerintah mendorong pembangunan berkelanjutan.

Dalam konteks TKP, kepedulian lingkungan mencerminkan kesadaran sosial, etika publik, dan komitmen terhadap keberlanjutan.

## Ciri ASN yang Peduli Lingkungan

- Tidak membuang sampah sembarangan.
- Menghemat penggunaan listrik dan air.
- Menjaga fasilitas kantor dengan baik.
- Mendukung kebijakan ramah lingkungan.
- Mengajak orang lain menjaga lingkungan.

Sikap ini menunjukkan bahwa ASN tidak apatis terhadap dampak lingkungan dari aktivitas sehari-hari.

## Nilai-Nilai Dasar Kepedulian Lingkungan ASN

- **Tanggung jawab**, menyadari bahwa setiap tindakan memiliki dampak terhadap lingkungan.
- **Kesadaran lingkungan**, memahami pentingnya menjaga keseimbangan alam dan lingkungan kerja.
- **Kepedulian sosial**, menjaga lingkungan demi kesehatan dan kenyamanan bersama.
- **Disiplin**, mematuhi aturan dan kebijakan terkait lingkungan.
- **Keteladanan**, menjadi contoh perilaku ramah lingkungan bagi masyarakat dan rekan kerja.

## Enam Indikator Perilaku Peduli Lingkungan

Enam indikator perilaku peduli lingkungan yang sering dipakai:

1. **Penghematan energi**, memakai listrik seperlunya, mematikan alat elektronik yang tidak dipakai, memanfaatkan penerangan alami, dan memakai lampu hemat energi.
2. **Perilaku membuang sampah**, membuang sampah pada tempatnya, menerapkan Reduce-Reuse-Recycle, dan membawa tas belanja sendiri untuk mengurangi sampah plastik.
3. **Pemanfaatan air**, hemat air saat mandi dan mencuci, memperbaiki keran yang bocor, dan memanfaatkan kembali air bekas cucian sayur untuk menyiram tanaman.
4. **Penyumbang emisi karbon**, mengurangi penggunaan kendaraan bermotor pribadi, memakai angkutan umum, mengurangi pemakaian AC, dan tidak membakar sampah plastik.
5. **Pola hidup sehat**, menanam pohon, menyediakan tempat resapan, dan berpartisipasi dalam program peduli lingkungan seperti kerja bakti dan penghijauan.
6. **Penggunaan bahan bakar**, menghemat bahan bakar fosil, antara lain dengan memakai angkutan umum dan mengurangi kendaraan bermotor pribadi.

## Kepedulian Lingkungan di Lingkungan Kerja ASN

Di lingkungan kerja, kepedulian lingkungan diwujudkan melalui budaya kerja bersih dan rapi, penghematan energi dan air, pengelolaan sampah yang baik, serta pemeliharaan fasilitas kantor. ASN yang peduli lingkungan menciptakan lingkungan kerja yang sehat, menghemat anggaran negara, dan meningkatkan kenyamanan kerja.

ASN juga berperan mendukung pembangunan berwawasan lingkungan, kebijakan ramah lingkungan, dan edukasi masyarakat tentang lingkungan. Tanpa kepedulian ASN, upaya pelestarian lingkungan akan sulit berjalan efektif.

## Sikap yang Menunjukkan Kurangnya Kepedulian Lingkungan

- Bersikap acuh tak acuh terhadap kondisi lingkungan.
- Merusak lingkungan atau membiarkan kerusakan terjadi.
- Boros menggunakan sumber daya (listrik, air, kertas, fasilitas kantor).
- Tidak mendukung program lingkungan di instansi.
- Mengabaikan kebersihan lingkungan kerja.

## Ringkasan Inti

- ASN harus peduli terhadap lingkungan, bukan hanya kebersihan kantor.
- Lingkungan bersih mendukung kinerja.
- Penggunaan sumber daya harus bijak dan hemat.
- ASN adalah teladan masyarakat dalam perilaku ramah lingkungan.
- Pembangunan berkelanjutan harus didukung secara aktif.

Kerangka berpikirnya: **Peduli → Bertanggung Jawab → Hemat → Teladan → Berkelanjutan**.''',
    "tkp-kartu-sakti-s01": '''Kelompok: Kemampuan Berpikir (KB)

Definisi: Kemampuan menggunakan berbagai sudut pandang dalam menghadapi tuntutan perubahan.

| Level | Deskripsi |
|---|---|
| 0 | Mengetahui adanya perbedaan sudut pandang. |
| 1 | Mengenali sudut pandang orang lain yang berbeda. |
| 2 | Menyadari sudut pandang orang lain yang berbeda. |
| 3 | Menyelaraskan sudut pandang pribadinya dengan sudut pandang orang lain. |
| 4 | Mengakui kebenaran sudut pandang orang lain. |
| 5 | Mengakomodasi berbagai perbedaan sudut pandang sesuai dengan tuntutan perubahan. |
| 6 | Mendayagunakan berbagai sudut pandang orang lain untuk mengoptimalkan kemampuan berpikir. |

Kata kunci: Mampu menggunakan berbagai sudut pandang.''',
    "tkp-kartu-sakti-s02": '''Kelompok: Kemampuan Berpikir (KB)

Definisi: Kemampuan memunculkan ide, gagasan dan pemikiran baru dalam rangka meningkatkan efektivitas kerja.

| Level | Deskripsi |
|---|---|
| 0 | Menggunakan gagasan / pemikiran yang sudah ada. |
| 1 | Mengenali adanya gagasan baru. |
| 2 | Mengidentifikasi alternatif ide dan gagasan baru yang mungkin dapat diterapkan. |
| 3 | Menentukan alternatif ide yang mungkin dapat diterapkan. |
| 4 | Mengadopsi ide / pemikiran yang cocok diterapkan dalam lingkungan kerja. |
| 5 | Mengadaptasi ide / pemikiran untuk efektivitas organisasi. |
| 6 | Menciptakan ide pemikiran yang orisinil yang bermanfaat bagi organisasi. |

Kata kunci: Mampu membuat ide / gagasan dan pemikiran baru.''',
    "tkp-kartu-sakti-s03": '''Kelompok: Kemampuan Berpikir (KB)

Definisi: Kemampuan menguraikan permasalahan berdasarkan informasi yang relevan dari berbagai sumber secara komprehensif untuk mengidentifikasi penyebab dan dampak terhadap organisasi.

| Level | Deskripsi |
|---|---|
| 0 | Mengetahui permasalahan yang terjadi dalam pekerjaan. |
| 1 | Memahami permasalahan yang terjadi dalam pekerjaannya. |
| 2 | Menguraikan faktor-faktor penyebab dan dampak dari permasalahan terkait dengan pekerjaannya. |
| 3 | Mengidentifikasi faktor-faktor potensial permasalahan yang berdampak kepada keberlangsungan organisasi. |
| 4 | Menguraikan dampak jangka panjang dari permasalahan yang muncul terhadap kelangsungan kegiatan organisasi. |
| 5 | Merumuskan pendekatan komprehensif yang dapat dilakukan organisasi untuk mengatasi permasalahan organisasi. |
| 6 | Memproyeksikan situasi / dampak jangka panjang dari suatu fenomena umum dari sudut pandang kepentingan organisasi. |

Kata kunci: Mampu menganalisis permasalahan atau mengurai permasalahan.''',
    "tkp-kartu-sakti-s04": '''Kelompok: Kemampuan Berpikir (KB)

Definisi: Kemampuan mengidentifikasi pola atau hubungan dalam suatu rangkaian informasi untuk membentuk pemahaman baru terhadap informasi tersebut.

Pola atau hubungan itu dikenali dari data atau informasi yang sudah tersedia berdasarkan suatu konsep yang konkret dan sederhana, lalu disimpulkan menjadi suatu rumusan yang jelas dan komprehensif.

| Level | Deskripsi |
|---|---|
| 0 | Membuat kesimpulan dari suatu hal berdasarkan informasi parsial. |
| 3 | Mengkaji proses pengambilan kesimpulan / formulasi-formulasi pola hubungan informasi. |
| 4 | Merumuskan konsep berdasarkan pola hubungan informasi yang ada. |
| 5 | Mengembangkan suatu konsep baru sesuai dengan kebutuhan nyata organisasi. |
| 6 | Mengembangkan suatu konsep baru sesuai dengan kebutuhan organisasi ke depan. |

Kata kunci: Mampu menghubungkan pola menjadi hubungan suatu informasi.''',
    "tkp-kartu-sakti-s05": '''Kelompok: Mengelola Diri (MD)

Definisi: Kemampuan menyesuaikan diri terhadap perubahan sehingga tetap dapat mempertahankan efektivitas kerja.

| Level | Deskripsi |
|---|---|
| 0 | Menganggap perubahan bukan suatu hal yang penting. |
| 1 | Mengikuti perubahan sesuai dengan tuntutan kebijakan organisasi. |
| 2 | Menyesuaikan diri terhadap perubahan yang terjadi atas kesadaran dan inisiatif sendiri. |
| 3 | Mencari alternatif dan pendekatan diri untuk memenuhi kebutuhan dari situasi yang berbeda dan baru. |
| 4 | Mengembangkan kemampuan diri untuk menghadapi tuntutan atau dinamika perubahan. |
| 5 | Mengantisipasi perubahan dan membuat penyesuaian jangka panjang dalam organisasi sebagai respon terhadap situasi. |

Kata kunci: Mampu menyesuaikan terhadap perubahan situasi dalam lingkungan kerja. Membuat pola-pola atau pendekatan baru dalam penyesuaian dirinya dengan dinamika tuntutan perubahan baik jangka pendek maupun jangka panjang.''',
    "tkp-kartu-sakti-s06": '''Kelompok: Mengelola Diri (MD)

Definisi: Kemampuan bertindak secara konsisten dan transparan dalam segala situasi dan kondisi sesuai dengan nilai-nilai, norma atau etika yang berlaku di lingkungan kerja.

| Level | Deskripsi |
|---|---|
| 0 | Menyadari tentang pentingnya norma dan etika bagi organisasi. |
| 1 | Menerapkan norma dan etika organisasi sebatas memenuhi kewajiban. |
| 2 | Menerapkan norma dan etika organisasi sebatas pada dirinya dalam segala situasi dan kondisi. |
| 3 | Mengingatkan dan mengupayakan orang lain untuk bertindak sesuai dengan nilai, norma dan etika organisasi dalam segala situasi dan kondisi. |
| 5 | Menciptakan situasi kerja yang membuat rekan kerja mematuhi nilai, norma dan etika organisasi dalam segala situasi dan kondisi. |
| 6 | Memberi teladan dalam menerapkan nilai, norma dan etika organisasi pada segala situasi dan kondisi. |

Kata kunci: Mampu bertindak secara konsisten.''',
    "tkp-kartu-sakti-s11": '''Kelompok: Mengelola Diri (MD)

Definisi: Kemampuan untuk selalu meningkatkan kinerja dengan lebih baik di atas standar secara terus-menerus.

| Level | Deskripsi |
|---|---|
| 0 | Melaksanakan tugas tanpa mempertimbangkan tuntutan standar. |
| 1 | Menyelesaikan tugas berdasarkan standar rata-rata. |
| 2 | Menyelesaikan tugas dengan standar di atas rata-rata. |
| 3 | Melakukan pembelajaran terhadap proses dan hasil pekerjaan untuk pencapaian hasil kerja lebih baik. |
| 4 | Melakukan langkah-langkah perbaikan untuk mencapai kinerja yang optimal. |
| 5 | Melakukan monitoring terhadap proses kerja untuk pencapaian efektivitas kerja. |
| 6 | Membuat cara atau pendekatan baru dalam meningkatkan kualitas dan kuantitas hasil pekerjaan. |

Kata kunci: Mampu meningkatkan kinerja.''',
    "tkp-kartu-sakti-s14": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan meyakinkan, mempengaruhi dan memotivasi orang lain dengan tujuan agar mereka mengikuti dan melaksanakan rencana kerja unit / organisasi.

| Level | Deskripsi |
|---|---|
| 0 | Membiarkan keadaan setiap orang bekerja tanpa pengarahan. |
| 1 | Meyakinkan orang lain tentang pentingnya pencapaian tujuan organisasi. |
| 2 | Membina bawahan dalam penyelesaian pekerjaan. |
| 3 | Mendelegasikan pekerjaan dan wewenang sesuai kompetensi dan potensi bawahan. |
| 4 | Mengorganisir sumber daya yang tersedia untuk optimalisasi pencapaian tujuan organisasi. |
| 5 | Membangun situasi kerja yang kondusif. |
| 6 | Menggunakan strategi atau perilaku tertentu yang dapat mempengaruhi orang lain untuk mencapai tujuan. |

Kata kunci: Mampu meyakinkan, mempengaruhi dan memotivasi orang.''',
    "tkp-kartu-sakti-s15": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan memberikan bimbingan dan umpan balik secara teratur terhadap bawahan agar bekerja secara terarah sesuai dengan rencana.

| Level | Deskripsi |
|---|---|
| 0 | Menginformasikan tugas-tugas yang harus dilakukan oleh bawahan secara tersirat. |
| 1 | Menjelaskan tugas secara rinci agar bawahan dapat melakukan tugas-tugasnya dengan baik. |
| 2 | Menentukan target kerja yang harus dicapai oleh bawahan. |
| 3 | Mengkomunikasikan hal-hal yang harus dilakukan bawahan agar target kerja yang telah ditentukan dapat tercapai. |
| 4 | Membantu bawahan saat menghadapi kendala sehingga pelaksanaan tugas dapat berjalan optimal. |
| 5 | Memberikan umpan balik terhadap hasil pekerjaan bawahan sebagai upaya untuk meningkatkan kinerja. |
| 6 | Menentukan faktor-faktor potensial yang berpengaruh pada pencapaian dan kegagalan pekerjaan. |

Kata kunci: Mampu membimbing dan memberikan umpan balik kepada bawahan.''',
    "tkp-kartu-sakti-s16": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan melakukan upaya untuk mengetahui, memahami, dan memenuhi kebutuhan pelanggan dalam setiap aktivitas pekerjaannya.

| Level | Deskripsi |
|---|---|
| 0 | Memberikan pelayanan tergantung pada situasi dan kondisi pribadinya. |
| 1 | Mengidentifikasi faktor-faktor yang menjadi kebutuhan pelanggan. |
| 2 | Memenuhi kebutuhan pelanggan sesuai sumber daya organisasi yang tersedia. |
| 3 | Meningkatkan kemampuan organisasi untuk memenuhi kebutuhan pelanggan. |
| 4 | Melakukan upaya perbaikan pelayanan kepada pelanggan secara terus menerus. |
| 5 | Mencari alternatif pelayanan terbaik untuk memuaskan kebutuhan pelanggan. |
| 6 | Menginternalisasikan nilai dan semangat pelayanan ke setiap individu di lingkungan organisasi. |

Kata kunci: Mampu memberikan kepuasan pelanggan.''',
    "tkp-kartu-sakti-s17": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan untuk sadar dan tanggap, serta peduli terhadap kondisi-kondisi yang dapat mempengaruhi keselamatan pegawai.

| Level | Deskripsi |
|---|---|
| 0 | Menentukan pentingnya faktor dan prosedur keselamatan kerja. |
| 1 | Mematuhi prosedur K3 karena adanya tuntutan dari organisasi. |
| 2 | Mematuhi prosedur K3 atas kesadaran diri sendiri. |
| 3 | Menggunakan peralatan atau perlengkapan K3 tambahan yang dirasakan perlu. |
| 4 | Melaporkan kondisi-kondisi yang berpengaruh terhadap keselamatan kerja. |
| 5 | Mengajak orang lain untuk bekerja sesuai dengan prosedur keselamatan kerja. |
| 6 | Mengusulkan sistem keselamatan kerja yang sesuai dengan kondisi dan lingkungan kerja. |

Kata kunci: Mampu untuk tanggap, sadar dan peduli terhadap keselamatan kerja.''',
    "tkp-kartu-sakti-s19": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan untuk menemukan berbagai alternatif dalam rangka membuat kesepakatan dengan mengakomodasi kepentingan semua pihak.

| Level | Deskripsi |
|---|---|
| 0 | Menerima tawaran apa adanya sesuai dengan usulan pihak lain. |
| 1 | Menerima tawaran kerjasama berdasarkan informasi parsial. |
| 2 | Mengumpulkan informasi yang relevan terkait dengan tujuan yang ingin dicapai dengan pihak-pihak yang terlibat. |
| 3 | Mengajukan alternatif penawaran dengan mempelajari risiko yang mungkin timbul. |
| 4 | Melakukan tawar menawar kepentingan dengan mempertimbangkan fakta, data, dan risiko. |
| 5 | Membangun dukungan bagi alternatif pilihan dengan cara bertukar pikiran dan menggunakan strategi yang relevan / tertentu. |
| 6 | Membuat kesepakatan yang saling menguntungkan dan mengakomodasi kepentingan semua pihak. |

Kata kunci: Mampu membuat kesepakatan yang menguntungkan.''',
    "tkp-kartu-sakti-s20": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan mencari, menciptakan serta menerapkan cara kerja, teknologi dan produk baru untuk memberdayakan organisasi dalam rangka meningkatkan kualitas pelayanan.

| Level | Deskripsi |
|---|---|
| 0 | Menerima kondisi organisasi apa adanya. |
| 1 | Mempelajari setiap kondisi untuk melihat kemungkinan optimalisasi organisasi. |
| 2 | Memanfaatkan peluang dalam rangka optimalisasi organisasi. |
| 3 | Merumuskan konsep dasar optimalisasi organisasi. |
| 4 | Mendorong dan mengembangkan sumber daya yang ada untuk mendukung konsep optimalisasi organisasi. |
| 5 | Melakukan upaya untuk mencari sumber daya yang dibutuhkan guna mewujudkan idenya. |
| 6 | Membangun budaya kemandirian dalam organisasi. |

Kata kunci: Mampu memberdayakan organisasi.''',
    "tkp-kartu-sakti-s21": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan mengumpulkan data / informasi yang dibutuhkan secara sistematik untuk menunjang kelancaran pelaksanaan pekerjaan dan pengambilan keputusan.

| Level | Deskripsi |
|---|---|
| 0 | Mengumpulkan data / informasi tanpa mempertimbangkan kesahihannya. |
| 1 | Mengumpulkan informasi dari orang lain atau berbagai media yang terpercaya. Menggali informasi lewat pertanyaan kepada orang yang terlibat, langsung maupun tidak langsung, untuk menemukan akar permasalahan. |
| 3 | Menguji kesahihan data / informasi yang terkumpul. |
| 4 | Menyusun data atau informasi dalam suatu paparan informasi yang baru. |
| 5 | Menentukan data / informasi yang relevan untuk mendukung pengambilan kesimpulan maupun penyelesaian pekerjaan. |
| 6 | Membuat kesimpulan berdasarkan informasi yang relevan dan akurat. |

Kata kunci: Mampu menggali berbagai data / informasi secara sistematik.''',
    "tkp-kartu-sakti-s22": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan untuk memastikan / mengurangi ketidakpastian khususnya berkaitan dengan penugasan, kualitas, dan ketepatan / ketelitian data serta informasi di tempat kerja.

| Level | Deskripsi |
|---|---|
| 0 | Mengabaikan pelaksanaan tugas sesuai dengan standar pelaksanaan pekerjaan. |
| 1 | Mempelajari prosedur kerja yang terkait dengan pelaksanaan pekerjaan diri sendiri. |
| 2 | Memelihara lingkungan kerja seperti meja, berkas-berkas, perkakas, dan lain-lain dalam susunan yang baik dan teratur. |
| 3 | Memeriksa ulang akurasi pelaksanaan tugas dan hasil yang diharapkan dan standar yang ditetapkan. |
| 4 | Menggunakan sistem untuk mengelola dan melacak setiap informasi secara sistematis. |
| 5 | Memantau kualitas pekerjaan untuk meyakinkan bahwa pelaksanaan tugas telah sesuai prosedur. |

Kata kunci: Mampu melaksanakan keteraturan sesuai dengan standar pekerjaan. Mengembangkan suatu sistem yang baru untuk meningkatkan keteraturan untuk meningkatkan kualitas pelaksanaan pekerjaan.''',
    "tkp-kartu-sakti-s23": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan menyampaikan pendapat / ide / informasi secara lisan dengan menggunakan kata / kalimat yang mudah dimengerti.

| Level | Deskripsi |
|---|---|
| 0 | Menanggapi secara pasif kegiatan komunikasi lisan / diskusi. |
| 1 | Menjelaskan suatu hal / permasalahan dengan bahasa yang kurang runtut / sistematis. |
| 2 | Memberikan tanggapan atas pertanyaan orang lain dengan menggunakan kalimat sederhana. |
| 3 | Mengungkapkan pendapat / ide / informasi dengan kalimat yang sistematis dan dimengerti orang lain. |
| 4 | Mengajukan pertanyaan untuk menggali informasi dari orang lain. |
| 5 | Menggunakan gaya bahasa yang dapat dimengerti orang lain secara sistematis kepada orang lain yang berbeda latar belakangnya. |
| 6 | Mengarahkan orang lain untuk memahami maksud pembicaraan agar mendukung idenya. |

Kata kunci: Mampu berkomunikasi lisan yang mudah dimengerti.''',
    "tkp-kartu-sakti-s24": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan menyampaikan pendapat / ide / informasi secara jelas dengan menggunakan tulisan dan tata bahasa dengan baik dan benar.

| Level | Deskripsi |
|---|---|
| 0 | Menuangkan ide dan gagasan dalam bentuk tulisan yang susah dipahami. |
| 1 | Menyampaikan ide dan gagasan dengan menerapkan kaidah atau tatacara menulis dengan benar dan terstruktur. |
| 2 | Menuangkan ide dan gagasan ke dalam bentuk tulisan dengan alur berpikir yang logis. |
| 3 | Menyederhanakan permasalahan yang rumit dengan menggunakan bahasa tulis yang efisien. |
| 4 | Mengontekstualisasikan gagasan dan ide dalam bentuk tulisan dengan data dan contoh yang aplikatif. |
| 5 | Membuat tulisan yang dapat dijadikan rujukan bagi penyelesaian permasalahan. |
| 6 | Membuat tulisan yang dapat menginspirasi orang untuk mengikuti gagasannya. |

Kata kunci: Mampu menyampaikan gagasan yang mudah diterima pembaca.''',
    "tkp-kartu-sakti-s25": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan mengambil tindakan secara cepat dan tepat dengan mempertimbangkan dampak serta bertanggung jawab dengan keputusannya.

| Level | Deskripsi |
|---|---|
| 0 | Membuat keputusan yang bersifat subjektif. |
| 1 | Mengidentifikasi permasalahan yang terjadi sebelum pengambilan keputusan. |
| 2 | Membuat keputusan yang responsif berdasarkan data / informasi dan sesuai keadaan lingkungan. |
| 3 | Membuat keputusan yang dapat mengakomodasi kepentingan semua pihak. |
| 4 | Membuat keputusan yang sulit / dilematis dan cepat dengan mempertimbangkan konsekuensinya. |
| 5 | Memastikan pelaksanaan keputusan dengan memantau hasilnya dengan membuat penyesuaian-penyesuaian yang diperlukan. |
| 6 | Membuat keputusan strategis dan berdampak jangka panjang dengan didukung data informasi yang komprehensif dan akurat. |

Kata kunci: Mampu bertindak cepat dan tepat dalam keputusan.''',
    "tkp-kartu-sakti-s26": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan mengkoordinasikan pelaksanaan pekerjaan agar berjalan sesuai dengan rencana yang telah ditetapkan.

| Level | Deskripsi |
|---|---|
| 0 | Menyerahkan penyelesaian pekerjaan kepada orang lain. |
| 1 | Membagi tugas sesuai kemampuan pegawai. |
| 2 | Melakukan monitoring dan evaluasi secara berkala selama kegiatan berlangsung. |
| 3 | Mengkoordinasikan penggunaan sumber daya yang terbatas secara efektif. |
| 4 | Mengkoordinasikan aktivitas yang beragam antar unit kerja / kelompok kerja secara berkala. |
| 5 | Menyiapkan penyelesaian permasalahan secara efisien sesuai dengan prediksi permasalahan yang mungkin timbul dalam pelaksanaan suatu kegiatan / program. |
| 6 | Menentukan sumber daya yang dibutuhkan dalam jangka panjang sesuai dengan rencana strategis organisasi. |

Kata kunci: Mampu mengkoordinasikan kegiatan.''',
    "tkp-kartu-sakti-s27": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan menyusun rencana kerja yang spesifik, realistis, dan terukur sesuai dengan visi, misi dan tujuan jangka panjang organisasi.

| Level | Deskripsi |
|---|---|
| 0 | Melaksanakan kegiatan kerja tanpa perencanaan. |
| 1 | Mengidentifikasi efektivitas pelaksanaan tugas sebagai bahan perencanaan ke depan. |
| 2 | Menyusun rencana kegiatan sesuai dengan rencana operasional. |
| 3 | Menyusun rencana operasional sesuai program kerja. |
| 4 | Menyusun program kerja sesuai dengan rencana strategis. |
| 5 | Menyusun rencana strategis sesuai dengan visi, misi, nilai-nilai dan tujuan organisasi. |
| 6 | Menyusun visi, misi, nilai-nilai dan tujuan unit kerja / organisasi. |

Kata kunci: Mampu menyusun rencana kerja.''',
    "tkp-kartu-sakti-s28": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan mengelola sumber daya untuk menghadapi tuntutan perubahan dalam rangka mencapai tujuan organisasi dengan kinerja yang lebih baik.

| Level | Deskripsi |
|---|---|
| 0 | Melakukan pekerjaan tanpa mempertimbangkan dinamika tuntutan perubahan. |
| 1 | Mengidentifikasi tuntutan perubahan yang dihadapi organisasi. |
| 2 | Mengkomunikasikan perubahan yang terjadi kepada seluruh komponen organisasi. |
| 3 | Melakukan berbagai upaya yang dibutuhkan organisasi dalam menghadapi perubahan. |
| 4 | Mengevaluasi pelaksanaan program-program perubahan organisasi untuk jangka panjang. |
| 5 | Menanamkan nilai-nilai, sikap dan budaya sesuai dengan dinamika perubahan. |
| 6 | Mengembangkan sistem nilai dan budaya organisasi sesuai dengan kecenderungan tuntutan organisasi ke depan. |

Kata kunci: Mampu merespon dinamika perubahan.''',
    "tkp-kartu-sakti-s29": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan melaksanakan tugas-tugas dengan mempertimbangkan semua aspek pekerjaan secara detil untuk mencapai mutu yang lebih baik.

| Level | Deskripsi |
|---|---|
| 0 | Melaksanakan pekerjaan dengan mengabaikan prosedur yang ditentukan. |
| 1 | Melakukan pelaksanaan tugas sesuai prosedur dan sumberdaya yang standar. |
| 2 | Mengamati proses kerja untuk mengantisipasi masalah yang tidak sesuai standar kerja. |
| 3 | Memperbaiki / menelaah ulang proses kerja untuk mendapatkan hasil kerja lebih baik. Melakukan penelaahan terhadap seluruh sumber daya dan standar yang ada serta aspek lain yang terkait secara komprehensif untuk hasil kerja yang inovatif. |
| 5 | Menentukan sumberdaya dan standar yang sesuai untuk mendapatkan mutu kerja yang diharapkan. |
| 6 | Menentukan proses kerja dan standar kerja baru sesuai dengan kecenderungan tuntutan mutu ke depan. |

Kata kunci: Mampu mencapai mutu pada semua aspek pekerjaan.''',
    "tkp-kartu-sakti-s30": '''Kelompok: Mengelola Orang Lain (MO)

Definisi: Kemampuan mengambil langkah-langkah untuk mengelola perselisihan menuju arah yang produktif.

| Level | Deskripsi |
|---|---|
| 0 | Menghindari konflik dan menganggap konflik sebagai sesuatu yang negatif. |
| 1 | Mengidentifikasi sumber-sumber konflik berdasarkan jenis konflik. |
| 2 | Meletakan berbagai sudut pandang / kepentingan dalam konteks yang tepat. |
| 3 | Mengupayakan berbagai pihak untuk bersikap terbuka dan objektif dalam penyelesaian konflik. |
| 4 | Memberikan alternatif solusi dengan berbagai konsekuensinya. |
| 5 | Menyelesaikan konflik menjadi hal yang positif dan produktif. |
| 6 | Menumbuhkan kondisi yang kondusif untuk berbagi pandangan yang terbuka dan objektif serta kreatif. |

Kata kunci: Mampu penyelesaian konflik.''',
    "tkp-kartu-sakti-s31": '''Kelompok: Mengelola Sosial dan Budaya (SB)

Definisi: Kemampuan menghargai keragaman budaya dan perbedaannya yang menjadi latar belakang individu pegawai dan lingkungan masyarakat di sekitarnya.

Perbedaan budaya dapat mempengaruhi efektivitas pencapaian tujuan organisasi dan harmoni masyarakat.

| Level | Deskripsi |
|---|---|
| 0 | Menganggap perbedaan latar belakang budaya dan hidup berdampingan dengan masyarakat tidak memiliki relevansi dengan keberhasilan organisasi. |
| 2 | Menghimpun masukan berbagai sudut pandang yang berbeda sesuai dengan latar belakang budaya yang ada. |
| 3 | Melakukan tindakan yang sesuai dengan norma budaya yang berlaku. |
| 4 | Mengarahkan orang lain untuk menghargai perbedaan budaya. |
| 5 | Mendayagunakan perbedaan budaya untuk menunjang kelancaran pencapaian tujuan organisasi dan penerimaan organisasi di lingkungan masyarakat sekitarnya. |

Kata kunci: Mampu menghargai keragaman budaya pegawai dan lingkungan masyarakat.

Menciptakan suasana interaksi setiap individu untuk bekerjasama dalam lingkungan internal organisasi dan lingkungan eksternal di masyarakat sehingga dirasakan keberadaannya secara positif.''',
    "tkp-kartu-sakti-s32": '''Kelompok: Mengelola Sosial dan Budaya (SB)

Definisi: Kemampuan untuk mendengarkan dan memahami pikiran, perasaan, atau masalah orang lain yang tidak terucapkan atau tidak sepenuhnya disampaikan.

| Level | Deskripsi |
|---|---|
| 0 | Mengabaikan pikiran, perasaan, dan permasalahan orang lain. |
| 1 | Mendengarkan keluhan / ungkapan perasaan orang lain. |
| 2 | Menyediakan diri untuk selalu mendengarkan keluhan / ungkapan perasaan orang lain. |
| 3 | Merasakan perasaan dan permasalahan orang lain yang tidak terungkapkan. |
| 4 | Menolong orang lain pada saat seseorang mengalami kesulitan / kesusahan. |
| 5 | Mengajak orang lain untuk turut serta dalam membantu orang lain yang dalam kesusahan. |
| 6 | Melakukan tindakan secara aktif untuk membantu orang-orang yang berkesusahan dan kurang beruntung. |

Kata kunci: Mampu peduli terhadap orang lain.''',
    "tkp-kartu-sakti-s33": '''Kelompok: Mengelola Sosial dan Budaya (SB)

Definisi: Kemampuan membangun kontak atau hubungan timbal balik yang menghasilkan suatu proses saling mempengaruhi, antarindividu, antarkelompok, atau antara individu dan kelompok.

| Level | Deskripsi |
|---|---|
| 0 | Mengabaikan hubungan dengan lingkungan sekitar. |
| 1 | Menerima perbedaan adanya pola pikir, perilaku adat yang berbeda. |
| 2 | Membangun keterbukaan dalam menjalin hubungan antar individu maupun kelompok. |
| 3 | Menghargai dengan melakukan toleransi antar individu maupun antar kelompok. |
| 4 | Menyesuaikan diri dengan pola pikir, perilaku dan adat yang berbeda dengan dirinya. |
| 5 | Membangun keterikatan atas dasar saling percaya antar individu maupun kelompok. |
| 6 | Memadukan perbedaan dengan membentuk kebiasaan baru tanpa menghilangkan ciri kepribadian / adat masing-masing. |

Kata kunci: Mampu membangun keterikatan dan hubungan timbal balik.''',
    "tkp-modul-s01": '''## Apa Itu TKP

Tes Karakteristik Pribadi (TKP) digunakan untuk mengukur karakter keseharian peserta tes CPNS yang berkaitan dengan kultur lingkungan kerja kepegawaian PNS dalam pelayanan publik.

Pelayanan publik itu tersebar di berbagai lini pemerintahan, seperti kementerian, lembaga nasional, maupun pemerintah daerah tingkat I dan II.

## Aspek yang Diuji

Ada banyak aspek karakteristik pribadi yang diuji dalam TKP, antara lain:

- integritas diri
- kejujuran
- tanggung jawab
- kemampuan beradaptasi
- pengendalian diri
- semangat untuk terus berprestasi
- inisiatif
- kreativitas dan inovasi
- ketekunan
- penghargaan terhadap orang lain atau orientasi pada pelayanan
- ketegasan
- kepercayaan diri
- toleransi
- kepedulian terhadap lingkungan
- efisiensi dalam bekerja''',
    "tkp-modul-s02": '''## Apa yang Diukur

Aspek integritas diri bertujuan mengukur tingkat kebaikan atau ketulusan hati seseorang dalam kehidupan sehari-hari. Tes ini menjadi acuan kesesuaian antara tingkah laku peserta dengan perkataan dan perbuatan yang dilakukannya.

Biasanya kualitas kepribadian seseorang sebanding dengan integritas dirinya.

## Ciri Orang Berintegritas

- berani mengatakan kebenaran
- dapat membedakan dengan pasti hal yang benar dan salah
- berani memperjuangkan kebaikan dan kebenaran
- tidak takut terhadap risiko apa pun atas tindakan membela atau mempertahankan kebenaran, meskipun risikonya bisa mengancam kelangsungan kariernya

Pada era yang kompleks seperti saat ini, sangat jarang didapati orang yang memiliki integritas tinggi.

Tidak mengherankan apabila orang seperti itu layak menjadi pemimpin dengan tanggung jawab besar, seperti mengatur urusan-urusan penting yang menyangkut kepentingan rakyat banyak.

## Tips

- Jadilah pribadi yang berintegritas: jujur, tegas, dan disiplin.
- Pahamilah bahwa semakin tinggi integritas yang kamu miliki, semakin segan dan hormat semua pihak kepadamu. Begitu pun sebaliknya.''',
    "tkp-modul-s03": '''## Apa yang Diukur

Aspek kejujuran digunakan untuk mengukur tingkat kejujuran sesuai norma agama yang dianut. Hal ini terlihat dari:

- ketulusan hati dalam perbuatan
- selalu berkata yang benar
- tidak melakukan kecurangan, baik yang besar maupun yang kecil

## Contoh Kecurangan

Kecurangan kecil, misalnya mencurangi waktu kerja dan mencurangi penggunaan fasilitas kantor.

Kecurangan besar, misalnya korupsi, suap-menyuap, rekayasa kasus, menjual aset negara, mark-up nilai proyek, dan pemufakatan jahatan.

## Tips

- Ikuti gerakan pemerintah: Berani jujur itu hebat!
- Biasakan berbuat jujur, karena hidupmu akan lebih tenang.
- Pahamilah bahwa jika kamu mulai tergoda melakukan kecurangan kecil, sering kali karena terbiasa maka muncul dorongan melakukan kecurangan besar.
- Kejujuran sangatlah penting, karena setiap tindakan pasti akan diminta pertanggungjawabannya, baik selagi masih di dunia maupun nanti di akhirat.
- Apabila tidak bisa memikirkan penyelesaian suatu masalah sendiri, mintalah pertimbangan dari orang lain yang dipercaya dan memiliki keahlian di bidang yang kamu tanyakan.''',
    "tkp-modul-s04": '''## Bekerja Mandiri dan Tuntas

Kemampuan bekerja mandiri sampai tuntas merupakan bentuk tanggung jawab. Aspek tanggung jawab diuji dalam tes TKP untuk mengukur tingkat kedewasaan seseorang dalam mempertanggungjawabkan apa yang telah dilakukannya.

Indikasinya adalah mampu menanggung risiko dari tindakan yang telah diperbuat, baik selaku tindakan pribadi maupun tindakan yang dilakukan oleh anggota tim yang berada di bawah wewenangnya.

## Kenapa Ini Penting

Tanggung jawab merupakan karakter yang harus dimiliki setiap pegawai, terutama pegawai yang bekerja di lingkungan publik, karena setiap tindakannya memiliki dampak bagi orang banyak.

Misalnya bagi karyawan lain, bagi perusahaan atau instansi tempat bekerja, atau bagi orang yang membutuhkan jasa atau pelayananmu.

## Tips

- Berusaha sebaik-baiknya, teliti dan hati-hati dalam setiap tindakan.
- Selalu berpikir positif.
- Tidak pernah takut gagal.
- Mempertimbangkan dengan matang tindakan yang akan diambil.
- Usaha keras, kerja cerdas, dan yakin akan hasil yang baik meski Tuhan yang menentukan.
- Pahamilah bahwa setiap tindakan pasti dimintai pertanggungjawabannya.''',
    "tkp-modul-s05": '''## Apa yang Diukur

Aspek kemampuan beradaptasi diuji dalam tes TKP untuk mengukur tingkat kedewasaan dalam menyesuaikan diri.

Indikasinya adalah mampu beradaptasi dengan segala bentuk penyesuaian diri, seperti beradaptasi dengan lingkungan yang baru, suasana baru, rekan kerja baru, atasan baru, peraturan baru, dan hal lain yang berbeda dari yang biasa dialami.

Orang yang mudah beradaptasi juga ditandai dengan:

- menyukai perubahan sehingga tidak takut lagi dengan perubahan
- menjadi pribadi yang selalu berpikiran maju
- mau belajar hal-hal yang baru

## Tips

Kemampuan beradaptasi setiap orang sangat beragam. Beberapa tips berikut bisa dicoba untuk melatihnya:

- Pahamilah bahwa segala sesuatu, cepat atau lambat, pasti akan mengalami perubahan.
- Berkompromilah dengan perubahan yang ada dalam hal kebaikan.
- Biasakan selalu dapat menyesuaikan diri dengan lingkungan yang baru.
- Berlatihlah untuk senantiasa memperbaiki diri agar selalu lebih baik.
- Amatilah perubahan-perubahan di sekitar lingkunganmu untuk mengoptimalkan prestasi.''',
    "tkp-modul-s06": '''## Apa yang Diukur

Ketika seseorang menghadapi situasi tertentu, apalagi situasi yang tidak disukai, emosinya cenderung muncul. Pada kondisi itu, orang tersebut sedang diuji aspek pengendalian diri.

Aspek pengendalian diri diujikan dalam tes TKP untuk mengukur tingkat kedewasaan seseorang dalam mengontrol emosinya ketika menghadapi situasi tertentu yang tidak disukainya.

Sikap seseorang yang memiliki kemampuan pengendalian diri terindikasi dari berpikiran terbuka.

## Tips

- Apabila kamu ingin meluapkan emosi, pilihlah kegiatan positif yang mampu menyalurkan emosimu, contohnya olahraga, agar terhindar dari sikap emosi yang merusak.
- Beberapa metode pengendalian diri yang dapat dilakukan adalah puasa, yoga, atau meditasi.
- Puasa dikenal mampu mendidik agar jadi lebih sabar, lebih tahan banting terhadap masalah, dan lebih kuat mengendalikan amarah serta hawa nafsu yang merusak.
- Yoga atau meditasi dikenal mampu melatih ketenangan batin dan berpikir jernih.
- Pahamilah bahwa saat kamu menghadapi cobaan, kesabaran adalah kunci suksesnya.''',
    "tkp-modul-s07": '''## Apa yang Diukur

Tidak setiap pegawai memiliki semangat untuk terus berprestasi. Sebagian besar hanya berkeinginan bekerja sesuai standar. Padahal menjadi seorang CPNS diperlukan sifat yang haus akan prestasi.

Aspek semangat berprestasi diuji dalam tes TKP untuk mengukur tingkat motivasi serta kekuatan tekad seseorang dalam melaksanakan tugasnya dengan baik dan meraih target-target tertentu.

Pencapaian target yang diharapkan tentunya hasil yang signifikan kenaikannya dan penting.

## Ciri Orang yang Haus Prestasi

- akan meraih kesuksesan karier yang gemilang
- hampir selalu mendapatkan promosi kenaikan jabatan dari atasan atas kinerjanya
- mendapatkan kenaikan jabatan dengan cepat karena prestasinya
- gemar belajar hal-hal yang baru
- pikirannya terbuka

## Tips

- Selalu berpikir positif.
- Berusahalah untuk menjadi yang terbaik. Minimal apabila tidak tercapai, kamu sudah memiliki niat menjadi baik. Setelah itu, tetap menjaga kualitas kerja.
- Jauhkan pikiran dari keinginan memperoleh promosi dengan cara-cara yang tidak baik, karena hal itu akan mematikan daya inovasi, pikiran, dan semangat berprestasimu.
- Masuklah dalam kumpulan orang-orang baik, karena kamu akan terbiasa dengan kultur yang baik pula.
- Bergaul dengan orang yang selalu punya semangat untuk mendapatkan prestasi tinggi agar kamu ikut tertular olehnya.

Bersedih hati adalah wajar, namun jika berlarut-larut maka akan menjauhkan kita dari keinginan untuk maju.''',
    "tkp-modul-s08": '''## Apa Itu Inisiatif

Perubahan terjadi atas tindakan. Tindakan diperoleh dari inisiatif diri.

Inisiatif erat kaitannya dengan kreativitas kerja, namun keduanya memiliki perbedaan. Inisiatif adalah tentang idenya, sedangkan kreativitas adalah tentang pelaksanaan atau penerapan dari ide tersebut.

Daya inisiatif diperlukan untuk membuat situasi menjadi lebih baik. Oleh karena itu, setiap CPNS memerlukan aspek inisiatif.

## Apa yang Diukur

Aspek inisiatif diujikan pada tes TKP untuk mengukur tingkat kedewasaan dalam mencetuskan suatu ide tertentu yang berguna bagi khalayak, seperti masyarakat, organisasi, atau instansi baik milik pemerintah maupun swasta.

## Tips

- Buka pikiranmu. Perbanyak wawasan.
- Berlatihlah berpikir cepat, detail, logis, dan terstruktur.
- Jadilah pendengar yang baik.
- Jadilah yang pertama memberikan ide-ide segar dalam pekerjaan.
- Ditolak adalah hal yang wajar, apalagi ditolak oleh atasan yang profesional tentunya ada alasan yang mendasar. Pahamilah penolakan tersebut sebagai upaya agar kamu ada usaha untuk memperbaiki.''',
    "tkp-modul-s09": '''## Apa yang Diukur

Aspek kreativitas kerja dan inovasi bertujuan mengukur apakah kamu memiliki kreativitas atau daya cipta untuk membuat sesuatu yang baru atau inovasi.

Inovasi dapat berupa benda secara fisik, cara melakukan, sistem yang akan digunakan, ataupun hal lainnya.

## Ciri Inovasi yang Baik

**Sifat keterbaruan**

Keterbaruan yang dimaksud adalah tidak bersifat sama dengan inovasi yang sudah ada (tidak plagiat).

**Sifat optimal**

Misalnya hasil yang dicapai lebih cepat pencapaiannya, lebih hemat sumber daya, dan sebagainya.

**Kelebihan tertentu jika dibandingkan dengan yang lama**

Misalnya sistem yang ditemukan lebih baik daripada sistem yang sedang digunakan saat ini, ataupun kelebihan lain yang signifikan.

Kreativitas kerja dan inovasi dalam jangka panjang dan kontinu mampu membawa perubahan yang mengarah ke keadaan yang lebih baik.

## Tips

- Berani mencoba mengerjakan suatu rutinitas dengan cara yang berbeda dari biasanya. Misalnya pergi ke kantor dengan rute atau kendaraan yang berbeda.
- Melatih diri memikirkan suatu ide yang belum pernah terlintas dalam benak (thinking out of the box).
- Menyelesaikan masalah dengan cara yang optimal.
- Selalu menyiapkan rencana cadangan.
- Perlu disikapi bahwa penolakan adalah ujian agar kamu lebih kreatif lagi dalam memberikan usulan yang inovatif.''',
    "tkp-modul-s10": '''## Apa yang Diukur

Rutinitas pekerjaan PNS dalam melayani publik sangatlah banyak. Tentunya diperlukan sifat tekun dalam diri PNS, sehingga tidak mengherankan apabila tes CPNS, terutama dalam tes TKP, terdapat soal yang menguji aspek ketekunan.

Hal ini bertujuan mengukur tingkat ketekunan seseorang. Indikasinya adalah:

- mempunyai performa kerja yang kontinu (terus-menerus) dan berkesinambungan
- mampu mengerjakan tugas-tugas rutinnya dengan baik tanpa bosan
- tetap menjaga kualitas pekerjaan
- tidak terlalu sering ganti-ganti pekerjaan dalam waktu yang relatif dekat, apalagi saat ganti pekerjaan ternyata hasil dari pekerjaan sebelumnya tidak terlalu bagus kualitasnya

Memiliki karakter tekun ini sangatlah penting bagimu, karena tugas rutinmu harus dikerjakan dengan baik untuk mendukung tercapainya tujuan dari instansi tempat kamu bekerja.

## Tips

- Pahamilah bahwa bekerja adalah ibadah.
- Ikhlas menerima pekerjaan yang sudah menjadi tanggung jawabnya, tanpa pamrih.
- Mau membantu pekerjaan rekan kerja yang lain.
- Cobalah melaksanakan pekerjaan dengan suasana hati yang riang. Sesekali bisa diselingi dengan mendengarkan musik yang bisa membangkitkan semangat kerja, asalkan tetap fokus pada pekerjaannya.
- Sikap sering marah kurang tepat, apalagi saat pekerjaan tidak beres. Sebaiknya lakukan evaluasi menyeluruh daripada mesti marah-marah.''',
    "tkp-modul-s11": '''## Apa yang Diukur

PNS sudah tentu harus siap dengan pekerjaan yang bersifat pelayanan. Hal itu merupakan suatu bentuk pengabdian bagi negara karena melayani masyarakat.

Aspek orientasi pada pelayanan yang diujikan di tes TKP bertujuan mengukur kesiapan dan kesigapan pada tugas pelayanan yang diberikan.

## Ciri Orang yang Berorientasi pada Pelayanan

- selalu mendahulukan kepentingan umum daripada kepentingan pribadi
- senang melayani, terutama untuk kepentingan orang banyak

Pelayanan yang baik perlu berlanjut di setiap pekerjaan dan di seluruh bagian.''',
    "tkp-modul-s12": '''## K. Menghargai Orang Lain

Aspek menghargai orang lain pada tes TKP bertujuan mengukur tingkat kedewasaan dalam menghargai orang lain.

Indikasinya adalah menerapkan penghargaan, yaitu menghargai pendapat, eksistensi, maupun kapasitas orang lain sebagai entitas yang ada di luar dirimu.

Menghargai orang lain sangatlah penting dalam karier dan kehidupan, sebab pada dasarnya setiap orang ingin dihormati dan dihargai sebagaimana mestinya, siapa pun dia, apa pun tugasnya, dan bagaimana pun pendapatnya dalam memandang sesuatu.

Pada dasarnya manusia adalah makhluk sosial, yaitu hidup di dunia dan butuh pertolongan dari orang lain. Oleh karena itu, manusia diciptakan untuk saling menolong.

Meskipun manusia diciptakan sebagai makhluk yang paling sempurna, setiap orang pasti mempunyai kelemahan dan kekurangan. Tujuan saling menolong adalah untuk menciptakan keharmonisan satu sama lain.

### Tips

- Pahamilah bahwa setiap orang memiliki kelebihan dan kekurangan masing-masing. Hargailah orang lain dengan tulus tanpa pamrih.
- Tidak ada manusia yang sempurna, jadi sadarilah bahwa kamu pun memiliki banyak kekurangan.
- Terhadap kekurangan orang lain, janganlah selalu dicari kesalahannya. Pikirkanlah bahwa orang tersebut pasti juga punya kelebihan.
- Menghargai dan menghormati orang lain bukanlah hal yang merendahkan diri sendiri, melainkan justru membuatmu menjadi orang terhormat.
- Berikanlah penghargaan atau pujian secara proporsional kepada orang lain yang berprestasi.
- Perlu dipahami bahwa menanyakan alasan mengapa berbeda pendapat sangat diperlukan dalam hal menggali informasi yang bisa saja kamu lewatkan, namun hal ini semestinya disampaikan dengan cara baik-baik.

## L. Ketegasan

Aspek ketegasan bertujuan mengukur seberapa kuat pendirianmu dalam membuat keputusan, terutama keputusan yang sangat sulit dan dilematis.

Karakter ketegasan ini sangat penting dimiliki oleh semua pegawai, terutama yang menduduki posisi pengambil keputusan.

Indikasi bahwa seseorang memiliki ketegasan adalah:

- tidak ragu dalam membuat keputusan
- berani mengambil keputusan yang benar meskipun hal itu menimbulkan efek-efek tertentu bagi orang di sekitarnya

Orang yang tidak memiliki ketegasan cenderung ragu-ragu dalam mengambil keputusan, biasanya karena takut akan sesuatu, bisa berupa tekanan atau karena jabatan seseorang lebih tinggi.

### Tips

- Pahamilah bahwa aturan ditegakkan demi ketertiban dan keteraturan. Dalam penegakan aturan dibutuhkan adanya ketegasan dan kedisiplinan.
- Perlu dipahami bahwa permasalahan yang ada di tim sebaiknya diselesaikan terlebih dahulu di tingkat tim. Apabila penyelesaian di tingkat tim tidak menjumpai perubahan yang berarti, barulah dilanjutkan ke tingkat berikutnya.''',
    "tkp-modul-s13": '''## M. Kepercayaan Diri

Setiap hari kita dihadapkan pada berbagai pilihan. Setiap hari pula kita membuat keputusan, baik keputusan kecil maupun keputusan besar.

Rasa percaya diri yang proporsional (tidak berlebihan) akan membantu kita memilih satu pilihan terbaik setelah melalui pertimbangan matang, di antara berbagai pilihan yang ada.

Oleh karena itu, tes TKP menguji aspek kepercayaan diri dengan tujuan mengukur tingkat rasa percaya terhadap diri sendiri, terutama saat mengambil keputusan maupun pada saat menghadapi hal penting lainnya.

## Tips

- Pahamilah bahwa manusia harus berusaha sebaik-baiknya, namun hasil akhir ditentukan oleh Tuhan.
- Setelah berusaha sebaik mungkin, yakinlah bahwa Tuhan akan memberikan hasil yang terbaik.
- Tidak perlu takut dengan hal yang belum terjadi, yang sudah terjadi, maupun yang sedang terjadi.
- Hasil yang tidak sesuai dengan harapan bukanlah akhir segalanya. Kamu tetap harus bangkit dan memperbaiki diri.''',
    "tkp-modul-s14": '''## Apa yang Diukur

Aspek toleransi pada tes TKP bertujuan mengukur tingkat kedewasaanmu dalam bertoleransi.

Toleransi adalah sikap menerima dan membantu orang lain yang sedang mengalami kesulitan tertentu sehingga, meskipun hal tersebut membuatmu kehilangan sumber daya (seperti materi, waktu, dan perhatian), kamu tetap melakukannya dengan tulus.

Contohnya, sikap toleransi dalam dunia pekerjaan diperlukan untuk saling membantu sesama rekan kerja dan sekaligus menjaga kekompakan tim, baik di dalam maupun di luar kantor.

## Tips

- Tidak ada manusia yang dapat hidup sendiri di dunia ini. Pahamilah bahwa manusia adalah makhluk sosial, yaitu hidup saling menolong.
- Tidak ada manusia yang sempurna, semua orang memiliki kelebihan dan kekurangan.''',
    "tkp-modul-s15": '''## Apa yang Diukur

Aspek kepedulian lingkungan yang diujikan dalam tes TKP bertujuan mengukur tingkat kematangan atau kedewasaan sikapmu dalam mengambil tindakan yang diperlukan ketika mendapati lingkungan memerlukan peran serta dirimu.

Seseorang yang memiliki kepedulian lingkungan terlihat dari sikapnya yang memperhatikan dan berkomitmen menjaga lingkungan dengan baik.

Kematangan sikap peduli lingkungan diyakini sangat membantu tugas seorang PNS, terutama bagi PNS yang menduduki posisi sebagai pengambil keputusan.

## Tips

- Tidak ada manusia yang dapat hidup sendiri di dunia ini. Pahamilah bahwa manusia adalah makhluk sosial, yaitu hidup saling tolong menolong.''',
    "tkp-modul-s17": '''## P. Efisiensi Kerja dan Skala Prioritas

Di era yang serba cepat seperti saat ini, efisiensi merupakan hal yang diperhatikan.

Contohnya, telah diciptakan transportasi yang mampu menempuh jarak jauh dengan waktu yang lebih cepat, sehingga efisiensi waktu yang dihasilkan dapat dialihkan ke hal-hal yang lebih produktif.

Telah ditemukan pula bahan bakar alternatif sehingga pembangunan lebih merata dan efisien.

Kini efisiensi juga sudah merambah di dunia kerja, baik untuk pegawai negeri maupun pegawai swasta. Tes TKP memuat aspek efisiensi kerja yang diujikan.

Hal ini bertujuan mengukur seberapa baik kamu dalam menuntaskan suatu pekerjaan secara benar, namun dengan waktu yang lebih cepat dan pemakaian sumber daya yang lebih hemat.

Efisiensi kerja termasuk karakter penting yang harus dimiliki setiap pegawai, karena tujuan organisasi dapat dicapai dengan lebih cepat dan lebih hemat.

### Tips

- Pahamilah bahwa sumber daya (SDM, SDA, waktu, dan lain-lain) di dunia ini terbatas, sehingga harus dimanfaatkan sebaik mungkin agar hasil yang didapat optimal.
- Hemat sumber daya jika tidak diperlukan.
- Cobalah melakukan pekerjaan dengan urutan prioritas agar efektif dan efisien.
- Buatlah daftar rencana kerja yang akan dilakukan dan diselesaikan hari ini.

## Q. Belajar Berkelanjutan

Saat ini zaman telah berubah dengan cepat. Banyak ditemukan teknologi baru yang membantu dalam pekerjaan.

Tidak lagi hanya mengandalkan alat bantu hitung seperti kalkulator, contohnya menghitung bisa dilakukan dengan memanfaatkan beberapa program yang bisa dijalankan di komputer.

Program-program ini menyertakan tidak hanya sekadar angka, tetapi juga hasil analisis data yang dibutuhkan.

Penggunaan program secara optimal tidak lepas dari orang selaku operatornya. Oleh karena itu, seseorang harus terus belajar agar tidak tertinggal.

Aspek kemauan dan kemampuan belajar berkelanjutan yang diujikan di tes TKP bertujuan mengukur keinginan dan tindakan yang kamu lakukan untuk terus maju dengan belajar terus-menerus. Indikasinya adalah:

- gemar membaca
- mengikuti pelatihan pengembangan diri
- tidak protes jika ditugaskan mengikuti seminar atau pelatihan
- berpikir maju
- tertantang untuk maju

### Tips

- Belajarlah menghargai orang lain, tanpa mencari kesalahan dan kelemahannya.
- Kita manusia pasti mempunyai kekurangan, namun dengan sabar belajar secara kontinu akan menghasilkan sesuatu yang lebih baik.''',
    "tkp-modul-s18": '''## Apa yang Diukur

Manusia sebagai makhluk sosial tidak dapat hidup sendiri dan selalu membutuhkan bantuan dari orang lain. Di sini diperlukan interaksi sosial yang baik.

Apabila seseorang dimasukkan ke dalam suatu kelompok, tentulah orang tersebut harus bisa bekerja sama dengan baik dalam kelompoknya agar tujuan kelompok dapat tercapai.

Bekerja sebagai PNS adalah bentuk pengabdian kepada negara. Pekerjaan tersebut banyak dilakukan secara bersama-sama, diambil keputusan bersama, dan dibuat kebijakan untuk semua.

Kemampuan seorang CPNS bekerja sama dalam kelompok diuji pada tahap awal tes TKP dalam aspek bekerja sama dalam kelompok.

## Tips

- Setiap tindakan pasti akan dimintai pertanggungjawabannya, begitu pula ketika bekerja dalam kelompok. Berusahalah menjadi bagian yang berguna di dalam kelompok itu.
- Apabila kamu ditugaskan sebagai pemimpin, bagilah tugas-tugas ke anak buah secara adil dan proporsional agar tim solid dan mampu bekerja sama dengan baik.''',
    "tkp-modul-s19": '''## S. Teknik Pemecahan Masalah (Problem Solving)

Masalah akan selalu ada di mana pun kita berada dan bisa terjadi kapan saja. Masalah bukan untuk dihindari, namun dihadapi dengan cara yang tepat. Oleh karena itu dibutuhkan teknik pemecahan masalah.

Aspek teknik pemecahan masalah diujikan untuk mengukur kemampuanmu dalam memecahkan suatu permasalahan yang dihadapi sehari-hari, serta menunjukkan respons terbaik yang kamu tampilkan saat menghadapi masalah tersebut.

Respons terburuk dari menghadapi masalah adalah menghindari atau emosi.

Kemampuan memecahkan masalah tidak didapat dengan cara instan, namun merupakan proses belajar yang panjang. Semakin banyak pengalaman hidup seseorang, semakin matang pula pemikirannya untuk memecahkan masalah.

### Tips

- Perbanyak berinteraksi dengan orang lain tanpa membedakan golongan.
- Perbanyak membaca dari berbagai sumber referensi.
- Kenali beberapa teknik memecahkan masalah dari beberapa rekan kerja yang ahli di bidangnya.

## T. Kepemimpinan: Menggerakkan dan Mengoordinir Orang Lain

Jika menjadi pemimpin yang tegas, jujur, dan disiplin, bawahanmu akan segan, patuh, dan hormat kepadamu.

Ketertiban bisa ditegakkan dengan kedisiplinan dan ketegasan.

### Tips

- Belajarlah memahami orang lain.
- Belajarlah tugas-tugas dan sifat-sifat pemimpin yang baik.
- Belajarlah memanajemen konflik.''',
    "tkp-rangkuman-temenasn-s01": '''## Radikalisme

Radikalisme adalah paham atau aliran yang menginginkan perubahan atau pembaharuan di bidang sosial dan politik, tetapi dengan cara kekerasan. Paham ini juga mengacu pada sikap ekstrem dalam aliran politik.

## Anti Radikalisme

Anti radikalisme adalah sikap anti kekerasan yang sejalan dengan sila-sila Pancasila. Seorang ASN harus memiliki sikap anti radikalisme: menentang radikalisme dan gerakan perpecahan, serta menjaga persatuan bangsa.

Dalam TKP, aspek ini menjaring informasi tentang pengetahuanmu terhadap anti radikalisme, kecenderungan bersikap, dan tindakanmu saat menanggapi berbagai situasi. Jawaban terbaik selalu menunjukkan penolakan tegas terhadap kekerasan, sikap toleran terhadap perbedaan, dan keberanian melaporkan potensi radikalisme kepada pihak yang berwenang.''',
    "tkp-rangkuman-temenasn-s02": '''Penganut radikalisme bisa dikenali dari cara berpikir dan cara bertindaknya. Kenali ciri-cirinya agar kamu bisa melakukan deteksi dini.

## Ciri-ciri Radikalisme

- Memberikan tanggapan terhadap kondisi yang terjadi dalam bentuk evaluasi, penolakan, perlawanan, bahkan kekerasan.
- Menuntut penolakan dan menuntut perubahan drastis.
- Memiliki keyakinan yang kuat terhadap program yang dijalani.
- Tidak segan-segan menggunakan kekerasan.
- Menganggap orang yang berbeda pandangan dengannya adalah salah.

## Ciri-ciri Penganut Radikalisme

- **Intoleran**: tidak mau menghargai pendapat atau keyakinan orang lain.
- **Fanatik**: selalu merasa benar sendiri dan menganggap yang lainnya salah.
- **Eksklusif**: membedakan diri dari golongan atau kaum lainnya.
- **Revolusioner**: cenderung menggunakan kekerasan untuk mencapai tujuan.

## Cara Mencegah Radikalisme

- Meningkatkan pemahaman agama.
- Membentuk komunitas damai di lingkungan.
- Menyebar berita yang benar dan akurat (bukan hoaks).
- Menjaga persatuan dan kesatuan NKRI.
- Meminimalkan kesenjangan sosial.''',
    "tkp-rangkuman-temenasn-s03": '''## Pengertian Jejaring Kerja

Jejaring kerja adalah kemampuan membangun dan membina hubungan, bekerja sama, berbagi informasi, dan berkolaborasi dengan orang lain secara efektif.

Jejaring kerja adalah kegiatan penting dalam berorganisasi agar tujuan organisasi tercapai dengan efektif dan efisien. Dengan koordinasi dan kolaborasi antar bagian dalam satu organisasi atau dengan organisasi lain, setiap individu lebih mudah mengatasi masalah demi tujuan bersama.

Di era globalisasi, tidak ada satu entitas pun yang mampu berdiri sendiri terpisah dari entitas lain. Meski segala sesuatu bisa dikendalikan dengan teknologi mutakhir, kesuksesan lembaga atau organisasi masih sangat bergantung pada keberhasilan menciptakan jejaring kerja.

## Membangun Kemitraan

Membangun jejaring kerja (kemitraan) pada hakikatnya adalah proses membangun komunikasi atau hubungan, berbagi ide, informasi, dan sumber daya atas dasar saling percaya dan saling menguntungkan antar pihak yang bermitra, yang dituangkan dalam bentuk nota kesepahaman atau kesepakatan guna mencapai kesuksesan bersama yang lebih besar.

Kemitraan dapat dibangun jika pihak-pihak yang bermitra memenuhi syarat berikut:

1. Ada dua pihak atau lebih organisasi atau lembaga.
2. Memiliki kesamaan visi dalam mencapai tujuan organisasi atau lembaga.
3. Ada kesepakatan atau kesepahaman.
4. Saling percaya dan membutuhkan.
5. Komitmen bersama untuk mencapai tujuan yang lebih besar.''',
    "tkp-rangkuman-temenasn-s04": '''Kemitraan yang kuat dibangun di atas enam prinsip berikut.

## Kesamaan Visi dan Misi

Kemitraan hendaknya dibangun atas dasar kesamaan visi, misi, dan tujuan organisasi. Kesamaan visi dan misi menjadi motivasi dan perekat pola kemitraan. Dua lembaga atau lebih dapat bersinergi untuk mencapai tujuan yang sama.

## Kepercayaan

Kepercayaan adalah modal dasar membangun jejaring dan kemitraan. Untuk dapat dipercaya, komunikasi yang dibangun harus dilandasi itikad (niat) yang baik dan menjunjung tinggi kejujuran.

## Saling Menguntungkan

Asas saling menguntungkan merupakan fondasi yang kuat dalam membangun kemitraan. Jika dalam bermitra ada salah satu pihak yang merasa dirugikan atau merasa tidak mendapat manfaat, keharmonisan dalam bekerja sama akan terganggu. Antar pihak yang bermitra harus saling memberi kontribusi sesuai peran masing-masing dan merasa diuntungkan.

## Efisiensi dan Efektivitas

Dengan mensinergikan beberapa sumber untuk mencapai tujuan yang sama, diharapkan mampu meningkatkan efisiensi waktu, biaya, dan tenaga, tanpa mengurangi kualitas proses dan hasil. Justru kualitas proses dan produk yang dicapai dapat meningkat. Tingkat efektivitas pencapaian tujuan menjadi lebih tinggi jika proses kerja melibatkan mitra kerja.

Dengan kemitraan dapat dicapai kesepakatan-kesepakatan tentang siapa melakukan apa, sehingga pencapaian tujuan menjadi lebih efektif.

## Komunikasi Timbal Balik

Komunikasi timbal balik atas dasar saling menghargai satu sama lain merupakan fondasi dalam membangun kerja sama. Tanpa komunikasi timbal balik, akan terjadi dominasi satu pihak terhadap pihak lain yang dapat merusak hubungan yang sudah dibangun.

## Komitmen yang Kuat

Jejaring kerja sama akan terbangun dengan kuat dan permanen jika ada komitmen satu sama lain terhadap kesepakatan-kesepakatan yang dibuat bersama.''',
    "tkp-rangkuman-temenasn-s05": '''## Pengertian Pelayanan Publik

Pelayanan publik bertujuan menampilkan perilaku keramahtamahan dalam bekerja secara efektif, agar bisa memenuhi kebutuhan dan kepuasan orang lain sesuai tugas dan wewenang yang dimiliki.

Undang-Undang Nomor 25 Tahun 2009 tentang Pelayanan Publik menjelaskan bahwa pelayanan publik adalah kegiatan atau rangkaian kegiatan dalam rangka pemenuhan kebutuhan pelayanan sesuai dengan peraturan perundang-undangan bagi setiap warga negara dan penduduk atas barang, jasa, dan/atau pelayanan administratif yang disediakan oleh penyelenggara pelayanan publik.

## Tiga Unsur Penting

1. Organisasi penyelenggara pelayanan publik.
2. Penerima layanan (pelanggan), yaitu orang, masyarakat, atau organisasi yang berkepentingan.
3. Kepuasan yang diberikan dan/atau diterima oleh penerima layanan (pelanggan).

## Budaya Pelayanan

Budaya pelayanan merupakan cerminan dari praktik komunikasi yang dibangun antara pemberi layanan dan penerima layanan. Komunikasi yang terjadi mempunyai andil dalam membangun iklim organisasi, juga berdampak pada membangun budaya organisasi dalam memberikan pelayanan, yaitu nilai dan kepercayaan yang menjadi titik pusat organisasi.

Karena itu sangat penting untuk terus memelihara dan mengembangkan budaya pelayanan. Budaya yang kuat akan mewarnai sifat hubungan antar instansi atau organisasi pemberi pelayanan dengan pelanggannya. Budaya pelayanan dibentuk oleh sikap karyawannya serta manajemen organisasi pemberi pelayanan.

## Sikap Pelayanan: 7P

- **Passionate**: sangat bergairah, bersemangat, dan antusias.
- **Progressive**: memakai cara yang terbaik dan terus maju.
- **Proactive**: antisipatif, proaktif, dan tidak menunggu.
- **Prompt**: cepat tanggap dalam merespons kebutuhan.
- **Patience**: penuh rasa kesabaran.
- **Proporsional**: sesuai porsi, tidak mengada-ada.
- **Punctual**: tepat waktu.

Sikap pelayanan bagi pegawai ASN berarti pengabdian yang tulus terhadap bidang kerja, dan yang paling utama adalah kebanggaan atas pekerjaan. Sikapmu dapat menggambarkan instansimu: kamu adalah perwakilan organisasi, secara langsung maupun tidak langsung. Karena itu budaya pelayanan dalam birokrasi pemerintahan sangat ditentukan oleh sikap pelayanan yang ditunjukkan oleh pegawai ASN.''',
    "tkp-rangkuman-temenasn-s07": '''## Pengertian Etiket

Etiket mengajarkan kita untuk memelihara hubungan baik, bahkan memikirkan kepentingan dan keinginan orang lain. Pemahaman tentang etiket dapat dijadikan alat pengendali. Hal ini juga membuat diri kita disegani, dihormati, disenangi, percaya diri, dan mampu memelihara suasana yang baik di lingkungan.

## Etiket Pelayanan yang Perlu Diperhatikan ASN

Etiket pelayanan yang perlu diperhatikan oleh ASN terhadap pengguna jasa pada umumnya adalah sebagai berikut:

- Sikap atau perilaku
- Ekspresi wajah
- Penampilan
- Cara berpakaian
- Cara berbicara
- Cara mendengarkan
- Cara bertanya

## Kata Kunci dalam Pelayanan

Beberapa kata kunci yang perlu diketahui dan dilaksanakan dalam praktik pelayanan kepada pengguna jasa antara lain:

- Atensi
- Senyum
- Salam
- Tolong
- Maaf
- Terima kasih''',
    "tkp-rangkuman-temenasn-s08": '''## Pengertian Profesionalisme

Profesionalisme bertujuan melaksanakan tugas dan fungsi sesuai dengan tuntutan jabatan. Profesionalisme adalah bekerja tuntas dan akurat atas dasar kompetensi terbaik, dengan penuh tanggung jawab dan komitmen yang tinggi.

## Dua Perilaku Utama

Perilaku utama sebagai cerminan dari penerapan nilai profesionalisme terdiri dari dua butir.

### Mempunyai Pengetahuan dan Keahlian yang Luas

- Senantiasa meningkatkan kompetensi diri.
- Bekerja sesuai dengan tugas atau fungsi dan profesi atau jabatannya.
- Menyelesaikan pekerjaan dengan efektif dan efisien.
- Bekerja berorientasi pada outcome (dampak), bukan hanya output (keluaran).

### Bekerja dengan Hati

- Terbuka atas pendapat atau masukan dari pihak lain.
- Senantiasa menunjukkan antusiasme dan semangat bekerja yang tinggi.
- Berpikir dan bertindak positif serta tulus ikhlas dalam menyelesaikan pekerjaan.

## Prinsip Profesionalisme

- Jujur dan bisa dipercaya.
- Tunduk pada nilai-nilai etis.
- Adanya kesetiaan atau loyalitas.
- Mau belajar dari kesalahan.
- Adanya rasa cinta pada pekerjaan.
- Bersikap proaktif.
- Bertanggung jawab.''',
    "tkp-rangkuman-temenasn-s09": '''## Pengertian TIK

Teknologi Informasi dan Komunikasi (TIK) bertujuan memanfaatkan teknologi informasi secara efektif untuk meningkatkan kinerja.

Perkembangan teknologi komunikasi dan informasi yang sangat cepat memberikan manfaat yang besar bagi kehidupan manusia. Berbagai bidang kehidupan kini mulai menerapkan berbagai perangkat berteknologi baru guna memudahkan komunikasi dan pekerjaan.

## Manfaat TIK

- Berkomunikasi menjadi lebih mudah dan cepat.
- Memudahkan akses informasi terkait pekerjaan maupun pengembangan diri.
- Berbagi informasi secara efektif.
- Mempersingkat waktu dan memangkas biaya.''',
    "tkp-rangkuman-temenasn-s10": '''## Pengertian Sosial Budaya

Sosial budaya bertujuan agar kamu mampu beradaptasi dan bekerja secara efektif dalam masyarakat majemuk, yaitu masyarakat yang terdiri atas beragam agama, suku, budaya, dan sebagainya.

## Masyarakat Majemuk

Masyarakat Indonesia adalah masyarakat majemuk yang hidup tersebar di seluruh tanah air dan memiliki berbagai macam ragam budaya, sehingga menimbulkan keanekaragaman institusi dalam masyarakat.

## Bhinneka Tunggal Ika

Bhinneka Tunggal Ika diterjemahkan sebagai "berbeda-beda tetapi tetap satu jua". Artinya, dalam realitas kehidupan yang amat beragam dan ditandai oleh perbedaan-perbedaan, bangsa Indonesia tetap mampu membangun suasana rukun untuk mewujudkan satu tujuan hidup bersama dalam satu kesatuan bangsa dan satu kesatuan wilayah negara, yaitu Negara Kesatuan Republik Indonesia.

Kesatuan di sini merupakan hasil konsensus atau kesepakatan bersama dari segenap komponen bangsa Indonesia untuk mengatasi kerawanan-kerawanan sebagai akibat sifat-sifat yang melekat pada keberagaman itu.''',
    "tkp-rangkuman-temenasn-s11": '''Pola tindak sistem sosial budaya Indonesia adalah nilai-nilai yang menjadi pedoman perilaku dalam kehidupan bermasyarakat, berbangsa, dan bernegara.

## Gotong Royong

Persatuan dan kesatuan hanya terwujud melalui gotong royong, suatu sikap kebersamaan dan tenggang rasa, baik dalam duka maupun suka, dalam kehidupan keluarga, bermasyarakat, berbangsa, dan bernegara.

## Prasaja

Keadilan sosial bagi seluruh masyarakat tidak akan terwujud apabila kehidupan yang sederhana, hemat, cermat, disiplin, profesional, dan tertib tidak dilaksanakan.

## Musyawarah untuk Mufakat

Mengutamakan kepentingan umum di atas kepentingan golongan atau perorangan, sehingga perbedaan pendapat tidak berakhir dengan perpecahan atau perpisahan, maupun pertentangan.

## Kesatria

Persatuan dan kesatuan, maupun keadilan sosial, tidak dapat terwujud tanpa keberanian, kejujuran, kesetiaan, pengabdian, dan perjuangan yang tidak mengenal menyerah demi kehidupan bersama.

## Toleransi

Penerapan Bhinneka Tunggal Ika selanjutnya adalah menegakkan sikap toleransi, misalnya toleransi beragama. Di Indonesia terdapat banyak agama yang diakui, dan setiap warga bisa bertoleransi terhadap kepercayaan masyarakat lainnya.

## Menegakkan Sikap Pluralisme

Pluralisme adalah sikap tahu, percaya, paham, dan mengerti bahwa perbedaan dan keragaman adalah hal yang wajar. Di Indonesia sikap ini sangat diperlukan untuk keberlangsungan keutuhan wilayah negara.

## Perilaku Inklusif

Seseorang harus menganggap dirinya berada di dalam suatu populasi yang luas, sehingga dia tidak melihat dirinya melebihi yang lain. Begitu juga dengan kelompok: kepentingan bersama lebih diutamakan daripada keuntungan pribadi atau kelompoknya.''',
    "twk-cheat-sheet-s01": '''## Poin-poin penting

**Definisi:** rasa cinta dan kebanggaan terhadap tanah air serta kesadaran akan kesatuan dan identitas nasional.

**Tujuan nasionalisme:** menjaga persatuan dan kesatuan bangsa, membangun negara yang kuat, dan melindungi kedaulatan bangsa.

**Peran penting:** menumbuhkan semangat persatuan, mempertahankan kedaulatan, memelihara keutuhan wilayah NKRI, dan meningkatkan kesejahteraan rakyat.

## Bentuk implementasi

- **Partisipasi aktif:** mengikuti upacara, menggunakan produk dalam negeri, mengikuti kegiatan sosial.
- **Mempertahankan budaya:** melestarikan budaya lokal dan menghormati adat istiadat.
- **Menjaga keutuhan bangsa:** melawan provokasi yang memecah belah serta menjaga toleransi dan kerukunan.

## Kata kunci

Persatuan, kesatuan, kedaulatan, identitas nasional, rasa bangga, toleransi, cinta tanah air.

## Tips menjawab soal

1. **Pahami konteks.** Fokus pada kalimat yang menunjukkan semangat persatuan, kedaulatan, atau kebanggaan terhadap tanah air.
2. **Cari kata kunci nasionalisme.** Perhatikan kata seperti "persatuan", "kesatuan", "melestarikan budaya", dan "kebanggaan terhadap bangsa".
3. **Eliminasi jawaban.** Hilangkan pilihan yang tidak sesuai dengan definisi atau implementasi nasionalisme.''',
    "twk-cheat-sheet-s02": '''## Poin-poin penting

**Pilar negara** terdiri dari empat hal:

- **Pancasila:** dasar negara dan panduan dalam kehidupan berbangsa dan bernegara.
- **UUD 1945:** konstitusi yang mengatur dasar hukum dan tatanan kehidupan bernegara.
- **NKRI:** bentuk negara kesatuan yang menjamin keutuhan wilayah dan persatuan bangsa.
- **Bhinneka Tunggal Ika:** semboyan yang mencerminkan persatuan dalam keragaman suku, agama, ras, dan budaya.

## Pengamalan Pancasila

Setiap sila punya nilai yang harus diterapkan dalam kehidupan sehari-hari:

1. **Sila ke-1, Ketuhanan Yang Maha Esa:** menghargai agama dan kepercayaan orang lain.
2. **Sila ke-2, Kemanusiaan yang Adil dan Beradab:** menghormati hak asasi manusia.
3. **Sila ke-3, Persatuan Indonesia:** menjaga persatuan dan keutuhan bangsa.
4. **Sila ke-4, Kerakyatan yang Dipimpin oleh Hikmat Kebijaksanaan dalam Permusyawaratan/Perwakilan:** musyawarah dan mufakat.
5. **Sila ke-5, Keadilan Sosial bagi Seluruh Rakyat Indonesia:** keadilan dan kesejahteraan sosial.

## Kata kunci

Pancasila, UUD 1945, NKRI, Bhinneka Tunggal Ika, sila, musyawarah, keadilan sosial.

## Tips menjawab soal

1. **Identifikasi pilar yang dimaksud.** Tentukan apakah soal berkaitan dengan Pancasila, UUD 1945, NKRI, atau Bhinneka Tunggal Ika.
2. **Fokus pada nilai sila.** Jika soal terkait Pancasila, pahami nilai-nilai dari setiap sila yang disebutkan dalam soal.
3. **Pilih jawaban yang konsisten.** Pastikan jawaban mencerminkan konsistensi dan pemahaman terhadap pilar yang dimaksud.''',
    "twk-cheat-sheet-s03": '''## Poin-poin penting

**Definisi:** sikap dan perilaku warga negara yang dijiwai oleh kecintaan pada NKRI berdasarkan Pancasila dan UUD 1945.

## Patriotisme, cinta tanah air, dan rela berkorban

Tiga konsep ini sering tertukar. Bedanya:

- **Patriotisme:** sikap cinta pada negara yang diwujudkan dengan aktif membela negara, bangga terhadap identitas nasional, dan siap mempertahankan kedaulatan negara.
- **Cinta tanah air:** rasa bangga dan kasih terhadap tanah air, meliputi budaya, adat, dan keberagaman, serta partisipasi dalam kegiatan yang menjaga dan melestarikan identitas nasional.
- **Rela berkorban:** kesediaan memberikan waktu, tenaga, bahkan nyawa demi kepentingan bangsa dan negara, termasuk dalam kondisi darurat atau ancaman bagi negara.

## Lima unsur bela negara

1. **Cinta tanah air:** menghargai tanah air dan budayanya.
2. **Sadar berbangsa dan bernegara:** sadar akan pentingnya menjaga keutuhan NKRI.
3. **Setia pada Pancasila sebagai ideologi negara:** Pancasila sebagai dasar dan panduan hidup bernegara.
4. **Rela berkorban:** siap berkorban demi bangsa dan negara.
5. **Kemampuan awal bela negara:** kesiapan fisik dan mental untuk mempertahankan NKRI.

## Kata kunci

Patriotisme, cinta tanah air, rela berkorban, Pancasila, kesadaran berbangsa, keutuhan NKRI.

## Tips menjawab soal

1. **Identifikasi konsepnya.** Semangat mempertahankan negara berkaitan dengan patriotisme. Bangga terhadap budaya adalah cinta tanah air. Pengorbanan besar adalah rela berkorban.
2. **Cari kata kunci.** Fokus pada kata seperti "membela", "bangga terhadap", atau "siap berkorban".
3. **Pilih jawaban yang paling relevan.** Pilih jawaban yang sesuai dengan konsep yang dibahas dalam soal.''',
    "twk-cheat-sheet-s04": '''## Poin-poin penting

**Definisi:** konsistensi antara ucapan dan tindakan berdasarkan nilai-nilai moral dan etika.

## Core value BERAKHLAK

- **B (Berorientasi Pelayanan):** memberikan pelayanan terbaik dengan tulus dan profesional.
- **E (Akuntabel):** bertanggung jawab atas tindakan dan keputusan serta menjaga kepercayaan publik.
- **R (Kompeten):** mengembangkan kompetensi dan keterampilan untuk hasil kerja yang optimal.
- **A (Harmonis):** membangun hubungan kerja yang harmonis dan saling menghargai.
- **K (Loyal):** setia kepada bangsa, negara, dan organisasi.
- **H (Adaptif):** fleksibel terhadap perubahan dan inovatif dalam menyelesaikan masalah.
- **K (Kolaboratif):** bekerja sama dan mendukung kerja tim untuk mencapai tujuan bersama.

## Pencegahan KKN (korupsi, kolusi, nepotisme)

- **Transparansi dan akuntabilitas:** menyediakan informasi yang terbuka tentang penggunaan anggaran dan keputusan.
- **Pelaporan dan pengawasan:** mendorong pelaporan dugaan KKN dan melakukan audit secara rutin.
- **Sanksi tegas:** penerapan sanksi yang jelas dan tegas terhadap pelanggaran integritas.

## Kata kunci

Kejujuran, akuntabilitas, transparansi, KKN, BERAKHLAK, etika, moral, ASN, profesionalisme.

## Tips menjawab soal

1. **Fokus pada nilai utama.** Pilih jawaban yang mencerminkan tindakan jujur, bertanggung jawab, dan transparan.
2. **Pahami core value BERAKHLAK.** Identifikasi nilai yang relevan dengan situasi dalam soal, misalnya apakah situasinya membutuhkan loyalitas, kompetensi, atau kerja sama.
3. **Eliminasi jawaban yang tidak sesuai.** Hindari jawaban yang menyiratkan tindakan tidak etis atau tidak profesional.''',
    "twk-cheat-sheet-s05": '''## Kalimat efektif

Kalimat efektif adalah kalimat yang strukturnya jelas, logis, padat, dan mudah dipahami. Ciri-cirinya:

- **Kesatuan:** setiap kalimat mengandung satu gagasan utama.
- **Kepaduan:** hubungan antarkalimat dalam satu paragraf harus saling mendukung.
- **Keparalelan:** menggunakan struktur gramatikal yang sama untuk kata atau frasa yang setara.
- **Kelogisan:** kalimat harus logis dan sesuai dengan kaidah bahasa.
- **Kehematan:** tidak menggunakan kata-kata yang berlebihan.
- **Ketepatan diksi:** pemilihan kata yang tepat dan sesuai konteks.

## Ejaan yang Disempurnakan (EYD)

Aturan baku dalam penulisan bahasa Indonesia meliputi:

- **Penggunaan huruf:** huruf kapital untuk awal kalimat, nama diri, dan istilah tertentu.
- **Tanda baca:** penggunaan koma, titik, titik dua, tanda hubung, tanda seru, dan tanda tanya yang sesuai.
- **Penulisan kata:** pemenggalan kata yang benar, penulisan serapan, dan kata berimbuhan.

## Pemahaman bacaan

Kemampuan memahami dan menganalisis isi bacaan meliputi:

- **Gagasan utama:** menentukan ide pokok dari paragraf atau teks.
- **Simpulan:** menyimpulkan isi bacaan secara keseluruhan.
- **Informasi tersurat:** menemukan informasi yang disebutkan langsung dalam teks.
- **Informasi tersirat:** menemukan makna yang tidak disebutkan langsung namun dapat ditarik dari konteks bacaan.

## Pemahaman gambar, tabel, dan grafik

- **Gambar:** peta, diagram alir, atau gambar ilustrasi. Fokus pada elemen gambar yang memberikan informasi penting, seperti judul, label, dan keterangan.
- **Tabel data:** menampilkan informasi dalam bentuk kolom dan baris untuk menunjukkan perbandingan atau perubahan. Perhatikan judul tabel, label baris dan kolom, serta catatan kaki jika ada.
- **Grafik batang, garis, dan lingkaran:** menunjukkan tren, perbandingan, atau distribusi data. Pahami sumbu X (horizontal) dan Y (vertikal), identifikasi tren atau pola, dan perhatikan legenda serta keterangan tambahan.

## Kata kunci

Kalimat efektif, EYD, struktur kalimat, logis, efisien, diksi, bacaan, gagasan utama, simpulan, gambar, tabel, grafik.

## Tips menjawab soal

- **Kalimat efektif:** pilih kalimat yang paling jelas, ringkas, dan mudah dipahami.
- **EYD:** perhatikan penulisan huruf kapital, tanda baca, dan ejaan kata. Hindari jawaban yang salah penulisan kata.
- **Pemahaman bacaan:** fokus pada gagasan utama dan tujuan penulis dalam teks. Baca keseluruhan teks untuk memahami konteks sebelum memilih jawaban.
- **Pemahaman gambar:** baca keterangan gambar dengan teliti. Perhatikan detail penting seperti simbol, warna, atau teks tambahan. Jangan terlalu fokus pada estetika gambar, tetapi pada informasi yang disampaikan.
- **Pemahaman tabel:** baca judul dan label tabel untuk memahami konteks data. Amati perbedaan data antar kolom dan baris. Pastikan memahami keseluruhan isi tabel sebelum menarik kesimpulan.
- **Pemahaman grafik:** amati sumbu X dan Y serta identifikasi tren atau pola dalam data. Gunakan data pada grafik untuk mendukung pilihan jawaban yang tepat. Baca legenda dan catatan grafik untuk mendapatkan informasi tambahan yang berguna.''',
    "twk-cheat-sheet-s06": '''## Checklist persiapan tes SKD

### Buat jadwal belajar harian

Bagi hari belajar per subtes: TWK, TIU, dan TKP. Sisihkan satu hari khusus untuk full tryout supaya terbiasa dengan suasana ujian yang sesungguhnya.

### Drilling soal HOTS

Asah kemampuan dengan soal-soal HOTS (soal penalaran tingkat tinggi). Kerjakan tryout minimal 2-3 kali dalam seminggu dan evaluasi hasilnya setiap kali selesai.

### Strategi pengelolaan waktu

Buat strategi pengelolaan waktu agar terbiasa dengan batas waktu ujian SKD. Latih kecepatan menjawab tanpa mengorbankan ketepatan.

### Pasang target skor

Bikin target skor di atas 400. Target yang jelas membuat belajar lebih terarah dan progresnya mudah diukur.

### Gunakan cheat sheet

Gunakan cheat sheet ini untuk mempelajari cara menjawab soal dengan lebih cepat dan akurat. Ulangi bagian yang masih lemah sampai benar-benar paham.''',
    "twk-keyword-bela-negara-s01": '''Bela negara, nasionalisme, patriotisme, dan cinta tanah air sering terasa mirip, tetapi masing-masing punya makna dan arah aksi yang berbeda. Ini kata kunci pembedanya.

## Bela Negara (Kesadaran)

Sikap serta tingkah laku individu dan masyarakat yang dijiwai oleh kecintaan kepada NKRI, kesadaran berbangsa dan bernegara.

Aksinya lebih ke arah melindungi dan menjaga dari perpecahan atau ancaman musuh.

- Sekolah: belajar giat, menaati tata tertib.
- Rumah: menjaga kebersihan dan kesehatan.
- Masyarakat: gotong royong, pos kamling, kerja bakti.
- Negara: mematuhi peraturan hukum, membayar pajak.

## Nasionalisme (Kesetiaan)

Sikap sosial dan politik dari sekelompok bangsa yang memiliki kesamaan bahasa, wilayah, kebudayaan, serta kesamaan tujuan dan cita-cita, dengan meletakkan kesetiaan yang tinggi terhadap kelompok negaranya.

Aksinya lebih ke arah memelihara, mengembangkan, meningkatkan, dan menghormati.

- Sekolah: menghormati guru.
- Rumah: menghormati orang tua.
- Masyarakat: melestarikan budaya Indonesia.
- Negara: menggunakan produk dalam negeri.

## Patriotisme (Rela Berkorban)

Sikap rela berkorban demi bangsa dan negara, dengan sikap pantang menyerah dan ada sesuatu yang dikorbankan: nyawa, waktu, atau materi. Patriotisme sering disebut bentuk bela negara yang paling tinggi.

- Sekolah: mengikuti upacara bendera (rela mengorbankan waktu).
- Rumah: membantu pekerjaan orang tua.
- Masyarakat: menolong tetangga yang kesusahan.
- Negara: membantu aparat menjaga keamanan negara.

## Cinta Tanah Air (Kecintaan)

Mencintai bangsa sendiri, yakni munculnya kecintaan warga negara untuk negaranya dengan sedia mengabdi, berkorban, memelihara persatuan dan kesatuan, serta melindungi tanah air dari segala ancaman, gangguan, dan tantangan yang dihadapi negaranya.

Semua contoh dari ketiga sikap di atas termasuk dalam cinta tanah air.''',
    "twk-modul-ringkasan-s01": '''## Apa Itu TWK

Tes Wawasan Kebangsaan (TWK) adalah bagian dari seleksi CPNS yang mengukur seberapa jauh peserta memahami wawasan tentang Negara Kesatuan Republik Indonesia. Pemahaman ini penting karena akan dipakai dalam pelayanan publik di kementerian,
  lembaga nasional, dan pemerintah daerah.

## Arti dan Pengertian Ideologi

Ideologi adalah seperangkat prinsip yang dijadikan dasar untuk memberi arah dan tujuan dalam menjalani kehidupan berbangsa dan bernegara.

Kata ideologi berasal dari bahasa Yunani:

- **Idea** artinya pemikiran, konsep, atau gagasan.
- **Logos** artinya pengetahuan atau ilmu.

Secara sederhana, ideologi berarti pengetahuan tentang ide, keyakinan, atau gagasan. Dalam arti luas, ideologi adalah sistem nilai yang menjadi pedoman hidup ideal yang dicita-citakan dan ingin diwujudkan bersama dalam kehidupan masyarakat dan
  negara.''',
    "twk-modul-ringkasan-s02": '''## Pancasila sebagai Dasar Negara

Pancasila sebagai dasar negara tercantum dalam Pembukaan UUD 1945 alinea ke-4. Artinya, seluruh peraturan dan penyelenggaraan negara harus berlandaskan nilai-nilai Pancasila.

## Pancasila sebagai Ideologi Negara

Pancasila sebagai ideologi negara adalah sistem nilai yang dipandang sebagai prinsip hidup ideal, baik oleh individu maupun bersama-sama, yang dicita-citakan dan ingin diwujudkan dalam kehidupan bermasyarakat dan bernegara.

## Pancasila sebagai Pandangan Hidup Bangsa

Pancasila sebagai pandangan hidup bangsa dipakai sebagai petunjuk dan pedoman dalam kehidupan berbangsa dan bernegara di berbagai bidang. Nilai-nilai Pancasila memberi arah dan tujuan menuju masyarakat yang adil dan makmur.''',
    "twk-modul-ringkasan-s03": '''## Tokoh Pengusul Dasar Negara

Dalam sidang pertama BPUPKI, tiga tokoh mengusulkan konsep dasar negara.

### 1. Muh. Yamin, 29 Mei 1945

- Peri kebangsaan.
- Peri kemanusiaan.
- Peri ketuhanan.
- Peri kerakyatan.
- Kesejahteraan rakyat.

### 2. Soepomo, 31 Mei 1945

- Persatuan.
- Kekeluargaan.
- Keseimbangan lahir batin.
- Musyawarah.
- Keadilan rakyat.

### 3. Ir. Soekarno, 1 Juni 1945

- Kebangsaan Indonesia.
- Internasionalisme atau perikemanusiaan.
- Mufakat atau demokrasi.
- Kesejahteraan sosial.
- Ketuhanan Yang Maha Esa.

## Panitia Sembilan dan Piagam Jakarta

Usulan ketiga tokoh itu dibahas lebih lanjut oleh Panitia Sembilan, panitia kecil BPUPKI. Panitia Sembilan menyusun Piagam Jakarta (Jakarta Charter) yang memuat rumusan Pancasila sebagai berikut:

1. Ketuhanan, dengan kewajiban menjalankan syariat Islam bagi pemeluk-pemeluknya.
2. Kemanusiaan yang adil dan beradab.
3. Persatuan Indonesia.
4. Kerakyatan yang dipimpin oleh hikmah kebijaksanaan dalam permusyawaratan perwakilan.
5. Keadilan sosial bagi seluruh rakyat Indonesia.

Sebelum UUD 1945 disahkan, kalimat sila pertama diubah menjadi "Ketuhanan Yang Maha Esa".''',
    "twk-modul-ringkasan-s04": '''Pancasila sebagai dasar dan ideologi negara memiliki nilai-nilai sebagai berikut.

## 1. Nilai Ketuhanan Yang Maha Esa

- Indonesia mengakui adanya Tuhan Yang Maha Esa.
- Negara melindungi warga negaranya untuk beribadah sesuai agama dan kepercayaannya.

## 2. Nilai Kemanusiaan yang Adil dan Beradab

- Setiap warga negara mengakui persamaan derajat, hak, dan kewajiban antar sesama manusia sebagai asas kebersamaan bangsa Indonesia.
- Mengembangkan sikap saling mencintai sesama manusia.

## 3. Nilai Persatuan Indonesia

- Setiap warga negara mengutamakan persatuan, kesatuan, kepentingan, dan keselamatan bangsa dan negara di atas kepentingan pribadi dan golongan.
- Sanggup dan rela berkorban untuk kepentingan bangsa dan negara.

## 4. Nilai Kerakyatan yang Dipimpin oleh Hikmah Kebijaksanaan dalam Permusyawaratan/Perwakilan

- Selalu mengutamakan musyawarah mufakat dalam menyelesaikan suatu persoalan.
- Menghormati dan menjunjung tinggi setiap keputusan yang dicapai sebagai hasil musyawarah.

## 5. Nilai Keadilan Sosial bagi Seluruh Rakyat Indonesia

- Seluruh warga negara bersama-sama menciptakan keadilan sosial dalam kehidupan bermasyarakat.
- Memupuk sikap saling menghormati dan bersikap adil antar sesama manusia.''',
    "twk-modul-ringkasan-s05": '''Berikut perbandingan tiga ideologi: komunisme, liberalisme, dan Pancasila.

## 1. Hak Asasi Manusia

- Komunisme: HAM diabaikan.
- Liberalisme: HAM dijunjung secara mutlak.
- Pancasila: HAM dilindungi tanpa melupakan kewajiban asasi.

## 2. Nasionalisme

- Komunisme: nasionalisme ditolak.
- Liberalisme: nasionalisme diabaikan.
- Pancasila: nasionalisme dijunjung tinggi.

## 3. Pengambilan Keputusan

- Komunisme: keputusan di tangan pimpinan partai.
- Liberalisme: keputusan melalui suara terbanyak (voting).
- Pancasila: keputusan melalui musyawarah mufakat. Apabila tidak tercapai mufakat, barulah diadakan pemungutan suara.

## 4. Dominasi Kekuasaan

- Komunisme: dominasi partai.
- Liberalisme: dominasi mayoritas.
- Pancasila: tidak ada dominasi.

## 5. Oposisi

- Komunisme: tidak ada oposisi.
- Liberalisme: ada oposisi.
- Pancasila: ada oposisi dengan alasan, sebagai penyeimbang.

## 6. Perbedaan Pendapat

- Komunisme: tidak ada perbedaan pendapat.
- Liberalisme: ada perbedaan pendapat.
- Pancasila: ada perbedaan pendapat, dan perbedaan pendapat dihargai.

## 7. Kepentingan yang Diutamakan

- Komunisme: kepentingan negara.
- Liberalisme: kepentingan mayoritas.
- Pancasila: kepentingan seluruh rakyat.''',
    "twk-modul-ringkasan-s06": '''Berikut sikap positif terhadap Pancasila dalam berbagai aspek kehidupan.

## 1. Kehidupan Politik

- Mengemukakan pendapat secara bebas dan bertanggung jawab.
- Menjalankan pemerintahan secara jujur dan konsekuen.

## 2. Kehidupan Ekonomi

- Memanfaatkan sumber daya alam secara baik.
- Menjalankan kegiatan perekonomian secara jujur.

## 3. Kehidupan Sosial

- Menghormati dan menghargai sesama manusia tanpa melihat asal usul, agama, ras, dan latar belakang kehidupannya.
- Bersikap adil dan tidak mengambil hak orang lain.''',
    "twk-modul-ringkasan-s07": '''## Pengertian Konstitusi

- **Dalam arti sempit**, konstitusi adalah hukum dasar yang memuat aturan pokok atau aturan dasar negara.
- **Dalam arti luas**, konstitusi adalah keseluruhan sistem aturan yang menetapkan dan mengatur kehidupan kenegaraan melalui sistem pemerintahan negara dan tata hubungan timbal balik antar lembaga negara serta antara negara dengan warga negara.

## Sifat Konstitusi

Sifat konstitusi dilihat dari jumlah pasal dan kemudahan mengubahnya:

- **Fleksibel (luwes)**: pasal-pasal dalam konstitusi jumlahnya sedikit sehingga mudah diubah mengikuti perkembangan zaman.
- **Rigid (kaku)**: pasal-pasal dalam konstitusi jumlahnya banyak dan sulit diubah.

## Konstitusi yang Pernah Berlaku di Indonesia

Konstitusi yang pernah berlaku di Indonesia adalah sebagai berikut.

### 1. Undang-Undang Dasar 1945 (UUD 1945)

- UUD 1945 atau UUD Proklamasi berlaku pada 18 Agustus 1945 sampai 27 Desember 1949.
- UUD 1945 ditetapkan dan disahkan oleh PPKI pada 18 Agustus 1945.''',
    "twk-modul-ringkasan-s08": '''## Macam-Macam Konstitusi

- **Konstitusi tertulis** disebut Undang-Undang Dasar.
- **Konstitusi tidak tertulis** disebut konvensi.

## Sistematika UUD 1945 (Asli)

- **Pembukaan**: ada empat alinea.
- **Batang tubuh**: terdiri dari 16 bab, 37 pasal, 4 ayat aturan peralihan, dan 2 ayat aturan tambahan.
- **Penjelasan**: terdiri dari penjelasan umum dan penjelasan khusus (pasal demi pasal).

Bentuk negara Indonesia adalah kesatuan, berdasarkan Pasal 1 Ayat (1) UUD 1945. Bentuk pemerintahan Indonesia adalah republik, berdasarkan Pasal 1 Ayat (1) UUD 1945. Sistem pemerintahan adalah kabinet presidensial. Presiden adalah kepala negara
  sekaligus kepala pemerintahan, dibantu wakil presiden dan para menteri.

## Konstitusi RIS 1949

- UUD Republik Indonesia Serikat 1949 (UUD RIS 1949) berlaku pada 27 Desember 1949 sampai 17 Agustus 1950.
- Sistematika: Mukadimah (empat alinea) dan batang tubuh (6 bab dan 197 pasal).
- Bentuk negara adalah serikat atau federasi. Bentuk pemerintahan adalah republik, berdasarkan Pasal 1 Ayat (2) Konstitusi RIS.
- Sistem pemerintahan adalah kabinet parlementer. Presiden sebagai kepala negara dan perdana menteri sebagai kepala pemerintahan.

## Undang-Undang Dasar Sementara 1950 (UUDS 1950)

- UUDS 1950 berlaku pada 17 Agustus 1950 sampai 5 Juli 1959.
- Sistematika: Mukadimah (empat alinea), Bab I tentang Negara Republik Indonesia, Bab II tentang alat-alat kelengkapan negara, Bab III tentang tugas alat-alat kelengkapan negara, Bab IV tentang pemerintahan dan daerah-daerah swapraja, Bab V
  tentang Konstituante, dan Bab VI tentang perubahan, ketentuan-ketentuan peralihan, dan ketentuan-ketentuan penutup.
- Bentuk negara adalah kesatuan, berdasarkan Pasal 1 Ayat (1) UUDS 1950. Bentuk pemerintahan adalah republik, berdasarkan Pasal 1 Ayat (1) dan Mukadimah alinea IV UUDS 1950.
- Sistem pemerintahan adalah kabinet parlementer dengan demokrasi liberal yang masih bersifat semu. DPR dapat membubarkan kabinet, sedangkan presiden memiliki kedudukan yang kuat dan dapat membubarkan DPR.

## UUD 1945 Hasil Dekret Presiden

- UUD 1945 hasil Dekret Presiden disebut juga UUD 1945 periode kedua, berlaku pada 5 Juli 1959 sampai amandemen pertama tahun 1999.
- Gagalnya Badan Konstituante menetapkan rancangan Undang-Undang Dasar berdampak pada keadaan politik yang tidak stabil, sehingga pada 5 Juli 1959 Presiden Soekarno mengeluarkan Dekret Presiden. Salah satu isi dekret itu memberlakukan kembali
  UUD 1945.
- Ketentuan mengenai bentuk negara, bentuk pemerintahan, dan sistem pemerintahan sama seperti yang tercantum dalam UUD 1945.

## UUD 1945 Hasil Amandemen

- UUD 1945 hasil amandemen adalah hasil empat kali perubahan pada 1999-2002 dan berlaku sampai sekarang.
- Sistematika: Pembukaan (empat alinea) dan batang tubuh (16 bab dan 37 pasal).
- Beberapa perubahan mendasar dalam sistem ketatanegaraan Indonesia:
  - Kedudukan yang sejajar dan proporsional antara Presiden dan DPR.
  - Masa jabatan presiden diatur dengan tegas, yaitu maksimal dapat dipilih untuk dua kali masa jabatan.
  - Dilaksanakannya otonomi daerah.
  - Penyelenggaraan pemilu oleh lembaga nonpemerintah yang netral dan mandiri.''',
    "twk-modul-ringkasan-s09": '''Berikut berbagai penyimpangan terhadap konstitusi yang pernah terjadi di Indonesia.

## 1. Penyimpangan terhadap UUD 1945 Periode 1945-1949

- **Kekuasaan presiden tidak terbatas.** Masa awal proklamasi dianggap masa peralihan, sehingga kekuasaan presiden sangat luas. Selain menjalankan kekuasaan eksekutif, presiden juga menjalankan kekuasaan MPR dan DPR.
- Di samping presiden, hanya ada wakil presiden dan KNIP sebagai pembantu presiden.
- **Pergantian sistem kabinet presidensial menjadi kabinet parlementer** menjadikan para menteri diangkat dan bertanggung jawab kepada parlemen atau DPR.

## 2. Penyimpangan terhadap UUD RIS 1949

- **Penyimpangan bentuk negara.** Bentuk negara serikat bertentangan dengan konsep Negara Kesatuan Republik Indonesia.
- Pergantian UUD 1945 menjadi UUD RIS.
- Pemerintahan parlementer tidak sesuai dengan semangat UUD 1945.

## 3. Penyimpangan terhadap UUDS 1950

- **Persaingan tidak sehat.** Dengan ditetapkannya demokrasi liberal yang ditafsirkan sebagai kebebasan mutlak bagi setiap individu dan partai politik, timbul persaingan tidak sehat yang mengancam persatuan dan kesatuan bangsa.
- **Instabilitas nasional.** Kabinet sering berganti-ganti sehingga program-program yang disusun sebelumnya tidak berjalan.

## 4. Penyimpangan terhadap UUD 1945 Periode 1959-1965 (Orde Lama)

- **Presiden membubarkan DPR** karena DPR tidak menyetujui RAPBN yang diusulkan pemerintah.
- **Penetapan pidato presiden** yang berjudul Penemuan Kembali Revolusi Kita atau Manifesto Politik Republik Indonesia (Manipol) menjadi GBHN yang bersifat tetap oleh MPRS.
- **Pengangkatan presiden seumur hidup** melalui Tap MPR No. III/MPRS/1963.
- **Rangkap jabatan.** Pimpinan lembaga tinggi dan tertinggi negara diangkat sebagai menteri negara.
- **Kekuasaan presiden tidak terbatas.** Kekuasaan presiden melebihi wewenang yang ditetapkan dalam UUD 1945.
- **Tidak berjalannya hak bujet DPR** karena pemerintah tidak mengajukan rancangan undang-undang APBN untuk mendapatkan persetujuan DPR.

## 5. Penyimpangan terhadap UUD 1945 Periode 1965-1998 (Orde Baru)

- Sistem demokrasi yang dijalankan bersifat feodalisme.
- **Pembatasan aspirasi.** Kebebasan berbicara, terutama yang berkaitan dengan arah kebijakan pemerintah, dibungkam.
- **Ekonomi kerakyatan tidak berjalan.** Ekonomi kerakyatan berubah menjadi ekonomi kapitalisme, monopoli oleh negara berubah menjadi monopoli oleh keluarga.
- **Supremasi hukum tidak berjalan.** Supremasi hukum berubah menjadi supremasi kekuasaan presiden.
- **Lembaga legislatif tidak berjalan.** Lembaga legislatif tidak mewakili rakyat, bahkan tidak inspiratif karena hasil rekayasa politik.
- Bermunculannya korupsi, kolusi, dan nepotisme (KKN).

## Amandemen UUD 1945

Amandemen adalah penambahan atau perubahan pada sebuah konstitusi yang merupakan bagian yang tidak terpisahkan dari naskah aslinya.

Kesepakatan dasar dalam mengamandemen UUD 1945:

1. Tidak mengubah Pembukaan UUD 1945.
2. Tetap mempertahankan bentuk Negara Kesatuan Republik Indonesia.
3. Tetap mempertahankan sistem presidensial.
4. Penjelasan UUD 1945 yang bersifat normatif dimasukkan ke dalam pasal-pasal.
5. Perubahan dilakukan secara "addendum".''',
    "twk-modul-ringkasan-s10": '''## Tujuan Amandemen UUD 1945

- Memenuhi tuntutan-tuntutan reformasi.
- Merevisi ulang UUD 1945.
- Agar isi UUD 1945 lebih jelas setelah diamandemen.

## Perbaikan dan Perubahan dalam Amandemen

- Adanya pembatasan-pembatasan atas kekuasaan Presiden di Indonesia.
- Memperkuat dan menegaskan kembali peran kekuasaan legislatif di Indonesia.
- Mencantumkan Hak Asasi Manusia di Indonesia.
- Menegaskan kembali hak dan kewajiban negara ataupun warga negara.
- Otonomi daerah dan hak-hak rakyat di daerah.
- Perbaruan lembaga-lembaga negara sehingga tidak ada lagi istilah lembaga tertinggi negara dan lembaga tinggi negara.

## Tahap-Tahap Amandemen UUD 1945

### Tahap Pertama

- Diputuskan dalam Sidang MPR pada 19 Oktober 1999.
- Menyangkut 5 persoalan pokok: perubahan tentang lembaga pemegang kekuasaan membuat undang-undang, perubahan masa jabatan presiden, perubahan tentang hak prerogatif presiden, perubahan tentang fungsi menteri, dan perubahan redaksional.
- 9 pasal yang diamandemen: Pasal 5, 7, 9, 13, 14, 15, 17, 20, dan 21.

### Tahap Kedua

- Diputuskan dalam Sidang MPR pada 18 Agustus 2000.
- Menyangkut 9 persoalan pengaturan mengenai: wilayah negara, hak asasi manusia, DPR, pemerintahan daerah, pertahanan dan keamanan, lambang negara, dan lagu kebangsaan.
- 5 bab dan 25 pasal yang diamandemen: Bab IXA, X, XA, XII, dan XV; Pasal 18, 18A, 18B, 19, 20, 20A, 22A, 22B, 25A, 26, 27, 28A, 28B, 28C, 28D, 28E, 28F, 28G, 28H, 28I, 28J, 30, 36A, 36B, dan 36C.

### Tahap Ketiga

- Diputuskan dalam Sidang MPR pada 9 November 2001.
- Berkenaan dengan 16 persoalan pokok, meliputi: kedaulatan rakyat, tugas MPR, syarat-syarat Presiden dan Wakil Presiden, pemilihan Presiden dan Wakil Presiden secara langsung, pemberhentian Presiden, Presiden berhalangan tetap, kekosongan Wakil
  Presiden, perjanjian internasional, kementerian negara, pemilihan umum, APBN, pajak, dan keuangan negara, Komisi Yudisial, serta Mahkamah Konstitusi.
- 3 bab dan pasal-pasal yang diamandemen: Bab VIIA, VIIB, dan VIIIA; Pasal 1, 3, 6, 6A, 7A, 7B, 7C, 8, 11, 17, 22C, 22D, 22E, 23, 23A, 23C, 23E, 23F, 23G, 24, 24A, 24B, dan 24C.

### Tahap Keempat

- Diputuskan dalam Sidang MPR pada 10 Agustus 2002.
- Berkenaan dengan 12 persoalan, antara lain: komposisi keanggotaan MPR, pemilu Presiden dan Wakil Presiden, Presiden dan Wakil Presiden tidak dapat menjalankan kewajiban dalam masa jabatan secara bersamaan, Dewan Pertimbangan yang bertugas
  memberi nasihat kepada Presiden, mata uang, bank sentral, badan-badan lain dalam kekuasaan kehakiman, pendidikan, dan kebudayaan.
- 2 bab dan 13 pasal yang diamandemen: Bab XIII dan XIV; Pasal 2, 6A, 8, 11, 16, 23B, 23D, 24, 31, 32, 33, 34, dan 37.''',
    "twk-modul-ringkasan-s11": '''## Sejarah Penemuan Bhinneka Tunggal Ika

Sesanti atau semboyan Bhinneka Tunggal Ika diungkapkan pertama kali oleh Mpu Tantular, pujangga agung Kerajaan Majapahit yang hidup pada masa pemerintahan Raja Hayamwuruk pada abad XIV (1350-1389).

Sesanti tersebut terdapat dalam karyanya, kakawin Sutasoma, pupuh 139 bait 5, yang berbunyi "Bhinna ika tunggal ika, tan hana dharma mangrwa". Artinya, "Berbeda-beda tetapi tetap satu jua, tidak ada kebenaran yang mendua".

Semboyan itu dijadikan prinsip dalam kehidupan pemerintahan Kerajaan Majapahit untuk mengantisipasi adanya keanekaragaman agama yang dipeluk rakyat Majapahit pada waktu itu. Meskipun mereka berbeda agama, mereka tetap satu dalam pengabdian.

Sesanti karya Mpu Tantular itu diharapkan menjadi acuan bagi rakyat Majapahit dalam berdharma, sedangkan bagi bangsa Indonesia dijadikan semboyan dan pegangan bangsa dalam hidup berbangsa dan bernegara.''',
    "twk-modul-ringkasan-s12": '''## Landasan Hukum Bhinneka Tunggal Ika

- Pada 1951, semboyan Bhinneka Tunggal Ika ditetapkan oleh pemerintah Indonesia sebagai semboyan resmi Negara Republik Indonesia dengan Peraturan Pemerintah No. 66 Tahun 1951.
- Peraturan Pemerintah No. 66 Tahun 1951 menyatakan bahwa Bhinneka Tunggal Ika adalah semboyan yang terdapat dalam Lambang Negara Republik Indonesia, Garuda Pancasila. Kata "bhinna ika" kemudian dirangkai menjadi satu kata "bhinneka".
- Pada perubahan UUD 1945 yang kedua, Bhinneka Tunggal Ika dikukuhkan sebagai semboyan resmi yang terdapat dalam lambang negara, dan tercantum dalam Pasal 36A UUD 1945.

## Esensi Bhinneka Tunggal Ika dalam UUD 1945

Seperti halnya Pancasila, istilah Bhinneka Tunggal Ika tidak tertera dalam UUD 1945 yang asli, namun esensinya terdapat di dalamnya. UUD 1945 menampung keanekaragaman bangsa, misalnya melalui MPR sebagai penjelmaan seluruh rakyat Indonesia yang
  terdiri atas anggota DPR ditambah utusan daerah dan golongan, serta melalui daerah-daerah yang bersifat istimewa dengan susunan aslinya masing-masing.

Maknanya, dalam menyelenggarakan kehidupan kenegaraan perlu ditampung keanekaragaman atau kemajemukan bangsa dalam satu wadah, yaitu Negara Kesatuan Republik Indonesia.''',
    "twk-modul-ringkasan-s13": '''## Lambang Negara Indonesia

- Dalam Konstitusi RIS dan UUDS 1950, Pasal 3 Ayat (3) menentukan perlunya ditetapkan lambang negara oleh pemerintah.
- Sebagai tindak lanjut pasal tersebut, terbit Peraturan Pemerintah No. 66 Tahun 1951 tentang Lambang Negara.
- Setelah amandemen UUD 1945, Pasal 36A menyebutkan bahwa lambang negara ialah Garuda Pancasila dengan semboyan Bhinneka Tunggal Ika.

## Tiga Bagian Lambang Negara

Pasal 1 Peraturan Pemerintah No. 66 Tahun 1951 menyebutkan lambang negara terdiri atas tiga bagian, yaitu:

1. Burung Garuda yang menengok dengan kepala lurus ke sebelah kanannya.
2. Perisai berupa jantung yang digantung dengan rantai pada leher Garuda.
3. Semboyan yang ditulis di atas pita yang dicengkeram oleh Garuda. Di atas pita tertulis dengan huruf latin sebuah semboyan dalam bahasa Jawa Kuno yang berbunyi "Bhinneka Tunggal Ika".

Bhinneka Tunggal Ika tidak dapat dipisahkan dari Hari Kemerdekaan Bangsa Indonesia dan Dasar Negara Pancasila. Hal ini sesuai dengan komponen yang terdapat dalam Lambang Negara Indonesia.''',
    "twk-modul-ringkasan-s14": '''## Konsep Dasar Bhinneka Tunggal Ika

Bhinneka Tunggal Ika merupakan semboyan yang menjadi kesepakatan bangsa yang ditetapkan dalam UUD. Oleh karena itu, maknanya perlu dipahami secara tepat dan benar, baru kemudian dipahami cara mengimplementasikannya secara tepat dan benar pula.

Dalam menerapkan Bhinneka Tunggal Ika di Indonesia, perlu mengacu pada prinsip yang terkandung dalam Pembukaan UUD 1945, yaitu mengutamakan kepentingan bangsa, bukan kepentingan individu. Berikut isi Pembukaan UUD 1945 yang berkaitan:

1. Sesungguhnya kemerdekaan itu ialah hak segala bangsa.
2. Kemerdekaan yang dinyatakan oleh bangsa Indonesia supaya dapat hidup dalam kebangsaan yang bebas.
3. Salah satu misi negara Indonesia adalah mencerdaskan kehidupan bangsa.
4. Salah satu dasar negara Indonesia adalah Persatuan Indonesia yang merupakan wawasan kebangsaan.
5. Ingin diwujudkan berdirinya negara Indonesia yang berkeadilan sosial bagi seluruh rakyat Indonesia.

Dari isi Pembukaan UUD 1945 tersebut jelas bahwa prinsip kebangsaan mewarnai kehidupan berbangsa dan bernegara bagi bangsa Indonesia. Istilah individu atau konsep individualisme tidak terdapat dalam UUD 1945.

Dengan kata lain, Bhinneka Tunggal Ika yang diterapkan di Indonesia tidak berdasar pada individualisme dan liberalisme.''',
    "twk-modul-ringkasan-s15": '''## Prinsip Bhinneka Tunggal Ika

Prinsip Bhinneka Tunggal Ika adalah asas yang mengakui adanya kemajemukan bangsa dilihat dari segi agama, keyakinan, suku bangsa, adat budaya, keadaan daerah, dan ras.

## Cara Menyikapi Kemajemukan

- Kemajemukan dihormati dan dihargai serta didudukkan dalam suatu prinsip yang dapat mengikat keanekaragaman tersebut dalam kesatuan yang kokoh.
- Kemajemukan bukan dikembangkan dan didorong menjadi faktor pemecah bangsa, tetapi menjadi kekuatan yang dimiliki oleh masing-masing komponen bangsa.
- Kemajemukan diikat secara sinergi menjadi kekuatan yang luar biasa untuk dimanfaatkan dalam menghadapi segala tantangan dan persoalan bangsa.''',
    "twk-modul-ringkasan-s16": '''## Paham Bhinneka Tunggal Ika

Paham Bhinneka Tunggal Ika adalah paham yang mengembangkan konsep baru dari perpaduan unsur asli dengan unsur dari luar, tanpa meleburkan atau menghilangkan unsur aslinya. Paham ini bukan sinkretisme, yaitu paham yang meleburkan unsur-unsur menjadi satu bentuk baru yang menghilangkan ciri aslinya.

Contohnya, adat istiadat tetap diakui eksistensinya dalam Negara Kesatuan Republik Indonesia yang berwawasan kebangsaan: keberagaman dihargai apa adanya, dan dari keberagaman itu dibangun kesatuan.''',
    "twk-modul-ringkasan-s17": '''## Prinsip-Prinsip Bhinneka Tunggal Ika

Prinsip-prinsip yang terkandung dalam Bhinneka Tunggal Ika adalah sebagai berikut.

### 1. Toleransi

Bhinneka Tunggal Ika membentuk kesatuan dari keanekaragaman, bukan membentuk konsep baru dari keanekaragaman pada unsur atau komponen bangsa.

Contohnya terdapat keanekaragaman agama dan kepercayaan. Artinya, ketunggalan Bhinneka Tunggal Ika tidak dimaksudkan untuk membentuk agama baru. Setiap agama diakui seperti apa adanya, tetapi dicari common denominator dalam kehidupan beragama di Indonesia.

Common denominator adalah prinsip-prinsip yang ditemui dari setiap agama yang memiliki kesamaan. Common denominator ini dipegang sebagai ketunggalan yang dipergunakan sebagai acuan dalam hidup berbangsa dan bernegara.

### 2. Tidak Sektarian dan Eksklusif, melainkan Inklusif

Dalam kehidupan berbangsa dan bernegara, tidak dibenarkan merasa dirinya yang paling benar, paling hebat, dan tidak mengakui harkat dan martabat pihak lain.

Kelemahan pandangan sektarian dan eksklusif (tertutup):

- Menghambat terjadinya perkembangan dalam menghadapi arus globalisasi dan keanekaragaman budaya bangsa.
- Memicu terbentuknya keakuan yang berlebihan, dengan ciri: tidak atau kurang memperhitungkan pihak lain, memupuk kecurigaan, kecemburuan, dan persaingan yang tidak sehat.

Cara menyikapi pandangan sektarian dan eksklusif adalah dengan sifat terbuka yang terarah, agar terbentuk masyarakat yang pluralistik, secara koeksistensi, memiliki sifat saling menghormati, tidak merasa dirinya yang paling benar, dan tidak memaksakan kehendak pribadi kepada pihak lain, sehingga dapat berkembang menjadi masyarakat modern.

Bhinneka Tunggal Ika bersifat inklusif. Artinya, golongan mayoritas dalam hidup berbangsa dan bernegara tidak memaksakan kehendaknya pada golongan minoritas.

Kelebihan dari Bhinneka Tunggal Ika yang bersifat inklusif:

- Segala peraturan perundang-undangan, khususnya peraturan daerah, dibuat agar mampu mengakomodasi masyarakat yang pluralistik dan multikultural dengan tetap berpegang teguh pada dasar negara Pancasila dan UUD 1945.
- Menghindari hal-hal yang memberi peluang terjadinya perpecahan bangsa.

### 3. Bukan Formalitas

Bhinneka Tunggal Ika tidak bersifat formalitas yang hanya menunjukkan perilaku semu. Bhinneka Tunggal Ika dilandasi oleh sikap saling mempercayai, saling menghormati, saling mencintai, dan rukun. Hanya dengan cara demikian, keanekaragaman ini dapat dipersatukan.

### 4. Konvergen, Bukan Divergen

Bhinneka Tunggal Ika bersifat konvergen (tidak divergen). Artinya, perbedaan yang terjadi dalam keanekaragaman tidak untuk dibesar-besarkan, melainkan dicari titik temu dalam bentuk kesepakatan bersama. Kesepakatan tersebut akan terwujud jika dilandasi oleh sikap toleran, nonsektarian, inklusif, akomodatif, dan rukun.

Nilai-nilai yang dipegang dalam mewujudkan kesepakatan itu:

- Terbuka.
- Koeksistensi damai dan kebersamaan.
- Kesetaraan.
- Musyawarah disertai dengan penghargaan terhadap pihak lain yang berbeda.

Dengan menerapkan nilai-nilai tersebut secara konsisten, akan terwujud masyarakat yang damai, aman, tertib, dan teratur, sehingga kesejahteraan dan keadilan akan terwujud.

## Penerapan dalam Kehidupan Berbangsa dan Bernegara

Dalam Pembukaan UUD 1945, alinea pertama disebutkan bahwa: "Sesungguhnya kemerdekaan itu ialah hak segala bangsa dan oleh sebab itu, maka penjajahan di atas dunia harus dihapuskan karena tidak sesuai dengan perikemanusiaan dan perikeadilan."

Awalnya, kemerdekaan dimaknai bebas dari penjajahan negara asing. Saat ini maknanya lebih luas, yaitu menyangkut harkat dan martabat manusia serta hak asasi manusia. Di era globalisasi berkembang paham yang menyebabkan penjajahan dalam bentuk baru, yaitu penjajahan dalam bidang ekonomi, politik, sosial budaya, dan bidang kehidupan yang lain.

Dengan begitu, kemerdekaan dimaknai sebagai kebebasan dari berbagai eksploitasi manusia oleh manusia dalam segala dimensi kehidupan, baik dari luar maupun dari dalam negeri. Manusia memiliki kebebasan dalam berpikir, berkehendak, dan memilih, serta bebas dari segala macam ketakutan, yang merupakan aktualisasi dari konsep hak asasi manusia, yaitu memperlakukan manusia sesuai dengan harkat dan martabatnya.

Sementara itu, penerapan Bhinneka Tunggal Ika dalam kehidupan berbangsa dan bernegara harus berdasar pada Pancasila sebagai dasar negara yang telah ditetapkan oleh bangsa Indonesia. Dengan demikian, penerapan Bhinneka Tunggal Ika harus dijiwai oleh konsep religiositas, humanitas, nasionalitas, kedaulatan, dan sosialitas. Hanya dengan ini maka Bhinneka Tunggal Ika akan teraktualisasi.''',
    "twk-modul-ringkasan-s18": '''## Hakikat Demokrasi

### Arti Kata Demokrasi

Demokrasi berasal dari bahasa Yunani, yaitu demos dan kratos.

- **Demos** artinya rakyat.
- **Kratos** artinya pemerintahan atau kekuasaan.

Secara sederhana, demokrasi dapat diartikan sebagai suatu pemerintahan yang berasal dari rakyat, serta melibatkan rakyat yang memiliki proporsi sangat penting dalam pemerintahan negara.

### Sejarah Perkembangan Demokrasi

Sistem demokrasi pertama kali diterapkan di polis-polis (negara-negara kota) Yunani Kuno dengan bentuk demokrasi langsung. Selanjutnya, munculnya Magna Charta di Inggris pada tahun 1215 menjadi awal kebangkitan kembali demokrasi setelah sekian
  lama dilupakan.

## Tokoh Pendukung Berkembangnya Demokrasi

### John Locke

John Locke berasal dari Inggris. Ia merumuskan tiga hak dasar manusia, yaitu:

- Hak atas hidup (life).
- Hak atas kebebasan (liberty).
- Hak atas kepemilikan (property).

### Montesquieu

Montesquieu berasal dari Prancis. Ia mengemukakan konsep "Trias Politika", yaitu suatu sistem yang dapat menjamin hak-hak politik dengan pembatasan kekuasaan. Pembatasan kekuasaan bertujuan agar tidak terjadi penyalahgunaan wewenang antar
  lembaga negara, yaitu antara legislatif, eksekutif, dan yudikatif.''',
    "twk-modul-ringkasan-s19": '''## Prinsip-Prinsip Demokrasi

- Pemerintahan berdasarkan konstitusi.
- Pemilihan umum yang bebas, jujur, dan adil.
- Terjaminnya hak asasi manusia.
- Persamaan kedudukan di hadapan hukum.
- Peradilan yang bebas dan tidak memihak.
- Keterlibatan warga negara dalam pembuatan keputusan publik (public policy).
- Kebebasan berserikat atau berorganisasi dan mengeluarkan pendapat.
- Kebebasan pers atau media massa.

## Macam-Macam Demokrasi

### Berdasarkan Cara Penyaluran Kehendak Rakyat

- **Demokrasi langsung**: demokrasi yang melibatkan seluruh rakyat secara langsung untuk turut serta dalam menyelesaikan masalah kenegaraan.
- **Demokrasi perwakilan atau demokrasi modern**: demokrasi yang dijalankan melalui suatu lembaga perwakilan.

### Berdasarkan Paham yang Dianut

- **Demokrasi barat, demokrasi liberal, atau demokrasi konstitusional**: demokrasi yang menitikberatkan pada kebebasan individu (individualisme).
- **Demokrasi timur atau demokrasi rakyat**: demokrasi yang banyak dianut oleh negara yang berpaham Marxisme-Komunisme.
- **Demokrasi Pancasila**: demokrasi yang bersumber dari nilai-nilai Pancasila.

## Pelaksanaan Demokrasi di Indonesia

### Demokrasi Liberal atau Parlementer (3 November 1945 sampai 5 Juli 1959)

- Para menteri diangkat dan bertanggung jawab kepada parlemen atau DPR.
- Sistem multipartai.
- Overpower legislatif atau partai politik.
- Keterbatasan presiden atau eksekutif.

### Demokrasi Terpimpin (1959-1965)

- Overpower presiden atau eksekutif.
- Keterbatasan hak pesertaan rakyat atau legislatif.
- Berkembangnya pengaruh komunis.
- Meluasnya peranan TNI sebagai unsur sosial politik.

### Demokrasi Pancasila (1965 sampai sekarang)

- Keseimbangan tuntutan masyarakat.
- Keseimbangan kekuasaan kelembagaan negara.
- Stabilitas masyarakat.
- Pesertaan rakyat.
- Persamaan hak warga negara di dalam hukum, pemerintahan, berserikat atau berkumpul, dan mengeluarkan pendapat.

## Sikap Positif terhadap Pelaksanaan Demokrasi di Indonesia

- Menghormati sepenuhnya perbedaan pendapat, keyakinan, dan kepentingan orang lain dengan tidak mempertentangkannya.
- Menghindari sikap dan perilaku yang angkuh, mementingkan diri sendiri dan kelompok, keras kepala, fanatik, ekstrem, serta meremehkan orang lain.
- Bersifat damai dan antikekerasan atas setiap permasalahan dan perbedaan.
- Selalu mengutamakan kepentingan bangsa dan negara di atas kepentingan pribadi dan golongan.
- Menaati hukum dan peraturan yang berlaku.

## Demokrasi Pancasila

Demokrasi Pancasila adalah demokrasi yang bersumber dari nilai-nilai Pancasila. Dasar hukum pelaksanaan demokrasi Pancasila sebagai berikut:

1. Pancasila sila ke-4.
2. Pembukaan UUD 1945 alinea ke-4.
3. UUD 1945 Pasal 1 Ayat (2).
4. UUD 1945 Pasal 2 Ayat (1).

## Pentingnya Demokrasi di Indonesia

- **Demokrasi dalam kehidupan politik**: diterapkan dalam kegiatan pemilu.
- **Demokrasi dalam kehidupan ekonomi**: pertumbuhan perekonomian harus ditunjang kondisi institusi publik yang bersih dan kredibel, serta memberikan kesempatan yang sama bagi seluruh masyarakat untuk ikut menciptakan dan menikmati kemakmuran.''',
    "twk-modul-ringkasan-s20": '''## Pemilihan Umum (Pemilu) di Indonesia

### Dasar Hukum Pelaksanaan Pemilu

- Pancasila sila ke-4.
- UUD 1945 Pasal 22E Ayat 1-6.
- UU No. 12 Tahun 2003 tentang Pemilihan Umum.

### Asas Pemilu

Asas pemilu adalah LUBERJURDIL, yaitu Langsung, Umum, Bebas, Rahasia, Jujur, dan Adil.

- **Langsung** artinya pemilih memberikan suaranya tanpa perantara.
- **Umum** artinya setiap warga negara yang memenuhi syarat berhak untuk memilih dan dipilih.
- **Bebas** artinya pemilih memberikan suaranya tanpa ada paksaan.
- **Rahasia** artinya pilihan pemilih dijamin tidak akan diketahui oleh siapa pun.
- **Jujur** artinya semua pihak yang terlibat dalam pemilu harus jujur.
- **Adil** artinya semua pihak yang terlibat dalam pemilu diperlakukan sama dan bebas dari kecurangan.

### Tujuan Pemilu dan Peserta Pemilu

- Memilih anggota DPR, DPRD Provinsi, dan DPRD Kabupaten/Kota, pesertanya adalah partai politik.
- Memilih anggota DPD, pesertanya adalah perseorangan.''',
    "twk-modul-ringkasan-s21": '''## Lanjutan: Tujuan Pemilu dan Peserta Pemilu

- Memilih presiden dan wakil presiden, pesertanya adalah pasangan yang dicalonkan oleh partai atau gabungan partai politik.

## Penyelenggaraan Pemilu

Penyelenggaraan pemilu adalah sebuah badan independen, yaitu Komisi Pemilihan Umum (KPU).

## Sistem Pemilu

- **Distrik**: pemilih dikelompokkan ke dalam distrik-distrik yang ditentukan berdasarkan jumlah penduduk yang ada. Satu distrik memiliki jatah satu kursi di parlemen (DPR atau DPRD).
- **Proporsional**: sistem yang menekankan pada perbandingan perolehan wakil dengan perolehan dukungan suara.

## Hakikat Kedaulatan

### Asal Istilah Kedaulatan

Kedaulatan berasal dari bahasa Latin, yaitu supremus, yang berarti kekuasaan tertinggi.

### Makna Kedaulatan

Kedaulatan dapat diartikan sebagai kekuasaan tertinggi atau kekuasaan yang tidak terletak di bawah kekuasaan lain.

### Sifat Kedaulatan

Menurut Jean Bodin, sifat kedaulatan sebagai berikut:

- **Asli**: kekuasaan tidak berasal dari kekuasaan lain yang lebih tinggi.
- **Abadi**: kekuasaan itu tetap ada selama pemegang kedaulatannya berdiri sebagai negara, meskipun pemerintah berganti-ganti.
- **Tunggal**: kekuasaan merupakan satu-satunya kekuasaan tertinggi dalam negara yang tidak diserahkan atau dibagi-bagikan kepada badan lain.
- **Tidak terbatas**: kekuasaan itu tidak dapat dibatasi oleh kekuasaan lain.''',
    "twk-modul-ringkasan-s22": '''## Macam-Macam Kedaulatan

Ada dua macam kedaulatan:

### Kedaulatan ke Dalam (Interne Soevereiniteit)

Kekuasaan tertinggi di dalam negara untuk mengatur fungsinya sesuai dengan peraturan perundang-undangan yang berlaku.

### Kedaulatan ke Luar (Externe Soevereiniteit)

Kekuasaan tertinggi untuk mengatur pemerintahan serta memelihara keutuhan wilayah dan kesatuan bangsa, dan untuk mengadakan hubungan dan kerja sama dengan negara lain. Kedaulatan ini harus dihormati oleh bangsa dan negara lain.''',
    "twk-modul-ringkasan-s23": '''## Teori-Teori Kedaulatan

### 1. Teori Kedaulatan Tuhan

- Kekuasaan tertinggi ada pada Tuhan atau bersumber pada Tuhan.
- Negara dan pemerintah mendapatkan kekuasaan yang tertinggi dari Tuhan (raja mengaku sebagai keturunan Dewa).

### 2. Teori Kedaulatan Raja

- Kekuasaan tertinggi berada di tangan raja.
- Raja memiliki kekuasaan yang tidak terbatas sehingga raja berada di atas hukum secara mutlak.
- Tokoh pencetus: Niccolo Machiavelli, Thomas Hobbes, dan Hegel.

### 3. Teori Kedaulatan Negara

- Kekuasaan tertinggi ada pada negara.
- Negara dianggap sebagai sumber kedaulatan.
- Tokoh pencetus: Jean Bodin dan George Jellinek.

### 4. Teori Kedaulatan Hukum

- Kekuasaan tertinggi dalam suatu negara adalah hukum.
- Penguasa ataupun rakyat wajib tunduk pada hukum, dan negara yang menciptakan hukum.
- Tokoh pencetus: Krabbe.

### 5. Teori Kedaulatan Rakyat

- Kedaulatan berada di tangan rakyat.
- Sumber teori ini adalah ajaran demokrasi.
- Tokoh pencetus: John Locke, Montesquieu, dan J.J. Rousseau.

## Struktur Ketatanegaraan

Terdapat perbedaan yang mencolok pada struktur ketatanegaraan yang berlaku di Indonesia pada masa sebelum dan sesudah amandemen UUD 1945.

### Sebelum Amandemen UUD 1945

Di bawah Pancasila dan UUD 1945, MPR berkedudukan sebagai lembaga tertinggi negara. Di bawah MPR terdapat Presiden, DPR, DPA, BPK, dan MA sebagai lembaga tinggi negara.

### Sesudah Amandemen UUD 1945

Di bawah UUD 1945, lembaga-lembaga negara berkedudukan sejajar, yaitu MPR, Presiden, DPR, DPD, MA, MK, KY, BPK, dan KPU. Kekuasaan kehakiman dilaksanakan oleh MA, MK, dan KY.''',
    "twk-modul-ringkasan-s24": '''## Lembaga-Lembaga Pelaksana Kedaulatan Rakyat

- Majelis Permusyawaratan Rakyat (MPR)
- Presiden
- Dewan Perwakilan Rakyat (DPR)
- Badan Pemeriksa Keuangan (BPK)
- Mahkamah Agung (MA)
- Mahkamah Konstitusi (MK)
- Komisi Yudisial (KY)
- Dewan Perwakilan Daerah (DPD)
- Komisi Pemilihan Umum (KPU)
- Pemerintah Daerah (Pemda)
- Dewan Perwakilan Rakyat Daerah (DPRD)

## Landasan Pelaksanaan Kedaulatan Rakyat

- Landasan idiil: Pancasila.
- Landasan konstitusional: Undang-Undang Dasar 1945.

## Peran Lembaga Negara sebagai Pelaksana Kedaulatan Rakyat

### Majelis Permusyawaratan Rakyat (MPR)

- Mengubah dan menetapkan UUD.
- Melantik Presiden dan Wakil Presiden.
- Memberhentikan Presiden dan Wakil Presiden dalam masa jabatannya menurut UUD.

### Presiden

- Menjalankan UU.
- Mengangkat dan memberhentikan menteri-menteri.
- Mengajukan RUU.
- Membentuk Perppu.
- Mengajukan RAPBN.
- Memegang kekuasaan tertinggi atas angkatan perang.
- Menyatakan perang dengan persetujuan DPR.
- Mengangkat duta dan konsul.
- Menerima duta dari negara lain.
- Memberi grasi, amnesti, abolisi, dan rehabilitasi.
- Memberi gelar dan tanda jasa.

### Dewan Perwakilan Rakyat (DPR)

Tugas DPR:

- Menetapkan RAPBN bersama presiden.
- Menetapkan RUU.
- Mengawasi jalannya pemerintahan.

Hak-hak yang dimiliki DPR:

- **Hak angket**: hak untuk melakukan penyelidikan terhadap kebijakan pemerintah.
- **Hak interpelasi**: hak untuk meminta keterangan kepada presiden.
- **Hak imunitas**: hak untuk tidak dituntut dalam pengadilan karena pernyataannya dalam sidang.
- Hak mengajukan usul atau pendapat.
- Hak mengajukan usul RUU.
- **Hak budget**: hak untuk membahas RAPBN.

### Badan Pemeriksa Keuangan (BPK)

- BPK berkewajiban memeriksa tanggung jawab keuangan negara.
- Hasil pemeriksaan BPK dilaporkan kepada DPR, DPD, dan DPRD.

### Mahkamah Agung (MA)

- Mengadili pada tingkat kasasi.
- Menguji peraturan perundang-undangan di bawah UU terhadap UU.
- Memberikan pertimbangan hukum kepada lembaga negara lain.

### Mahkamah Konstitusi (MK)

- Menguji UU terhadap UUD.
- Memutus sengketa kewenangan lembaga negara.
- Memutuskan pembubaran partai politik.
- Memutus perselisihan hasil pemilu.
- Memutus pendapat DPR mengenai dugaan pelanggaran oleh Presiden atau Wakil Presiden.

### Dewan Perwakilan Daerah (DPD)

- Mengajukan RUU kepada DPR berkaitan dengan otonomi daerah.
- Ikut membahas UU yang berkaitan dengan otonomi daerah.
- Memberikan masukan kepada DPR atas RUU APBN, pajak, pendidikan, dan agama.
- Mengawasi pelaksanaan UU yang berkaitan dengan otonomi daerah.

### Komisi Pemilihan Umum (KPU)

- Merencanakan penyelenggaraan pemilu.
- Menetapkan organisasi dan tata cara semua tahapan pelaksanaan pemilu.
- Mengkoordinasikan, menyelenggarakan, dan mengendalikan semua tahapan pelaksanaan pemilu.
- Menetapkan peserta pemilu.
- Menetapkan daerah pemilihan, jumlah kursi, dan calon anggota DPR, DPD, DPRD Provinsi, dan DPRD Kabupaten/Kota.
- Melakukan evaluasi dan pelaporan pelaksanaan pemilu.
- Melaksanakan tugas dan kewenangan lain yang diatur undang-undang.

### Komisi Yudisial (KY)

- Mengawasi perilaku hakim.
- Mengusulkan pengangkatan hakim agung.
- Ikut menjaga dan menegakkan kehormatan dan martabat hakim.

## Sistem Pemerintahan

### 1. Presidensial

Presidensial adalah sistem pemerintahan negara republik, yaitu kekuasaan eksekutif dipilih melalui pemilu dan terpisah dari kekuasaan legislatif. Ciri-cirinya:

- Presiden sebagai kepala negara sekaligus sebagai kepala pemerintahan.
- Presiden dipilih langsung oleh rakyat atau oleh sebuah badan atau dewan pemilih.
- Presiden tidak termasuk pemegang kekuasaan legislatif dan tidak dapat memerintahkan pemilihan umum.
- Presiden tidak dapat membubarkan kekuasaan legislatif.
- Presiden memiliki hak prerogatif untuk mengangkat dan memberhentikan menteri-menteri yang memimpin departemen dan nondepartemen.
- Para menteri bertanggung jawab kepada presiden.

### 2. Parlementer

Parlementer adalah sistem pemerintahan yang parlemennya memiliki peranan penting dalam pemerintahan. Parlemen berwenang mengangkat perdana menteri dan dapat menjatuhkan pemerintahan. Ciri-cirinya:

- Kabinet dipimpin oleh seorang perdana menteri yang dibentuk berdasarkan kekuasaan yang menguasai parlemen.
- Anggota kabinet sebagian atau seluruhnya berasal dari anggota parlemen.
- Perdana menteri bersama kabinet bertanggung jawab kepada parlemen.
- Kepala negara (raja atau ratu atau presiden) dengan saran atau nasihat perdana menteri dapat membubarkan parlemen dan memerintahkan diadakan pemilihan umum.

### 3. Semipresidensial

Semipresidensial adalah sistem pemerintahan yang menggabungkan sistem presidensial dan sistem parlementer, sering disebut dualisme eksekutif atau kepemimpinan rangkap karena dipimpin presiden dan perdana menteri. Ciri-cirinya:

- Presiden republik dipilih melalui hak pilih umum.
- Presiden memiliki kekuasaan yang cukup besar.
- Perdana menteri mengepalai kabinet yang bertanggung jawab kepada parlemen, dan parlemen dapat menjatuhkan perdana menteri melalui mosi tidak percaya.''',
    "twk-modul-ringkasan-s25": '''## Sistem Pemerintahan di Indonesia

Sistem pemerintahan yang berlaku di Indonesia adalah presidensial. Ciri-cirinya:

1. Kedaulatan berada di tangan rakyat dan dilaksanakan menurut Undang-Undang Dasar (UUD 1945 Pasal 1 Ayat 2).
2. Negara Indonesia adalah negara yang berdasarkan atas hukum (UUD 1945 Pasal 1 Ayat 3).
3. Anggota MPR (DPR dan DPD), presiden dan wakil presiden, anggota DPRD, dan kepala daerah dipilih langsung oleh rakyat melalui pemilihan umum (UUD 1945 Pasal 22E).
4. Presiden tidak dapat membubarkan DPR, artinya kekuasaan antara presiden dan DPR adalah sejajar (UUD 1945 Pasal 7C).
5. Menteri-menteri negara sebagai pembantu presiden diangkat dan diberhentikan oleh presiden (UUD 1945 Pasal 17 Ayat 1 dan 2).
6. DPR memegang kekuasaan membentuk undang-undang (UUD 1945 Pasal 20 Ayat 1).''',
    "twk-modul-ringkasan-s26": '''## Tata Urutan Perundang-undangan Nasional

Tata urutan peraturan perundang-undangan di Indonesia adalah sebagai berikut.

### 1. Undang-Undang Dasar 1945

UUD 1945 merupakan peraturan negara tertinggi dan sebagai hukum dasar tertulis yang memuat dasar dan garis besar hukum dalam penyelenggaraan negara.

### 2. Ketetapan MPR

Ketetapan MPR merupakan putusan MPR yang ditetapkan dalam sidang-sidang MPR. Terdapat dua macam putusan MPR, yaitu:

- **Ketetapan**: putusan MPR yang mengikat ke dalam dan ke luar majelis.
- **Keputusan**: putusan MPR yang mengikat ke dalam majelis saja.

### 3. Undang-Undang (UU) dan Peraturan Pemerintah Pengganti Undang-Undang (Perppu)

- Undang-undang merupakan produk bersama antara DPR dan presiden untuk melaksanakan UUD 1945 dan Ketetapan MPR.
- Perppu merupakan peraturan yang dibuat oleh pemerintah dalam hal kepentingan yang memaksa (Pasal 22 UUD 1945). Ketentuannya:
  - Perppu harus diajukan ke DPR dalam persidangan berikut.
  - DPR dapat menolak Perppu dengan tidak menerima atau mengadakan perubahan.
  - Jika ditolak DPR, Perppu harus dicabut.

### 4. Peraturan Pemerintah (PP)

Peraturan pemerintah merupakan peraturan yang dibuat oleh pemerintah untuk melaksanakan UU.

### 5. Peraturan Presiden (Perpres)

Peraturan presiden merupakan peraturan yang dibuat oleh presiden untuk menjalankan fungsi pemerintahan dan melaksanakan perintah peraturan perundang-undangan yang lebih tinggi.

### 6. Peraturan Daerah (Perda)

Perda merupakan peraturan yang dibuat oleh Pemerintah Daerah (Pemda) untuk melaksanakan aturan hukum di atasnya dan menampung kondisi khusus dari daerah yang bersangkutan. Jenis-jenis Perda:

- **Perda provinsi**: dibuat oleh DPRD provinsi bersama dengan gubernur.
- **Perda Kabupaten/Kota**: dibuat oleh DPRD Kabupaten/Kota bersama dengan bupati atau walikota.''',
    "twk-modul-ringkasan-s27": '''## Peraturan Desa

Peraturan desa atau yang setingkat dibuat oleh Badan Permusyawaratan Desa atau lembaga yang setingkat.

## Fungsi dan Kedudukan Peraturan Perundang-undangan

### Fungsi Peraturan Perundang-undangan

- Untuk memberikan kepastian hukum.
- Untuk melindungi dan mengayomi hak-hak warga negara.
- Untuk memberikan rasa keadilan.
- Untuk menciptakan ketertiban dan ketenteraman.

### Kedudukan Peraturan Perundang-undangan

- Sebagai hukum bagi warga negara.
- Menjamin hak-hak dan kewajiban warga negara.

## Proses Pembuatan Peraturan Perundang-undangan Nasional

### Asas Penyusunan Peraturan Perundang-undangan

- **Asas hierarki**: suatu peraturan perundang-undangan tidak boleh bertentangan dengan peraturan perundang-undangan yang lebih tinggi tingkatannya.
- **Undang-undang tidak dapat diganggu gugat**: hanya boleh diuji oleh lembaga yang berwenang (DPR dan MK).
- **Undang-undang yang bersifat khusus mengesampingkan undang-undang yang bersifat umum.**
- **Peraturan perundang-undangan yang masih berlaku hanya dapat dicabut atau diubah oleh peraturan yang sederajat atau lebih tinggi.**
- **Undang-undang tidak berlaku surut**: peraturan tidak berlaku di waktu sebelum diundangkannya, kecuali dinyatakan secara tegas dalam peraturan tersebut.
- **Undang-undang yang baru mengesampingkan undang-undang yang lama.**
- **Konsistensi**: tidak ada pasal-pasal yang bertentangan, baik dalam peraturan itu sendiri maupun dengan peraturan lain.

### Alur Proses Penyusunan Peraturan Perundang-undangan

- **Proses penyiapan Rancangan Undang-Undang (RUU)**
  - RUU yang berasal dari presiden dipersiapkan oleh presiden dan diproses serta dibahas oleh pembantunya dan staf ahli menjadi draf RUU untuk kemudian diajukan kepada DPR.
  - RUU yang berasal dari DPR diproses oleh Panitia Ad Hoc DPR yang selanjutnya dimasukkan dalam agenda pembahasan rapat DPR.
- **Proses pengajuan RUU**: RUU diajukan oleh presiden kepada DPR dan oleh DPR itu sendiri. DPR berwenang untuk mengubah, baik menambah maupun mengurangi RUU tersebut sehingga menjadi Undang-Undang (UU).
- **Proses pembahasan RUU**: RUU yang diajukan oleh presiden atau oleh DPR diproses melalui permusyawaratan dalam masa persidangan DPR.
- **Proses penetapan RUU menjadi UU**: RUU diproses untuk ditetapkan menjadi UU oleh DPR dalam forum rapat pleno DPR.
- **Pengesahan dan pemberlakuan UU**: setelah DPR menetapkan RUU menjadi UU, UU tersebut disahkan oleh presiden untuk diundangkan oleh menteri sekretaris negara dalam lembaran negara tentang berlakunya UU tersebut.

### Pihak-Pihak yang Terlibat dalam Penyusunan Peraturan Perundang-undangan

- Dewan Perwakilan Rakyat (DPR).
- Presiden.

### Kerangka Peraturan Perundang-undangan

- **Judul**: berisi jenis, nomor, tahun perundangan, dan nama peraturan perundang-undangan.
- **Pembukaan**: berisi kata-kata "Dengan Rahmat Tuhan Yang Maha Esa", jabatan pembentuk peraturan perundang-undangan, konsideran, dasar hukum, dan dictum.
- **Batang tubuh atau isi**: terdiri atas bab, pasal, ayat, ketentuan peralihan, ketentuan penutup, pengesahan, dan pengundangan.''',
    "twk-modul-ringkasan-s28": '''## Arti Kata Otonomi

Istilah "otonomi" berasal dari bahasa Latin, yaitu "auto" yang artinya sendiri, dan "nomos" yang artinya aturan. Jadi, arti kata otonomi adalah pengaturan sendiri.

## Pengertian Otonomi Daerah

Otonomi daerah atau desentralisasi adalah hak, wewenang, dan kewajiban daerah otonom untuk mengatur dan mengurus sendiri urusan pemerintahan dan kepentingan masyarakat setempat dalam sistem Negara Kesatuan Republik Indonesia (UU No. 23 Tahun
  2014 tentang Pemerintahan Daerah).

## Nilai Dasar Otonomi Daerah

- **Kebebasan**: kebebasan masyarakat dan pemerintah daerah dalam mengambil tindakan dan kebijakan untuk memecahkan masalah bersama.
- **Partisipasi**: masyarakat berperan aktif dalam proses perencanaan, pelaksanaan, dan pengawasan kebijakan publik di daerahnya.
- **Efektivitas dan efisiensi**: melalui kebebasan dan partisipasi masyarakat, jalannya pemerintahan akan lebih tepat sasaran (efektif) dan tidak menghamburkan anggaran atau tidak terjadi pemborosan (efisiensi).

## Tujuan Otonomi Daerah

- Peningkatan pelayanan dan kesejahteraan masyarakat yang semakin baik.
- Pengembangan kehidupan demokrasi.
- Keadilan.
- Pemerataan.
- Pemeliharaan hubungan yang serasi antara pusat dan daerah serta antardaerah dalam rangka keutuhan NKRI.
- Mendorong untuk memberdayakan masyarakat.
- Menumbuhkan prakarsa dan kreativitas, meningkatkan peran serta masyarakat, dan mengembangkan peran dan fungsi DPRD.

## Asas dan Prinsip Pemerintahan Daerah

- Digunakannya asas desentralisasi, dekonsentrasi, dan tugas pembantuan.
- Penyelenggaraan asas desentralisasi secara utuh dan bulat yang dilaksanakan di daerah kabupaten dan kota.
- Asas tugas pembantuan yang dapat dilaksanakan di daerah provinsi, kabupaten, kota, dan desa.

## Kewenangan Daerah dalam Pelaksanaan Otonomi Daerah

- Perencanaan dan pengendalian pembangunan.
- Perencanaan, pemanfaatan, dan pengawasan tata ruang.
- Penyelenggaraan ketertiban umum dan ketenteraman masyarakat.
- Penyediaan sarana dan prasarana umum.
- Penyelenggaraan pendidikan.
- Penanganan bidang kesehatan dan alokasi sumber daya manusia potensial.
- Fasilitas pengembangan koperasi, usaha kecil, dan menengah, termasuk lintas kabupaten atau kota.
- Pengendalian lingkungan hidup.
- Pelayanan administrasi umum dan pemerintahan.
- Urusan wajib lainnya yang diamanatkan oleh peraturan perundang-undangan.

## Bentuk dan Susunan Pemerintah Daerah

### DPRD sebagai Badan Legislatif Daerah

DPRD merupakan lembaga perwakilan rakyat daerah dan berkedudukan sebagai unsur penyelenggaraan pemerintahan daerah. DPRD memiliki fungsi legislasi, anggaran, dan pengawasan.

Tugas dan wewenang DPRD, antara lain:

- Membentuk Peraturan Daerah (Perda) yang dibahas dengan kepala daerah untuk mendapatkan persetujuan bersama.
- Membahas dan menyetujui rancangan perda tentang APBD bersama dengan kepala daerah.
- Melaksanakan pengawasan terhadap pelaksanaan Perda dan peraturan perundang-undangan lainnya, APBD, dan kerja sama internasional di daerah.
- Mengusulkan pengangkatan dan pemberhentian kepala daerah atau wakil kepala daerah kepada presiden melalui menteri dalam negeri.
- Menerima laporan keterangan pertanggungjawaban kepala daerah dalam penyelenggaraan pemerintahan daerah.

Hak-hak yang dimiliki anggota DPRD, antara lain:

- Hak interpelasi.
- Hak angket.
- Hak menyatakan pendapat.
- Hak mengajukan rancangan Perda.
- Hak memilih dan dipilih.
- Hak imunitas.

### Kepala Daerah sebagai Badan Eksekutif Daerah

Pemerintah daerah provinsi dipimpin oleh gubernur. Pemerintah daerah kabupaten atau kota dipimpin oleh bupati atau walikota. Gubernur, bupati, atau walikota yang biasa disebut kepala daerah memiliki kedudukan yang sederajat dan seimbang dengan
  DPRD masing-masing daerah.

Kepala daerah memiliki tugas dan wewenang sebagai berikut:

- Memimpin penyelenggaraan pemerintahan daerah berdasarkan kebijakan yang ditetapkan bersama DPRD.
- Mengajukan rancangan Perda.
- Menetapkan Perda yang telah mendapat persetujuan bersama DPRD.
- Mengupayakan terlaksananya kewajiban daerah.
- Mewakili daerahnya di dalam dan di luar pengadilan, dan dapat menunjuk kuasa hukum untuk mewakilinya sesuai dengan peraturan perundang-undangan.
- Melaksanakan tugas dan wewenang lain sesuai dengan peraturan perundang-undangan.''',
    "twk-modul-ringkasan-s29": '''## Partisipasi Masyarakat dalam Perumusan Kebijakan Publik

### Pengertian Kebijakan Publik

Kebijakan publik merupakan serangkaian keputusan dan tindakan yang diambil oleh pemerintah yang berhubungan dengan kepentingan masyarakat (publik).

### Tujuan Penerapan Kebijakan Publik

- Mewujudkan ketertiban dalam masyarakat.
- Melindungi hak-hak masyarakat.
- Mewujudkan ketenteraman dan kedamaian dalam masyarakat.
- Mewujudkan kesejahteraan masyarakat.

### Komponen yang Terlibat pada Pelaksanaan Kebijakan Publik

Pelaksanaan kebijakan publik akan melibatkan berbagai komponen, seperti:

- Manusia.
- Dana.
- Sarana dan prasarana.

### Pentingnya Partisipasi Masyarakat

Sebagai warga yang baik, kita harus ikut berpartisipasi dalam perumusan kebijakan publik. Partisipasi tersebut dapat dilakukan pada tahap perencanaan, pelaksanaan, pengawasan, maupun dalam menikmati hasilnya.

Akibat ketidakaktifan masyarakat dalam pelaksanaan kebijakan publik akan menimbulkan gejolak dalam masyarakat yang mengganggu stabilitas nasional, karena kebijakan yang diambil tidak sesuai dengan harapan masyarakat.''',
    "twk-modul-ringkasan-s30": '''## Hakikat Hak Asasi Manusia

### Pengertian HAM

Hak Asasi Manusia (HAM) adalah hak pokok atau hak dasar yang dimiliki manusia sejak lahir sebagai anugerah dari Tuhan Yang Maha Esa.

Menurut UU No. 39 Tahun 1999, hak asasi manusia adalah seperangkat hak yang melekat pada manusia sebagai makhluk Tuhan Yang Maha Esa dan merupakan anugerah yang wajib dihormati, dijunjung tinggi, serta dilindungi oleh negara, hukum, dan
  pemerintah.

### Ruang Lingkup HAM

HAM meliputi hak yang bersifat pokok atau dasar:

- Hak hidup.
- Hak kebebasan atau kemerdekaan.
- Hak memiliki sesuatu.

HAM juga berkembang dalam kehidupan sehari-hari:

- **Hak asasi pribadi**. Contoh: hak memeluk agama, hak mengemukakan pendapat, dan hak berorganisasi.
- **Hak asasi ekonomi**. Contoh: hak memiliki sesuatu, hak membeli dan menjual, serta hak mengadakan suatu perjanjian atau kontrak.
- **Hak asasi politik**. Contoh: hak untuk diakui sebagai warga negara yang sederajat dan hak untuk memilih serta dipilih dalam pemilu.
- **Hak asasi perlakuan yang sama di muka hukum dan pemerintahan.**
- **Hak asasi sosial budaya**. Contoh: hak mendapatkan pendidikan dan hak mengembangkan kebudayaan.''',
    "twk-modul-ringkasan-s32": '''## Instrumen HAM

Instrumen HAM adalah alat yang digunakan untuk melindungi dan menegakkan HAM.

### Instrumen HAM Internasional

- **Deklarasi Universal Hak-Hak Asasi Manusia** (Universal Declaration of Human Rights), disahkan pada tanggal 10 Desember 1948. Deklarasi ini menjadi acuan utama perlindungan HAM di dunia.
- **Piagam PBB**, disahkan pada tahun 1945, menjadi dasar berdirinya Perserikatan Bangsa-Bangsa dan memuat komitmen negara-negara anggota untuk memajukan penghormatan terhadap HAM.
- Berbagai perjanjian HAM internasional lainnya yang telah disahkan dan diterima di Indonesia.

Di Indonesia sendiri, perlindungan HAM diatur dalam UUD 1945 dan berbagai peraturan perundang-undangan.''',
    "twk-modul-ringkasan-s33": '''## Piagam Perlindungan dan Penegakan HAM

Piagam yang memuat perlindungan dan penegakan HAM di dunia internasional (PBB) adalah Universal Declaration of Human Rights, lahir pada 10 Desember 1948.

Berikut piagam yang memuat perlindungan dan penegakan HAM di berbagai negara.

### 1. Inggris

- Magna Charta (Piagam Agung), lahir pada tahun 1215.
- Petition of Rights, lahir pada tahun 1628.
- Habeas Corpus Act, lahir pada tahun 1679.
- Bill of Rights, lahir pada tahun 1689.

### 2. Amerika Serikat

Declaration of Independence of The United States, lahir pada tahun 1776.

### 3. Prancis

Declaration des Droits de l'Homme et du Citoyen, lahir pada tahun 1789.

### 4. Indonesia

Undang-Undang Dasar 1945, lahir pada 18 Agustus 1945.''',
    "twk-modul-ringkasan-s34": '''## Hak Asasi Manusia (HAM) di Indonesia

### Latar Belakang Lahirnya Perundang-undangan tentang HAM di Indonesia

- Adanya komitmen untuk melaksanakan UUD 1945 hasil amandemen.
- Melaksanakan amanat Tap MPR No. XVII/MPR/1998 tentang HAM.
- Pada hakikatnya manusia sebagai makhluk Tuhan yang paling mulia, maka harus mengedepankan nilai kemanusiaan yang adil dan beradab.
- Masih banyak terjadi pelanggaran-pelanggaran HAM dalam kehidupan keluarga, masyarakat, dan negara.
- Desakan masyarakat untuk lebih mengembangkan kehidupan demokratis dengan memberikan kesempatan kepada warga negara dalam menyalurkan hak-hak yang dimilikinya.

### Instrumen HAM di Indonesia

- UUD 1945 Pasal 27, 28, 28A-J, 29 Ayat (2), 30, dan 31.
- Tap MPR No. XVII/MPR/1998 tentang HAM.
- UU No. 39 Tahun 1999 tentang HAM.
- UU No. 26 Tahun 2000 tentang Pengadilan HAM.
- UU No. 13 Tahun 2006 tentang Perlindungan Saksi dan Korban.
- PP No. 3 Tahun 2002 tentang Kompensasi, Restitusi, dan Rehabilitasi terhadap Korban Pelanggaran HAM yang Berat.''',
    "twk-modul-ringkasan-s35": '''## Kasus Pelanggaran HAM di Indonesia

Menurut UU No. 39 Tahun 1999, pelanggaran HAM adalah perbuatan seseorang atau kelompok orang, termasuk aparat negara, baik disengaja maupun karena kelalaian, yang secara hukum melawan, mengurangi, menghalangi, membatasi, dan atau mencabut hak
  seseorang atau kelompok orang yang dijamin oleh UU ini.

### Contoh Kasus Pelanggaran HAM di Indonesia

- Kasus Tanjung Priok tahun 1984 di Jakarta.
- Kasus terbunuhnya aktivis buruh Marsinah tahun 1994 di Nganjuk, Jawa Timur.
- Kasus terbunuhnya wartawan harian umum Bernas, Udin, di Yogyakarta tahun 1996.
- Kasus penembakan mahasiswa Trisakti tahun 1998 di Jakarta.

### Kasus yang Sering Dilaporkan ke Komnas HAM

- Masalah agama.
- Masalah tanah.
- Masalah perburuhan.
- Masalah perbuatan oknum aparat birokrasi yang menyimpang atau tidak terpuji.''',
    "twk-modul-ringkasan-s36": '''## Cara Menangani Pelanggaran HAM

Cara untuk menangani terjadinya pelanggaran HAM, antara lain:

1. Memproses setiap pelanggaran HAM sesuai dengan ketentuan hukum yang berlaku.
2. Komnas HAM melakukan penyelidikan atas dugaan terjadinya pelanggaran HAM.
3. Pelanggaran HAM berat, yaitu genosida dan kejahatan terhadap kemanusiaan, diajukan ke Pengadilan HAM.
4. Memberikan hukuman yang tegas kepada semua pelanggar HAM, dengan maksud memberikan efek jera agar tidak mengulangi perbuatannya.''',
    "twk-modul-ringkasan-s37": '''## Lembaga Perlindungan HAM di Indonesia

### 1. Komisi Nasional Hak Asasi Manusia (Komnas HAM)

**Tujuan Komnas HAM**

Tujuan dibentuknya Komnas HAM menurut UU No. 39 Tahun 1999 Pasal 75 adalah:

- Mengembangkan kondisi yang kondusif bagi pelaksanaan HAM sesuai dengan Pancasila, UUD 1945, Piagam PBB, serta Deklarasi Universal HAM.
- Meningkatkan perlindungan dan penegakan HAM untuk berkembangnya pribadi manusia Indonesia seutuhnya dan kemampuan berpartisipasi dalam berbagai bidang kehidupan.

**Fungsi Komnas HAM**

- Pengkajian dan penelitian tentang HAM.
- Penyuluhan tentang HAM.
- Pemantauan tentang HAM.
- Mediasi tentang HAM.

**Tugas dan Wewenang Komnas HAM**

- Mengamati pelaksanaan HAM kemudian menyusunnya menjadi sebuah laporan.
- Menyelidiki dan memeriksa peristiwa yang timbul dalam masyarakat, berdasarkan sifat dan ruang lingkup yang diduga terdapat pelanggaran HAM.
- Memanggil pihak pengadu atau korban juga pihak yang diadukan, untuk dimintai dan didengar keterangannya.
- Memanggil saksi untuk dimintai dan didengar kesaksiannya.
- Meninjau tempat kejadian atau tempat yang dianggap perlu.
- Memanggil pihak terkait untuk memberikan dan menyerahkan dokumen asli tertulis dengan persetujuan ketua pengadilan.
- Melakukan pemeriksaan terhadap rumah, pekarangan, bangunan, dan tempat lain dengan persetujuan ketua pengadilan.
- Memberikan pendapat berdasarkan persetujuan ketua pengadilan terhadap perkara tertentu yang sedang dalam proses peradilan.

### 2. Pengadilan HAM

Menurut Pasal 104 UU No. 39 Tahun 1999, Pengadilan HAM dibentuk di lingkungan peradilan umum. Pengadilan HAM adalah pengadilan khusus terhadap pelanggaran HAM berat.

**Jenis Pelanggaran HAM Berat**

- **Kejahatan genosida**: setiap perbuatan yang dilakukan dengan maksud menghancurkan atau memusnahkan seluruh atau sebagian kelompok bangsa, ras, etnis, dan agama. Contoh: membunuh anggota kelompok, memaksakan tindakan-tindakan yang bertujuan
  mencegah kelahiran dalam kelompok, dan memindahkan anak-anak secara paksa dari kelompok tertentu ke kelompok lain.
- **Kejahatan terhadap kemanusiaan**: setiap perbuatan yang dilakukan sebagai bagian dari serangan yang meluas dan sistematik yang diketahuinya bahwa serangan tersebut ditujukan secara langsung terhadap penduduk sipil. Contoh: perbudakan,
  pengusiran secara paksa, perampasan kemerdekaan, dan penghilangan orang secara paksa.

**Tugas dan Wewenang Pengadilan HAM**

- Memeriksa dan memutus perkara pelanggaran HAM berat.
- Memeriksa dan memutus perkara pelanggaran HAM berat yang dilakukan di luar batas teritorial wilayah negara RI oleh warga Negara Indonesia.

### 3. Lembaga Bantuan Hukum (LBH)

LBH adalah organisasi independen yang memberi bantuan dan pelayanan hukum kepada masyarakat. Peran dan fungsi LBH sebagai berikut:

- Relawan yang membantu pihak-pihak yang membutuhkan bantuan hukum.
- Pembela dalam menegakkan keadilan dan kebenaran.
- Pembela HAM.
- Penyuluh dan penyebar informasi di bidang hukum dan HAM.

### 4. Biro Konsultasi dan Bantuan Hukum Perguruan Tinggi

Biro konsultasi dan bantuan hukum perguruan tinggi merupakan kantor pusat kegiatan untuk memberikan layanan kepada semua pihak yang ingin berkonsultasi dan meminta bantuan di bidang hukum dan HAM.

Tujuannya:

- Sebagai pelaksanaan program tri dharma perguruan tinggi di bidang hukum dan HAM.
- Sebagai wahana pelatihan, pembelaan, dan penegakan hukum serta HAM.''',
    "twk-modul-ringkasan-s38": '''## Faktor-Faktor yang Mendorong Timbulnya Pergerakan Nasional

### Faktor Intern (dari Dalam)

1. Penderitaan rakyat yang berkepanjangan.
2. Kenangan kejayaan masa lalu.
3. Lahirnya golongan terpelajar.

### Faktor Ekstern (dari Luar)

1. Timbulnya paham-paham baru seperti nasionalisme, demokrasi, liberalisme, dan sosialisme.
2. Kemenangan Jepang atas Rusia pada tahun 1905.
3. Gerakan Turki Muda.
4. Revolusi nasional Cina pada tahun 1911.''',
    "twk-modul-ringkasan-s39": '''## Organisasi Pergerakan Nasional di Indonesia

### 1. Budi Utomo

- Tokoh pelopor: Wahidin Sudirohusodo.
- Lahir: 20 Mei 1908.
- Ketua: dr. Sutomo.

### 2. Sarekat Islam (SI)

- Tokoh pendiri: H. Samanhudi.
- Lahir: di Surakarta pada tahun 1911.
- Organisasi SI semula bernama Sarekat Dagang Islam (SDI). Untuk memperluas gerak usahanya, SDI diubah menjadi SI.
- Pada tahun 1921 SI pecah menjadi dua, yaitu SI Merah pimpinan Semaun dan SI Putih pimpinan H.O.S. Cokroaminoto.

### 3. Indische Partij

- Tokoh pendiri: Tiga Serangkai, yaitu Dr. Douwes Dekker, dr. Cipto Mangunkusumo, dan Suwardi Suryaningrat.
- Lahir: di Bandung, 25 Desember 1912.
- Usaha-usaha yang dilakukan, antara lain:
  - Menerapkan cita-cita kesatuan nasional Indonesia.
  - Berusaha mendapatkan persamaan hak bagi semua orang Indonesia (Hindia).
  - Memperbesar pengaruh pro Hindia (Indonesia) di dalam pemerintahan.
  - Memperbaiki ekonomi rakyat Indonesia dengan memperkuat mereka yang lemah ekonominya.

### 4. Perhimpunan Indonesia (PI)

- Tokoh pendiri: para mahasiswa Indonesia yang ada di Belanda, antara lain R.P. Sosrokartono dan R. Husein Jayadiningrat.
- Kegiatan PI pada mulanya mengadakan pertemuan antaranggota untuk mendiskusikan nasib bangsa. PI menerbitkan majalah Hindia Poetera untuk memuat tulisan para anggotanya.

### 5. Partai Nasional Indonesia (PNI)

- Tokoh pendiri: Ir. Soekarno.
- Lahir: di Bandung pada 4 Juli 1927.
- Pada tahun 1930, para tokoh PNI ditangkap karena kegiatannya dianggap membahayakan kolonialis Belanda.

### 6. Partai Indonesia Raya (Parindra)

- Lahir: 25 Desember 1935.
- Parindra merupakan gabungan dari Budi Utomo dan Persatuan Bangsa Indonesia.
- Usaha-usaha yang dilakukan Parindra, antara lain:
  - Pendidikan kepada rakyat.
  - Menggalang persatuan dan kesatuan bangsa.
  - Meningkatkan kesejahteraan rakyat.''',
    "twk-modul-ringkasan-s40": '''## Lanjutan Organisasi Pergerakan Nasional

### Gerakan Rakyat Indonesia (Gerindo)

- Tokoh pendiri: A.K. Gani, Mr. Moh. Yamin, dan Mr. Amir Syarifudin.
- Lahir: di Jakarta pada 24 Mei 1937.
- Tujuan Gerindo: Indonesia merdeka dengan asas nasionalis dan demokrasi.

### Gabungan Politik Indonesia (GAPI)

- Lahir: 21 Mei 1939.
- GAPI merupakan gabungan dari partai-partai politik yang ada di Indonesia.
- Latar belakang terbentuknya GAPI, yaitu menuntut kemerdekaan Indonesia dari pemerintahan Belanda secara berangsur-angsur dalam jangka waktu 10 tahun.

### Pergerakan Wanita

- Tokoh pelopor: R.A. Kartini. R.A. Kartini memengaruhi kaum wanita untuk memperjuangkan emansipasi. Oleh karena itu, muncullah tokoh-tokoh wanita, antara lain:
  - Dewi Sartika mendirikan "Sekolah Kautamaan Istri" di Bandung, pada 1904.
  - R.A. Sabarudin dan R.A. Sutinah Joyopranoto mendirikan Putri Merdiko.
- Perkembangan dari pergerakan wanita adalah Kongres Wanita Indonesia yang diadakan pada 22-25 Desember 1928 di Yogyakarta. Berdasarkan hasil kongres, terbentuklah Perserikatan Perempuan Indonesia (PPI).

## Pendudukan Militer Jepang di Indonesia

### Awal Masuknya Jepang di Indonesia

Faktor-faktor penyebab Jepang berhasil masuk ke Asia Timur dan Asia Tenggara adalah:

- Jepang berhasil menghancurkan pangkalan Angkatan Laut Amerika Serikat di Pearl Harbour, Hawaii, pada 7 Desember 1941.
- Negara-negara induk (Inggris, Prancis, dan Belanda) sedang menghadapi peperangan di Eropa melawan Jerman.
- Bangsa-bangsa Asia sangat percaya dengan semboyan Jepang "Tiga A": Jepang Pemimpin Asia, Jepang Cahaya Asia, Jepang Pelindung Asia.

### Tujuan Masuknya Jepang di Indonesia

Tujuan awal Jepang masuk ke Indonesia untuk menanamkan kekuasaannya dan menjajah Indonesia.

### Kebijakan Pemerintah Jepang

**Bidang ekonomi**

- Perluasan areal persawahan untuk meningkatkan produksi beras.
- Melakukan pengawasan pertanian dan perkebunan yang bertujuan untuk mengendalikan harga barang.

**Bidang pemerintahan**

- Pemerintahan pendudukan Jepang adalah pemerintahan yang sangat diktator.
- Untuk memudahkan pengawasan, pemerintahan dibagi menjadi beberapa bagian yang bertujuan agar semua daerah dapat dikendalikan untuk kepentingan pemerintahan balatentara Jepang.

**Bidang militer**

- Bangsa Indonesia hampir selalu dilibatkan dalam berbagai organisasi, baik militer maupun semiliter, dengan tujuan bangsa Indonesia mau membantu pemerintahan Jepang dalam usaha untuk memenangkan peperangan melawan Sekutu.
- Beberapa organisasi militer yang dibentuk pemerintahan Jepang sebagai berikut: Seinendan (barisan pemuda), Keibodan (barisan pembantu polisi), Fujinkai (barisan wanita), Heiho (pembantu prajurit Jepang), Syuisyintai (barisan pelopor), Jawa
  Hokokai (perhimpunan kebaktian rakyat Jawa), dan PETA (Pembela Tanah Air).

**Bidang sosial budaya**

- Pada masa pemerintahan Jepang, media massa diawasi dengan ketat.
- Namun demikian, surat kabar dan radio ikut berfungsi memperluas perkembangan bahasa Indonesia.''',
    "twk-modul-ringkasan-s41": '''## Perlawanan Rakyat Indonesia terhadap Jepang

### 1. Perjuangan melalui Organisasi Buatan Jepang

**Memanfaatkan Pusat Tenaga Rakyat (PUTERA)**

- Lahir: 1 Maret 1943.
- Pimpinan: Empat Serangkai, yaitu Ir. Soekarno, Moh. Hatta, Ki Hajar Dewantara, dan K.H. Mas Mansyur.
- Tujuan PUTERA: agar kaum nasionalis dan intelektual menyumbangkan tenaga dan pikirannya untuk kepentingan Jepang. Namun, oleh para pemimpin Indonesia, PUTERA justru dimanfaatkan untuk membela rakyat dari kekejaman Jepang.

**Memanfaatkan Barisan Pelopor (Syuisyintai)**

- Ketua: Ir. Soekarno.
- Kepala sekretariat: Sudiro.
- Anggota: Chaerul Saleh, Asmara Hadi, Sukardjo Wiryopranoto, dan Otto Iskandar Dinata.
- Tujuan: penyalur aspirasi nasionalisme.

**Memanfaatkan Badan Penasihat Pusat (Chuo Sangi In)**

- Lahir: 5 September 1943, atas dasar anjuran Jenderal Hideki Tojo (Perdana Menteri Jepang).
- Ketua: Ir. Soekarno.
- Anggota: 23 orang Jepang dan 20 orang Indonesia.
- Tugas badan ini adalah memberi nasihat atau pertimbangan kepada Seiko Shikikan (penguasa tertinggi militer Jepang di Indonesia). Para pemimpin Indonesia memanfaatkan Chuo Sangi In untuk menggembleng kedisiplinan.

### 2. Perjuangan melalui Organisasi Islam

**Majelis Islam A'la Indonesia (MIAI)**

- Lahir: 21 September 1937.
- Tokoh pelopor: K.H. Mas Mansur, K.H. Wahab Hasbullah, dan Wondoamiseno.
- MIAI merupakan perkumpulan organisasi Islam. Pada masa pendudukan Jepang di Indonesia, organisasi ini tetap diperbolehkan berdiri. Hal ini merupakan pendekatan Jepang terhadap golongan nasionalis Islam agar umat Islam tidak melakukan
  kegiatan-kegiatan politik.

### 3. Perjuangan melalui Gerakan Bawah Tanah

- Gerakan kelompok Sutan Syahrir.
- Gerakan kelompok Amir Syarifuddin.
- Golongan persatuan mahasiswa.
- Kelompok Sukarni.
- Kelompok pemuda Menteng 31.

### 4. Perjuangan Bersenjata

Perjuangan bersenjata adalah perlawanan menggunakan senjata.

**Perlawanan bersenjata yang dilakukan rakyat**

- Perlawanan rakyat di Cot Plieng, Aceh, pada 10 November 1942.
- Perlawanan rakyat di Pontianak pada 16 Oktober 1943.
- Perlawanan rakyat di Singaparna, Jawa Barat, pada 25 Februari 1944.
- Perlawanan rakyat di Cidempet, Indramayu, pada 30 Juli 1944.
- Perlawanan rakyat di Irian Jaya, pada 1944.

**Perlawanan bersenjata yang dilakukan PETA**

- Perlawanan PETA di Blitar, pada 14 Februari 1945.
- Perlawanan PETA di Meureudu, Aceh, pada November 1944.
- Perlawanan PETA di Gumilir, Cilacap, pada April 1945.''',
    "twk-modul-ringkasan-s42": '''## Badan Penyelidik Usaha-Usaha Persiapan Kemerdekaan Indonesia (BPUPKI)

### Alasan Jepang Membentuk BPUPKI

Pada akhir 1944, posisi Jepang di berbagai kawasan mulai terdesak. Keadaan ini terjadi karena beberapa hal sebagai berikut:

- Jepang terus-menerus mengalami kekalahan dari serbuan Sekutu dalam Perang Pasifik.
- Perlawanan yang dilakukan oleh rakyat Indonesia dan tentara PETA.
- Pada 17 Juli 1944, Perdana Menteri Hideki Tojo meletakkan jabatan dan diganti oleh Jenderal Kuniaki Koiso.

Tugas utama perdana menteri baru (Jenderal Kuniaki Koiso) adalah memulihkan kewibawaan Jepang di hadapan bangsa-bangsa Asia yang baru saja dibebaskan oleh Jepang dari cengkeraman imperialis Eropa. Langkah politik Perdana Menteri Koiso terhadap
  Indonesia, antara lain:

- Menjanjikan kemerdekaan Indonesia di depan parlemen Jepang.
- Bendera merah putih boleh dikibarkan berdampingan dengan bendera Jepang.

Jepang memberikan janji tersebut agar rakyat Indonesia tidak mengadakan perlawanan terhadap Jepang.

Pada 1 Maret 1945, diumumkan pembentukan Badan Penyelidik Usaha-Usaha Persiapan Kemerdekaan Indonesia (BPUPKI) atau dalam bahasa Jepangnya Dokuritsu Junbi Cosakai.

### Peresmian BPUPKI

- BPUPKI berdiri secara resmi pada 28 Mei 1945.
- Ketua: K.R.T. Radjiman Wediodiningrat.
- Anggota: 67 orang yang terdiri dari tokoh-tokoh utama pergerakan nasional Indonesia dari berbagai daerah dan aliran.

### Sidang BPUPKI

Sidang BPUPKI diselenggarakan untuk menyusun dasar dan konstitusi Negara Indonesia.

**Sidang I: 29 Mei sampai 1 Juni 1945**

Tujuan: merumuskan dasar negara Indonesia.

- Pada 29 Mei 1945 Muh. Yamin mengemukakan lima asas dasar negara kebangsaan Republik Indonesia, yaitu: Peri kebangsaan, Peri kemanusiaan, Peri ketuhanan, Peri kerakyatan, dan Kesejahteraan rakyat.
- Pada 31 Mei 1945 Prof. Dr. Mr. Soepomo menyampaikan dasar-dasar untuk Indonesia merdeka, yaitu: Persatuan, Kekeluargaan, Keseimbangan lahir batin, Musyawarah, dan Keadilan rakyat.
- Pada 1 Juni 1945 Ir. Soekarno mengemukakan lima rumusan dasar Negara Indonesia merdeka, yaitu: Kebangsaan Indonesia, Internasionalisme atas perikemanusiaan, Mufakat dan demokrasi, Kesejahteraan sosial, dan Ketuhanan Yang Maha Esa.

BPUPKI membentuk panitia kecil yang dikenal Panitia Sembilan, terdiri dari:

- Ketua: Ir. Soekarno.
- Anggota: Drs. Moh. Hatta, Muh. Yamin, Ahmad Soebarjo, A.A. Maramis, Abdulkahar Muzakkir, Wahid Hasyim, Haji Agus Salim, dan Abikusno Cokrosuyoso.

Pada 22 Juni 1945 Ir. Soekarno melaporkan hasil kerja Panitia Sembilan yang memuat rancangan asas dan tujuan Indonesia merdeka. Dokumen laporan tersebut dikenal dengan nama Piagam Jakarta. Rumusan dasar Negara Indonesia merdeka berdasarkan
  Piagam Jakarta sebagai berikut:

1. Ketuhanan dengan kewajiban menjalankan syariat Islam bagi pemeluk-pemeluknya.
2. Kemanusiaan yang adil dan beradab.
3. Persatuan Indonesia.
4. Kerakyatan yang dipimpin oleh hikmah kebijaksanaan dalam permusyawaratan perwakilan.
5. Keadilan sosial bagi seluruh rakyat Indonesia.

**Sidang II: 10 sampai 17 Juli 1945**

Tujuan: membahas rencana undang-undang dasar, termasuk pembukaan atau preambulenya, oleh Panitia Perancangan Undang-Undang Dasar yang diketuai oleh Ir. Soekarno.

Hasil keputusan sidang II:

1. Rancangan Hukum Dasar Negara Indonesia Merdeka.
2. Piagam Jakarta menjadi pembukaan Hukum Dasar itu.

Pembukaan Hukum Dasar diambil dari Piagam Jakarta dengan beberapa perubahan sebagai berikut:

- Pada alinea ke-4, perkataan "Hukum Dasar" diganti dengan "Undang-Undang Dasar".
- Kalimat "berdasarkan kepada ketuhanan, dengan kewajiban menjalankan syariat Islam bagi pemeluk-pemeluknya menurut dasar kemanusiaan yang adil dan beradab" diganti dengan "berdasarkan kepada Ketuhanan Yang Maha Esa, Kemanusiaan yang adil dan
  beradab".
- Di antara kata "Permusyawaratan perwakilan" dalam Undang-Undang Dasar ditambah dengan garis miring (/).''',
    "twk-modul-ringkasan-s43": '''## Panitia Persiapan Kemerdekaan Indonesia (PPKI)

### Pembentukan PPKI

Pada 7 Agustus 1945 BPUPKI dibubarkan. Sebagai gantinya, dibentuk Panitia Persiapan Kemerdekaan Indonesia (PPKI) atau dalam bahasa Jepangnya Dokuritsu Junbi Inkai.

- Ketua: Ir. Soekarno.
- Wakil: Drs. Mohammad Hatta.
- Penasihat: Ahmad Subardjo.

Pada 9 Agustus 1945, Ir. Soekarno, Drs. Moh. Hatta, dan Dr. Radjiman Wediodiningrat dipanggil menghadap Marsekal Terauchi di Dalat, Vietnam. Hasil pertemuan tersebut sebagai berikut:

- Pemerintah Jepang memutuskan untuk memberi kemerdekaan kepada Indonesia.
- Untuk pelaksanaan kemerdekaan telah dibentuk PPKI.
- Pelaksanaan kemerdekaan segera setelah persiapan selesai dan berangsur-angsur dimulai dari Pulau Jawa kemudian pulau-pulau lain.
- Wilayah Indonesia akan meliputi seluruh bekas wilayah Hindia Belanda.

### Perbedaan Pandangan antarkelompok Pejuang

Setelah Jepang mengalami kekalahan di berbagai kawasan, muncul perbedaan antarkelompok pejuang mengenai masalah proklamasi Kemerdekaan Indonesia.

- **Kelompok pejuang senior (golongan tua)**: anggota PPKI dipimpin oleh Ir. Soekarno dan Drs. Moh. Hatta berpendapat bahwa proklamasi kemerdekaan harus dipersiapkan secara matang dan harus dibicarakan dalam rapat PPKI terlebih dahulu.
- **Kelompok pemuda (golongan muda)**: kelompok pejuang bawah tanah yang dipimpin oleh Sutan Syahrir dan kelompok pemuda yang dipimpin oleh Chaerul Saleh berpendapat proklamasi kemerdekaan harus dilaksanakan secepat mungkin tanpa menunggu rapat
  PPKI yang dibentuk oleh Jepang.

Pada 15 Agustus 1945, pihak pemuda mendesak Ir. Soekarno dan Drs. Moh. Hatta memproklamasikan kemerdekaan pada 16 Agustus 1945, tetapi Ir. Soekarno dan Drs. Moh. Hatta menolak usulan kelompok pemuda yang dipimpin oleh Wikana dan Darwis. Tidak
  adanya kesepakatan antara kelompok pejuang senior dengan kelompok pejuang muda menyebabkan kelompok pejuang muda mengamankan Ir. Soekarno dan Drs. Moh. Hatta keluar dari Jakarta. Para pemuda beranggapan kedua tokoh tersebut telah dipengaruhi
  oleh pihak Jepang.

### Sidang PPKI

PPKI mengadakan sidang-sidang untuk melengkapi syarat terbentuknya negara serta upaya memenuhi kelengkapan pemerintahan yang diperlukan.

**Sidang PPKI I: 18 Agustus 1945**

- Pimpinan sidang: Soekarno dan Hatta.
- Anggota: 27 orang.
- Hasil keputusan sidang:
  1. Mengesahkan dan menetapkan Undang-Undang Dasar Republik Indonesia.
  2. Memilih dan menetapkan Ir. Soekarno sebagai presiden dan Drs. Moh. Hatta sebagai wakil presiden.
  3. Rencana pembentukan Komite Nasional Indonesia yang akan membantu tugas presiden.

**Sidang PPKI II: 19 Agustus 1945**

Hasil keputusan sidang:

1. Menetapkan 12 kementerian sebagai pembantu presiden.
2. Menetapkan wilayah Indonesia menjadi 8 provinsi dan menunjuk para gubernurnya.
3. Diusulkan kepada Presiden Republik Indonesia untuk membentuk tentara kebangsaan.

**Sidang PPKI III: 22 Agustus 1945**

Hasil keputusan sidang:

1. Membentuk Komite Nasional Indonesia.
2. Membentuk PNI sebagai satu-satunya partai di Indonesia (tetapi kemudian dibatalkan).
3. Membentuk Badan Keamanan Rakyat (BKR).''',
    "twk-modul-ringkasan-s44": '''## Peristiwa Rengasdengklok

Peristiwa Rengasdengklok adalah peristiwa yang diawali oleh adanya perbedaan pandangan antara kelompok muda dengan kelompok tua tentang waktu dan cara pelaksanaan proklamasi. Rengasdengklok adalah nama daerah yang berada di sebelah utara
  Karawang, Jawa Barat.

Alasan memilih Rengasdengklok karena Rengasdengklok menjadi satu-satunya daerah yang bebas dari kekuasaan Jepang serta letaknya yang jauh dari Jakarta.

Arti peristiwa Rengasdengklok adalah bukti adanya keinginan semua pihak untuk hidup merdeka.

### Tokoh yang Terkait dalam Peristiwa Rengasdengklok

- **Golongan tua**: Ir. Soekarno, Drs. Moh. Hatta, dan Ahmad Soebardjo.
- **Golongan muda**: Sudanco Singgih, Yusuf Kunto, Sukarni, Sudanco Subeno, dan Iwa Kusumasumantri.

## Arti Penting Proklamasi Kemerdekaan Indonesia

Proklamasi merupakan puncak kesadaran berbangsa dan cita-cita kemerdekaan sejak lahirnya Boedi Utomo 1908. Proklamasi bukan akhir perjuangan, tetapi awal perjuangan untuk mempertahankan kemerdekaan dalam bentuk pemerintahan yang berdaulat.

## Kronologi Proklamasi Kemerdekaan Indonesia

### 1. Perumusan Naskah Proklamasi Kemerdekaan

- Tempat perumusan: rumah Laksamana Maeda di Jalan Imam Bonjol No. 1 Jakarta.
- Tokoh-tokoh penyusun naskah proklamasi: Ir. Soekarno, Drs. Moh. Hatta, dan Ahmad Soebardjo.
- Tokoh-tokoh saksi penyusunan naskah proklamasi: Sudiro, B.M. Diah, dan Sukarni.
- Tokoh pengetik naskah proklamasi: Sayuti Melik.
- Tokoh yang menandatangani naskah proklamasi: Ir. Soekarno dan Drs. Moh. Hatta. Atas usul Sukarni, naskah proklamasi ditandatangani oleh Ir. Soekarno dan Drs. Moh. Hatta atas nama bangsa Indonesia.

### 2. Upacara Proklamasi Kemerdekaan

Awalnya, sesuai kesepakatan, teks Proklamasi Kemerdekaan Indonesia akan dibacakan pada 17 Agustus 1945 di Lapangan Ikada, namun ternyata pasukan Jepang telah mengepung lapangan itu.

Kemudian, pembacaan teks Proklamasi Kemerdekaan diselenggarakan di rumah Ir. Soekarno, Jalan Pegangsaan Timur No. 56, Jakarta, untuk menghindari bentrokan antara rakyat dan pasukan Jepang. Proses proklamasi dilaksanakan pada pukul 10.00 WIB.

### 3. Penyebaran Berita Proklamasi Kemerdekaan

Berita proklamasi kemerdekaan disebarluaskan melalui:

- Kantor berita Domei.
- Radio.
- Kawat telepon.
- Surat kabar.
- Utusan (kurir) ke berbagai daerah.
- Pamflet, poster, dan coretan-coretan pada tembok.

### 4. Proses Pembentukan Negara dan Pemerintahan Republik Indonesia

Unsur-unsur yang harus dilengkapi bagi berdirinya negara baru adalah:

- Rakyat.
- Wilayah.
- Pemerintahan yang berdaulat.
- Pengakuan dari negara lain. Indonesia memperoleh pengakuan dari negara lain pertama kali, yaitu Mesir.''',
    "twk-modul-ringkasan-s45": '''## Konflik Indonesia dengan Belanda

Faktor penyebab konflik Indonesia-Belanda adalah kedatangan tentara Sekutu dan NICA.

- Pada 14 Agustus 1945 Jepang menyerah kepada Sekutu. Hal ini menunjukkan secara de jure (berdasarkan hukum) wilayah jajahan Jepang dikuasai Sekutu sebagai pihak yang menang dalam Perang Dunia II.
- Pada 29 September 1945 pasukan Sekutu mendarat di Indonesia dengan tugas melucuti tentara Jepang. Namun, komando pertahanan Sekutu di Asia Tenggara, yaitu South East Asia Command (SEAC), membentuk suatu komando khusus yang diberi nama Allied
  Forces Netherlands East Indies (AFNEI) di bawah pimpinan Letnan Jenderal Sir Philip Christison. AFNEI memiliki tugas utama mengambil alih Indonesia dari tangan Jepang.
- Karena Sekutu secara diam-diam membawa orang-orang Netherlands Indies Civil Administration (NICA) atau pegawai-pegawai Belanda, bangsa Indonesia curiga dan akhirnya menimbulkan permusuhan. NICA berupaya menegakkan kembali kekuasaannya di
  Indonesia dengan cara mempersenjatai kembali Koninklijk Nederlandsch Indisch Leger (KNIL). KNIL adalah tentara kerajaan Belanda yang ditempatkan di Indonesia. Orang-orang NICA dan KNIL yang berada di Jakarta, Surabaya, dan Bandung mengadakan
  provokasi sehingga memancing kerusuhan.

## Pengaruh Konflik Indonesia-Belanda

### Terbentuknya Negara-Negara Bagian

Belanda menghendaki sebanyak mungkin negara bagian dalam RIS sebagai negara bonekanya. Negara-negara yang dibentuk Belanda sebagai berikut:

- Negara Indonesia Timur (Sulawesi, Nusa Tenggara, dan Maluku).
- Negara Sumatra Timur.
- Negara Madura.
- Negara Pasundan.
- Negara Sumatra Selatan.
- Negara Jawa Timur.

### Perjuangan Kembali ke Negara Republik Indonesia

Pada 17 Agustus 1950, bangsa Indonesia kembali ke bentuk Negara Kesatuan Republik Indonesia. Presiden Soekarno menandatangani rancangan undang-undang yang dikenal dengan UUDS pada 15 Agustus 1950.

## Perjuangan Rakyat Indonesia di Berbagai Daerah

### 1. Pertempuran Surabaya

Pada awalnya, pemerintah Jawa Timur tidak mau menerima kedatangan Sekutu, namun akhirnya ada kesepakatan sebagai syarat Sekutu Inggris diperbolehkan memasuki kota Surabaya, yaitu:

- Inggris berjanji tidak mengikutsertakan angkatan perang Belanda.
- Menjalin kerja sama antara Inggris dengan Indonesia untuk menciptakan keamanan dan perdamaian.
- Akan dibentuk kontak biro agar kerja sama berjalan lancar.
- Inggris hanya akan melucuti senjata Jepang.

Ternyata, pada pelaksanaannya Inggris mengingkari kesepakatan tersebut:

- Pada 26 Oktober 1945, Inggris melakukan penyergapan ke penjara Kalisosok.
- Inggris menyebarkan pamflet yang berisi perintah agar rakyat Surabaya menyerahkan senjata mereka. Rakyat Surabaya meresponsnya dengan mengangkat senjata melawan Sekutu Inggris pada 27 Oktober 1945.

Untuk menghindari kontak senjata yang meluas, Presiden Soekarno mengadakan perundingan dengan Jenderal D.C. Hawthorn. Namun, hasil perundingan tersebut dilanggar kembali oleh Sekutu Inggris. Akhirnya, kontak senjata tidak dapat dihindari dan
  kembali meletus pada 10 November 1945 yang dikenal sebagai Pertempuran Surabaya. Pada pertempuran tersebut, Bung Tomo melalui siaran radio berpidato untuk membangkitkan semangat juang arek-arek Surabaya.

### 2. Pertempuran Ambarawa

Penyebab Pertempuran Ambarawa adalah kedatangan tentara Sekutu di Semarang, yang pada awalnya bertujuan untuk mengurus tawanan perang. Namun, secara diam-diam Sekutu yang diboncengi NICA telah mempersenjatai para bekas tawanan perang di Ambarawa
  dan Magelang sehingga pecahlah Pertempuran Ambarawa antara TKR dengan tentara Sekutu pada 21 November sampai 15 Desember 1945.

### 3. Pertempuran Medan Area

Pemicu Pertempuran Medan Area adalah ketika lencana merah putih diinjak-injak oleh tamu di sebuah hotel. Para pemuda kemudian menyerbu hotel tersebut sehingga mengakibatkan banyak korban luka-luka. Pertempuran pertama kali pecah pada 13 Oktober
  1945. Bentrokan antara tentara Sekutu dengan rakyat kemudian menjalar ke seluruh Kota Medan, yang dikenal dengan nama Pertempuran Medan Area.

## Perjuangan Bangsa Indonesia Merebut Irian Barat

Konflik Indonesia-Belanda kembali memanas dalam hal perebutan Irian Barat. Merujuk pada salah satu keputusan dalam Konferensi Meja Bundar (KMB) yang diselenggarakan pada 23 Agustus sampai 2 November 1949, kedudukan Irian Barat akan ditentukan
  selambat-lambatnya satu tahun setelah pengakuan kedaulatan.

Namun nyatanya setelah ditunggu bertahun-tahun, Belanda tidak juga mau membicarakannya. Oleh karena itu, bangsa Indonesia memutuskan untuk berjuang merebut Irian Barat kembali melalui jalur konfrontasi dan jalur diplomasi.

### Jalur Konfrontasi

Perjuangan melalui konfrontasi dilakukan dengan cara konfrontasi politik, ekonomi, dan militer.

- Pada 19 Desember 1961 Presiden Soekarno mengeluarkan komando yang terkenal sebagai Tri Komando Rakyat (Trikora) dalam suatu rapat raksasa di Yogyakarta. Isi Trikora:
  1. Gagalkan pembentukan Negara Papua buatan Belanda kolonial.
  2. Kibarkan sang merah putih di Irian Barat, tanah air Indonesia.
  3. Bersiaplah untuk mobilisasi umum untuk mempertahankan kemerdekaan dan kesatuan tanah air dan bangsa.
- Dengan dikeluarkannya Trikora, mulailah konfrontasi total yang bersifat menyeluruh terhadap Belanda.
- Pada Januari 1962 pemerintah membentuk Komando Mandala Pembebasan Irian Barat yang berkedudukan di Makassar. Panglima Komando Mandala: Mayor Jenderal Soeharto.
- Operasi-operasi yang direncanakan Komando Mandala di Irian Barat dibagi dalam tiga fase, yaitu fase infiltrasi (sampai akhir 1962), fase eksploitasi (mulai awal 1963), dan fase konsolidasi (awal 1964).

### Jalur Diplomasi

Kesungguhan Indonesia merebut kembali Irian Barat mengundang simpati diplomat Amerika Serikat (AS) untuk mengusulkan rencana penyelesaian masalah Irian Barat. Atas desakan Amerika Serikat, Belanda menerima dan menandatangani Persetujuan New York
  pada 15 Agustus 1962. Isi Perjanjian New York sebagai berikut:

1. Pemerintah Belanda akan menyerahkan Irian Barat kepada penguasa pelaksana sementara PBB, yaitu United Nations Temporary Executive Authority (UNTEA), pada 1 Oktober 1962.
2. Pada 1 Oktober 1962, bendera PBB akan berkibar di Irian Barat, berdampingan dengan bendera Belanda yang selanjutnya akan diturunkan pada 31 Desember 1962 untuk digantikan oleh bendera Indonesia mendampingi bendera PBB.
3. Pemerintah UNTEA berakhir pada 1 Mei 1963 dan pemerintahan selanjutnya diserahkan kepada pihak Indonesia.
4. Pemulangan orang-orang sipil dan militer Belanda harus sudah selesai pada 1 Mei 1963.
5. Rakyat Irian Barat diberi kesempatan untuk menyatakan pendapatnya tetap dalam wilayah RI atau memisahkan diri dari RI.

Wujud nyata dari pelaksanaan Persetujuan New York adalah diselenggarakannya Pepera. Hasil Pepera disetujui PBB pada 19 November 1969 dan membuktikan bahwa Irian Barat tetap bagian dari Republik Indonesia.

## Pemilihan Umum (Pemilu) Tahun 1955

Pemilu di Indonesia diselenggarakan pertama kali pada tahun 1955, dalam dua gelombang sebagai berikut:

- **Gelombang I**: dilaksanakan pada 29 September 1955, agendanya memilih anggota-anggota Dewan Perwakilan Rakyat (DPR).
- **Gelombang II**: dilaksanakan pada 15 Desember 1955, agendanya memilih anggota-anggota Konstituante (badan pembuat UUD).

Tugas Konstituante adalah menyusun atau merumuskan rancangan Undang-Undang Dasar. Dalam pelaksanaannya, Indonesia dibagi dalam 16 daerah pemilihan yang meliputi 208 kabupaten, 2.139 kecamatan, dan 43.429 desa.

Pemilu tahun 1955 diikuti banyak partai politik, organisasi, maupun perorangan (independen). Empat partai dengan kursi terbanyak di DPR:

- Fraksi PNI beranggotakan 57 orang.
- Fraksi Masyumi beranggotakan 57 orang.
- Fraksi NU beranggotakan 45 orang.
- Fraksi PKI beranggotakan 39 orang.

Seluruh anggota DPR hasil Pemilu tersebut berjumlah 257 orang yang dipilih, sedangkan anggota Konstituante berjumlah 542 orang.

## Dekret Presiden 5 Juli 1959

Konstituante (badan pembuat UUD) hasil Pemilu 1955 ternyata sampai tahun 1958 belum berhasil menyusun atau merumuskan rancangan Undang-Undang Dasar. Oleh karena itu, Konstituante dianggap gagal menetapkan UUD.

Pada 5 Juli 1959, Presiden Soekarno mengeluarkan dekret yang diumumkan di Istana Merdeka yang dinamakan Dekret Presiden 5 Juli 1959. Isi Dekret Presiden adalah:

1. Pembubaran Konstituante.
2. Pemberlakuan kembali UUD 1945 dan tidak berlakunya UUDS 1950.
3. Pembentukan MPRS dan DPAS dalam waktu yang sesingkat-singkatnya.

## Kehidupan Politik Nasional dan Daerah Setelah Kemerdekaan

Indonesia mengalami berbagai situasi sebagai dampak dari keadaan politik nasional sejak diakuinya kedaulatan RI tanggal 27 Desember 1949 sampai tahun 1960. Beberapa hal yang menjadi persoalan adalah:

### Hubungan Pemerintah Pusat dan Daerah Kurang Harmonis

Hal ini disebabkan oleh masalah otonomi serta perimbangan keuangan antara pusat dan daerah. Akhir tahun 1956 beberapa panglima militer di berbagai daerah membentuk dewan-dewan yang ingin memisahkan diri dari pemerintah pusat, antara lain:

- Di Padang, Sumatra Barat: Dewan Banteng, pimpinan Letnan Kolonel Achmad Husein.
- Di Medan, Sumatra Utara: Dewan Gajah, pimpinan Kolonel Simbolon.
- Di Sumatra Selatan: Dewan Garuda, pimpinan Kolonel Barlian.
- Di Manado, Sulawesi Utara: Dewan Manguni, pimpinan Kolonel Ventje Samual.

### Persaingan Ideologi

Sejak tahun 1950 persaingan antara kelompok Islam dan kelompok nasionalis mulai terlihat. Ciri-cirinya:

- Partai-partai politik terpecah-pecah dalam berbagai ideologi yang sukar dipertemukan dan hanya mementingkan golongannya sendiri.
- Pada saat itu, kabinet yang berkuasa silih berganti hanya dalam waktu singkat, yaitu tahun 1950-1955. Terdapat empat kabinet yang memerintah, antara lain:
  - Kabinet Natsir, masa kerja 6 September 1950 sampai 20 Maret 1951.
  - Kabinet Sukiman, masa kerja 26 April 1951 sampai Februari 1952.
  - Kabinet Wilopo, masa kerja April 1952 sampai 2 Juni 1953.
  - Kabinet Ali Sastroamidjojo I, masa kerja 31 Juli 1953 sampai 24 Juli 1955.''',
    "twk-modul-ringkasan-s46": '''## Pemberontakan di Daerah

Berikut beberapa pemberontakan yang pernah terjadi di daerah.

1. Pemberontakan Angkatan Perang Ratu Adil (APRA) di Bandung, pada 23 Januari 1950.
2. Pemberontakan Andi Azis di Makassar, pada 5 April 1950.
3. Pemberontakan Republik Maluku Selatan (RMS) di Ambon, pada 25 April 1950.
4. Pemberontakan Perjuangan Rakyat Semesta (Permesta) di Indonesia bagian timur, pada 2 Maret 1957.
5. Pemberontakan Pemerintah Revolusioner Republik Indonesia (PRRI) di Sumatra, pada 15 Februari 1958.

## Peristiwa Madiun (Pemberontakan PKI)

- Pemberontakan PKI di Madiun merupakan pengkhianatan terhadap bangsa Indonesia.
- Pemimpin: Amir Syarifudin dan Musso.
- Tujuan: meruntuhkan pemerintah RI untuk kemudian diganti dengan pemerintah yang berdasar paham komunis.
- Pada 18 September 1948 PKI berhasil menguasai Madiun dan sekitarnya kemudian mengumumkan berdirinya Soviet Republik Indonesia.
- Dalam usaha mengatasi keadaan, Panglima Jenderal Sudirman segera memerintahkan kepada Kolonel Gatot Soebroto di Jawa Tengah dan Kolonel Soengkono di Jawa Timur agar mengerahkan kekuatan TNI dan polisi untuk menumpas kaum pemberontak.
- Pada 30 September 1948 seluruh kota Madiun dapat direbut kembali oleh TNI. Musso yang melarikan diri ke luar kota dapat dikejar dan ditembak TNI, sedangkan Amir Syarifuddin tertangkap lalu dihukum mati.

## Peristiwa G 30 S/PKI

Pada awal tahun 1960, kondisi ekonomi begitu memprihatinkan dan kondisi sosial politik penuh gejolak. Memanfaatkan situasi tersebut PKI berusaha menyusun kekuatan dan melakukan pemberontakan.

Puncak ketegangan politik terjadi secara nasional pada dini hari 30 September 1965, yaitu terjadinya penculikan dan pembunuhan terhadap para perwira Angkatan Darat di bawah pimpinan Letnan Kolonel Untung. Para perwira TNI AD yang diculik dan
  dibunuh oleh sekelompok G 30 S/PKI dikenal dengan nama pahlawan revolusi. Berikut daftar nama pahlawan revolusi:

- Letnan Jenderal Ahmad Yani.
- Mayor Jenderal R. Suprapto.
- Mayor Jenderal M.T. Haryono.
- Mayor Jenderal S. Parman.
- Brigadir Jenderal D.I. Panjaitan.
- Brigadir Jenderal Sutoyo Siswomiharjo.
- Letnan Satu Pierre Andreas Tendean.

Peristiwa pembunuhan oleh G 30 S/PKI juga terjadi di Yogyakarta, yang mengakibatkan gugurnya dua orang perwira TNI AD, yaitu Kolonel Katamso dan Letnan Kolonel Sugiyono.

Dalam peristiwa tersebut, Jenderal Abdul Haris Nasution berhasil meloloskan diri dari pembunuhan. Akan tetapi, puteri beliau yang bernama Ade Irma Nasution tewas akibat tembakan para penculik.

Sebagai reaksi dari pemberontakan ini Presiden Soekarno memberi tugas kepada Mayor Jenderal Soeharto yang pada saat itu menjabat sebagai Panglima Kostrad, untuk memimpin operasi penumpasan terhadap Gerakan 30 September. Tindakan-tindakan yang
  dilakukannya adalah:

- Pada 1 Oktober 1965 berhasil merebut kembali RRI dan Kantor Telekomunikasi.
- Pada 2 Oktober 1965 operasi yang dilakukan oleh RPKAD di bawah pimpinan Kolonel Sarwo Edhi Wibowo berhasil menguasai beberapa tempat penting termasuk daerah sekitar Bandara Halim Perdanakusuma yang menjadi pusat kegiatan Gerakan 30 September.
- Pada 3 Oktober 1965 dilakukan operasi pembersihan di daerah Lubang Buaya. Atas petunjuk seorang anggota polisi, akhirnya ditemukan sebuah sumur tua tempat jenazah para perwira Angkatan Darat dikuburkan.

## Peristiwa DI/TII

### Pemberontakan DI/TII di Jawa Barat

- Pada 7 Agustus 1949 di Tasikmalaya, Jawa Barat, Kartosuwiryo memproklamasikan berdirinya Negara Islam Indonesia.
- Gerakannya dinamakan Darul Islam (DI), sedangkan tentaranya dinamakan Tentara Islam Indonesia (TII). Pemberontakan ini dikenal dengan nama Pemberontakan DI/TII.
- Gerakan ini dibentuk saat Jawa Barat ditinggal oleh pasukan Siliwangi yang berhijrah ke Yogyakarta dan Jawa Tengah.
- Dalam menghadapi aksi DI/TII, pemerintah mengerahkan pasukan TNI untuk menumpas gerakan ini. Pasukan Siliwangi bersama rakyat melakukan operasi "Pagar Betis" dan operasi "Bratayudha".
- Pada 4 Juni 1962 Kartosuwiryo beserta para pengawalnya dapat ditangkap oleh pasukan Siliwangi dalam operasi "Bratayudha" di Gunung Geber, daerah Majalaya, Jawa Barat.

### Pemberontakan DI/TII di Jawa Tengah

- Pemimpin: Amir Fatah.
- Wilayah: Brebes, Tegal, dan Pekalongan.
- Pada Januari 1950 pemerintah melakukan operasi kilat yang disebut Gerakan Banteng Negara (GBN) untuk menumpas pemberontakan ini, di bawah pimpinan Letnan Kolonel Sarbini.

### Pemberontakan DI/TII di Aceh

- Pimpinan: Teuku Daud Beureuh.
- Latar belakang: Daud Beureuh merasa kecewa karena status Aceh pada 1950 diturunkan dari daerah istimewa menjadi karesidenan di bawah Provinsi Sumatra Utara.
- Semula pemerintah menggunakan kekuatan senjata dalam menghadapi pemberontakan ini. Selanjutnya atas prakarsa Kolonel M. Yasin yang menjabat sebagai Pangdam I/Iskandar Muda, pada 17-21 Desember 1962 diselenggarakan "Musyawarah Kerukunan Rakyat
  Aceh" yang mendapat dukungan tokoh-tokoh masyarakat Aceh sehingga pemberontakan dapat dipadamkan.

### Pemberontakan DI/TII di Sulawesi Selatan

- Pimpinan: Kahar Muzakkar.
- Latar belakang: pada 30 April 1950, Kahar Muzakkar menuntut kepada pemerintah agar pasukannya dimasukkan ke dalam Angkatan Perang RIS (APRIS). Tuntutan ini ditolak karena harus melalui penyaringan.
- Untuk menghadapi pemberontakan DI/TII di Sulawesi Selatan ini, pemerintah melakukan operasi militer. Pada Februari 1965 Kahar Muzakkar berhasil ditangkap dan ditembak mati.

### Pemberontakan DI/TII di Kalimantan Selatan

- Pimpinan: Ibnu Hajar.
- Pada awalnya pemerintah memberi kesempatan kepada Ibnu Hajar untuk menyerah. Akan tetapi setelah menyerah, Ibnu Hajar melarikan diri dan melakukan pemberontakan lagi.
- Selanjutnya, pemerintah mengerahkan pasukan TNI sehingga akhir tahun 1959, Ibnu Hajar beserta seluruh anggota gerombolannya tertangkap.

## Peristiwa Politik Penting pada Masa Orde Baru

### Tri Tuntutan Rakyat (Tritura)

Latar belakang:

- Sikap pemerintah yang tidak tegas terhadap PKI yang telah melakukan pengkhianatan terhadap negara.
- Kondisi ekonomi yang memburuk.

Hal-hal di atas melatarbelakangi munculnya kesatuan-kesatuan aksi. Pada 10 Januari 1966 Kesatuan Aksi Mahasiswa Indonesia (KAMI) dan Kesatuan Aksi Pemuda Pelajar Indonesia (KAPPI) memelopori kesatuan-kesatuan aksi untuk menuntut Tiga Tuntutan
  Hati Nurani Rakyat yang terkenal dengan Tri Tuntutan Rakyat (Tritura). Isi Tritura sebagai berikut:

1. Pembubaran PKI.
2. Pembersihan kabinet dari unsur-unsur G 30 S/PKI.
3. Penurunan harga dan perbaikan ekonomi.

### Surat Perintah Sebelas Maret (Supersemar)

Pada 11 Maret 1966 Presiden Soekarno menyetujui memberikan perintah kepada Letnan Jenderal Soeharto untuk memulihkan keadaan dan wibawa pemerintah. Surat mandat ini diberikan di Istana Bogor dan dikenal dengan nama Surat Perintah Sebelas Maret
  1966 (Supersemar).

### Sidang Umum MPRS

Sidang Umum IV MPRS diselenggarakan pada 20 Juni sampai 5 Juli 1966 dan menghasilkan beberapa ketetapan yang dapat memperkokoh tegaknya Orde Baru, yaitu:

- Ketetapan MPRS No. IX tentang pengukuhan Surat Perintah Sebelas Maret.
- Ketetapan MPRS No. XXV tentang pembubaran PKI dan ormas-ormasnya serta larangan penyebaran ajaran Marxisme Komunisme di Indonesia.
- Ketetapan MPRS No. XXIII tentang pembaruan landasan kebijakan ekonomi, keuangan, dan pembangunan.
- Ketetapan MPRS No. XIII tentang pembentukan Kabinet Ampera yang ditugaskan kepada Pengemban Tap MPRS No. IX.

### Nawaksara

- MPRS meminta pertanggungjawaban Presiden Soekarno dalam Sidang Umum MPRS 1966 atas terjadinya Pemberontakan G 30 S/PKI, kemerosotan ekonomi dan moral.
- Presiden Soekarno menyampaikan amanatnya pada 22 Juni 1966 yang berjudul Nawaksara (sembilan pasal).
- Amanat tersebut oleh MPRS dipandang tidak memenuhi harapan rakyat karena tidak memuat secara jelas kebijaksanaan presiden.''',
    "twk-modul-ringkasan-s47": '''## Lanjutan Peristiwa Politik pada Masa Orde Baru

### Penyerahan Kekuasaan Presiden Soekarno

Pada 22 Februari 1967 Presiden Soekarno menyerahkan kekuasaan kepada Pengemban Ketetapan MPRS No. IX, yaitu Jenderal Soeharto.

### Pemilihan Umum (Pemilu)

Pemilihan umum pertama pada masa Orde Baru dilaksanakan pada 3 Juli 1971. Diikuti oleh 10 partai, yaitu Golongan Karya (Golkar), Nahdlatul Ulama (NU), Parmusi, Parkindo, Partai Katolik, Partai Sosialis Indonesia (PSI), Musyawarah Rakyat Banyak
  (Murba), Partai Nasional Indonesia (PNI), Perti, dan Ikatan Pendukung Kemerdekaan Indonesia (IPKI). Pemilu ini dimenangkan Golkar.

Pemilu selanjutnya dilaksanakan pada 1977, 1982, 1987, 1992, dan 1997. Pemilu tahun 1977-1997 diikuti oleh tiga organisasi peserta pemilu, yaitu Partai Persatuan Pembangunan (PPP), Golongan Karya (Golkar), dan Partai Demokrasi Indonesia (PDI).
  Pemilu-pemilu di Indonesia selama Orde Baru selalu dimenangkan oleh Golkar.

### Sidang MPR Tahun 1973

Pada Maret 1973, diadakan sidang MPR yang menghasilkan beberapa keputusan sebagai berikut:

- Tap No. IV/MPR/1973 tentang Garis-garis Besar Haluan Negara (GBHN) sebagai ganti Manipol atau Manifestasi Politik.
- Tap No. IX/MPR/1973 tentang pemilihan Jenderal Soeharto sebagai Presiden RI.
- Tap No. XI/MPR/1973 tentang pemilihan Sri Sultan Hamengkubuwono IX sebagai Wakil Presiden RI.

### Berakhirnya Orde Baru

Latar belakang:

- Sejak pertengahan tahun 1996, situasi politik memanas di Indonesia.
- Rakyat menuntut adanya perubahan di bidang politik, ekonomi, dan demokratisasi dalam kehidupan sosial serta dihormatinya hak asasi manusia.
- Hasil pemilu 1997 yang dimenangkan Golkar dan menguasai banyak kursi DPR/MPR mengandung unsur nepotisme.
- Terpilihnya lagi Soeharto sebagai Presiden RI banyak mendapat reaksi masyarakat.
- Pembentukan Kabinet Pembangunan VII dianggap berbau Kolusi, Korupsi, dan Nepotisme (KKN).
- Indonesia dilanda krisis ekonomi sejak pertengahan tahun 1997 sebagai pengaruh krisis moneter yang melanda wilayah Asia Tenggara.

Melihat kondisi bangsa Indonesia tersebut, para mahasiswa memelopori demonstrasi memprotes kebijakan pemerintah Orde Baru. Aksi demonstrasi ini berhasil menggulingkan Orde Baru sehingga tanggal 21 Mei 1998 Presiden Soeharto menyerahkan
  jabatannya kepada Wakil Presiden B.J. Habibie.

## Orde Reformasi

### Pada 7 Juni 1999

Dilaksanakan pemilu pertama pada Orde Reformasi yang diikuti 48 partai politik. Suara terbanyak diraih oleh Partai Demokrasi Indonesia Perjuangan (PDIP).

### Pada Oktober 1999

Dalam Sidang Umum MPR bulan Oktober 1999, terpilihlah K.H. Abdurrahman Wahid sebagai presiden dan Megawati Soekarnoputri sebagai wakil presiden.

Masa pemerintahan Presiden Abdurrahman Wahid tidak berlangsung lama dan digantikan oleh Megawati Soekarnoputri. Kepemimpinan Presiden Megawati didampingi oleh Hamzah Haz yang dipilih melalui voting (pemungutan suara).

### Pada 5 April 2004

Dilaksanakan pemilu untuk memilih anggota DPR, DPD, dan DPRD.

### Pemilihan Presiden dan Wakil Presiden secara Langsung

Pemilu untuk memilih presiden secara langsung dilaksanakan dua putaran, yaitu 5 Juli dan 20 September 2004. Presiden dan wakil presiden terpilih adalah Susilo Bambang Yudhoyono dan Jusuf Kalla. Pemilihan presiden dan wakil presiden oleh rakyat
  secara langsung ini merupakan pertama kali dalam sejarah di Indonesia.

### Pada Pemilu 2009

Susilo Bambang Yudhoyono kembali terpilih menjadi presiden dengan wakilnya adalah Boediono.

### Pada Pemilu 2014

Joko Widodo terpilih menjadi presiden dengan Jusuf Kalla sebagai wakil presiden.''',
    "twk-modul-ringkasan-s48": '''## Peranan Perserikatan Bangsa-Bangsa

Dewan Keamanan PBB berperan dalam menyelesaikan pertikaian antara Indonesia dan Belanda dengan membentuk Komisi Tiga Negara (KTN).

KTN terdiri dari:

1. Australia (diwakili oleh Richard C. Kirby), atas pilihan Indonesia.
2. Belgia (diwakili oleh Paul Van Zeeland), atas pilihan Belanda.
3. Amerika Serikat (diwakili oleh Dr. Frank Porter Graham), atas pilihan Australia dan Belgia.

KTN berhasil mempertemukan Indonesia-Belanda dalam perundingan yang berlangsung pada 8 Desember 1947 di atas kapal perang Amerika Serikat "Renville" yang sedang berlabuh di Teluk Jakarta. Perundingan ini dikenal dengan Perundingan Renville.''',
    "twk-modul-ringkasan-s49": '''## Peranan Konferensi Asia di New Delhi

Waktu Belanda melakukan aksi militernya, Perdana Menteri India Pandit Jawaharlal Nehru dan Perdana Menteri Birma U Aung San memprakarsai Konferensi Asia yang diselenggarakan di New Delhi, pada 20-23 Januari 1949. Konferensi Asia menghasilkan
  resolusi yang disampaikan kepada PBB. Isinya:

1. Pengembalian pemerintahan Republik Indonesia ke Yogyakarta.
2. Pembentukan pemerintahan ad interim yang mempunyai kemerdekaan dalam politik luar negeri, sebelum tanggal 15 Maret 1949.
3. Penarikan tentara Belanda dari seluruh Indonesia.
4. Penyerahan kedaulatan kepada pemerintah Indonesia Serikat paling lambat tanggal 1 Januari 1950.

Pada 28 Januari 1949 Dewan Keamanan PBB mengeluarkan resolusi kepada Belanda dan Indonesia, yang isinya:

1. Penghentian semua operasi militer dengan segera oleh Belanda dan penghentian semua aktivitas gerilya oleh Indonesia.
2. Pembebasan dengan segera tanpa bersyarat semua tahanan politik di dalam daerah Indonesia oleh Belanda.
3. Belanda harus memberikan kesempatan kepada para pemimpin Indonesia untuk kembali ke Yogyakarta.
4. Perundingan-perundingan akan dilakukan dalam waktu secepatnya.
5. Komisi Tiga Negara diganti namanya menjadi Komisi PBB untuk Indonesia (UNCI atau United Nations Commission for Indonesia). Tugas UNCI untuk membantu melancarkan perundingan-perundingan.

## Usaha Diplomasi Indonesia

### 1. Perundingan Linggajati

- Diadakan pada 10 November 1946 di Linggajati, Kuningan, Jawa Barat.
- Pimpinan delegasi Belanda: Prof. Schermerhorn.
- Pimpinan delegasi Indonesia: Perdana Menteri Sjahrir.
- Pada 25 Maret 1947 hasil Perundingan Linggajati ditandatangani di Istana Rijswijk (Istana Merdeka), Jakarta.
- Isi Perundingan Linggajati adalah sebagai berikut:
  - Belanda mengakui secara de facto (berdasarkan kenyataan) Republik Indonesia dengan wilayah kekuasaan yang meliputi Sumatra, Jawa, dan Madura. Belanda harus sudah meninggalkan daerah de facto paling lambat 1 Januari 1949.
  - Republik Indonesia dan Belanda akan bekerja sama dalam membentuk Negara Indonesia Serikat dengan nama Republik Indonesia Serikat yang salah satu negara bagiannya adalah Republik Indonesia.
  - Republik Indonesia Serikat dan Belanda akan membentuk Uni Indonesia Belanda dengan Ratu Belanda sebagai ketuanya.

### 2. Perundingan Renville

- Perundingan ini diadakan pada 8 Desember 1947 di atas kapal perang Renville.
- Pimpinan delegasi Indonesia: Amir Syarifuddin.
- Pimpinan delegasi Belanda: R. Abdulkadir Widjojoatmodjo.
- Hasil Perundingan Renville ditandatangani pada 17 Januari 1948.
- Isi perundingan Renville adalah:
  - Pemerintah RI harus mengakui kedaulatan Belanda atas Hindia-Belanda sampai pada waktu yang ditetapkan oleh Kerajaan Belanda untuk mengakui Negara Indonesia Serikat (NIS).
  - Akan diadakan pemungutan suara untuk menentukan penduduk di daerah-daerah Jawa, Madura, dan Sumatra menginginkan daerahnya bergabung dengan RI atau negara bagian lain dari Negara Indonesia Serikat (NIS).
  - Setiap negara (bagian) berhak tinggal di luar NIS atau menyelenggarakan hubungan khusus dengan NIS atau Belanda.

### 3. Persetujuan Roem-Royen

Persetujuan Roem-Royen diselenggarakan pada 7 Mei 1949. Persetujuan Roem-Royen merupakan pernyataan-pernyataan dari dua tokoh, yaitu Mr. Moh. Roem selaku ketua delegasi Indonesia dan Dr. Van Royen selaku ketua delegasi Belanda.

**Pernyataan Mr. Moh. Roem, berisi:**

- Mengeluarkan perintah kepada "Pengikut Republik yang bersenjata" untuk menghentikan perang gerilya.
- Bekerja sama dalam hal mengembalikan perdamaian dan menjaga keamanan.
- Turut serta dalam Konferensi Meja Bundar di Den Haag, dengan maksud untuk mempercepat "penyerahan" kedaulatan kepada Negara Indonesia Serikat (NIS) dengan tidak bersyarat.

**Pernyataan Dr. Van Royen, berisi:**

- Menyetujui kembalinya Pemerintah Republik Indonesia ke Yogyakarta.
- Menjamin penghentian gerakan-gerakan militer dan pembebasan semua tahanan politik.
- Tidak akan mendirikan atau mengakui negara-negara yang berada di daerah-daerah yang dikuasai RI sebelum tanggal 19 Desember 1948.
- Menyetujui adanya Republik Indonesia sebagai bagian dari Negara Indonesia Serikat (NIS).
- Berusaha dengan sungguh-sungguh agar Konferensi Meja Bundar segera diadakan setelah Pemerintah RI kembali ke Yogyakarta.

### 4. Konferensi Meja Bundar

Pada 23 Agustus sampai 2 November 1949 diadakan Konferensi Meja Bundar di Den Haag, Belanda. Isi dari persetujuan KMB adalah:

- Belanda mengakui kedaulatan kepada Republik Indonesia Serikat pada akhir Desember 1949.
- Mengenai Irian Barat, penyelesaiannya ditunda satu tahun setelah pengakuan kedaulatan.
- Antara RIS dengan Kerajaan Belanda akan diadakan hubungan Uni Indonesia Belanda yang akan diketuai Ratu Belanda.
- Segera dilakukan penarikan mundur seluruh tentara Belanda.
- Pembentukan Angkatan Perang RIS (APRIS) dengan TNI sebagai intinya.''',
    "twk-modul-ringkasan-s50": '''## Politik Luar Negeri Indonesia

Landasan kebijakan politik luar negeri Orde Baru telah ditetapkan dalam Tap No. XII/MPRS/1966.

Menurut rumusan yang telah ditetapkan MPRS, politik luar negeri RI adalah bebas dan aktif, yaitu tidak mengikat diri pada salah satu blok ataupun pakta militer.

## Wujud Pelaksanaan Politik Luar Negeri Indonesia

Sebagai wujud pelaksanaan politik luar negeri Indonesia, dilakukan langkah-langkah sebagai berikut:

1. Menghentikan politik konfrontasi dengan Malaysia.
2. Indonesia kembali menjadi anggota PBB pada tanggal 28 September 1966.
3. Indonesia ikut memprakarsai terbentuknya Association of Southeast Asian Nations (ASEAN) pada 8 Agustus 1967.''',
    "twk-modul-ringkasan-s51": '''## Konferensi Asia Afrika (KAA)

### Latar Belakang KAA

- Bangsa-bangsa Asia Afrika memiliki persamaan nasib dan sejarah, yakni sama-sama pernah dijajah oleh bangsa-bangsa Eropa.
- Semakin meningkatnya kesadaran bangsa-bangsa Asia Afrika yang masih terjajah untuk memperoleh kemerdekaan.
- Perubahan politik setelah Perang Dunia II berakhir, yaitu situasi internasional diliputi kecemasan akibat perlombaan senjata antara Blok Barat dan Blok Timur.
- Di antara bangsa-bangsa Asia yang telah merdeka, masih belum terdapat kesadaran untuk bersatu.
- Kepentingan politik luar negeri Indonesia untuk menggalang kekuatan dari negara-negara Asia-Afrika agar mendukung perjuangan merebut Irian Barat.
- Bangsa-bangsa Asia-Afrika tidak ingin terlibat dalam perang dingin.

### Sejarah Terwujudnya KAA

KAA didahului oleh Konferensi Colombo dan Konferensi Bogor.

**Konferensi Colombo**

- Pelaksanaan: 28 April sampai 2 Mei 1954.
- Dihadiri oleh wakil dari 5 negara, yaitu:
  - Indonesia: Ali Sastroamidjojo.
  - India: Jawaharlal Nehru.
  - Pakistan: Mohammad Ali Bogra.
  - Birma: U Nu.
  - Sri Lanka: Sir John Kotelawala.

**Konferensi Bogor**

- Pelaksanaan: 28-31 Desember 1954.
- Tujuan: sebagai kelanjutan dari Konferensi Colombo.

### Tujuan KAA

- Mengembangkan saling pengertian dan kerja sama antar bangsa-bangsa Asia-Afrika.
- Meninjau masalah-masalah hubungan sosial, ekonomi, dan kebudayaan dalam hubungannya dengan negara-negara peserta.
- Mempertimbangkan masalah-masalah mengenai kepentingan khusus dari Asia-Afrika.
- Meninjau kedudukan bangsa-bangsa Asia-Afrika dan rakyatnya, serta memberikan sumbangan untuk meningkatkan perdamaian dan kerja sama internasional.

### Pelaksanaan KAA

- Waktu pelaksanaan: 18-24 April 1955.
- Tempat: Gedung Merdeka, Bandung.

### Peserta KAA

Konferensi ini dihadiri oleh 29 negara (termasuk 5 negara sponsor), yaitu:

1. Indonesia
2. India
3. Birma (Myanmar)
4. Pakistan
5. Sri Lanka
6. Afganistan
7. Kamboja
8. Laos
9. Libanon
10. Liberia
11. Libya
12. Nepal
13. Filipina
14. Saudi Arabia
15. Republik Rakyat Cina
16. Mesir
17. Ethiopia
18. Ghana
19. Iran
20. Irak
21. Jepang
22. Yordania
23. Sudan
24. Suriah
25. Thailand
26. Turki
27. Vietnam Utara
28. Vietnam Selatan
29. Yaman

### Hasil-Hasil KAA

Konferensi Asia-Afrika menghasilkan beberapa keputusan, antara lain:

- Kerja sama di bidang ekonomi.
- Kerja sama di bidang kebudayaan.
- Masalah hak asasi manusia.
- Masalah bangsa-bangsa yang belum merdeka.
- Mengusahakan perdamaian dan kerja sama di dunia.

Selain keputusan-keputusan di atas, KAA juga menghasilkan Dasasila Bandung (Bandung Declaration). Isinya mengajak semua bangsa di dunia untuk hidup bersama dalam perdamaian dan menjalankan kerja sama dalam suasana persahabatan atas dasar sepuluh
  prinsip (dasasila).

### Pengaruh KAA

- Berkurangnya ketegangan dan bahaya pecahnya peperangan yang bersumber dari persengketaan masalah Taiwan antara RRC dengan Amerika Serikat.
- Perjuangan bangsa-bangsa Asia-Afrika untuk mencapai kemerdekaan semakin meningkat.
- Politik luar negeri bebas aktif yang dijalankan Indonesia, India, Birma, dan Sri Lanka mulai diikuti negara-negara lain yang tidak masuk Blok Barat maupun Blok Timur.''',
    "twk-modul-ringkasan-s52": '''## Association of Southeast Asian Nations (ASEAN)

### Latar Belakang ASEAN

- **Faktor intern**: lahirnya negara-negara baru di Asia Tenggara setelah berakhirnya Perang Dunia II.
- **Faktor ekstern**: adanya kekhawatiran dari negara-negara di kawasan Asia Tenggara oleh gerakan komunis yang berusaha menguasai seluruh Vietnam, Laos, dan Kamboja sebagai negara komunis.

### Sejarah Berdirinya ASEAN

Deklarasi ASEAN ditandatangani pada 8 Agustus 1967 di Bangkok oleh utusan dari 5 negara di kawasan Asia Tenggara. Kelima tokoh yang menandatangani Deklarasi ASEAN adalah:

- Indonesia: Adam Malik.
- Malaysia: Tun Abdul Razak.
- Singapura: S. Rajaratnam.
- Filipina: Narciso Ramos.
- Thailand: Thanat Khoman.

Kelima negara di atas merupakan anggota ASEAN pada awal berdirinya. Saat ini, anggota ASEAN sudah bertambah 5 negara, yaitu Brunei Darussalam, Vietnam, Laos, Myanmar, dan Kamboja.

### Tujuan ASEAN

- Mempercepat pertumbuhan ekonomi, kemajuan sosial, serta perkembangan kebudayaan di kawasan Asia Tenggara.
- Meningkatkan perdamaian dan stabilitas regional.
- Meningkatkan kerja sama yang aktif serta saling bekerja sama dalam masalah ekonomi, sosial, budaya, teknik, ilmu pengetahuan, dan administrasi.
- Saling memberikan bantuan dalam bentuk sarana-sarana latihan dan penelitian dalam bidang-bidang pendidikan, profesional, teknik, dan administrasi.
- Bekerja sama dalam meningkatkan penggunaan pertanian serta industri, perluasan perdagangan, komoditi internasional, perbaikan sarana-sarana pengangkutan, komunikasi, dan peningkatan taraf hidup rakyat.

### Peranan Indonesia dalam ASEAN

- Indonesia termasuk salah satu negara pemrakarsa berdirinya ASEAN.
- Indonesia membantu pihak-pihak yang bersengketa untuk mencari penyelesaian dalam masalah Indocina.
- Indonesia adalah negara penyelenggara KTT pertama ASEAN yang berlangsung di Denpasar, Bali.
- Indonesia ditunjuk sebagai tempat kedudukan Sekretariat Tetap ASEAN.''',
    "twk-modul-ringkasan-s53": '''## Perserikatan Bangsa-Bangsa (PBB)

### Proses Terbentuknya PBB

Terbentuknya PBB merupakan perjalanan panjang dari serangkaian pembicaraan yang menghasilkan naskah dan kegiatan-kegiatan, antara lain:

- Piagam Atlantik (1941).
- Konferensi Washington (1942).
- Konferensi Moskow (1943).
- Konferensi San Francisco (1945).

PBB resmi berdiri pada tanggal 24 Oktober 1945.

### Tujuan PBB

1. Memelihara perdamaian dan keamanan dunia.
2. Mengembangkan hubungan persahabatan antar bangsa.
3. Mencapai kerja sama internasional dalam memecahkan masalah ekonomi, sosial, budaya, dan kemanusiaan, serta memajukan penghormatan terhadap hak asasi manusia.
4. Menjadi pusat penyelaras tindakan bangsa-bangsa untuk mencapai tujuan bersama.''',
    "twk-modul-ringkasan-s54": '''## Tujuan Perserikatan Bangsa-Bangsa (PBB)

Tujuan PBB, antara lain:

- Mengembangkan kerja sama internasional dalam memecahkan masalah-masalah ekonomi, sosial, budaya, dan kemanusiaan.
- Memajukan dan menghargai hak asasi manusia serta kebebasan atau kemerdekaan fundamental tanpa membedakan warna kulit, jenis kelamin, bahasa, dan agama.
- Menjadikan pusat kegiatan bangsa-bangsa dalam mencapai kerja sama yang harmonis untuk mencapai tujuan PBB.

## Peranan Indonesia terhadap PBB

- Secara tidak langsung, Indonesia ikut menciptakan perdamaian dunia melalui kerja sama dalam Konferensi Asia Afrika, ASEAN, maupun Gerakan Non Blok.
- Secara langsung, Indonesia mengirimkan Pasukan Garuda sebagai sumbangan terhadap PBB untuk menciptakan perdamaian dunia.
- Pada 1985, Indonesia membantu PBB memberikan bantuan pangan ke Ethiopia ketika dilanda bahaya kelaparan.
- Indonesia pernah dipilih menjadi anggota tidak tetap Dewan Keamanan PBB.''',
    "twk-modul-ringkasan-s55": '''## Gerakan Non Blok (GNB)

### Latar Belakang Berdirinya GNB

- Diilhami oleh KAA di Bandung, tahun 1955.
- Adanya krisis Kuba, yaitu Uni Soviet membangun pangkalan peluru kendali secara besar-besaran di Kuba.
- Ketegangan antara Blok Barat dan Blok Timur.

### Tujuan GNB

Gerakan Non Blok bertujuan untuk meredakan ketegangan dunia sebagai akibat pertentangan antara Blok Barat dan Blok Timur.

### Peranan Indonesia dalam GNB

- Ikut memprakarsai berdirinya Gerakan Non Blok dengan menandatangani Deklarasi Beograd.
- Indonesia sebagai tempat penyelenggaraan KTT Gerakan Non Blok X yang berlangsung pada tanggal 1-6 September 1992 di Jakarta.''',
    "twk-modul-ringkasan-s56": '''## Kemampuan Berbahasa Indonesia

Kemampuan berbahasa Indonesia yang baik dan benar merujuk pada Ejaan yang Disempurnakan (EYD). Ejaan adalah keseluruhan peraturan yang menggambarkan lambang-lambang bunyi ujaran dan cara interelasi antara lambang-lambang itu dalam suatu bahasa.

## A. Abjad

Dalam bahasa Indonesia abjad yang digunakan terdiri dari huruf sebagai berikut.

Ditulis dalam penulisan huruf kapital (huruf besar):

A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z

Ditulis dalam penulisan huruf kecil:

a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z''',
    "twk-modul-ringkasan-s57": '''## B. Pembagian Huruf

Huruf dibagi menjadi dua, yaitu:

- **Huruf vokal (huruf hidup)**: A, I, U, E, O.
- **Huruf konsonan (huruf mati)**: sisa abjad selain huruf vokal, yaitu B, C, D, F, G, H, J, K, L, M, N, P, Q, R, S, T, V, W, X, Y, Z.

## C. Diftong

Diftong terdiri dari ai, au, dan oi.

Diftong yang dieja dengan ai, au, oi dilafalkan sebagai bunyi vokal yang diikuti oleh bunyi konsonan luncuran w atau y, karena diftong bukanlah gabungan dua bunyi vokal.

Contoh pemakaian diftong:

- **ai**: pantai, damai.
- **au**: aus, saudara, aula, saudagar, kemarau.
- **oi**: amboi.

Bandingkan beda lafal au dan ai dalam:

- "kemarau" dan "menggulai": au dan ai pada kata tersebut berfungsi sebagai diftong.
- "mau" dan "menggulai teh": au dan ai pada kata tersebut melambangkan deret dua bunyi vokal.

## D. Persukuan

Dalam bahasa Indonesia setiap suku kata ditandai oleh sebuah Vokal (disingkat V). Vokal dapat diikuti maupun didahului oleh Konsonan (disingkat K). Pola umum suku kata, antara lain:

1. **V**: a-kan, a-ku, ma-u.
2. **VK**: an-dal, la-in, in-dah.
3. **KV**: ra-jut, ma-ju, bi-ru.
4. **KVK**: ban-tah, lam-bat, ram-but.

## E. Penulisan Huruf

### 1. Penulisan Huruf Kapital (Huruf Besar)

Huruf kapital dipakai sebagai huruf pertama pada:

- **Awal kalimat**. Contoh: Bus itu melaju dengan cepat.
- **Awal petikan langsung**. Contoh: Ibu berkata, "Ayo bangun, matahari sudah tinggi."
- **Ungkapan yang berhubungan dengan hal keagamaan**, berupa nama Tuhan, termasuk kata ganti untuk Tuhan, dan kitab suci. Contoh: Allah, Al-Qur'an, dan "Hanya kepada-Mu kami memohon."
- **Unsur nama orang**. Contoh: Gunawan Wibisono.
- **Unsur singkatan nama orang, gelar, dan sapaan**. Untuk menulis singkatan selalu diikuti oleh tanda titik. Contoh: Dr. Purwa Hastuti, Ny. Martha, Prof. Gunawan, Lutfi, S.Pd.
- **Nama gelar kehormatan, keagamaan, dan keturunan yang diikuti nama orang**. Contoh: Haji Zulkarnaen, Sultan Syahrir.
- **Unsur nama jabatan dan pangkat yang diikuti nama orang, nama instansi, dan nama tempat**. Contoh: Kepala Dinas Pertanian, Presiden Joko Widodo, Kolonel Panjaitan. Bedakan dengan: "Siapakah presiden pertama kita?"
- **Nama bangsa, suku bangsa, dan bahasa**. Contoh: bahasa Jawa, suku Baduy, bangsa Indonesia.
- **Nama tahun, bulan, hari, hari raya, dan peristiwa sejarah**. Contoh: hari Senin, bulan Juli, tahun Hijriah, hari Natal, Proklamasi, Perang Dunia I.
- **Nama geografi**. Contoh: Jalan Wisnu, Selat Sunda.
- **Unsur nama negara, lambang pemerintahan, serta nama dokumen resmi**. Contoh: Pengadilan Tinggi, Kementerian Hukum dan HAM, Piagam Jakarta.
- **Setiap unsur bentuk ulang sempurna yang dipakai sebagai nama badan, lembaga pemerintah, serta nama dokumen resmi**. Contoh: Undang-Undang Dasar 1945.
- **Semua kata di dalam nama buku, majalah, surat kabar, dan judul karangan, kecuali kata tugas**. Kata tugas adalah kata partikel seperti di, ke, dari, untuk, dan yang. Contoh: Pendidikan Karakter karangan Gunawan Wibisono.
- **Kata penunjuk hubungan kekerabatan yang dipakai sebagai sapaan dan pengacuan**. Kata penunjuk hubungan kekerabatan seperti bapak, ibu, adik, saudara, kakak, dan paman.
  Contoh: "Kapan Paman datang?" dan "Atas perhatian Bapak, kami ucapkan terima kasih."

### 2. Penulisan Huruf Miring

Huruf miring dipakai pada:

- **Penulisan nama buku, majalah, dan surat kabar yang dikutip dalam tulisan**. Contoh: Majalah Cakrawala selalu memuat berita terbaru.
- **Penegasan atau pengkhususan huruf, bagian kata, kata, atau kelompok kata**. Contoh: Jalan ini adalah saksi pertempuran arek-arek Surabaya.
- **Penulisan kata, nama ilmiah, atau ungkapan asing yang belum disesuaikan ejaannya**. Contoh: Oryza sativa. "Rapat kali ini dilaksanakan di youth centre."

## F. Penulisan Kata

### 1. Kata Dasar

Kata dasar ditulis sebagai satu kesatuan. Contoh: Ibu pergi ke pasar.

### 2. Kata Turunan

- Imbuhan (awalan, sisipan, akhiran) ditulis serangkai dengan kata dasarnya. Contoh: dibeli, membersihkan, bergulat.
- Jika bentuk dasarnya berupa gabungan kata, imbuhan ditulis serangkai dengan kata yang mengikuti atau mendahuluinya. Contoh: bertanggung jawab, mata pelajaran, persegi panjang.
- Jika bentuk dasarnya berupa gabungan kata yang sekaligus mendapat awalan dan akhiran, unsur gabungan itu harus ditulis serangkai. Contoh: mempertanggungjawabkan, melipatgandakan.
- Jika salah satu unsur gabungan hanya dipakai dalam kombinasi, gabungan kata itu harus ditulis serangkai. Contoh: swalayan, Pancasila, Dwidharma.

Catatan:

- Jika bentuk terikat tersebut diikuti oleh kata yang huruf awalnya huruf kapital, di antara kedua unsur ditulis tanda hubung (-). Contoh: non-Islam.
- Kata "maha" sebagai unsur gabungan kata ditulis serangkai. Contoh: Pimpinan merupakan orang yang mahabijaksana di kantor ini.
- Bentuk terikat "maha" ditulis terpisah jika diikuti oleh kata esa dan kata yang bukan kata dasar. Contoh: Maha Esa, Maha Pengasih.

### 3. Kata Ulang

Bentuk kata ulang ditulis secara lengkap dengan menggunakan tanda hubung. Contoh: mata-mata.

### 4. Gabungan Kata

Gabungan kata yang biasa disebut kata majemuk, termasuk istilah khusus. Bagian-bagiannya yang umum ditulis terpisah.

- Gabungan kata yang belum mendapat afiks (imbuhan) ditulis terpisah. Contoh: papan tulis, perdana menteri.
- Gabungan kata yang mendapat prefiks (awalan) atau sufiks (akhiran) ditulis terpisah dan awalannya dirangkaikan dengan kata pertama, sedangkan akhirannya dirangkaikan dengan kata kedua. Contoh: pertanggungjawaban.
- Gabungan kata yang mungkin dapat menimbulkan salah arti dapat ditulis dengan menggunakan tanda hubung untuk menegaskan pertalian di antara unsur yang bersangkutan. Contoh: suami-istri.
- Gabungan kata berikut ditulis serangkai karena sudah dianggap sebagai satu kata: acapkali, adakalanya, bilamana, bismillah, bumiputra, kilometer, daripada, dukacita, halalbihalal, hulubalang, kacamata, kasatmata, keratabasa, manakala,
  manasuka, matahari, olahraga, peribahasa, puspawarna, radioaktif, saputangan, sediakala, segitiga, sukacita, sukarela, syahbandar, titimangsa.

### 5. Kata Depan

Kata depan di, ke, dari ditulis terpisah dari kata yang mengikuti, kecuali di dalam gabungan kata yang sudah dianggap sebagai satu kata seperti kepada dan daripada. Contoh: di sungai, ke Jakarta, dari Mekkah.

### 6. Kata Ganti atau Klitik ku, kau, mu, dan nya

Klitik ku, kau, mu, dan nya ditulis serangkai. Contoh: di hadapannya.

### 7. Kata Sandang si dan sang

Kata sandang si dan sang ditulis terpisah dari kata yang mengikutinya. Contoh: sang kancil, si manis.

### 8. Partikel

- Partikel lah, kah, dan tah ditulis serangkai dengan kata yang mendahuluinya. Contoh: Apakah ayahmu baik-baik saja?
- Partikel pun ditulis terpisah dari kata yang mendahuluinya. Contoh: apa pun. Catatan: kelompok kata berikut sudah dianggap padu dan ditulis serangkai: adapun, andaipun, ataupun, bagaimanapun, biarpun, kalaupun, kendatipun, maupun, meskipun,
  sekalipun, sungguhpun, walaupun.
- Partikel per ditulis terpisah jika berarti mulai, demi, dan setiap. Contoh: Harga bensin saat ini naik per liternya. Harga bensin naik per 1 Januari 2016.

## G. Penulisan Angka dan Lambang Bilangan

Angka dipakai untuk menyatakan lambang bilangan atau nomor. Angka yang lazim digunakan dalam tulisan adalah:

- **Angka Arab**: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9.
- **Angka Romawi**: I, II, III, IV, V, VI, VII, VIII, IX, X, L (50), C (100), D (500), M (1.000).

Ketentuan penulisan angka dan lambang bilangan sebagai berikut:

1. Angka digunakan untuk menyatakan ukuran panjang, berat, isi, satuan waktu, dan nilai uang. Contoh: 10 liter, pukul 10.00.
2. Angka digunakan untuk menandai nomor jalan, rumah, apartemen, atau kamar pada alamat. Contoh: Jalan Wisnu No. 3.
3. Angka digunakan untuk menomori karangan atau bagiannya. Contoh: Bab III, Pasal 28 ayat 1.
4. Penulisan lambang bilangan dengan huruf dilakukan sebagai berikut: bilangan utuh, contoh 317 ditulis tiga ratus tujuh belas; bilangan pecahan, contoh 1/2 ditulis setengah.
5. Penulisan bilangan tingkat dapat dilakukan dengan cara berikut. Contoh: Bab I, Bab ke-1, Bab pertama.
6. Penulisan kata bilangan yang mendapat akhiran (-an) mengikuti cara berikut. Contoh: tahun 90-an, tahun sembilan puluhan.
7. Lambang bilangan yang dapat dinyatakan dengan satu atau dua kata ditulis dengan huruf. Contoh: Kakak ke kamar kecil sampai tujuh kali.
8. Jika beberapa lambang bilangan dipakai secara berurutan, seperti dalam perincian dan pemaparan, maka ditulis angka. Contoh: Alat tulis yang dibeli berjumlah 2 buku tulis, 4 pensil, dan 3 penghapus.
9. Lambang bilangan pada awal kalimat ditulis dengan huruf. Contoh: Dua puluh siswa telah menyelesaikan ujian dengan baik.
10. Angka yang menunjukkan bilangan bulat yang besar dapat dieja sebagian supaya lebih mudah dibaca. Contoh: Rumah baru itu dibangun dengan biaya sebesar 450 juta rupiah.
11. Jika dalam dokumen resmi, seperti berita acara, akta, dan kuitansi, maka bilangan ditulis dalam bentuk angka dan huruf sekaligus. Contoh: Telah diterima dari bendahara, uang sejumlah Rp15.000,00 (lima belas ribu rupiah).
12. Jika dalam teks (dokumen biasa) maka bilangan ditulis dalam bentuk angka sesuai dengan ketentuan penulisan. Contoh: Siswa di kelas kami ada 37 anak.

## H. Pemakaian Tanda Baca

### 1. Tanda Titik (.)

Tanda titik digunakan pada:

- Akhir kalimat yang bukan pernyataan seruan. Contoh: Ibu pergi ke pasar.
- Akhir singkatan nama orang. Contoh: A. Yani.
- Akhir singkatan gelar, jabatan, pangkat, dan sapaan. Contoh: Elisa, S.E.
- Akhir singkatan kata atau ungkapan yang sudah sangat umum. Contoh: dan sebagainya disingkat menjadi dsb.''',
    "twk-modul-ringkasan-s58": '''## Lanjutan Pemakaian Tanda Baca

### 1. Tanda Titik (.) Lanjutan

Catatan:

- Tanda titik tidak dipakai dalam singkatan yang terdiri dari huruf-huruf awal kata atau suku kata, atau gabungan keduanya, atau yang terdapat di dalam akronim yang sudah diterima oleh masyarakat. Contoh: Sekjen.
- Tanda titik tidak dipakai dalam singkatan lambang kimia, satuan ukuran, takaran, timbangan, dan mata uang.

Tanda titik juga digunakan pada:

- Akhir angka atau huruf dalam suatu bagan, ikhtisar, atau daftar. Contoh: 1.1. Tes Penalaran Verbal, 1.1.1. Sinonim, 1.1.2. Antonim, 1.1.3. Analogi.
- Untuk memisahkan angka jam, menit, dan detik yang menunjukkan waktu atau jangka waktu. Contoh: pukul 15.03.10.
- Untuk memisahkan angka ribuan, jutaan, dan seterusnya yang menyatakan jumlah. Contoh: Buku yang baru saja dibeli berisikan 1.350 lembar. Catatan: tanda titik tidak dipakai untuk memisahkan angka ribuan, jutaan, dan seterusnya yang tidak
  menunjukkan jumlah, seperti tahun dan nomor telepon.
- Antara nama penulis, judul karangan yang tidak berakhir dengan tanda tanya atau tanda seru, dan tempat terbit dalam daftar pustaka. Contoh: Wibisono, Gunawan. 2016. Pendidikan Karakter. Jakarta: Pelita.

Catatan: tanda baca titik tidak digunakan pada akhir judul yang merupakan kepala karangan, kepala ilustrasi, tabel, tanggal surat, atau nama pengirim dan penerima surat.

### 2. Tanda Koma (,)

Tanda koma digunakan pada:

- Antara unsur-unsur suatu perincian atau pembilangan. Contoh: Latika membawa tas, tempat minum, dan payung.
- Untuk memisahkan kalimat setara yang satu dari kalimat setara berikutnya yang didahului oleh kata seperti tetapi atau melainkan. Contoh: Saya tidak pernah menyesal sekolah di desa, tetapi saya ingin merasakan gemerlapnya kota.
- Di belakang kata atau ungkapan penghubung antarkalimat yang terdapat pada awal kalimat. Termasuk di dalamnya: oleh karena itu, jadi, lagi pula, meskipun begitu. Contoh: Lagi pula, tidak ada model sepatu yang cocok untuk dikenakannya.
- Untuk memisahkan anak kalimat dari induk kalimat apabila anak kalimat tersebut mendahului induk kalimatnya. Contoh: Jika jalan macet, saya terlambat sampai kantor. "Jika jalan macet" adalah anak kalimat, "saya terlambat sampai kantor" adalah
  induk kalimat. Catatan: tanda koma tidak digunakan untuk memisahkan anak kalimat dari induk kalimat apabila anak kalimat tersebut mengiringi induk kalimatnya.
- Untuk memisahkan kata seru, seperti o, ya, wah, aduh, dan kasihan, dari kata yang lain. Contoh: Wah, mewah sekali!
- Untuk memisahkan bagian nama yang dibalik susunannya dalam penulisan daftar pustaka. Contoh: Wibisono, Gunawan. 2016. Pendidikan Karakter. Jakarta: Pelita.
- Di antara nama orang dan gelar akademik yang mengikutinya, untuk membedakan dari singkatan nama keluarga atau marga. Contoh: Lukito Edi, S.S.
- Digunakan di depan angka persepuluhan dan di antara rupiah dan sen dalam bilangan. Contoh: 35,20 cm.
- Untuk memisahkan petikan langsung dari bagian lain dalam kalimat. Contoh: Kata Lisa, "Ayo berangkat!" Catatan: tanda koma tidak dipakai untuk memisahkan petikan langsung dari bagian lain dalam kalimat apabila petikan langsung tersebut berakhir
  dengan tanda tanya atau tanda seru dan mendahului bagian lain dalam kalimat itu.
- Digunakan untuk mengapit keterangan tambahan dan keterangan aposisi. Contoh: Guru Geografi, Pak Lukito, termasuk populer di sekolah ini.
- Di antara nama dan alamat, bagian-bagian alamat, tempat dan tanggal, nama tempat dan wilayah atau negeri yang ditulis berurutan. Contoh: Yogyakarta, 1 Januari 2016.

### 3. Tanda Titik Dua (:)

Tanda titik dua digunakan pada:

- Akhir suatu pernyataan lengkap bila diikuti rangkaian atau perincian. Contoh: Bahan roti bolu kukus seperti: tepung terigu, mentega, dan telur. Catatan: tanda titik dua tidak dipakai jika rangkaian atau perincian merupakan pelengkap yang
  mengakhiri pernyataan.
- Sesudah ungkapan atau kata yang memerlukan pemerian. Contoh: Ketua: Rajiman, Wakil: Widodo.
- Dalam teks drama sesudah kata yang menunjukkan pelaku dalam percakapan. Contoh: Galuh: "Wen, maafkan aku." Wenda: "Pergi dari sini!"
- Di antara jilid atau nomor dan halaman, di antara bab dan ayat dalam kitab suci, atau di antara judul dan anak judul suatu karangan. Contoh: Surat Al-Baqarah: 24.

### 4. Tanda Tanya (?)

Tanda tanya digunakan pada akhir kalimat tanya. Contoh: Kapan nikah?

### 5. Tanda Seru (!)

Tanda seru digunakan sesudah ungkapan atau pernyataan yang berupa seruan atau perintah, atau yang menggambarkan kesungguhan, ketidakpercayaan, atau rasa emosi yang kuat. Contoh: Semangat!

### 6. Tanda Hubung (-)

Tanda hubung digunakan pada:

- Untuk menyambung unsur-unsur kata ulang. Contoh: undang-undang.
- Untuk menyambung huruf kata yang dieja satu per satu dan bagian-bagian tanggal. Contoh: i-n-i, 29-07-1994.
- Untuk merangkaikan (se-) dengan kata berikutnya yang dimulai dengan huruf kapital. Contoh: se-Indonesia.
- Untuk merangkaikan (ke-) dengan angka. Contoh: putra ke-2.
- Untuk merangkaikan angka dengan akhiran (-an). Contoh: gaya 90-an.
- Untuk merangkaikan singkatan huruf kapital dengan imbuhan atau kata. Contoh: SIM-nya.
- Menyambung awalan dengan bagian kata belakangnya, atau akhiran dengan bagian kata di depannya pada pergantian baris.
- Digunakan untuk merangkaikan unsur bahasa Indonesia dengan unsur bahasa asing. Contoh: di-charge.

## I. Kata

### 1. Kata Berimbuhan

Proses yang terjadi karena bentuk dasar ditambahkan imbuhan. Contoh: ber- + satu menjadi bersatu.

### 2. Kata Ulang

Kata ulang disebut juga dengan reduplikasi. Contoh: sayur-mayur, undang-undang.

### 3. Kata Majemuk

Proses penggabungan dua kata atau lebih sehingga menimbulkan makna baru. Contoh: sepatu sandal.

## J. Tata Kalimat

### 1. Frasa

Frasa atau kelompok kata adalah gabungan dua kata atau lebih yang membentuk satu kesatuan, tetapi tidak membentuk subjek-predikat dan tidak membentuk makna baru.

Menurut tipe strukturnya, frasa dapat dibagi menjadi:

- **Frasa endosentris**
  - Subordinatif: frasa yang salah satu unsurnya sebagai inti dan unsur lainnya sebagai keterangan. Contoh: tas baru (D-M), sehelai rambut (M-D). Keterangan: D adalah diterangkan (inti), M adalah menerangkan (penjelas).
  - Koordinatif: frasa yang semua unsurnya dapat berlaku sebagai inti. Contoh: suami istri.
  - Apositif: frasa yang salah satu unsurnya sebagai keterangan, tetapi keterangan itu menggantikan kedudukan yang diterangkan. Contoh: Lina, gadis yang berambut lurus. Frasa "gadis yang berambut lurus" berfungsi menjelaskan Lina.
- **Frasa eksosentris**
  - Direktif. Contoh: di pasar.
  - Objektif. Contoh: menggenggam tangannya.
  - Predikatif. Contoh: sedang belajar.
  - Konjungtif. Contoh: jika mereka datang.

### 2. Klausa

Klausa adalah suatu konstruksi yang di dalamnya terdapat beberapa kata yang mengandung hubungan fungsional yang menurut tata bahasa tradisional dikenal sebagai subjek dan predikat. Klausa terdiri dari:

- **Klausa utama (induk kalimat)**: klausa yang dapat berdiri sebagai kalimat.
- **Klausa bawahan (anak kalimat)**: klausa yang tidak dapat berdiri sebagai kalimat. Biasanya, anak kalimat diawali dengan konjungsi.

Contoh: "Kami mengunjungi nenek tua itu ketika suaminya masih sehat." Kalimat "Kami mengunjungi nenek tua itu" adalah induk kalimat, sedangkan "ketika suaminya masih sehat" adalah anak kalimat.

### 3. Kalimat

Kalimat adalah bagian terkecil ujaran atau teks yang mengungkapkan pikiran yang utuh secara ketatabahasaan.

- **Kalimat majemuk setara**: kalimat yang terdiri atas dua klausa yang hubungannya setara. Contoh: Guru menerangkan materi belajar dan siswa mendengarkannya. "Guru menerangkan materi belajar" adalah klausa utama, "siswa mendengarkannya" adalah
  klausa utama.
- **Kalimat majemuk bertingkat**: kalimat tunggal yang diperluas dan perluasan itu berbentuk klausa baru. Contoh: Kami belajar dengan giat agar lulus tes CPNS tahun ini. "Kami belajar dengan giat" adalah induk kalimat, "agar lulus tes CPNS tahun
  ini" adalah anak kalimat.''',
    "twk-modul-ringkasan-s59": '''## K. Tata Makna

### 1. Macam-Macam Makna

**Berdasarkan makna tambahan**

- **Makna denotatif (makna sebenarnya)**. Contoh: Gulai kepala kambing.
- **Makna konotatif (kiasan)**. Contoh: keras kepala.

**Berdasarkan hubungan makna antara satu kata dengan kata lain**

- **Sinonim**. Contoh: nakal sama dengan badung.
- **Antonim**. Contoh: tinggi berlawanan dengan rendah.
- **Homonim**: kata yang sama bunyi atau ejaannya tetapi berbeda maknanya. Berdasarkan tingkatannya, homonim terbagi menjadi:
  - Homograf: ejaan sama, tetapi lafal dan makna berbeda. Contoh: Apel (buah) dan apel (upacara).
  - Homofon: lafal sama, tetapi ejaan dan makna berbeda. Contoh: massa dan masa.
- **Hiponim**: makna kata terwakili makna dari kata yang lebih umum. Contoh: kata umum bunga, hiponimnya mawar, melati, dan kamboja.
- **Polisemi (makna ganda)**. Contoh: kepala dalam arti pemimpin dan kepala dalam arti bagian tubuh paling atas.

### 2. Perpindahan Makna Kata

**Majas**

- **Perumpamaan (simile)**. Contoh: Kehidupan pernikahan ibarat menulis di lembar baru.
- **Personifikasi**. Contoh: senja merona.
- **Metonimia**. Contoh: Mereka pergi dengan menggunakan Kijang. Kijang yang dimaksud di atas adalah merek mobil.
- **Sinekdok**
  - Pars pro toto (sebagian untuk keseluruhan). Contoh: Sejak seminggu yang lalu, saya tidak melihat batang hidungnya.
  - Totum pro parte (keseluruhan untuk sebagian). Contoh: Indonesia menjadi juara umum pada ajang bergengsi itu.

**Istilah**

Istilah adalah kata atau gabungan kata yang secara cermat mengungkapkan suatu konsep, proses, keadaan, atau sifat yang khas dalam bidang tertentu. Contoh: rekam medis (istilah kedokteran).''',
    "twk-modul-ringkasan-s61": '''## Gagasan Utama Bacaan

Gagasan utama, gagasan pokok, atau ide pokok merupakan gagasan atau ide yang menjadi pokok pengembang bacaan. Cara menemukannya adalah sebagai berikut:

1. Membaca secara cermat.
2. Memahami maksud pembicaraan atau hal pokok yang dibicarakan dalam bacaan.
3. Menemukan ide pokok tiap paragraf, kemudian digabungkan dan dirangkum sehingga didapatkan kesimpulan hal pokok yang dibicarakan dalam bacaan tersebut.

## Paragraf

Paragraf adalah seperangkat kalimat yang berhubungan dan membentuk satu gagasan. Biasanya dalam satu paragraf terdiri dari beberapa kalimat yang padu, dan kalimat pertama dalam suatu paragraf ditulis dengan cara agak menjorok ke dalam.

Jenis-jenis paragraf berdasarkan letak gagasan utama:

- **Paragraf deduktif**: gagasan utama terletak pada awal paragraf.
- **Paragraf induktif**: gagasan utama terletak pada akhir paragraf.
- **Paragraf campuran**: gagasan utama terletak pada awal dan akhir paragraf.

## Gagasan Utama Paragraf

Gagasan utama, gagasan pokok, atau ide pokok merupakan gagasan atau ide yang menjadi pokok pengembang paragraf, sehingga dalam satu paragraf hanya ada satu gagasan utama.

## Kalimat Utama

Pada umumnya, kalimat utama terletak di awal atau akhir paragraf. Dalam satu paragraf, terdapat gagasan pokok atau utama yang berada pada kalimat utama. Kalimat utama dikembangkan oleh kalimat penjelas.

Kalimat utama adalah kalimat yang di dalamnya terdapat ide pokok paragraf. Kalimat utama sering disebut kalimat topik, sehingga perlu dijelaskan dengan kalimat-kalimat selanjutnya dalam paragraf tersebut yang disebut sebagai kalimat penjelas.

Ciri kalimat utama:

1. Mengandung permasalahan yang dapat diuraikan lebih lanjut.
2. Berupa kalimat lengkap dan dapat berdiri sendiri.
3. Mempunyai arti yang jelas tanpa dihubungkan dengan kalimat lain.
4. Pada paragraf induktif, kalimat utama sering kali ditandai dengan kata-kata seperti: "Sebagai kesimpulan ...", "Yang penting ...", "Jadi, ...", "Dengan demikian ...".

## Kalimat Penjelas

Kalimat penjelas, yaitu kalimat yang isinya memperjelas, menguraikan, atau berupa rincian-rincian tentang kalimat utama.

Ciri-ciri kalimat penjelas:

1. Merupakan kalimat yang tidak dapat berdiri sendiri.
2. Arti kalimatnya akan lebih jelas setelah dihubungkan dengan kalimat lain dalam satu paragraf.
3. Pembentukannya memerlukan bantuan kata sambung atau frasa penghubung atau kalimat transisi.
4. Berisi rincian, keterangan, contoh, dan data yang mendukung kalimat utama.

## Tips Meningkatkan Pemahaman Bacaan

### Perbanyak Membaca

Melatih diri dengan banyak membaca menjadikan kamu gemar membaca, sehingga kamu akan terlatih dengan bacaan-bacaan panjang dan tidak cepat lelah saat membaca.

Bagi kamu yang tidak terlalu senang membaca, awali dengan membaca bacaan pendek, misalnya berita di koran, artikel majalah kesayangan, atau artikel di internet yang menarik minatmu untuk membaca. Terus lakukan kebiasaan kecil ini, dan bertahap coba membaca cerita pendek di koran atau majalah, novel, atau buku yang menarik minat membacamu, sehingga lambat laun kamu akan terbiasa dengan suatu bacaan, terutama saat tes pemahaman bacaan.

### Biasakan Membaca Cepat

Waktu yang disediakan dalam tes sangat terbatas, sehingga apabila kamu menerapkan kebiasaan cara baca santai seperti saat di rumah tanpa target waktu, akan menjadi sangat merugikan saat tes berlangsung. Teknik membaca cepat dapat membantu kamu menjawab soal dengan lebih mudah dan cepat, dengan membaca langsung ke inti-intinya, karena pada umumnya hal-hal yang ditanyakan dalam tes terdapat di inti bacaan.

### Ambil Intinya

Saat membaca, bagian yang paling penting kamu baca adalah di awal bacaan (paragraf 1), karena di situlah letak gagasan utama bacaan. Lanjutkan dengan membaca awal atau akhir setiap paragraf, karena biasanya di situ merupakan letak kalimat utama paragraf.

Setelah mendapatkan kalimat utama paragraf, cobalah melanjutkan dengan mengambil inti dari kalimat utama paragraf tersebut, karena inti dari kalimat utama merupakan gagasan utama paragraf. Terakhir, bacalah bagian akhir bacaan, karena biasanya intisari atau kesimpulan bacaan ada di bagian tersebut.

### Cermati Fakta dan Data dalam Bacaan

Kamu bisa menandai fakta yang terjadi dalam sebuah kejadian atau data yang terdapat di bacaan dengan menandai dengan garis bawah, karena bisa jadi fakta dan data ini dapat membantu kamu dalam menjawab soal selanjutnya. Dengan berpedoman pada fakta dan data dalam bacaan, kamu dapat terhindar dari opini yang mungkin kamu bentuk selama membaca.

## Trik Mengerjakan Soal Bacaan

1. **Bacalah dengan cepat**: membaca dengan teknik cepat dapat membantu kamu memanfaatkan waktu dengan baik, dan menemukan beberapa kata kunci yang diperlukan tanpa harus membaca terlalu detail atau tanpa membaca semua kalimat.
2. **Konsentrasi**: membaca dengan konsentrasi dapat membantu kamu mengingat kata kunci yang diperlukan, inti bacaan, mengaitkan antar kejadian, dan membantu kamu cukup sekali saja membaca bacaan tersebut tanpa harus mengulangnya berkali-kali.
3. **Kalimat utama terletak di awal atau akhir paragraf**: soal bacaan sering kali menuntut kamu menemukan beberapa hal yang ada kaitannya dengan kalimat utama, sehingga menemukan kalimat utama dalam suatu paragraf menjadi sangat penting.
4. **Pisahkan kalimat utama dengan kalimat penjelas**: dengan memisahkan kalimat utama dengan kalimat penjelas, kamu akan lebih mudah menemukan gagasan utama suatu paragraf.
5. **Gagasan utama paragraf melekat pada kalimat utama**: seperti halnya kalimat utama, gagasan utama paragraf terletak di awal paragraf atau di akhir paragraf.
6. **Gagasan utama bacaan terdapat di bagian awal bacaan**: kaitkan dengan ide pokok dari tiap paragraf.
7. **Cari jawabannya di dalam bacaan**: semua jawaban dari soal bacaan terdapat di bacaan yang telah disediakan, sehingga kamu dapat mencari jawabannya di dalam bacaan sesuai dengan petunjuk soal.
8. **Hindari opini**: jawablah sesuai dengan apa yang sudah tertulis di bacaan, bukan berdasarkan pendapat atau persepsimu. Pilihlah jawaban yang paling sesuai dengan fakta atau data yang telah dijelaskan di bacaan. Namun apabila jawaban yang dimaksud tidak tertulis di bacaan, bisa jadi jawaban yang diinginkan merupakan kaitan antar kalimat atau kejadian dalam bacaan tersebut (hasil konsekuensi logis).''',
    "twk-rangkuman-temenasn-s01": '''## Sejarah Perumusan Pancasila

Berikut adalah tokoh-tokoh yang mengusulkan konsep dasar negara dalam sidang pertama BPUPKI.

Muh. Yamin dalam pidatonya pada tanggal 29 Mei 1945, mengemukakan:

1. Peri kebangsaan.
2. Peri kemanusiaan.
3. Peri ketuhanan.
4. Peri kerakyatan.
5. Kesejahteraan rakyat.

2. Soepomo

Soepomo dalam pidatonya pada tanggal 31 Mei 1945, mencetuskan:

1. Persatuan.
2. Kekeluargaan.
3. Keseimbangan lahir batin.
4. Musyawarah.
5. Keadilan rakyat.''',
    "twk-rangkuman-temenasn-s02": '''## Usulan Ir. Soekarno, 1 Juni 1945

Ir. Soekarno dalam pidatonya pada tanggal 1 Juni 1945 mengusulkan lima dasar negara:

1. Kebangsaan Indonesia.
2. Internasionalisme atau perikemanusiaan.
3. Mufakat atau demokrasi.
4. Kesejahteraan sosial.
5. Ketuhanan Yang Maha Esa.

## Panitia Sembilan dan Piagam Jakarta

Usulan rumusan Pancasila dari ketiga tokoh tersebut dibahas lebih lanjut oleh para anggota panitia kecil BPUPKI yang disebut Panitia Sembilan. Panitia Sembilan berhasil menyusun sebuah piagam yang dikenal dengan Piagam Jakarta (Jakarta Charter) pada tanggal 22 Juni 1945, yang di dalamnya terdapat rumusan Pancasila sebagai berikut:

1. Ketuhanan, dengan kewajiban menjalankan syariat Islam bagi pemeluk-pemeluknya.
2. Kemanusiaan yang adil dan beradab.
3. Persatuan Indonesia.
4. Kerakyatan yang dipimpin oleh hikmah kebijaksanaan dalam permusyawaratan perwakilan.
5. Keadilan sosial bagi seluruh rakyat Indonesia.

Namun, sebelum pengesahan UUD 1945 pada tanggal 18 Agustus 1945, kalimat sila pertama rumusan Pancasila telah diganti menjadi "Ketuhanan Yang Maha Esa".''',
    "twk-rangkuman-temenasn-s03": '''
## Alasan Pemberhentian (Pasal 7A UUD 1945)

Presiden dan/atau Wakil Presiden dapat diberhentikan MPR atas usul DPR, apabila terbukti:

- Melakukan pelanggaran hukum berupa pengkhianatan terhadap negara, korupsi, penyuapan, tindak pidana berat lainnya, atau perbuatan tercela.
- Tidak lagi memenuhi syarat sebagai Presiden dan/atau Wakil Presiden.

## Tahapan Prosedur (Pasal 7B UUD 1945)

1. **DPR menyampaikan pendapat** bahwa Presiden dan/atau Wakil Presiden melanggar hukum atau tidak lagi memenuhi syarat.
2. **DPR meminta pertimbangan Mahkamah Konstitusi** untuk memeriksa, mengadili, dan memutus pendapat DPR itu. Permintaan ini butuh dukungan minimal 2/3 anggota DPR yang hadir dalam sidang yang dihadiri minimal 2/3 anggota DPR.
3. **Mahkamah Konstitusi memutus paling lama 90 hari** setelah permintaan DPR itu diterima.
4. **Jika Mahkamah Konstitusi memutuskan terbukti**, DPR bersidang paripurna untuk meneruskan usul pemberhentian ke MPR.
5. **MPR wajib bersidang paling lambat 30 hari** sejak menerima usul DPR tersebut.
6. **MPR memutuskan dalam rapat paripurna** yang dihadiri minimal 3/4 anggota dan disetujui minimal 2/3 anggota yang hadir, setelah Presiden dan/atau Wakil Presiden diberi kesempatan menjelaskan.
7. **Keputusan MPR bersifat final**.

Pasal 7C UUD 1945: Presiden tidak dapat membubarkan DPR.

## Ringkasan Isi UUD 1945

- **BAB 1, Bentuk dan Kedaulatan (Pasal 1)**: Indonesia adalah Negara Kesatuan Republik Indonesia.
- Kedaulatan berada di tangan rakyat dan dilaksanakan sesuai Undang-Undang Dasar.
- Indonesia adalah negara hukum.
- **BAB 2, MPR (Pasal 2-3)**: anggota MPR terdiri atas anggota DPR dan DPD.
- MPR bersidang sedikitnya sekali dalam 5 tahun di ibu kota.
- Putusan MPR ditetapkan dengan suara terbanyak.
- MPR berwenang mengubah dan menetapkan UUD, melantik, dan memberhentikan Presiden dan/atau Wakil Presiden.
- **BAB 3, Kekuasaan Pemerintahan Negara (Pasal 4-16)**: Presiden memegang kekuasaan pemerintahan dan dibantu Wakil Presiden.
- Presiden mengajukan RUU dan menetapkan Peraturan Pemerintah.
- Calon Presiden dan Wakil Presiden wajib warga negara Indonesia.
- Presiden dan Wakil Presiden dipilih langsung oleh rakyat, diusulkan partai politik peserta pemilu.
- Pemenang pilpres meraih lebih dari 50 persen suara dan sedikitnya 20 persen suara di lebih dari separuh provinsi.
- Masa jabatan Presiden dan Wakil Presiden 5 tahun, maksimal 2 periode.
- Jika Presiden mangkat, berhenti, diberhentikan, atau tidak dapat bertugas, digantikan Wakil Presiden.
- Jika jabatan Wakil Presiden kosong, penggantinya dipilih MPR dalam 60 hari.
- Jika keduanya tidak dapat bertugas bersamaan, tugas kepresidenan dijalankan Menteri Luar Negeri, Menteri Dalam Negeri, dan Menteri Pertahanan bersama-sama.
- Presiden memegang kekuasaan tertinggi atas Angkatan Darat, Laut, dan Udara.
- Presiden menyatakan perang dan membuat perjanjian internasional dengan persetujuan DPR.
- Presiden menyatakan keadaan bahaya.
- Presiden mengangkat duta dan konsul dengan pertimbangan DPR.
- Presiden memberi grasi dan rehabilitasi (pertimbangan Mahkamah Agung) serta amnesti dan abolisi (pertimbangan DPR).
- Presiden memberi gelar, tanda jasa, dan tanda kehormatan, serta membentuk dewan pertimbangan.
- **BAB 4, Dewan Pertimbangan Agung**: dihapus dari UUD 1945.
- **BAB 5, Kementerian Negara (Pasal 17)**: Presiden dibantu menteri yang diangkat dan diberhentikan Presiden.
- Menteri membidangi urusan tertentu; pembentukan, pengubahan, dan pembubaran kementerian diatur undang-undang.
- **BAB 6, Pemerintahan Daerah (Pasal 18-18B)**: pemerintahan daerah menjalankan otonomi seluas-luasnya.
- Hubungan pusat dan daerah memperhatikan kekhususan dan keragaman daerah.
- Negara mengakui dan menghormati satuan pemerintahan daerah khusus dan kesatuan masyarakat hukum adat.
- **BAB 7, DPR (Pasal 19-22B)**: anggota DPR dipilih melalui pemilu dan bersidang sedikitnya sekali setahun.
- DPR memegang kekuasaan membentuk undang-undang; RUU dibahas DPR dan Presiden untuk mendapat persetujuan bersama.
- RUU yang tidak disetujui bersama tidak boleh diajukan lagi dalam masa sidang itu.
- RUU yang disetujui bersama sah menjadi undang-undang meski tidak disahkan Presiden dalam 30 hari.
- DPR berfungsi legislasi, anggaran, dan pengawasan, serta berhak interpelasi, angket, dan menyatakan pendapat.
- Dalam kegentingan yang memaksa, Presiden menetapkan Perppu yang harus disetujui DPR, dan jika tidak disetujui harus dicabut.
- **BAB 7A, DPD (Pasal 22C-22D)**: anggota DPD dipilih melalui pemilu.
- DPD dapat mengajukan dan ikut membahas RUU tentang otonomi daerah, serta melakukan pengawasan.
- **BAB 7B, Pemilu (Pasal 22E)**: pemilu dilaksanakan langsung, umum, bebas, rahasia, jujur, dan adil setiap 5 tahun sekali.
- Pemilu memilih anggota DPR, DPD, Presiden dan Wakil Presiden, dan DPRD.
- Peserta pemilu DPR dan DPRD adalah partai politik, sedangkan peserta pemilu DPD adalah perseorangan.
- Pemilu diselenggarakan Komisi Pemilihan Umum yang bersifat nasional, tetap, dan mandiri.
- **BAB 8, Hal Keuangan (Pasal 23-23D)**: APBN ditetapkan dengan undang-undang; RUU APBN diajukan Presiden.
- Jika RUU APBN tidak disetujui DPR, dipakai APBN tahun lalu.
- Pajak diatur undang-undang; mata uang negara ialah rupiah; Bank Sentral ialah Bank Indonesia.
- **BAB 8A, BPK (Pasal 23E-23G)**: Badan Pemeriksa Keuangan memeriksa pengelolaan dan tanggung jawab keuangan negara; hasilnya ditindaklanjuti.
- **BAB 9, Kekuasaan Kehakiman (Pasal 24-25)**: kekuasaan kehakiman merdeka untuk menyelenggarakan peradilan guna menegakkan hukum dan keadilan.
- Mahkamah Agung mengadili pada tingkat kasasi dan menguji peraturan di bawah UU terhadap UU.
- Komisi Yudisial bersifat mandiri, mengusulkan pengangkatan hakim agung, dan menjaga kehormatan hakim.
- Mahkamah Konstitusi menguji undang-undang terhadap UUD, memutus sengketa kewenangan lembaga negara, pembubaran partai politik, dan sengketa hasil pemilu.
- Mahkamah Konstitusi juga memutus pendapat DPR mengenai dugaan pelanggaran Presiden dan/atau Wakil Presiden.
- Syarat menjadi hakim dan pemberhentiannya diatur dengan undang-undang.
- **BAB 9A, Wilayah Negara (Pasal 25A)**: NKRI adalah negara kepulauan berciri Nusantara, dengan wilayah yang batas dan haknya ditetapkan dengan undang-undang.
- **BAB 10, Warga Negara dan Penduduk (Pasal 26-28)**: warga negara ialah orang bangsa Indonesia asli dan orang bangsa lain yang disahkan undang-undang.
- Penduduk ialah warga negara Indonesia dan orang asing yang tinggal di Indonesia.
- Segala warga negara bersamaan kedudukannya dalam hukum dan pemerintahan.
- Tiap warga negara berhak atas pekerjaan dan penghidupan yang layak, dan wajib ikut serta dalam pembelaan negara.
- Kemerdekaan berserikat, berkumpul, dan mengeluarkan pikiran ditetapkan dengan undang-undang.
- **BAB 10A, Hak Asasi Manusia (Pasal 28A-28J)**: hak untuk hidup dan mempertahankan kehidupan (28A).
- Hak berkeluarga dan melanjutkan keturunan, serta perlindungan dari kekerasan (28B).
- Hak mengembangkan diri melalui pendidikan, ilmu pengetahuan, teknologi, seni, dan budaya (28C).
- Hak atas kepastian hukum, pekerjaan dan imbalan layak, kesempatan yang sama dalam pemerintahan, dan status kewarganegaraan (28D).
- Hak memeluk agama dan beribadat, meyakini kepercayaan, dan berserikat, berkumpul, dan berpendapat (28E).
- Hak berkomunikasi dan memperoleh informasi (28F).
- Hak atas perlindungan diri, keluarga, kehormatan, martabat, dan harta benda, serta bebas dari penyiksaan (28G).
- Hak hidup sejahtera lahir dan batin, kemudahan dan perlakuan khusus, jaminan sosial, dan hak milik pribadi (28H).
- Hak untuk hidup, tidak disiksa, dan tidak diperbudak, bebas dari diskriminasi, serta hak masyarakat tradisional (28I).
- Kewajiban menghormati hak orang lain dan tunduk pada pembatasan yang ditetapkan undang-undang (28J).
- **BAB 11, Agama (Pasal 29)**: negara berdasar atas Ketuhanan Yang Maha Esa.
- Negara menjamin kemerdekaan tiap penduduk memeluk agama dan beribadat sesuai agama dan kepercayaannya.
- **BAB 12, Pertahanan dan Keamanan Negara (Pasal 30)**: tiap warga negara berhak dan wajib ikut serta dalam pertahanan dan keamanan negara.
- Usaha pertahanan dan keamanan memakai sistem pertahanan dan keamanan rakyat semesta.
- TNI dan Polri adalah alat negara untuk pertahanan dan keamanan.
- **BAB 13, Pendidikan dan Kebudayaan (Pasal 31-32)**: setiap warga negara berhak mendapat pendidikan.
- Setiap warga negara wajib mengikuti pendidikan dasar yang dibiayai pemerintah.
- Pemerintah menyelenggarakan satu sistem pendidikan nasional.
- Anggaran pendidikan sedikitnya 20 persen dari APBN dan APBD.
- Negara memajukan kebudayaan nasional Indonesia dan menghormati bahasa daerah.
- **BAB 14, Perekonomian Nasional dan Kesejahteraan Sosial (Pasal 33-34)**: perekonomian disusun sebagai usaha bersama berdasar asas kekeluargaan.
- Cabang produksi yang penting dan menguasai hajat hidup orang banyak dikuasai negara.
- Bumi, air, dan kekayaan alam dikuasai negara untuk sebesar-besar kemakmuran rakyat.
- Fakir miskin dan anak terlantar dipelihara negara; negara mengembangkan jaminan sosial dan menyediakan fasilitas kesehatan dan pelayanan umum yang layak.
- **BAB 15, Bendera, Bahasa, Lambang, dan Lagu Kebangsaan (Pasal 35-36C)**: bendera negara ialah Sang Merah Putih; bahasa negara ialah Bahasa Indonesia.
- Lambang negara ialah Garuda Pancasila bersemboyan Bhinneka Tunggal Ika; lagu kebangsaan ialah Indonesia Raya.
- **BAB 16, Perubahan UUD (Pasal 37)**: usul perubahan pasal UUD diajukan tertulis dan diagendakan dalam sidang MPR.
- Sidang perubahan UUD dihadiri minimal 2/3 jumlah anggota MPR.
- Putusan perubahan diambil dengan persetujuan minimal 50 persen ditambah 1 anggota dari seluruh anggota MPR.
- Bentuk Negara Kesatuan Republik Indonesia tidak dapat diubah.

## Amandemen UUD 1945

UUD 1945 diamandemen sebanyak 4 kali:

1. Amandemen pertama: 19 Oktober 1999.
2. Amandemen kedua: 18 Agustus 2000.
3. Amandemen ketiga: 9 November 2001.
4. Amandemen keempat: 10 Agustus 2002.
''',
    "twk-rangkuman-temenasn-s04": '''## 1. Bela Negara

Bela negara adalah sikap dan tindakan semua orang sesuai dengan kewajibannya (berdasarkan pekerjaan dan status) untuk mendukung tujuan negara. Bela negara bisa dilakukan secara fisik dan non-fisik.

- Secara fisik meliputi perjuangan untuk berperang apabila ada serangan dari negara asing terhadap kedaulatan bangsa.
- Secara non-fisik meliputi seluruh usaha untuk menjaga bangsa serta kedaulatan negara melalui proses peningkatan nasionalisme masing-masing rakyat. Selain itu, bela negara juga bisa dilakukan dengan cara berperan aktif untuk mewujudkan kemajuan bangsa dan negara.

Contoh kasus: perjuangan para atlet untuk menjuarai kompetisi dan memperoleh medali, serta mengharumkan nama bangsa (berhubungan dengan pelaksanaan wewenangnya sebagai atlet).

## 2. Patriotisme

Patriotisme adalah sikap seseorang yang bersedia mengorbankan segalanya (melebihi kewajiban) untuk kemakmuran dan kejayaan tanah air, serta tujuan negara. Untuk memiliki jiwa patriotisme, seseorang harus mempunyai rasa nasionalisme.

Contoh kasus: atlet yang menjuarai Olimpiade Tokyo 2020 ikut mendirikan sekolah di Indonesia (melampaui wewenangnya sebagai seorang atlet, dengan ikut peduli mengenai pendidikan).

## 3. Nasionalisme

Nasionalisme adalah kecintaan dan kesadaran dalam proses berkehidupan dalam negara dan bangsa, serta upaya untuk menumbuhkan rasa cinta pada tanah air. Sederhananya, nasionalisme yaitu sikap dan tindakan semua orang untuk identitas negara.

Contoh kasus: atlet dan/atau suporter dari Indonesia menggunakan kostum dengan paduan merah dan putih (mewakili lambang negara).

## 4. Cinta Tanah Air

Cinta tanah air adalah cara berpikir, bersikap, dan berbuat yang menunjukkan kecintaan terhadap tanah air dan kesetiaan terhadap bangsa.

Contoh kasus: atlet Indonesia menggunakan sepeda asli Indonesia saat bertanding di Olimpiade Tokyo 2020 (sepeda buatan Indonesia tidak termasuk identitas negara).

## Nilai Dasar Bela Negara: Cinta Tanah Air

Nilai dasar bela negara yang pertama, cinta tanah air, tercermin dalam sikap dan perilaku antara lain:

1. Mencintai, menjaga, dan melestarikan lingkungan hidup.
2. Menghargai dan menggunakan karya anak bangsa.
3. Menggunakan produk dalam negeri.
4. Menjaga dan memahami seluruh ruang wilayah NKRI.
5. Menjaga nama baik bangsa dan negara.
6. Mengenal wilayah tanah air tanpa rasa fanatisme kedaerahan.''',
    "twk-rangkuman-temenasn-s05": '''## 2. Kesadaran Berbangsa dan Bernegara

Nilai dasar bela negara yang kedua, kesadaran berbangsa dan bernegara, tercermin dalam sikap dan perilaku antara lain:

1. Disiplin dan bertanggung jawab terhadap tugas yang dibebankan.
2. Menghargai dan menghormati keanekaragaman suku, agama, ras, dan antar golongan.
3. Mendahulukan kepentingan umum di atas kepentingan pribadi dan golongan.
4. Bangga terhadap bangsa dan negara sendiri.
5. Rukun dan berjiwa gotong royong dalam masyarakat.
6. Menjalankan hak dan kewajiban sesuai peraturan perundang-undangan yang berlaku.''',
    "twk-rangkuman-temenasn-s06": '''## 3. Setia kepada Pancasila

Nilai dasar bela negara yang ketiga, setia kepada Pancasila, tercermin dalam sikap dan perilaku antara lain:

1. Menjalankan kewajiban agama dan kepercayaan secara baik dan benar.
2. Memahami dan mengamalkan nilai-nilai Pancasila dalam kehidupan sehari-hari.
3. Meyakini Pancasila sebagai dasar negara serta menjadikan Pancasila sebagai pemersatu bangsa dan negara.
4. Menerapkan prinsip-prinsip dan nilai-nilai musyawarah mufakat.
5. Menghormati serta menjunjung tinggi Hak Asasi Manusia.
6. Saling membantu dan tolong-menolong antar sesama sesuai nilai-nilai luhur Pancasila untuk mencapai kesejahteraan.''',
    "twk-rangkuman-temenasn-s07": '''## 4. Rela Berkorban untuk Bangsa dan Negara

Nilai dasar bela negara yang keempat, rela berkorban untuk bangsa dan negara, tercermin dalam sikap dan perilaku antara lain:

1. Rela menolong sesama warga negara dan masyarakat yang mengalami kesulitan tanpa melihat latar belakang sosio kulturalnya.
2. Mendahulukan kepentingan bangsa dan negara daripada kepentingan pribadi dan golongan.
3. Menyumbangkan tenaga, pikiran, dan kemampuan untuk kepentingan masyarakat, kemajuan bangsa, dan negara.
4. Membela bangsa dan negara sesuai dengan profesi dan kemampuan masing-masing.
5. Berpartisipasi aktif dan peduli dalam pembangunan masyarakat, bangsa, dan negara.
6. Rela berkorban untuk kepentingan bangsa dan negara tanpa pamrih.''',
    "twk-rangkuman-temenasn-s08": '''## 5. Memiliki Kemampuan Awal Bela Negara

Nilai dasar bela negara yang kelima, memiliki kemampuan awal bela negara, tercermin dalam sikap dan perilaku antara lain:

1. Memiliki kemampuan, integritas, dan kepercayaan diri yang tinggi dalam membela bangsa dan negara.
2. Mempunyai kemampuan memahami dan mengidentifikasi bentuk-bentuk ancaman di lingkungan masing-masing, sehingga selalu siap siaga dan lapor dini atas setiap kegiatan yang merugikan serta mengganggu keamanan dan ketertiban masyarakat di lingkungannya masing-masing.
3. Senantiasa menjaga kesehatannya sehingga memiliki kesehatan fisik dan mental yang baik.
4. Memiliki kecerdasan emosional dan spiritual serta intelegensi yang tinggi.
5. Memiliki pengetahuan tentang kearifan lokal dalam menyikapi setiap ancaman.
6. Memiliki kemampuan dalam memberdayakan kekayaan sumber daya alam dan keragaman hayati.''',
    "twk-rangkuman-temenasn-s09": '''## Mewujudkan Negara yang Berdaulat, Adil, dan Makmur

Nilai-nilai bela negara diarahkan untuk mewujudkan negara yang berdaulat, adil, dan makmur, antara lain melalui:

1. Tidak berputus asa ketika menghadapi persoalan kehidupan bermasyarakat, berbangsa, dan bernegara.
2. Bekerja keras untuk kesejahteraan diri dan masyarakat.
3. Memperjuangkan kedaulatan rakyat, keadilan, dan Hak Asasi Manusia.
4. Mempraktikkan tata kelola pemerintahan yang bersih dan baik (good governance) dalam bermasyarakat, berbangsa, dan bernegara.
5. Menerapkan jiwa, semangat, dan nilai kejuangan 1945.
6. Memanfaatkan kearifan lokal untuk kesejahteraan rakyat.''',
    "twk-rangkuman-temenasn-s10": '''## Pancasila sebagai Ideologi Terbuka

Pancasila hadir sebagai ideologi negara Indonesia melalui proses musyawarah dari berbagai golongan masyarakat.

Pancasila sebagai ideologi terbuka maksudnya adalah ideologi Pancasila tidak kaku dan tidak tertutup, akan tetapi reformatif, dinamis, dan terbuka. Dengan kata lain, Pancasila bisa hidup di berbagai zaman dan mampu mengatur kondisi dinamika masyarakat yang sering mengalami perubahan.

Akan tetapi, keterbukaan ideologi Pancasila bukan berarti mengubah nilai yang ada di dalamnya.

## Tiga Nilai dalam Pancasila sebagai Ideologi Terbuka

### Nilai Dasar

Nilai dasar mencakup ketuhanan, kemanusiaan, persatuan, kerakyatan, dan keadilan. Kelima hal ini adalah pedoman fundamental yang sifatnya universal, mengandung cita-cita negara dan tujuan yang baik dan benar.

### Nilai Instrumental

Nilai instrumental mencakup arahan, kebijakan, strategi, sasaran, dan lembaga yang melaksanakannya. Konsep ini merupakan perkembangan dari nilai dasar. Berkatnya, penyesuaian pelaksanaan dari sesuatu yang dasar akan lebih jelas untuk bisa menyelesaikan masalah yang terjadi.

### Nilai Praksis

Nilai praksis meliputi realisasi dari nilai instrumental yang sifatnya nyata dan bisa digunakan untuk kehidupan bernegara. Dengan nilai ini, Pancasila bisa melakukan pengembangan serta perubahan agar bisa sesuai jika diterapkan dalam kondisi masyarakat Indonesia yang berubah.

## Tiga Dimensi Pancasila sebagai Ideologi Terbuka

Selain nilai, terdapat tiga dimensi yang merupakan syarat Pancasila disebut sebagai ideologi terbuka.

### 1. Dimensi Idealistis

Bagian ini menyangkut nilai dasar yang disebutkan sebelumnya, yakni ketuhanan, kemanusiaan, persatuan, kerakyatan, dan keadilan.

### 2. Dimensi Normatif

Nilai dasar yang terdapat dalam Pancasila harus diperjelas dengan aturan atau sistem norma negara.

### 3. Dimensi Realistis

Poin ini mencerminkan Pancasila bisa hidup dalam segala keadaan yang sedang terjadi di Indonesia. Berkat dimensi ini, realita yang ada di Indonesia bisa diselesaikan dengan keterbukaan ideologi negara.''',
    "twk-rangkuman-temenasn-s12": '''## Butir-Butir Pengamalan Sila Kedua

Sila kedua, Kemanusiaan yang Adil dan Beradab, diamalkan antara lain melalui:

1. Mengakui dan memperlakukan manusia sesuai dengan harkat dan martabatnya sebagai makhluk Tuhan Yang Maha Esa.
2. Mengakui persamaan derajat, persamaan hak dan kewajiban asasi setiap manusia, tanpa membeda-bedakan suku, keturunan, agama, kepercayaan, jenis kelamin, kedudukan sosial, warna kulit, dan sebagainya.
3. Mengembangkan sikap saling mencintai sesama manusia.
4. Mengembangkan sikap saling tenggang rasa dan tepa selira.
5. Mengembangkan sikap tidak semena-mena terhadap orang lain.
6. Menjunjung tinggi nilai-nilai kemanusiaan.
7. Gemar melakukan kegiatan kemanusiaan.
8. Berani membela kebenaran dan keadilan.
9. Bangsa Indonesia merasa dirinya sebagai bagian dari seluruh umat manusia.
10. Mengembangkan sikap hormat menghormati dan bekerja sama dengan bangsa lain.''',
    "twk-rangkuman-temenasn-s13": '''## Butir-Butir Pengamalan Sila Ketiga

Sila ketiga, Persatuan Indonesia, diamalkan antara lain melalui:

1. Mampu menempatkan persatuan, kesatuan, serta kepentingan dan keselamatan bangsa dan negara sebagai kepentingan bersama di atas kepentingan pribadi dan golongan.
2. Sanggup dan rela berkorban untuk kepentingan negara dan bangsa apabila diperlukan.
3. Mengembangkan rasa cinta kepada tanah air dan bangsa.
4. Mengembangkan rasa kebanggaan berkebangsaan dan bertanah air Indonesia.
5. Memelihara ketertiban dunia yang berdasarkan kemerdekaan, perdamaian abadi, dan keadilan sosial.
6. Mengembangkan persatuan Indonesia atas dasar Bhinneka Tunggal Ika.
7. Memajukan pergaulan demi persatuan dan kesatuan bangsa.

## Butir-Butir Pengamalan Sila Keempat

Sila keempat, Kerakyatan yang Dipimpin oleh Hikmat Kebijaksanaan dalam Permusyawaratan/Perwakilan, diamalkan antara lain melalui:

1. Sebagai warga negara dan warga masyarakat, setiap manusia Indonesia mempunyai kedudukan, hak, dan kewajiban yang sama.
2. Tidak boleh memaksakan kehendak kepada orang lain.
3. Mengutamakan musyawarah dalam mengambil keputusan untuk kepentingan bersama.
4. Musyawarah untuk mencapai mufakat diliputi oleh semangat kekeluargaan.
5. Menghormati dan menjunjung tinggi setiap keputusan yang dicapai sebagai hasil musyawarah.
6. Dengan iktikad baik dan rasa tanggung jawab menerima dan melaksanakan hasil keputusan musyawarah.
7. Di dalam musyawarah diutamakan kepentingan bersama di atas kepentingan pribadi dan golongan.
8. Musyawarah dilakukan dengan akal sehat dan sesuai dengan hati nurani yang luhur.
9. Keputusan yang diambil harus dapat dipertanggungjawabkan secara moral kepada Tuhan Yang Maha Esa, menjunjung tinggi harkat dan martabat manusia, nilai-nilai kebenaran dan keadilan, serta mengutamakan persatuan dan kesatuan demi kepentingan bersama.
10. Memberikan kepercayaan kepada wakil-wakil yang dipercayai untuk melaksanakan pemusyawaratan.''',
    "twk-rangkuman-temenasn-s14": '''## Butir-Butir Pengamalan Sila Kelima

Sila kelima, Keadilan Sosial bagi Seluruh Rakyat Indonesia, diamalkan antara lain melalui:

1. Mengembangkan perbuatan yang luhur, yang mencerminkan sikap dan suasana kekeluargaan dan kegotongroyongan.
2. Mengembangkan sikap adil terhadap sesama.
3. Menjaga keseimbangan antara hak dan kewajiban.
4. Menghormati hak orang lain.
5. Suka memberi pertolongan kepada orang lain agar dapat berdiri sendiri.
6. Tidak menggunakan hak milik untuk usaha-usaha yang bersifat pemerasan terhadap orang lain.
7. Tidak menggunakan hak milik untuk hal-hal yang bersifat pemborosan dan gaya hidup mewah.
8. Tidak menggunakan hak milik untuk bertentangan dengan atau merugikan kepentingan umum.
9. Suka bekerja keras.
10. Suka menghargai hasil karya orang lain yang bermanfaat bagi kemajuan dan kesejahteraan bersama.
11. Suka melakukan kegiatan dalam rangka mewujudkan kemajuan yang merata dan berkeadilan sosial.

## 4 Pokok Pikiran dalam Pembukaan UUD 1945

Pada dasarnya, hakikat pokok pikiran Pembukaan UUD 1945 dibagi menjadi 4 (alinea 1-4), yaitu pokok pikiran persatuan, pokok pikiran keadilan sosial, pokok pikiran kedaulatan rakyat, dan pokok pikiran Ketuhanan.''',
    "twk-rangkuman-temenasn-s15": '''## Pokok Pikiran Persatuan

Pokok pikiran pertama dalam Pembukaan UUD 1945 berbunyi bahwa "negara melindungi segenap bangsa Indonesia dan seluruh tumpah darah Indonesia dengan berdasar atas persatuan".

Pokok pikiran tersebut jelas menyatakan bahwa negara siap melindungi bangsanya, serta setiap warga negara wajib mengutamakan kepentingan bersama dibanding kepentingan sendiri atau individualistik dan kepentingan golongan.''',
    "twk-rangkuman-temenasn-s16": '''## Pokok Pikiran Keadilan Sosial

Pokok pikiran yang kedua berbunyi "negara ingin mewujudkan keadilan sosial bagi seluruh rakyat Indonesia".

Pokok pikiran ini merupakan pancaran sila kelima Pancasila, yang dimaksudkan supaya masyarakat memiliki pengertian dan kesadaran akan hak-hak dan kewajiban yang dimiliki oleh setiap individu. Pokok pikiran Pembukaan UUD 1945 ini dibuat dengan berpedoman kepada Pasal 27 sampai 34 UUD 1945.''',
    "twk-rangkuman-temenasn-s17": '''## Pokok Pikiran Kedaulatan Rakyat

Pokok pikiran ketiga merupakan pancaran dari sila keempat Pancasila yang terfokus pada kedaulatan rakyat.

Sebagai negara yang menerapkan sistem demokrasi dan musyawarah mufakat, diharapkan kedaulatan rakyat dan permusyawaratan atau perwakilan dapat berjalan di Indonesia dengan lancar sesuai dengan kaidah kedaulatan rakyat, yaitu kedaulatan dipegang oleh rakyat dan dilaksanakan sesuai dengan Undang-Undang Dasar.

Pokok pikiran ini didasarkan pada Pasal 1 ayat (2) UUD 1945, yang menyatakan bahwa kedaulatan berada di tangan rakyat dan dilaksanakan sesuai dengan Undang-Undang Dasar.''',
    "twk-rangkuman-temenasn-s18": '''## Pokok Pikiran Ketuhanan

Pokok pikiran yang keempat merupakan pancaran dari sila pertama sekaligus sila kedua Pancasila. Pokok pikiran ini berbunyi bahwa "negara berdasarkan atas Ketuhanan Yang Maha Esa, menurut dasar kemanusiaan yang adil dan beradab".

Secara tersirat, pokok pikiran ini menegaskan kepada pemerintah dan perangkat hukum lainnya untuk tetap menerapkan budi pekerti kemanusiaan yang baik dan ketakwaan terhadap Tuhan.''',
    "twk-rangkuman-tryout-s01": '''## Nasionalisme

Jiwa nasionalisme bisa memudar bila ukurannya dipahami hanya sebatas perjuangan fisik saja. Arus globalisasi yang membawa pengaruh negatif juga bisa menggerus nasionalisme.

Nasionalisme Indonesia bersifat **realistis dan terbuka**: fleksibel mengikuti perkembangan zaman, namun tetap mampu menyaring segala bentuk pengaruh luar dan menyesuaikannya dengan kepribadian bangsa.

Pada masa kolonial, pendidikan sangat terbatas dan bercorak Barat, sehingga kurang selaras dengan nilai dan norma luhur masyarakat Indonesia.

## Integritas dan antikorupsi

### Gratifikasi

Pejabat negara wajib melayani publik dengan baik. Karena itu, menerima suatu kenikmatan karena jabatan dapat dianggap sebagai **gratifikasi**. Ada dua kategori:

- **Gratifikasi yang dianggap suap:** diberikan kepada pegawai negeri atau pejabat negara untuk mempercepat proses pelayanan, menjamin pelayanan selesai tepat waktu, atau memengaruhi keputusan, sehingga tidak sesuai dengan kode etik.
- **Gratifikasi yang tidak dianggap suap:** diberikan kepada pegawai negeri atau pejabat negara dan tidak berlawanan dengan kewajiban atau tugasnya.

Gratifikasi dilarang karena dianggap sebagai akar korupsi. Gratifikasi dapat mendorong pejabat negara atau penyelenggara negara bersikap tidak objektif, tidak adil, dan tidak profesional, sehingga tidak dapat melaksanakan tugasnya dengan baik.

### Rumus korupsi

Perilaku korupsi punya pola yang umum terjadi: seseorang mudah melakukan korupsi karena adanya kekuasaan ditambah kesempatan, serta didukung oleh rendahnya integritas.

Rumusnya: **korupsi muncul dari kekuasaan ditambah kesempatan, dikurangi integritas**.

### Tanggung jawab

Tanggung jawab adalah menanggung segala akibat dari perbuatan yang telah dilakukan. Bagi seorang pemimpin yang berintegritas, langkah tegas yang dilakukan adalah introspeksi dan berkomitmen untuk berubah.

### Sembilan nilai antikorupsi dalam kehidupan sehari-hari

- **Jujur:** kasir yang memberikan kembalian yang benar kepada pelanggan, padahal ia bisa saja mengambil sebagian uang itu.
- **Peduli:** relawan yang membantu membersihkan taman di lingkungannya.
- **Mandiri:** siswa yang belajar dengan giat dan menyelesaikan tugasnya tanpa mencontek.
- **Disiplin:** polisi yang mengikuti hukum dan menegakkannya dengan adil.
- **Tanggung jawab:** orang tua yang merawat anak-anaknya dan memberi mereka rumah yang aman dan penuh kasih.
- **Kerja keras:** petani yang bekerja berjam-jam untuk memanen hasil taninya.
- **Sederhana:** dokter yang hidup bersahaja dan menyumbangkan waktunya untuk amal.
- **Berani:** pelapor pelanggaran (whistleblower) yang melaporkan korupsi meski berisiko kehilangan pekerjaannya.
- **Adil:** hakim yang memutuskan perkara berdasarkan hukum dan bukti, tanpa memihak.

Dedikasi dan pengabdian guru di daerah 3T (terdepan, terluar, tertinggal) dalam mencerdaskan anak bangsa di daerah terpencil adalah contoh sikap ikhlas dan penuh tanggung jawab, meski harus menghadapi berbagai tantangan.

## Bela negara

Alasan pentingnya upaya pembelaan negara antara lain:

- Menjaga keutuhan wilayah negara.
- Mempertahankan negara dari berbagai ancaman.
- Merupakan hak sekaligus kewajiban setiap warga negara.
- Membentuk jiwa solidaritas antar sesama rekan seperjuangan.
- Membentuk sikap disiplin waktu, aktivitas, dan pengaturan kegiatan lain.
- Membentuk mental dan fisik yang tangguh.

Contoh ancaman nonmiliter: pengaruh gaya hidup kebarat-baratan, tidak mencintai budaya sendiri, dan tidak menggunakan produk dalam negeri.

## Istilah yang sering muncul

- **Konflik:** percekcokan, perselisihan, pertentangan.
- **Egoisme:** tingkah laku yang didasarkan atas dorongan untuk keuntungan diri sendiri daripada untuk kesejahteraan orang lain.
- **Cultural lag:** kondisi di mana terjadi perbedaan taraf kemajuan antara berbagai bagian dalam suatu kebudayaan, karena ada yang tumbuh cepat dan ada yang tumbuhnya lambat.
- **Etnosentrisme:** sikap yang berlandaskan pada kelompok atau kebudayaannya sendiri (cinta suku bangsa yang berlebihan).

## Pergerakan nasional dan persatuan Indonesia

Gagasan persatuan Indonesia berkembang secara bertahap melalui pergerakan nasional:

- **Budi Utomo (1908):** mencetuskan persatuan bangsa melalui pendidikan.
- **Sarekat Dagang Islam (1911), lalu menjadi Sarekat Islam:** mempersatukan umat Islam melawan penjajah.
- **Indische Partij (1912):** menuntut kemerdekaan dan persatuan Hindia Belanda.
- **Kongres Pemuda II (1928):** mencetuskan Sumpah Pemuda yang menjunjung tinggi persatuan bangsa.

## Pancasila, Pembukaan, dan Batang Tubuh UUD 1945

Pancasila, Pembukaan UUD 1945, dan Batang Tubuh UUD 1945 punya hubungan kausal organis: Pancasila sebagai dasar negara dijabarkan dalam Pembukaan UUD 1945, dan Pembukaan dijabarkan lebih lanjut dalam Batang Tubuh.

Karena itu Pembukaan UUD 1945 berkedudukan lebih tinggi dibanding Batang Tubuh. Dalam hubungan ini ditegaskan pula bahwa negara Indonesia berbentuk republik dan kedaulatan negara berada di tangan rakyat.

Pancasila adalah ideologi dan salah satu sarana pemersatu bangsa dan negara, karena Pancasila merupakan perjanjian luhur bangsa Indonesia.

**Pandangan hidup bangsa** adalah nilai yang dimiliki oleh suatu bangsa yang diyakini kebenarannya, sehingga menumbuhkan tekad untuk mewujudkannya. Pandangan hidup bangsa Indonesia adalah Pancasila.

Pembukaan UUD 1945 bernilai **universal**, artinya dijunjung tinggi oleh bangsa-bangsa di seluruh dunia. Pembukaan juga bernilai **lestari**, artinya mampu menampung dinamika masyarakat dan tetap menjadi landasan perjuangan bangsa dan negara.

Pembukaan UUD 1945 alinea pertama berbunyi: "Bahwa sesungguhnya Kemerdekaan itu ialah hak segala bangsa dan oleh sebab itu, maka penjajahan di atas dunia harus dihapuskan, karena tidak sesuai dengan peri-kemanusiaan dan peri-keadilan."

Pembukaan UUD 1945 juga menyatakan tujuan Pemerintah Negara Indonesia: melindungi segenap bangsa Indonesia dan seluruh tumpah darah Indonesia, memajukan kesejahteraan umum, mencerdaskan kehidupan bangsa, dan ikut melaksanakan ketertiban dunia.

## Wawasan Nusantara

Wawasan Nusantara adalah cara pandang dan sikap bangsa mengenai diri dan lingkungannya yang serba beragam dan bernilai strategis.

Cara pandang ini mengutamakan persatuan dan kesatuan bangsa serta wilayah dalam kehidupan bermasyarakat, berbangsa, dan bernegara, demi mencapai tujuan nasional.

## Fungsi DPR dan kewarganegaraan

Berdasarkan Pasal 20A ayat (1) UUD 1945, fungsi DPR meliputi:

- **Fungsi legislasi:** DPR memegang kekuasaan membentuk undang-undang bersama Presiden.
- **Fungsi anggaran:** DPR membahas dan memberikan persetujuan atau tidak memberikan persetujuan terhadap rancangan undang-undang tentang APBN yang diajukan Presiden.
- **Fungsi pengawasan:** DPR melaksanakan pengawasan atas pelaksanaan undang-undang.

**Asas ius soli secara terbatas** adalah asas yang menentukan kewarganegaraan seseorang berdasarkan negara tempat kelahiran, yang diberlakukan terbatas bagi anak-anak sesuai dengan ketentuan yang diatur dalam undang-undang.

## Deklarasi Juanda

Deklarasi Juanda menyatakan bahwa seluruh wilayah perairan di antara pulau-pulau Indonesia menjadi wilayah kedaulatan Indonesia. Deklarasi ini diumumkan pada 13 Desember 1957 oleh Perdana Menteri Djuanda Kartawidjaja.

Sebelum Deklarasi Juanda, wilayah perairan Indonesia sangat terbatas, hanya sejauh 3 mil laut dari garis pantai. Wilayah perairan di luar garis 3 mil laut dianggap laut bebas dan di luar wilayah kedaulatan Indonesia.

Akibatnya pulau-pulau Indonesia terpisah-pisah oleh laut, selat, dan teluk antar pulau. Misalnya, Pulau Kalimantan dan Pulau Jawa terpisah oleh Laut Jawa.

Wilayah Laut Jawa yang berada lebih dari 3 mil laut di luar garis pantai Pulau Kalimantan dan Pulau Jawa dianggap laut lepas. Sehingga Pulau Jawa dan Kalimantan dipisahkan oleh laut lepas yang bukan wilayah Indonesia saat itu.

Setelah Deklarasi Juanda diumumkan, batas wilayah perairan Indonesia diperpanjang hingga 12 mil laut dari garis pantai, dan laut-laut antar pulau menjadi wilayah laut teritorial.

Lautan pun menjadi pemersatu wilayah negara kepulauan Indonesia, bukan lagi pemisah.

Indonesia memiliki kekuasaan untuk mengelola wilayah laut teritorial ini dan berhak membatasi tindakan kapal negara asing di sini. Wilayah ini menjadi tanggung jawab keamanan dan penegakan hukum Indonesia.''',
}

# Judul yang dirapikan bersama tulis ulang (hanya judul yang rusak/terpotong).
READABILITY_TITLES = {
    'tiu-hitung-cepat-s02': 'A. Jenis-Jenis Bilangan',
    'tiu-hitung-cepat-s06': 'Contoh: Mengubah dan Mengurutkan Pecahan',
    'tiu-hitung-cepat-s09': 'F. Tangga Satuan',
    'tiu-modul-s04': 'Daftar Sinonim (A)',
    'tiu-modul-s05': 'Daftar Sinonim (B-Z)',
    'tiu-modul-s07': 'Trik Antonim dan Daftar Antonim (A)',
    'tiu-modul-s09': 'Daftar Antonim (C-W)',
    'tiu-modul-s14': 'A. Macam-Macam Bilangan',
    'tiu-modul-s26': 'Operasi Pecahan Desimal, Perbandingan, dan Skala',
    'tiu-modul-s38': 'C. Segitiga Tumpul dan Teorema Pythagoras',
    'tiu-modul-s50': 'Pembahasan: Urutan Data Tinggi Badan',
    'tkp-modul-s13': 'M. Aspek Kepercayaan Diri',
    'twk-keyword-bela-negara-s01': 'Bela Negara, Nasionalisme, Patriotisme, dan Cinta Tanah Air',
    'twk-modul-ringkasan-s06': 'F. Sikap Positif terhadap Pancasila',
    'twk-modul-ringkasan-s07': 'A. Hakikat Konstitusi',
    'twk-modul-ringkasan-s08': 'B. Macam-Macam Konstitusi dan Sistematika UUD 1945',
    'twk-modul-ringkasan-s10': 'C. Amandemen UUD 1945',
    'twk-modul-ringkasan-s11': 'Ringkas 3: Bhinneka Tunggal Ika: A. Sejarah Penemuan Bhinneka Tunggal Ika',
    'twk-modul-ringkasan-s15': 'E. Prinsip Bhinneka Tunggal Ika',
    'twk-modul-ringkasan-s17': 'G. Prinsip-Prinsip yang Terkandung dalam Bhinneka Tunggal Ika',
    'twk-modul-ringkasan-s21': 'C. Lanjutan Pemilu dan Hakikat Kedaulatan',
    'twk-modul-ringkasan-s25': 'P. Sistem Pemerintahan di Indonesia',
    'twk-modul-ringkasan-s26': 'O. Tata Urutan Perundang-undangan Nasional',
    'twk-modul-ringkasan-s27': 'C. Peraturan Desa dan Peraturan Perundang-undangan',
    'twk-modul-ringkasan-s36': 'G. Cara Menangani Pelanggaran HAM',
    'twk-modul-ringkasan-s38': 'B. Faktor-Faktor yang Mendorong Timbulnya Pergerakan Nasional',
    'twk-modul-ringkasan-s40': 'Lanjutan Organisasi Pergerakan dan Pendudukan Militer Jepang',
    'twk-modul-ringkasan-s42': 'F. Badan Penyelidik Usaha-Usaha Persiapan Kemerdekaan Indonesia (BPUPKI)',
    'twk-modul-ringkasan-s43': 'G. Panitia Persiapan Kemerdekaan Indonesia (PPKI)',
    'twk-modul-ringkasan-s48': 'A. Peranan Perserikatan Bangsa-Bangsa',
    'twk-modul-ringkasan-s49': 'B. Peranan Konferensi Asia di New Delhi',
    'twk-modul-ringkasan-s52': 'D. Association of Southeast Asian Nations (ASEAN)',
    'twk-modul-ringkasan-s54': 'C. Tujuan PBB dan Peranan Indonesia',
    'twk-modul-ringkasan-s57': 'B. Ejaan yang Disempurnakan (EYD)',
    'twk-modul-ringkasan-s58': 'M. Tanda Baca, Kata, dan Tata Kalimat',
    'twk-rangkuman-temenasn-s03': 'Prosedur Pemberhentian Presiden dan Ringkasan UUD 1945',
}

# Poin inti per seksi (v2.5): 3-5 butir ringkasan singkat, ditampilkan sebagai
# kartu callout di halaman baca. Mencakup SEMUA seksi (284), bukan hanya yang
# ditulis ulang. Map diisi dari file rewrite kurator (/tmp/rewrite-*.py).
POIN_INTI = {
    'tiu-analogi-verbal-s01': ['Analogi verbal adalah soal mencari pasangan kata yang hubungannya sama dengan pasangan kata yang diketahui.', 'Soal ini menguji logika, daya nalar, pengetahuan umum, dan kemampuan berpikir abstrak.', 'Kunci analogi adalah memahami makna tersirat dari kata, bukan sekadar hafalan kosakata.'],
    'tiu-analogi-verbal-s02': ['Analogi dua kata meminta kita mencari pasangan kata lain dengan hubungan yang sama.', 'Pada analogi kalimat, fokuslah pada hubungan subjek dan objek di dalam kalimat.', 'Objek biasanya berada setelah predikat atau kata kerja di dalam kalimat.', 'Jawaban benar adalah pasangan yang hubungannya sama persis dengan soal, bukan sekadar mirip.'],
    'tiu-analogi-verbal-s03': ['Delapan pola analogi yang sering muncul meliputi fungsi, sinonim, antonim, dan sebab akibat.', 'Pola umum dan khusus membandingkan kelompok besar dengan salah satu anggotanya.', 'Pola benda dan bagian membandingkan suatu benda dengan salah satu bagiannya.', 'Kenali dulu jenis hubungannya sebelum memilih pasangan jawaban yang sepadan.'],
    'tiu-analogi-verbal-s04': ['Analogi tiga kata berbentuk A : B : C = D : E : F.', 'Rumuskan hubungan ketiga kata soal dalam satu kalimat sebelum menilai kelompok pembanding.', 'Pola yang sering muncul antara lain hierarki, bagian ke keseluruhan, dan kategori dengan anggotanya.', 'Urutan kata adalah bagian dari pola, jadi kelompok dengan urutan tertukar adalah jawaban salah.', 'Jebakan paling umum adalah kelompok yang hanya dua katanya cocok dengan pola soal.'],
    'tiu-cheat-sheet-s01': ['Kerjakan dalam kurung dulu, lalu kali dan bagi, terakhir tambah dan kurang.', 'Hafalkan pasangan persen cepat seperti 25 persen sama dengan 1/4 dan 12,5 persen sama dengan 1/8.', 'Untuk diskon, hitung persen yang dibayar, bukan besar diskonnya.', 'Rata-rata gabungan memakai bobot jumlah siswa, bukan rata-rata dari dua rata-rata.', 'Trik kali 25 adalah bagi 4 lalu kali 100, dan kuadrat bilangan berakhir 5 memakai pola n kali n tambah 1 lalu tempel 25.'],
    'tiu-cheat-sheet-s02': ['Deret aritmetika punya selisih tetap: Un = a + (n - 1) x b, dan jumlahnya Sn = n/2 x (a + Un).', 'Deret geometri punya rasio tetap: Un = a x r^(n - 1), dan jumlahnya Sn = a x (r^n - 1)/(r - 1).', 'Pola umum lain meliputi selisih bertingkat, kuadrat, Fibonacci, dan operasi berulang.', 'Hitung selisih antar suku dulu, lalu selisih dari selisihnya bila belum tetap.', 'Uji pola pada tiga suku pertama sebelum dipakai.'],
    'tiu-cheat-sheet-s03': ['Jarak sama dengan kecepatan kali waktu, dan kecepatan sama dengan jarak dibagi waktu.', 'Berpapasan menjumlah kecepatan, menyusul mengurang kecepatan.', 'Kerja bersama dua orang selesai dalam (a x b)/(a + b) hari.', 'Soal umur diselesaikan dengan peubah lalu digeser bersama, dan hasilnya dicek ulang.', 'Perbandingan senilai makin banyak makin banyak, berbalik nilai makin banyak pekerja makin cepat selesai.'],
    'tiu-cheat-sheet-s04': ['Rumuskan hubungan dua kata pertama dalam satu kalimat sebelum menilai pasangan pembanding.', 'Pola hubungan yang sering muncul meliputi pelaku dan alat, sebab dan akibat, serta bagian dan keseluruhan.', 'Efektif soal tepat sasaran, sedangkan efisien soal hemat sumber daya.', 'Buang dulu pasangan yang hubungannya jelas beda, biasanya dua atau tiga opsi langsung gugur.', 'Periksa arah hubungan bila dua opsi tampak sama.'],
    'tiu-cheat-sheet-s05': ['Silogisme dasar: semua A adalah B dan semua B adalah C, maka semua A adalah C.', 'Arah silogisme tidak bisa dibalik: semua A adalah B tidak berarti semua B adalah A.', 'Negasi semua A adalah B adalah ada A yang bukan B.', 'Modus ponens: P benar maka Q benar; modus tollens: Q salah maka P salah.', 'Q benar tidak membuktikan P benar, itu jebakan paling umum pada soal jika-maka.'],
    'tiu-cheat-sheet-s06': ['Cari dulu apa yang berubah: bentuk, jumlah, posisi, arah, atau warna.', 'Pola umum meliputi rotasi, pencerminan, penambahan dan pengurangan elemen, serta pergeseran posisi.', 'Pada analogi gambar, tentukan aturan perubahan pasangan pertama lalu terapkan sama persis.', 'Pada ketidaksamaan, cari ciri mayoritas dulu lalu temukan satu pelanggarnya.', 'Bandingkan dua gambar berurutan, catat satu perubahan, lalu uji ke pasangan berikutnya.'],
    'tiu-cheat-sheet-s07': ['Soal kecukupan data menanyakan apakah data yang diberi sudah cukup untuk menjawab pertanyaan, bukan sekadar jawaban akhirnya.', '"Cukup" berarti nilai yang ditanya ditentukan secara unik, hanya ada satu jawaban yang mungkin.', 'Uji pernyataan (1) sendiri, lalu (2) sendiri, baru gabungkan keduanya kalau belum ada yang cukup.', 'Persamaan kuadrat bisa memberi dua nilai, dan persen tanpa nilai dasar tidak memberi nilai mutlak.', 'Satu contoh penyangkal sudah cukup untuk menyatakan sebuah pernyataan tidak cukup.'],
    'twk-uud-1945-kelompok-pasal-s01': ['UUD 1945 lebih gampang dihafal per kelompok pasal daripada satu per satu, karena pasal-pasalnya tersusun rapi per tema.', 'Pasal 26-34 adalah narasi kehidupan warga: kewarganegaraan, hak asasi, agama, pertahanan, pendidikan, kebudayaan, ekonomi, dan kesejahteraan.', 'Pasal 35-36C adalah identitas negara: bendera, bahasa, lambang, dan lagu kebangsaan.', 'Pasal 37 adalah satu-satunya pasal yang mengatur cara mengubah UUD 1945.'],
    'twk-uud-1945-kelompok-pasal-s02': ['Pasal 1: Indonesia adalah negara kesatuan berbentuk republik, kedaulatan di tangan rakyat, dan Indonesia adalah negara hukum.', 'Pasal 2: MPR terdiri atas anggota DPR dan DPD yang dipilih lewat pemilu, bersidang sedikitnya sekali dalam lima tahun.', 'Pasal 3: MPR berwenang mengubah dan menetapkan UUD, melantik Presiden dan Wakil Presiden, dan memberhentikan keduanya menurut UUD.', 'Setelah amandemen, MPR bukan lagi lembaga tertinggi; semua lembaga tinggi negara sederajat.'],
    'twk-uud-1945-kelompok-pasal-s03': ['Pasal 4: Presiden memegang kekuasaan pemerintahan, dibantu satu orang Wakil Presiden.', 'Pasal 6A dan 7: Presiden dan Wakil Presiden dipilih langsung oleh rakyat, masa jabatan lima tahun, dapat dipilih kembali hanya satu kali.', 'Pasal 7A dan 7B: pemberhentian Presiden melewati DPR, MK, lalu MPR, dengan angka kunci 2/3, 90 hari, 30 hari, dan 3/4.', 'Pasal 14: grasi dan rehabilitasi dengan pertimbangan MA, amnesti dan abolisi dengan pertimbangan DPR.', 'Pasal 7C: Presiden tidak dapat membekukan dan/atau membubarkan DPR.'],
    'twk-uud-1945-kelompok-pasal-s04': ['Pasal 17: menteri diangkat dan diberhentikan oleh Presiden, dan tiap menteri membidangi urusan tertentu.', 'Pasal 18: NKRI dibagi atas provinsi, lalu kabupaten dan kota, masing-masing punya pemerintahan daerah dan DPRD.', 'Pasal 18: daerah menjalankan otonomi seluas-luasnya, kecuali urusan yang ditentukan sebagai urusan Pemerintah Pusat.', 'Pasal 18B: negara mengakui daerah khusus atau istimewa dan kesatuan masyarakat hukum adat.'],
    'twk-uud-1945-kelompok-pasal-s05': ['Pasal 20: DPR memegang kekuasaan membentuk undang-undang, dan rancangan yang tidak disahkan Presiden dalam 30 hari tetap sah menjadi undang-undang.', 'Pasal 20A: DPR punya fungsi legislasi, anggaran, dan pengawasan, serta hak interpelasi, angket, dan menyatakan pendapat.', 'Pasal 22: Perpu ditetapkan Presiden dalam hal ihwal kegentingan yang memaksa dan harus mendapat persetujuan DPR.', 'Pasal 19: anggota DPR dipilih melalui pemilihan umum dan DPR bersidang sedikitnya sekali dalam setahun.'],
    'twk-uud-1945-kelompok-pasal-s06': ['Pasal 22C: anggota DPD dipilih dari setiap provinsi, jumlah tiap provinsi sama, dan totalnya tidak lebih dari 1/3 jumlah anggota DPR.', 'Pasal 22D: DPD mengurusi rancangan undang-undang soal daerah, sumber daya alam, dan perimbangan keuangan, serta mengawasi pelaksanaannya.', 'Pasal 22E: pemilu dilaksanakan secara langsung, umum, bebas, rahasia, jujur, dan adil setiap lima tahun sekali.', 'Peserta pemilu DPD adalah perseorangan, sedangkan peserta pemilu DPR dan DPRD adalah partai politik.'],
    'twk-uud-1945-kelompok-pasal-s07': ['Pasal 23: APBN ditetapkan tiap tahun dengan undang-undang, dan kalau DPR tidak menyetujui, Pemerintah menjalankan APBN tahun lalu.', 'Pasal 23A sampai 23D: pajak, mata uang, hal keuangan lain, dan bank sentral diatur dengan undang-undang.', 'Pasal 23E: BPK adalah lembaga bebas dan mandiri yang memeriksa pengelolaan dan tanggung jawab keuangan negara.', 'Pasal 23F dan 23G: anggota BPK dipilih DPR dengan pertimbangan DPD, dan BPK punya perwakilan di setiap provinsi.'],
    'twk-uud-1945-kelompok-pasal-s08': ['Pasal 24: kekuasaan kehakiman merdeka, dilakukan oleh MA beserta badan peradilan di bawahnya dan oleh MK.', 'Pasal 24A: MA mengadili tingkat kasasi dan menguji peraturan di bawah undang-undang terhadap undang-undang.', 'Pasal 24C: MK menguji undang-undang terhadap UUD dan putusannya bersifat final, dengan sembilan hakim konstitusi.', 'Pasal 24B: KY mengusulkan pengangkatan hakim agung dan menjaga kehormatan serta perilaku hakim.', 'Pasal 25A: NKRI adalah negara kepulauan yang berciri Nusantara.'],
    'twk-uud-1945-kelompok-pasal-s09': ['Pasal 26: warga negara adalah orang Indonesia asli dan orang bangsa lain yang disahkan dengan undang-undang; penduduk juga mencakup orang asing yang tinggal di Indonesia.', 'Pasal 27: semua warga negara sama kedudukannya di dalam hukum dan pemerintahan, berhak atas pekerjaan dan penghidupan yang layak, dan wajib ikut bela negara.', 'Pasal 28A sampai 28J memuat sepuluh pasal HAM, dari hak hidup sampai kewajiban menghormati HAM orang lain.', 'Pasal 28I: ada hak asasi yang tidak dapat dikurangi dalam keadaan apa pun, antara lain hak hidup dan hak beragama.', 'Pasal 28J: setiap orang wajib menghormati HAM orang lain dan tunduk pada pembatasan yang ditetapkan dengan undang-undang.'],
    'twk-uud-1945-kelompok-pasal-s10': ['Pasal 29: negara berdasar atas Ketuhanan Yang Maha Esa dan menjamin kemerdekaan tiap penduduk untuk memeluk agama dan beribadat.', 'Pasal 30: pertahanan dan keamanan memakai sistem rakyat semesta, TNI dan Polri sebagai kekuatan utama, rakyat sebagai kekuatan pendukung.', 'Pasal 31: setiap warga negara berhak mendapat pendidikan, dan anggaran pendidikan sekurang-kurangnya 20% dari APBN dan APBD.', 'Pasal 33: perekonomian disusun sebagai usaha bersama berdasar asas kekeluargaan, dan kekayaan alam dikuasai negara untuk kemakmuran rakyat.', 'Pasal 34: fakir miskin dan anak terlantar dipelihara oleh negara, dengan sistem jaminan sosial bagi seluruh rakyat.'],
    'twk-uud-1945-kelompok-pasal-s11': ['Pasal 35: bendera negara ialah Sang Merah Putih.', 'Pasal 36: bahasa negara ialah Bahasa Indonesia.', 'Pasal 36A: lambang negara ialah Garuda Pancasila dengan semboyan Bhinneka Tunggal Ika.', 'Pasal 36B: lagu kebangsaan ialah Indonesia Raya.', 'Pasal 36C: ketentuan lebih lanjut tentang identitas negara diatur dengan undang-undang.'],
    'twk-uud-1945-kelompok-pasal-s12': ['Pasal 37 ayat 1: usul perubahan UUD diajukan sekurang-kurangnya 1/3 anggota MPR.', 'Pasal 37 ayat 3 dan 4: sidang perubahan dihadiri sekurang-kurangnya 2/3 anggota MPR dan putusannya disetujui sekurang-kurangnya 50% ditambah satu anggota.', 'Pasal 37 ayat 5: bentuk Negara Kesatuan Republik Indonesia tidak dapat dilakukan perubahan.', 'Angka kunci lain: 30 hari untuk pengesahan RUU, 60 hari untuk kekosongan Wakil Presiden, 90 hari untuk putusan MK, dan 20% untuk anggaran pendidikan.'],
    'tiu-handbook-figural-s02': ['Gambar adalah kumpulan data, bukan satu objek visual utuh.', 'Satu gambar bisa menyimpan banyak variabel sekaligus, seperti jumlah, bentuk, rotasi, posisi, dan arsiran.', 'Rotasi mengubah orientasi, pencerminan membalik hubungan kiri-kanan, dan perpindahan hanya mengubah letak.', 'Nyatakan pola secara spesifik, misalnya berputar 90 derajat searah jarum jam setiap tahap.', 'Gunakan J-R-A-P untuk memeriksa jumlah, rotasi, arsiran, dan posisi secara berurutan.'],
    'tiu-handbook-figural-s03': ['Analogi meminta kita menemukan transformasi dari A ke B lalu menerapkannya pada C.', 'Tugasnya bukan mencari gambar yang mirip B, melainkan menemukan hubungan A terhadap B.', 'Fokus dulu pada A ke B, nyatakan transformasinya, lalu prediksi D sebelum melihat opsi.', 'Soal kompleks bisa memakai transformasi gabungan, jadi pecah menjadi variabel dan analisis satu per satu.', 'Pengecoh sering hanya melanggar satu aturan, jadi tanyakan variabel apa yang salah pada tiap pilihan.'],
    'tiu-handbook-figural-s04': ['Ketidaksamaan meminta kita mencari satu gambar yang melanggar karakteristik mayoritas.', 'Carilah persamaan mayoritas dulu, jangan mencari gambar yang terlihat paling aneh.', 'Pembeda bisa berupa jumlah, relasi dalam-luar, simetri, atau hasil pencerminan.', 'Aturan yang baik harus menjelaskan seluruh anggota kelompok secara konsisten.', 'Pola 4:1 adalah petunjuk kuat, bukan aturan mutlak, dan variabel kedua bisa mengubahnya.'],
    'tiu-handbook-figural-s05': ['Pola serial tidak boleh disimpulkan dari satu transisi saja, verifikasi dulu ke transisi berikutnya.', 'Pola umum serial adalah rotasi tetap, jumlah, posisi, arsiran, bentuk siklis, dan selang-seling.', 'Kalau perubahan tampak tidak konsisten, pisahkan posisi ganjil dan genap menjadi dua rangkaian.', 'Serial bisa memakai beberapa variabel sekaligus, dan prediksi harus memenuhi semuanya.', 'Untuk siklus, sisa pembagian menentukan posisi tahap ke-n dalam siklus.'],
    'tiu-handbook-figural-s06': ['Bentuk prediksi dulu sebelum bergantung pada pilihan jawaban.', 'Analisis satu variabel sekali waktu, lalu gabungkan hasilnya.', 'Tanyakan selalu apa yang berubah dan apa yang tetap.', 'Aturan harus konsisten dengan seluruh data, dan pola sederhana yang konsisten lebih baik dari yang rumit.', 'Soal yang terlalu lama dikerjakan sebaiknya ditinggal dulu dan dikunjungi lagi kalau waktu memungkinkan.'],
    'tiu-handbook-figural-s07': ['Jebakan umum adalah mengira rotasi sebagai cermin, atau posisi sebagai rotasi.', 'Jangan hanya melihat bentuk luar, hitung juga elemen internal dan arsirannya.', 'Satu transisi serial tidak cukup, dan pola 4:1 tidak boleh dipakai tanpa menguji variabel kedua.', 'Kalau dua aturan berjalan bersamaan, pisahkan masing-masing variabel.', 'Kalau pola terasa terlalu rumit, kembali ke variabel objektif yang mudah diuji.'],
    'tiu-handbook-figural-s08': ['Saat soal muncul, tanyakan jumlah, arah, posisi, arsiran, apa yang berubah, dan apa yang tetap.', 'Enam pertanyaan pertama ini memisahkan gambar menjadi variabel yang bisa diuji.', 'Kalau pola belum terlihat, periksa pencerminan, ganjil-genap, dan terbuka-tertutup.', 'Periksa juga kemungkinan dua pola berselang-seling atau dua variabel yang berubah bersamaan.'],
    'tiu-handbook-figural-s10': ['Penguasaan figural bertingkat dari identifikasi sampai kecepatan dan akurasi.', 'Level 1 mengenali variabel, level 2 membedakan transformasi, level 3 mengombinasikan dua variabel.', 'Level 4 menangani pola multilayer seperti ganjil-genap, siklus, dan perubahan bertingkat.', 'Target belajar adalah memahami struktur logika pola, bukan sekadar pernah melihat jenis soal.'],
    'tiu-handbook-figural-s11': ['Saat salah menjawab, catat penyebabnya, bukan hanya jawaban yang benar.', 'Kesalahan bisa diklasifikasikan dari tidak menemukan pola sampai terpancing pilihan jawaban.', 'Petunjuk yang terlewat, seperti arsiran yang berubah, harus dicatat agar tidak terulang.', 'Kalau satu jenis kesalahan berulang, arahkan belajar pada kelemahan itu secara khusus.'],
    'tiu-handbook-figural-s12': ['Tiga kompetensi inti figural adalah analogi, ketidaksamaan, dan serial.', 'Inti analogi adalah transformasi, transfer aturan, dan prediksi.', 'Inti ketidaksamaan adalah karakteristik mayoritas dan satu pelanggar.', 'Inti serial adalah identifikasi, verifikasi, dan lanjutkan.'],
    'tiu-handbook-figural-s13': ['Untuk analogi, tentukan transformasi A ke B lalu terapkan pada C dan prediksi D.', 'Untuk ketidaksamaan, cari karakteristik mayoritas lalu temukan satu pelanggarnya.', 'Untuk serial, uji pola tahap 1 ke 2 dengan tahap 2 ke 3 sebelum memprediksi.', 'Urutan pemeriksaan praktis dimulai dari jumlah, rotasi, arsiran, dan posisi.'],
    'tiu-handbook-figural-s14': ['Figural sebaiknya dikerjakan dengan proses, bukan hanya feeling terhadap gambar.', 'Pisahkan informasi visual menjadi variabel, lalu nyatakan pola secara spesifik.', 'Uji apakah aturan konsisten terhadap seluruh informasi sebelum memprediksi.', 'Alurnya adalah gambar menjadi data, data menjadi pola, pola diverifikasi, lalu dijawab.'],
    'tiu-handbook-figural-s15': ['Tiga kompetensi inti figural adalah analogi, ketidaksamaan, dan serial.', 'Variabel analisis utamanya adalah jumlah, rotasi, posisi, arsiran, bentuk, simetri, dan relasi.', 'Kalau pola rumit, pisahkan variabel, dan kalau gambar hampir sama, hitung komponennya.', 'Aturan emasnya adalah temukan hubungan, uji pola, prediksi hasil, baru pilih jawaban.'],
    'tiu-handbook-numerik-s02': ['TIU Numerik menguji penalaran kuantitatif, bukan sekadar kecepatan menghitung.', 'Empat domain intinya adalah berhitung, deret angka, perbandingan kuantitatif, dan soal cerita.', 'Urutan pengerjaannya adalah pahami, sederhanakan, pilih strategi, hitung, lalu cek.', 'Sederhanakan dulu sebelum menghitung, misalnya 49 kali 51 dihitung lewat selisih kuadrat.'],
    'tiu-handbook-numerik-s03': ['Urutan operasi adalah kurung, pangkat atau akar, kali atau bagi, lalu tambah atau kurang.', 'Tanda sama menghasilkan positif dan tanda beda menghasilkan negatif.', 'Pecahan dijumlahkan setelah penyebut disamakan, dan pembagian pecahan adalah kali kebalikannya.', 'Naik lalu turun dengan persen yang sama tidak kembali ke nilai awal.', 'Diskon bertingkat dikalikan, bukan dijumlahkan, jadi 20 persen lalu 10 persen efektif 28 persen.'],
    'tiu-handbook-numerik-s04': ['Periksa pola sederhana dulu sebelum pola rumit, dan pola harus konsisten di semua suku.', 'Deret aritmetika punya selisih tetap, deret geometri punya rasio tetap.', 'Selisih bertingkat dan pola kuadrat bisa dikenali dari selisih antar suku.', 'Deret berselang dipisah menjadi jalur ganjil dan genap yang masing-masing punya pola.', 'Fibonacci memakai jumlah dua suku sebelumnya, dan variasi rekursif memakai rumus gabungan.'],
    'tiu-handbook-numerik-s05': ['Perbandingan kuantitatif membandingkan P dan Q tanpa selalu menghitung keduanya.', 'Metode selisih P dikurangi Q menentukan apakah P lebih besar, lebih kecil, atau sama.', 'Tanpa informasi tambahan tentang variabel, hubungan P dan Q bisa tidak dapat ditentukan.', 'Untuk x di atas 1, x kuadrat lebih besar dari x, tetapi untuk x di antara 0 dan 1 sebaliknya.', 'Rasio P dibagi Q berbahaya kalau tanda penyebut tidak diketahui, karena pembagian negatif membalik arah.'],
    'tiu-handbook-numerik-s06': ['Soal cerita dipadatkan menjadi diketahui, ditanya, hubungan, lalu hitung.', 'Perbandingan senilai berubah searah, sedangkan berbalik nilai berubah berlawanan arah.', 'Kerja bersama menjumlahkan laju tiap pekerja, dan kebocoran mengurangi laju pengisian.', 'Berpapasan menjumlahkan kecepatan, menyusul mengurangkan kecepatan.', 'Kecepatan rata-rata adalah total jarak dibagi total waktu, bukan rata-rata dua kecepatan.'],
    'tiu-handbook-numerik-s07': ['Kuadrat bilangan berakhiran 5 dihitung dari angka depannya lalu ditempel 25.', 'Perkalian dengan 11 menyisipkan jumlah digit di tengah, dengan carry kalau jumlahnya 10 atau lebih.', 'Kali 5, 25, dan 125 lebih cepat lewat pembagian 2, 4, dan 8 lalu dikali 10, 100, dan 1000.', 'Bilangan dekat puluhan atau ratusan dihitung dari bilangan bulat terdekatnya.', 'Aproksimasi berguna saat pilihan jawaban berjauhan.'],
    'tiu-handbook-numerik-s08': ['Jebakan berhitung meliputi salah urutan operasi, salah tanda, dan salah basis persentase.', 'Diskon bertingkat tidak boleh dijumlahkan, dan kenaikan lalu penurunan persen tidak saling menghapus.', 'Jangan memakai rata-rata sederhana untuk kecepatan rata-rata atau menganggap semua hubungan senilai.', 'Jangan mengasumsikan variabel positif tanpa informasi dari soal.', 'Cek 5 detik meliputi satuan, tanda, basis persen, asumsi, pola, dan kewajaran hasil.'],
    'tiu-handbook-numerik-s10': ['Cheat sheet ini merangkum rumus persen, perubahan nilai, dan diskon bertingkat.', 'Rumus jarak, berpapasan, menyusul, dan kerja bersama ada dalam satu tempat.', 'Rata-rata gabungan memakai bobot jumlah anggota tiap kelompok.', 'Perbandingan kuantitatif diutamakan lewat selisih P dikurangi Q.', 'Analisis deret diurutkan dari selisih, rasio, selisih bertingkat, berselang, kombinasi, lalu pola khusus.'],
    'tiu-handbook-numerik-s11': ['Huruf diubah menjadi angka dengan A sama dengan 1 sampai Z sama dengan 26.', 'Setelah diubah, pola huruf dikerjakan seperti deret angka biasa.', 'Alfabet bersifat siklik, jadi posisi 27 kembali ke 1 yaitu huruf A.'],
    'tiu-handbook-numerik-s12': ['Belajar numerik disusun empat level dari fondasi sampai tingkat lanjut.', 'Level 1 adalah operasi hitung, pecahan, desimal, persen, rasio, dan persamaan sederhana.', 'Level 2 adalah deret, persentase, rata-rata, kerja bersama, dan jarak-waktu-kecepatan.', 'Level 3 dan 4 menangani penalaran, informasi tidak lengkap, dan soal multioperasi.'],
    'tiu-handbook-numerik-s13': ['Empat fondasi TIU Numerik adalah berhitung, deret angka, perbandingan kuantitatif, dan soal cerita.', 'Strategi utamanya bukan kecepatan menghitung, melainkan kemampuan memahami dan menalar.', 'Target akhirnya adalah menentukan metode paling efisien dan paling logis.', 'Alur pengerjaannya adalah memahami, menyederhanakan, menalar, menghitung, lalu memverifikasi.'],
    'tiu-handbook-verbal-s02': ['Hampir semua soal verbal TIU bermuara pada tiga pertanyaan: analogi, silogisme, dan analitis.', 'Analogi menanyakan hubungan, silogisme menanyakan kesimpulan pasti, analitis menanyakan susunan yang memenuhi aturan.', 'Jawaban yang terlihat masuk akal belum tentu benar secara logis, karena distraktor sering memakai topik yang sama.', 'Alur kerjanya adalah kenali, sederhanakan, uji, lalu eliminasi.', 'Hemat waktu di soal sederhana agar tersedia waktu untuk soal analitis yang lebih panjang.'],
    'tiu-handbook-verbal-s03': ['Analogi mencari pasangan lain yang hubungannya sepadan dengan pasangan pada soal.', 'Tiga unsur yang harus diperiksa adalah jenis hubungan, arah hubungan, dan tingkat kekhususan.', 'Kalimat penghubung yang spesifik membantu menguji apakah pasangan pilihan benar-benar sepadan.', 'Teknik substitusi mengubah hubungan menjadi formula abstrak seperti pelaku ke hasil karya.', 'Jebakan utama analogi adalah satu tema, hubungan terlalu umum, arah terbalik, dan hubungan hampir sama.'],
    'tiu-handbook-verbal-s04': ['Silogisme bertanya apakah kesimpulan harus benar jika semua premis dianggap benar.', 'Modus ponens dan modus tollens adalah penarikan kesimpulan yang valid.', 'Affirming the consequent dan denying the antecedent adalah dua kesalahan logika yang tidak valid.', 'Kata sebagian berarti minimal satu, bukan berarti hanya sebagian atau tidak semua.', 'Dua premis sebagian tidak bisa digabung menjadi kesimpulan pasti tentang irisan ketiganya.'],
    'tiu-handbook-verbal-s05': ['Soal analitis terdiri dari objek, aturan, dan pertanyaan tentang susunan yang memenuhi semua aturan.', 'Empat langkah kerjanya adalah simbolkan, cari jangkar, gabungkan aturan, lalu uji pilihan.', 'Blok dan rantai membantu menyederhanakan aturan posisi sebelum mencoba susunan.', 'Kata pasti, mungkin, tidak mungkin, dan kecuali mengubah cara menguji jawaban.', 'Deduksi sebelum permutasi menghemat waktu karena susunan yang mungkin jumlahnya sangat banyak.'],
    'tiu-handbook-verbal-s06': ['Teknik eliminasi menggugurkan pilihan yang salah tanpa menyelesaikan seluruh soal.', 'Untuk pertanyaan pasti benar, satu counterexample cukup untuk menggugurkan sebuah pilihan.', 'Untuk pertanyaan mungkin benar, cukup temukan satu susunan valid yang membuat pilihan itu benar.', 'Pilihan yang menimbulkan kontradiksi dengan aturan harus langsung digugurkan.'],
    'tiu-handbook-verbal-s07': ['Kesalahan analogi yang umum adalah memilih karena topik sama dan mengabaikan arah hubungan.', 'Kesalahan silogisme yang umum adalah membalik premis dan salah memakai implikasi.', 'Kata sebagian sering disalahartikan sebagai tidak semua, padahal artinya minimal satu.', 'Kesalahan analitis yang umum adalah menganggap di antara berarti berdampingan.', 'Membuat semua permutasi sejak awal membuang waktu yang seharusnya dipakai untuk deduksi.'],
    'tiu-handbook-verbal-s08': ['Sistem cepat analogi menanyakan hubungan, arah, kekhususan, lalu pasangan yang identik.', 'Sistem cepat silogisme adalah simbolkan premis, hubungkan, lalu cari yang pasti.', 'Sistem cepat analitis adalah simbolkan, cari jangkar, buat blok atau rantai, deduksi, uji pilihan.'],
    'tiu-handbook-verbal-s10': ['Checklist analogi memastikan hubungan, arah, dan kekhususan sudah diperiksa sebelum memilih.', 'Checklist silogisme memastikan kesimpulan pasti dan tidak ada kesalahan implikasi atau kuantor.', 'Checklist analitis memastikan semua aturan sudah disimbolkan dan pilihan sudah diuji.'],
    'tiu-handbook-verbal-s11': ['Cheat sheet merangkum tiga tipe soal verbal dalam satu halaman ringkas.', 'Pada analogi, hubungan lebih penting daripada tema, dan jenis, arah, kekhususan harus diperiksa.', 'Pada silogisme, modus ponens, modus tollens, dan silogisme hipotetis adalah bentuk yang valid.', 'Pada analitis, urutannya adalah simbol, jangkar, blok atau rantai, deduksi, uji, eliminasi.'],
    'tiu-handbook-verbal-s12': ['Porsi belajar dibagi rata: konsep inti, teknik, pola dan jebakan, contoh bertingkat, dan soal HOTS.', 'Tujuan belajar bukan menghafal ratusan pola soal, melainkan mengenali struktur persoalan otomatis.', 'Alur belajarnya adalah konsep, pola, jebakan, contoh, drill, lalu review.'],
    'tiu-handbook-verbal-s13': ['Pertanyaan yang benar untuk analogi adalah pasangan mana yang jenis, arah, dan tingkat hubungannya sama.', 'Pertanyaan yang benar untuk silogisme adalah kesimpulan mana yang wajib benar berdasarkan premis.', 'Pertanyaan yang benar untuk analitis adalah susunan mana yang memenuhi semua kondisi tanpa pelanggaran.', 'TIU verbal menguji struktur berpikir, bukan hafalan istilah atau jawaban.'],
    'tiu-hitung-cepat-s02': ['Bilangan asli dimulai dari 1, bilangan cacah dimulai dari 0, bilangan bulat mencakup negatif dan nol.', 'Bilangan prima hanya memiliki faktor 1 dan bilangan itu sendiri, dan 1 bukan bilangan prima.', 'Bilangan rasional dapat ditulis sebagai pecahan, sedangkan bilangan irasional tidak dapat ditulis begitu.', 'Sifat komutatif menyatakan a tambah b sama dengan b tambah a.'],
    'tiu-hitung-cepat-s03': ['Sifat asosiatif, identitas, dan tertutup berlaku pada penjumlahan bilangan bulat.', 'Pembagian dengan nol tidak terdefinisi, sedangkan nol dibagi bilangan apa pun hasilnya nol.', 'Perkalian dua bilangan bertanda sama menghasilkan positif, dan bertanda beda menghasilkan negatif.', 'Aturan tanda yang sama berlaku untuk perkalian dan pembagian.'],
    'tiu-hitung-cepat-s04': ['Perkalian dan pembagian lebih kuat daripada penjumlahan dan pengurangan.', 'Operasi di dalam kurung selalu dikerjakan terlebih dahulu.', 'Operasi yang sama kuat dikerjakan dari kiri ke kanan secara berurutan.'],
    'tiu-hitung-cepat-s05': ['Pecahan istimewa adalah pecahan yang sering muncul dan nilai desimalnya layak dihafal.', 'Nilai desimal dan persen pecahan berpenyebut 2 sampai 10 tercantum sebagai acuan cepat.', 'Penjumlahan pecahan biasa dimulai dengan menyamakan penyebut memakai KPK.', 'Pecahan campuran diubah ke pecahan biasa dulu sebelum dijumlahkan atau dikurangkan.'],
    'tiu-hitung-cepat-s06': ['Pecahan campuran 5 1/6 sama dengan 31/6 setelah diubah menjadi pecahan biasa.', 'Mengurutkan pecahan paling mudah dilakukan setelah semua bentuk disamakan menjadi desimal.', 'Urutan dari yang terbesar adalah 2 3/4, lalu 0,833, lalu 4/5, lalu 50 persen.'],
    'tiu-hitung-cepat-s07': ['Pangkat menyederhanakan perkalian berulang dari bilangan yang sama.', 'Perkalian bilangan berpangkat dengan bilangan pokok sama dijumlahkan pangkatnya.', 'Pangkat negatif berarti satu per bilangan berpangkat positifnya.', 'Akar pangkat dua sama dengan pangkat setengah, dan akar pangkat tiga sama dengan pangkat sepertiga.'],
    'tiu-hitung-cepat-s08': ['Satuan adalah nilai standar pembanding untuk mengukur besaran.', 'Nilai hanya bisa dijumlahkan atau dibandingkan jika satuannya sudah sama.', 'Kesetaraan umum seperti 1 km sama dengan seribu meter perlu dihafal untuk hitung cepat.'],
    'tiu-hitung-cepat-s09': ['Luas papan tulis dihitung dengan mengalikan panjang dan lebarnya.', 'Mengubah m2 ke cm2 berarti mengalikan dengan sepuluh ribu karena turun dua anak tangga.', 'Setiap turun satu anak tangga satuan luas dikali seratus, dan satuan volume dikali seribu.'],
    'tiu-modul-s01': ['TIU mengukur penalaran verbal, kuantitatif, logika, dan analisis untuk pelayanan publik.', 'Penalaran verbal terdiri dari sinonim, antonim, dan analogi.', 'Penguasaan kosakata adalah kunci utama bagian verbal.', 'KBBI dan kebiasaan membaca berita membantu menambah perbendaharaan kata.'],
    'tiu-modul-s02': ['Tes sinonim mencari kata yang maknanya paling dekat dengan kata di soal.', 'Perbendaharaan kata yang luas adalah kunci utama tes sinonim.', 'Jangan memilih jawaban hanya karena bunyinya mirip dengan kata di soal.', 'Coba masukkan kata ke kalimat umum untuk menguji pilihan jawaban.', 'Kembalikan kata serapan ke bahasa aslinya untuk mencari artinya.'],
    'tiu-modul-s03': ['Pelarangan berarti larangan atau tidak memperbolehkan sesuatu.', 'Pencegahan sejalan dengan pelarangan, sedangkan perizinan adalah lawan katanya.', 'Kata serapan bisa ditebak artinya dengan mengembalikannya ke bahasa asalnya.', 'Mortalitas berasal dari kata mortality yang artinya angka kematian.'],
    'tiu-modul-s04': ['Sinonim adalah kata yang maknanya sama atau mirip dengan kata lain.', 'Absolut berarti mutlak, sedangkan akurat berarti tepat dan jitu.', 'Agraria berkaitan dengan pertanahan, bukan pertahanan.', 'Afeksi berarti kasih sayang dan afirmasi berarti penegasan.', 'Hafalkan kata yang belum dikenal lalu pakai dalam kalimat.'],
    'tiu-modul-s05': ['Daftar ini berisi pasangan sinonim dari huruf B sampai Z.', 'Dispensasi berarti pengecualian dan depresi berarti kemurungan.', 'Kolateral berarti jaminan dan kredibel berarti andal.', 'Virtual berarti maya dan virulen berarti ganas dan berbahaya.', 'Fokus pada kata yang sering keluar dan yang belum kamu kenal.'],
    'tiu-modul-s06': ['Antonim adalah kata yang artinya bertentangan dengan kata tertentu.', 'Contohnya prolog yang berarti pembukaan, lawan katanya adalah penutup.', 'Pilihan jawaban sering berisi sinonim sebagai pengecoh, jadi ketelitian sangat penting.', 'Jangan sampai tanpa sadar mencari sinonim padahal soal meminta antonim.'],
    'tiu-modul-s07': ['Tes antonim mencari kata yang maknanya berlawanan dengan kata di soal.', 'Jika ada dua pilihan yang berlawanan, jawaban biasanya salah satunya.', 'Terkatung lawannya terbenam, bukan melayang.', 'Antipati lawannya simpati dan konkaf lawannya konveks.', 'Jangan tergesa-gesa karena pilihan yang mirip sering jadi jebakan.'],
    'tiu-modul-s08': ['Daftar ini berisi pasangan antonim huruf A dan B.', 'Apatis lawannya antusias dan peduli.', 'Asli lawannya duplikat dan autentik lawannya palsu.', 'Berdikari lawannya bergantung dan berhasil lawannya gagal.', 'Besar lawannya kecil dan bongsor lawannya kerdil.'],
    'tiu-modul-s09': ['Daftar ini berisi pasangan antonim dari huruf C sampai W.', 'Deduksi lawannya induksi dan destruktif lawannya konstruktif.', 'Konkaf lawannya konveks dan konkret lawannya abstrak.', 'Laba lawannya rugi dan legal lawannya ilegal.', 'Simpati lawannya antipati dan skeptis lawannya yakin.'],
    'tiu-modul-s10': ['Tes analogi mencari pasangan kata dengan hubungan yang sama seperti soal.', 'Hubungan antarkata bisa berupa sinonim, antonim, alat dan fungsi, atau sebab akibat.', 'Hubungan ruas kiri harus setara dan searah dengan ruas kanan.', 'Perluas hubungan kata menjadi kalimat untuk menguji pilihan jawaban.', 'Pena dipakai untuk menulis seperti kuas dipakai untuk melukis.'],
    'tiu-modul-s12': ['Tes pengelompokan kata mencari satu kata yang tidak masuk kelompoknya.', 'Kelompokkan kata di soal sesuai bidangnya lalu cari yang berbeda.', 'Mobil, motor, dan bus adalah kendaraan darat sedangkan kapal bukan.', 'Tes nonverbal menguji angka, operasi hitung, dan logika berpikir.', 'Kecermatan, ketelitian, kecepatan, dan kerja sistematis diuji di tes nonverbal.'],
    'tiu-modul-s13': ['Tes aritmetika dan aljabar menguji soal matematika sederhana.', 'Kuncinya adalah pemahaman soal, ketelitian, dan matematika dasar.', 'Bilangan prima tepat memiliki dua faktor yaitu 1 dan dirinya sendiri.', 'Contoh bilangan prima adalah 2, 3, 5, 7, dan 11.', 'Angka 1 bukan bilangan prima dan 2 adalah satu-satunya prima genap.'],
    'tiu-modul-s14': ['Bilangan bulat terdiri dari bilangan positif, nol, dan bilangan negatif.', 'Bilangan asli dimulai dari 1 sedangkan bilangan cacah dimulai dari 0.', 'Bilangan rasional dapat ditulis sebagai pembagian dua bilangan bulat.', 'Penjumlahan bersifat komutatif, asosiatif, dan punya identitas nol.', 'Garis bilangan membantu menjumlah bilangan positif dan negatif.'],
    'tiu-modul-s15': ['Pengurangan sama dengan menambah dengan lawan bilangan.', 'Perkalian bersifat komutatif, asosiatif, distributif, dan punya identitas satu.', 'Bilangan berapa pun dibagi satu hasilnya bilangan itu sendiri.', 'Bilangan berapa pun dibagi nol hasilnya tidak terdefinisi.', 'Tanda sama dikali atau dibagi hasilnya positif, tanda beda hasilnya negatif.'],
    'tiu-modul-s16': ['Perpangkatan adalah perkalian berulang dari bilangan yang sama.', 'Tiga pangkat dua sama dengan sembilan dan empat pangkat tiga sama dengan 64.', 'Bilangan kuadrat adalah hasil perkalian dua bilangan yang sama.', 'Bilangan kubik adalah hasil perkalian tiga bilangan yang sama.', 'Dua puluh tujuh adalah tiga pangkat tiga dan 125 adalah lima pangkat tiga.'],
    'tiu-modul-s17': ['Penarikan akar adalah kebalikan dari perpangkatan.', 'Akar pangkat dua dari 36 adalah 6 dan akar 625 adalah 25.', 'Faktorisasi prima membantu menarik akar pangkat dua dan tiga.', 'Akar pangkat tiga dari 125 adalah 5.', 'Akar pangkat tiga dari 9.261 adalah 21.'],
    'tiu-modul-s18': ['Operasi dalam kurung dikerjakan paling awal.', 'Perkalian dan pembagian lebih kuat dari penjumlahan dan pengurangan.', 'Operasi yang sama kuat dikerjakan mulai dari kiri.', 'Contohnya 38.200 tambah 20 kali 45.000 sama dengan 938.200.', 'Kerjakan kurung dulu, lalu kali bagi, terakhir tambah kurang.'],
    'tiu-modul-s19': ['Di garis bilangan, kanan nol adalah positif dan kiri nol adalah negatif.', 'Semakin ke kanan nilai bilangan semakin besar.', 'Urutan dari terkecil untuk -8, 1, -2, 3 adalah -8, -2, 1, 3.', 'Tanda lebih besar dan lebih kecil menunjukkan perbandingan dua bilangan.', 'Lawan dari 4 adalah -4 dan lawan dari -18 adalah 18.'],
    'tiu-modul-s20': ['Satuan 1 sampai 4 dibulatkan ke bawah dan 5 sampai 9 ke atas.', 'Contohnya 657 dibulatkan ke puluhan terdekat menjadi 660.', 'Penaksiran dilakukan setelah bilangan dibulatkan dulu.', 'Faktor dari 42 adalah 1, 2, 3, 6, 7, 14, 21, dan 42.', 'Faktorisasi prima dari 12 adalah 2 pangkat 2 kali 3.'],
    'tiu-modul-s21': ['KPK adalah kelipatan persekutuan terkecil dari bilangan-bilangan.', 'Untuk KPK, kalikan semua faktor prima dengan pangkat terbesar.', 'Faktorisasi prima dari 32 adalah 2 pangkat 5.', 'KPK dari 32 dan 48 adalah 96.', 'KPK juga bisa dicari dengan cara sengkedan atau pembagian bersama.'],
    'tiu-modul-s22': ['FPB adalah faktor persekutuan terbesar dari bilangan-bilangan.', 'Untuk FPB, kalikan faktor prima yang sama dengan pangkat terkecil.', 'FPB dari 300 dan 350 adalah 50.', 'FPB juga bisa dicari dengan cara sengkedan atau pembagian bersama.', 'KPK dipakai untuk soal kejadian bersama, misalnya senter yang menyala berkala.'],
    'tiu-modul-s23': ['Pecahan ditulis a per b dengan b tidak sama dengan nol.', 'Bilangan a disebut pembilang dan bilangan b disebut penyebut.', 'Pecahan adalah bagian yang sama besar dari sesuatu yang utuh.', 'Satu dari tiga bagian roti yang sama besar nilainya sepertiga.'],
    'tiu-modul-s24': ['Jenis pecahan ada biasa, desimal, persen, dan campuran.', 'Tiga per lima sama dengan 0,6 dan tiga per empat sama dengan 0,75.', 'Nol koma 35 sama dengan 35 per 100 atau 7 per 20.', 'Tiga per empat sama dengan 75 persen dan 20 persen sama dengan seperlima.', 'Enam belas per lima sama dengan 3 satu per lima.'],
    'tiu-modul-s25': ['Pecahan senilai didapat dengan mengali atau membagi pembilang dan penyebut.', 'Untuk mengurutkan pecahan, samakan penyebut dengan KPK.', 'Perkalian pecahan adalah pembilang kali pembilang dan penyebut kali penyebut.', 'Pembagian pecahan diubah jadi perkalian dengan membalik pembaginya.', 'Tiga per empat dibagi setengah sama dengan satu setengah.'],
    'tiu-modul-s26': ['Penjumlahan desimal dilakukan dengan meluruskan tanda koma.', 'Perkalian desimal memperhatikan jumlah angka di belakang koma.', 'Pembagian desimal sebaiknya mengubah pembagi jadi bilangan bulat.', 'Perbandingan dua nilai memakai rumus bagian per jumlah atau selisih.', 'Skala adalah perbandingan ukuran gambar dengan ukuran sebenarnya.'],
    'tiu-modul-s27': ['Aritmetika sosial memakai persen untuk masalah sehari-hari.', 'Untung terjadi saat harga jual lebih besar dari harga beli.', 'Rugi terjadi saat harga jual lebih kecil dari harga beli.', 'Buat permisalan untuk hal yang diketahui di soal cerita.', 'Perkiraan waktu tiap soal adalah satu menit, jadi jangan terpaku di soal sulit.'],
    'tiu-modul-s28': ['Untung sama dengan harga jual dikurang harga beli.', 'Rugi sama dengan harga beli dikurang harga jual.', 'Persentase untung adalah untung dibagi harga beli dikali 100 persen.', 'Keuntungan 5 persen dari harga beli 100 ribu adalah 5 ribu.', 'Harga jual sama dengan harga beli ditambah untung atau dikurang rugi.'],
    'tiu-modul-s29': ['Bunga sama dengan persen bunga dikali modal.', 'Bunga 8 persen dari 180 ribu adalah 14.400 per tahun.', 'Uang setelah dua tahun adalah modal ditambah bunga dua tahun.', 'Bruto adalah berat kotor, neto berat bersih, dan tara berat bungkus.', 'Neto sama dengan bruto dikurang tara.'],
    'tiu-modul-s30': ['Debit adalah kecepatan aliran zat cair yang mengalir pada waktu tertentu.', 'Rumus debit adalah volume dibagi waktu.', 'Volume sama dengan debit dikali waktu, dan waktu sama dengan volume dibagi debit.', 'Satuan debit yang sering dipakai adalah liter per detik, liter per menit, dan m3 per jam.'],
    'tiu-modul-s31': ['Pengukuran adalah proses menghitung ukuran suatu benda dengan alat tertentu.', 'Hasil pengukuran disebut ukuran.', 'Jenis ukuran yang dipelajari meliputi sudut, volume, berat, dan waktu.'],
    'tiu-modul-s32': ['Satu putaran penuh sama dengan 360 derajat.', 'Setiap langkah jarum pendek jam adalah 30 derajat.', 'Setiap langkah jarum panjang jam adalah 6 derajat.', 'Sudut jarum jam yang dicari adalah sudut terkecilnya.', 'Turun satu tingkat satuan panjang dikali 10 dan satuan luas dikali 100.'],
    'tiu-modul-s33': ['Turun satu tingkat satuan volume kubik dikali 1.000.', 'Satu kilometer kubik sama dengan satu miliar meter kubik.', 'Turun satu tingkat satuan liter dikali 10.', 'Satu liter sama dengan satu desimeter kubik.', 'Satu mililiter sama dengan satu sentimeter kubik.'],
    'tiu-modul-s34': ['Turun satu tingkat satuan berat dikali 10.', 'Satu kilogram sama dengan 10 hektogram dan 1.000 gram.', 'Satu ton sama dengan 10 kuintal atau 1.000 kilogram.', 'Satu lusin sama dengan 12 buah dan satu gros 144 buah.', 'Satu kodi sama dengan 20 buah dan satu rim 500 lembar.'],
    'tiu-modul-s35': ['Satu hari sama dengan 24 jam dan satu jam 60 menit.', 'Satu menit sama dengan 60 detik dan satu jam 3.600 detik.', 'Satu abad 100 tahun, satu windu 8 tahun, dan satu lustrum 5 tahun.', 'Kecepatan sama dengan jarak dibagi waktu.', 'Jarak sama dengan kecepatan dikali waktu.'],
    'tiu-modul-s36': ['Bangun datar adalah bangun geometri yang berbentuk datar dan berdimensi dua.', 'Bangun yang dipelajari meliputi segitiga, persegi panjang, persegi, dan trapesium.', 'Jajargenjang, belah ketupat, layang-layang, dan lingkaran juga termasuk bangun datar.'],
    'tiu-modul-s37': ['Jumlah sudut dalam segitiga adalah 180 derajat.', 'Segitiga sama sisi punya tiga sisi sama dan segitiga sama kaki dua sisi sama.', 'Segitiga siku-siku punya satu sudut 90 derajat.', 'Keliling segitiga adalah jumlah ketiga sisinya.', 'Luas segitiga adalah setengah dikali alas dikali tinggi.'],
    'tiu-modul-s38': ['Segitiga tumpul punya satu sudut lebih dari 90 derajat.', 'Teorema Pythagoras menyatakan a kuadrat tambah b kuadrat sama dengan c kuadrat.', 'Sisi miring adalah sisi terpanjang segitiga siku-siku.', 'Tripel 3, 4, 5 adalah tripel Pythagoras yang sering muncul.', 'Segitiga siku-siku 3 cm dan 4 cm punya sisi miring 5 cm.'],
    'tiu-modul-s39': ['Persegi panjang punya sisi berhadapan sama dan empat sudut siku-siku.', 'Keliling persegi panjang adalah dua kali panjang tambah lebar.', 'Luas persegi panjang adalah panjang kali lebar.', 'Persegi punya empat sisi sama dan empat sumbu simetri.', 'Keliling persegi adalah empat kali sisi dan luasnya sisi kuadrat.'],
    'tiu-modul-s40': ['Trapesium punya sepasang sisi yang sejajar.', 'Luas trapesium adalah jumlah sisi sejajar kali tinggi dibagi dua.', 'Trapesium sama kaki, siku-siku, dan sembarang punya sifat berbeda.', 'Jajargenjang punya sisi berhadapan sejajar dan sama panjang.', 'Luas jajargenjang adalah alas dikali tinggi.'],
    'tiu-modul-s41': ['Belah ketupat punya empat sisi sama panjang.', 'Diagonal belah ketupat berpotongan tegak lurus dan saling membagi dua.', 'Belah ketupat punya dua sumbu simetri.', 'Keliling belah ketupat adalah empat kali sisi.', 'Luas belah ketupat adalah setengah kali diagonal satu kali diagonal dua.'],
    'tiu-modul-s42': ['Layang-layang punya sepasang sisi sama dan satu sumbu simetri.', 'Luas layang-layang adalah setengah kali diagonal satu kali diagonal dua.', 'Diameter lingkaran adalah dua kali jari-jarinya.', 'Keliling lingkaran adalah pi kali diameter.', 'Luas lingkaran adalah pi kali jari-jari kuadrat.'],
    'tiu-modul-s43': ['Simetri lipat membagi bangun jadi dua bagian sama besar saat dilipat.', 'Garis lipat pada simetri lipat disebut sumbu simetri.', 'Persegi punya empat sumbu simetri dan lingkaran tak hingga.', 'Simetri putar adalah banyaknya putaran agar bangun kembali ke bingkainya.', 'Belah ketupat punya simetri putar tingkat dua.'],
    'tiu-modul-s44': ['Kubus punya 6 sisi, 8 titik sudut, dan 12 rusuk.', 'Luas kubus adalah enam kali sisi kuadrat dan volumenya sisi pangkat tiga.', 'Volume balok adalah panjang kali lebar kali tinggi.', 'Volume prisma dan tabung adalah luas alas dikali tinggi.', 'Volume limas dan kerucut adalah sepertiga luas alas dikali tinggi.'],
    'tiu-modul-s45': ['Sumbu mendatar disebut sumbu X dan sumbu tegak sumbu Y.', 'Kedua sumbu berpotongan di titik asal O nol koma nol.', 'Bilangan pertama pada koordinat disebut absis dan kedua disebut ordinat.', 'Titik A 3 koma 4 punya absis 3 dan ordinat 4.', 'Titik D min 6 koma min 4 punya absis min 6 dan ordinat min 4.'],
    'tiu-modul-s46': ['Pencerminan disebut juga refleksi.', 'Cermin terhadap sumbu X mengubah titik x koma y jadi x koma min y.', 'Cermin terhadap sumbu Y mengubah titik x koma y jadi min x koma y.', 'Titik 2 koma 3 dicerminkan terhadap sumbu X menjadi 2 koma min 3.', 'Titik 2 koma 3 dicerminkan terhadap sumbu Y menjadi min 2 koma 3.'],
    'tiu-modul-s47': ['Data adalah keterangan benar dan nyata mengenai suatu hal.', 'Data dapat berupa angka atau sifat.', 'Data dikumpulkan lewat pencatatan langsung dan wawancara.', 'Data juga dikumpulkan lewat penelitian dan angket.'],
    'tiu-modul-s48': ['Data dapat disajikan dalam tabel dan berbagai diagram.', 'Diagram batang memakai tinggi batang untuk menunjukkan besar data.', 'Diagram garis menunjukkan naik turun data dari waktu ke waktu.', 'Diagram lingkaran membagi 360 derajat sesuai besar tiap data.', 'Diagram gambar memakai gambar yang mewakili jumlah tertentu.'],
    'tiu-modul-s49': ['Data dapat diurutkan dari terkecil ke terbesar atau sebaliknya.', 'Data tertinggi adalah data dengan nilai paling besar.', 'Data terendah adalah data dengan nilai paling kecil.', 'Tinggi badan tertinggi pada contoh adalah 165 cm.'],
    'tiu-modul-s50': ['Data tinggi badan diurutkan dari yang terkecil agar nilai tertinggi dan terendah mudah dibaca.', 'Tinggi badan anak yang paling tinggi adalah 165 cm.', 'Tinggi badan anak yang paling pendek adalah 140 cm.'],
    'tiu-modul-s51': ['Rata-rata diperoleh dari jumlah data dibagi banyak data.', 'Jumlah delapan nilai ulangan Andri adalah 611.', 'Rata-rata nilai ulangan Andri adalah 76,375.'],
    'tiu-modul-s52': ['Modus adalah data yang paling sering muncul.', 'Nilai 7 muncul empat kali, lebih banyak daripada nilai lainnya.', 'Modus dari nilai ulangan tersebut adalah 7.'],
    'tiu-modul-s53': ['Tes deret menguji kemampuan menemukan pola angka atau huruf antar suku.', 'Pola yang sering muncul adalah tambah tetap, kali tetap, kuadrat, dan jumlah dua suku sebelumnya.', 'Pola huruf juga diuji, misalnya A, C, E, G yang meloncat satu huruf.', 'Hanya ada satu jawaban benar, sehingga operasi hitung sederhana tetap dibutuhkan.'],
    'tiu-modul-s54': ['Menemukan pola barisan butuh kreativitas dan ketelitian.', 'Perhatikan tanda bilangan karena memengaruhi pola dan perhitungan.', 'Pola bisa berupa penjumlahan, perkalian, pangkat, atau loncat bilangan.', 'Pola yang ditemukan harus konsisten di semua bilangan.', 'Ubah barisan huruf jadi angka untuk menemukan polanya.'],
    'tiu-modul-s55': ['Kurung paling kuat, lalu pangkat dan akar, lalu kali bagi, terakhir tambah kurang.', 'Kali atau bagi dengan tanda sama hasilnya positif dan tanda beda negatif.', 'Pembulatan dan penaksiran membantu perhitungan yang rumit.', 'Kelipatan sembilan punya jumlah angka yang juga kelipatan sembilan.', 'Akar pangkat tiga dari 97.336 adalah 46.'],
    'tiu-modul-s56': ['Jika A kurang dari B dan B kurang dari C maka A kurang dari C.', 'Tambah, kurang, kali, atau bagi positif di semua ruas tidak mengubah urutan.', 'Kali atau bagi bilangan negatif membalik tanda pertidaksamaan.', 'Coba angka yang memenuhi satu interval lalu uji ke syarat lain.', 'Jika 2 kurang dari x kurang dari 5, x bisa 3 atau 4.'],
    'tiu-modul-s57': ['Penalaran logis menarik kesimpulan dari pernyataan di soal.', 'Kesimpulan harus berdasarkan fakta soal, bukan opini pribadi.', 'Modus ponens: jika p maka q, p terjadi, maka q terjadi.', 'Modus tollens: jika p maka q, q tidak terjadi, maka p tidak terjadi.', 'Jangan terpaku di soal sulit, tandai lalu kerjakan yang mudah dulu.'],
    'tiu-modul-s58': ['Silogisme hipotetis merangkai jika p maka q dan jika q maka r jadi jika p maka r.', 'Semua A bersifat B artinya setiap anggota A punya sifat B.', 'Beberapa berarti ada atau sebagian, bukan seluruhnya.', 'Semua berarti setiap anggota tanpa terkecuali.', 'Diagram Venn membantu menganalisis hubungan antarpernyataan.'],
    'tiu-modul-s59': ['Penalaran analitis menalar cerita singkat untuk menjawab pertanyaan.', 'Tandai kata kunci dan buat ilustrasi untuk mempermudah.', 'Model urutan memakai tanda kurang dari, lebih dari, dan sama dengan.', 'Syarat cukup menjamin hasil sedangkan syarat perlu mutlak dibutuhkan.', 'Penalaran spasial menguji visualisasi bentuk dan pola gambar.'],
    'tiu-tabel-pangkat-s01': ['Tabel ini berisi nilai pangkat 2, 3, dan 4 untuk bilangan 1 sampai 100.', 'Cara memakai tabel adalah mencari bilangan dasar lalu membaca hasilnya di kolom kedua.', 'Hafalkan pangkat 2 dari 1 sampai 30, pangkat 3 dari 1 sampai 20, dan pangkat 4 dari 1 sampai 10.', 'Digit terakhir kuadrat hanya bisa 0, 1, 4, 5, 6, atau 9.'],
    'tiu-tabel-pangkat-s02': ['Section ini berisi nilai kuadrat bilangan 1 sampai 100.', 'Data lengkap tersimpan sebagai pasangan bilangan dan hasilnya.', 'Contoh awalnya adalah 1 kuadrat sama dengan 1 sampai 10 kuadrat sama dengan 100.'],
    'tiu-tabel-pangkat-s03': ['Section ini berisi nilai pangkat tiga bilangan 1 sampai 100.', 'Data lengkap tersimpan sebagai pasangan bilangan dan hasilnya.', 'Contoh awalnya adalah 1 pangkat tiga sama dengan 1 sampai 10 pangkat tiga sama dengan seribu.'],
    'tiu-tabel-pangkat-s04': ['Section ini berisi nilai pangkat empat bilangan 1 sampai 100.', 'Data lengkap tersimpan sebagai pasangan bilangan dan hasilnya.', 'Contoh awalnya adalah 1 pangkat empat sama dengan 1 sampai 10 pangkat empat sama dengan sepuluh ribu.'],
    'tkp-cheat-sheet-s01': ['Profesionalisme berarti bekerja tuntas dan akurat dengan tanggung jawab serta komitmen tinggi.', 'Jawaban terbaik berorientasi pada tugas dan dampak, bukan sekadar keluaran.', 'Hindari jawaban yang menunda pekerjaan, mengeluh, atau menyalahkan situasi.', 'Utamakan tindakan nyata dan solusi konkret saat menghadapi hambatan kerja.'],
    'tkp-cheat-sheet-s02': ['Pelayanan publik mengutamakan kepuasan masyarakat sesuai tugas dan wewenang.', 'Layani masyarakat dengan ramah, sabar, empatik, dan tanpa diskriminasi.', 'Patuhi prosedur yang jelas sambil tetap fokus menyelesaikan masalah masyarakat.', 'Jawaban terbaik menunjukkan inisiatif proaktif dan hasil yang nyata.'],
    'tkp-cheat-sheet-s03': ['Jejaring kerja adalah kerja sama, kolaborasi, dan berbagi informasi secara efektif.', 'Pemimpin yang baik memberi arahan jelas dan membagi tugas secara adil.', 'Konflik tim diselesaikan dengan diskusi dan solusi yang adil bagi semua pihak.', 'Utamakan kepentingan bersama di atas kepentingan pribadi.'],
    'tkp-cheat-sheet-s04': ['Sosial budaya menguji kemampuan beradaptasi dalam lingkungan yang beragam.', 'Hargai perbedaan budaya, suku, agama, dan pendapat orang lain.', 'Bersikap netral dan bijaksana tanpa memihak kelompok tertentu.', 'Bangun komunikasi positif demi lingkungan kerja yang harmonis.'],
    'tkp-cheat-sheet-s05': ['TIK membantu pekerjaan menjadi lebih cepat, akurat, dan efisien.', 'Terbuka belajar teknologi baru dan beradaptasi dengan perubahan.', 'Atasi kendala teknis dengan solusi alternatif, bukan menghindarinya.', 'Jaga keamanan dan kerahasiaan data dalam setiap penggunaan teknologi.'],
    'tkp-cheat-sheet-s06': ['Tolak tegas segala bentuk radikalisme dan kekerasan.', 'Kenali tanda awal radikalisme dan laporkan potensi yang ditemukan.', 'Promosikan toleransi, kerukunan, dan perdamaian antarwarga.', 'Jangan pernah membenarkan kekerasan atau intoleransi sekecil apa pun.'],
    'tkp-karakter-perilaku-s01': ['Integritas adalah keselarasan antara nilai moral, ucapan, tindakan, dan tanggung jawab.', 'Dalam TKP, integritas diuji dari keputusan nyata saat nilai moral diuji, bukan dari pernyataan ideal.', 'Gratifikasi harus ditolak dengan sopan atau dilaporkan bila sudah terlanjur diterima.', 'Jawaban terbaik menggabungkan ketegasan menolak pelanggaran dengan langkah konkret lewat jalur resmi.', 'Sikap diam, menghindar, atau menunggu cenderung bernilai rendah dalam soal integritas.'],
    'tkp-karakter-perilaku-s02': ['Kejujuran adalah menyampaikan fakta apa adanya tanpa memanipulasi data dan informasi.', 'Kejujuran adalah fondasi utama integritas ASN karena ASN mengemban amanah negara.', 'Kesalahan harus diakui, segera diperbaiki, dan dilaporkan sesuai prosedur.', 'Kecurangan kecil adalah pintu masuk menuju kecurangan yang lebih besar.', 'Kerangka berpikirnya adalah jujur, bertanggung jawab, transparan, etis, dan mengutamakan negara.'],
    'tkp-karakter-perilaku-s03': ['Adaptasi adalah menyesuaikan diri dengan perubahan secara bijak tanpa mengorbankan prinsip.', 'Adaptif adalah salah satu nilai dasar ASN BerAKHLAK yang dimuat dalam UU Nomor 20 Tahun 2023.', 'Adaptasi mencakup sisi kognitif, yaitu mengubah pola pikir, dan sisi emosional, yaitu mengelola stres.', 'Kemauan belajar adalah kunci utama agar kinerja tetap terjaga dalam kondisi apa pun.', 'Menolak perubahan tanpa alasan rasional dan menyalahkan sistem adalah sikap yang harus dihindari.'],
    'tkp-karakter-perilaku-s04': ['Pengendalian diri adalah mengelola emosi dengan tepat, bukan menekan emosi secara berlebihan.', 'ASN yang mampu mengendalikan diri tetap tenang, sabar, dan rasional di bawah tekanan.', 'Sikap tenang lebih bernilai daripada reaksi emosional dalam pelayanan publik.', 'Kritik dan teguran sebaiknya diterima dengan lapang dada sebagai bahan perbaikan diri.', 'Kerangka berpikirnya adalah tenang, sabar, rasional, etis, dan solutif.'],
    'tkp-karakter-perilaku-s05': ['Semangat berprestasi adalah dorongan untuk bekerja optimal dengan standar keunggulan.', 'Prestasi adalah bentuk kontribusi, bukan sekadar mengejar pengakuan.', 'Tujuan yang baik bersifat SMART, yaitu spesifik, terukur, dapat dicapai, relevan, dan berbatas waktu.', 'Kegagalan sebaiknya dijadikan bahan evaluasi, bukan alasan untuk menyalahkan keadaan.', 'Prestasi harus dicapai secara etis dan profesional, bukan dengan cara yang tidak baik.'],
    'tkp-karakter-perilaku-s06': ['Inisiatif adalah kemauan bertindak proaktif tanpa harus selalu menunggu perintah.', 'Inisiatif yang baik selalu berada dalam koridor aturan, etika, dan kewenangan.', 'Inisiatif berbeda dari kreativitas karena inisiatif berfokus pada pencetusan ide dan tindakan awal.', 'Bertindak tanpa koordinasi atau melampaui kewenangan bukanlah inisiatif, melainkan kecerobohan.', 'Kerangka berpikirnya adalah peka, proaktif, bertindak, koordinasi, dan bertanggung jawab.'],
    'tkp-karakter-perilaku-s07': ['Kreativitas adalah menemukan ide baru, sedangkan inovasi adalah mewujudkan ide itu menjadi solusi nyata.', 'Inovasi ASN harus tetap berada dalam koridor hukum, SOP, dan etika kerja.', 'Cara kerja yang lebih efisien sebaiknya diusulkan lewat mekanisme yang berlaku, bukan diubah sendiri.', 'Diskusi dan kolaborasi dengan orang lain memunculkan wawasan dan ide yang lebih baik.', 'Kerangka berpikirnya adalah terbuka, solutif, kreatif, koordinatif, dan bertanggung jawab.'],
    'tkp-karakter-perilaku-s08': ['Ketekunan adalah sikap gigih dan konsisten bekerja sampai tugas benar-benar selesai.', 'ASN yang tekun tidak berhenti ketika lelah, tetapi berhenti ketika tugas benar-benar tuntas.', 'Konsistensi lebih penting daripada kecepatan sesaat dalam menjaga kualitas kerja.', 'Tugas rutin harus dikerjakan dengan baik karena mendukung tercapainya tujuan instansi.', 'Kerangka berpikirnya adalah sabar, gigih, konsisten, bertahap, dan tuntas.'],
    'tkp-karakter-perilaku-s09': ['ASN pada hakikatnya adalah pelayan publik, bukan pihak yang dilayani.', 'Orientasi pelayanan mencakup empati, tanggung jawab, kecepatan, ketepatan, dan kesungguhan.', 'Pelayan publik adalah salah satu dari tiga fungsi ASN menurut UU Nomor 20 Tahun 2023.', 'Berorientasi pelayanan adalah nilai pertama dalam core values ASN BerAKHLAK.', 'Kerangka berpikirnya adalah empati, sabar, profesional, solutif, dan tanggung jawab.'],
    'tkp-karakter-perilaku-s10': ['Toleransi adalah menghargai perbedaan tanpa mengorbankan prinsip dan aturan.', 'Toleransi bukan berarti permisif terhadap pelanggaran aturan.', 'Tiga cek sikap toleran adalah menghormati, aktif mencari titik temu, dan tugas tetap jalan.', 'Pelayanan publik harus adil dan inklusif bagi masyarakat yang beragam.', 'Kerangka berpikirnya adalah hormat, adil, terbuka, empati, dan persatuan.'],
    'tkp-karakter-perilaku-s11': ['Kepedulian lingkungan mencakup kesadaran ekologis, bukan sekadar menjaga kebersihan.', 'ASN dituntut menjadi teladan dalam menjaga lingkungan demi generasi sekarang dan mendatang.', 'Enam indikator perilaku peduli lingkungan meliputi hemat energi, sampah, air, dan bahan bakar.', 'Lingkungan kerja yang bersih dan sehat mendukung kinerja dan menghemat anggaran negara.', 'Kerangka berpikirnya adalah peduli, bertanggung jawab, hemat, teladan, dan berkelanjutan.'],
    'tkp-karakter-perilaku-s12': ['Efisiensi kerja adalah menyelesaikan pekerjaan dengan benar, cepat, dan hemat sumber daya.', 'Efisiensi bukan berarti bekerja tergesa-gesa atau memangkas semua pengeluaran tanpa pertimbangan.', 'Skala prioritas dimulai dari menginventarisasi tugas lalu menilai urgensi dan kepentingannya.', 'Tugas yang penting dan mendesak harus dikerjakan lebih dulu secara bertahap dan sistematis.', 'Kerangka berpikirnya adalah prioritas, fokus, efisien, tepat waktu, dan berkualitas.'],
    'tkp-kartu-sakti-s01': ['Fleksibilitas berpikir adalah kemampuan memakai berbagai sudut pandang saat menghadapi tuntutan perubahan.', 'Level tertingginya adalah mendayagunakan sudut pandang orang lain untuk mengoptimalkan cara berpikir.', 'Semakin tinggi levelnya, semakin aktif seseorang menyelaraskan dan mengakomodasi perbedaan sudut pandang.', 'Kata kuncinya adalah mampu menggunakan berbagai sudut pandang.'],
    'tkp-kartu-sakti-s02': ['Inovasi adalah kemampuan memunculkan ide, gagasan, dan pemikiran baru untuk meningkatkan efektivitas kerja.', 'Level tertingginya adalah menciptakan ide orisinal yang bermanfaat bagi organisasi.', 'Level menengahnya meliputi mengenali, mengidentifikasi, lalu mengadopsi dan mengadaptasi ide baru.', 'Kata kuncinya adalah mampu membuat ide, gagasan, dan pemikiran baru.'],
    'tkp-kartu-sakti-s03': ['Berpikir analitis adalah kemampuan menguraikan masalah dari informasi berbagai sumber untuk menemukan penyebab dan dampaknya.', 'Level tertingginya adalah memproyeksikan dampak jangka panjang suatu fenomena bagi kepentingan organisasi.', 'Level menengahnya meliputi menguraikan faktor penyebab dan dampak, lalu merumuskan pendekatan komprehensif.', 'Kata kuncinya adalah mampu menganalisis dan mengurai permasalahan.'],
    'tkp-kartu-sakti-s04': ['Berpikir konseptual adalah kemampuan melihat pola atau hubungan dalam informasi untuk membentuk pemahaman baru.', 'Level tertingginya adalah mengembangkan konsep baru sesuai kebutuhan organisasi ke depan.', 'Level menengahnya meliputi merumuskan konsep dari pola hubungan informasi yang ada.', 'Kata kuncinya adalah mampu menghubungkan pola menjadi hubungan suatu informasi.'],
    'tkp-kartu-sakti-s05': ['Adaptasi terhadap perubahan adalah kemampuan menyesuaikan diri agar efektivitas kerja tetap terjaga.', 'Level tertingginya adalah mengantisipasi perubahan dan membuat penyesuaian jangka panjang dalam organisasi.', 'Level menengahnya meliputi menyesuaikan diri atas inisiatif sendiri dan mencari alternatif pendekatan baru.', 'Kata kuncinya adalah mampu menyesuaikan diri terhadap perubahan situasi di lingkungan kerja.'],
    'tkp-kartu-sakti-s06': ['Integritas adalah kemampuan bertindak konsisten dan transparan sesuai nilai, norma, dan etika yang berlaku.', 'Level tertingginya adalah memberi teladan dalam menerapkan nilai, norma, dan etika organisasi.', 'Level menengahnya meliputi menerapkan etika pada diri sendiri lalu mengingatkan orang lain.', 'Kata kuncinya adalah mampu bertindak secara konsisten.'],
    'tkp-kartu-sakti-s07': ['Keuletan adalah kemampuan bekerja keras dan tidak mudah putus asa dalam mencapai tujuan.', 'Level tertingginya adalah mencari alternatif lain saat menghadapi kegagalan mencapai tujuan.', 'Level menengahnya meliputi mengubah strategi, mencoba alternatif, dan menelaah kegagalan untuk perbaikan.', 'Kata kuncinya adalah mampu bekerja keras dan tidak mudah putus asa.'],
    'tkp-kartu-sakti-s08': ['Pengendalian diri adalah kemampuan mengendalikan emosi saat menghadapi masalah sulit, kritik, atau tekanan.', 'Level tertingginya adalah melakukan tindakan untuk mencairkan suasana yang penuh tekanan.', 'Level menengahnya meliputi menghadapi tekanan dengan tenang dan berpikir positif.', 'Kata kuncinya adalah mampu mengendalikan diri saat bekerja di bawah tekanan.'],
    'tkp-kartu-sakti-s09': ['Komitmen terhadap organisasi adalah kemampuan menyelaraskan perilaku pribadi dengan kepentingan organisasi.', 'Level tertingginya adalah melakukan berbagai upaya untuk menjaga citra organisasi.', 'Level menengahnya meliputi melaksanakan tugas melebihi tanggung jawab dan mengorbankan kepentingan diri.', 'Kata kuncinya adalah mampu menyelaraskan perilaku diri dengan kepentingan organisasi.'],
    'tkp-kartu-sakti-s10': ['Inisiatif adalah kemampuan mengambil langkah aktif tanpa menunggu perintah demi tujuan organisasi.', 'Level tertingginya adalah mengembangkan ide baru untuk menyelesaikan tugas dengan lebih baik.', 'Level menengahnya meliputi bertindak konstruktif dan mengidentifikasi masalah yang akan muncul.', 'Kata kuncinya adalah mampu mengambil langkah aktif tanpa menunggu perintah.'],
    'tkp-kartu-sakti-s11': ['Semangat berprestasi adalah kemampuan meningkatkan kinerja di atas standar secara terus-menerus.', 'Level tertingginya adalah membuat cara atau pendekatan baru untuk meningkatkan kualitas dan kuantitas hasil kerja.', 'Level menengahnya meliputi mempelajari proses kerja dan melakukan perbaikan demi kinerja optimal.', 'Kata kuncinya adalah mampu meningkatkan kinerja.'],
    'tkp-kartu-sakti-s12': ['Kerja sama adalah kemampuan menyelesaikan pekerjaan bersama sebagai bagian kelompok demi tujuan organisasi.', 'Level tertingginya adalah menciptakan suasana kerja sama yang akrab dengan menanamkan moral kerja yang baik.', 'Level menengahnya meliputi menghargai masukan orang lain, menjunjung keputusan kelompok, dan membantu rekan.', 'Kata kuncinya adalah mampu bekerja dalam kelompok untuk mencapai tujuan organisasi.'],
    'tkp-kartu-sakti-s13': ['Mengembangkan orang lain adalah kemampuan mendorong pengembangan potensi orang lain agar bekerja lebih baik.', 'Level tertingginya adalah menginspirasi seluruh sumber daya manusia untuk mengembangkan diri secara mandiri.', 'Level menengahnya meliputi memberi umpan balik, membimbing, dan memberi kesempatan pekerjaan menantang.', 'Kata kuncinya adalah mampu mengembangkan potensi orang lain.'],
    'tkp-kartu-sakti-s14': ['Kepemimpinan adalah kemampuan meyakinkan, mempengaruhi, dan memotivasi orang lain untuk melaksanakan rencana kerja.', 'Level tertingginya adalah menggunakan strategi atau perilaku tertentu untuk mempengaruhi orang lain mencapai tujuan.', 'Level menengahnya meliputi membina bawahan, mendelegasikan pekerjaan, dan mengorganisir sumber daya.', 'Kata kuncinya adalah mampu meyakinkan, mempengaruhi, dan memotivasi orang.'],
    'tkp-kartu-sakti-s15': ['Membimbing adalah kemampuan memberi bimbingan dan umpan balik teratur kepada bawahan agar bekerja terarah.', 'Level tertingginya adalah menentukan faktor potensial yang berpengaruh pada pencapaian dan kegagalan pekerjaan.', 'Level menengahnya meliputi menentukan target, mengomunikasikan tugas, dan membantu bawahan saat ada kendala.', 'Kata kuncinya adalah mampu membimbing dan memberi umpan balik kepada bawahan.'],
    'tkp-kartu-sakti-s16': ['Berorientasi pada pelayanan adalah kemampuan mengetahui, memahami, dan memenuhi kebutuhan pelanggan.', 'Level tertingginya adalah menginternalisasikan nilai dan semangat pelayanan ke setiap individu di organisasi.', 'Level menengahnya meliputi memenuhi kebutuhan pelanggan dan terus memperbaiki pelayanan.', 'Kata kuncinya adalah mampu memberikan kepuasan pelanggan.'],
    'tkp-kartu-sakti-s17': ['Kesadaran akan keselamatan kerja adalah kemampuan sadar, tanggap, dan peduli terhadap keselamatan pegawai.', 'Level tertingginya adalah mengusulkan sistem keselamatan kerja sesuai kondisi dan lingkungan kerja.', 'Level menengahnya meliputi mematuhi prosedur atas kesadaran sendiri dan melaporkan kondisi berbahaya.', 'Kata kuncinya adalah mampu tanggap, sadar, dan peduli terhadap keselamatan kerja.'],
    'tkp-kartu-sakti-s18': ['Membangun hubungan kerja adalah kemampuan menjalin dan membina hubungan kerja demi tujuan organisasi.', 'Level tertingginya adalah mengembangkan kerja sama bilateral dan multilateral yang berdampak jangka panjang bagi kepentingan nasional.', 'Level menengahnya meliputi menjalin hubungan antarunit, antarinstansi, dan membentuk jaringan kerja sama.', 'Kata kuncinya adalah mampu menjalin dan membina hubungan kerja.'],
    'tkp-kartu-sakti-s19': ['Negosiasi adalah kemampuan menemukan alternatif untuk membuat kesepakatan yang mengakomodasi kepentingan semua pihak.', 'Level tertingginya adalah membuat kesepakatan yang saling menguntungkan dan mengakomodasi semua pihak.', 'Level menengahnya meliputi mengumpulkan informasi, mengajukan alternatif, dan tawar-menawar dengan data dan risiko.', 'Kata kuncinya adalah mampu membuat kesepakatan yang menguntungkan.'],
    'tkp-kartu-sakti-s20': ['Kewirausahaan adalah kemampuan mencari, menciptakan, dan menerapkan cara kerja, teknologi, dan produk baru untuk memberdayakan organisasi.', 'Level tertingginya adalah membangun budaya kemandirian dalam organisasi.', 'Level menengahnya meliputi memanfaatkan peluang, merumuskan konsep optimalisasi, dan mengembangkan sumber daya.', 'Kata kuncinya adalah mampu memberdayakan organisasi.'],
    'tkp-kartu-sakti-s21': ['Pencarian informasi adalah kemampuan mengumpulkan data dan informasi yang dibutuhkan secara sistematik.', 'Level tertingginya adalah membuat kesimpulan berdasarkan informasi yang relevan dan akurat.', 'Level menengahnya meliputi menguji kesahihan data dan menentukan informasi yang relevan.', 'Kata kuncinya adalah mampu menggali berbagai data dan informasi secara sistematik.'],
    'tkp-kartu-sakti-s22': ['Perhatian terhadap keteraturan adalah kemampuan memastikan dan mengurangi ketidakpastian terkait penugasan, kualitas, dan ketelitian data.', 'Level tertinggi yang tercantum adalah memantau kualitas pekerjaan agar pelaksanaan tugas sesuai prosedur.', 'Level menengahnya meliputi memelihara lingkungan kerja yang teratur dan memeriksa ulang akurasi tugas.', 'Kata kuncinya adalah mampu melaksanakan keteraturan sesuai standar pekerjaan.'],
    'tkp-kartu-sakti-s23': ['Komunikasi lisan adalah kemampuan menyampaikan pendapat, ide, atau informasi secara lisan dengan kata yang mudah dimengerti.', 'Level tertingginya adalah mengarahkan orang lain memahami maksud pembicaraan agar mendukung idenya.', 'Level menengahnya meliputi mengungkapkan pendapat dengan kalimat sistematis dan menggali informasi lewat pertanyaan.', 'Kata kuncinya adalah mampu berkomunikasi lisan yang mudah dimengerti.'],
    'tkp-kartu-sakti-s24': ['Komunikasi tertulis adalah kemampuan menyampaikan pendapat, ide, atau informasi secara jelas lewat tulisan yang baik dan benar.', 'Level tertingginya adalah membuat tulisan yang menginspirasi orang untuk mengikuti gagasannya.', 'Level menengahnya meliputi menulis dengan alur logis dan menyederhanakan masalah rumit secara efisien.', 'Kata kuncinya adalah mampu menyampaikan gagasan yang mudah diterima pembaca.'],
    'tkp-kartu-sakti-s25': ['Pengambilan keputusan adalah kemampuan bertindak cepat dan tepat dengan mempertimbangkan dampak dan bertanggung jawab atas keputusan.', 'Level tertingginya adalah membuat keputusan strategis berdampak jangka panjang dengan data komprehensif dan akurat.', 'Level menengahnya meliputi mengidentifikasi masalah, memakai data, dan mengakomodasi kepentingan semua pihak.', 'Kata kuncinya adalah mampu bertindak cepat dan tepat dalam keputusan.'],
    'tkp-kartu-sakti-s26': ['Pengorganisasian adalah kemampuan mengoordinasikan pelaksanaan pekerjaan agar berjalan sesuai rencana yang ditetapkan.', 'Level tertingginya adalah menentukan sumber daya jangka panjang sesuai rencana strategis organisasi.', 'Level menengahnya meliputi membagi tugas, monitoring berkala, dan mengoordinasikan sumber daya terbatas.', 'Kata kuncinya adalah mampu mengoordinasikan kegiatan.'],
    'tkp-kartu-sakti-s27': ['Perencanaan adalah kemampuan menyusun rencana kerja yang spesifik, realistis, dan terukur sesuai visi, misi, dan tujuan organisasi.', 'Level tertingginya adalah menyusun visi, misi, nilai-nilai, dan tujuan unit kerja atau organisasi.', 'Level menengahnya meliputi menyusun rencana kegiatan, rencana operasional, dan program kerja.', 'Kata kuncinya adalah mampu menyusun rencana kerja.'],
    'tkp-kartu-sakti-s28': ['Manajemen perubahan adalah kemampuan mengelola sumber daya menghadapi tuntutan perubahan demi kinerja yang lebih baik.', 'Level tertingginya adalah mengembangkan sistem nilai dan budaya organisasi sesuai tuntutan organisasi ke depan.', 'Level menengahnya meliputi mengomunikasikan perubahan dan mengevaluasi program perubahan jangka panjang.', 'Kata kuncinya adalah mampu merespon dinamika perubahan.'],
    'tkp-kartu-sakti-s29': ['Berorientasi pada kualitas adalah kemampuan melaksanakan tugas dengan memperhatikan semua aspek pekerjaan secara detail demi mutu yang lebih baik.', 'Level tertingginya adalah menentukan proses dan standar kerja baru sesuai tuntutan mutu ke depan.', 'Level menengahnya meliputi mengamati proses kerja dan menelaah ulang agar hasilnya lebih baik.', 'Kata kuncinya adalah mampu mencapai mutu pada semua aspek pekerjaan.'],
    'tkp-kartu-sakti-s30': ['Manajemen konflik adalah kemampuan mengambil langkah untuk mengelola perselisihan menuju arah yang produktif.', 'Level tertingginya adalah menumbuhkan kondisi kondusif untuk berbagi pandangan yang terbuka, objektif, dan kreatif.', 'Level menengahnya meliputi mengidentifikasi sumber konflik dan memberi alternatif solusi beserta konsekuensinya.', 'Kata kuncinya adalah mampu menyelesaikan konflik.'],
    'tkp-kartu-sakti-s31': ['Tanggap terhadap pengaruh budaya adalah kemampuan menghargai keragaman budaya pegawai dan masyarakat sekitar.', 'Level tertingginya adalah mendayagunakan perbedaan budaya untuk menunjang tujuan organisasi dan penerimaan masyarakat.', 'Level menengahnya meliputi menghimpun masukan dari berbagai sudut pandang budaya dan bertindak sesuai norma budaya.', 'Kata kuncinya adalah mampu menghargai keragaman budaya pegawai dan lingkungan masyarakat.'],
    'tkp-kartu-sakti-s32': ['Empati adalah kemampuan mendengarkan dan memahami pikiran, perasaan, atau masalah orang lain yang tidak terucapkan.', 'Level tertingginya adalah bertindak aktif membantu orang yang berkesusahan dan kurang beruntung.', 'Level menengahnya meliputi mendengarkan keluhan dan merasakan perasaan orang lain yang tidak terungkapkan.', 'Kata kuncinya adalah mampu peduli terhadap orang lain.'],
    'tkp-kartu-sakti-s33': ['Interaksi sosial adalah kemampuan membangun kontak atau hubungan timbal balik yang menghasilkan proses saling mempengaruhi.', 'Level tertingginya adalah memadukan perbedaan dengan membentuk kebiasaan baru tanpa menghilangkan ciri kepribadian atau adat masing-masing.', 'Level menengahnya meliputi membangun keterbukaan, toleransi, dan menyesuaikan diri dengan pola pikir yang berbeda.', 'Kata kuncinya adalah mampu membangun keterikatan dan hubungan timbal balik.'],
    'tkp-modul-s01': ['TKP mengukur karakter keseharian peserta yang berkaitan dengan kultur lingkungan kerja kepegawaian PNS.', 'Pelayanan publik PNS mencakup kementerian, lembaga nasional, dan pemerintah daerah tingkat I dan II.', 'Aspek yang diuji antara lain integritas, kejujuran, tanggung jawab, adaptasi, dan pengendalian diri.', 'Aspek lainnya meliputi semangat berprestasi, inisiatif, kreativitas, ketekunan, toleransi, dan efisiensi kerja.'],
    'tkp-modul-s02': ['Integritas mengukur kesesuaian antara perkataan dan perbuatan seseorang dalam kehidupan sehari-hari.', 'Orang berintegritas berani mengatakan kebenaran dan membedakan yang benar dan salah dengan pasti.', 'Orang berintegritas berani memperjuangkan kebenaran meski risikonya mengancam kelangsungan kariernya.', 'Jadilah pribadi berintegritas yang jujur, tegas, dan disiplin agar disegani dan dihormati.'],
    'tkp-modul-s03': ['Kejujuran diukur dari ketulusan hati dalam perbuatan dan kebiasaan berkata benar.', 'Kecurangan kecil seperti mencurangi waktu kerja dan fasilitas kantor harus dihindari.', 'Kecurangan besar meliputi korupsi, suap-menyuap, mark-up proyek, dan menjual aset negara.', 'Kecurangan kecil yang terbiasa bisa mendorong seseorang melakukan kecurangan yang lebih besar.'],
    'tkp-modul-s04': ['Tanggung jawab adalah kemampuan bekerja mandiri sampai tuntas dan mempertanggungjawabkan tindakan sendiri.', 'Tanggung jawab juga mencakup risiko tindakan anggota tim yang berada di bawah wewenang seseorang.', 'Tanggung jawab penting bagi pegawai publik karena tindakannya berdampak bagi orang banyak.', 'Berusahalah sebaik-baiknya, teliti, hati-hati, dan pertimbangkan tindakan dengan matang.'],
    'tkp-modul-s05': ['Kemampuan beradaptasi mengukur kedewasaan seseorang dalam menyesuaikan diri dengan perubahan.', 'Adaptasi mencakup lingkungan baru, suasana baru, rekan kerja baru, atasan baru, dan peraturan baru.', 'Orang adaptif menyukai perubahan, berpikiran maju, dan mau belajar hal-hal baru.', 'Biasakan menyesuaikan diri dengan lingkungan baru dan amati perubahan di sekitar untuk mengoptimalkan prestasi.'],
    'tkp-modul-s06': ['Pengendalian diri mengukur kedewasaan seseorang mengontrol emosi saat menghadapi situasi yang tidak disukai.', 'Orang yang mampu mengendalikan diri berpikiran terbuka saat menghadapi tekanan.', 'Salurkan emosi lewat kegiatan positif seperti olahraga agar terhindar dari sikap yang merusak.', 'Puasa, yoga, dan meditasi dikenal membantu melatih kesabaran, ketenangan, dan pengendalian amarah.'],
    'tkp-modul-s07': ['Semangat berprestasi mengukur motivasi dan tekad seseorang melaksanakan tugas dengan baik dan meraih target.', 'Orang yang haus prestasi gemar belajar hal baru dan berpikiran terbuka.', 'Jangan mengejar promosi dengan cara tidak baik karena mematikan daya inovasi dan semangat berprestasi.', 'Bergaullah dengan orang yang bersemangat berprestasi agar semangat itu menular.'],
    'tkp-modul-s08': ['Inisiatif adalah tentang mencetuskan ide, sedangkan kreativitas adalah penerapan ide tersebut.', 'Aspek inisiatif mengukur kedewasaan mencetuskan ide yang berguna bagi masyarakat, organisasi, atau instansi.', 'Buka pikiran, perbanyak wawasan, dan latih diri berpikir cepat, detail, logis, dan terstruktur.', 'Ditolak adalah hal wajar, dan penolakan bisa menjadi dorongan untuk memperbaiki ide.'],
    'tkp-modul-s09': ['Kreativitas dan inovasi mengukur daya cipta seseorang membuat sesuatu yang baru.', 'Inovasi yang baik bersifat baru, tidak sama dengan yang sudah ada, dan tidak plagiat.', 'Inovasi yang baik juga optimal, misalnya lebih cepat, lebih hemat sumber daya, dan lebih baik dari yang lama.', 'Biasakan mencoba rutinitas dengan cara berbeda dan selalu siapkan rencana cadangan.'],
    'tkp-modul-s10': ['Ketekunan mengukur performa kerja yang kontinu dan berkesinambungan dalam tugas rutin.', 'Orang tekun mengerjakan tugas rutin dengan baik tanpa bosan dan tetap menjaga kualitas pekerjaan.', 'Orang tekun tidak sering ganti-ganti pekerjaan dalam waktu yang relatif dekat.', 'Saat pekerjaan tidak beres, lakukan evaluasi menyeluruh daripada marah-marah.'],
    'tkp-modul-s11': ['Orientasi pada pelayanan mengukur kesiapan dan kesigapan PNS dalam tugas pelayanan.', 'Melayani masyarakat adalah bentuk pengabdian kepada negara.', 'Orang yang berorientasi pelayanan selalu mendahulukan kepentingan umum daripada kepentingan pribadi.', 'Orang yang berorientasi pelayanan senang melayani terutama untuk kepentingan orang banyak.'],
    'tkp-modul-s12': ['Menghargai orang lain berarti menghargai pendapat, eksistensi, dan kapasitas orang lain.', 'Setiap orang punya kelebihan dan kekurangan, dan tidak ada manusia yang sempurna.', 'Ketegasan mengukur kekuatan pendirian dalam membuat keputusan yang sulit dan dilematis.', 'Orang tegas tidak ragu membuat keputusan dan berani mengambil keputusan yang benar.'],
    'tkp-modul-s13': ['Kepercayaan diri yang proporsional membantu memilih satu pilihan terbaik setelah pertimbangan matang.', 'Aspek ini mengukur rasa percaya diri saat mengambil keputusan dan menghadapi hal penting.', 'Berusahalah sebaik-baiknya, lalu yakinlah bahwa hasil terbaik akan datang.', 'Hasil yang tidak sesuai harapan bukan akhir segalanya, bangkitlah dan perbaiki diri.'],
    'tkp-modul-s14': ['Toleransi mengukur kedewasaan seseorang dalam menerima dan membantu orang lain yang kesulitan.', 'Orang toleran tetap menolong dengan tulus meski harus mengorbankan materi, waktu, dan perhatian.', 'Toleransi diperlukan untuk saling membantu rekan kerja dan menjaga kekompakan tim.', 'Tidak ada manusia yang dapat hidup sendiri karena manusia adalah makhluk sosial.'],
    'tkp-modul-s15': ['Kepedulian lingkungan mengukur kematangan sikap saat lingkungan memerlukan peran serta seseorang.', 'Orang peduli lingkungan memperhatikan dan berkomitmen menjaga lingkungan dengan baik.', 'Kepedulian lingkungan membantu tugas PNS, terutama yang menduduki posisi pengambil keputusan.', 'Manusia adalah makhluk sosial yang hidup saling tolong menolong.'],
    'tkp-modul-s17': ['Efisiensi kerja mengukur kemampuan menuntaskan pekerjaan dengan benar, lebih cepat, dan lebih hemat sumber daya.', 'Sumber daya seperti SDM, SDA, dan waktu terbatas sehingga harus dimanfaatkan sebaik mungkin.', 'Kerjakan pekerjaan berdasarkan urutan prioritas agar efektif dan efisien.', 'Belajar berkelanjutan diukur dari keinginan dan tindakan untuk terus maju dengan belajar terus-menerus.', 'Orang yang gemar belajar ditandai dengan gemar membaca dan mengikuti pelatihan pengembangan diri.'],
    'tkp-modul-s18': ['Bekerja sama dalam kelompok mengukur kemampuan seseorang bekerja dalam tim demi tujuan kelompok.', 'Pekerjaan PNS banyak dilakukan bersama-sama, diputuskan bersama, dan dibuat kebijakan untuk semua.', 'Berusahalah menjadi bagian yang berguna di dalam kelompok.', 'Pemimpin harus membagi tugas secara adil dan proporsional agar tim solid.'],
    'tkp-modul-s19': ['Teknik pemecahan masalah mengukur kemampuan memecahkan permasalahan sehari-hari dengan respons terbaik.', 'Respons terburuk saat menghadapi masalah adalah menghindari atau emosi.', 'Kemampuan memecahkan masalah terbentuk lewat proses belajar yang panjang dan pengalaman hidup.', 'Pemimpin yang tegas, jujur, dan disiplin akan disegani, dipatuhi, dan dihormati bawahannya.'],
    'tkp-rangkuman-temenasn-s01': ['Radikalisme menginginkan perubahan sosial dan politik dengan cara kekerasan.', 'Anti radikalisme adalah sikap anti kekerasan yang sejalan dengan Pancasila.', 'ASN wajib menentang radikalisme dan gerakan perpecahan.', 'TKP mengukur pengetahuan, sikap, dan tindakanmu menghadapi situasi radikalisme.'],
    'tkp-rangkuman-temenasn-s02': ['Penganut radikalisme menuntut perubahan drastis dan tidak segan memakai kekerasan.', 'Empat ciri penganut radikalisme adalah intoleran, fanatik, eksklusif, dan revolusioner.', 'Radikalisme dicegah dengan pemahaman agama, komunitas damai, dan berita yang benar.', 'Menjaga persatuan NKRI dan mengurangi kesenjangan sosial ikut menangkal radikalisme.'],
    'tkp-rangkuman-temenasn-s03': ['Jejaring kerja membangun hubungan, kerja sama, dan kolaborasi yang efektif.', 'Tidak ada organisasi yang bisa sukses dengan berdiri sendiri.', 'Kemitraan dibangun atas dasar saling percaya dan saling menguntungkan.', 'Syarat kemitraan meliputi kesamaan visi, kesepakatan, dan komitmen bersama.'],
    'tkp-rangkuman-temenasn-s04': ['Kemitraan dimulai dari kesamaan visi dan misi antar lembaga.', 'Kepercayaan adalah modal dasar yang dibangun lewat kejujuran dan niat baik.', 'Kemitraan harus saling menguntungkan agar harmonis dan berkelanjutan.', 'Komunikasi timbal balik dan komitmen kuat menjaga kerja sama tetap permanen.'],
    'tkp-rangkuman-temenasn-s05': ['Pelayanan publik memenuhi kebutuhan warga atas barang, jasa, dan layanan administratif.', 'Tiga unsurnya adalah penyelenggara, penerima layanan, dan kepuasan pelanggan.', 'Budaya pelayanan dibentuk oleh sikap karyawan dan manajemen organisasi.', 'Sikap pelayanan yang baik dirangkum dalam 7P, dari semangat sampai tepat waktu.'],
    'tkp-rangkuman-temenasn-s06': ['UU Nomor 25 Tahun 2009 menetapkan 12 asas pelayanan publik.', 'Pelayanan harus mengutamakan kepentingan umum dan kepastian hukum.', 'Setiap warga berhak atas pelayanan yang adil tanpa diskriminasi.', 'Asas lainnya meliputi keterbukaan, akuntabilitas, dan ketepatan waktu.'],
    'tkp-rangkuman-temenasn-s07': ['Etiket memelihara hubungan baik dan membuat kita disegani serta dipercaya.', 'Perhatikan sikap, ekspresi, penampilan, dan cara berbicara saat melayani.', 'Cara mendengarkan dan bertanya yang baik adalah bagian dari etiket.', 'Kata kunci pelayanan meliputi atensi, senyum, salam, tolong, maaf, dan terima kasih.'],
    'tkp-rangkuman-temenasn-s08': ['Profesionalisme berarti bekerja tuntas dan akurat sesuai tuntutan jabatan.', 'Perilaku utamanya adalah keahlian yang luas dan bekerja dengan hati.', 'Bekerja berorientasi pada dampak, bukan hanya pada keluaran.', 'Prinsipnya meliputi jujur, loyal, proaktif, dan bertanggung jawab.'],
    'tkp-rangkuman-temenasn-s09': ['TIK dimanfaatkan untuk meningkatkan kinerja secara efektif.', 'Teknologi membuat komunikasi lebih mudah dan cepat.', 'TIK memudahkan akses dan berbagi informasi terkait pekerjaan.', 'Teknologi mempersingkat waktu dan memangkas biaya kerja.'],
    'tkp-rangkuman-temenasn-s10': ['Sosial budaya menguji adaptasi dan kerja efektif dalam masyarakat majemuk.', 'Indonesia adalah masyarakat majemuk dengan ragam budaya yang tersebar luas.', 'Bhinneka Tunggal Ika berarti berbeda-beda tetapi tetap satu jua.', 'Persatuan adalah konsensus bersama untuk mengatasi kerawanan akibat keberagaman.'],
    'tkp-rangkuman-temenasn-s11': ['Gotong royong dan musyawarah mufakat adalah pola tindak sosial budaya Indonesia.', 'Prasaja mengajarkan hidup sederhana, hemat, disiplin, dan tertib.', 'Kesatria menuntut keberanian, kejujuran, dan pengabdian tanpa menyerah.', 'Toleransi, pluralisme, dan perilaku inklusif menjaga keutuhan bangsa.'],
    'twk-bang-arya-s02': ['Setiap sila Pancasila punya nilai inti masing-masing yang perlu dihafal.', 'Sila pertama menekankan toleransi dan penghormatan terhadap keyakinan orang lain.', 'Sila keempat menekankan musyawarah mufakat dan larangan memaksakan kehendak.', 'Sila kelima menekankan keadilan dan batas hak pribadi agar tidak merugikan orang lain.'],
    'twk-bang-arya-s08': ['UUD 1945 disahkan PPKI pada 18 Agustus 1945, sehari setelah proklamasi.', 'Indonesia pernah berbentuk federasi pada masa Konstitusi RIS tahun 1949 sampai 1950.', 'Dekret Presiden 5 Juli 1959 memberlakukan kembali UUD 1945 dan membubarkan Konstituante.', 'UUD 1945 diamandemen empat kali pada 1999, 2000, 2001, dan 2002, tanpa mengubah Pembukaan.'],
    'twk-bang-arya-s17': ['KPK merumuskan sembilan nilai integritas sebagai tameng dari perilaku koruptif.', 'Sembilan nilai itu mudah diingat lewat akronim JUMAT BERSEPEDA KK.', 'Nilai intinya adalah jujur, disiplin, dan tanggung jawab.', 'Nilai sikapnya adalah berani, adil, dan peduli, sedangkan nilai etos kerjanya adalah mandiri, kerja keras, dan sederhana.', 'Jujur berarti lurus hati, tidak berbohong dan tidak curang, serta mengakui kesalahan.'],
    'twk-bang-arya-s25': ['Huruf kapital dipakai di awal kalimat, awal petikan langsung, dan kata sapaan.', 'Nama orang, gelar yang diikuti nama, dan nama jabatan yang diikuti nama ditulis kapital.', 'Nama negara, instansi, peristiwa sejarah, dan nama diri geografi ditulis kapital.', 'Jabatan tanpa nama orang dan nama geografi tanpa nama diri tidak ditulis kapital.'],
    'twk-bang-arya-s32': ['Lima prinsip nasionalisme adalah kesatuan, kebebasan, kesamaan, kepribadian, dan prestasi.', 'Nasionalisme menempatkan kesetiaan tertinggi kepada bangsa dan negara.', 'Patriotisme adalah sikap rela mengorbankan segalanya demi negara dan bangsa.', 'Bhinneka Tunggal Ika berarti berbeda-beda tetapi tetap satu.', 'Prinsip Bhinneka Tunggal Ika adalah menerima dan terbuka terhadap perbedaan.'],
    'twk-bang-arya-s37': ['Pasal 1 ayat 1 UUD 1945 menegaskan bentuk negara Indonesia adalah kesatuan dan bentuk pemerintahannya republik.', 'NKRI dibagi atas daerah provinsi, dan provinsi dibagi atas kabupaten dan kota.', 'Pasal 37 ayat 5 menegaskan bentuk NKRI tidak dapat dilakukan perubahan.', 'Alinea keempat Pembukaan UUD 1945 memuat dasar negara Pancasila.', 'Pasal 31 ayat 1 menegaskan setiap warga negara berhak mendapat pendidikan.'],
    'twk-cheat-sheet-s01': ['Nasionalisme adalah rasa cinta dan kebanggaan terhadap tanah air serta kesadaran akan identitas nasional.', 'Tujuan nasionalisme adalah menjaga persatuan, membangun negara yang kuat, dan melindungi kedaulatan.', 'Implementasinya meliputi partisipasi aktif, mempertahankan budaya, dan menjaga keutuhan bangsa.', 'Kata kuncinya antara lain persatuan, kesatuan, kedaulatan, dan cinta tanah air.', 'Dalam soal, fokus pada konteks persatuan atau kedaulatan lalu eliminasi pilihan yang tidak sesuai.'],
    'twk-cheat-sheet-s02': ['Empat pilar negara adalah Pancasila, UUD 1945, NKRI, dan Bhinneka Tunggal Ika.', 'Pancasila adalah dasar negara, sedangkan UUD 1945 adalah konstitusi yang mengatur tatanan bernegara.', 'Setiap sila Pancasila punya nilai yang harus diamalkan dalam kehidupan sehari-hari.', 'Dalam soal, identifikasi dulu pilar yang dimaksud sebelum memilih jawaban.'],
    'twk-cheat-sheet-s03': ['Bela negara adalah sikap dan perilaku warga yang dijiwai kecintaan pada NKRI berdasarkan Pancasila dan UUD 1945.', 'Patriotisme adalah aktif membela negara, cinta tanah air adalah bangga pada budaya, dan rela berkorban adalah siap berkorban demi negara.', 'Lima unsur bela negara meliputi cinta tanah air, sadar berbangsa dan bernegara, dan setia pada Pancasila.', 'Dalam soal, kenali dulu konsepnya dari kata kunci seperti membela, bangga terhadap, atau siap berkorban.'],
    'twk-cheat-sheet-s04': ['Integritas adalah konsistensi antara ucapan dan tindakan berdasarkan nilai moral dan etika.', 'Core value BERAKHLAK terdiri dari tujuh nilai, dari berorientasi pelayanan sampai kolaboratif.', 'Pencegahan KKN dilakukan lewat transparansi, pelaporan dan pengawasan, serta sanksi tegas.', 'Dalam soal, pilih jawaban yang mencerminkan tindakan jujur, bertanggung jawab, dan transparan.'],
    'twk-cheat-sheet-s05': ['Kalimat efektif memiliki enam ciri, yaitu kesatuan, kepaduan, keparalelan, kelogisan, kehematan, dan ketepatan diksi.', 'EYD mengatur penggunaan huruf, tanda baca, dan penulisan kata dalam bahasa Indonesia.', 'Pemahaman bacaan meliputi gagasan utama, simpulan, informasi tersurat, dan informasi tersirat.', 'Untuk gambar, tabel, dan grafik, perhatikan judul, label, legenda, dan keterangan tambahannya.'],
    'twk-cheat-sheet-s06': ['Bagi hari belajar per subtes TWK, TIU, dan TKP, dan sisihkan satu hari untuk full tryout.', 'Kerjakan tryout minimal 2 sampai 3 kali dalam seminggu dan evaluasi hasilnya.', 'Buat strategi pengelolaan waktu agar terbiasa dengan batas waktu ujian SKD.', 'Pasang target skor di atas 400 agar belajar lebih terarah dan progresnya mudah diukur.', 'Gunakan cheat sheet untuk mempelajari cara menjawab soal dengan lebih cepat dan akurat.'],
    'twk-integritas-pilar-s01': ['Integritas berarti ucapan sama dengan perbuatan dan tetap bertindak benar meski tidak diawasi.', 'KPK merumuskan sembilan nilai integritas yang mudah diingat lewat akronim JUMAT BERSEPEDA KK.', 'Gratifikasi yang berhubungan dengan jabatan dan berlawanan dengan kewajiban dianggap suap.', 'Gratifikasi yang dilaporkan ke KPK paling lambat 30 hari kerja sejak diterima tidak dipidana.', 'Bila menghadapi pelanggaran, jalur yang benar adalah pelaporan resmi, bukan diam atau main hakim sendiri.'],
    'twk-integritas-pilar-s02': ['Empat Pilar MPR RI adalah Pancasila, UUD 1945, NKRI, dan Bhinneka Tunggal Ika.', 'Pancasila adalah dasar negara, bukan salah satu pilar yang setara dengan tiga lainnya.', 'Pembukaan UUD 1945 tidak boleh diubah, sedangkan batang tubuhnya sudah diamandemen empat kali.', 'Bhinneka Tunggal Ika berasal dari Kakawin Sutasoma karya Mpu Tantular dan berarti berbeda-beda tetapi tetap satu.', 'Pancasila memberi nilai, UUD 1945 memberi aturan, NKRI memberi wadah, dan Bhinneka Tunggal Ika memberi semangat persatuan.'],
    'twk-integritas-pilar-s03': ['Gratifikasi adalah pemberian terkait jabatan yang tidak selalu diawali kesepakatan.', 'Suap bersifat transaksional untuk mempengaruhi keputusan, pemberi dan penerima sama-sama dapat dipidana.', 'Pemerasan adalah pejabat yang memaksa, dan pihak yang dipaksa berposisi sebagai korban.', 'Gratifikasi yang dilaporkan ke KPK dalam 30 hari kerja tidak dipidana, tetapi suap tidak punya jalan lapor aman.', 'Tolak pemberian terkait jabatan sejak awal dengan sopan dan tegas.'],
    'twk-integritas-pilar-s04': ['LHKPN adalah laporan harta kekayaan penyelenggara negara untuk transparansi dan akuntabilitas.', 'LHKPN disampaikan saat pertama menjabat, saat berubah jabatan, setelah berakhir, dan berkala tiap tahun.', 'KPK menyediakan Whistleblowing System sebagai saluran pelaporan dugaan tindak pidana korupsi.', 'Pelapor yang beriktikad baik tidak dapat dituntut pidana maupun perdata atas laporannya.', 'Laporan yang baik berisi fakta dan bukti, disampaikan lewat jalur resmi, bukan disebar ke media sosial.'],
    'twk-keyword-bela-negara-s01': ['Bela negara berpusat pada kesadaran melindungi NKRI dari ancaman.', 'Nasionalisme berpusat pada kesetiaan memelihara dan menghormati bangsa.', 'Patriotisme adalah rela berkorban dengan pantang menyerah demi negara.', 'Cinta tanah air mencakup semua contoh bela negara, nasionalisme, dan patriotisme.'],
    'twk-keyword-bela-negara-s02': ['Bela negara adalah tekad, sikap, dan tindakan warga menjaga kedaulatan, keutuhan wilayah, dan keselamatan bangsa.', 'Dasar hukumnya antara lain UUD 1945 Pasal 27 ayat (3) dan Pasal 30 ayat (1), serta UU 3/2002 dan UU 23/2019.', 'Lima nilai dasar bela negara meliputi cinta tanah air, sadar berbangsa dan bernegara, dan setia pada Pancasila.', 'Rela berkorban dan kemampuan awal bela negara melengkapi lima nilai dasar tersebut.', 'Bela negara bukan hanya urusan tentara, setiap warga punya peran sesuai kedudukannya.'],
    'twk-keyword-bela-negara-s03': ['UU 3/2002 menyebut empat jalur bela negara, termasuk pendidikan kewarganegaraan dan pengabdian sesuai profesi.', 'Komponen Utama adalah TNI, Komponen Cadangan dikerahkan lewat mobilisasi, Komponen Pendukung meningkatkan kekuatan keduanya.', 'Keikutsertaan warga sebagai Komponen Cadangan bersifat sukarela lewat seleksi dan pelatihan dasar kemiliteran.', 'Indonesia tidak menerapkan wajib militer.', 'Sebagian besar bela negara warga sipil tidak melibatkan senjata.'],
    'twk-keyword-bela-negara-s04': ['Ancaman terbagi tiga: militer, nonmiliter, dan hibrida.', 'Ancaman militer dihadapi TNI sebagai komponen utama, ancaman nonmiliter oleh lembaga pemerintah di luar pertahanan.', 'Ancaman nonmiliter antara lain perang informasi, ancaman siber, dan penyelundupan narkoba.', 'Warga berperan lewat kewaspadaan sehari-hari, bukan mengambil alih tugas aparat.', 'Bela negara masa kini termasuk memeriksa kebenaran informasi sebelum membagikannya.'],
    'twk-modul-ringkasan-s01': ['TWK mengukur pemahaman peserta tentang Negara Kesatuan Republik Indonesia.', 'Ideologi adalah seperangkat prinsip yang memberi arah dan tujuan berbangsa dan bernegara.', 'Kata ideologi berasal dari idea yang artinya gagasan dan logos yang artinya pengetahuan.', 'Ideologi menjadi pedoman hidup ideal yang ingin diwujudkan bersama dalam masyarakat.'],
    'twk-modul-ringkasan-s02': ['Pancasila sebagai dasar negara tercantum dalam Pembukaan UUD 1945 alinea ke-4.', 'Pancasila sebagai ideologi negara adalah sistem nilai yang menjadi prinsip hidup ideal.', 'Pancasila sebagai pandangan hidup bangsa menjadi pedoman berbangsa dan bernegara.', 'Nilai Pancasila memberi arah menuju masyarakat yang adil dan makmur.'],
    'twk-modul-ringkasan-s03': ['Muh. Yamin mengusulkan dasar negara pada 29 Mei 1945 dalam sidang BPUPKI.', 'Soepomo mengusulkan dasar negara pada 31 Mei 1945 dengan lima gagasan.', 'Soekarno mengusulkan lima rumusan dasar negara pada 1 Juni 1945.', 'Panitia Sembilan menyusun Piagam Jakarta yang memuat rumusan awal Pancasila.', 'Sila pertama Piagam Jakarta diubah menjadi Ketuhanan Yang Maha Esa sebelum pengesahan.'],
    'twk-modul-ringkasan-s04': ['Sila pertama menjamin kebebasan beribadah sesuai agama dan kepercayaan masing-masing.', 'Sila kedua menuntut persamaan derajat dan sikap saling mencintai sesama manusia.', 'Sila ketiga mengutamakan persatuan bangsa di atas kepentingan pribadi dan golongan.', 'Sila keempat mengutamakan musyawarah mufakat dalam menyelesaikan persoalan.', 'Sila kelima mengajak seluruh warga menciptakan keadilan sosial dalam masyarakat.'],
    'twk-modul-ringkasan-s05': ['Pancasila melindungi HAM tanpa melupakan kewajiban asasi, tidak seperti komunisme dan liberalisme.', 'Pancasila menjunjung tinggi nasionalisme, sedangkan komunisme menolaknya dan liberalisme mengabaikannya.', 'Pancasila mengambil keputusan lewat musyawarah mufakat, baru voting bila mufakat tidak tercapai.', 'Pancasila tidak mengenal dominasi kekuasaan dan menghargai perbedaan pendapat.', 'Pancasila mengutamakan kepentingan seluruh rakyat, bukan negara atau mayoritas saja.'],
    'twk-modul-ringkasan-s06': ['Dalam politik, sikap positif Pancasila adalah berpendapat bebas dan bertanggung jawab.', 'Dalam ekonomi, sikap positif Pancasila adalah jujur dan memanfaatkan sumber daya dengan baik.', 'Dalam kehidupan sosial, Pancasila menuntut sikap menghormati sesama tanpa membedakan latar belakang.', 'Sikap adil dan tidak mengambil hak orang lain adalah wujud nyata nilai Pancasila.'],
    'twk-modul-ringkasan-s07': ['Konstitusi dalam arti sempit adalah hukum dasar yang memuat aturan pokok negara.', 'Konstitusi dalam arti luas mengatur kehidupan kenegaraan dan hubungan lembaga negara.', 'Konstitusi fleksibel mudah diubah, sedangkan konstitusi rigid sulit diubah.', 'UUD 1945 disahkan PPKI pada 18 Agustus 1945 dan berlaku sampai 27 Desember 1949.'],
    'twk-modul-ringkasan-s08': ['Konstitusi tertulis disebut Undang-Undang Dasar, sedangkan yang tidak tertulis disebut konvensi.', 'UUD 1945 asli terdiri dari Pembukaan empat alinea dan batang tubuh 16 bab serta 37 pasal.', 'UUD RIS 1949 berbentuk federasi dengan sistem kabinet parlementer.', 'UUDS 1950 berlaku 1950 sampai 1959 dengan sistem parlementer dan demokrasi liberal.', 'Dekret Presiden 5 Juli 1959 memberlakukan kembali UUD 1945 setelah Konstituante gagal.'],
    'twk-modul-ringkasan-s09': ['Pada 1945 sampai 1949, kekuasaan presiden sangat luas karena masa peralihan.', 'UUD RIS menyimpang karena bentuk serikat bertentangan dengan konsep NKRI.', 'UUDS 1950 menimbulkan persaingan tidak sehat dan kabinet yang sering berganti.', 'Pada Orde Lama, presiden membubarkan DPR dan diangkat seumur hidup.', 'Pada Orde Baru, supremasi hukum digantikan supremasi kekuasaan dan muncul KKN.'],
    'twk-modul-ringkasan-s10': ['Amandemen UUD 1945 bertujuan memenuhi tuntutan reformasi dan memperjelas isi UUD.', 'Amandemen pertama diputuskan 19 Oktober 1999 dan mengubah 9 pasal.', 'Amandemen kedua diputuskan 18 Agustus 2000 dan mengubah 25 pasal.', 'Amandemen ketiga diputuskan 9 November 2001 dan mengatur pemilihan presiden langsung.', 'Amandemen keempat diputuskan 10 Agustus 2002 dan mengubah 13 pasal.'],
    'twk-modul-ringkasan-s11': ['Bhinneka Tunggal Ika pertama kali diungkapkan Mpu Tantular, pujangga Kerajaan Majapahit.', 'Semboyan itu terdapat dalam kakawin Sutasoma pupuh 139 bait 5.', 'Artinya berbeda-beda tetapi tetap satu jua, tidak ada kebenaran yang mendua.', 'Semboyan ini mengantisipasi keanekaragaman agama rakyat Majapahit pada masa itu.'],
    'twk-modul-ringkasan-s12': ['Bhinneka Tunggal Ika ditetapkan sebagai semboyan resmi lewat PP No. 66 Tahun 1951.', 'Semboyan ini tercantum dalam Pasal 36A UUD 1945 setelah amandemen kedua.', 'Kata bhinna ika dirangkai menjadi satu kata bhinneka.', 'Esensi Bhinneka Tunggal Ika adalah menampung kemajemukan dalam satu wadah NKRI.'],
    'twk-modul-ringkasan-s13': ['Lambang negara diatur dalam PP No. 66 Tahun 1951 tentang Lambang Negara.', 'Pasal 36A UUD 1945 menyebut lambang negara ialah Garuda Pancasila.', 'Lambang negara terdiri dari Burung Garuda, perisai jantung, dan pita semboyan.', 'Burung Garuda menengok ke kanan dengan perisai yang digantung rantai di lehernya.'],
    'twk-modul-ringkasan-s14': ['Bhinneka Tunggal Ika adalah kesepakatan bangsa yang ditetapkan dalam UUD.', 'Penerapannya mengacu pada Pembukaan UUD 1945 yang mengutamakan kepentingan bangsa.', 'Pembukaan UUD 1945 menegaskan kemerdekaan ialah hak segala bangsa.', 'Bhinneka Tunggal Ika tidak berdasar pada individualisme dan liberalisme.'],
    'twk-modul-ringkasan-s15': ['Prinsip Bhinneka Tunggal Ika mengakui kemajemukan agama, suku, budaya, daerah, dan ras.', 'Kemajemukan harus dihormati dan diikat dalam kesatuan yang kokoh.', 'Kemajemukan bukan faktor pemecah bangsa, melainkan kekuatan masing-masing komponen bangsa.', 'Kemajemukan yang bersinergi menjadi kekuatan menghadapi tantangan bangsa.'],
    'twk-modul-ringkasan-s16': ['Paham Bhinneka Tunggal Ika mengembangkan konsep baru dari unsur asli dan unsur luar.', 'Paham ini bukan sinkretisme karena unsur aslinya tidak dilebur atau dihilangkan.', 'Adat istiadat tetap diakui eksistensinya dalam NKRI yang berwawasan kebangsaan.'],
    'twk-modul-ringkasan-s17': ['Bhinneka Tunggal Ika membentuk kesatuan dari keanekaragaman dengan toleransi.', 'Sifatnya inklusif, bukan sektarian atau eksklusif, dan bukan formalitas semu.', 'Perbedaan dicari titik temunya lewat kesepakatan bersama, bukan dibesar-besarkan.', 'Penerapannya dijiwai religiositas, humanitas, nasionalitas, kedaulatan, dan sosialitas.'],
    'twk-modul-ringkasan-s18': ['Demokrasi berasal dari demos yang artinya rakyat dan kratos yang artinya kekuasaan.', 'Demokrasi pertama diterapkan di negara kota Yunani Kuno secara langsung.', 'Magna Charta tahun 1215 menjadi awal kebangkitan kembali demokrasi di Inggris.', 'John Locke merumuskan hak hidup, kebebasan, dan kepemilikan sebagai hak dasar manusia.', 'Montesquieu mengemukakan Trias Politika untuk membatasi kekuasaan antar lembaga negara.'],
    'twk-modul-ringkasan-s19': ['Prinsip demokrasi meliputi konstitusi, pemilu yang bebas, HAM, dan persamaan di depan hukum.', 'Demokrasi langsung melibatkan seluruh rakyat, sedangkan demokrasi perwakilan memakai lembaga wakil.', 'Demokrasi liberal berlaku 1945 sampai 1959, lalu demokrasi terpimpin 1959 sampai 1965.', 'Demokrasi Pancasila bersumber dari nilai Pancasila dan berlaku sejak 1965 sampai sekarang.', 'Dasar hukum demokrasi Pancasila antara lain sila keempat dan Pasal 1 Ayat (2) UUD 1945.'],
    'twk-modul-ringkasan-s20': ['Dasar hukum pemilu antara lain Pasal 22E UUD 1945 dan UU No. 12 Tahun 2003.', 'Asas pemilu adalah LUBERJURDIL, yaitu langsung, umum, bebas, rahasia, jujur, dan adil.', 'Anggota DPR dan DPRD dipilih lewat partai politik, sedangkan anggota DPD lewat perseorangan.', 'Asas rahasia menjamin pilihan pemilih tidak diketahui oleh siapa pun.'],
    'twk-modul-ringkasan-s21': ['Presiden dan wakil presiden dipilih dari pasangan yang dicalonkan partai atau gabungan partai.', 'KPU adalah badan independen penyelenggara pemilu di Indonesia.', 'Sistem distrik membagi pemilih ke distrik dengan jatah satu kursi per distrik.', 'Kedaulatan berasal dari supremus yang artinya kekuasaan tertinggi.', 'Sifat kedaulatan menurut Jean Bodin adalah asli, abadi, tunggal, dan tidak terbatas.'],
    'twk-modul-ringkasan-s22': ['Kedaulatan ke dalam adalah kekuasaan tertinggi mengatur fungsi negara di dalam negeri.', 'Kedaulatan ke luar adalah kekuasaan tertinggi menjaga wilayah dan berhubungan dengan negara lain.', 'Kedua kedaulatan dijalankan sesuai peraturan perundang-undangan yang berlaku.'],
    'twk-modul-ringkasan-s23': ['Teori kedaulatan Tuhan menempatkan kekuasaan tertinggi bersumber pada Tuhan.', 'Teori kedaulatan raja menempatkan raja di atas hukum secara mutlak.', 'Teori kedaulatan hukum menuntut penguasa dan rakyat tunduk pada hukum.', 'Teori kedaulatan rakyat bersumber dari ajaran demokrasi dengan tokoh Locke dan Rousseau.', 'Setelah amandemen, lembaga negara berkedudukan sejajar di bawah UUD 1945.'],
    'twk-modul-ringkasan-s24': ['MPR berwenang mengubah UUD serta melantik dan memberhentikan presiden.', 'DPR memiliki hak angket, interpelasi, imunitas, dan hak budget.', 'MA mengadili pada tingkat kasasi dan menguji peraturan di bawah UU.', 'MK menguji UU terhadap UUD dan memutus perselisihan hasil pemilu.', 'Indonesia memakai sistem presidensial, berbeda dengan parlementer dan semipresidensial.'],
    'twk-modul-ringkasan-s25': ['Sistem pemerintahan Indonesia adalah presidensial.', 'Kedaulatan berada di tangan rakyat menurut Pasal 1 Ayat (2) UUD 1945.', 'Indonesia adalah negara hukum menurut Pasal 1 Ayat (3) UUD 1945.', 'Presiden tidak dapat membubarkan DPR karena keduanya berkedudukan sejajar.', 'DPR memegang kekuasaan membentuk undang-undang menurut Pasal 20 Ayat (1).'],
    'twk-modul-ringkasan-s26': ['UUD 1945 adalah peraturan tertinggi dalam tata urutan perundang-undangan.', 'Ketetapan MPR mengikat ke dalam dan ke luar majelis, sedangkan keputusan hanya ke dalam.', 'Perppu dibuat pemerintah dalam hal kepentingan yang memaksa dan harus diajukan ke DPR.', 'Peraturan Pemerintah dibuat untuk melaksanakan undang-undang.', 'Perda provinsi dibuat DPRD provinsi bersama gubernur, Perda kabupaten atau kota bersama bupati atau walikota.'],
    'twk-modul-ringkasan-s27': ['Peraturan desa dibuat oleh Badan Permusyawaratan Desa atau lembaga setingkat.', 'Peraturan perundang-undangan berfungsi memberi kepastian hukum dan rasa keadilan.', 'Asas hierarki melarang peraturan bertentangan dengan peraturan yang lebih tinggi.', 'RUU dapat berasal dari presiden maupun DPR, lalu dibahas dan ditetapkan DPR.', 'Kerangka peraturan terdiri dari judul, pembukaan, dan batang tubuh.'],
    'twk-modul-ringkasan-s28': ['Otonomi berasal dari auto yang artinya sendiri dan nomos yang artinya aturan.', 'Otonomi daerah adalah hak daerah mengatur urusan pemerintahan sendiri dalam NKRI.', 'Nilai dasar otonomi daerah adalah kebebasan, partisipasi, efektivitas, dan efisiensi.', 'DPRD memiliki fungsi legislasi, anggaran, dan pengawasan di daerah.', 'Kepala daerah berkedudukan sederajat dan seimbang dengan DPRD di daerahnya.'],
    'twk-modul-ringkasan-s29': ['Kebijakan publik adalah rangkaian keputusan pemerintah yang menyangkut kepentingan masyarakat.', 'Tujuan kebijakan publik meliputi ketertiban, perlindungan hak, kedamaian, dan kesejahteraan.', 'Pelaksanaan kebijakan publik melibatkan manusia, dana, serta sarana dan prasarana.', 'Masyarakat perlu berpartisipasi dalam perencanaan, pelaksanaan, dan pengawasan kebijakan.', 'Kebijakan yang tidak sesuai harapan masyarakat dapat menimbulkan gejolak sosial.'],
    'twk-modul-ringkasan-s30': ['HAM adalah hak dasar yang dimiliki manusia sejak lahir sebagai anugerah Tuhan.', 'UU No. 39 Tahun 1999 mewajibkan negara menghormati dan melindungi HAM.', 'HAM yang bersifat pokok meliputi hak hidup, kebebasan, dan hak memiliki sesuatu.', 'HAM berkembang dalam bidang pribadi, ekonomi, politik, hukum, serta sosial budaya.'],
    'twk-modul-ringkasan-s31': ['Manusia adalah makhluk Tuhan yang paling mulia sehingga nilai kemanusiaan harus diutamakan.', 'Pelanggaran HAM masih banyak terjadi dalam keluarga, masyarakat, dan negara.', 'Masyarakat mendesak kehidupan demokratis yang memberi ruang menyalurkan hak warga negara.'],
    'twk-modul-ringkasan-s32': ['Instrumen HAM adalah alat untuk melindungi dan menegakkan HAM.', 'Deklarasi Universal Hak-Hak Asasi Manusia disahkan pada 10 Desember 1948.', 'Piagam PBB tahun 1945 menjadi dasar berdirinya Perserikatan Bangsa-Bangsa.', 'Di Indonesia, HAM diatur dalam UUD 1945 dan peraturan perundang-undangan.'],
    'twk-modul-ringkasan-s33': ['Deklarasi Universal HAM lahir pada 10 Desember 1948 di bawah PBB.', 'Magna Charta tahun 1215 adalah piagam HAM tertua di Inggris.', 'Amerika Serikat memiliki Declaration of Independence tahun 1776.', "Prancis memiliki Declaration des Droits de l'Homme tahun 1789.", 'Di Indonesia, HAM dijamin dalam UUD 1945 yang lahir 18 Agustus 1945.'],
    'twk-modul-ringkasan-s34': ['Perundang-undangan HAM lahir untuk melaksanakan UUD 1945 hasil amandemen.', 'Tap MPR No. XVII/MPR/1998 mengamanatkan perlindungan HAM di Indonesia.', 'UU No. 39 Tahun 1999 adalah undang-undang pokok tentang HAM.', 'UU No. 26 Tahun 2000 mengatur Pengadilan HAM untuk pelanggaran HAM berat.', 'UU No. 13 Tahun 2006 mengatur perlindungan saksi dan korban.'],
    'twk-modul-ringkasan-s35': ['Pelanggaran HAM adalah perbuatan yang mengurangi atau mencabut hak orang lain.', 'Kasus Tanjung Priok terjadi tahun 1984 dan Marsinah terbunuh tahun 1994.', 'Wartawan Udin terbunuh tahun 1996 dan mahasiswa Trisakti ditembak tahun 1998.', 'Kasus yang sering dilaporkan ke Komnas HAM meliputi agama, tanah, dan perburuhan.'],
    'twk-modul-ringkasan-s36': ['Setiap pelanggaran HAM diproses sesuai ketentuan hukum yang berlaku.', 'Komnas HAM melakukan penyelidikan atas dugaan pelanggaran HAM.', 'Pelanggaran HAM berat diajukan ke Pengadilan HAM.', 'Hukuman tegas memberi efek jera agar pelanggaran tidak diulangi.'],
    'twk-modul-ringkasan-s37': ['Komnas HAM berfungsi mengkaji, menyuluh, memantau, dan memediasi persoalan HAM.', 'Pengadilan HAM adalah pengadilan khusus untuk pelanggaran HAM berat.', 'Kejahatan genosida bertujuan memusnahkan kelompok bangsa, ras, etnis, atau agama.', 'Kejahatan terhadap kemanusiaan adalah serangan meluas dan sistematik terhadap penduduk sipil.', 'LBH memberi bantuan hukum kepada masyarakat yang membutuhkan.'],
    'twk-modul-ringkasan-s38': ['Faktor intern meliputi penderitaan rakyat, kejayaan masa lalu, dan lahirnya golongan terpelajar.', 'Faktor ekstern meliputi paham baru seperti nasionalisme, demokrasi, liberalisme, dan sosialisme.', 'Kemenangan Jepang atas Rusia tahun 1905 membangkitkan semangat bangsa Asia.', 'Gerakan Turki Muda dan Revolusi Cina 1911 ikut mendorong pergerakan nasional.'],
    'twk-modul-ringkasan-s39': ['Budi Utomo lahir 20 Mei 1908 dengan ketua dr. Sutomo.', 'Sarekat Islam didirikan H. Samanhudi dan pecah menjadi SI Merah dan SI Putih tahun 1921.', 'Indische Partij didirikan Tiga Serangkai pada 25 Desember 1912.', 'PNI didirikan Soekarno pada 4 Juli 1927 di Bandung.', 'Parindra lahir 25 Desember 1935 sebagai gabungan Budi Utomo dan Persatuan Bangsa Indonesia.'],
    'twk-modul-ringkasan-s40': ['Gerindo lahir 24 Mei 1937 dengan asas nasionalis dan demokrasi.', 'GAPI menuntut kemerdekaan bertahap dalam jangka waktu 10 tahun.', 'Dewi Sartika mendirikan Sekolah Kautamaan Istri di Bandung pada 1904.', 'Kongres Wanita 1928 di Yogyakarta melahirkan Perserikatan Perempuan Indonesia.', 'Jepang masuk Indonesia dengan semboyan Tiga A dan membentuk organisasi seperti PETA.'],
    'twk-modul-ringkasan-s41': ['PUTERA lahir 1 Maret 1943 dipimpin Empat Serangkai dan dimanfaatkan untuk membela rakyat.', 'Chuo Sangi In memberi nasihat kepada penguasa tertinggi militer Jepang di Indonesia.', 'MIAI adalah perkumpulan organisasi Islam yang tetap diizinkan berdiri pada masa Jepang.', 'Perlawanan bawah tanah dilakukan kelompok Sutan Syahrir, Amir Syarifuddin, dan pemuda Menteng 31.', 'PETA memberontak di Blitar pada 14 Februari 1945 dan di Meureudu pada November 1944.'],
    'twk-modul-ringkasan-s42': ['BPUPKI diumumkan pembentukannya pada 1 Maret 1945 dan diresmikan 28 Mei 1945.', 'Ketua BPUPKI adalah K.R.T. Radjiman Wediodiningrat dengan 67 anggota.', 'Sidang pertama BPUPKI membahas dasar negara dari 29 Mei sampai 1 Juni 1945.', 'Panitia Sembilan menyusun Piagam Jakarta yang dilaporkan pada 22 Juni 1945.', 'Sidang kedua BPUPKI pada 10 sampai 17 Juli 1945 membahas rancangan UUD.'],
    'twk-modul-ringkasan-s43': ['PPKI dibentuk 7 Agustus 1945 menggantikan BPUPKI yang dibubarkan.', 'Soekarno, Hatta, dan Radjiman menghadap Marsekal Terauchi di Dalat pada 9 Agustus 1945.', 'Golongan tua ingin proklamasi dipersiapkan matang lewat rapat PPKI.', 'Golongan muda mendesak proklamasi segera tanpa menunggu rapat PPKI.', 'Sidang PPKI 18 Agustus 1945 mengesahkan UUD dan memilih Soekarno-Hatta.'],
    'twk-modul-ringkasan-s44': ['Rengasdengklok dipilih karena bebas dari kekuasaan Jepang dan jauh dari Jakarta.', 'Naskah proklamasi dirumuskan di rumah Laksamana Maeda dan diketik Sayuti Melik.', 'Proklamasi dibacakan di Pegangsaan Timur No. 56 pada 17 Agustus 1945 pukul 10.00 WIB.', 'Berita proklamasi disebar lewat radio, surat kabar, kurir, dan pamflet.', 'Mesir adalah negara pertama yang mengakui kemerdekaan Indonesia.'],
    'twk-modul-ringkasan-s45': ['Konflik Indonesia-Belanda dipicu kedatangan Sekutu yang membonceng NICA.', 'Pertempuran Surabaya meletus pada 10 November 1945 dengan pidato Bung Tomo.', 'Trikora dikeluarkan Soekarno pada 19 Desember 1961 untuk merebut Irian Barat.', 'Pemilu pertama digelar 29 September 1955 untuk DPR dan 15 Desember 1955 untuk Konstituante.', 'Dekret Presiden 5 Juli 1959 membubarkan Konstituante dan memberlakukan kembali UUD 1945.'],
    'twk-modul-ringkasan-s46': ['APRA, Andi Azis, dan RMS adalah pemberontakan awal tahun 1950.', 'Pemberontakan PKI di Madiun terjadi 18 September 1948 dan ditumpas 30 September 1948.', 'G 30 S/PKI menculik dan membunuh tujuh perwira TNI AD yang dikenal pahlawan revolusi.', 'DI/TII Jawa Barat dipimpin Kartosuwiryo dan berakhir dengan penangkapannya tahun 1962.', 'Tritura menuntut pembubaran PKI, pembersihan kabinet, dan perbaikan ekonomi.'],
    'twk-modul-ringkasan-s47': ['Soekarno menyerahkan kekuasaan kepada Soeharto pada 22 Februari 1967.', 'Pemilu pertama Orde Baru dilaksanakan 3 Juli 1971 dan dimenangkan Golkar.', 'Sidang MPR 1973 menetapkan GBHN dan memilih Soeharto sebagai presiden.', 'Orde Baru berakhir 21 Mei 1998 saat Soeharto menyerahkan jabatan kepada Habibie.', 'Pemilu 1999 diikuti 48 partai dan dimenangkan PDIP.'],
    'twk-modul-ringkasan-s48': ['Dewan Keamanan PBB membentuk Komisi Tiga Negara untuk menyelesaikan konflik Indonesia-Belanda.', 'KTN terdiri dari Australia, Belgia, dan Amerika Serikat.', 'KTN mempertemukan Indonesia dan Belanda dalam Perundingan Renville.', 'Perundingan Renville berlangsung 8 Desember 1947 di atas kapal perang Amerika Serikat.'],
    'twk-modul-ringkasan-s49': ['Konferensi Asia di New Delhi berlangsung 20 sampai 23 Januari 1949.', 'Resolusi DK PBB 28 Januari 1949 menuntut penghentian operasi militer Belanda.', 'Perundingan Linggajati mengakui RI secara de facto atas Jawa, Madura, dan Sumatra.', 'Persetujuan Roem-Royen disepakati 7 Mei 1949 antara Moh. Roem dan Van Royen.', 'KMB di Den Haag menghasilkan pengakuan kedaulatan kepada RIS pada akhir Desember 1949.'],
    'twk-modul-ringkasan-s50': ['Politik luar negeri Indonesia adalah bebas dan aktif menurut Tap No. XII/MPRS/1966.', 'Bebas aktif artinya tidak mengikat diri pada salah satu blok atau pakta militer.', 'Indonesia menghentikan konfrontasi dengan Malaysia sebagai wujud politik bebas aktif.', 'Indonesia kembali menjadi anggota PBB pada 28 September 1966.', 'Indonesia ikut memprakarsai berdirinya ASEAN pada 8 Agustus 1967.'],
    'twk-modul-ringkasan-s51': ['KAA didahului Konferensi Colombo dan Konferensi Bogor pada tahun 1954.', 'KAA berlangsung 18 sampai 24 April 1955 di Gedung Merdeka, Bandung.', 'KAA dihadiri 29 negara Asia dan Afrika, termasuk lima negara sponsor.', 'KAA menghasilkan Dasasila Bandung yang berisi sepuluh prinsip perdamaian.', 'KAA mendorong perjuangan kemerdekaan bangsa-bangsa Asia dan Afrika.'],
    'twk-modul-ringkasan-s52': ['ASEAN berdiri lewat Deklarasi Bangkok pada 8 Agustus 1967.', 'Lima pendiri ASEAN adalah Indonesia, Malaysia, Singapura, Filipina, dan Thailand.', 'Adam Malik menandatangani Deklarasi ASEAN mewakili Indonesia.', 'Tujuan ASEAN meliputi pertumbuhan ekonomi, perdamaian, dan kerja sama regional.', 'Indonesia menjadi tempat kedudukan Sekretariat Tetap ASEAN di Jakarta.'],
    'twk-modul-ringkasan-s53': ['PBB terbentuk lewat Piagam Atlantik sampai Konferensi San Francisco.', 'PBB resmi berdiri pada tanggal 24 Oktober 1945.', 'Tujuan PBB meliputi perdamaian dunia dan persahabatan antar bangsa.', 'PBB juga mengupayakan kerja sama internasional dan penghormatan HAM.'],
    'twk-modul-ringkasan-s54': ['PBB bertujuan mengembangkan kerja sama internasional di bidang ekonomi, sosial, dan budaya.', 'PBB memajukan HAM tanpa membedakan warna kulit, jenis kelamin, bahasa, dan agama.', 'Indonesia mengirim Pasukan Garuda sebagai sumbangan perdamaian dunia lewat PBB.', 'Indonesia membantu PBB memberi bantuan pangan ke Ethiopia pada 1985.', 'Indonesia pernah dipilih menjadi anggota tidak tetap Dewan Keamanan PBB.'],
    'twk-modul-ringkasan-s55': ['Gerakan Non Blok diilhami KAA Bandung tahun 1955 dan ketegangan Blok Barat dan Timur.', 'GNB bertujuan meredakan ketegangan dunia akibat pertentangan dua blok.', 'Indonesia ikut memprakarsai GNB dengan menandatangani Deklarasi Beograd.', 'KTT GNB X berlangsung di Jakarta pada 1 sampai 6 September 1992.'],
    'twk-modul-ringkasan-s56': ['Bahasa Indonesia yang baik dan benar merujuk pada Ejaan yang Disempurnakan.', 'Ejaan mengatur lambang bunyi ujaran dan cara hubungan antar lambang itu.', 'Abjad bahasa Indonesia terdiri dari 26 huruf kapital dan 26 huruf kecil.', 'Huruf kapital dipakai antara lain pada awal kalimat dan nama orang.'],
    'twk-modul-ringkasan-s57': ['Huruf vokal adalah A, I, U, E, O, sedangkan sisanya adalah huruf konsonan.', 'Diftong terdiri dari ai, au, dan oi yang dilafalkan dengan luncuran w atau y.', 'Pola suku kata meliputi V, VK, KV, dan KVK.', 'Huruf kapital dipakai pada awal kalimat, nama orang, dan nama tempat.', 'Kata depan di, ke, dari ditulis terpisah dari kata yang mengikutinya.'],
    'twk-modul-ringkasan-s58': ['Tanda titik dipakai pada akhir kalimat dan akhir singkatan nama orang.', 'Tanda koma memisahkan unsur perincian dan anak kalimat yang mendahului induk kalimat.', 'Tanda titik dua dipakai sebelum rangkaian atau perincian setelah pernyataan lengkap.', 'Tanda hubung menyambung unsur kata ulang dan kata yang dieja satu per satu.', 'Frasa adalah gabungan kata tanpa subjek dan predikat, sedangkan klausa memilikinya.'],
    'twk-modul-ringkasan-s59': ['Makna denotatif adalah makna sebenarnya, sedangkan konotatif adalah makna kiasan.', 'Sinonim adalah persamaan makna, sedangkan antonim adalah lawan makna.', 'Homograf sama ejaannya, sedangkan homofon sama lafalnya.', 'Hiponim adalah kata khusus dari kata umum, misalnya mawar adalah hiponim bunga.', 'Sinekdok pars pro toto memakai sebagian untuk keseluruhan dan sebaliknya totum pro parte.'],
    'twk-modul-ringkasan-s60': ['Pemahaman bacaan didukung kemampuan bahasa dan daya ingat.', 'Konsentrasi, ketelitian, dan kemampuan menyelesaikan masalah ikut berperan.', 'Bagian ini membuka materi seputar pemahaman bacaan.'],
    'twk-modul-ringkasan-s61': ['Gagasan utama adalah ide pokok yang menjadi pengembang bacaan atau paragraf.', 'Paragraf deduktif meletakkan gagasan utama di awal, induktif di akhir.', 'Kalimat utama memuat ide pokok dan dikembangkan oleh kalimat penjelas.', 'Cari jawaban di dalam bacaan dan hindari menjawab berdasarkan opini.'],
    'twk-rangkuman-temenasn-s01': ['Muh. Yamin mengusulkan dasar negara pada 29 Mei 1945.', 'Lima usulan Yamin meliputi peri kebangsaan, peri kemanusiaan, dan kesejahteraan rakyat.', 'Soepomo mengusulkan dasar negara pada 31 Mei 1945.', 'Lima usulan Soepomo meliputi persatuan, kekeluargaan, dan keadilan rakyat.'],
    'twk-rangkuman-temenasn-s02': ['Soekarno mengusulkan lima dasar negara pada 1 Juni 1945.', 'Panitia Sembilan menyusun Piagam Jakarta pada 22 Juni 1945.', 'Piagam Jakarta memuat lima sila dengan sila pertama tentang syariat Islam.', 'Sila pertama diubah menjadi Ketuhanan Yang Maha Esa sebelum pengesahan UUD 1945.'],
    'twk-rangkuman-temenasn-s03': ['Presiden dapat diberhentikan MPR atas usul DPR jika terbukti melanggar hukum atau tidak lagi memenuhi syarat.', 'DPR wajib meminta pertimbangan Mahkamah Konstitusi sebelum mengusulkan pemberhentian.', 'Mahkamah Konstitusi memutus paling lama 90 hari dan MPR bersidang paling lambat 30 hari.', 'Keputusan MPR bersifat final dan Presiden tidak dapat membubarkan DPR.', 'UUD 1945 diamandemen 4 kali, yaitu pada tahun 1999, 2000, 2001, dan 2002.'],
    'twk-rangkuman-temenasn-s04': ['Bela negara dilakukan secara fisik dan non-fisik sesuai kewajiban masing-masing.', 'Patriotisme berarti rela berkorban melebihi kewajiban demi tanah air.', 'Nasionalisme adalah kecintaan dan kesadaran hidup dalam negara dan bangsa.', 'Nilai cinta tanah air tercermin dalam sikap menjaga lingkungan dan produk dalam negeri.'],
    'twk-rangkuman-temenasn-s05': ['Kesadaran berbangsa tercermin dalam disiplin dan tanggung jawab terhadap tugas.', 'Hargai keanekaragaman suku, agama, ras, dan antar golongan.', 'Dahulukan kepentingan umum di atas kepentingan pribadi dan golongan.', 'Jalankan hak dan kewajiban sesuai peraturan perundang-undangan.'],
    'twk-rangkuman-temenasn-s06': ['Setia kepada Pancasila berarti memahami dan mengamalkan nilai-nilainya sehari-hari.', 'Pancasila diyakini sebagai dasar negara dan pemersatu bangsa.', 'Terapkan musyawarah mufakat dan junjung tinggi Hak Asasi Manusia.', 'Tolong-menolong antar sesama mencerminkan nilai luhur Pancasila.'],
    'twk-rangkuman-temenasn-s07': ['Rela menolong sesama tanpa melihat latar belakang sosio kultural.', 'Dahulukan kepentingan bangsa dan negara daripada kepentingan pribadi.', 'Sumbangkan tenaga, pikiran, dan kemampuan untuk kemajuan bangsa.', 'Berkorban untuk bangsa dan negara dilakukan tanpa pamrih.'],
    'twk-rangkuman-temenasn-s08': ['Bela negara membutuhkan kemampuan, integritas, dan kepercayaan diri yang tinggi.', 'Kenali bentuk ancaman di lingkungan dan siap siaga serta lapor dini.', 'Jaga kesehatan fisik dan mental serta kecerdasan emosional dan spiritual.', 'Manfaatkan kearifan lokal dan kekayaan sumber daya alam dengan bijak.'],
    'twk-rangkuman-temenasn-s09': ['Jangan berputus asa menghadapi persoalan bermasyarakat, berbangsa, dan bernegara.', 'Bekerja keras untuk kesejahteraan diri dan masyarakat.', 'Perjuangkan kedaulatan rakyat, keadilan, dan Hak Asasi Manusia.', 'Terapkan tata kelola pemerintahan yang bersih dan baik serta nilai kejuangan 1945.'],
    'twk-rangkuman-temenasn-s10': ['Pancasila sebagai ideologi terbuka bersifat reformatif, dinamis, dan terbuka.', 'Keterbukaan tidak berarti mengubah nilai-nilai yang terkandung di dalamnya.', 'Tiga nilainya adalah nilai dasar, nilai instrumental, dan nilai praksis.', 'Tiga dimensinya adalah idealistis, normatif, dan realistis.'],
    'twk-rangkuman-temenasn-s11': ['Bangsa Indonesia menyatakan percaya dan takwa kepada Tuhan Yang Maha Esa.', 'Setiap orang beribadah sesuai agama dan kepercayaannya masing-masing.', 'Kembangkan sikap hormat dan kerja sama antar pemeluk agama yang berbeda.', 'Tidak ada paksaan dalam hal agama dan kepercayaan terhadap Tuhan Yang Maha Esa.'],
    'twk-rangkuman-temenasn-s12': ['Setiap manusia diperlakukan sesuai harkat dan martabatnya sebagai makhluk Tuhan.', 'Semua manusia memiliki persamaan derajat, hak, dan kewajiban asasi.', 'Kembangkan sikap saling mencintai, tenggang rasa, dan tepa selira.', 'Berani membela kebenaran dan keadilan serta gemar kegiatan kemanusiaan.'],
    'twk-rangkuman-temenasn-s13': ['Persatuan dan keselamatan bangsa didahulukan di atas kepentingan pribadi.', 'Persatuan Indonesia dikembangkan atas dasar Bhinneka Tunggal Ika.', 'Musyawarah diutamakan dalam mengambil keputusan untuk kepentingan bersama.', 'Keputusan musyawarah dihormati dan dilaksanakan dengan tanggung jawab.'],
    'twk-rangkuman-temenasn-s14': ['Keadilan sosial diamalkan lewat sikap adil dan keseimbangan hak dan kewajiban.', 'Hak milik tidak boleh dipakai untuk pemerasan, pemborosan, atau merugikan umum.', 'Hargai karya orang lain dan bekerja keras untuk kemajuan bersama.', 'Pembukaan UUD 1945 memuat empat pokok pikiran, dari persatuan sampai Ketuhanan.'],
    'twk-rangkuman-temenasn-s15': ['Pokok pikiran pertama menyatakan negara melindungi segenap bangsa dan tumpah darah Indonesia.', 'Negara siap melindungi bangsanya berdasarkan persatuan.', 'Warga negara wajib mengutamakan kepentingan bersama di atas kepentingan sendiri.'],
    'twk-rangkuman-temenasn-s16': ['Pokok pikiran kedua menyatakan negara mewujudkan keadilan sosial bagi seluruh rakyat.', 'Pokok pikiran ini merupakan pancaran sila kelima Pancasila.', 'Pokok pikiran ini berpedoman kepada Pasal 27 sampai 34 UUD 1945.'],
    'twk-rangkuman-temenasn-s17': ['Pokok pikiran ketiga merupakan pancaran sila keempat Pancasila.', 'Kedaulatan dipegang oleh rakyat dan dilaksanakan sesuai Undang-Undang Dasar.', 'Pokok pikiran ini didasarkan pada Pasal 1 ayat (2) UUD 1945.'],
    'twk-rangkuman-temenasn-s18': ['Pokok pikiran keempat merupakan pancaran sila pertama dan sila kedua Pancasila.', 'Negara berdasarkan atas Ketuhanan Yang Maha Esa dan kemanusiaan yang adil dan beradab.', 'Pemerintah dan perangkat hukum wajib menerapkan budi pekerti dan ketakwaan.'],
    'twk-rangkuman-tryout-s01': ['Nasionalisme Indonesia bersifat realistis dan terbuka, fleksibel mengikuti zaman namun tetap menyaring pengaruh luar.', 'Gratifikasi dilarang karena dianggap akar korupsi dan membuat pejabat bersikap tidak objektif dan tidak adil.', 'Korupsi muncul dari kekuasaan ditambah kesempatan, dikurangi integritas.', 'Sumpah Pemuda dicetuskan pada Kongres Pemuda II tahun 1928.', 'Deklarasi Juanda 13 Desember 1957 menjadikan laut antar pulau sebagai wilayah kedaulatan Indonesia.'],
}

def clean_bang_arya_content(t):
    """Bersihkan artefak ekstraksi PDF Bang Arya pada seksi yang diselamatkan:
    watermark atribusi, kata/frasa yang terekstrak berulang, nomor liar."""
    t = t.replace("Kang Arya CPNS", "").replace("Kang Arya", "")
    # kata berulang menempel ("PRINSIPPRINSIP", "patriotismepatriotisme")
    for _ in range(3):
        t2 = re.sub(r"\b([A-Za-z]{4,})\1+\b", r"\1", t)
        if t2 == t:
            break
        t = t2
    # frasa berulang bersebelahan, 2-4 kata, koma ditoleransi
    # ("Sikap dan tindakanSikap dan tindakan", "Cara berfikir, berbuatCara ...")
    _phrase_dup = re.compile(r"\b([A-Za-z]+[,.]?(?:\s+[A-Za-z]+[,.]?){1,3}?)\s*?\1\b", re.I)
    for _ in range(3):
        t2 = _phrase_dup.sub(r"\1", t)
        if t2 == t:
            break
        t = t2
    # nomor halaman liar di awal seksi ("5555 PRINSIP ...")
    m = re.match(r"^(\d{4,})\s+", t)
    if m and not (1900 <= int(m.group(1)) <= 2100):
        t = t[m.end():]
    return re.sub(r"[ \t]{2,}", " ", t)

# ------------------------------------------------------- Diagram per seksi (v2.5)
# Diagram ilustrasi yang dipasang di bagian materi (field `gambar` di
# JSON, dirender SectionDetailPage di atas isi). Nilai berupa kunci
# gambar built-in (`gambar:<nama>`, lihat src/lib/materiGambar.ts) atau
# URL http(s). Hanya tiga titik paling berharga yang dipasangi diagram.
SECTION_GAMBAR = {
    # Sudut jarum jam: contoh pukul 02.20 di bagian ini.
    "tiu-modul-s32": "gambar:jam",
    # Pengertian pecahan: roti dibagi 3, tiap bagian 1/3.
    "tiu-modul-s23": "gambar:pecahan",
    # Teorema Pythagoras: tripel 3-4-5.
    "tiu-modul-s38": "gambar:pythagoras",
}

# Kunci gambar built-in yang dikenal app (harus sama dengan
# GAMBAR_BUILTIN di src/lib/materiGambar.ts).
GAMBAR_BUILTIN_KEYS = {"jam", "pecahan", "pythagoras"}

def filter_doc_sections(doc):
    """Terapkan kebijakan isi Belajar pada satu dokumen yang sudah dibangun.
    ID seksi dipertahankan (tidak dinomori ulang) supaya progres baca lama
    tetap cocok. Kembalikan (n_hapus, n_strip)."""
    doc_id = doc["id"]
    is_bang_arya = (doc_id == "twk-bang-arya")
    kept = []
    n_drop = n_strip = 0
    for sec in doc["sections"]:
        sid, judul = sec["id"], sec["judul"]
        # v2.5: poin inti menempel ke semua seksi (yang ditulis ulang maupun
        # yang bodinya dibiarkan). Diterapkan sebelum percabangan apa pun
        # supaya kedua jalur (kurasi dan biasa) sama-sama membawanya.
        if sid in POIN_INTI:
            sec["poin_inti"] = POIN_INTI[sid]
        # v2.5: diagram ilustrasi per seksi (field `gambar`).
        if sid in SECTION_GAMBAR:
            sec["gambar"] = SECTION_GAMBAR[sid]
        if sid in READABILITY_REWRITE:
            # v2.5: isi kurasi keterbacaan menggantikan hasil ekstraksi PDF
            # (tembok teks / artefak layout). Lewati strip/clean/drop:
            # konten kurasi sudah bersih dan bebas soal.
            sec["konten"] = READABILITY_REWRITE[sid]
            if sid in READABILITY_TITLES:
                sec["judul"] = READABILITY_TITLES[sid]
            sec.pop("catatan", None)
            sec["kata"] = len(sec["konten"].split())
            kept.append(sec)
            continue
        if is_bang_arya:
            if sid not in BANG_ARYA_SALVAGE:
                n_drop += 1
                continue
            sec["judul"] = BANG_ARYA_SALVAGE[sid]
            if sid in BANG_ARYA_REWRITE:
                # v2.3.3: isi kurasi menggantikan hasil ekstraksi mind-map
                # (kapital semua, kata kunci tidak berurutan). Lewati strip/
                # clean: konten kurasi sudah bersih dan bebas soal.
                sec["konten"] = BANG_ARYA_REWRITE[sid]
                sec.pop("catatan", None)
                sec["kata"] = len(sec["konten"].split())
                kept.append(sec)
                continue
        elif (doc_id, sid) in SECTION_DROP:
            n_drop += 1
            continue
        elif any(rx.search(judul) for rx in TITLE_DROP_RES):
            n_drop += 1
            continue
        new_konten, ndropped, _nzones = strip_question_zones(
            sec["konten"], lowercase_options=is_bang_arya)
        if is_bang_arya:
            new_konten = clean_bang_arya_content(new_konten)
        if ndropped:
            n_strip += 1
        sec["konten"] = new_konten
        sec["kata"] = len(new_konten.split())
        # sisa strip < 20 kata = fragmen, bukan materi: buang seksi utuh.
        # (Hanya untuk seksi yang di-strip: seksi kecil yang tidak di-strip,
        # mis. intro 19 kata "Ringkas 10: Pemahaman Bacaan", dipertahankan.)
        if ndropped and sec["kata"] < 20:
            n_drop += 1
            continue
        kept.append(sec)
    doc["sections"] = kept
    doc["kata"] = sum(s["kata"] for s in kept)
    if n_drop or n_strip:
        print(f"  filter {doc_id}: hapus {n_drop} seksi, strip {n_strip} seksi "
              f"-> {len(kept)} seksi, {doc['kata']} kata")
    return n_drop, n_strip

def verify_bang_arya_rewrite(docs):
    """Gagalkan build bila 6 seksi Rangkuman Tabel TWK tidak memakai isi kurasi
    (v2.3.3): ID seksi tetap, tanpa catatan mind-map, tanpa em-dash/URL/atribusi,
    tanpa lagi tembok huruf kapital."""
    for doc in docs:
        if doc["id"] != "twk-bang-arya":
            continue
        errors = []
        ids = {s["id"] for s in doc["sections"]}
        if ids != set(BANG_ARYA_SALVAGE):
            errors.append(f"ID seksi berubah: {sorted(ids)}")
        # akronim kapital yang sah di luar ACRONYMS (mnemonik + UUDS + KNIP)
        allowed_caps = set(ACRONYMS) | {"UUDS", "JUMAT", "BERSEPEDA", "KNIP"}
        for s in doc["sections"]:
            if "catatan" in s:
                errors.append(f"{s['id']}: masih punya catatan mind-map")
            if "mind map" in s["konten"].lower():
                errors.append(f"{s['id']}: masih mengandung 'mind map'")
            for rx in _BARU_FORBIDDEN_RES:
                m = rx.search(s["konten"])
                if m:
                    errors.append(f"{s['id']}.konten: cocok {rx.pattern!r} "
                                  f"({m.group(0)[:60]!r})")
            for w in re.findall(r"\b[A-Z]{4,}\b", s["konten"]):
                if w not in allowed_caps:
                    errors.append(f"{s['id']}: kata kapital semua {w!r}")
            if s["kata"] > 1500:
                errors.append(f"{s['id']}: {s['kata']} kata, melebihi batas 1500")
        if errors:
            raise SystemExit("verifikasi bang-arya GAGAL:\n  " + "\n  ".join(errors))
        print("  verifikasi bang-arya: OK (6 seksi kurasi, tanpa mind-map/em-dash)")
        return
    raise SystemExit("verifikasi bang-arya GAGAL: dokumen twk-bang-arya tidak ditemukan")

def verify_readability_rewrite(docs):
    """Gagalkan build bila seksi tulis-ulang kurasi keterbacaan (v2.5) tidak
    memakai isi kurasi: ID tetap, tanpa em-dash/URL/atribusi, tanpa baris
    tembok (>600 karakter), tanpa artefak layout yang umum."""
    by_id = {}
    for doc in docs:
        for s in doc["sections"]:
            by_id[s["id"]] = s
    errors = []
    for sid, konten in READABILITY_REWRITE.items():
        s = by_id.get(sid)
        if s is None:
            errors.append(f"{sid}: seksi tidak ditemukan setelah filter")
            continue
        if s["konten"] != konten:
            errors.append(f"{sid}: konten tidak sama dengan isi kurasi")
        if sid in READABILITY_TITLES and s["judul"] != READABILITY_TITLES[sid]:
            errors.append(f"{sid}: judul tidak sama dengan judul kurasi")
        for rx in _BARU_FORBIDDEN_RES:
            m = rx.search(konten)
            if m:
                errors.append(f"{sid}.konten: cocok {rx.pattern!r} "
                              f"({m.group(0)[:60]!r})")
        maxline = max((len(line) for line in konten.split("\n")), default=0)
        if maxline > 600:
            errors.append(f"{sid}: baris terpanjang {maxline} karakter, "
                          "melebihi 600")
        n_kata = len(konten.split())
        if n_kata > 1500:
            errors.append(f"{sid}: {n_kata} kata, melebihi batas 1500")
        for art in ("CON TO H", "\u3259", "\u325a", "\u325b"):
            if art in konten:
                errors.append(f"{sid}: masih mengandung artefak {art!r}")
    if errors:
        raise SystemExit("verifikasi readability GAGAL:\n  " + "\n  ".join(errors))
    print(f"  verifikasi readability: OK ({len(READABILITY_REWRITE)} seksi "
          "kurasi, tanpa tembok/em-dash)")

def verify_poin_inti(docs):
    """Gagalkan build bila ada seksi tanpa poin inti (v2.5): setiap seksi
    wajib punya 3-5 butir, tiap butir satu kalimat pendek tanpa pola
    terlarang (em-dash/URL/atribusi/frasa soal)."""
    errors = []
    n = 0
    for doc in docs:
        for s in doc["sections"]:
            n += 1
            poin = s.get("poin_inti")
            if poin is None:
                errors.append(f"{s['id']}: tanpa poin_inti")
                continue
            if not isinstance(poin, list) or not 3 <= len(poin) <= 5:
                errors.append(f"{s['id']}: poin_inti harus list 3-5 butir, "
                              f"dapat {poin!r}"[:120])
                continue
            for b in poin:
                if not isinstance(b, str) or not b.strip():
                    errors.append(f"{s['id']}: butir poin inti kosong")
                elif len(b) > 200:
                    errors.append(f"{s['id']}: butir {len(b)} karakter, "
                                  "melebihi 200")
                else:
                    for rx in _BARU_FORBIDDEN_RES:
                        m = rx.search(b)
                        if m:
                            errors.append(f"{s['id']}.poin_inti: cocok "
                                          f"{rx.pattern!r} ({m.group(0)[:60]!r})")
    if errors:
        raise SystemExit("verifikasi poin-inti GAGAL:\n  " + "\n  ".join(errors))
    print(f"  verifikasi poin-inti: OK ({n} seksi, semua punya 3-5 butir)")

def verify_gambar(docs):
    """Gagalkan build bila diagram per seksi tidak terpasang dengan benar
    (v2.5): setiap id di SECTION_GAMBAR harus ada sebagai seksi dan
    membawa field `gambar` yang sama; nilai `gambar:` harus memakai kunci
    built-in yang dikenal app, URL http(s) dipakai apa adanya."""
    by_id = {}
    for doc in docs:
        for s in doc["sections"]:
            by_id[s["id"]] = s
    errors = []
    for sid, gambar in SECTION_GAMBAR.items():
        s = by_id.get(sid)
        if s is None:
            errors.append(f"{sid}: seksi tidak ditemukan")
            continue
        if s.get("gambar") != gambar:
            errors.append(f"{sid}: gambar {s.get('gambar')!r}, harap {gambar!r}")
        if gambar.startswith("gambar:"):
            key = gambar[len("gambar:"):]
            if key not in GAMBAR_BUILTIN_KEYS:
                errors.append(f"{sid}: kunci gambar built-in tidak dikenal: {key!r}")
        elif not gambar.startswith(("http://", "https://")):
            errors.append(f"{sid}: gambar bukan kunci built-in maupun URL: {gambar!r}")
    # Sintaks gambar inline di konten kurasi juga harus memakai kunci
    # built-in yang dikenal (URL dilarang di konten kurasi).
    for sid, konten in list(READABILITY_REWRITE.items()) + list(BANG_ARYA_REWRITE.items()):
        for m in re.finditer(r"!\[[^\]]*\]\(([^)\s]+)\)", konten):
            src = m.group(1)
            if src.startswith("gambar:"):
                if src[len("gambar:"):] not in GAMBAR_BUILTIN_KEYS:
                    errors.append(f"{sid}: kunci gambar inline tidak dikenal: {src!r}")
            else:
                errors.append(f"{sid}: gambar inline bukan kunci built-in: {src!r}")
    if errors:
        raise SystemExit("verifikasi gambar GAGAL:\n  " + "\n  ".join(errors))
    print(f"  verifikasi gambar: OK ({len(SECTION_GAMBAR)} seksi bergambar)")

# ---------------------------------------------------------------- main
def main():
    import shutil
    shutil.copy(os.path.join(SRC, "inventaris-materi.json"),
                os.path.join(OUT, "inventaris.json"))
    print("inventaris.json disalin")

    docs = []
    for cfg in DOCS:
        doc = process_generic(cfg)
        docs.append(doc)
        print(f"{doc['id']}: {len(doc['sections'])} sections, {doc['kata']} kata")
    for fn in (process_bang_arya, process_tabel_pangkat, process_kartu_sakti):
        doc = fn()
        docs.append(doc)
        print(f"{doc['id']}: {len(doc['sections'])} sections, {doc['kata']} kata")
    for hb_id in HANDBOOKS:
        doc = process_handbook(hb_id)
        docs.append(doc)
        print(f"{doc['id']}: {len(doc['sections'])} sections, {doc['kata']} kata")

    # materi baru (riset 2026-11-15): 3 dokumen baru + 1 seksi TIU
    # + 3 seksi bela negara (v2.6)
    for doc in process_baru_docs():
        docs.append(doc)
        print(f"{doc['id']}: {len(doc['sections'])} sections, {doc['kata']} kata (baru)")
    append_baru_tiu(docs)
    append_baru_bela_negara(docs)

    # filter isi: buang seksi soal/pengantar/duplikat, strip zona soal dari
    # seksi campuran (audit 2026-11-15). Berjalan setelah semua ID ditetapkan.
    for doc in docs:
        filter_doc_sections(doc)

    # verifikasi konten baru (setelah filter, sebelum tulis)
    verify_baru_content(docs)

    # verifikasi tulis-ulang kurasi Bang Arya (v2.3.3)
    verify_bang_arya_rewrite(docs)

    # verifikasi tulis-ulang kurasi keterbacaan (v2.5)
    verify_readability_rewrite(docs)

    # verifikasi poin inti: setiap seksi wajib punya 3-5 butir (v2.5)
    verify_poin_inti(docs)

    # verifikasi diagram per seksi (v2.5)
    verify_gambar(docs)

    order = ["TWK", "TIU", "TKP"]
    docs.sort(key=lambda d: (order.index(d["materi"]), d["id"]))
    for doc in docs:
        path = os.path.join(OUT, doc["id"] + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        print("tulis", path, os.path.getsize(path), "bytes")

    index = {
        "dibuat": "2026-11-15",
        "total_dokumen": len(docs),
        "total_kata": sum(d["kata"] for d in docs),
        "total_halaman": sum(d["halaman"] for d in docs),
        "dokumen": [
            {"id": d["id"], "file": d["id"] + ".json", "judul": d["judul"],
             "materi": d["materi"], "deskripsi": d["deskripsi"],
             "halaman": d["halaman"], "kata": d["kata"],
             "subtopik": d["subtopik"], "jumlahSections": len(d["sections"])}
            for d in docs
        ],
        "dikecualikan_dari_mvp": [
            {"judul": "Materi Pokok SKB dengan CAT Pengadaan CPNS TA 2024",
             "materi": "SKB", "alasan": "SKB ditunda ke fase akhir pengembangan aplikasi."},
            {"judul": "KepmenPANRB 406/2026 | Nilai Ambang Batas SKD",
             "materi": "Referensi", "alasan": "Dokumen referensi passing grade, bukan materi belajar per subtopik."},
            {"judul": "Buku Panduan Peserta CPNS 2026 | JadiASN",
             "materi": "Panduan", "alasan": "Panduan proses seleksi, bukan materi SKD per subtopik."},
            {"judul": "Buku Petunjuk Pendaftaran CASN 2024 | BKN",
             "materi": "Panduan", "alasan": "Panduan pendaftaran SSCASN, bukan materi SKD per subtopik."},
        ],
    }
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"TOTAL: {len(docs)} dokumen, {index['total_kata']} kata, {index['total_halaman']} halaman")

if __name__ == "__main__":
    main()
