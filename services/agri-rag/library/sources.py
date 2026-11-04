"""Starter shelf (seeds), the monthly check of publisher pages, and import of the old AgriRAG PDFs."""
import json
import re
import shutil
import threading
import time

from . import store
from .config import AUTOSEED, CRAWL_DAYS, INCOMING_DIR, SERVICE_DIR
from .net import fetch_html, pdf_links
from .pipeline import enqueue, precheck_pdf

SOURCES_FILE = SERVICE_DIR / "sources.json"
LEGACY_DIR = SERVICE_DIR / "processed_data"
_check_lock = threading.Lock()


def load_sources() -> dict:
    try:
        return json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"[library] sources.json unreadable: {e}", flush=True)
        return {"seeds": [], "crawl": []}


def queue_url(url: str, origin: str, source: str, hints: dict, user: dict = None) -> dict:
    store.mark_url(url, source)
    j = enqueue(kind="url", url=url, origin=origin, hints=hints, original_name=hints.get("title") or url.rsplit("/", 1)[-1],
                user_id=(user or {}).get("id", ""), user_name=(user or {}).get("name", ""))
    store.run("UPDATE seen_urls SET job_id=? WHERE url=?", (j["id"], url))
    return j


def seed() -> int:
    n = 0
    for s in load_sources().get("seeds", []):
        url = s.get("url")
        if not url or store.url_seen(url):
            continue
        hints = {k: s.get(k, "") for k in ("publisher", "year", "category", "title")}
        hints["title_override"] = s.get("title", "")
        queue_url(url, "seed", "seed", hints)
        n += 1
    return n


def import_legacy() -> int:
    """The PDFs the old AgriRAG had processed become library books (once)."""
    if store.get_setting("legacy_imported"):
        return 0
    n = 0
    for pdf in sorted(LEGACY_DIR.glob("*.pdf")) if LEGACY_DIR.exists() else []:
        try:
            pre = precheck_pdf(str(pdf))
            if pre.get("dup"):
                continue
            dest = INCOMING_DIR / f"legacy_{pdf.name}"
            shutil.copy2(pdf, dest)
            enqueue(kind="file", file_path=str(dest), sha256=pre["sha"], original_name=pdf.name, origin="legacy",
                    user_name="AgriQNet", hints={"publisher": ""})
            n += 1
        except Exception as e:  # noqa: BLE001
            print(f"[library] legacy import skipped {pdf.name}: {e}", flush=True)
    store.set_setting("legacy_imported", True)
    return n


def check_sources(force: bool = False) -> dict:
    """Look at each listing page; queue up to max_new PDFs not seen before. Returns a report."""
    if not _check_lock.acquire(blocking=False):
        return {"running": True}
    try:
        report = []
        for src in load_sources().get("crawl", []):
            entry = {"name": src["name"], "url": src["url"], "new": 0}
            try:
                html = fetch_html(src["url"])
                links = pdf_links(html, src["url"])
                if src.get("include"):
                    links = [l for l in links if re.search(src["include"], l["url"] + " " + l["label"])]
                entry["found"] = len(links)
                for link in links:
                    if entry["new"] >= int(src.get("max_new", 2)):
                        break
                    seen = store.q("SELECT source FROM seen_urls WHERE url=?", (link["url"],))
                    # "Check now" (force) may add items that were only remembered as a baseline
                    if (seen and not (force and seen[0]["source"] == "baseline")) or store.find_book_by("source_url", link["url"]):
                        continue
                    if seen:
                        store.run("DELETE FROM seen_urls WHERE url=?", (link["url"],))
                    hints = {"publisher": src.get("publisher", ""), "category": src.get("category", ""),
                             "title": link["label"][:120] if len(link["label"]) > 8 else ""}
                    queue_url(link["url"], "crawl", src["name"], hints)
                    entry["new"] += 1
            except Exception as e:  # noqa: BLE001
                entry["error"] = str(e)[:200]
            report.append(entry)
        result = {"checkedAt": time.time(), "sources": report}
        store.set_setting("last_check", result)
        print(f"[library] source check: {sum(e['new'] for e in report)} new item(s)", flush=True)
        return result
    finally:
        _check_lock.release()


def _scheduler() -> None:
    time.sleep(20)                       # let the service finish starting
    if AUTOSEED:
        print(f"[library] seeds queued: {seed()}", flush=True)
        print(f"[library] old AgriRAG PDFs queued: {import_legacy()}", flush=True)
    while True:
        last = (store.get_setting("last_check") or {}).get("checkedAt", 0)
        if AUTOSEED and CRAWL_DAYS > 0 and time.time() - last > CRAWL_DAYS * 86400:
            # first ever check only remembers what's already on the pages (the starter shelf covers them);
            # from then on, anything new that appears gets added
            if not last and not store.get_setting("crawl_baseline"):
                baseline()
            else:
                check_sources()
        time.sleep(6 * 3600)


def baseline() -> None:
    """Mark everything currently listed as seen, so the monthly check only adds NEW publications."""
    for src in load_sources().get("crawl", []):
        try:
            for link in pdf_links(fetch_html(src["url"]), src["url"]):
                store.mark_url(link["url"], "baseline")
        except Exception as e:  # noqa: BLE001
            print(f"[library] baseline {src['name']}: {e}", flush=True)
    store.set_setting("crawl_baseline", True)
    store.set_setting("last_check", {"checkedAt": time.time(), "sources": [], "baseline": True})


def start_scheduler() -> None:
    threading.Thread(target=_scheduler, name="library-sources", daemon=True).start()
