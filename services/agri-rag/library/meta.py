"""Book metadata in four languages + the "is this about farming?" check (one LLM call per book)."""
import re
from collections import Counter

from . import llm
from .config import LANGS

CATEGORIES = ["reports", "advisories", "crop_guides", "soil_water", "pests_diseases", "livestock",
              "horticulture", "technology", "schemes_markets", "climate", "other"]
DOC_TYPES = ["annual_report", "highlights", "advisory", "manual", "book", "newsletter", "journal", "article", "research", "other"]

AGRI_WORDS = set("""agricultur agronom farm farmer farming crop crops soil soils fertilizer fertiliser manure compost irrigation
seed seeds sowing harvest yield yields pest pests disease diseases insect weed weeds paddy rice wheat maize ragi millet
pulse pulses oilseed cotton sugarcane vegetable vegetables fruit horticulture livestock cattle dairy poultry fishery
fisheries goat sheep veterinary kharif rabi hectare acre icar kvk krishi agro tillage mulch nitrogen phosphorus
potassium npk urea pesticide fungicide insecticide irrigation drip rainfed watershed agromet monsoon grain grains
ಕೃಷಿ ರೈತ ಬೆಳೆ ಮಣ್ಣು ಗೊಬ್ಬರ ಬಿತ್ತನೆ ಕೀಟ ರೋಗ ಭತ್ತ ರಾಗಿ ನೀರಾವರಿ ಇಳುವರಿ
कृषि किसान फसल मिट्टी खाद बीज कीट रोग धान गेहूं सिंचाई उपज
వ్యవసాయ రైతు పంట నేల ఎరువు విత్తనం పురుగు తెగులు వరి నీటిపారుదల దిగుబడి""".split())

SYSTEM = """You catalogue documents for a farmers' digital library in Karnataka, India.
Read the excerpts and return ONLY a JSON object with these keys:
"is_agri": true if the document is mainly about agriculture, farming, crops, soil, water for farming, livestock, fisheries,
  horticulture, agricultural research/extension/education/policy/markets or rural farm livelihoods; false otherwise.
"agri_confidence": probability 0..1 that the document is mainly about agriculture (as defined above),
"reason": one short English sentence,
"title": {"en","hi","kn","te"} – a short clear book title (max 60 characters), translated naturally,
"summary": {"en","hi","kn","te"} – 2 short sentences in simple farmer-friendly words saying what a farmer can learn here,
"questions": {"en","hi","kn","te"} – each a list of 4 short practical questions a farmer could ask this document,
"publisher": short organisation name (e.g. "ICAR", "UAS Bengaluru"), or "",
"year": year or year range printed on the document (e.g. "2025-26"), or "",
"doc_type": one of %s,
"category": one of %s
  (reports = annual reports/highlights/achievements; advisories = seasonal or weather advisories for farmers;
   crop_guides = package of practices / how to grow crops; technology = innovations, machinery, digital farming),
"crops": up to 8 crop or animal names in English lowercase,
"topics": up to 6 short English topic tags,
"cover_prompt": one English sentence describing a warm, realistic illustration for the book cover (no text, no logos),
"language": main language of the document: "en", "hi", "kn", "te" or "mixed".
Hindi in Devanagari, Kannada in Kannada script, Telugu in Telugu script. Use everyday words, keep units and numbers.""" % (DOC_TYPES, CATEGORIES)


def keyword_agri_score(text: str) -> float:
    words = re.findall(r"[a-zऀ-෿]+", text.lower())
    if not words:
        return 0.0
    hits = sum(1 for w in words if w in AGRI_WORDS or any(w.startswith(a) for a in ("agricultur", "agronom", "horticult", "fertili", "irrigat")))
    return hits / len(words) * 1000      # agricultural words per 1,000 words


