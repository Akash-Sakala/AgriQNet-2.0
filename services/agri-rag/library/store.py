"""Library catalogue in SQLite: books, processing jobs, source URLs already seen, settings."""
import json
import sqlite3
import threading
import time
import uuid
from typing import Any, Optional

from .config import DB_PATH

_lock = threading.RLock()
_conn = sqlite3.connect(DB_PATH, check_same_thread=False, isolation_level=None)
_conn.row_factory = sqlite3.Row
_conn.execute("PRAGMA journal_mode=WAL")

_conn.executescript(
    """
CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ready',      -- ready | hidden
  kind TEXT NOT NULL DEFAULT 'pdf',          -- pdf | article
  sha256 TEXT, text_hash TEXT, minhash BLOB,
  title TEXT, category TEXT, doc_type TEXT, publisher TEXT, year TEXT,
  meta TEXT,                                 -- JSON: per-language title/summary/questions, crops, headings...
  pages INTEGER, chunks INTEGER, embed_model TEXT,
  source_url TEXT, file_name TEXT,
  origin TEXT,                               -- seed | crawl | upload | url | legacy
  uploaded_by TEXT, uploaded_by_name TEXT,
  cover TEXT,                                -- art | photo | page | none
  created_at REAL, updated_at REAL
);
CREATE INDEX IF NOT EXISTS books_sha ON books(sha256);
CREATE INDEX IF NOT EXISTS books_text ON books(text_hash);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT, status TEXT, stage TEXT, progress REAL DEFAULT 0, message TEXT,
  book_id TEXT, dup_of TEXT, dup_reason TEXT,
  file_path TEXT, sha256 TEXT, url TEXT, original_name TEXT,
  user_id TEXT, user_name TEXT, origin TEXT, hints TEXT,
  created_at REAL, updated_at REAL
);
CREATE TABLE IF NOT EXISTS seen_urls (url TEXT PRIMARY KEY, source TEXT, job_id TEXT, first_seen REAL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
"""
)

BOOK_JSON = ("meta",)


def _row(r: Optional[sqlite3.Row]) -> Optional[dict]:
    if r is None:
        return None
    d = dict(r)
    for k in ("meta", "hints"):
        if k in d and isinstance(d[k], str):
            try:
                d[k] = json.loads(d[k])
            except ValueError:
                d[k] = {}
    d.pop("minhash", None)
    return d


def q(sql: str, args: tuple = ()) -> list:
    with _lock:
        return _conn.execute(sql, args).fetchall()


def run(sql: str, args: tuple = ()) -> None:
    with _lock:
        _conn.execute(sql, args)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ---------- books ----------
def insert_book(b: dict) -> None:
    b = dict(b)
    b.setdefault("created_at", time.time())
    b["updated_at"] = time.time()
    if isinstance(b.get("meta"), dict):
        b["meta"] = json.dumps(b["meta"], ensure_ascii=False)
    cols = ",".join(b)
    run(f"INSERT OR REPLACE INTO books ({cols}) VALUES ({','.join('?' * len(b))})", tuple(b.values()))


def update_book(book_id: str, **fields) -> None:
    if "meta" in fields and isinstance(fields["meta"], dict):
        fields["meta"] = json.dumps(fields["meta"], ensure_ascii=False)
    fields["updated_at"] = time.time()
    sets = ",".join(f"{k}=?" for k in fields)
    run(f"UPDATE books SET {sets} WHERE id=?", (*fields.values(), book_id))


def get_book(book_id: str) -> Optional[dict]:
    rows = q("SELECT * FROM books WHERE id=?", (book_id,))
    return _row(rows[0]) if rows else None


def list_books(include_hidden: bool = False) -> list:
    sql = "SELECT * FROM books" + ("" if include_hidden else " WHERE status='ready'") + " ORDER BY created_at DESC"
    return [_row(r) for r in q(sql)]


def find_book_by(column: str, value: str) -> Optional[dict]:
    if not value:
        return None
    rows = q(f"SELECT * FROM books WHERE {column}=? LIMIT 1", (value,))
    return _row(rows[0]) if rows else None


def all_minhashes() -> list:
    return [(r["id"], r["minhash"]) for r in q("SELECT id, minhash FROM books WHERE minhash IS NOT NULL")]


# ---------- jobs ----------
def create_job(**fields) -> dict:
    job = {"id": new_id("job"), "status": "queued", "stage": "queued", "progress": 0.0, "message": "",
           "created_at": time.time(), "updated_at": time.time(), **fields}
    if isinstance(job.get("hints"), dict):
        job["hints"] = json.dumps(job["hints"], ensure_ascii=False)
    cols = ",".join(job)
    run(f"INSERT INTO jobs ({cols}) VALUES ({','.join('?' * len(job))})", tuple(job.values()))
    return get_job(job["id"])


def update_job(job_id: str, **fields) -> None:
    fields["updated_at"] = time.time()
    sets = ",".join(f"{k}=?" for k in fields)
    run(f"UPDATE jobs SET {sets} WHERE id=?", (*fields.values(), job_id))


def get_job(job_id: str) -> Optional[dict]:
    rows = q("SELECT * FROM jobs WHERE id=?", (job_id,))
    return _row(rows[0]) if rows else None


def active_jobs() -> list:
    return [_row(r) for r in q("SELECT * FROM jobs WHERE status IN ('queued','running') ORDER BY created_at")]


def recent_jobs(user_id: Optional[str] = None, limit: int = 30) -> list:
    if user_id:
        rows = q("SELECT * FROM jobs WHERE user_id=? ORDER BY created_at DESC LIMIT ?", (user_id, limit))
    else:
        rows = q("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,))
    return [_row(r) for r in rows]


def job_for_sha(sha: str) -> Optional[dict]:
    rows = q("SELECT * FROM jobs WHERE sha256=? AND status IN ('queued','running') LIMIT 1", (sha,))
    return _row(rows[0]) if rows else None


def job_for_url(url: str) -> Optional[dict]:
    rows = q("SELECT * FROM jobs WHERE url=? AND status IN ('queued','running') LIMIT 1", (url,))
    return _row(rows[0]) if rows else None


# ---------- seen source URLs / settings ----------
def url_seen(url: str) -> bool:
    return bool(q("SELECT 1 FROM seen_urls WHERE url=?", (url,)))


def mark_url(url: str, source: str, job_id: str = "") -> None:
    run("INSERT OR IGNORE INTO seen_urls (url, source, job_id, first_seen) VALUES (?,?,?,?)", (url, source, job_id, time.time()))


def get_setting(key: str, default: Any = None) -> Any:
    rows = q("SELECT value FROM settings WHERE key=?", (key,))
    return json.loads(rows[0]["value"]) if rows else default


def set_setting(key: str, value: Any) -> None:
    run("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)", (key, json.dumps(value)))
