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



## Private production continuation — 2026-10-12

See PHASE_ONE_RESULTS.md for current actual commands, failures and corrected outcomes. Full verify:ci exit 0 (96 files / 666 tests); current signed-out desktop smoke exit 0; production audit zero; full audit one moderate dev residual, high-severity gate passes. Supply-chain age checks remain active; only two transitive versions were aligned to 8.70.0. Production data/Hoppers/installed app/retained archives untouched. Main PR #3 updater evidence reconciled without replaying owner profile operations.

## Hosted and phase-two local verification — 2026-10-12

- Hosted baseline 191bd37: [GitHub run 38312614543](https://github.com/egemenmermer/rooms/actions/runs/38312614543) PASS, both Ubuntu baseline and macOS native-smoke completed successfully. Actual clean frozen install/lint/type/tests/build/services/audit and native signed-out smoke executed. The first workflow push was rejected for missing scope; owner-approved gh device refresh added workflow permission normally, then source pushed. No alternate credential/security bypass.
- Phase-two current source: focused five files /29 tests PASS; full 98 files /672 tests PASS, lint/type/build/four services PASS. New asynchronous microphone and chat defects reproduced before repair; exact limitations in PHASE_TWO_DEFECTS.md. No real accounts or production mutation.
- Recep installed preview.4 direct local decoding succeeds now; prior failure retained. New native DEMO fixture validates poster on rejection, clickable retry, 509 decoded frames and loop wrap to2.24s, then removal on close. Fixture labels remain visible; audio and two-Mac acceptance are not implied.

## Activity structural compatibility — 2026-10-12

Eight focused compatibility tests PASS; full99 files /680 tests and lint/type/build/services PASS. Real disposable PG16 fixture-authorized HTTP poll/idempotency persists through service/pool restart; future-version row rejected without alteration; pg_dump → separate empty database restore retains identical state SHA256 and valid poll/receipts. Cluster stopped/deleted. This is synthetic QA state, not the current production backup. Initial temporary CJS wrapper rejected top-level await and was corrected before running database operations. PHASE_THREE_DATA.md preserves the scope and open archived-game/Mongo/object/ledger/auth/reset/export/deletion gates.


## Continuation result — 2026-10-13

Actual sourceab03fe0 CI run38313641233 PASS (Ubuntu +macOS native smoke). Final local101files/685tests and lint/type/build/services/signed-out smoke PASS. Signed RC0.1.18-rc.1/build1791842324: Apple Accepted/staple/Gatekeeper/strict signature, copied hashes and extracted ZIP verification PASS; isolated signed-out native launch/About/local visual PASS. First Documents signing failure and SCP timeout preserved with corrected local environment/bounded transfer. Actual latest encrypted backup Activity-only restore/projection PASS; private plaintext removed. Exact sanitized results and open gates in RC_0_1_18_RESULTS.json. No public/feed/production/installed-app/retained/Hoppers mutation.
