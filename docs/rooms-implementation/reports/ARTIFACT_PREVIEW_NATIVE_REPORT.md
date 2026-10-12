# S57 authorized artifact text preview

Implemented 2026-10-10. Owned changes: bounded additions to `packages/agent-contracts/src/index.ts`, `apps/services/agent/server.ts`, `apps/desktop/electron/agent.ts`, two focused test files and this report. Existing storage required no repository format change. No renderer/preload/shared/router changes, external source fetches, production calls or remote mutations.

## Reference review

Read BRIEF, current ASSISTANT_REPORT, S57 handoff source brief and `05_prototype/assistant.js` S57 implementation. Opened each immutable original individually: `S57_assistant_result_files.png`, `__empty.png`, `__preview_error.png`, `__sources.png`. Prototype sources are expressly fictional; none were imported as real source records.

## Stable contract

`AgentBridge.previewArtifact(taskId: string, artifactId: string): Promise<AgentArtifactPreview>`.

IPC: `rooms:agent-artifact-preview(taskId, artifactId)`.

HTTP: `GET /v1/tasks/:id/artifacts/:artifactId/preview`.

Exported `agentArtifactPreviewSchema` validates a strict discriminated union. Every state has the exact requested `taskId` and `sourcesAvailable: false`:

- `text`: `artifact: {id,name,mime,size}`, `text`, `encoding:'utf-8'`.
- `unsupported`: same artifact metadata, `reason:'unsupported-type'|'invalid-text'|'active-content'`.
- `too-large`: same metadata, `reason:'preview-size-limit'`.
- `unavailable`: `artifact:null`, `reason:'artifact-unavailable'`.

Metadata `name` is display basename only; `size` is measured from actual storage, not trusted from the recorded artifact size. Missing/unauthorized task/artifact IDs are HTTP authorization/not-found errors, never metadata-bearing preview states. A recorded artifact whose storage cannot be safely opened yields unavailable without a filesystem error or path.

Root should render `text` literally in a text node/preformatted document surface. Do not interpret it as HTML, execute it, embed it, automatically link/load remote resources, or fetch Markdown images. No Markdown/HTML rendering library is introduced. The contract supports genuine text preview; unsupported formats can retain the existing explicit download action. Sources remain unavailable because the task repository has no persisted source list. Empty artifacts are already represented by actual task metadata, not a fake preview.

## Storage, content and authorization

- Uses the exact existing task room authorization and download storage reader. Existing authorized same-room members can access artifacts regardless of initiating owner; this batch neither widens access nor silently changes it to owner-only. Private model connections remain unrelated.
- Reauthenticates after file preparation and checks the same principal and room again before returning content. Revocation during the async boundary rejects the response.
- Reuses `safeWorkspacePath` and `readWorkspaceArtifact`: relative allowed filenames, workspace containment, no traversal/symlinks, regular files. Production Linux uses directory descriptors and no-follow opens; the existing local macOS reader is explicitly for nonexecuting fixtures. Production platform policy is unchanged.
- `AGENT_ARTIFACT_PREVIEW_LIMIT=262144` bytes (256 KiB). Checks actual storage size before reading, then actual read byte length. The existing download reader independently caps storage reads at 10 MB, including a file that grows between the preview size check and read. Preview output never truncates or exceeds 256 KiB.
- Passive extension allowlist: `.txt`, `.md`, `.markdown`, `.csv`, `.tsv`, `.json`, `.yaml`, `.yml`, `.log`.
- MIME allowlist: `text/plain`, `text/markdown`, `text/csv`, `text/tab-separated-values`, `application/json`, `application/yaml`, `text/yaml`, `application/octet-stream`. Octet-stream is accepted only with a passive extension because actual worker artifact discovery currently labels files this way. Declared HTML/SVG/JavaScript and their extensions are rejected.
- Strict UTF-8 decoding rejects malformed bytes. Binary control characters and recognized active document markup (`html`, `script`, `svg`, `iframe`, `object`, `embed`, HTML doctype) are unsupported. This is not a claim that arbitrary content was semantically sanitized: all accepted content still must be displayed literally.
- JSON response uses `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. No raw workspace path, storage exception, credential configuration, task prompt or invented source data is added to preview metadata.

## Native boundary

Trusted frame and development fixture guards apply before work. Task/artifact UUIDs are validated; the strict output schema rejects extra fields and over-limit text. Native preview JSON stream is capped at 1,700,000 bytes, allowing worst-case JSON escaping for the bounded text. Returned task/artifact IDs must match the request. The existing request helper now supports that optional response cap without changing other operations.

The initiating account and exact server connection object are captured before async identity validation/fetch and checked after the body completes. A different account or reconfigured server rejects the pending preview. Tokens remain native headers and never enter the result. Existing download behavior is preserved; this change does not automatically save/open artifacts.

## Focused verification

Command at 14:57:02:

`pnpm exec vitest run --config vitest.config.ts tests/agent-artifact-preview.test.ts tests/agent-preview-native.test.ts tests/agent-service.test.ts tests/agent-authority.test.ts`

Result: 4 files, 18 tests passed.

Five new service tests use a temporary encrypted repository, actual temporary artifact files and isolated loopback HTTP. They verify real UTF-8 bytes and actual file size, same-room authorized reading, outsider rejection, post-read revocation, exact 256 KiB boundary and forged recorded size, active extension/MIME/content rejection, invalid UTF-8/binary control rejection, and traversal/symlink defense without filesystem-path disclosure.

Four native tests mock Electron and fetch only, verifying trusted frame/fixture/input/output scope checks, stale initiating account, stale configured server and oversized wire rejection. Existing service/authority tests passed. These are meaningful local protocol/storage/native-boundary checks, not a deployed two-client or physical desktop acceptance claim. No full build/typecheck was run in this batch; renderer integration and manual S57 acceptance remain coordinator/owner work.

## Follow-up: download identity and save-dialog lifetime

Fixed the related existing native artifact download boundary on 2026-10-10. The handler now validates both UUIDs, captures initiating social identity and exact agent connection, uses that captured connection for the nonredirecting download, and checks it after headers, every body chunk, before the save dialog, after the dialog and immediately before the synchronous write. A logout/account switch or connection replacement rejects the operation. No destination file is opened while waiting for the dialog or authorization.

After the save dialog returns a destination, the native handler calls the real read-only artifact preview endpoint again through the identity-checked request helper. This reauthenticates against current server access and checks the same task/artifact/room before any write, including files whose preview format is unsupported. Unavailable storage, missing artifact, revoked access, wrong scope or changed identity prevents writing the previously downloaded bytes. Existing room visibility and the 10,000,000-byte download cap remain unchanged; no server/repository changes were needed for this follow-up.

Focused command at 15:01:06: `pnpm exec vitest run --config vitest.config.ts tests/agent-preview-native.test.ts` — 10/10 passed. Added cases verify successful exact bytes after final authorization, account loss during streaming before dialog, account/server changes while the save dialog is open, room access revoked during the dialog, invalid IDs, and the retained download byte cap. Failure cases assert no destination file was written. Electron/network are mocked; actual local temporary file writes are checked only in the successful fixture. No physical save-dialog or production acceptance claim.
