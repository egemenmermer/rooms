# Release blockers and issue database
2026-10-12 · 06f5477 · OPEN: 3 P0 + 12 P1. Effort XS <2h, S 2–6h, M 0.5–2d, L 2–5d, XL 1–2w, XXL decompose.
Priority is release impact. Evidence labels distinguish confirmed failure, missing artifact and unclosed acceptance. No claim that every gate is a reproduced product defect. All items below are public-release blockers.

## P0
### REL-001 — Core audible media acceptance remains open
Category/area: core journey; voice/capture. Status: OPEN evidence gate; HIGH confidence in gap, LOW confidence in remaining engineering effort. Effort L–XL.
Description/user impact: latest preview includes missing-microphone fallback after owner-reported failure; no verified two-physical-Mac audible mic/camera/screen/system-audio/reconnect acceptance. The central reason to use ROOMS may fail despite connected UI.
Evidence: 74b44b5; packages/media-providers/src/index.ts; realtime.ts; CHECKPOINT.md latest delivery; historical NATIVE_VOICE_RESULTS.json scope.
Likely root cause: saved device unavailable was observed historically; other current defects unknown. Dependencies: two supported Macs, separate networks, ordinary scoped accounts, target RC.
Action: establish actual media acceptance and record defects before fixes; disable unsupported optional audio/capture combinations. Do not replace transport wholesale without evidence.
Verify: A hears B and B hears A; mute/deafen/PTT/device removal/default fallback; denied mic/camera/screen consent; leave/logout/channel revocation stop tracks; navigate for 30min; disconnect/reconnect on restrictive network/TURN; no duplicated tracks or consent retries. Observe actual audio, not only SFU membership.

