# Private release toolchain triage — 2026-10-12

Baseline: source 3d5d4bc with the preserved phase-one patch. Node 22.22.0, pnpm 11.25.0, ESLint 10.12.0, typescript-eslint 8.70.0, Vitest/mocker 4.1.11. No exploit reproduction was run.

## Install failure and compatible correction

Frozen install and verify:ci both stopped before lint/tests: tsconfig-utils/types 8.71.2 were published at 17:07 UTC within the minimum release age. project-service 8.70.0 had resolved these through compatible ranges. Workspace overrides now constrain only those two transitive packages to the existing 8.70.0 family. The lockfile reuses their existing integrity records and removes only the rejected nodes; pnpm normalized it and successfully verified all 647 entries. Frozen installation subsequently passed. No age exception, trust bypass or full lockfile regeneration was used. The original four tool-version exclusions predate this continuation and were not expanded.

## Advisory disposition

- [Vitest/mocker GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9): unauthenticated standalone mocker WebSocket registration can disclose files. The upstream patch starts at 4.1.11, now pinned. This project runs unit tests, not an exposed standalone mocker server.
- [Tinypool GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) and [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr): require a prototype-pollution primitive before worker-option/module resolution. The updated Vitest graph removes Tinypool, rather than forcing an incompatible pool replacement. Both previous critical entries are absent from the current audit.
- [sprintf-js GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c): one remaining moderate, development-only entry; no published patch. Path: electron-builder → app-builder-lib → @electron/get → global-agent → roarr → sprintf-js 1.1.3. An attacker-controlled **format string** is required. Inspected global-agent logger calls use fixed format messages and pass URL/error/response fields as context, rather than as format strings. ROOMS application code does not import sprintf-js. This is a scoped reachability assessment, not a blanket dependency safety claim. Reassess on packaging dependency changes; do not suppress the registry finding.

`pnpm audit --json`: exit 1, one moderate, zero high/critical. CI fails for high/critical advisories in both the production and complete toolchain graphs. Full audit findings remain visible here, including the moderate packaging residual. GitHub-hosted verification uses no signing/notary/provider/production credentials, read-only repository permissions and checkout without persisted credentials. Never execute unreviewed fork changes on the signing workstation; hosted CI passing does not authorize signing them.

Local private logs: .local/production-continuation/install.log, frozen-install.log, audit.json and audit-prod.json. Sanitized results are recorded in EVIDENCE.md. Do not upload environment/session material.
