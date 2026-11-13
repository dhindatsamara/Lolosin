#!/usr/bin/env python3
"""Pecah bank soal Lolosin jadi chunk-chunk kecil per materi.

Kenapa dipecah: konektor GitHub (push_files via MCP) menolak request body
yang terlalu besar (HTTP 413) — satu file questions.json 7,9 MB tidak bisa
di-push. Chunk @ maks 1,5 MB terbukti lolos.

Cara pakai (dari root repo lolosin):
    python3 scripts/split-questions.py
    # membaca ../cpns/bank-soal/bank-soal.json (atau path di argv[1])
    # menulis src/data/questions/questions-<materi>-<n>.json

Loader (src/lib/questions.ts) memakai import.meta.glob sehingga jumlah dan
nama chunk boleh berubah tanpa mengubah kode — cukup jalankan script ini
lalu rebuild.
"""
import json
import os
import sys

MAX_BYTES = 1_500_000  # per chunk, terbukti lolos push_files
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    "~/workspace/cpns/bank-soal/bank-soal.json"
)
OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "src", "data", "questions")


def main() -> None:
    with open(SRC, encoding="utf-8") as f:
        bank = json.load(f)
    by_materi: dict[str, list] = {}
    for q in bank:
        by_materi.setdefault(q["materi"], []).append(q)

    os.makedirs(OUT_DIR, exist_ok=True)
    # hapus chunk lama supaya tidak ada sisa basi
    for name in os.listdir(OUT_DIR):
        if name.startswith("questions-") and name.endswith(".json"):
            os.remove(os.path.join(OUT_DIR, name))

    total = 0
    written = []
    for materi in sorted(by_materi):
        items = by_materi[materi]
        part, buf, buf_size = 1, [], 2  # 2 byte untuk []
        for q in items:
            s = json.dumps(q, ensure_ascii=False)
            # +1 koma (kecuali item pertama) — perkiraan konservatif +2
            if buf and buf_size + len(s.encode("utf-8")) + 2 > MAX_BYTES:
                _write(materi, part, buf)
                written.append((materi, part, len(buf)))
                part += 1
                buf, buf_size = [], 2
            buf.append(q)
            buf_size += len(s.encode("utf-8")) + 2
        if buf:
            _write(materi, part, buf)
            written.append((materi, part, len(buf)))
        total += len(items)

    print(f"total soal: {total}")
    for materi, part, n in written:
        p = os.path.join(OUT_DIR, f"questions-{materi.lower()}-{part}.json")
        print(f"  {os.path.basename(p)}: {n} soal, {os.path.getsize(p)} bytes")


def _write(materi: str, part: int, buf: list) -> None:
    path = os.path.join(OUT_DIR, f"questions-{materi.lower()}-{part}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(buf, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
