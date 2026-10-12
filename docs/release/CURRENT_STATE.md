# Current state — ROOMS
Audit date: 2026-10-12, Europe/Amsterdam. Baseline: `06f547792cc72048435c3960a482923292f23428`, `codex/reference-package`.
Decision: mature private preview; public V1 is NO-GO. This assessment supersedes stale release-status statements, not historical evidence.

## Evidence boundaries
Repository: /Users/egemenmermer/Documents/Codex/2026-10-08/build-rooms-a-premium-private-desktop, origin https://github.com/egemenmermer/rooms.git.
The requesting chat directory contains no product repository. Trello https://trello.com/b/TkcxeAjw/rooms returned zero lists/cards, including archived-card filtering.
All 927 tracked paths were inventoried. All source/configuration areas were scanned; critical auth/IPC/media/persistence/release paths and recent diffs were manually reviewed. Binary assets were inventoried and sampled visually, not individually certified. This is a repository-wide release audit, not an exhaustive line-by-line security certification.
Ignored private configuration, user accounts, keys and cookies were not copied, decrypted or used. Existing installed owner profile was not operated; runtime inspection used disposable signed-out profiles. Production checks were anonymous HTTPS GETs only. No production writes, disruption, migrations, publication or account provisioning occurred.
No product implementation changed. Generated build/test outputs and Git remote refs changed as verification requires; management documents are the only tracked additions.
Current source, installed app, and production are separate baselines. Installed app is 0.1.17-preview.4; source package.json still says 0.1.14. Its tag a8da824 is followed by documentation-only 06f5477. Live health does not prove deployed bundles equal HEAD.

## Product and architecture
Turkish, macOS 14+ Apple Silicon Electron 44.7 / React 19.3 / TypeScript 5.9 desktop clubhouse. Node 22.22 and pnpm 11.25 were available.
- Renderer: React Router/hash navigation, Zustand state, React Query, lazy feature screens, persistent voice/player runtimes, reduced-motion/transparency settings.
- Electron main/preload: narrow validated IPC, sandbox/context isolation, native file/source selection, OS-encrypted sessions/providers/conversation cache, local notifications and native Sparkle updater.
- Social: unmodified pinned Stoat v0.15.5, normalized adapter. MongoDB social identity/messages, Autumn/MinIO uploads, associated upstream infrastructure.
- Access service: invitation ledger, upstream auth/permission checks, short-lived LiveKit grants, presenter leases, private calls and music gateway.
- Activities service: authoritative revision/idempotency protocol, polls, board, queues/timelines and games. PostgreSQL JSONB or local development file repository; one authoritative writer only.
- LiveKit: independent media lifetime, microphone/camera/screen/system audio, per-participant local gain, soundboard.
- Music: separate Node RTC publisher, ffmpeg and yt-dlp, volatile bounded queues and private server session credential.
- Agent: separate Linux host kit, encrypted state, own model accounts, scoped connectors/tasks/reminders/approvals. Deployment and actual external operations not accepted.
- Delivery: Electron Builder DMG/ZIP, Developer ID, hardened-runtime signed path, notarization/stapling, native Sparkle Ed25519 appcast.
- Production: dedicated core; Docker services plus host SFU, IP-based trusted HTTPS, systemd backup/renewal/maintenance scripts. No CI workflows found.

## Current verified facts
Typecheck and renderer/Electron/four-service builds pass. 663/665 local tests pass; two DJ tests fail. Existing desktop shell E2E fails on obsolete .hero selector.
Fresh signed-out Electron launch renders the welcome screen with native bridge, no renderer Node access, no startup overflow; sampled routes produced no pageerror. Sign-in and invite registration forms render. Authenticated journeys not rerun.
Development startup answered HTTP 200, stayed alive, and owned process group stopped. Isolated real PostgreSQL poll/revision receipt persistence survived service/pool restart. This uses fixture authorization, not real Stoat.
Installed application strict deep signatures, stapled ticket and Gatekeeper pass. Access/Activities health and current Sparkle appcast return trusted HTTPS 200.
Production-only dependency audit reports zero known advisories. Full toolchain audit reports three moderate and two critical entries, all flagged development dependencies.
Fixed-signature scan of current tracked text and 1,552 historical blobs found no matching credential signatures; this does not establish absence of secrets.

## Strong historical evidence, with limits
Oct 10 records show production Stoat two-account interaction, public media grants/native capture on one Mac, encrypted DB/object/TLS restore, scheduled off-host backup, seven game engine hands, packaged game/board interactions and official YouTube playback.
0.1.4 soak: 908 seconds, 15 navigation cycles, max working set 528 MiB, zero renderer errors, bundled local demo video. That demo was subsequently removed.
Activity capacity record: six HTTP transports, only two identities, 151 seconds, 48 writes, no throttling; not six-user physical media capacity.
Recent CHECKPOINT records owner-reported microphone failure, cookie bind-mount/session rotation correction, and blank DJ animation in preview.4. These are historical reports, not freshly reproduced here.
All 413 reference-design records remain NEEDS_RECHECK. Do not convert this into 413 release blockers: accept the scoped V1 workflows, rather than every design variation.

## Missing public-release evidence
Two physical Macs: audible microphones, capture/system audio, camera, permissions, reconnect, device loss and newest social flows. Actual password-reset email delivery, deletion/export/retention process, fresh developer/production installation, existing-data upgrades, old-to-new Sparkle update, sustained real-user capacity, alerts/support and latest RC recovery.
Docker is unavailable on this workstation. Disk had about 1.3 GiB available; a second heavyweight packaging/fresh-install run was not attempted. Signed artifact integrity was checked instead. Full stack freshness remains unknown.
See FEATURE_INVENTORY.md, PROJECT_HISTORY.md, QA_MATRIX.md and EVIDENCE.md.
