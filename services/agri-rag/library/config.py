"""Settings for the Farmer Library (all from the platform .env, with safe defaults)."""
import os
from pathlib import Path

from dotenv import load_dotenv

SERVICE_DIR = Path(__file__).resolve().parent.parent          # services/agri-rag
PLATFORM_ROOT = SERVICE_DIR.parent.parent                      # agriqnet-platform
load_dotenv(PLATFORM_ROOT / ".env")
load_dotenv(SERVICE_DIR / ".env")


def env(key: str, default: str = "") -> str:
    v = os.getenv(key)
    return v if v not in (None, "") else default


def env_int(key: str, default: int) -> int:
    try:
        return int(env(key, str(default)))
    except ValueError:
        return default


def runtime_home() -> Path:
    """Same rule as the launcher: big generated files live outside OneDrive."""
    if env("AGRIQNET_HOME"):
        return Path(env("AGRIQNET_HOME"))
    if os.name == "nt":
        return Path(os.getenv("LOCALAPPDATA") or Path.home() / "AppData" / "Local") / "AgriQNet"
    return Path.home() / ".agriqnet"


LIBRARY_DIR = Path(env("LIBRARY_DIR", str(runtime_home() / "library")))
BOOKS_DIR = LIBRARY_DIR / "books"
INCOMING_DIR = LIBRARY_DIR / "incoming"
DB_PATH = LIBRARY_DIR / "library.db"
for _d in (LIBRARY_DIR, BOOKS_DIR, INCOMING_DIR):
    _d.mkdir(parents=True, exist_ok=True)

# Models. e5-base is a good speed/quality balance on a laptop CPU; use
# intfloat/multilingual-e5-small on slow machines or BAAI/bge-m3 on a strong one.
EMBED_MODEL = env("RAG_EMBED_MODEL", "intfloat/multilingual-e5-base")
RERANK_MODEL = env("RAG_RERANK_MODEL", "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1")  # "none" to disable
EMBED_BATCH = env_int("RAG_EMBED_BATCH", 16)
TORCH_THREADS = env_int("RAG_THREADS", 0)  # 0 = let torch decide

# LLMs: Groq first (fast, generous free tier), Gemini as fallback.
GROQ_API_KEY = env("GROQ_API_KEY")
GROQ_MODEL = env("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_FAST_MODEL = env("GROQ_FAST_MODEL", "openai/gpt-oss-20b")
GEMINI_API_KEY = env("GEMINI_API_KEY")
GEMINI_MODEL = env("GEMINI_MODEL", "gemini-3.5-flash")
LLM_TIMEOUT = env_int("AI_TIMEOUT_MS", 20000) / 1000 * 3  # answers are longer than UI snippets

# Covers: "auto" = AI art when a provider is configured, otherwise a photo from the PDF.
COVER_AI = env("COVER_AI", "auto")                     # auto | gemini | hf | none
GEMINI_IMAGE_MODEL = env("GEMINI_IMAGE_MODEL", "")     # e.g. gemini-2.5-flash-image (needs billing)
HF_TOKEN = env("HF_TOKEN")
HF_IMAGE_MODEL = env("HF_IMAGE_MODEL", "black-forest-labs/FLUX.1-schnell")

# Ingestion limits and the monthly source check
MAX_UPLOAD_MB = env_int("LIBRARY_MAX_MB", 80)
MAX_PAGES = env_int("LIBRARY_MAX_PAGES", 600)
AUTOSEED = env("LIBRARY_AUTOSEED", "false").lower() == "true"     # off: upload library-sources/ by hand
CRAWL_DAYS = env_int("LIBRARY_CRAWL_DAYS", 0)           # e.g. 30 = check sources monthly; 0 = never
NEAR_DUP_JACCARD = float(env("LIBRARY_NEAR_DUP", "0.85"))

LANGS = {"en": "English", "hi": "Hindi", "kn": "Kannada", "te": "Telugu"}
