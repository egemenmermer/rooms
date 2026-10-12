# Documentation build and deployment
Public source: ../project (nine explicitly allowlisted chapters and topology.svg).
Private release/operator findings in ../release are intentionally not part of the static build. Never copy the repository, .local, generated configuration, keys, cookies or audit archives into a web root.

## Build
Use Python3 and the pinned documentation-only dependency:
```sh
python3 -m venv .local/docs-venv
.local/docs-venv/bin/pip install -r docs/site/requirements.txt
.local/docs-venv/bin/python docs/site/build.py --revision 06f5477
```
The current delivery used the already-installed Markdown3.7 without adding product dependencies. Output docs/site/_site is ignored. Product package/build scripts are unchanged.
The builder uses an explicit chapter/asset list, produces HTML/raw chapter download and a SHA256 manifest, and loads no external fonts/scripts/analytics.

## Scope and review
This is a documentation-only publication. Handbook snapshot may describe code on the audited feature branch even when these documents are merged separately into main.
Audit documents remain an immutable dated baseline; implementation tasks should update the maintained release record rather than treating the initial score as live telemetry.
Before publication: check allowed output, local relative links/anchors, credential patterns, no local filesystem/home paths in public chapters, readable desktop/mobile layout and exact source revision. Do not publish unresolved private vulnerability/identity/operator records here.

## Dedicated-core publication
Public URL: https://62.238.119.134/docs/.
The existing Caddy /data mount is sufficient. Place a versioned static directory under the owned public documentation artifact area, point rooms-docs to that release, and add only the exact route snippet from Caddyfile.snippet.
Preserve the current Caddyfile bytes in a private rollback directory. Validate through the running Caddy container before graceful reload. Caddyfile is a file bind mount: update the existing file in place so the container sees the inode; do not rename-replace it blindly.
No Compose changes, container restart, product bundle/DB/certificate/key change is required. Check /docs/, CSS/SVG/pages, denied unrelated files and existing access/Activities/update paths after reload.
On failure restore the previous config bytes and docs pointer, gracefully reload and preserve diagnostics. Keep previous docs versions for rollback; do not remove unrelated artifacts.
The publication receipt is maintained in DEPLOYMENT.md and the repository commit/PR. Do not record credentials or host access secrets.
