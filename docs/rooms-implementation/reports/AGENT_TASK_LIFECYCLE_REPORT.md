# Agent task surface lifecycle regression checks

2026-10-10. Scope owned: new `tests/agent-task-lifecycle.test.tsx` and this report only. Read actual `AgentTaskSurface.tsx`, existing artifact lifecycle tests, Modal implementation and root integration boundary. No app, service, native or shared contract source was edited.

## Focused evidence

Command: `pnpm exec vitest run --config vitest.config.ts tests/agent-task-lifecycle.test.tsx`.

Run started 15:15:12; 1 file, 16 tests passed. The tests render the actual `AgentTaskSurface` and actual shared Modal in jsdom. Bridge callbacks are explicit local spies, and authored task/artifact content is local fixture data.

Covered behavior:

- Delayed former-account preview is discarded after user identity changes.
- Delayed former-server/access-epoch preview is discarded when root-supplied `scopeKey` changes; disconnect also rejects the old response.
- Preview markup stays literal; it produces no image/script/iframe node or remote resource.
- Both channel-access and community-management invalidation events erase visible preview and uncertainty drafts/checkboxes, close the dialog and block later recovery calls.
- Delayed preview completion after invalidation never restores revoked text.
- Approve, cancel and verified-result recovery are allowed for the initiating owner or supplied authorized manager and blocked for another nonmanager. Successful calls send actual task/operation IDs and trigger refresh only after receipt.
- Confirm-not-applied recovery needs an explicit checked acknowledgement and sends the exact resolution.
- Explicit fixture prop and fixture URL suppress all tested native calls, including preview/download/approve/cancel.
- Pending approval completion after scope replacement does not refresh the new scope.
- Rejected approval keeps its dialog/error and never invents a successful refresh.

No server/hardware/production acceptance was inferred. Native download was not rerun; its earlier evidence remains in ARTIFACT_PREVIEW_NATIVE_REPORT. Root must supply an account/server/access scope key as documented by the component; these tests do not claim an independent native account subscription inside this presentational surface.

## Reviewed source finding and coordinator correction

After permission invalidation, task-view artifact download buttons omit `invalid.current` from their disabled expression. The internal `run()` guard safely prevents native calls, but the button can remain visibly enabled and silently do nothing. Result retry/download controls can likewise become enabled after selecting a file again. This is action-availability/copy correctness, not a demonstrated native authority bypass. Requested root/Sol correction: include invalid authority in these controls' disabled states and expose the precise reauthorization reason. No app source was changed by this agent.


The coordinator corrected the reviewed action-availability issue in the app. Both invalidation tests now additionally assert that result download/retry remain disabled after reselecting an artifact, task download remains disabled, and task/result download controls expose the access-revalidation reason. The 15:18:00 rerun completed 15 cases successfully; one multi-step invalidation case exceeded Vitest's default 5-second timeout (12.5 seconds wall time) while the suite took 106 seconds under host contention. No assertion failure was reported. Only that multi-step case received a bounded 30-second test allowance before the final rerun; assertions and app code were not weakened.

Final focused rerun started 15:21:02: all 16/16 passed, including the coordinator's disabled/title correction assertions. Test process exited 0. The source finding is resolved in coordinator-owned app code; this agent changed tests/report only.
