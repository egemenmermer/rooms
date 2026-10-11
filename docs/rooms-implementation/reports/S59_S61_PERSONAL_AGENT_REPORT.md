# S59–S61 personal Agent connections and explicit room memory

Date: 2026-10-10. Implementer: assigned GPT-6.1 Sol agent. No publication or remote service mutation.

## Sources studied

Read the master prompt, both visual-reference documents, AGENTS.md, current reference brief/checkpoint/decisions/progress, the 11 flow contracts, and editable `05_prototype/assistant.js` / associated CSS. Individually reviewed these immutable original PNG groups:

- S59 personal model connections: main, expired, limit, waiting, claude_waiting, choose, error, empty.
- S60 GitHub/Drive connections: main, scope, drive_scope, error, empty, revoked.
- S61 room memory: main, source, save, delete, empty, permission.

Primary flow relevance: F08 (own model, official login, expired/limit/error, explicit new task), F09 (external grants, explicit memory and source access), F11 (lost access, unavailable dependencies and recovery). All 20 records have explicit DEV projections; no unsupported variant silently falls back.

## Production implementation

- S59 uses dedicated provider rows, owned model metadata, transient key entry, explicit model selection, official server-login management modal and confirmed disconnect. Other-owner metadata is filtered. API credentials clear before awaiting native IPC, and are never read back or persisted by this UI. Route selection can only select a current own ready connection; it does not submit a task, change accounts or retry external writes. Disconnect uses the actual native boundary.
- S60 reads the current room/user Agent authority snapshot. GitHub repositories and Drive resources display read/write grants with per-operation approval or the existing YOLO policy. Identity/room mismatch and access invalidation hide private resources. Scope review is read-only. An authority grant never becomes a fabricated connected OAuth identity.
- S61 replaces the old memory workbench with explicit save, current-source preview and confirmed deletion. Ordinary chat and bot conversations are not automatically saved. The root separately removed both server prompt/result insertion and the executor remember callback; explicit user-saved notes remain the only room-memory writes. Source-backed saved content stays redacted until fresh social permission/message checks authorize it. Previews re-fetch the source instead of displaying cached memory content. Saving from a message reauthorizes and uses the fresh message text; returned room/author/source identities must match. Deleting memory never deletes the social message. Scope loss/unmount discards in-flight private results.
- Styling follows the reference’s restrained opaque settings materials, provider symbols, row separators, purple/green/amber status treatment, compact fields, dialog footers, focus rings and narrower-width reflow. No full-screen PNG implementation.

## Honest integration differences from originals

- The server’s model-registration success does not verify a provider request. The UI says `Kaydedildi` and explains model access is checked during a task, rather than falsely using a verified connection badge. It does not show a fictional stored-key mask or a decorative verification action.
- Official Codex/Claude login must be completed on the separate Agent server. The current bridge has no login-launch/status-session mutation. The modal can register model configuration or refresh status; it has no password/subscription-token field and never claims an external login was launched.
- The authority API has no personal OAuth connection state, account profile or scope-edit mutation. Connection and save-scope actions remain disabled with this precise reason. Scope resources are actual server grants in production, not personal URLs or invented linked accounts.
- The memory contract has no separate title, retention-policy field, or retention mutation. Rows use a concise generic note/message title. The UI does not fabricate retention controls or automatic expiry. Source validation currently resolves messages in the most recent native channel-message page; older unloaded/missing sources fail closed instead of claiming accessibility. The owner’s no-bot-memory choice takes precedence over any reference auto-memory suggestion.
- DEV samples are explicit local demo previews and receive no native mutation bridge. A development fixture is not proof of any remote provider, account or two-client operation.

## Local evidence

`pnpm exec vitest run --config vitest.config.ts tests/s59-s61-personal-agent.test.tsx --reporter=json --outputFile=/tmp/rooms-s59-tests.json`

Result: 36 passed, 0 failed. This focused suite covers all 20 DEV projections plus owned model filtering/no fallback, transient secret clearing, wrong-owner receipts, scope invalidation, disconnect confirmation, absence of official-login credential fields, read-only grants, wrong-account/room hiding, explicit-only writes, source redaction/fresh preview, explicit source save, note-only delete and late-result discard. This is local component evidence, not external provider or physical-device acceptance.

`pnpm typecheck` completed with exit code 0; output was `$ tsc --noEmit` with no diagnostics at `/tmp/rooms-s59-types.log`. Root remains responsible for final aggregate type/build checks after subsequent shared-file integration.

No application screenshots, original/application overlays or pixel-match acceptance are claimed here. Root capture integration still needs S59/S60 settings placement and mapping of `/agent?fixture=S59|S60|S61&variant=…`. Account/provider verification, separate Agent host, official CLI sessions, owner acceptance, Windows/device validation, signing and distribution remain independent gates.

## Owned files and integration handoff

- `apps/desktop/src/Agent.tsx`: exported AgentModelsSurface/AgentConnectionsSurface/AgentMemorySurface, AgentConnectionsContainer; models settings integration; memory/connections workspace routing; generation guards.
- `apps/desktop/src/reference-agent.css`: S59–S61-specific styling appended; S62 rules preserved.
- `apps/desktop/src/dev/S59S61Entry.tsx`: exact 20 development projections and explicit DEV-only dispatcher.
- `tests/s59-s61-personal-agent.test.tsx`: focused local boundary/projection tests.
- This report.

Root alone owns App.tsx, main.tsx, capture-reference.mjs, native/shared contracts and tracker. No tracker state was changed by this agent.
