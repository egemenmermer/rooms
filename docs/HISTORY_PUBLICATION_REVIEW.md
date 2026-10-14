# Existing-repository publication and history review

Date: 2026-10-14. Status: **current-tree preparation complete; direct visibility change blocked**.

## Owner intent and authoritative repository

Publish the existing `egemenmermer/rooms` project under MIT while retaining its development history. The owner rejected replacing its history with a fresh source snapshot. The separate private `rooms-open-source` snapshot is superseded as the publication target. Nothing has been deleted from either GitHub repository or made public.

This preparation branch merges main `252bb68f8638f7bda8d04415fee086b1c54273fb` into the previously reviewed cleanup. Every existing main commit remains an ancestor with its original ID. No rebase, squash, filter, force-push, tag deletion or release deletion was used. Production checkout, installed applications, server and update feed were not modified.

## Preservation and coverage

At the pre-merge inventory cutoff:
- 236 unique reachable commits across fetched local/remote/tag refs; 229 reachable from main.
- 7 remote branches and 25 local tags. PR-specific/hidden server refs are additional surfaces, not implied covered by these counts.
- A verified complete Git bundle preserves 37 local refs and their reachable history outside the source tree. It is PRIVATE and must not be attached to public issues/releases. It is not a backup of GitHub comments, settings, logs or release binaries.
- 25 GitHub release records, including one draft; 96 release assets, totaling 8,063,147,400 bytes.
- 13 PR records, 108 Actions runs and 3 unexpired Actions artifacts.

History sampling confirms distinct phases: initial product brief and Electron/React setup; typed social/Stoat/access integration; replaceable voice/media; authoritative Activities/games; Agent services; desktop UI/reference iterations; recovery/performance/permission work; signing and Sparkle; Windows candidates; DJ completion/seek/search; RC8 publication. This is substantial prior development to retain, not disposable scaffolding.

The latest main additions beyond the initial cleanup base are RC8 Windows build/publication tooling and deployment evidence. The merge retains their commits. Frozen one-off workflows, the hardcoded RC8-only package verifier and operator receipts are omitted from the cleaned current tree; their original versions remain available at the original commits/tags. Generic Windows packaging and current platform documentation remain. No post-RC8 runtime change was dropped: merging main produced the same application/source tree as the previously verified cleanup.

## Current tree changes retained

MIT LICENSE; contributor/security/architecture/self-hosting/release/customization documentation; original static DJ artwork; optional community name/poster/animation configuration; neutral server/signing/feed/deployment settings; consistent formatting; shared alias definition; source publication scan and hygiene policy. Private screenshots, release receipts, operational scripts and old private-community artwork are absent from the current candidate tree, with private originals preserved.

The React/Electron shell, Stoat adapter, replaceable media transport, shared protocols and service boundaries remain. No framework rewrite or arbitrary package reshuffle was performed. Larger feature components still merit gradual responsibility-based extraction; formatting alone does not resolve every cohesion issue. This work does not claim a stable public V1.

## Historical text scan

Gitleaks 8.30.1 scanned all fetched reachable refs with inline allow comments ignored and redacted reporting: 226 diff-bearing commits, approximately 11.69 MB; 16 detections. Source-context triage classified all 16 as non-secret: 8 SHA-256 digests, 3 occurrences of a public Sparkle verification key, 4 explicit test-fixture occurrences and 1 example placeholder. No confirmed secret was identified in this bounded scan. Do not rotate a public verification key merely because a generic detector flags it.

This does not establish that every credential, binary, screenshot or historical log is safe. Historical Git commit metadata includes the maintainer's real author identity/email; preserving original commit IDs also preserves that metadata.

## Publication blockers and exact tradeoffs

| Priority | Surface | Evidence and required decision |
| --- | --- | --- |
| P0 | Historical private-community artwork | Both the old PNG and WebM remain reachable in Git. Removing them from HEAD cannot make them private. Confirm public redistribution permission and accept historical exposure, or explicitly approve a separately prepared history-redaction proposal. Until then do not publish this repository. |
| P1 | Historical privacy/operations | Historical path-object inventory includes 179 entries under docs/release, 87 under infra/production, 171 under docs/screenshots and 245 under docs/rooms-implementation. These are distinct reachable object/path entries, not unique current files. Review personal identities, screenshot pixels, invites, provider references and operator context; retain public technical evidence only by explicit decision. |
| P1 | Release binaries and other GitHub surfaces | 96 release payloads (about 8.06 GB), existing PR content, 108 run histories and 3 current artifacts require a publication disposition. Current installers can contain the old artwork/default infrastructure even after source cleanup. Their payloads and all historical log contents have not been exhaustively inspected. Do not silently delete releases that users or Sparkle depend on. |
| P1 | Public governance/settings | Verify an actual private vulnerability-reporting route, branch protection/required checks and publication content before visibility changes. A SECURITY.md file alone does not enable GitHub's reporting feature. |

There is no Git operation that simultaneously preserves all original publicly reachable commit IDs and removes files from those commits. The supported paths are:
1. Preserve original history publicly, after permission/privacy review accepts all retained historical content and external surfaces.
2. Preserve the original history privately in full, and prepare a reviewed redacted public history in the same project; affected commit IDs and descendant IDs necessarily change. This is not currently authorized or performed.

The earlier clean snapshot is not being substituted for the requested history-preserving path. The unresolved choice concerns historical exposure only; current cleanup and original-history backups are already prepared.

## Verification and limits

Historical exact-source cleanup verification: 801 tests across 119 files; lint/typecheck/build/service build/format; native macOS onboarding shell smoke. GitHub run 38552677129 succeeded for source 5c462c1. These are prior source-bound checks, not fresh acceptance of a release or production server. The main merge adds no runtime code; documentation changes and ancestry preservation are checked separately. Any new CI result must be read at its exact SHA.

No new live accounts, remote load/disruption, physical Windows/Mac media journey, signed packaging, installation, deployment or updater end-to-end claim is made here. The visual preview is a labeled local component fixture, not a real room.

## Next step

Review this branch in PR13 on the existing private repository. Continue historical asset/privacy and release/log disposition before public approval. Do not flip visibility, rewrite history or delete distribution assets as an automatic continuation.
