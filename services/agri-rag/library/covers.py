"""Book covers (hybrid).

Order of preference:
  1. AI illustration, when an image provider is configured (COVER_AI=auto|gemini|hf):
       * Gemini image model (GEMINI_IMAGE_MODEL, needs a billed key), or
       * Hugging Face FLUX.1-schnell (HF_TOKEN, free monthly credits).
  2. The printed front cover, when page 1 looks like a designed cover   -> "page"
  3. The best photo inside the first pages                              -> "photo"
  4. Nothing usable -> "none": the app draws a designed cover (category colour + icon + title).
The app always writes the title in the reader's language on top of / below the picture.
"""
import io
from pathlib import Path
from typing import Optional

import requests
from PIL import Image

from .config import COVER_AI, GEMINI_API_KEY, GEMINI_IMAGE_MODEL, HF_IMAGE_MODEL, HF_TOKEN
from .extract import to_cover

STYLE = ("Vertical book-cover illustration for an Indian farmers' library. {subject} "
         "Warm natural light, rich colours, painterly realistic style, Indian rural setting, uncluttered, "
         "no text, no letters, no logos, no watermark.")


def _gemini_image(prompt: str) -> Optional[Image.Image]:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY)
    res = client.models.generate_content(model=GEMINI_IMAGE_MODEL, contents=prompt,
                                         config=types.GenerateContentConfig(response_modalities=["IMAGE"]))
    for cand in res.candidates or []:
        for part in cand.content.parts or []:
            if getattr(part, "inline_data", None) and part.inline_data.data:
                return Image.open(io.BytesIO(part.inline_data.data))
    return None


def _hf_image(prompt: str) -> Optional[Image.Image]:
    r = requests.post(f"https://router.huggingface.co/hf-inference/models/{HF_IMAGE_MODEL}",
                      headers={"Authorization": f"Bearer {HF_TOKEN}"},
                      json={"inputs": prompt, "parameters": {"width": 640, "height": 960, "num_inference_steps": 4}}, timeout=120)
    if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image"):
        raise RuntimeError(f"HF image HTTP {r.status_code}: {r.text[:160]}")
    return Image.open(io.BytesIO(r.content))


def ai_providers() -> list:
    mode = COVER_AI.lower()
    out = []
    if mode in ("auto", "gemini") and GEMINI_API_KEY and GEMINI_IMAGE_MODEL:
        out.append(("gemini", _gemini_image))
    if mode in ("auto", "hf") and HF_TOKEN:
        out.append(("hf", _hf_image))
    return out


def ai_art(meta: dict) -> Optional[Image.Image]:
    subject = meta.get("cover_prompt") or f"A scene about {meta.get('title', {}).get('en', 'farming')}."
    for name, fn in ai_providers():
        try:
            img = fn(STYLE.format(subject=subject))
            if img is not None:
                return img
        except Exception as e:  # noqa: BLE001
            print(f"[library] cover via {name} failed: {str(e)[:160]}", flush=True)
    return None


def make_cover(book_dir: Path, pictures: dict, meta: dict) -> str:
    """Write art.jpg (2:3) and page.jpg (first page); return the cover kind."""
    page = pictures.get("page")
    if page is not None:
        thumb = page.convert("RGB")
        thumb.thumbnail((600, 900))
        thumb.save(book_dir / "page.jpg", quality=85)
    img, kind = ai_art(meta), "art"
    if img is None and page is not None and pictures.get("page_is_cover"):
        img, kind = page, "page"
    if img is None and pictures.get("photo") is not None:
        img, kind = pictures["photo"], "photo"
    if img is None:
        return "none"
    to_cover(img).save(book_dir / "art.jpg", quality=86)
    return kind


def image_from_url(url: str) -> Optional[Image.Image]:
    try:
        r = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0 AgriQNet-Library"})
        if r.status_code == 200 and r.headers.get("content-type", "").startswith("image"):
            img = Image.open(io.BytesIO(r.content))
            img.load()
            return img
    except Exception:  # noqa: BLE001
        pass
    return None
