"""Question answering over one book, a few books or the whole library.

1. Understand the question (fast LLM): a standalone English search query + keywords, using the
   chat history to resolve "it"/"that crop". Farmers can ask in Kannada, Hindi, Telugu or English;
   most source documents are English, so searching in English as well fixes cross-language misses.
2. Hybrid search in every selected book: dense vectors (original + English query) and BM25 keywords,
   fused with Reciprocal Rank Fusion.
3. A multilingual cross-encoder reranks the best 40 passages; the top 8 go to the LLM.
4. The LLM answers in the reader's language, citing passages as [1], [2] … ; the app shows those
   as book + page chips that open the PDF at that page.
"""
import re
import time
from collections import defaultdict

import numpy as np

from . import llm, store
from .config import LANGS
from .embed import encode_queries, rerank
from .index import load_index, tokenize

RRF_K = 60
PER_LIST = 30
CANDIDATES = 40
CONTEXT = 8

UNDERSTAND = """You prepare search queries for a farmers' document library (Indian agriculture).
Given the recent chat and the farmer's latest message (any language), return ONLY JSON:
{"query_en": "a standalone English search query that resolves pronouns from the chat",
 "keywords": ["4-10 English search keywords: crop, pest, disease, practice, synonyms, scientific and local names"],
 "small_talk": true only for greetings/thanks with no question}"""

ANSWER = """You are AgriQNet's library assistant. Farmers ask questions about books in their digital library.
Answer ONLY from the numbered sources. Rules:
- Write the whole answer in {language}, in simple everyday words a farmer understands. Keep numbers, units
  (kg/ha, ml/litre), product and scientific names as they are.
- Be practical: short paragraphs or bullet points; doses, timings and steps when the sources give them.
- After each fact, cite its source number in square brackets, e.g. [2]. Cite only numbers that exist.
- If the sources do not answer the question, say so plainly in {language} and suggest asking the local
  Krishi Vigyan Kendra / agriculture officer. Never invent doses or chemical names.
- Do not mention "sources" or "context" in other words; just answer and cite."""

NO_ANSWER = {
    "en": "I could not find this in the selected book(s). Please try other words, or ask your local agriculture officer.",
    "hi": "चुनी गई किताब में यह जानकारी नहीं मिली। कृपया दूसरे शब्दों में पूछें या अपने कृषि अधिकारी से संपर्क करें।",
    "kn": "ಆಯ್ಕೆ ಮಾಡಿದ ಪುಸ್ತಕದಲ್ಲಿ ಈ ಮಾಹಿತಿ ಸಿಗಲಿಲ್ಲ. ಬೇರೆ ಪದಗಳಲ್ಲಿ ಕೇಳಿ ಅಥವಾ ನಿಮ್ಮ ಕೃಷಿ ಅಧಿಕಾರಿಯನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    "te": "ఎంచుకున్న పుస్తకంలో ఈ సమాచారం దొరకలేదు. వేరే మాటలతో అడగండి లేదా మీ వ్యవసాయ అధికారిని సంప్రదించండి.",
}
EXTRACTIVE = {
    "en": "The AI writer is not available right now. These passages from the book(s) match your question:",
    "hi": "अभी AI उत्तर उपलब्ध नहीं है। किताब के ये अंश आपके प्रश्न से मेल खाते हैं (अंग्रेज़ी में):",
    "kn": "ಈಗ AI ಉತ್ತರ ಲಭ್ಯವಿಲ್ಲ. ಪುಸ್ತಕದ ಈ ಭಾಗಗಳು ನಿಮ್ಮ ಪ್ರಶ್ನೆಗೆ ಹೊಂದುತ್ತವೆ (ಮೂಲ ಭಾಷೆಯಲ್ಲಿ):",
    "te": "ప్రస్తుతం AI సమాధానం అందుబాటులో లేదు. పుస్తకంలోని ఈ భాగాలు మీ ప్రశ్నకు సరిపోతాయి (మూల భాషలో):",
}


def understand(message: str, history: list) -> dict:
    if not llm.available():
        return {"query_en": message, "keywords": [], "small_talk": False}
    convo = "\n".join(f"{h.get('role', 'user')}: {str(h.get('text', ''))[:400]}" for h in history[-6:])
    try:
        out = llm.complete_json(UNDERSTAND, f"Chat so far:\n{convo or '(none)'}\n\nLatest message: {message}", fast=True, max_tokens=400)
        out["query_en"] = str(out.get("query_en") or message)[:400]
        out["keywords"] = [str(k) for k in (out.get("keywords") or [])][:10]
        return out
    except Exception as e:  # noqa: BLE001
        print(f"[library] query understanding failed: {e}", flush=True)
        return {"query_en": message, "keywords": [], "small_talk": False}


