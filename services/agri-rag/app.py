"""AgriRAG — the Farmer Library service (port 8003).

Farmers and officers add PDFs or article links; each becomes a "book" with a cover, a title and
summary in English/Hindi/Kannada/Telugu, and its own search index. Anyone can chat with one book or
the whole library and get answers in their language with page citations.

The API gateway (services/api) is the only caller; it adds X-User-Id / X-User-Name / X-User-Role.
"""
import os
import tempfile
import threading
from contextlib import asynccontextmanager
from typing import List, Optional
from urllib.parse import unquote

from fastapi import FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel

from library import llm, store
from library.chat import answer
from library.config import BOOKS_DIR, EMBED_MODEL, INCOMING_DIR, LIBRARY_DIR, MAX_UPLOAD_MB, RERANK_MODEL
from library.covers import ai_providers
from library.extract import is_pdf, ocr_available
from library.net import valid_url
from library.pipeline import cancel_automatic, cancel_job, enqueue, precheck_pdf, start_worker
from library.sources import check_sources, queue_url, start_scheduler


def _warm():
    try:
        from library.embed import embedder, reranker
        embedder()
        reranker()
        print("[library] models ready", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"[library] model warm-up failed: {e}", flush=True)


@asynccontextmanager
async def lifespan(_app):
    start_worker()
    if os.getenv("RAG_PRELOAD", "true").lower() != "false":
        threading.Thread(target=_warm, daemon=True).start()
    if os.getenv("LIBRARY_SCHEDULER", "true").lower() != "false":
        start_scheduler()
    print(f"[library] data folder: {LIBRARY_DIR}", flush=True)
    yield


app = FastAPI(title="AgriQNet Farmer Library (AgriRAG)", version="2.0", lifespan=lifespan)


# ---------- helpers ----------
def user_from(x_user_id: str = "", x_user_name: str = "", x_user_role: str = "") -> dict:
    return {"id": x_user_id or "", "name": unquote(x_user_name or ""), "role": x_user_role or "farmer"}


def book_out(b: dict, user_id: str = "") -> dict:
    m = b.get("meta") or {}
    v = int(b.get("updated_at") or 0)
    return {
        "id": b["id"], "kind": b["kind"], "status": b["status"],
        "title": m.get("title") or {"en": b.get("title")}, "summary": m.get("summary") or {}, "questions": m.get("questions") or {},
        "category": b.get("category") or "other", "docType": b.get("doc_type"), "publisher": b.get("publisher") or "",
        "year": b.get("year") or "", "pages": b.get("pages"), "chunks": b.get("chunks"), "crops": m.get("crops", []),
        "topics": m.get("topics", []), "headings": m.get("headings", []), "language": m.get("language", "en"),
        "legacyKannada": bool(m.get("legacy_kannada")), "cover": b.get("cover") or "none",
        "coverUrl": f"/api/library/books/{b['id']}/cover?v={v}" if b.get("cover") not in (None, "none") else None,
        "pageUrl": f"/api/library/books/{b['id']}/cover?kind=page&v={v}",
        "fileUrl": f"/api/library/books/{b['id']}/file", "sourceUrl": b.get("source_url") or "",
        "origin": b.get("origin"), "uploadedBy": b.get("uploaded_by_name") or "", "mine": bool(user_id and b.get("uploaded_by") == user_id),
        "createdAt": b.get("created_at"),
    }


def job_out(j: dict, user_id: str = "") -> dict:
    out = {k: j.get(k) for k in ("id", "kind", "status", "stage", "progress", "message", "url", "origin", "created_at")}
    out["mine"] = bool(user_id and j.get("user_id") == user_id)
    out["name"] = j.get("original_name") or j.get("url")
    out["dupReason"] = j.get("dup_reason")
    if j.get("book_id"):
        b = store.get_book(j["book_id"])
        if b:
            out["book"] = book_out(b, j.get("user_id") or "")
    return out


# ---------- health ----------
@app.get("/health")
def health():
    books = store.list_books(include_hidden=True)
    return {"status": "ok", "books": len(books), "queue": len(store.active_jobs()), "embedModel": EMBED_MODEL,
            "rerankModel": RERANK_MODEL, "llm": llm.available(), "coverAi": [n for n, _ in ai_providers()],
            "ocr": ocr_available(), "libraryDir": str(LIBRARY_DIR)}


