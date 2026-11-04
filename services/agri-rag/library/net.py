"""Downloads for seeds, the monthly source check and pasted links."""
import os
import re
import ssl
import tempfile
import threading
from urllib.parse import urljoin, urlparse

import requests

from .config import INCOMING_DIR, MAX_UPLOAD_MB

try:  # use the operating system's certificate store (Windows fills in missing intermediate
    import truststore  # certificates, which several .gov.in sites need)
    truststore.inject_into_ssl()
except Exception:  # noqa: BLE001
    pass

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
}


class TooBig(Exception):
    pass


# Some government sites send their certificate without the intermediate certificate. Browsers fetch
# the missing one from the "CA Issuers" link inside the certificate (AIA); Python does not. We do the
# same here and still verify the whole chain against the normal trusted roots.
_aia_bundles: dict = {}
_aia_lock = threading.Lock()


def _aia_bundle(host: str):
    with _aia_lock:
        if host in _aia_bundles:
            return _aia_bundles[host]
        from cryptography import x509
        from cryptography.hazmat.primitives.serialization import Encoding
        from cryptography.x509.oid import AuthorityInformationAccessOID, ExtensionOID

        leaf = x509.load_pem_x509_certificate(ssl.get_server_certificate((host, 443), timeout=20).encode())
        pems = []
        cert = leaf
        for _ in range(3):                       # walk up at most three missing intermediates
            try:
                aia = cert.extensions.get_extension_for_oid(ExtensionOID.AUTHORITY_INFORMATION_ACCESS).value
            except x509.ExtensionNotFound:
                break
            urls = [d.access_location.value for d in aia if d.access_method == AuthorityInformationAccessOID.CA_ISSUERS]
            if not urls:
                break
            raw = requests.get(urls[0], timeout=20).content
            try:
                cert = x509.load_der_x509_certificate(raw)
            except ValueError:
                cert = x509.load_pem_x509_certificate(raw)
            pems.append(cert.public_bytes(Encoding.PEM).decode())
            if cert.issuer == cert.subject:
                break
        if not pems:
            _aia_bundles[host] = None
            return None
        base = requests.certs.where()
        fd, path = tempfile.mkstemp(suffix=".pem")
        with os.fdopen(fd, "w") as f:
            f.write(open(base, encoding="utf-8").read() + "\n" + "\n".join(pems))
        _aia_bundles[host] = path
        return path


def get(url: str, **kw) -> requests.Response:
    """requests.get that recovers from a missing intermediate certificate (verification stays on)."""
    try:
        return requests.get(url, headers=HEADERS, **kw)
    except requests.exceptions.SSLError:
        bundle = _aia_bundle(urlparse(url).hostname)
        if not bundle:
            raise
        return requests.get(url, headers=HEADERS, verify=bundle, **kw)


def valid_url(url: str) -> bool:
    p = urlparse(url)
    return p.scheme in ("http", "https") and bool(p.netloc)


def download(url: str, max_mb: int = MAX_UPLOAD_MB, progress=None) -> dict:
    """Stream a URL to the incoming folder. Returns {path, content_type, url, is_pdf, html?}."""
    with get(url, stream=True, timeout=(20, 120), allow_redirects=True) as r:
        r.raise_for_status()
        ctype = r.headers.get("content-type", "").split(";")[0].strip().lower()
        total = int(r.headers.get("content-length") or 0)
        if total and total > max_mb * 1024 * 1024:
            raise TooBig(f"The file is {total / 1048576:.0f} MB (limit {max_mb} MB).")
        fd, path = tempfile.mkstemp(dir=INCOMING_DIR, suffix=".download")
        size = 0
        with os.fdopen(fd, "wb") as f:
            for block in r.iter_content(1 << 16):
                size += len(block)
                if size > max_mb * 1024 * 1024:
                    f.close()
                    os.remove(path)
                    raise TooBig(f"The file is larger than {max_mb} MB.")
                f.write(block)
                if progress and total:
                    progress(size / total)
        with open(path, "rb") as f:
            head = f.read(1024)
        is_pdf = head.lstrip().startswith(b"%PDF")
        out = {"path": path, "content_type": ctype, "url": r.url, "is_pdf": is_pdf}
        if not is_pdf:
            enc = r.encoding or "utf-8"
            with open(path, "rb") as f:
                out["html"] = f.read().decode(enc, errors="replace")
        return out


def fetch_html(url: str) -> str:
    r = get(url, timeout=(20, 60))
    r.raise_for_status()
    return r.text


def pdf_links(html: str, base: str, pattern: str = r"\.pdf($|\?)") -> list:
    """All links on a listing page that look like PDFs, absolute, in page order, de-duplicated."""
    seen, out = set(), []
    for m in re.finditer(r"""href\s*=\s*["']([^"']+)["'][^>]*>(.*?)</a>""", html, re.I | re.S):
        href, label = m.group(1).strip(), re.sub(r"<[^>]+>|\s+", " ", m.group(2)).strip()
        if not re.search(pattern, href, re.I):
            continue
        url = urljoin(base, href.replace(" ", "%20"))
        if url not in seen:
            seen.add(url)
            out.append({"url": url, "label": label})
    return out