def search(book_ids: list, queries: list, keyword_text: str, k: int = CONTEXT) -> list:
    """Hybrid retrieval across books -> top-k passages [{book_id, i, page, section, text, score}]."""
    qvecs = encode_queries(queries)
    toks = tokenize(" ".join(queries) + " " + keyword_text)
    fused = defaultdict(float)
    for bid in book_ids:
        try:
            idx = load_index(bid)
        except FileNotFoundError:
            continue
        lists = [idx.dense(qv, PER_LIST) for qv in qvecs] + [idx.bm25(toks, PER_LIST)]
        for lst in lists:
            for rank, (i, _) in enumerate(lst):
                fused[(bid, i)] += 1.0 / (RRF_K + rank + 1)
    if not fused:
        return []
    cands = sorted(fused.items(), key=lambda x: -x[1])[:CANDIDATES]
    hits = []
    for (bid, i), s in cands:
        c = load_index(bid).chunks[i]
        hits.append({"book_id": bid, "i": i, "page": c["page"], "section": c.get("section", ""), "text": c["text"], "score": s})
    scores = rerank(queries[-1], [f"{h['section']}\n{h['text']}" for h in hits])
    if scores is not None:
        if len(queries) > 1:  # also score against the farmer's own words; keep the better of the two
            scores = np.maximum(scores, rerank(queries[0], [f"{h['section']}\n{h['text']}" for h in hits]))
        for h, s in zip(hits, scores):
            h["rerank"] = float(s)
        hits.sort(key=lambda h: -h["rerank"])
    # drop near-duplicate passages (overlapping chunks), keep order
    out, seen = [], set()
    for h in hits:
        sig = re.sub(r"\W+", "", h["text"][:160].lower())
        if sig in seen:
            continue
        seen.add(sig)
        out.append(h)
        if len(out) >= k:
            break
    return out


def _book_card(b: dict) -> str:
    m = b.get("meta") or {}
    return (f"- {m.get('title', {}).get('en') or b.get('title')} ({b.get('publisher') or 'unknown publisher'}"
            f"{', ' + b['year'] if b.get('year') else ''}): {m.get('summary', {}).get('en', '')}")


def answer(message: str, lang: str, book_ids: list, history: list) -> dict:
    t0 = time.time()
    lang = lang if lang in LANGS else "en"
    books = {b["id"]: b for b in store.list_books() if not book_ids or b["id"] in book_ids}
    if not books:
        return {"answer": NO_ANSWER[lang], "sources": [], "timing": {}}
    u = understand(message, history)
    queries = [message] if u["query_en"].strip().lower() == message.strip().lower() else [message, u["query_en"]]
    t1 = time.time()
    hits = search(list(books), queries, " ".join(u.get("keywords", [])))
    t2 = time.time()

    sources = []
    for n, h in enumerate(hits, 1):
        b = books[h["book_id"]]
        title = (b.get("meta") or {}).get("title", {}) or {}
        sources.append({"n": n, "bookId": h["book_id"], "page": h["page"], "section": h["section"],
                        "title": title.get(lang) or title.get("en") or b.get("title"), "titleEn": title.get("en") or b.get("title"),
                        "snippet": re.sub(r"\s+", " ", h["text"])[:260], "kind": b.get("kind"), "sourceUrl": b.get("source_url")})
    if not hits:
        return {"answer": NO_ANSWER[lang], "sources": [], "queryEn": u["query_en"], "timing": {"understand": t1 - t0}}

    if not llm.available():
        body = "\n\n".join(f"> {s['snippet']}… [{s['n']}]" for s in sources[:3])
        return {"answer": f"{EXTRACTIVE[lang]}\n\n{body}", "sources": sources[:3], "queryEn": u["query_en"], "extractive": True}

    ctx = "\n\n".join(
        f"[{n}] {books[h['book_id']]['title']} — page {h['page']}{' — ' + h['section'] if h['section'] else ''}\n{h['text']}"
        for n, h in enumerate(hits, 1))
    cards = "\n".join(_book_card(books[b]) for b in dict.fromkeys(h["book_id"] for h in hits))
    convo = "\n".join(f"{h.get('role', 'user')}: {str(h.get('text', ''))[:500]}" for h in history[-4:])
    user = (f"Books:\n{cards}\n\nSources:\n{ctx}\n\nRecent chat:\n{convo or '(none)'}\n\n"
            f"Farmer's question: {message}\n(English meaning: {u['query_en']})")
    try:
        text = llm.complete(ANSWER.format(language=LANGS[lang]), user, max_tokens=1600, temperature=0.2)
    except Exception as e:  # noqa: BLE001
        body = "\n\n".join(f"> {s['snippet']}… [{s['n']}]" for s in sources[:3])
        return {"answer": f"{EXTRACTIVE[lang]}\n\n{body}", "sources": sources[:3], "queryEn": u["query_en"], "extractive": True, "error": str(e)[:200]}
    cited = sorted({int(n) for n in re.findall(r"\[(\d+)\]", text) if 0 < int(n) <= len(sources)})
    used = [s for s in sources if s["n"] in cited] or sources[:3]
    return {"answer": text.strip(), "sources": used, "queryEn": u["query_en"],
            "timing": {"understand": round(t1 - t0, 2), "search": round(t2 - t1, 2), "total": round(time.time() - t0, 2)}}