def _sample(extracted: dict, budget: int = 9000) -> str:
    pages = [p for p in extracted["pages"] if len(p["text"]) > 200]
    if not pages:
        pages = extracted["pages"]
    head = "\n\n".join(p["text"] for p in pages[:4])[: budget // 2]
    mids = []
    for frac in (0.3, 0.55, 0.8):
        if pages:
            mids.append(pages[min(len(pages) - 1, int(len(pages) * frac))]["text"][:900])
    headings = []
    for p in extracted["pages"]:
        headings += [l[3:] for l in p["text"].split("\n") if l.startswith("## ")]
    toc = [t for _, t, _ in extracted.get("toc", [])]
    common = [h for h, _ in Counter(toc or headings).most_common(40)]
    return (f"PDF TITLE: {extracted.get('pdf_title', '')}\nLARGEST TEXT ON COVER: {extracted.get('cover_title', '')}\nHEADINGS: {' | '.join(common)[:1500]}\n\n"
            f"FIRST PAGES:\n{head}\n\nLATER EXCERPTS:\n" + "\n---\n".join(mids))


def _headings(extracted: dict, n: int = 14) -> list:
    toc = [t.strip() for lvl, t, _ in extracted.get("toc", []) if lvl <= 2 and t.strip()]
    if toc:
        return toc[:n]
    seen, out = set(), []
    for p in extracted["pages"]:
        for l in p["text"].split("\n"):
            if l.startswith("## "):
                h = l[3:].strip()
                if 6 <= len(h) <= 80 and h.lower() not in seen:
                    seen.add(h.lower())
                    out.append(h)
    return out[:n]


def fallback_meta(extracted: dict, hints: dict, file_name: str) -> dict:
    title = (hints.get("title") or extracted.get("cover_title") or extracted.get("pdf_title")
             or re.sub(r"[_-]+", " ", file_name.rsplit(".", 1)[0]).strip())
    title = title[:70] or "Untitled"
    summary = ""
    for p in extracted["pages"][2:60] or extracted["pages"]:          # skip cover / credits pages
        for par in re.split(r"\n\s*\n", p["text"]):
            par = re.sub(r"\s+", " ", par.replace("## ", "")).strip()
            words = par.split()
            if len(par) > 220 and len(words) > 35 and re.search(r"[.।]\s", par) \
                    and sum(w.isalpha() for w in words) / len(words) > 0.7 and not re.search(r"(?i)copyright|isbn|printed|published by|compiled|editor", par):
                summary = par[:260].rsplit(" ", 1)[0] + "…"
                break
        if summary:
            break
    text = " ".join(p["text"] for p in extracted["pages"][:40])
    score = keyword_agri_score(text)
    return {
        "is_agri": score >= 6, "agri_confidence": min(1.0, score / 12), "reason": f"keyword score {score:.1f}/1000 words",
        "title": {"en": title}, "summary": {"en": summary}, "questions": {"en": []},
        "publisher": hints.get("publisher", ""), "year": hints.get("year", ""), "doc_type": hints.get("doc_type", "other"),
        "category": hints.get("category", "other"), "crops": [], "topics": [], "cover_prompt": "", "language": "en",
    }


def describe(extracted: dict, hints: dict, file_name: str) -> dict:
    """Ask the LLM to catalogue the book; fall back to heuristics when no LLM is reachable."""
    meta = None
    if llm.available():
        hint_txt = ", ".join(f"{k}: {v}" for k, v in hints.items() if v and k in ("title", "publisher", "year", "category"))
        try:
            meta = llm.complete_json(SYSTEM, f"Known details: {hint_txt or 'none'}\nFile name: {file_name}\n\n{_sample(extracted)}",
                                     max_tokens=3500, temperature=0.2)
        except Exception as e:  # noqa: BLE001
            print(f"[library] metadata LLM failed: {e}", flush=True)
    base = fallback_meta(extracted, hints, file_name)
    if not isinstance(meta, dict):
        meta = base
        meta["llm"] = False
    else:
        meta["llm"] = True
        for k, v in base.items():
            meta.setdefault(k, v)
    # normalise shapes
    for k in ("title", "summary", "questions"):
        if not isinstance(meta.get(k), dict):
            meta[k] = {"en": meta.get(k)} if meta.get(k) else dict(base[k])
        meta[k] = {l: v for l, v in meta[k].items() if l in LANGS and v}
        meta[k].setdefault("en", base[k].get("en"))
    meta["questions"] = {l: [q for q in (v if isinstance(v, list) else [v]) if isinstance(q, str)][:4] for l, v in meta["questions"].items()}
    if hints.get("title_override"):
        meta["title"]["en"] = hints["title_override"]
    if meta.get("category") not in CATEGORIES:
        meta["category"] = hints.get("category") if hints.get("category") in CATEGORIES else "other"
    if meta.get("doc_type") not in DOC_TYPES:
        meta["doc_type"] = "other"
    meta["publisher"] = (meta.get("publisher") or hints.get("publisher") or "")[:40]
    meta["year"] = str(meta.get("year") or hints.get("year") or "")[:12]
    meta["crops"] = [str(c).lower() for c in (meta.get("crops") or [])][:8]
    meta["topics"] = [str(c) for c in (meta.get("topics") or [])][:6]
    meta["headings"] = _headings(extracted)
    return meta
