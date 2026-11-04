"""Turn PDFs and web articles into clean page text, plus cover pictures.

* PyMuPDF reads the text layer directly (≈1 s per 200 pages, no GPU, no model).
* Headings are found from font sizes and kept as "## " lines, so chunks know their section.
* Karnataka government PDFs often use the legacy Nudi/Baraha Kannada fonts, whose text layer is
  ASCII garbage ("PÀÈ¶"). Spans in those fonts are converted to real Kannada Unicode.
* Running headers/footers that repeat on most pages are removed.
* Scanned pages (no text layer) are OCR'd only when Tesseract is installed.
"""
import io
import re
import shutil
import statistics
import unicodedata
from collections import Counter
from typing import Callable, Optional

import pymupdf
from PIL import Image, ImageFilter, ImageStat

try:
    from kannada_converter import ascii_to_unicode as _nudi_to_unicode
except Exception:  # noqa: BLE001 - optional dependency
    _nudi_to_unicode = None

pymupdf.TOOLS.mupdf_display_errors(False)

LEGACY_KANNADA_FONT = re.compile(r"nudi|brh|baraha|kedage|mallige", re.I)
# Old non-Unicode fonts we cannot convert yet (Hindi Kruti Dev / DevLys / Chanakya, Punjabi AnmolLipi,
# Shree-Lipi). Their text layer is gibberish ("fdlkuksa ds fy,"), so it is left out of the index.
UNSUPPORTED_FONT = re.compile(r"kruti|devlys|chanakya|walkman|anmol|shree[-_ ]?|shreelipi|^agra|dv-tt|kundli", re.I)
ZW = re.compile("[​‍﻿]")


def garbled(text: str) -> bool:
    """Text from an old font we cannot convert (Kruti Dev, Shree-Lipi, broken CID maps) looks like
    "Hkkd`vuqi" or "PÜ ¸æÙæ": lots of Latin-1 symbols / odd consonant runs. Such chunks only add noise."""
    letters = [c for c in text if c.isalpha()]
    if len(letters) < 40:
        return False
    latin1 = sum(1 for c in letters if "\u00c0" <= c <= "\u00ff") / len(letters)
    ascii_words = re.findall(r"[A-Za-z`'\[\]{}\\|~^]+", text)
    weird = sum(1 for w in ascii_words if len(w) > 3 and not re.search(r"[aeiouAEIOU]", w) or re.search(r"[`\[\]{}|~^]", w))
    if latin1 > 0.25 or (len(ascii_words) > 20 and weird / len(ascii_words) > 0.35):
        return True
    # Kruti Dev Hindi hidden behind a generic font name: "ds", "dh", "esa", "vkSj" are के, की, में, और
    words = re.findall(r"\S+", text)
    kruti = sum(1 for w in words if w.strip(".,;:()") in KRUTI_MARKERS)
    return len(words) >= 20 and kruti / len(words) > 0.06


KRUTI_MARKERS = {"ds", "dh", "dk", "esa", "vkSj", "gS", "gSa", "djsa", "ls", "ij", "fy,", "rFkk", ";k", "ugha", "fd", "bl", "dks", "tks", "Hkh"}


def is_pdf(path: str) -> bool:
    with open(path, "rb") as f:
        return f.read(1024).lstrip().startswith(b"%PDF")


def open_pdf(path: str) -> pymupdf.Document:
    doc = pymupdf.open(path)
    if doc.needs_pass:
        raise ValueError("This PDF is password-protected.")
    if doc.page_count == 0:
        raise ValueError("This PDF has no pages.")
    return doc


def quick_text(doc: pymupdf.Document, max_pages: int) -> str:
    """Raw text layer, used only for duplicate fingerprints (fast and stable)."""
    return "\n".join(doc[i].get_text() for i in range(min(doc.page_count, max_pages)))


def _fix_legacy(text: str) -> str:
    if _nudi_to_unicode is None:
        return text
    try:
        return _nudi_to_unicode(text)
    except Exception:  # noqa: BLE001
        return text


