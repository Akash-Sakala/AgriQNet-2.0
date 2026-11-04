"""Page-aware chunking: ~1,100-character chunks that keep their page number and section heading."""
import re

TARGET = 1100
HARD_MAX = 1700


def _split_long(par: str) -> list:
    if len(par) <= HARD_MAX:
        return [par]
    out, buf = [], ""
    for s in re.split(r"(?<=[.!?।॥])\s+", par):
        while len(s) > HARD_MAX:                  # no sentence breaks at all (tables, lists)
            if buf:
                out.append(buf.strip())
                buf = ""
            out.append(s[:TARGET])
            s = s[TARGET:]
        if len(buf) + len(s) > TARGET and buf:
            out.append(buf.strip())
            buf = ""
        buf += s + " "
    if buf.strip():
        out.append(buf.strip())
    return out


def chunk_pages(pages: list) -> list:
    """pages: [{page, text}] with '## ' heading lines -> [{i, page, section, text}]"""
    chunks: list = []
    buf: list = []          # [(page, text)]
    section, chunk_section = "", ""

    def size() -> int:
        return sum(len(t) for _, t in buf)

    def emit(keep_tail: bool) -> None:
        nonlocal buf
        text = "\n".join(t for _, t in buf).strip()
        if len(text) >= 60:
            chunks.append({"page": buf[0][0], "section": chunk_section, "text": text})
        tail = buf[-1] if keep_tail and buf and len(buf[-1][1]) < 250 and len(buf) > 1 else None
        buf = [tail] if tail else []

    for p in pages:
        for raw in re.split(r"\n\s*\n", p["text"]):
            par = raw.strip()
            if not par:
                continue
            if par.startswith("## "):
                lines = par.split("\n")
                heading = lines[0][3:].strip()
                if buf and size() > TARGET * 0.4:
                    emit(keep_tail=False)
                section = heading[:150]
                par = "\n".join([heading] + [l[3:] if l.startswith("## ") else l for l in lines[1:]])
            for piece in _split_long(par):
                if buf and size() + len(piece) > TARGET:
                    emit(keep_tail=True)
                if not buf:
                    chunk_section = section
                buf.append((p["page"], piece))
    if buf:
        emit(keep_tail=False)
    for i, c in enumerate(chunks):
        c["i"] = i
    return chunks
