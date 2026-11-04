# Farmer Library (AgriRAG) — port 8003

Farmers and officers add farming PDFs or article links. Each one becomes a **book** with:
- a cover;
- a title, summary and suggested questions in English, Hindi, Kannada and Telugu;
- its own search index.

Anyone can chat with **one book** or **the whole library**. Answers come in the language chosen in the navbar, with book and page citations. The web app shows it as **Farmer Library** (`apps/web/components/Library.tsx`, and **Ask → From Farmer Library**), through the gateway at `/api/library/*`.

> New to RAG? Read **[How AgriRAG works](docs/HOW-AGRIRAG-WORKS.md)** first: the concepts, why it exists, and the full pipeline, with diagrams.

## Pipeline

```
upload / link / source PDF
  │
  ├─ checking   sha256 of the bytes ─────────────┐
  │             normalised-text sha256 ──────────┼─► duplicate? → open the existing book's chat
  │             MinHash (5-word shingles, J≥0.85)┘
  ├─ reading    PyMuPDF text layer, headings from font size, header/footer removal,
  │             ligature repair, legacy Nudi/Baraha Kannada → Unicode, Kruti Dev & other
  │             unconvertible fonts skipped, OCR only if Tesseract is installed
  ├─ topic      one LLM call: is it about farming? + title/summary/questions in en/hi/kn/te,
  │             category, publisher, year, crops, cover idea   (keyword fallback offline)
  ├─ indexing   ~1,100-char page-aware chunks with section headings
  │             → multilingual-e5-base vectors + BM25 (one small index per book)
  ├─ cover      AI art (Gemini image / HF FLUX if configured) → printed front cover →
  │             best photo in the PDF → designed cover drawn by the app
  └─ ready
```

**Asking a question**
1. A fast LLM rewrites the question as a standalone English query plus keywords, using the chat history.
2. Both queries are searched with vectors and with BM25 in each selected book; the results are combined with Reciprocal Rank Fusion.
3. The `mmarco-mMiniLMv2` multilingual cross-encoder reranks the 40 best passages.
4. The top 8 passages go to the LLM (Groq `GROQ_MODEL`, with Gemini as fallback). It answers in the reader's language and cites `[n]`.

Without any LLM key, the app shows the matching passages instead of a written answer.

**Why one index per book?** "Ask this book" can only ever see that book. Hiding or adding a book never rewrites any other index. A laptop-sized library fits in memory, so exact search is fast with no index tuning.

## Starter shelf and monthly check

`sources.json` lists:
- **seeds**, queued once on first start when `LIBRARY_AUTOSEED=true` (currently off; the same PDFs are in `library-sources/` for manual upload):
  - ICAR: Annual Report and Highlights 2025-26, Kharif advisories, Farmers' Innovations, Acid Soils, Khet Bachaao Abhiyaan, Indigenous Technical Knowledge, VKSA Insights
  - UAS Bengaluru: Package of Practices 2025 (Kannada) and Technologies 2000-2025
  - DES: *Agricultural Situation in India*
- **crawl pages**, checked every `LIBRARY_CRAWL_DAYS` days (currently 0 = off):
  - ICAR: annual reports, e-books, other reports
  - DES: Agricultural Situation in India (quarterly since 2025) and the monthly bulletin
  - UAS Bengaluru publications

The first check only remembers what is already listed. After that, new PDFs are added automatically, up to `max_new` per page. Officers can press **Check for new reports** in the library at any time.

When automatic adding is on, the PDFs the old AgriRAG had in `processed_data/` are imported once as books. Turning it off stops anything it had already queued.

## Settings (`agriqnet-platform/.env`)

| Key | Default | Meaning |
|---|---|---|
| `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_FAST_MODEL` | –, `openai/gpt-oss-120b`, `openai/gpt-oss-20b` | answers / query rewriting |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | – | fallback LLM |
| `RAG_EMBED_MODEL` | `intfloat/multilingual-e5-base` | `…-e5-small` for slow PCs, `BAAI/bge-m3` for strong ones (re-add books after changing) |
| `RAG_RERANK_MODEL` | `cross-encoder/mmarco-mMiniLMv2-L12-H384-v1` | `none` to switch off |
| `COVER_AI` | `auto` | `auto` / `gemini` / `hf` / `none` |
| `GEMINI_IMAGE_MODEL` | – | e.g. `gemini-2.5-flash-image` (needs a billed key) |
| `HF_TOKEN` | – | free Hugging Face token → FLUX.1-schnell cover art |
| `LIBRARY_DIR` | `%LOCALAPPDATA%\AgriQNet\library` | books, indices, covers, `library.db` |
| `LIBRARY_MAX_MB`, `LIBRARY_MAX_PAGES` | 80, 600 | upload limits |
| `LIBRARY_AUTOSEED` | false | `true` = queue the starter shelf on first start (PDFs are also in `library-sources/` for manual upload) |
| `LIBRARY_CRAWL_DAYS` | 0 | e.g. 30 = check publisher pages monthly; 0 = never |
| `LIBRARY_NEAR_DUP` | 0.85 | MinHash Jaccard threshold for "almost the same document" |

## API (called by the gateway, which adds `X-User-Id/Name/Role`)

| Method | Path | |
|---|---|---|
| GET | `/library/books` (`?all=true` for officers) | books + processing queue + last source check |
| GET | `/library/books/{id}`, `/cover` (`?kind=page`), `/file` | details, cover image, the PDF |
| POST | `/library/upload` (multipart `file`) | → `{status:"duplicate", book}` or `{status:"queued", job}` |
| POST | `/library/url` `{url}` | PDF or article link |
| POST | `/library/jobs/{id}/cancel` (uploader or officer), `/library/jobs/cancel-automatic` (officer) | stop processing |
| GET | `/library/jobs/{id}`, `/library/jobs` | progress: `queued → download → checking → reading → topic → indexing → cover → ready` |
| POST | `/library/books/{id}/hide` `{hidden}` | officers only |
| POST | `/library/sources/check` | officers only |
| POST | `/library/chat` `{message, lang, bookIds (null = all), history}` | `{answer, sources:[{n, bookId, page, title, snippet}]}` |
| POST | `/chat`, GET `/processed` | old AgriRAG endpoints, still answered |

Run it alone with `python app.py`. The data folder is printed at start.
