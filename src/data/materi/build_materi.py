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
OUT = os.path.expanduser("~/workspace/lolosin/src/data/materi")
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
         deskripsi="Infografis pembeda empat konsep yang sering tertukar: bela negara, nasionalisme, patriotisme, dan cinta tanah air.",
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
        lv = "\n".join(f"- Level {n}: {e['level'][n]}" for n in sorted(e["level"]) if e["level"][n])
        parts.append(lv)
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
               catatan_kualitas="PDF berteks, kualitas ekstraksi baik. Hanya 6 rangkuman yang dipertahankan; soal latihan dan pembahasan dikeluarkan dari Belajar. Isi 6 seksi dikurasi tulis-ulang terstruktur (v2.3.3) karena ekstraksi mind-map/tabel aslinya tidak berurutan.")
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
    """Baris tabel markdown (| A | B |) -> daftar bullet '- **A**: B'.
    Baris header + pemisah (|---|---|) dibuang; tiap baris data jadi satu
    bullet. Renderer app (MarkdownLite) tidak mendukung tabel, jadi tabel
    satu-satunya (dasar hukum di tkp-integritas.md) dikonversi begini."""
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
    + paragraf Catatan), garis '---'. Tabel markdown dikonversi ke bullet,
    quote konten ('> ...' sesudah konten dimulai) dibuka jadi paragraf
    biasa. Em-dash dibersihkan via clean_materi_text."""
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
        # tabel markdown: kumpulkan blok baris '|' berurutan, konversi
        if stripped.startswith("|"):
            block = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                block.append(lines[i].strip())
                i += 1
            out.extend(_convert_table_block(block))
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
    """Dua dokumen baru dari riset 2026-11-15 (TKP 12 aspek + TWK 2 subtopik).
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
        "deskripsi": "Pendalaman dua subtopik TWK: sembilan nilai integritas versi KPK, korupsi dan gratifikasi, serta Empat Pilar MPR RI sebagai satu kesatuan.",
        "sumber": "baru/twk-integritas.md + baru/twk-pilar-negara.md (riset free-access, 2026-11-15)",
        "halaman": 0,  # riset web, tanpa halaman sumber (lihat SCHEMA.md)
        "kata": sum(s["kata"] for s in twk_sections),
        "subtopik": [row[2] for row in BARU_TWK],
        "sections": twk_sections,
        "catatan_kualitas": "Materi disusun dari sumber free-access (artikel web dan situs resmi KPK/MPR) pada 2026-11-15 untuk menutup gap audit isi materi; sumber tiap subtopik tercatat di file .md internal.",
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

def verify_baru_content(docs):
    """Gagalkan build bila konten baru mengandung atribusi/URL/em-dash/soal.
    Hanya memeriksa dokumen/seksi baru (tkp-karakter-perilaku,
    twk-integritas-pilar, tiu-analogi-verbal-s04)."""
    baru_ids = {"tkp-karakter-perilaku", "twk-integritas-pilar"}
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

1. **Ketuhanan Yang Maha Esa**: Nilai ketuhanan. Saling toleransi dan menghormati keyakinan, ketuhanan, dan peribadahan orang lain.
2. **Kemanusiaan yang adil dan beradab**: Nilai kemanusiaan. Manusia diperlakukan sesuai harkat dan martabatnya, tanpa diskriminasi dan tanpa menghina fisik.
3. **Persatuan Indonesia**: Nilai persatuan. Keragaman bangsa dan negara justru menyatukan, bukan memecah belah.
4. **Kerakyatan yang dipimpin oleh hikmat kebijaksanaan dalam permusyawaratan/perwakilan**: Nilai musyawarah mufakat. Tidak boleh memaksakan kehendak, dan keputusan bersama harus dihormati.
5. **Keadilan sosial bagi seluruh rakyat Indonesia**: Nilai keadilan. Hak pribadi ada batasnya: tidak boleh merugikan orang lain.''',

    "twk-bang-arya-s08": '''## UUD 1945 (18 Agustus 1945 - 27 Desember 1949)

- UUD 1945 disahkan **PPKI** pada 18 Agustus 1945, sehari setelah proklamasi.
- MPR dan DPR belum terbentuk, jadi kekuasaan legislatif diserahkan kepada **KNIP** (Komite Nasional Indonesia Pusat).
- 14 November 1945: sistem pemerintahan berubah menjadi **parlementer**. Kabinet bertanggung jawab kepada KNIP, bukan lagi hanya kepada presiden.

## Konstitusi RIS 1949 (27 Desember 1949 - 17 Agustus 1950)

