# Private release phase one — 2026-10-12

Recorded before repair: REL-004 failed two DJ tests because the mock lacked participants; REL-005 waited for removed .hero UI; lint/CI absent; final attempted verification stopped at the two too-recent typescript-eslint transitive nodes. Historical audit evidence remains unchanged.

## Current local results

Node 22.22.0, pnpm 11.25.0, Vitest 4.1.11, ESLint 10.12.0, typescript-eslint 8.70.0. Preserved original patch plus two targeted compatible transitive pins.

| Command | Result / scope |
| --- | --- |
| pnpm install --frozen-lockfile (before correction) | FAIL minimum release age, before tests |
| pnpm install --no-frozen-lockfile (pins + corrected lock entries) | PASS, all 647 entries pass supply-chain policy; no bypass |
| pnpm install --frozen-lockfile | PASS |
| pnpm verify:ci | PASS exit 0: lint, typecheck, all 96 test files / 666 tests, production renderer/notices/Electron build, four service builds |
| pnpm test:desktop --grep 'desktop shell' | PASS exit 0, current signed-out Electron onboarding/invalid invite/settings discard/empty Cinema/IPC isolation; separate random profile removed on normal close |
| pnpm audit --prod --json | PASS zero advisories |
| pnpm audit --json | Exit 1, one moderate dev packaging residual; zero high/critical; DEPENDENCY_TRIAGE.md |
| pnpm audit --audit-level=high | PASS exit 0; moderate remains reported |

Build warnings about mixed dynamic/static imports and oversized chunks remain; no performance acceptance. No authenticated test, fixture account provisioning, two-Mac media, signing, package publication or production service mutation. 413 reference records remain NEEDS_RECHECK.

## CI

Workflow has credential-free Ubuntu baseline (lint/type/test/build/services and full/production high-severity audit) and macOS native signed-out smoke. Checkout credentials are not persisted, repository permissions are read-only. Hosted execution is pending the source push; workflow existence is not CI acceptance. Signing and production credentials are excluded.
