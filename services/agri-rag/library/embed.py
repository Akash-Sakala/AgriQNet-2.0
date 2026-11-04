"""Embedding + reranking models (loaded once, shared by the worker and the chat endpoint)."""
import threading
from typing import Callable, Optional

import numpy as np

from .config import EMBED_BATCH, EMBED_MODEL, RERANK_MODEL, TORCH_THREADS

_lock = threading.Lock()
_run = threading.Lock()      # HF fast tokenizers are not safe to call from two threads at once
_embedder = None
_reranker = None
_rerank_failed = False
_rerank_run = threading.Lock()


def _torch_setup():
    import torch
    if TORCH_THREADS > 0:
        torch.set_num_threads(TORCH_THREADS)


def embedder():
    global _embedder
    with _lock:
        if _embedder is None:
            _torch_setup()
            from sentence_transformers import SentenceTransformer
            print(f"[library] loading embedding model {EMBED_MODEL} …", flush=True)
            _embedder = SentenceTransformer(EMBED_MODEL, device="cpu")
        return _embedder


def _prefix(kind: str) -> str:
    # e5 models are trained with "query: " / "passage: " prefixes; bge-m3 and others need none
    return f"{kind}: " if "e5" in EMBED_MODEL.lower() else ""


def encode_passages(texts: list, progress: Optional[Callable[[float], None]] = None) -> np.ndarray:
    m = embedder()
    out = []
    for i in range(0, len(texts), EMBED_BATCH):
        batch = [_prefix("passage") + t for t in texts[i:i + EMBED_BATCH]]
        with _run:                       # one batch at a time, so a chat question can slip in between batches
            out.append(m.encode(batch, batch_size=EMBED_BATCH, normalize_embeddings=True, convert_to_numpy=True))
        if progress:
            progress(min(1.0, (i + EMBED_BATCH) / max(1, len(texts))))
    return np.vstack(out).astype(np.float16) if out else np.zeros((0, 1), np.float16)


def encode_queries(texts: list) -> np.ndarray:
    m = embedder()
    with _run:
        return m.encode([_prefix("query") + t for t in texts], normalize_embeddings=True, convert_to_numpy=True).astype(np.float32)


def reranker():
    global _reranker, _rerank_failed
    if RERANK_MODEL.lower() in ("", "none", "off") or _rerank_failed:
        return None
    with _lock:
        if _reranker is None:
            try:
                _torch_setup()
                from sentence_transformers import CrossEncoder
                print(f"[library] loading reranker {RERANK_MODEL} …", flush=True)
                _reranker = CrossEncoder(RERANK_MODEL, device="cpu", max_length=384)
            except Exception as e:  # noqa: BLE001
                print(f"[library] reranker unavailable ({e}); using fused ranking only", flush=True)
                _rerank_failed = True
                return None
        return _reranker


def rerank(query: str, texts: list) -> Optional[np.ndarray]:
    r = reranker()
    if r is None or not texts:
        return None
    with _rerank_run:
        return np.asarray(r.predict([(query, t[:1500]) for t in texts], batch_size=32))
