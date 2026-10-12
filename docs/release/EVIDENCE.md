# Audit evidence and limitations
Date: 2026-10-12, Europe/Amsterdam. Tracked source baseline 06f5477. All executed verification was read-only toward production; generated local build artifacts are expected.

## Command/results ledger
| Actual command or scoped operation | Result |
|---|---|
| git status --short, branch -avv, log --reverse, reflog, tags, worktree list, remote refs, diffs | Initial clean tree; one checkout, two advertised branches; fetched refs/tags, no checkout change |
| git fetch --no-recurse-submodules origin | PASS; refreshed stale main to aee41de and 19 tags |
| git rev-list --left-right --count origin/main...HEAD | 1 / 14; HEAD has no unpushed commits |
| git rev-list --count HEAD; git rev-list --all --count; git ls-files | 144; 145; 927 |
| node --version; pnpm --version; pnpm list --depth 0 | 22.22.0; 11.25.0; installed dependencies available across root/music workspace |
| pnpm typecheck | PASS exit0, session77898 |
| pnpm test | FAIL exit1, session71372; 96 files, 665 tests, 95/663 pass; 2 failed DJ tests; 28.09s duration |
| pnpm lint | FAIL, Command lint not found |
| pnpm build | PASS exit0, session75586; Vite transformed2,189 modules, renderer built4.71s; 126 production notices; Electron bundles generated |
| pnpm services:build | PASS exit0, session7749; all four bundles |
| pnpm test:desktop --grep 'desktop shell' | FAIL exit1, session49118; .hero timeout30s; test elapsed34.2s; acceptance.spec.ts:7 |
| Inline Playwright _electron.launch(args:['.'], env ROOMS_PROFILE:audit-...) | PASS signed-out startup/bridge/isolation/welcome/signin/register; sampled settings/Cinema/games/agent routes no pageerrors; only rendering evidence, short navigation waits not full feature acceptance |
| Inline Python process-group wrapper: ROOMS_PROFILE=audit-dev-* pnpm dev | Vite ready871ms, HTTP200, alive then owned processes stopped; temporary profile removed |
| Isolated PG16 initdb + pg_ctl + in-memory esbuild of tests/fixtures/postgres-activity.ts | First startup FAIL (session95295), no captured server log retained; shorter temporary Unix socket retry PASS (session31300). Long socket path is suspected environment cause, not proven from first error. No code repaired |
| verifyPostgresActivity against disposable loopback PG | Actual DB/HTTP vote persistence, pool/service restart and idempotency PASS; auth uses qa-alice/qa-bob fixtures. Full PostgreSQL process crash/Mongo/upgrades not certified. Cluster stopped/deleted |
| docker info --format '{{.ServerVersion}}' | FAIL: OrbStack Docker daemon socket unavailable |
| df -h . | About1.3GiB available. Fresh dependency/full package generation not attempted due host space and existing previews; no claim of fresh install pass |
| codesign --verify --deep --strict --verbose=2 /Applications/ROOMS.app | PASS strict nested signed installed bundle |
| spctl --assess --type execute --verbose=2 /Applications/ROOMS.app | PASS: accepted, source=Notarized Developer ID |
| xcrun stapler validate /Applications/ROOMS.app | PASS validate action |
| PlistBuddy CFBundleShortVersionString on installed app | 0.1.17-preview.4 |
| curl --max-time12 anonymous trusted HTTPS: /rooms-access/health, /rooms-activities/health, /rooms-updates/appcast.xml | HTTP200 each; access ready:true, Activities authorizationConfigured:true; appcast0.1.17-preview.4 references161,526,863-byte archive and Ed25519 signature. Not downloaded or cryptographically reverified here |
| pnpm audit --prod --json | PASS exit0; zero advisories |
| pnpm audit --json | FAIL exit1; 3 moderate/2 critical development advisory entries, 4 distinct advisory IDs (one appears at two dependency nodes); see REL-015 |
| Current tracked text + git cat-file historical credential-signature scans | Zero matching signatures across current tree and1,552 <2MB historical blobs; common private-key/GitHub/AWS signatures; current scan also OpenAI-style pattern. No entropy/provider-complete guarantee |
| Trello read board and list_by_board filter:all | Accessible rooms board; no lists/cards returned |
| Product diff before management documents | git diff --quiet succeeded; no tracked product mutation |

## Live vs historical vs mock
Fresh verified: current local tests/build failures/successes, basic native signed-out rendering/startup, isolated PostgreSQL persistence, installed signature/Apple trust and anonymous health/feed.
Historical verified: public Stoat, older native transport/games/board, encrypted off-host/DB/object/TLS restores and scheduled backup. Follow each original record's explicit scope.
Local/mock: protocol/React tests, development visual states, Cinema local intercepted-IPC fixture, agent connector/executor tests. Real database does not make its QA auth real Stoat.
Unknown: newest authenticated social, two physical Macs, complete clean installation/upgrade/deployment, current real provider/Agent/Windows, public privacy/asset review.

## Repository and safety boundaries
All top-level areas, tracked paths, visible Git history/branches/tags and source-wide incompleteness/configuration patterns considered. Manual depth prioritizes auth, permission, IPC, provider URL/credential isolation, cache/persistence, active routes, service authority and release scripts. No claim every binary/reference state or every instruction in historical reports was replayed.
Preserved existing source, owner application profile, accounts, releases and production. Ignored user secrets/cookies/delivery keys were not loaded. We did not run production mutation/load/reboot/restore scripts: those send messages/create records, stop services or provision accounts. Their source and prior sanitized receipts were inspected.
No broad refactor, patch, dependency upgrade, certificate submission, update publication or implementation occurred. Verification-generated dist/test caches and Git metadata are allowed audit outputs; only docs/release files are new tracked repository work.
Screenshots: audit-onboarding.png and audit-agent-signedout.png in the delivered output folder. They show signed-out current UI, not authenticated acceptance.

## Recheck trigger
Any source/native addon/service/environment/schema change after this SHA invalidates affected evidence. Repeat targeted checks and RC gates; preserve failures before fixes. Scores/counts are updated only when issue acceptance evidence closes them.
