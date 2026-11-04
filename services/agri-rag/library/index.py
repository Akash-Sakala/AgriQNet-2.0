"""One small index per book: chunks.jsonl + emb.npy (normalised float16) + an in-memory BM25.

Why per book instead of one big vector store:
* "Chat with this book" only ever touches that book's vectors (no filtering mistakes, no
  leakage from other books), and hiding/removing a book never rewrites anybody else's index.
* A laptop-sized library (tens of books, ~100k chunks) fits in memory, so exact (brute-force)
  similarity is fast and needs no ANN tuning; "Ask the library" simply searches every book.
"""
import json
import math
import re
import threading
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

from .config import BOOKS_DIR

TOKEN = re.compile(r"[0-9a-zऀ-෿]+")
STOP = set("""a an the of and or to in on for with by from at as is are was were be been it its this that these those
which what how when where who why can could should would will shall may might do does did not no yes than then so such
into over under about per via any all each other more most less very also there their them they we you your our i me my
ಮತ್ತು ಈ ಆ ಒಂದು ಇದು ಅದು ಹಾಗೂ के का की और में है से को पर यह वह एक भी తో మరియు ఈ ఆ ఒక లో""".split())


def tokenize(text: str) -> list:
    out = []
    for w in TOKEN.findall(unicodedata.normalize("NFKC", text).lower()):
        if w in STOP or len(w) < 2:
            continue
        if w.isascii() and len(w) > 4 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]                                   # crude plural folding: pests -> pest
        out.append(w)
    return out


def book_dir(book_id: str) -> Path:
    return BOOKS_DIR / book_id


def save_index(book_id: str, chunks: list, emb: np.ndarray) -> None:
    d = book_dir(book_id)
    d.mkdir(parents=True, exist_ok=True)
    with open(d / "chunks.jsonl", "w", encoding="utf-8") as f:
        for c in chunks:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    np.save(d / "emb.npy", emb.astype(np.float16))
    _cache.pop(book_id, None)


class BookIndex:
    K1, B = 1.4, 0.75

    def __init__(self, book_id: str):
        d = book_dir(book_id)
        self.book_id = book_id
        with open(d / "chunks.jsonl", encoding="utf-8") as f:
            self.chunks = [json.loads(line) for line in f]
        self.emb = np.load(d / "emb.npy").astype(np.float32)
        self.postings = defaultdict(list)
        lens = []
        for i, c in enumerate(self.chunks):
            toks = tokenize(f"{c.get('section', '')} {c['text']}")
            lens.append(len(toks))
            for t, tf in Counter(toks).items():
                self.postings[t].append((i, tf))
        self.lens = np.array(lens or [1], dtype=np.float32)
        self.avgdl = float(self.lens.mean()) or 1.0
        self.n = len(self.chunks)

    def dense(self, qv: np.ndarray, k: int) -> list:
        if self.n == 0:
            return []
        s = self.emb @ qv
        k = min(k, self.n)
        top = np.argpartition(-s, k - 1)[:k]
        return sorted(((int(i), float(s[i])) for i in top), key=lambda x: -x[1])

    def bm25(self, tokens: list, k: int) -> list:
        if self.n == 0 or not tokens:
            return []
        scores = np.zeros(self.n, dtype=np.float32)
        for t in set(tokens):
            plist = self.postings.get(t)
            if not plist:
                continue
            idf = math.log(1 + (self.n - len(plist) + 0.5) / (len(plist) + 0.5))
            for i, tf in plist:
                scores[i] += idf * tf * (self.K1 + 1) / (tf + self.K1 * (1 - self.B + self.B * self.lens[i] / self.avgdl))
        nz = np.flatnonzero(scores)
        if nz.size == 0:
            return []
        top = nz[np.argsort(-scores[nz])[:k]]
        return [(int(i), float(scores[i])) for i in top]


_cache: dict = {}
_cache_lock = threading.Lock()


def load_index(book_id: str) -> BookIndex:
    with _cache_lock:
        idx = _cache.get(book_id)
        if idx is None:
            idx = BookIndex(book_id)
            _cache[book_id] = idx
        return idx


def forget(book_id: str) -> None:
    with _cache_lock:
        _cache.pop(book_id, None)
