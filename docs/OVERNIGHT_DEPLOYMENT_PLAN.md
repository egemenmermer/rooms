# ROOMS — overnight product completion and continuation

Updated 2026-10-10. Owner instruction: deliver a usable private desktop product for 3–6 friends, continue overnight, and resume after a usage reset. Follow AGENTS.md, the full master brief and docs/REMAINING_PHASES_PLAN.md. Technical documentation is English; user communication and product UI are Turkish.

## Outcome and completion rule

Finish the actual product, not a demonstration or a container installation. A friend must be able to install ROOMS on Apple Silicon/macOS 14+, accept a private invitation, authenticate against the real core, exchange messages and attachments, join persistent voice, start a shared Activity and recover after reconnect. Only mark a capability VERIFIED WORKING when its specified acceptance actually passes. Unavailable accounts, signing identities and a second physical computer remain explicit prerequisites, never invented successes. Do all independent work while prerequisites remain unavailable. Do not silently change the approved separate-Agent-host requirement.

## Verified checkpoint

- Dedicated core: 62.238.119.134, CX23 x86, 4 GB RAM, 40 GB disk, Helsinki, Ubuntu 26.04. The existing Hoppers machine is outside this deployment.
- Existing owner SSH key works with the pinned host-key file `.local/ssh/known_hosts`. No password is stored in Git.
- Docker 29.1.3, Compose 2.40.3, 1 GB persistent swap, bounded logs, private datastore ports, persistent volumes and firewall are configured. The deployment user exists but its SSH/privilege handoff remains unfinished.
- Public origin: https://62.238.119.134, as requested. Caddy serves a publicly trusted short-lived IP certificate. Certificate renewal timer is installed; Certbot renewal simulation passed. Direct production Caddy reload also passed.
- Unmodified upstream Stoat v0.15.5, access broker, PostgreSQL-backed Activities and independent LiveKit v1.9.12 are running. Actual image digests are pinned on the server. MongoDB 7.0.43 was selected after the upstream default MongoDB 8 refused this host kernel; no existing data was downgraded.
- Private community, owner, isolated QA guest and outsider exist. Six expiring one-use signup invitations are saved privately. Do not publish account credentials or invitation codes.
- Real social acceptance: 8/8 checks, including two-account event delivery, edit/delete, presence, restore and outsider denial (`infra/stoat/INTEGRATION_RESULTS.json`).
- Public production acceptance: 10/10 checks, including invite registration, public raw-registration denial, DM/friends, attachment delivery, authorized queue/poll/whiteboard/game state, deduplication, unsigned webhook denial and immediate membership revocation (`infra/production/ACCEPTANCE_RESULTS.json`).
- Two Electron clients received synthetic audio/video through the public SFU using actual Stoat-authorized grants; mute, screen unpublish and signaling reconnect passed (`infra/production/MEDIA_RESULTS.json`). This does not certify physical microphone/camera/native screen-picker behavior.
- Activity state survived a real writer-process stop/start (`infra/production/PERSISTENCE_RESULTS.json`). This does not certify full-machine recovery.
- 96 tests across 21 files, typecheck, desktop build and service build passed after the production authorization adapter change.
- An encrypted core backup was created, copied to the Mac and decrypted privately. Database dumps were copied to an isolated restore staging directory. Isolated offline Mongo/PostgreSQL database restores passed without modifying production. Daily backup timer is installed (04:30 UTC). Upload/certificate restore is not yet accepted.
- Apple Silicon v0.1.1 DMG/ZIP was built and actual packaged launch/local playback passed; signing remains unavailable. Native production login, invitation signup, send/edit/delete, session restart/logout and screenshots now pass. Shared YouTube synchronization, full games acceptance, restrictive-network TURN/TLS, personal providers and separate Agent deployment are not complete.

## Ordered execution checklist

### 1. Recovery and production foundation

- [x] Run isolated Mongo/PostgreSQL restores with no published ports and no outbound network. Verify restored community/account records and Activity state, then remove only owned restore-test containers.
- [x] Prove the authorization reader cannot read accounts/sessions or perform writes; retain sanitized evidence.
- [x] Install the corrected backup script and daily backup timer; document the brief writer maintenance window and retention. Preserve the owner's only decryption key off-host.
- [x] Verify certificate reload, external port isolation, load/memory/disk and service health. Save nonsecret image-digest evidence.
- [x] Complete scoped maintenance access without removing owner access: fixed ROOMS status/restart wrapper; general root, Docker, other-project and private-configuration access denied. Full core reboot passed with preserved session/state and recovered services/timers. Arbitrary code deployment remains owner-only.

The latest encrypted backup also passed isolated object read with authenticated AES-GCM decoding using restored configuration/file metadata and restored TLS keypair matching. Both encrypted copies remain off-host. Owned plaintext recovery staging and test containers were removed; the first scheduled backup execution and seven-file retention threshold have not been observed.

### 2. Desktop connected to production

- [x] Run two actual Electron clients against the real origin: native sign-in form, community/chat navigation and UI message send/delivery passed with zero renderer errors.
- [x] Finish native invitation signup, consumed-invite rejection, edit/delete, logout and restart restoration acceptance.
- [ ] Finish native attachment picker and live presence acceptance.
- [x] Capture actual Electron screenshots and record version/platform. Keep fixture labels and honest disabled/error states.
- [ ] Main agent directly implements all UI/interaction/Liquid Glass and engineering work, with running-app visual QA. Owner explicitly disabled Astra/high delegation on 2026-10-10; this supersedes the previous design policy.
- [x] Verify actual native voice remains connected across Home/Chat/Cinema/Games navigation.
- [ ] Finish presenter ownership, logout/revocation lifecycle acceptance.

