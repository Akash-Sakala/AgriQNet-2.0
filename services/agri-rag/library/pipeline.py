"""Background worker that turns uploads, links and source PDFs into library books.

Stages (shown to the farmer as a progress bar):
  download -> checking (duplicates) -> reading -> topic (is it about farming? + titles in 4 languages)
  -> indexing (embeddings) -> cover -> ready
A job can also end as: duplicate (points to the existing book), rejected (not farming / no text) or failed.
"""
import os
import shutil
import threading
import time
import traceback
from pathlib import Path

from . import store
from .chunking import chunk_pages
from .config import AUTOSEED, BOOKS_DIR, EMBED_MODEL, MAX_PAGES, NEAR_DUP_JACCARD
from .covers import image_from_url, make_cover
from .embed import encode_passages
from .extract import extract_article, extract_pdf, garbled, ocr_available, open_pdf, pdf_pictures, quick_text
from .fingerprint import jaccard, minhash, sha256_file, text_hash
from .index import save_index
from .meta import describe
from .net import download

_wake = threading.Event()


class Duplicate(Exception):
    def __init__(self, book_id: str, reason: str):
        super().__init__(reason)
        self.book_id, self.reason = book_id, reason


class Rejected(Exception):
    pass


class Cancelled(Exception):
    pass


AUTO_ORIGINS = ("seed", "crawl", "legacy")


def cancel_job(job_id: str) -> bool:
    """Stop a queued or running job. A running one stops at its next progress step (seconds)."""
    j = store.get_job(job_id)
    if not j or j["status"] not in ("queued", "running"):
        return False
    store.update_job(job_id, status="cancelled", stage="cancelled", message="cancelled")
    if j.get("url") and j.get("origin") in AUTO_ORIGINS:     # so it can be added again later
        store.run("DELETE FROM seen_urls WHERE url=?", (j["url"],))
    return True


def cancel_automatic() -> int:
    """Stop every job the library queued by itself (starter shelf, monthly check, old AgriRAG PDFs)."""
    return sum(cancel_job(j["id"]) for j in store.active_jobs() if j.get("origin") in AUTO_ORIGINS)


# ---------- duplicate checks (also used synchronously by the upload endpoint) ----------
def find_duplicate(sha: str = None, text: str = None) -> tuple:
    """-> (book_id, reason) or (None, None). reason: same_file | same_text | near_copy"""
    if sha:
        b = store.find_book_by("sha256", sha)
        if b:
            return b["id"], "same_file"
    if text:
        th = text_hash(text)
        b = store.find_book_by("text_hash", th) if th else None
        if b:
            return b["id"], "same_text"
        mh = minhash(text)
        if mh:
            best, best_j = None, 0.0
            for bid, other in store.all_minhashes():
                j = jaccard(mh, other)
                if j > best_j:
                    best, best_j = bid, j
            if best and best_j >= NEAR_DUP_JACCARD:
                return best, "near_copy"
    return None, None


def precheck_pdf(path: str) -> dict:
    """Fast checks right after upload (≈1 s): valid PDF, size, and duplicates by bytes or text."""
    sha = sha256_file(path)
    bid, why = find_duplicate(sha=sha)
    if bid:
        return {"sha": sha, "dup": bid, "reason": why}
    with open_pdf(path) as doc:          # always close: Windows cannot delete an open file
        text = quick_text(doc, MAX_PAGES)
        pages = doc.page_count
    bid, why = find_duplicate(text=text)
    return {"sha": sha, "dup": bid, "reason": why, "pages": pages, "chars": len(text.strip())}


# ---------- the worker ----------
def enqueue(**job) -> dict:
    j = store.create_job(**job)
    _wake.set()
    return j


def _set(job_id: str, stage: str, progress: float, message: str = "") -> None:
    cur = store.get_job(job_id)
    if cur and cur["status"] == "cancelled":
        raise Cancelled()
    store.update_job(job_id, status="running", stage=stage, progress=round(progress, 3), message=message)


