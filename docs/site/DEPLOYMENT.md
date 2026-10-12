# Documentation publication — 2026-10-12

URL: https://62.238.119.134/docs/
Release directory: `docs-20261012T202216Z`
Handbook implementation snapshot: `06f5477` on `codex/reference-package`.

## What was published
Nine explicitly allowlisted explanatory chapters, their Markdown downloads, topology SVG, one local stylesheet and a digest manifest. No account secrets, private release findings, operator configuration or user data were included. Audit documents/screenshots remain GitHub-only.

## Actual checks
- Local generation: nine pages /20 hashed files, no product dependencies added.
- Relative links/assets and exact output allowlist checked.
- Headless Chromium: architecture desktop1440x1000 and services mobile390x844; nine nav links, no page errors or document horizontal overflow. This is documentation verification, not product QA.
- Owned dedicated core was identified; existing Caddy volumes and routes inspected.
- Uploaded archive extracted into a new versioned directory; all20 content digests matched.
- Prior Caddy configuration preserved privately at `/opt/rooms/docs-deployments/docs-20261012T202216Z/Caddyfile.before`.
- Only /docs redirect and /docs/* restricted static handling added; current Caddyfile inode preserved for its bind mount.
- Running Caddy validate and graceful reload passed. No product container restarted, service bundle changed, DB migrated or certificate/key replaced.
- Public HTTPS access/Activity health and signed appcast remained200.
- All20 deployed file digests matched local manifest over trusted HTTPS; excluded audit/config/secret paths returned404.
- Response enforces local-only styles/images, no scripts/forms/frames, no-referrer and nosniff.

## Rollback and maintenance
Prior Caddy bytes are the before-image above; no prior docs route/site existed. Restore the before-image in place, validate/reload Caddy and remove only this owned docs symlink if rollback is required. Preserve versioned artifacts/receipt for comparison.
Subsequent updates should build from the allowlist, verify artifact digests, switch the owned docs pointer atomically and retain the previous pointer. Avoid changing the product ingress prefixes or re-running fresh core bootstrap.

The static site does not certify a public V1, add analytics, expose a repository browser or run user commands. Documentation-only GitHub integration is separate from pending product code.