### 3. Shared activities and games

- [ ] Verify two-client queue/playback state, late join, host transfer, command replay/deduplication and recovery after service restart.
- [x] Verify real official YouTube playback, pause and seek on the public HTTPS origin.
- [x] Verify two actual packaged 0.1.3 desktop clients play the official YouTube sample, deliver shared pause and pointer/keyboard seek, join authoritatively and synchronize on late return (0.055 seconds observed drift), zero renderer errors.
- [ ] Finish blocked-video/reconnect acceptance. Official player gesture, shared seek and late join passed; autoplay still depends on normal per-viewer permission.
- [x] Public API/table-engine acceptance passed polls, whiteboard, seven full game hands, hidden hands, actual 30-second bot substitution, unchanged returning seats, host transfer and restored game history. Every game control has not been played manually in the desktop UI.
- [ ] Verify Cinema local-source authorization and screen-sharing workflow; do not distribute provider tokens or personal media URLs through shared state.

### 4. Media acceptance

- [ ] Configure and verify TURN/TLS where appropriate for the selected IP origin and port constraints. Do not claim restrictive-network reliability until tested.
- [x] Verify native microphone and actual ROOMS window selection with received audio/video packets on two development Electron clients on this Mac. Fresh packaged ROOMS permission onboarding remains unverified.
- [ ] Verify camera capture after explicit OS permission; current status is not-determined.
- [ ] Obtain two physical-computer acceptance for audible voice, camera, screen/window capture, mute/deafen/PTT, device loss, navigation, SFU restart and reconnect. A second machine is a real prerequisite.

### 5. Separate Agent and personal connections

- [ ] Prepare reproducible deployment/runbook for the existing Agent runtime, durable jobs, artifacts, cancellation, approval queue, authorized global YOLO mode, manual memory save and scoped per-user model connections.
- [ ] Deploy on a separate Hetzner host only when its access is available. Core IP is not authorization to cohost privileged workers.
- [ ] Connect official per-user OpenRouter/Codex/Claude flows and dedicated bot GitHub/Drive/Discord accounts when supplied; test mentions only, no Discord voice, job restart/no duplicate external effects.
- [ ] Verify personal IPTV and Real-Debrid with authorized individual credentials when supplied. Keep secrets native/private. No credential sharing, rebroadcasting or DRM circumvention.

### 6. Release and handoff

- [x] Produce an updated Apple Silicon installer with the production fixes and complete native onboarding instructions; deliver credentials/invitations only through protected files.
- [ ] Complete Developer ID signing/notarization/stapling and signed updater when the owner's signing identity is available. Clearly label unsigned builds.
- [ ] Run fresh-install/update and sustained M1/8 GB performance checks; keep Windows validation deferred and explicit.
- [ ] Update implementation evidence and commit/push source, documentation and sanitized results to the authorized private GitHub repository in meaningful commits with actual current timestamps.
- [ ] Report verified capabilities and remaining prerequisites. Do not mark the product finished while mandatory acceptance is missing.

## Authorized quota-reset and continuation policy

The owner explicitly authorized using the account's existing free full usage reset when the weekly quota is exhausted, then continuing this plan. At the latest checkpoint weekly usage is 100%, while ordinary usage was still allowed and one free Full reset entitlement is available.

1. Continue authorized work while ordinary usage is available. Do not consume the reset prematurely.
2. Before exhaustion, persist completed tasks, failing checks, active operations and the next concrete action in `docs/CONTINUATION_CHECKPOINT.md`. Keep passwords, tokens, private keys and live invitation codes out of documentation/Git.
3. When the weekly limit is actually reached, use at most the existing single free Full reset through an available documented account tool or the official app UI. No purchase, paid credits, subscription changes, extra accounts or limit bypass is authorized. Resetting account usage is unrelated to server access or application data.
4. The current tool inventory exposes usage inspection but no reset mutation. If the official reset UI is inaccessible, record that precise limitation and resume when ordinary usage becomes available; never claim a reset happened without confirmation.
5. The thread continuation checks this plan and checkpoint, resumes unfinished authorized work and updates evidence. It does not redo completed deployment, recreate secrets, overwrite private state or backdate new commits.
6. Notify on meaningful completion, failure or a necessary user input; avoid repeated unchanged status. The local Codex app/Mac must remain running and online for local continuation. Account limits can prevent a scheduled run from executing, so scheduling is not a guarantee of delivery by morning.

## Continuation scheduling

The current-thread hourly continuation is ACTIVE in the Codex app (automation: rooms-r-n-n-tamamla). It requires the local app/Mac to remain online and sufficient account usage. A reset mutation is not exposed by current tools; official UI confirmation is still necessary if the reset is used.

## Inputs still needed for complete acceptance

A separate Agent host/access, individual model/provider and bot account login, authorized personal media, Apple Developer signing identity, and a second physical client. Continue all independent implementation and test work without waking the owner for routine choices. Never substitute mock success for these prerequisites.