- Sistem pemerintahan **parlementer**.
- Bentuk negara **federasi**: Republik Indonesia Serikat (RIS), yang terdiri dari negara-negara bagian.

## UUDS 1950 (17 Agustus 1950 - 5 Juli 1959)

- Berlaku sistem **Demokrasi Parlementer**, yang sering disebut **Demokrasi Liberal**.
- Ciri khas periode ini: kabinet **silih berganti** karena sering jatuh lewat mosi tidak percaya.

## Kembali ke UUD 1945 (5 Juli 1959 - 11 Maret 1966)

- 5 Juli 1959: Presiden Soekarno mengeluarkan **Dekret Presiden** yang memberlakukan kembali UUD 1945 dan membubarkan Konstituante.
- UUDS 1950 tidak berlaku lagi.

## UUD 1945 masa Orde Baru (11 Maret 1966 - 21 Mei 1998)

- Periode ini dimulai dengan Surat Perintah 11 Maret (**Supersemar**) 1966.
- Pemerintah menyatakan akan melaksanakan UUD 1945 dan Pancasila secara **murni dan konsekuen**.
- Dalam praktiknya, kekuasaan presiden sangat besar dan MPR memegang **kekuasaan tertinggi**.

## Masa transisi (21 Mei 1998 - 19 Oktober 1999)

- Presiden Soeharto digantikan oleh **B.J. Habibie**.
- Periode ini berakhir setelah **Timor Timur** lepas dari NKRI.

## Periode perubahan UUD 1945 (1999 - 2002)

- Tuntutan perubahan muncul karena pasal-pasal UUD 1945 dinilai terlalu **luwes**, sehingga memberi ruang kekuasaan yang sangat besar kepada presiden.
- UUD 1945 **diamandemen empat kali**: 1999, 2000, 2001, dan 2002. Yang diubah hanya batang tubuhnya; Pembukaan UUD 1945 tidak boleh diubah.''',

    "twk-bang-arya-s17": '''KPK merumuskan sembilan nilai integritas sebagai tameng dari perilaku koruptif. Gampang diingat lewat akronim **JUMAT BERSEPEDA KK**: Jujur, Mandiri, Tanggung jawab, Berani, Sederhana, Peduli, Disiplin, Adil, Kerja Keras.

## Nilai inti

- **Jujur**: Lurus hati, tidak berbohong dan tidak curang. Laporan ditulis sesuai kenyataan, kesalahan diakui, bukan ditutupi.
- **Disiplin**: Melakukan yang seharusnya pada waktu yang tepat, dan taat pada peraturan yang berlaku.
- **Tanggung jawab**: Siap menanggung akibat perbuatannya, menuntaskan kewajiban, dan memperbaiki kesalahan.

## Nilai sikap

- **Berani**: Berani berkata benar dan menolak yang salah, tidak gentar menghadapi ancaman atau bahaya. Misalnya berani menolak suap.
- **Adil**: Memperlakukan semua pihak secara setara, bertindak sesuai kewenangan, dan tidak sewenang-wenang.
- **Peduli**: Memperhatikan orang lain dan lingkungan sekitar, termasuk berani menegur atau melaporkan penyimpangan.

## Nilai etos kerja

- **Mandiri**: Berusaha dengan kemampuan sendiri, tidak bergantung pada bantuan yang tidak semestinya dan tidak memakai "orang dalam".
- **Kerja keras**: Gigih dan fokus sampai tujuan tercapai, tidak asal-asalan.
- **Sederhana**: Hidup sesuai kebutuhan, bersahaja, dan tidak berlebih-lebihan.''',

    "twk-bang-arya-s25": '''## Huruf kapital di awal

- **Awal kalimat.** Contoh: `Kita harus belajar.`
- **Awal petikan langsung.** Contoh: Kakak bertanya, “Jam berapa acaranya?”
- **Kata sapaan.** Contoh: `Besok Adik akan pulang.` dan `Siapa nama Anda?`

## Kapital kalau diikuti nama

- **Nama orang.** Contoh: Adam Malik.
- **Gelar yang diikuti nama orang.** Contoh: Tuanku Imam Bonjol, Imam Syafi’i.
- **Nama jabatan yang diikuti nama orang, instansi, atau tempat.** Contoh: Presiden Republik Indonesia, Sultan Hamengkubuwono X.
- **Nama negara atau instansi.** Contoh: Republik Indonesia, Kementerian Luar Negeri.
- **Nama peristiwa sejarah.** Contoh: Perang Dingin, Perang Dunia II.
- **Nama diri geografi.** Contoh: Asia Tenggara, Amerika Utara, Danau Singkarak, Sungai Citarum.
- **Nama bangsa, suku, dan bahasa.** Kata awalnya huruf kecil, namanya kapital. Contoh: bangsa Indonesia, suku Indian, bahasa Inggris.
- **Nama tahun, bulan, hari, dan hari raya.** Kata awalnya huruf kecil, namanya kapital. Contoh: tahun Hijriah, hari Selasa, bulan Juli, hari raya Idul Fitri.
- **Gambaran khas daerah atau suku.** Contoh: ukiran Jepara, tari Melayu.