def clean(text: str) -> str:
    text = unicodedata.normalize("NFC", ZW.sub("", text))
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)          # join hyphenated line breaks
    text = re.sub(r"(?:\s?[.·…_]){4,}\s?", " … ", text)       # table-of-contents dot leaders
    text = re.sub(r"[ \t ]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def ocr_available() -> bool:
    return shutil.which("tesseract") is not None


def extract_pdf(doc: pymupdf.Document, max_pages: int, progress: Optional[Callable[[float], None]] = None) -> dict:
    n = min(doc.page_count, max_pages)
    # 1) body font size (median over a sample of pages) -> heading threshold
    sizes = []
    for i in range(0, n, max(1, n // 25)):
        for b in doc[i].get_text("dict", flags=0)["blocks"]:
            for line in b.get("lines", []):
                for s in line["spans"]:
                    if s["text"].strip():
                        sizes.append(round(s["size"], 1))
    body = statistics.median(sizes) if sizes else 10.0

    pages, legacy_spans, unsupported_spans, ocr_pages, empty_pages = [], 0, 0, 0, 0
    cover_title = _cover_title(doc)
    can_ocr = ocr_available()
    for i in range(n):
        page = doc[i]
        lines_out = []
        for b in page.get_text("dict", flags=pymupdf.TEXT_DEHYPHENATE)["blocks"]:
            for line in b.get("lines", []):
                parts, big = [], 0.0
                for s in line["spans"]:
                    t = s["text"]
                    if not t.strip():
                        parts.append(t)
                        continue
                    font = s.get("font", "").split("+")[-1]
                    if UNSUPPORTED_FONT.search(font):
                        unsupported_spans += 1
                        continue
                    if LEGACY_KANNADA_FONT.search(font):
                        t = _fix_legacy(t)
                        legacy_spans += 1
                    parts.append(t)
                    big = max(big, s["size"])
                txt = "".join(parts).strip()
                if not txt:
                    continue
                if big >= body * 1.3 and len(txt) < 120 and re.search(r"[^\W\d_]{3,}", txt):
                    txt = "## " + txt
                lines_out.append(txt)
            lines_out.append("")
        for k in range(len(lines_out) - 1):        # drop caps: "T" + "HE spirit of…" -> "THE spirit of…"
            if len(lines_out[k]) == 1 and lines_out[k].isupper():
                nxt = next((j for j in range(k + 1, min(k + 10, len(lines_out))) if lines_out[j].strip()), None)
                if nxt is not None and lines_out[nxt][:1].isalpha():
                    lines_out[nxt] = lines_out[k] + lines_out[nxt].lstrip("# ")
                    lines_out[k] = ""
        text = "\n".join(lines_out)
        if len(text.strip()) < 25:
            empty_pages += 1
            if can_ocr and page.get_images():
                try:
                    tp = page.get_textpage_ocr(language="eng", dpi=200, full=True)
                    text = page.get_text(textpage=tp)
                    ocr_pages += 1
                except Exception:  # noqa: BLE001
                    pass
        pages.append({"page": i + 1, "text": text})
        if progress and i % 10 == 0:
            progress(i / n)

    _drop_running_lines(pages)
    _fix_ligatures(pages)
    for p in pages:
        p["text"] = clean(p["text"])
    toc = [(lvl, _fix_legacy(t) if LEGACY_KANNADA_FONT.search(t or "") else t, pg) for lvl, t, pg in doc.get_toc()][:80]
    return {
        "pages": pages,
        "page_count": doc.page_count,
        "used_pages": n,
        "legacy_kannada": legacy_spans > 0,
        "legacy_unsupported": unsupported_spans,
        "ocr_pages": ocr_pages,
        "empty_pages": empty_pages,
        "toc": toc,
        "pdf_title": _meta_title((doc.metadata or {}).get("title") or ""),
        "cover_title": cover_title,
    }


def _meta_title(t: str) -> str:
    """PDF metadata titles are often file names ("New_English__REPORT - Copy copy"); tidy or drop them."""
    t = re.sub(r"\.(docx?|pdf|indd|cdr)$", "", t.strip(), flags=re.I)
    t = re.sub(r"(?i)\b(copy|final|new|english|untitled|microsoft word)\b", " ", t.replace("_", " "))
    t = re.sub(r"\s*-\s*$|^\s*-\s*", "", re.sub(r"\s+", " ", t)).strip(" -")
    return t if len(t) >= 6 and re.search(r"[^\W\d_]{3,}", t) else ""


def _cover_title(doc: pymupdf.Document) -> str:
    """Largest text on the first page(s) — usually the printed title."""
    for i in range(min(2, doc.page_count)):
        spans = []
        for b in doc[i].get_text("dict", flags=0)["blocks"]:
            for line in b.get("lines", []):
                for sp in line["spans"]:
                    t = sp["text"].strip()
                    font = sp.get("font", "").split("+")[-1]
                    if len(t) >= 2 and re.search(r"[^\W\d_]", t) and not UNSUPPORTED_FONT.search(font):
                        if LEGACY_KANNADA_FONT.search(font):
                            t = _fix_legacy(t)
                        spans.append((round(sp["size"]), sp["bbox"][1], t))
        if not spans:
            continue
        sizes = sorted({s for s, _, _ in spans}, reverse=True)[:2]
        parts = [t for s, y, t in sorted(spans, key=lambda x: x[1]) if s in sizes]
        title = re.sub(r"\s+", " ", " ".join(parts)).strip()
        if 6 <= len(title) <= 120 and not garbled(title * 3):
            return title
    return ""


LIGATURES = ("fi", "fl", "ff", "ffi", "ffl", "f", "ft", "tt", "th")


def _fix_ligatures(pages: list) -> None:
    """Fonts without a ToUnicode entry for ligatures give "�eld" / "ﬁeld". Pick the ligature that turns
    the word into one that appears elsewhere in the same document (default "fi")."""
    for p in pages:
        p["text"] = unicodedata.normalize("NFKC", p["text"]) if any(ch in p["text"] for ch in "ﬀﬁﬂﬃﬄ") else p["text"]
    if not any("\ufffd" in p["text"] for p in pages):
        return
    vocab = Counter(w.lower() for p in pages for w in re.findall(r"[A-Za-z]{3,}", p["text"]))

    def fix(m: re.Match) -> str:
        word = m.group(0)
        best, best_n = None, 0
        for lig in LIGATURES:
            cand = word.replace("\ufffd", lig)
            n = vocab.get(cand.lower(), 0)
            if n > best_n:
                best, best_n = cand, n
        return best or word.replace("\ufffd", "fi")

    for p in pages:
        if "\ufffd" in p["text"]:
            p["text"] = re.sub(r"[A-Za-z]*\ufffd[A-Za-z\ufffd]*", fix, p["text"])


def _drop_running_lines(pages: list) -> None:
    """Remove header/footer lines that repeat on more than 40 % of pages (titles, page furniture)."""
    if len(pages) < 6:
        return
    def key(line: str) -> str:
        return re.sub(r"\d+", "#", line.strip().lstrip("# ").lower())
    counts = Counter()
    for p in pages:
        lines = [l for l in p["text"].split("\n") if l.strip()]
        for l in set(lines[:3] + lines[-3:]):
            if len(l) < 90:
                counts[key(l)] += 1
    common = {k for k, c in counts.items() if c > 0.4 * len(pages) and k not in ("", "#")}
    if not common:
        return
    for p in pages:
        p["text"] = "\n".join(l for l in p["text"].split("\n") if key(l) not in common or len(l) >= 90)


# ---------- web articles ----------
def extract_article(html: str, url: str) -> dict:
    import trafilatura

    data = trafilatura.bare_extraction(html, url=url, with_metadata=True, include_tables=True, favor_recall=True)
    if data is None:
        raise ValueError("Could not find readable article text on that page.")
    d = data if isinstance(data, dict) else data.as_dict()
    text = clean(d.get("text") or "")
    if len(text) < 400:
        raise ValueError("That page has too little text to add as a book.")
    # split long articles into ~2,500-character "pages" so answers can cite a part
    paras, pages, buf = text.split("\n"), [], ""
    for para in paras:
        if len(buf) + len(para) > 2500 and buf:
            pages.append(buf)
            buf = ""
        buf += para + "\n"
    if buf.strip():
        pages.append(buf)
    return {
        "pages": [{"page": i + 1, "text": t.strip()} for i, t in enumerate(pages)],
        "page_count": len(pages), "used_pages": len(pages), "legacy_kannada": False, "ocr_pages": 0, "empty_pages": 0,
        "toc": [], "pdf_title": d.get("title") or "", "image": d.get("image") or "",
        "site": d.get("sitename") or d.get("hostname") or "", "date": d.get("date") or "", "author": d.get("author") or "",
    }


# ---------- cover pictures ----------
def _good_photo(img: Image.Image) -> float:
    """Score a picture: big, colourful, not a logo/chart/blank page."""
    w, h = img.size
    if w < 300 or h < 220 or max(w / h, h / w) > 2.6:
        return 0.0
    small = img.convert("RGB").resize((64, 64))
    stat = ImageStat.Stat(small)
    spread = sum(stat.stddev) / 3                     # contrast
    r, g, b = (c for c in stat.mean)
    colour = abs(r - g) + abs(g - b) + abs(b - r)     # rough colourfulness
    whites = sum(1 for px in small.getdata() if min(px) > 235) / 4096
    edges = ImageStat.Stat(small.convert("L").filter(ImageFilter.FIND_EDGES)).mean[0]
    if spread < 25 or whites > 0.55 or edges < 9:   # blank, mostly white, or a smooth background
        return 0.0
    return (w * h) ** 0.5 * (1 + colour / 120) * (1 - whites)


def to_cover(img: Image.Image, w: int = 600, h: int = 900) -> Image.Image:
    """Centre-crop to a 2:3 book shape."""
    img = img.convert("RGB")
    iw, ih = img.size
    target = w / h
    if iw / ih > target:
        nw = int(ih * target)
        img = img.crop(((iw - nw) // 2, 0, (iw - nw) // 2 + nw, ih))
    else:
        nh = int(iw / target)
        top = max(0, int((ih - nh) * 0.35))
        img = img.crop((0, top, iw, top + nh))
    return img.resize((w, h), Image.LANCZOS)


def pdf_pictures(doc: pymupdf.Document, scan_pages: int = 12) -> dict:
    """The printed front cover (when page 1 looks like one) and the best photo in the first pages."""
    out = {"page": None, "page_is_cover": False, "photo": None}
    try:
        pix = doc[0].get_pixmap(dpi=110)
        page = Image.open(io.BytesIO(pix.tobytes("jpeg")))
        if page.width > page.height * 1.2:          # wrap-around cover (back + front): keep the front half
            page = page.crop((page.width // 2, 0, page.width, page.height))
        out["page"] = page
        out["page_is_cover"] = bool(doc[0].get_images()) and _good_photo(page) > 0
    except Exception:  # noqa: BLE001
        pass
    best, best_score, seen = None, 0.0, set()
    for i in range(min(doc.page_count, scan_pages)):
        for info in doc[i].get_images(full=True):
            xref = info[0]
            if xref in seen:
                continue
            seen.add(xref)
            if info[2] * info[3] < 120_000:
                continue
            try:
                raw = doc.extract_image(xref)
                img = Image.open(io.BytesIO(raw["image"]))
                img.load()
            except Exception:  # noqa: BLE001
                continue
            score = _good_photo(img) * (1.25 if i < 2 else 1.0)
            if score > best_score:
                best, best_score = img, score
    out["photo"] = best
    return out
