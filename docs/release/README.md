# Initial release audit — 2026-10-12

Snapshot: reference implementation `06f5477`. These are dated audit findings, not an automatically updated release dashboard. No implementation was performed by the audit.

| Document | Purpose |
|---|---|
| [Main report](AUDIT_REPORT.md) | Complete 20-section audit and decision |
| [Current state](CURRENT_STATE.md) | Architecture/product/evidence snapshot |
| [Readiness](RELEASE_READINESS.md) | Category scores, issue counts and work estimate |
| [V1 scope](V1_SCOPE.md) | Proposed must/should/cut/deferred scope |
| [Blockers and issue database](RELEASE_BLOCKERS.md) | 3 P0 / 12 P1 work packages and verification |
| [Roadmap](ROADMAP_TO_V1.md) | Dependency phases, critical path and next task |
| [QA matrix](QA_MATRIX.md) | Journey-by-journey verification and gaps |
| [Release gates / DoD](RELEASE_CHECKLIST.md) | Exact stage gates and Definition of Done |
| [Post-launch](POST_LAUNCH.md) | Deferred work and scope-creep protection |
| [Feature inventory](FEATURE_INVENTORY.md) | Complete implemented/partial/unknown taxonomy |
| [Git history](PROJECT_HISTORY.md) | Actual visible phases, branches/tags/unfinished work |
| [Evidence](EVIDENCE.md) | Exact checks, failures, limits and safety boundaries |

Audit UI evidence: [signed-out onboarding](evidence/audit-onboarding.png), [signed-out Agent entry](evidence/audit-agent-signedout.png). Neither proves authenticated integration or physical transport.

For the project explanation start at [the project handbook](../project/README.md). Private audit files are intentionally excluded from the public documentation generator.

## Sparkle follow-up

[Native old-to-new update acceptance](SPARKLE_UPDATE_ACCEPTANCE.md) verifies preview.3 → preview.4 installation on normal quit and next launch. Sparkle integration is tracked separately from the initial audit and broader fresh-install/interruption gates.
