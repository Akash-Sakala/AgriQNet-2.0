"""LLM calls: Groq first (fast, OpenAI-compatible), Gemini as fallback. JSON mode supported."""
import json
import re
from typing import Optional

import requests

from .config import GEMINI_API_KEY, GEMINI_MODEL, GROQ_API_KEY, GROQ_FAST_MODEL, GROQ_MODEL, LLM_TIMEOUT

_gemini = None


def available() -> bool:
    return bool(GROQ_API_KEY or GEMINI_API_KEY)


def _groq(model: str, system: str, user: str, as_json: bool, max_tokens: int, temperature: float) -> str:
    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": temperature,
        "max_completion_tokens": max_tokens,
    }
    if as_json:
        body["response_format"] = {"type": "json_object"}
    if model.startswith("openai/gpt-oss"):
        body["reasoning_effort"] = "low"
    r = requests.post("https://api.groq.com/openai/v1/chat/completions", json=body, timeout=LLM_TIMEOUT,
                      headers={"Authorization": f"Bearer {GROQ_API_KEY}"})
    if r.status_code != 200:
        raise RuntimeError(f"Groq {model} HTTP {r.status_code}: {r.text[:200]}")
    return r.json()["choices"][0]["message"]["content"] or ""


def _gemini_call(model: str, system: str, user: str, as_json: bool, max_tokens: int, temperature: float) -> str:
    global _gemini
    from google import genai
    from google.genai import types

    if _gemini is None:
        _gemini = genai.Client(api_key=GEMINI_API_KEY)
    cfg = types.GenerateContentConfig(system_instruction=system, temperature=temperature, max_output_tokens=max_tokens,
                                      response_mime_type="application/json" if as_json else None)
    res = _gemini.models.generate_content(model=model, contents=user, config=cfg)
    return res.text or ""


def complete(system: str, user: str, *, as_json: bool = False, fast: bool = False, max_tokens: int = 1800,
             temperature: float = 0.2) -> str:
    """Try each configured model in turn; raise the last error if all fail."""
    attempts = []
    if GROQ_API_KEY:
        first, second = (GROQ_FAST_MODEL, GROQ_MODEL) if fast else (GROQ_MODEL, GROQ_FAST_MODEL)
        attempts += [("groq", first), ("groq", second)]
    if GEMINI_API_KEY:
        attempts += [("gemini", m) for m in dict.fromkeys([GEMINI_MODEL, "gemini-3.5-flash", "gemini-2.5-flash"])]
    last: Optional[Exception] = None
    for provider, model in attempts:
        try:
            fn = _groq if provider == "groq" else _gemini_call
            out = fn(model, system, user, as_json, max_tokens, temperature)
            if out.strip():
                return out
        except Exception as e:  # noqa: BLE001 - rate limits, retired models, network
            last = e
            print(f"[library] {provider}:{model} failed: {str(e)[:160]}", flush=True)
    raise last or RuntimeError("No GROQ_API_KEY or GEMINI_API_KEY configured")


def complete_json(system: str, user: str, **kw) -> dict:
    raw = complete(system, user, as_json=True, **kw)
    try:
        return json.loads(raw)
    except ValueError:
        m = re.search(r"\{.*\}", raw, re.S)
        if m:
            return json.loads(m.group(0))
        raise
