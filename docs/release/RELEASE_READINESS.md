# Release readiness
2026-10-12 · baseline 06f5477 · public V1 decision: NO-GO.

**Overall: 55/100** (unweighted category mean 775/14 = 55.36, rounded). A decision aid, not measured percentage of code completed.
**Open P0: 3. Open P1: 12.** These are release work packages/gates, not 15 independently reproduced code bugs. No new confirmed authentication bypass or data-loss exploit was found.
P0-002 is closed by an approved removal of unsupported DJ extraction; P0-001 closes with actual core media evidence, not necessarily a code change; P0-003 requires privacy/data operations.
No P0/P1 may remain open at public V1.

| Category | Score | Evidence limiting readiness |
|---|---:|---|
| Core product | 70 | Real production history; newest physical voice/chat journeys open |
| Feature completeness | 65 | Large working surface; Agent/providers/invite admin and secondary workflows incomplete |
| UX/UI | 65 | Actual intentional onboarding; stale references, partial editors and old copy/blank DJ reported |
| Stability | 55 | Recent mic/cache/session repairs; current nightly/physical failure recovery absent |
| Testing | 65 | 663 pass; 2 fail, desktop E2E obsolete, fixtures not deployment proof |
| Security | 60 | Strong IPC/auth/URL boundaries; dev advisories, latest multi-user negative gates open |
| Performance | 45 | Main JS 1.355 MB, personal-media chunk 644 KB; old short soak only |
| Data/database | 65 | PostgreSQL persistence and historical restore; unversioned JSON snapshots/upgrades/retention unclear |
| Deployment | 75 | Live trusted TLS/service responses, deployed-core history; clean full provision not rerun |
| CI/CD | 20 | No workflow/lint task; feature/main/version divergence; signing tied to developer workstation |
| Observability | 35 | Health/diagnostics/fatal reload exist; request loggers disabled, no demonstrated alert/crash collection |
| Documentation | 60 | Extensive evidence, stale README/feature/upstream/manually run guidance |
| Legal/privacy | 20 | No public privacy/terms/deletion flow found; DJ provider/asset rights unresolved |
| Release infrastructure | 75 | Installed notarized preview and signed appcast; fresh install/update/rollback cycle open |

## Distance to launch
Recommended constrained V1: **20–35 focused developer-days**, approximately **4–7 working weeks** for one experienced engineer with owner QA/support participation. Confidence LOW; repository/current local verification HIGH, production-core history MEDIUM, launch forecast LOW.
Internal beta of the constrained core: plausibly 5–10 focused days after scope freeze and device availability, contingent on no fundamental media defect. Public V1 requires the complete 20–35-day work range plus any external legal/account/device wait. No calendar launch date is defensible.
Keep Agent, all media providers, all games, YouTube audio extraction and Windows in V1: forecast 45–75+ developer-days, LOW confidence, requires decomposition and external credentials/platform acceptance.
Rough planning allocation, not additive independent tickets: baseline/scope 2–4d; core failures/acceptance 5–9d; data/security/observability 4–7d; release/onboarding/support 4–7d; RC soak/recovery 3–5d; 2–3d integration contingency overlaps these workstreams.
Assumptions: preserve Stoat/Electron/LiveKit, one authoritative Activity process, one supported Mac platform, six-user initial room target, no paid launch/billing, no new integrations or design fidelity project. A severe physical media failure or restore incompatibility invalidates the estimate.
The major gap is coherent current acceptance and operating the public product reliably, not lack of foundational code.


2026-10-13 DJ source update: exact owner single and ten-track playlist now pass current Linux source/worker/SFU/pause/resume/next/stop. Owner confirms both playlist tracks audible in real Lounge. Music-only dedicated-account upstream bridge/private parser deployed; health200 and encrypted rollback retained. See DJ_YOUTUBE_BRIDGE_FIX.md and receipts. No desktop publication; release HOLD and remaining physical/UI/game/share acceptance stay open.
