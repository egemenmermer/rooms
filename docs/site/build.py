#!/usr/bin/env python3
"""Build only explicitly publishable handbook chapters; never crawl private docs."""
from pathlib import Path
import argparse
import hashlib
import html
import json
import re
import shutil
import markdown

ROOT = Path(__file__).resolve().parents[2]
CHAPTERS = [
    ("README.md", "index.html", "Overview"),
    ("architecture.md", "architecture.html", "Architecture"),
    ("runtime-flows.md", "runtime-flows.html", "Runtime flows"),
    ("services.md", "services.html", "Services & interfaces"),
    ("data.md", "data.html", "Data & persistence"),
    ("security.md", "security.html", "Security & privacy"),
    ("operations.md", "operations.html", "Operations"),
    ("development.md", "development.html", "Development & release"),
    ("repository.md", "repository.html", "Repository guide"),
]
ASSETS = ["topology.svg"]
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, default=ROOT / "docs/site/_site")
parser.add_argument("--revision", default="06f5477")
args = parser.parse_args()
if not re.fullmatch(r"[a-zA-Z0-9.-]{1,64}", args.revision):
    raise SystemExit("Use a bounded public revision label.")
out = args.output.resolve()
source = ROOT / "docs/project"
out.mkdir(parents=True, exist_ok=True)
# Explicit files only; no release reports, Git metadata, screenshots or private configuration.
(out / "assets").mkdir(exist_ok=True)
(out / "source").mkdir(exist_ok=True)
for asset in ASSETS:
    shutil.copyfile(source / "assets" / asset, out / "assets" / asset)
shutil.copyfile(ROOT / "docs/site/style.css", out / "assets/style.css")
links = {name: target for name, target, _ in CHAPTERS}
for name, target, label in CHAPTERS:
    text = (source / name).read_text()
    converted = markdown.markdown(text, extensions=["tables", "fenced_code", "toc"])
    for old, new in links.items():
        converted = converted.replace('href="' + old + '"', 'href="' + new + '"')
    # The checked-in SVG is the rendered diagram; Mermaid stays available in Markdown/GitHub.
    converted = re.sub(r'<pre><code class="language-mermaid">.*?</code></pre>', "", converted, flags=re.S)
    converted = converted.replace("<table>", '<div class="table-scroll"><table>').replace("</table>", "</table></div>")
    nav = "\n".join('<a ' + ('aria-current="page" ' if name == active else '') +
                    'href="' + page + '">' + html.escape(title) + '</a>'
                    for active, page, title in CHAPTERS)
    document = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="ROOMS architecture, runtime flows and engineering handbook.">
<meta name="robots" content="noindex,nofollow"><title>{html.escape(label)} · ROOMS docs</title>
<link rel="stylesheet" href="assets/style.css"></head><body>
<a class="skip" href="#content">Skip to content</a>
<aside><a class="brand" href="index.html"><span class="brand-icon">R</span>ROOMS<span class="brand-note">Engineering handbook</span></a>
<nav aria-label="Handbook chapters">{nav}</nav>
<div class="sidebar-note">macOS desktop · dedicated core<br>Snapshot 12 October 2026<br>Implementation {html.escape(args.revision)}</div></aside>
<div class="page"><header><span>PROJECT DOCUMENTATION</span><a href="source/{name}" download>Download this chapter</a></header>
<main id="content">{converted}</main>
<footer>Documentation describes architecture and evidence boundaries. It does not certify public-release readiness.<br>
Source snapshot {html.escape(args.revision)} · No account data, credentials or private audit reports are hosted here.</footer></div>
</body></html>"""
    (out / target).write_text(document)
    shutil.copyfile(source / name, out / "source" / name)
manifest = {
    "kind": "rooms-public-handbook",
    "implementationRevision": args.revision,
    "snapshotDate": "2026-10-12",
    "pages": [target for _, target, _ in CHAPTERS],
    "files": {},
}
for path in sorted(out.rglob("*")):
    if path.is_file() and path.name != "manifest.json":
        manifest["files"][str(path.relative_to(out))] = hashlib.sha256(path.read_bytes()).hexdigest()
(out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Built {len(CHAPTERS)} handbook pages and {len(manifest['files'])} explicitly allowed files.")
