# Release gates and exact Definition of Done
All unchecked at baseline unless evidence explicitly stated. No public release from score alone.

## Stage gates
- Alpha → internal beta: approved platform/scope; no production fixtures; core two-Mac auth/chat/voice happy paths; known failure list and private users informed of limits.
- Internal beta → release freeze: P0 closed; all retained core flows and data/security negatives pass; latest crash/reconnect issues triaged; deferred entry points removed; privacy/data/support process ready.
- Freeze → RC: one immutable commit/tag/version/service-digest manifest; clean type/lint/tests/builds; repeatable deployment/config/data upgrade; signed/notarized artifacts and checksum record.
- RC → public: zero open P0 and zero open P1; physical media, fresh install/update, capacity/soak and backup/rollback evidence attached to that exact candidate; owner accepts UX/platform limits and operator/legal reviewer accepts disclosures/licensing. No waived P1 silently carried.
- Public → feature expansion: monitoring/support owner active, scheduled backup success/restore health, severe launch issues addressed.

## V1 exact DoD
- [ ] Approved V1_SCOPE; every retained route/menu/shortcut communicates actual availability; no synthetic production presence/media/data or enabled inert action.
- [ ] Release provenance binds source SHA, tag v1.0.0, semantic app version, build number, service/image digests, DB/schema compatibility and artifact hashes. Package.json default/version override consistent.
- [ ] Clean dependency install from frozen lock on independent machine; required native build prerequisites known; Node/pnpm versions documented. No unexplained bootstrap step.
- [ ] Typecheck, meaningful lint, full tests and current native smoke pass; no masking test failures. All applicable high/critical dependency/security risks remediated or technically eliminated with evidence.
- [ ] Renderer/Electron/four service builds pass for retained scope; Windows is neither advertised nor required for Mac-only release.
- [ ] Fresh full-stack setup and existing-data upgrade succeed on owned staging; invalid config fails safely; one Activity writer enforced; raw account-create API private; DB/Mongo privileges scoped.
- [ ] Latest ordinary-user invite/signup/login/restore/logout/password-reset flows pass, including expired/used invite, uncertain registration, unavailable server and expired session.
- [ ] Two distinct packaged accounts verify messages/history/edit/delete/DM/upload/friend lifecycle/profile; outsider/removed user cannot access channels, media, cached private data or moderation writes.
- [ ] Two physical supported Macs verify audible voice both ways, mute/deafen/PTT, device loss/recovery, navigation-independent voice, permission refusal and leave/logout cleanup. Restrictive-network reconnect/TURN passes.
- [ ] Camera/screen/system audio retained only where physically accepted; explicit source consent, delivery stats and actual receiver output; stop/revocation ends publication, no duplicated or zombie tracks.
- [ ] Retained polls/board persist across navigation/restart/service recovery with authoritative revisions/idempotency; unauthorized/late result rejected.
- [ ] Signed-out, empty, loading, timed-out, offline, denied and failure states offer accurate recovery. 900x700 and larger supported layouts/keyboard/focus/reduced effects accepted; owner UX acceptance recorded.
- [ ] Proposed performance gates accepted or replaced with measured documented targets: cold useful screen ≤5s on target M1/8GB; warm navigation ≤500ms; total Electron working set ≤1GiB for core voice/chat session; no sustained idle CPU >5%; 2h session shows no unbounded memory/listener growth. These targets were not measured/passed during this audit.
- [ ] Initial six-real-identity room/session target passes without sustained rate limiting or data loss; operator documents conservative capacity. Measured actual media quality, not requested max dimensions.
- [ ] Current encrypted DB/object/ledger/config backup restore on isolated host passes; retained user content readable; RPO≤24h and target RTO≤4h measured or explicitly revised before launch. Scheduled backup alerts and off-host copy verified. Account deletion exclusions/backup expiry explained.
- [ ] Fresh Mac installer and older Sparkle-enabled client update pass; signatures, Apple Accepted, staple, Gatekeeper, appcast Ed25519/archive validation all succeed for exact RC. interrupted/low-disk update leaves a usable prior install/data.
- [ ] Safe rollback preserves user data and compatible schema; operator rehearses rollback and knows which previous artifact/service snapshot to restore.
- [ ] Sanitized logs/error categories/build IDs/dependency readiness and uptime/TLS/backup/disk alerts observable; isolated fault drill produces useful signal. No tokens/cookies/message contents in alerts.
- [ ] Privacy/terms/retention/export/deletion/contact and abuse/moderation process accessible before account creation; sacrificial-user data request rehearsal passes; server-trust/no-E2EE boundaries explicit.
- [ ] Dependency/backend source licenses, bundled notices/fonts and every shipped image/video distribution right reviewed; unsupported provider extraction disabled.
- [ ] Public download/release notes/support/platform/known limits current; independent engineer can provision and recover following documentation.
- [ ] RC stays frozen after acceptance; any code/service/config change reruns affected gates and invalidates incompatible evidence.
- [ ] Owner/operator approve final public release as a later action; tested immutable artifacts are those published. Post-launch incident/monitoring owner assigned.

Current audit evidence is in EVIDENCE.md. A checked historical capability does not close an unchecked latest RC gate.