### REL-002 — YouTube extracted room audio has no public distribution clearance
Category/area: provider/legal/reliability; music. Status OPEN decision gate; HIGH confidence code extracts/rebroadcasts, MEDIUM on provider-policy assessment; legal conclusion requires appropriate review. Effort S to scope out; XXL to retain.
Evidence: a4adb69/fac738d; music/youtube-source.ts invokes yt-dlp/bestaudio; publisher.ts sends decoded stereo to LiveKit; MUSIC_BOT.md acknowledges private Google-session dependency. Current /youtube route selects MusicDJEntry.
Impact: provider refusal/cookie expiry and public distribution/right-to-rebroadcast risk. Owner permission to use their session is not permission from provider/content owners.
Likely root cause: prototype provider extraction promoted into product flow, distinct from old official IFrame implementation. Dependencies: owner scope decision; provider/content authorization if retained.
Action: remove extractor/DJ entry points from V1; retain screen sharing as together experience. Any future official player must be separately reachable/accepted. Exclude Recep visual until distribution rights established.
Verify: public package/routes/services have no extracted YouTube room stream path; retained player follows provider rules; documented asset/provider rights reviewed.
Sources checked 2026-10-12: [YouTube Terms, permissions/restrictions](https://www.youtube.com/static?template=terms) restrict automated access and rebroadcast without specified permissions. [YouTube API Developer Policies](https://developers.google.com/youtube/terms/developer-policies) contain audio-separation restrictions for API clients; applicability to this non-API extractor should not be assumed, and Terms review remains required.

### REL-003 — Public privacy and data-rights operations undefined
Category/area: privacy/data/support. OPEN missing V1 deliverable; HIGH confidence repository absence, MEDIUM effort L plus external review.
Evidence: Settings.tsx privacy controls disabled; no account delete/export native API or public privacy/terms route found; conversation vault, Mongo social/uploads, Activity JSONB, backup.py and Agent/media subsystems retain user data.
Impact: users cannot understand handling/retention or request documented deletion/export; public data collection lacks reviewed disclosures.
Likely cause: private preview scope, no operator process. Dependencies: scoped data map, production operator and relevant legal review.
Action: publish accurate policy/terms/support; define retention and supervised request process with identity checks; implement required deletion/export across live stores/local caches and expiry in backups. Self-service UI is not the only acceptable initial solution.
Verify: a sacrificial user’s request produces export and documented deletion results; include messages/uploads/relationships/Activity references/cache, backup schedule and exceptions; no false E2EE/privacy claims; privacy links reachable before signup.

## P1
### REL-004 — DJ unit/UI suite fails
Category/area: QA/music. OPEN confirmed TEST failure; HIGH, S.
Evidence: pnpm test: 2 failures at MusicDJ.tsx:31; tests/music-dj.test.tsx mock lacks participants.
Impact/root cause: regression suite cannot be trusted for newest audio UI; outdated mock contract, not demonstrated production crash.
Depends: V1 cut decision. Action: align meaningful test fixture/contract or remove obsolete feature tests with the actually removed V1 path; never skip to obtain green.
Verify: full pnpm test green with useful assertions; scoped real UI test for retained feature.

### REL-005 — Desktop acceptance harness targets removed UI
Category/area: QA/onboarding. OPEN confirmed TEST failure; HIGH, M.
Evidence: acceptance.spec.ts:7 waits .hero; shell test times out; fresh native welcome independently renders.
Impact/root cause: first-install/core smoke gate cannot validate current UI; test selectors and subsequent connection labels predate onboarding.
Depends: scoped current routes. Action: update real user-journey test, preserving IPC isolation, signed-out/no-demo checks and resource cleanup.
Verify: full desktop smoke on target build including welcome/signin/invalid invite/settings/local Cinema if retained; explicit unsupported live-account skip reason, not passing fake transport.

### REL-006 — Latest social and authorization journeys unaccepted
Category/area: core/social/security. OPEN acceptance gate; HIGH gap, L.
Evidence: 458647d/468f572/bb48b0a, current cache/role native code; older two-account results certify earlier revisions.
Impact/root cause: registration/chat cache/friend writes/membership removal may fail or show stale private data; integration acceptance lag.
Depends: ordinary isolated QA identities, latest broker/desktop baseline. Action: controlled two-user + outsider packaged acceptance of invite/signup/chat/DM/upload/friends/profile/role management; fence old account/channel responses.
Verify: expiry/one-use/partial signup, refresh/restart, edit/delete events, attachment failure, remove/block, unknown permission, revoked channel/session/logout and no denied data retained.

### REL-007 — Password-reset delivery and session revocation unverified
Category/area: recovery/auth. OPEN acceptance gate; HIGH gap, M.
Evidence: password-recovery.ts/native UI and broker tests; no fresh deployed email-to-login receipt; README/upstream docs do not establish operational SMTP.
Impact/root cause: forgotten password may strand user; email/deployed upstream integration unknown.
Depends: configured sender, QA mailbox, owned test account. Action: verify actual mail/link/reset/signin; document operator fallback if necessary.
Verify: wrong/expired token, changed server, uncertain response and removed old sessions; no token in renderer/logs.

### REL-008 — Existing data upgrade and current restore not a release gate
Category/area: data/database. OPEN missing process/current evidence; HIGH, L.
Evidence: postgres.ts creates one unversioned JSONB table; StoredRoom is cast, snapshot shape evolves; backup.py + Oct10 restore records; no migration sequence tracked.
Impact/root cause: newer application may misread durable old state; reverting code may not restore compatible data.
Depends: source/tag/DB compatibility inventory. Action: define supported schemas/upgrades, old-snapshot fixtures and clean/prod upgrade procedure; rehearse latest DB/object/ledger restore isolated from production. Preserve one writer.
Verify: oldest supported snapshot opens/upgrades safely; empty DB init works; poll/board/history/idempotency survive; interrupted upgrade fails safely; restored uploads readable and fresh auth/member boundaries hold; measured RPO/RTO.

### REL-009 — No automated release baseline/provenance
Category/area: CI/CD/packaging/config. OPEN confirmed infrastructure absence; HIGH, L.
Evidence: no .github workflows/lint configuration; pnpm lint missing; source 0.1.14 vs installed/feed 0.1.17-preview.4; 14 branch-only commits after main merge; signing script pinned owner/team/IP/private SSH layout.
Impact/root cause: clone/main/build/tag/deployment may represent different products; manual workstation release carries drift.
Depends: REL-004/005/015, scope freeze. Action: add meaningful PR type/test/build/lint gates; integrate reviewed branch, one RC version/commit and service-digest manifest; credential-isolated reproducible signed-release procedure. Automated signing not required if manual trusted release is documented/repeatable.
Verify: clean checkout produces correct versions/assets; protected release checks; provenance matches desktop/tag/services; no publication on failed checks.

### REL-010 — Fresh Mac install and actual signed upgrade unknown
Category/area: release/recovery. OPEN acceptance gate; HIGH, M–L.
Evidence: installed codesign/Gatekeeper/stapler pass and appcast 200; SPARKLE_DELIVERY explicitly says old-to-new update unverified. Current host had ~1.3GiB free and prior install rollback.
Impact/root cause: download can be valid yet onboarding/update/data preservation fail on another machine.
Depends: target RC/artifacts/feed, clean supported Mac and old Sparkle version. Action: fresh installer, installed launch, in-app update, interruption/low disk and recovery tests without changing owner live profile.
Verify: pristine Mac accepts package, sees version, joins/logs in; upgrade preserves account/settings; consent and Sparkle signature failure handled; interrupted install leaves prior usable app; no forced downgrade promise.

### REL-011 — Failures cannot be reliably detected/explained
Category/area: observability/operations. OPEN missing production evidence; HIGH, M.
Evidence: service Fastify logger:false, masked 503 handlers, background sweep catch; native diagnostics/fatal Boundary reload and health exist, but no demonstrated error collector/alert pipeline.
Impact/root cause: private-safe masking loses operator diagnosis; health ready:true does not verify every dependency.
Depends: privacy data-minimization rules. Action: sanitized error category/request/version logs, dependency readiness, uptime/backup/disk/TLS alerts and documented operator triage. No enterprise analytics required.
Verify: isolated upstream/DB error triggers actionable operator event/alert without secrets or message content; status/diagnostics identify build; backup/TLS/disk failure alert drill.

### REL-012 — Current capacity and failure recovery budget unknown
Category/area: performance/reliability. OPEN acceptance gate; HIGH gap, L.
Evidence: 1,354.58KB main JS and 644.37KB media chunk; old 0.1.4 demo soak; six transports only two identities; native newest voice/caches not soaked; Activities list/sweep and whole-state JSONB work.
Impact/root cause: nominal functionality may degrade on M1/8GB or under public/shared-IP auth limits; no current target measurement.
Depends: REL-001/006/008; six real identities/staging capacity. Action: measure realistic voice+chat/poll/board use, memory/CPU/cold-warm navigation and API/DB budgets; test network/server restart on owned staging.
Verify: 2-hour room session/no lost acknowledged data/no runaway listeners, six distinct users without sustained 429, warm navigation responsiveness, captured delivered media stats. Publish conservative capacity. Optimize only observed user-impact bottlenecks.

### REL-013 — Fresh-developer/operator/support path is stale
Category/area: docs/deployment/support. OPEN confirmed documentation drift; HIGH, M.
Evidence: README, FEATURE_MATRIX, MANUAL_CHECKS, infra/stoat/UPSTREAM.json still say older unsigned/unavailable/official-player states; pnpm verify:social targets Spacebar; no complete public support/download/privacy release bundle.
Impact/root cause: another engineer/operator/user needs tribal knowledge; living evidence not consolidated.
Depends: scope/provenance/legal. Action: current clone/config/install/full-stack/upgrades/release/rollback instructions, supported-platform limits, operator recovery/incident/support contacts and release notes.
Verify: independent engineer follows from clean checkout; secrets via documented private channel; user can download/contact support; old evidence clearly historical.

### REL-014 — V1 surface exposes unaccepted/unsupported secondary workflows
Category/area: UX/scope. OPEN confirmed partial feature exposure; HIGH, M–L.
Evidence: Agent/media/games routes/settings in App.tsx; disabled privacy/description/icon controls; current /youtube routes DJ; all413 reference records NEEDS_RECHECK. Latest CHECKPOINT reports blank DJ animation.
Impact/root cause: product promises broaden beyond deployable/accepted experience; fixtures/screens mistaken for completion.
Depends: V1_SCOPE approval. Action: hide deferred routes/actions consistently; retain precise unavailable reasons for genuinely platform-limited supported operations; accept keyboard/responsive current V1 paths. Scope work, not full redesign.
Verify: no enabled inert action; no production demo injection or hidden-access shortcut; signed-out/empty/error/denied and 900x700 layouts coherent; owner accepts retained flows.

### REL-015 — Development dependency advisories need triage before trusted release
Category/area: supply chain/test/build host. OPEN confirmed registry alerts, exploitability UNKNOWN; HIGH alerts, M.
Evidence: pnpm audit full exit1: Vitest/@vitest/mocker moderate GHSA-82fw-gwwq-j7x9 (two entries), sprintf-js moderate GHSA-hp3w-g68c-fv3c, Tinypool critical GHSA-5gmw-xhrv-c9v3 and GHSA-85c8-ppgw-ccpr; installed tinypool1.1.1 via vitest3.2.7. All findings dev:true; prod audit zero.
Impact/root cause: untrusted tests/config on a signing workstation can affect release trust; registry severity alone does not prove reachable app RCE.
Depends: release/CI credential isolation. Action: review exact advisory preconditions, targeted compatible patch/upgrade or documented isolation mitigation; protect signing/notary keys from untrusted PR tests. Do not indiscriminately upgrade all packages.
Verify: exploit-precondition analysis saved; no applicable unmitigated high/critical toolchain risk; full tests/build green after targeted changes; production graph remains separate.

## P2–P4, no hidden public blockers
P2 REL-016: consolidate native settings/profile Save semantics and support clearing current profile text (Settings.tsx only sends nonempty bio/status), M; verify explicit clear and failed-save behavior if profile editing retained.
P2 REL-017: optimize oversized initial/media bundles after measurements; M–L; do not rewrite framework.
P2 REL-018: community icon/description/category editor completeness; M; hide or disable honestly until accepted.
P2 REL-019: modest user-facing copy/visual consistency and supported accessibility review; M; no full 413-reference project.
P3 REL-020: Agent/real bots/connectors/reminders/egress; XXL; actual separate-host operations and cancellation/outbox acceptance.
P3 REL-021: all game rules/advanced multiplayer and complete native human sessions; XL–XXL.
P3 REL-022: personal providers/Real-Debrid registration, codec/EPG/provider failure; XL–XXL.
P3 REL-023: Windows/Intel, private calls, official together-player release and extended board archives; XXL.
P4 REL-024: clustering, billing, public room discovery/marketplace, cosmetic animation expansion; backlog, unestimated.
See POST_LAUNCH.md for dependencies/acceptance; do not convert these to V1 commitments.


## Private production continuation — 2026-10-12

REL-004 local test failure resolved (96 files / 666 tests pass); REL-005 current isolated signed-out desktop smoke passes. These do not certify authenticated or physical journeys. REL-015 critical Tinypool and moderate Vitest entries removed by the targeted toolchain update; one moderate packaging residual remains documented in DEPENDENCY_TRIAGE.md. REL-009 local lint/type/test/build/services baseline passes; hosted CI and RC provenance remain pending. REL-010 old preview.3 → preview.4 install-on-quit/next-launch was verified in main PR #3; fresh install, next candidate and interruption/recovery still open. Private scope retains DJ/current features under V1_SCOPE owner override. Historical public audit counts are not recomputed here.

## Hosted baseline / phase-two software update — 2026-10-12

REL-009 hosted Ubuntu and macOS jobs PASS at191bd37/run38312614543; provenance/signing/next-RC gates remain open. REL-001 local delayed microphone completion/error guards pass; physical owner/friend audibility still OPEN. REL-006 reaction-refresh account fencing and gateway merge regressions pass; normal-user/outsider real journeys still OPEN. REL-014 visual decode failure now retains poster/retry, native DEMO loop/recovery verified; packaged next-RC owner acceptance still OPEN. Phase-two full local suite672 tests and signed-out smoke pass. Public REL-002/003 and all413 references retain their independent open status.

## REL-008 local compatibility follow-up

Version1 structural read/write boundary and supported unversioned shape are locally verified; unknown versions cannot be silently reset. Synthetic poll/board/receipts and retained game table/history formats preserved. Real disposable PostgreSQL dump/restore gives identical state hashes. This does not close REL-008: actual historical production payloads, current encrypted full backup/objects/ledger restore and measured production RPO/RTO remain required. REL-006/007/003 also remain OPEN without disposable ordinary-account/mail/data-request evidence.
