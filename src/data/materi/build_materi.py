#!/usr/bin/env python3
"""Build konten materi belajar Lolosin dari sumber di ~/workspace/cpns/materi/.

Output: ~/workspace/lolosin/src/data/materi/*.json (+ index.json).
Hanya membersihkan + menstrukturkan teks sumber; TIDAK menulis ulang isi materi.
Jalankan dengan: ~/workspace/venv-whisper/bin/python /tmp/build_materi.py
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
    ln = re.sub(r"\s+", " ", ln).strip(" -–—")
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
    # bernomor "1. Judul ..." (tanpa titik akhir) — hanya sumber PDF yang rapi;
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
        tail = m.group(2).strip().rstrip("/-–— ").strip()
        if not re.search(r"[A-Z]", tail):
            return m.group(1)
        nonalnum = sum(1 for c in tail if not c.isalnum() and c != " ")
        if "»" in tail or "«" in tail or (tail and nonalnum / len(tail) > 0.4):
            return m.group(1)
        return m.group(1) + ": " + tail
    if re.match(r"^(BAB|BAGIAN)\s+[IVXL0-9]+\s*[-–—]?\s*$", t):
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
                cur_title = cur_title + " — " + clean_heading_text(b["text"])
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
         deskripsi="Ringkasan materi TIU: penalaran verbal, analitis, logis, silogisme, aritmetika, deret angka, dan hitung cepat, lengkap dengan contoh soal dan pembahasan.",
         subtopik=["Penalaran verbal: sinonim, antonim, analogi","Penalaran analitis","Penalaran logis",
                   "Silogisme","Aritmetika dan aljabar","Deret angka","Kecepatan berhitung",
                   "Pecahan dan perbandingan"],
         catatan_kualitas="Hasil OCR modul scan; rumus dan notasi matematika kadang kacau (perlu cek manual). Mengandung ~40 contoh soal dengan jawaban + pembahasan. Tidak mencakup materi figural/gambar."),
    dict(id="tiu-analogi-verbal", judul="Materi Analogi Verbal TIU — TemanASN",
         materi="TIU", kind="pdf", file="skd_cpns_2/skd cpns 2/tiu-analogi-verbal.pdf", halaman=4,
         deskripsi="Materi analogi verbal: definisi, bentuk-bentuk soal, dan contoh analogi beserta pembahasan.",
         subtopik=["Definisi analogi verbal","Bentuk-bentuk soal analogi (dua kata, kalimat)",
                   "Contoh analogi profesi dan tempat kerja"],
         catatan_kualitas="PDF berteks, ekstraksi baik. ~10 contoh soal analogi dengan jawaban di dalam materi."),
    dict(id="tiu-hitung-cepat", judul="Hitung Cepat — TemanASN",
         materi="TIU", kind="pdf", file="skd_cpns_2/skd cpns 2/tiu-hitung-cepat.pdf", halaman=10,
         deskripsi="Teknik hitung cepat: jenis dan sifat bilangan (ABCSIROPP), pecahan, dan trik berhitung.",
         subtopik=["Jenis bilangan (ABCSIROPP)","Sifat-sifat bilangan","Pecahan","Teknik hitung cepat"],
         catatan_kualitas="PDF berteks, ekstraksi cukup baik meski ada kata yang menempel tanpa spasi di beberapa bagian (artefak layout). 6 blok 'Contoh Soal'."),
    dict(id="tkp-modul", judul="Ringkasan Materi TKP CPNS (Modul TKP)",
         materi="TKP", kind="ocr", file="ocr/Mod-MATERI-TKP-CPNS.txt", halaman=60,
         deskripsi="Ringkasan materi TKP per aspek: integritas, adaptasi, pengendalian diri, semangat berprestasi, pelayanan, dan lainnya, dengan contoh soal situasional dan skor.",
         subtopik=["Integritas","Kejujuran","Kemampuan beradaptasi","Pengendalian diri",
                   "Semangat berprestasi","Inisiatif","Kreativitas dan inovasi","Ketekunan",
                   "Orientasi pelayanan","Toleransi","Kepedulian lingkungan","Efisiensi kerja"],
         catatan_kualitas="Hasil OCR modul scan; tata letak dua kolom kadang mengacaukan urutan baca. Mengandung ~40 contoh soal situasional TKP dengan jawaban + pembahasan dan skor."),
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
        judul="Handbook TIU SKD CPNS Seri 1 — Kemampuan Verbal",
        file="bahan_belajar/1. Bahan Belajar/Handbook_TIU_SKD_CPNS_Seri1_Kemampuan_Verbal_Landscape-1-1.pdf",
        halaman=46,
        deskripsi="Handbook kemampuan verbal: analogi, silogisme, penalaran analitis, teknik eliminasi, error pattern, dan mini drill.",
        subtopik=["Analogi","Silogisme","Penalaran analitis","Teknik eliminasi","Error pattern",
                  "Sistem cepat verbal","Mini drill"],
        catatan_kualitas="PDF berteks landscape, ekstraksi baik. 11 soal berlabel (6 contoh + 5 mini drill) dengan jawaban + pembahasan.",
        pengantar="Catatan Acuan Seleksi", penutup="Ringkasan Akhir",
        bagian={"I": "Peta Besar TIU Verbal", "II": "Analogi", "III": "Silogisme",
                "IV": "Penalaran Analitis", "V": "Teknik Eliminasi",
                "VI": "Error Pattern yang Harus Dihindari", "VII": "Sistem Cepat Verbal",
                "VIII": "Mini Drill", "IX": "Checklist Sebelum Memilih Jawaban",
                "X": "Cheat Sheet TIU Verbal", "XI": "Pola Penguasaan Materi"}),
    "tiu-handbook-numerik": dict(
        judul="Handbook TIU SKD CPNS Seri 2 — Kemampuan Numerik",
        file="bahan_belajar/1. Bahan Belajar/Handbook_TIU_SKD_CPNS_Seri2_Kemampuan_Numerik_Landscape-1-1.pdf",
        halaman=44,
        deskripsi="Handbook kemampuan numerik: berhitung, deret angka, perbandingan kuantitatif, soal cerita, hitung cepat, dan mini drill.",
        subtopik=["Berhitung","Deret angka","Perbandingan kuantitatif","Soal cerita","Hitung cepat",
                  "Jebakan TIU numerik","Mini drill"],
        catatan_kualitas="PDF berteks landscape, ekstraksi baik. 8 soal Mini Drill dengan jawaban + pembahasan, plus contoh-contoh dalam materi.",
        pengantar="Catatan Acuan", penutup="Ringkasan Akhir",
        bagian={"I": "Peta Besar TIU Numerik", "II": "Berhitung", "III": "Deret Angka",
                "IV": "Perbandingan Kuantitatif", "V": "Soal Cerita", "VI": "Hitung Cepat",
                "VII": "Jebakan TIU Numerik", "VIII": "Mini Drill", "IX": "Cheat Sheet",
                "X": "Materi Pengayaan", "XI": "Prioritas Belajar"}),
    "tiu-handbook-figural": dict(
        judul="Handbook TIU SKD CPNS Seri 3 — Kemampuan Figural",
        file="bahan_belajar/1. Bahan Belajar/Handbook_TIU_SKD_CPNS_Seri3_Kemampuan_Figural_Landscape-1-1.pdf",
        halaman=57,
        deskripsi="Handbook kemampuan figural: analogi gambar, ketidaksamaan, serial gambar, dan strategi mengerjakan soal gambar.",
        subtopik=["Analogi gambar","Ketidaksamaan","Serial gambar","Strategi mengerjakan figural",
                  "Jebakan figural","Formula pemeriksaan cepat","Mini latihan konseptual"],
        catatan_kualitas="PDF berteks landscape, ekstraksi baik. Materi figural sangat bergantung pada gambar sehingga teks saja tidak cukup — perlu cek visual/gambar saat dipakai sebagai konten belajar.",
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
            judul = f"Bagian {lb[1]} — {cfg['bagian'][lb[1]]}"
            sub = match_subtopik(cfg["bagian"][lb[1]], cfg["subtopik"], cfg["subtopik"][0])
            catatan = None
        elif lb[0] == "pengantar":
            judul = f"Pengantar — {cfg['pengantar']}"
            sub = cfg["subtopik"][0]
            catatan = None
        elif lb[0] == "penutup":
            judul = f"Penutup — {cfg['penutup']}"
            sub = cfg["subtopik"][0]
            catatan = None
        else:  # lampiran
            judul = ("Lampiran — Kunci Jawaban dan Pembahasan" if lb[1] == "kunci"
                     else "Lampiran — Latihan Soal Bergambar")
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
    cfg = dict(id="tkp-kartu-sakti", judul="Kartu Sakti TKP — Master", materi="TKP",
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
        judul = f"{e['aspek']} — {e['kompetensi']}" + (f" ({e['kode']})" if e["kode"] else "")
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
    cfg = dict(id="twk-bang-arya", judul="Mastery TWK 2024 — Kang Arya (TWK Bang Arya)",
               materi="TWK",
               deskripsi="Buku soal TWK + pembahasan per topik: Pancasila, Bela Negara, Integritas, Bahasa Indonesia, Nasionalisme & Bhinneka Tunggal Ika, dan Pilar Negara (~300 soal).",
               sumber="skd_cpns_2/skd cpns 2/TWK BANG ARYA.pdf", halaman=121,
               subtopik=["Pancasila","Bela Negara","Pilar Negara","Integritas",
                         "Nasionalisme dan Bhinneka Tunggal Ika","Bahasa Indonesia"],
               catatan_kualitas="PDF berteks, kualitas ekstraksi baik. Buku soal + pembahasan: 6 topik x ~50 soal. Sebagian soal memakai pola opsi berulang (opsi A-D sama di banyak soal Pancasila) — perlu kurasi sebelum dipakai ulang. Buku dinyatakan bebas dibagikan, tidak untuk diperjualbelikan.")
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
    # Hitung ulang secara programatis — digit OCR TIDAK dipercaya.
    t2 = [[n, n ** 2] for n in range(1, 101)]
    t3 = [[n, n ** 3] for n in range(1, 101)]
    t4 = [[n, n ** 4] for n in range(1, 101)]
    # spot check terhadap nilai yang terbaca benar di OCR / matematika dasar
    assert t2[50] == [51, 2601] and t2[75] == [76, 5776] and t2[99] == [100, 10000]
    assert t3[0] == [1, 1] and t3[9] == [10, 1000] and t3[99] == [100, 1000000]
    assert t4[0] == [1, 1] and t4[1] == [2, 16] and t4[99] == [100, 100000000]

    # Soal latihan volume dari halaman 3 OCR tabel-pangkat-2-3.txt
    pages = extract_ocr_pages(os.path.join(SRC, "ocr/tabel-pangkat-2-3.txt"))
    soal_lines = []
    for ln in pages[2].splitlines():
        ln = clean_line(ln)
        if not ln or ln in ("rb", "OLANYU NW"):  # artefak OCR, bukan isi soal
            continue
        soal_lines.append(ln)
    soal_text = " ".join(soal_lines)
    # pisah per soal: soal 1 & 10 bernomor di OCR; sisanya dipisah manual per kalimat soal
    items = [
        "Tentukan volume sebuah kubus yang memiliki rusuknya 6 m!",
        "Tangki air berbentuk balok memiliki panjang 3 m, lebar 80 cm, dan tingginya 60 cm. Tentukan volume tangki dalam satuan liter!",
        "Tentukan volume tabung dengan diameter 14 cm dan tinggi 21 cm!",
        "Tentukan volume kerucut yang berjari-jari 18 cm dan tinggi 10 cm!",
        "Tentukan volume prisma segitiga sisi dengan panjang sisi alas 10 cm dan tingginya 15 cm!",
        "Tentukan volume limas persegi dengan panjang sisi alas 10 cm dan tingginya 12 cm!",
        "Tentukan volume bola yang berdiameter 40 cm! Jari-jari = 20 cm",
        "Tentukan volume kerucut terpancung jika diameter alasnya 10 dm, diameter atas 4 dm, dan tinggi 4 dm!",
        "Tentukan volume bola terpancung jika jari-jari alas 10 dm, jari-jari atas 7 dm dan tinggi 14 dm!",
        "Berapa volume pipa berongga dengan diameter masing-masing 10 mm dan 18 mm serta tinggi 3.5 cm! (dalam mm persegi)",
    ]
    # verifikasi tiap soal memang ada di teks OCR (pencocokan longgar, tanpa angka)
    for it in items:
        key = re.sub(r"[^a-z ]", "", it.lower().split("!")[0].split(".")[0])[:30]
        assert key[:18] in re.sub(r"[^a-z ]", "", soal_text.lower()), f"soal tidak cocok OCR: {it[:40]}"
    soal_md = "\n".join(f"{i + 1}. {it}" for i, it in enumerate(items))

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
        {"id": "tiu-tabel-pangkat-s05", "subtopik": "Volume bangun ruang (soal latihan)",
         "judul": "Latihan: Volume Bangun Ruang",
         "konten": ("10 soal latihan volume bangun ruang dari halaman 3 dokumen tabel pangkat "
                    "(tanpa kunci jawaban di sumber).\n\n" + soal_md),
         "kata": 0},
    ]
    for s in sections:
        s["kata"] = len(s["konten"].split())
    doc = {
        "id": "tiu-tabel-pangkat",
        "judul": "Tabel Bilangan Pangkat 2, 3, dan 4 (1–100)",
        "materi": "TIU",
        "deskripsi": "Tabel pangkat 2, 3, dan 4 untuk bilangan 1–100 (dihitung ulang secara programatis, bukan dari OCR) plus 10 soal latihan volume bangun ruang.",
        "sumber": ("ocr/tabel-pangkat-2-3.txt (pangkat 2–3 + soal volume) + "
                   "skd_cpns_2/skd cpns 2/tabel-bilangan-pangkat-4-dari-1_compress.pdf (pangkat 4); "
                   "semua angka dihitung ulang, digit OCR tidak dipakai"),
        "halaman": 5,
        "kata": sum(s["kata"] for s in sections),
        "subtopik": ["Tabel pangkat 2 (1–100)", "Tabel pangkat 3 (1–100)",
                     "Tabel pangkat 4 (1–100)", "Volume bangun ruang (soal latihan)"],
        "sections": sections,
        "tabel": {"pangkat2": t2, "pangkat3": t3, "pangkat4": t4},
        "catatan_kualitas": "Digit tabel hasil OCR ada yang salah baca (mis. '51? 2.601', '61? SIA'), sehingga seluruh angka dihitung ulang secara programatis dan diverifikasi dengan spot check.",
    }
    return doc

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

    order = ["TWK", "TIU", "TKP"]
    docs.sort(key=lambda d: (order.index(d["materi"]), d["id"]))
    for doc in docs:
        path = os.path.join(OUT, doc["id"] + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
        print("tulis", path, os.path.getsize(path), "bytes")

    index = {
        "dibuat": "2026-11-13",
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
            {"judul": "KepmenPANRB 406/2026 — Nilai Ambang Batas SKD",
             "materi": "Referensi", "alasan": "Dokumen referensi passing grade, bukan materi belajar per subtopik."},
            {"judul": "Buku Panduan Peserta CPNS 2026 — JadiASN",
             "materi": "Panduan", "alasan": "Panduan proses seleksi, bukan materi SKD per subtopik."},
            {"judul": "Buku Petunjuk Pendaftaran CASN 2024 — BKN",
             "materi": "Panduan", "alasan": "Panduan pendaftaran SSCASN, bukan materi SKD per subtopik."},
        ],
    }
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"TOTAL: {len(docs)} dokumen, {index['total_kata']} kata, {index['total_halaman']} halaman")

if __name__ == "__main__":
    main()
