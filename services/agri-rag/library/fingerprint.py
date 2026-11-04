"""Duplicate detection that survives renaming and re-saving.

1. sha256 of the file bytes          -> the same file under any name (instant)
2. sha256 of the normalised text     -> same content re-saved / re-exported / metadata changed
3. MinHash (128 perms, 5-word shingles), Jaccard >= LIBRARY_NEAR_DUP -> near-identical copies
   (an extra cover page, a watermark, a stamped "received" page, slightly different extraction)
"""
import hashlib
import re
import unicodedata
from typing import Optional

import numpy as np
from datasketch import MinHash

WORD = re.compile(r"[0-9a-zऀ-෿]+")
NUM_PERM = 128


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def words(text: str) -> list:
    return WORD.findall(unicodedata.normalize("NFKC", text).lower())


def text_hash(text: str) -> Optional[str]:
    w = words(text)
    if len(w) < 50:          # too little text to trust (e.g. a scanned PDF)
        return None
    return hashlib.sha256(" ".join(w).encode()).hexdigest()


def minhash(text: str, max_words: int = 250_000) -> Optional[bytes]:
    w = words(text)[:max_words]
    if len(w) < 50:
        return None
    m = MinHash(num_perm=NUM_PERM)
    m.update_batch([" ".join(w[i:i + 5]).encode() for i in range(len(w) - 4)])
    return m.hashvalues.astype(np.uint64).tobytes()


def jaccard(a: bytes, b: bytes) -> float:
    x, y = np.frombuffer(a, np.uint64), np.frombuffer(b, np.uint64)
    return float((x == y).mean()) if len(x) == len(y) else 0.0