def process(job: dict) -> None:
    jid = job["id"]
    hints = job.get("hints") or {}
    path = job.get("file_path")
    kind, extracted, doc, article_image = "pdf", None, None, ""
    try:
        if job["kind"] == "url":
            _set(jid, "download", 0.02)
            got = download(job["url"], progress=lambda f: _set(jid, "download", 0.02 + 0.08 * f))
            path = got["path"]
            store.update_job(jid, file_path=path)
            if not got["is_pdf"]:
                kind = "article"
                extracted = extract_article(got["html"], got["url"])
                article_image = extracted.get("image", "")
        _set(jid, "checking", 0.12)
        sha = sha256_file(path)
        store.update_job(jid, sha256=sha)
        bid, why = find_duplicate(sha=sha)
        if bid:
            raise Duplicate(bid, why)
        if kind == "pdf":
            doc = open_pdf(path)
            raw = quick_text(doc, MAX_PAGES)
            if len(raw.strip()) < 300 and not ocr_available():
                raise Rejected("scanned")
            bid, why = find_duplicate(text=raw)
            if bid:
                raise Duplicate(bid, why)
            _set(jid, "reading", 0.15)
            extracted = extract_pdf(doc, MAX_PAGES, progress=lambda f: _set(jid, "reading", 0.15 + 0.15 * f))
            fp_text = raw
        else:
            fp_text = "\n".join(p["text"] for p in extracted["pages"])
            bid, why = find_duplicate(text=fp_text)
            if bid:
                raise Duplicate(bid, why)

        _set(jid, "topic", 0.32)
        name = job.get("original_name") or os.path.basename(job.get("url") or path)
        if kind == "article":
            hints = {"publisher": extracted.get("site", ""), "year": (extracted.get("date") or "")[:4], "doc_type": "article", **hints}
        meta = describe(extracted, hints, name)
        trusted = job.get("origin") in ("seed", "crawl", "legacy")
        if not trusted and not meta.get("is_agri", True) and float(meta.get("agri_confidence") or 0) < 0.4:
            raise Rejected("not_agri:" + str(meta.get("reason", ""))[:200])

        _set(jid, "indexing", 0.35)
        chunks = [c for c in chunk_pages(extracted["pages"]) if not garbled(c["text"])]
        for n, c in enumerate(chunks):
            c["i"] = n
        if not chunks:
            raise Rejected("scanned")
        title_en = meta["title"].get("en") or name
        texts = [f"{title_en} | {c['section']}\n{c['text']}" if c["section"] else f"{title_en}\n{c['text']}" for c in chunks]
        emb = encode_passages(texts, progress=lambda f: _set(jid, "indexing", 0.35 + 0.55 * f))

        book_id = store.new_id("bk")
        bdir = BOOKS_DIR / book_id
        bdir.mkdir(parents=True, exist_ok=True)
        save_index(book_id, chunks, emb)

        _set(jid, "cover", 0.92)
        if kind == "pdf":
            pictures = pdf_pictures(doc)
        else:
            img = image_from_url(article_image) if article_image else None
            pictures = {"page": None, "page_is_cover": False, "photo": img}
        cover = make_cover(bdir, pictures, meta)

        if (store.get_job(jid) or {}).get("status") == "cancelled":   # stopped while the cover was made
            shutil.rmtree(bdir, ignore_errors=True)
            raise Cancelled()
        ext = ".pdf" if kind == "pdf" else ".html"
        if doc is not None:
            doc.close()
            doc = None
        shutil.move(path, bdir / f"source{ext}")
        meta.update({k: extracted.get(k) for k in ("legacy_kannada", "legacy_unsupported", "ocr_pages", "empty_pages", "used_pages") if k in extracted})
        store.insert_book({
            "id": book_id, "status": "ready", "kind": kind, "sha256": sha, "text_hash": text_hash(fp_text),
            "minhash": minhash(fp_text), "title": title_en, "category": meta["category"], "doc_type": meta["doc_type"],
            "publisher": meta["publisher"], "year": meta["year"], "meta": meta, "pages": extracted["page_count"],
            "chunks": len(chunks), "embed_model": EMBED_MODEL, "source_url": job.get("url") or hints.get("source_url") or "",
            "file_name": name, "origin": job.get("origin") or "upload", "uploaded_by": job.get("user_id") or "",
            "uploaded_by_name": job.get("user_name") or "", "cover": cover,
        })
        store.update_job(jid, status="ready", stage="ready", progress=1.0, book_id=book_id, message="")
        print(f"[library] ✓ {title_en} ({len(chunks)} chunks, cover={cover})", flush=True)
    except Duplicate as d:
        store.update_job(jid, status="duplicate", stage="duplicate", progress=1.0, dup_of=d.book_id, dup_reason=d.reason, book_id=d.book_id)
        print(f"[library] duplicate of {d.book_id} ({d.reason}): {job.get('original_name') or job.get('url')}", flush=True)
    except Cancelled:
        print(f"[library] cancelled: {job.get('original_name') or job.get('url')}", flush=True)
    except Rejected as r:
        store.update_job(jid, status="rejected", stage="rejected", progress=1.0, message=str(r))
        print(f"[library] rejected ({r}): {job.get('original_name') or job.get('url')}", flush=True)
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        store.update_job(jid, status="failed", stage="failed", message=str(e)[:300])
    finally:
        if doc is not None:
            doc.close()
        if path and os.path.exists(path) and Path(path).parent.name == "incoming":
            try:
                os.remove(path)
            except OSError:
                pass


USER_ORIGINS = ("upload", "url")


def _loop(lane: str) -> None:
    """Two lanes: farmers' uploads/links never wait behind the starter shelf or the monthly check."""
    while True:
        queued = [j for j in store.active_jobs() if j["status"] == "queued"
                  and ((j.get("origin") in USER_ORIGINS) == (lane == "user"))]
        if not queued:
            _wake.wait(3)
            if lane == "user":
                _wake.clear()
            continue
        process(queued[0])
        time.sleep(0.2)


def start_worker() -> None:
    for j in store.q("SELECT id FROM jobs WHERE status='running'"):   # interrupted by a restart
        store.update_job(j["id"], status="queued", stage="queued")
    if not AUTOSEED:                     # automatic adding switched off: drop what it had queued
        n = cancel_automatic()
        store.set_setting("legacy_imported", True)
        if n:
            print(f"[library] LIBRARY_AUTOSEED=false: stopped {n} automatic job(s)", flush=True)
    threading.Thread(target=_loop, args=("user",), name="library-user", daemon=True).start()
    threading.Thread(target=_loop, args=("background",), name="library-background", daemon=True).start()