# ---------- books ----------
@app.get("/library/books")
def list_books(all: bool = False, x_user_id: str = Header(""), x_user_role: str = Header("")):
    show_hidden = all and x_user_role == "officer"
    return {"books": [book_out(b, x_user_id) for b in store.list_books(include_hidden=show_hidden)],
            "queue": [job_out(j, x_user_id) for j in store.active_jobs()],
            "lastCheck": store.get_setting("last_check")}


@app.get("/library/books/{book_id}")
def get_book(book_id: str, x_user_id: str = Header(""), x_user_role: str = Header("")):
    b = store.get_book(book_id)
    if not b or (b["status"] != "ready" and x_user_role != "officer"):
        raise HTTPException(404, "Book not found")
    return book_out(b, x_user_id)


@app.get("/library/books/{book_id}/cover")
def cover(book_id: str, kind: str = "art"):
    f = BOOKS_DIR / book_id / ("page.jpg" if kind == "page" else "art.jpg")
    if not f.exists():
        raise HTTPException(404, "No cover")
    return FileResponse(f, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=604800"})


@app.get("/library/books/{book_id}/file")
def book_file(book_id: str):
    b = store.get_book(book_id)
    if not b:
        raise HTTPException(404, "Book not found")
    if b["kind"] == "article" and b.get("source_url"):
        return RedirectResponse(b["source_url"])
    f = BOOKS_DIR / book_id / "source.pdf"
    if not f.exists():
        raise HTTPException(404, "File missing")
    safe = "".join(c for c in (b.get("title") or "book") if c.isalnum() or c in " -_")[:80].strip() or "book"
    return FileResponse(f, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{safe}.pdf"'})


class HideBody(BaseModel):
    hidden: bool = True


@app.post("/library/books/{book_id}/hide")
def hide(book_id: str, body: HideBody, x_user_role: str = Header("")):
    if x_user_role != "officer":
        raise HTTPException(403, "Only agriculture officers can hide books")
    if not store.get_book(book_id):
        raise HTTPException(404, "Book not found")
    store.update_book(book_id, status="hidden" if body.hidden else "ready")
    return {"ok": True, "status": "hidden" if body.hidden else "ready"}


# ---------- adding books ----------
@app.post("/library/upload")
async def upload(file: UploadFile = File(...), x_user_id: str = Header(""), x_user_name: str = Header(""), x_user_role: str = Header("")):
    user = user_from(x_user_id, x_user_name, x_user_role)
    name = os.path.basename(file.filename or "upload.pdf")
    fd, tmp = tempfile.mkstemp(dir=INCOMING_DIR, suffix=".pdf")
    size, limit = 0, MAX_UPLOAD_MB * 1024 * 1024
    try:
        with os.fdopen(fd, "wb") as out:
            while True:
                block = await file.read(1 << 20)
                if not block:
                    break
                size += len(block)
                if size > limit:
                    raise HTTPException(413, f"File is larger than {MAX_UPLOAD_MB} MB")
                out.write(block)
        if not is_pdf(tmp):
            raise HTTPException(415, "Please choose a PDF file")
        try:
            pre = precheck_pdf(tmp)
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
        except Exception as e:  # noqa: BLE001
            raise HTTPException(422, f"This PDF could not be opened ({str(e)[:120]})") from e
        sha = pre["sha"]
        running = store.job_for_sha(sha)
        if running:                                   # the same file is already being added
            os.remove(tmp)
            return {"status": "queued", "job": job_out(running)}
        if pre.get("dup"):
            os.remove(tmp)
            b = store.get_book(pre["dup"])
            if b and b["status"] != "ready":
                raise HTTPException(409, "This document was removed from the library by an officer")
            return {"status": "duplicate", "reason": pre["reason"], "book": book_out(b, user["id"])}
        if pre.get("chars", 0) < 300 and not ocr_available():
            raise HTTPException(422, "scanned")
        job = enqueue(kind="file", file_path=tmp, sha256=sha, original_name=name, origin="upload",
                      user_id=user["id"], user_name=user["name"])
        return {"status": "queued", "job": job_out(job)}
    except HTTPException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


class UrlBody(BaseModel):
    url: str


@app.post("/library/url")
def add_url(body: UrlBody, x_user_id: str = Header(""), x_user_name: str = Header(""), x_user_role: str = Header("")):
    user = user_from(x_user_id, x_user_name, x_user_role)
    url = body.url.strip()
    if not valid_url(url):
        raise HTTPException(422, "Please paste a full web link starting with http:// or https://")
    b = store.find_book_by("source_url", url)
    if b and b["status"] == "ready":
        return {"status": "duplicate", "reason": "same_link", "book": book_out(b, user["id"])}
    running = store.job_for_url(url)
    if running:
        return {"status": "queued", "job": job_out(running)}
    job = queue_url(url, "url", "user", {}, user)
    return {"status": "queued", "job": job_out(job)}


@app.get("/library/jobs/{job_id}")
def job(job_id: str):
    j = store.get_job(job_id)
    if not j:
        raise HTTPException(404, "Job not found")
    return job_out(j)


@app.get("/library/jobs")
def jobs(x_user_id: str = Header(""), x_user_role: str = Header("")):
    rows = store.recent_jobs(None if x_user_role == "officer" else (x_user_id or "-"), limit=40)
    return {"jobs": [job_out(j) for j in rows]}


@app.post("/library/jobs/{job_id}/cancel")
def cancel(job_id: str, x_user_id: str = Header(""), x_user_role: str = Header("")):
    j = store.get_job(job_id)
    if not j:
        raise HTTPException(404, "Job not found")
    if x_user_role != "officer" and (not x_user_id or j.get("user_id") != x_user_id):
        raise HTTPException(403, "Only the person who added it or an officer can stop this")
    return {"cancelled": cancel_job(job_id)}


@app.post("/library/jobs/cancel-automatic")
def cancel_auto(x_user_role: str = Header("")):
    if x_user_role != "officer":
        raise HTTPException(403, "Only agriculture officers can stop the starter shelf")
    return {"cancelled": cancel_automatic()}


@app.post("/library/sources/check")
def sources_check(x_user_role: str = Header("")):
    if x_user_role != "officer":
        raise HTTPException(403, "Only agriculture officers can start a source check")
    threading.Thread(target=check_sources, kwargs={"force": True}, daemon=True).start()
    return {"started": True, "lastCheck": store.get_setting("last_check")}


# ---------- chat ----------
class ChatTurn(BaseModel):
    role: str
    text: str


class ChatBody(BaseModel):
    message: str
    lang: str = "en"
    bookIds: Optional[List[str]] = None
    history: Optional[List[ChatTurn]] = None


@app.post("/library/chat")
def library_chat(body: ChatBody):
    if not body.message.strip():
        raise HTTPException(400, "Message cannot be empty")
    return answer(body.message.strip()[:1000], body.lang, body.bookIds or [], [h.model_dump() for h in (body.history or [])])


# ---------- old AgriRAG endpoints (kept so older callers keep working) ----------
@app.post("/chat")
async def legacy_chat(request: Request):
    data = await request.json()
    msg = str(data.get("message", "")).strip()
    if not msg:
        return JSONResponse({"error": "Message cannot be empty"}, status_code=400)
    r = answer(msg[:1000], data.get("lang", "en"), [], [])
    return {"response": r["answer"], "sources": r.get("sources", [])}


@app.get("/processed")
def legacy_processed():
    return {"processed": [{"filename": b.get("file_name"), "title": b.get("title"), "processed_at": b.get("created_at")}
                          for b in store.list_books()]}


@app.get("/")
def root():
    return {"name": "AgriQNet Farmer Library (AgriRAG)", "health": "/health", "books": "/library/books"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("RAG_PORT", "8003"))
    print(f"Starting AgriQNet Farmer Library (AgriRAG) on http://127.0.0.1:{port} …", flush=True)
    uvicorn.run(app, host=os.getenv("HOST", "127.0.0.1"), port=port, log_level="warning")
