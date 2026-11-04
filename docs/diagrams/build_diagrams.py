"""Render the README diagrams (docs/diagrams/src/*.mmd) to PNG with Phosphor icons.

Usage (from the repo root):
    npm i --prefix .diagram-tools @phosphor-icons/core @mermaid-js/mermaid-cli
    python docs/diagrams/build_diagrams.py

In the sources, [[icon-name:#RRGGBB]] places a Phosphor duotone icon (https://phosphoricons.com)
in that colour at the top of a node label.
"""
import base64, json, pathlib, re, subprocess, sys, tempfile, shutil

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ICONS = ROOT / ".diagram-tools/node_modules/@phosphor-icons/core/assets/duotone"
_local = ROOT / ".diagram-tools/node_modules/.bin" / ("mmdc.cmd" if sys.platform == "win32" else "mmdc")
MMDC = str(_local) if _local.exists() else shutil.which("mmdc")
if len(sys.argv) > 1:
    ICONS = pathlib.Path(sys.argv[1])

CONFIG = {
    "theme": "base",
    "securityLevel": "loose",
    "flowchart": {"htmlLabels": True, "padding": 14, "nodeSpacing": 40, "rankSpacing": 48},
    "sequence": {"actorMargin": 40, "messageAlign": "left"},
    "themeVariables": {
        "fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif",
        "fontSize": "15px",
        "primaryColor": "#F7F4EC", "primaryBorderColor": "#1F4D3A", "primaryTextColor": "#13261E",
        "lineColor": "#5B6B62", "edgeLabelBackground": "#FFFFFF",
        "actorBkg": "#F7F4EC", "actorBorder": "#1F4D3A", "actorTextColor": "#13261E", "actorLineColor": "#9AA59D",
        "signalColor": "#3A4A42", "signalTextColor": "#13261E",
        "labelBoxBkgColor": "#FBF0DC", "labelBoxBorderColor": "#C9A227", "labelTextColor": "#13261E",
        "loopTextColor": "#13261E", "noteBkgColor": "#FBF0DC", "noteBorderColor": "#C9A227", "noteTextColor": "#13261E",
        "sequenceNumberColor": "#FFFFFF", "activationBkgColor": "#ECE7FB",
        "attributeBackgroundColorOdd": "#FFFDF7", "attributeBackgroundColorEven": "#F7F4EC",
    },
}

def icon(m):
    name, color = m.group(1), m.group(2)
    svg = (ICONS / f"{name}-duotone.svg").read_text().replace("currentColor", color)
    if "fill=" not in svg.split(">", 1)[0]:
        svg = svg.replace("<svg ", f'<svg fill="{color}" ', 1)
    uri = "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
    return f"<img src='{uri}' width='34' height='34'/><br/>"

with tempfile.TemporaryDirectory() as tmp:
    cfg = pathlib.Path(tmp) / "config.json"
    cfg.write_text(json.dumps(CONFIG))
    for src in sorted((HERE / "src").glob("*.mmd")):
        text = re.sub(r"\[\[([a-z0-9-]+):(#[0-9A-Fa-f]{6})\]\]", icon, src.read_text())
        tmp_src = pathlib.Path(tmp) / src.name
        tmp_src.write_text(text)
        out = HERE / f"{src.stem}.png"
        subprocess.run([MMDC, "-i", str(tmp_src), "-o", str(out), "-c", str(cfg), "-s", "2", "-b", "white", "-q"], check=True)
        print("rendered", out.name)