## Tidak kapital

- **Jabatan tanpa nama orang.** Contoh: `Beliau baru saja diangkat menjadi gubernur.`
- **Peristiwa tanpa nama.** Contoh: `Nuklir dapat menyebabkan terjadinya perang dunia.`
- **Nama geografi tanpa nama diri.** Contoh: `berenang di laut`, `menyeberangi sungai`.''',

    "twk-bang-arya-s32": '''## Lima prinsip nasionalisme

- **Kesatuan**: Satu dalam wilayah, bangsa, bahasa, ideologi, dan sistem politik.
- **Kebebasan**: Bebas beragama, berbicara, berpendapat, berkelompok, dan berorganisasi.
- **Kesamaan**: Sama dalam kedudukan hukum, hak, dan kewajiban.
- **Kepribadian**: Punya harga diri, rasa bangga, dan rasa sayang terhadap kepribadian dan identitas bangsa.
- **Prestasi**: Bercita-cita mewujudkan kesejahteraan, kebesaran, dan kemanusiaan bangsanya.

## Istilah yang sering tertukar

- **Nasionalisme**: Paham yang menempatkan kesetiaan tertinggi kepada bangsa dan negara, diwujudkan lewat sikap dan tindakan untuk identitas negara.
- **Patriotisme**: Sikap rela mengorbankan segalanya demi negara dan bangsa.
- **Cinta tanah air**: Cara berpikir dan berbuat yang menunjukkan cinta terhadap tanah air.
- **Bela negara**: Sikap dan tindakan setiap warga sesuai kewajibannya untuk mendukung tujuan negara.

## Bhinneka Tunggal Ika

Bhinneka Tunggal Ika berarti berbeda-beda tetapi tetap satu. Keberagaman tidak membuat bangsa pecah: carilah persamaan di tengah perbedaan supaya tercipta kedamaian.

Prinsipnya adalah *common denominator*: menerima dan terbuka terhadap perbedaan.''',

    "twk-bang-arya-s37": '''## Pasal 1 ayat 1: bentuk negara

"Negara Indonesia ialah Negara Kesatuan, yang berbentuk Republik."

Artinya bentuk negara Indonesia adalah **kesatuan**, sedangkan bentuk pemerintahannya adalah **republik**. Kekuasaan tertinggi ada di pemerintah pusat, dan kepala negara adalah presiden yang dipilih.

## Pasal 18 ayat 1: wilayah NKRI

NKRI dibagi atas **daerah provinsi**, dan provinsi dibagi atas **kabupaten dan kota**. Masing-masing punya pemerintahan daerah sendiri.

## Pasal 37 ayat 5: NKRI tidak bisa diubah

Khusus mengenai bentuk Negara Kesatuan Republik Indonesia, **tidak dapat dilakukan perubahan**. Inilah yang membuat NKRI disebut final dan harga mati.

## Alinea keempat Pembukaan UUD 1945

Alinea keempat memuat dasar negara **Pancasila** dan menyatakan bahwa negara Indonesia disusun sebagai Negara Republik Indonesia yang **berkedaulatan rakyat**. Di sinilah ditegaskan bahwa bangsa Indonesia hidup, tumbuh, dan berkembang dalam satu wilayah kesatuan yang saling terintegrasi.

## Pasal 31 ayat 1: hak atas pendidikan

"Setiap warga negara berhak mendapat pendidikan."''',
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

    # materi baru (riset 2026-11-15): 2 dokumen baru + 1 seksi TIU
    for doc in process_baru_docs():
        docs.append(doc)
        print(f"{doc['id']}: {len(doc['sections'])} sections, {doc['kata']} kata (baru)")
    append_baru_tiu(docs)

    # filter isi: buang seksi soal/pengantar/duplikat, strip zona soal dari
    # seksi campuran (audit 2026-11-15). Berjalan setelah semua ID ditetapkan.
    for doc in docs:
        filter_doc_sections(doc)

    # verifikasi konten baru (setelah filter, sebelum tulis)
    verify_baru_content(docs)

    # verifikasi tulis-ulang kurasi Bang Arya (v2.3.3)
    verify_bang_arya_rewrite(docs)

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
