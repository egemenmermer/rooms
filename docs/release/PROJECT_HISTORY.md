# Project history and Git forensics
Baseline 06f5477; fetched remote refs during audit without changing the checkout.

## What history actually establishes
144 commits on HEAD; 145 reachable across fetched refs. Available Git history begins 2026-10-08 at 72c4011, a documentation/spec commit, and ends 2026-10-12. The repository does not substantiate development before that date; prior work outside this Git history is UNKNOWN. Do not infer long-term stability from commit count.
Initial and final tracked working trees were clean before management-document creation. HEAD equals origin/codex/reference-package: no unpushed commits on the audited branch. Local main bcb4a98 is 57 commits behind fetched origin/main aee41de.
After fetch, origin/main...HEAD is 1 main-only merge commit / 14 branch-only commits. Main merged PR #1 through 07c8a12; newest music publisher, Sparkle, microphone/volume and cookie rotation work remains on the feature branch. This is 53 files, +946/-142 in its merge-base diff. Do not use the initial stale 70-commit local-main difference as the current integration backlog.
Remote advertises only main and codex/reference-package. Nineteen release/preview tags were fetched; no v1.0.0 tag. One merge commit found, no explicit revert commits found. No other active or abandoned feature branch was discovered; deleted branches/unavailable repositories remain unknown.

## Development phases
| Phase | Evidence | Meaning |
|---|---|---|
| Oct 8 foundation | 4365b9e, e85386c, ea58396, 73d7a35, cd425ec, 522a340 | Electron shell, Stoat adapter, separate media, Activities/games, Agent foundation |
| Oct 9 QA/infrastructure preparation | e98e142, 799d93c, 15fafb7 | Desktop harnesses, unsigned preview and host assessment |
| Oct 10 production/stabilization | 9b580e0, 0257fb4, ec79b9f, 80e465c | Dedicated core, actual native/social evidence, rate-limit changes, encrypted backup/restore |
| Oct 10 deeper acceptance | c8b1d4d, 89d2fd5, 02f6491, c570719 | Activity load, game rules/native interactions, private-hand/seat guards |
| Oct 10 product-policy change | cb97539, 36b6294, 277040e, 6a4f8cb, 9b786f2 | Remove demo, minimal copy, owner testing, settings/voice/soundboard; older fixture/soak claims cease to certify current UI |
| Oct 10–11 design/reference expansion | e3d5ae1, a6b1228, 680fdc5, c0b592e, 54ecfa3 | Broad surface inventory, native/service boundaries, recovery, calls/notifications/settings |
| Oct 11–12 usability remediation | ec72158, 037d098, fcdd075, a3000e3, bb48b0a, 4d16890 | Conversation caches, shared observers, screen audio/quality, Save semantics, occupant directory |
| Oct 12 account/friends | 458647d, 468f572 | Private self-service registration and friend-request/cache workflows |
| Oct 12 DJ iteration | f303b2e → a264d15 → 07c8a12 → a4adb69 → fac738d | Official shared video/playlist becomes popup, then server audio publisher/extracted source. Historical official-player tests do not certify current DJ |
| Oct 12 release/audio repair | 54700ab, b05d10f, 74b44b5, a8da824, 06f5477 | Sparkle/notarization, mic fallback/local gain, atomic credential rebind and explicit remaining acceptance |

## Old and competing work
Spacebar adapter, Dockerfile, scripts and documents remain as legacy/rollback evidence; active native social uses Stoat. README and npm verify:social still expose legacy paths, a fresh-install trap.
Shared demo movie was removed in cb97539, yet old screenshots/soak tests still document it. Not evidence of current mocked production content.
Official YouTube screen/player remains in source, but production /youtube opens MusicDJEntry and returns to the previous page. Treat reachability separately from implementation.
The 413-state reference inventory is stale relative to subsequent corrections; all entries retain NEEDS_RECHECK. Reconcile rather than trust completion labels.
Repeated chat/cache, voice/audio, signing and DJ fixes indicate these boundaries are the current stabilization hotspots. They do not prove abandoned architecture or justify a rewrite.
Git references and .local build/delivery files are not a deploy manifest. Release commit/tag/version/server bundle digests need one provenance record.
