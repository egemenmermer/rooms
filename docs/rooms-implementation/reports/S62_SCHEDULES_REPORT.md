# S62 one-shot schedule implementation — 2026-10-10

Status: IMPLEMENTED, local component checks passed; exact visual review, real-account and owner acceptance remain pending.

## Scope and reference review

Read project instructions, reference implementation brief/checkpoint/decisions, desktop master prompt, visual-reference Markdown/HTML, and the immutable S62 default/create/created/cancel/cancelled/completed/failed/empty original PNGs. Inspected F10 handoff flow and the current AgentBridge/server runAt/cancel contract.

Changes are limited to `apps/desktop/src/Agent.tsx`, `apps/desktop/src/reference-agent.css`, new DEV `S62SchedulesEntry.tsx`, focused `tests/s62-schedules.test.tsx`, and this report. Shared shell/router/native services/contracts/tracker were not edited by this assignment. Existing unrelated working changes are preserved.

The dedicated `/agent?tab=schedules` surface renders actual one-shot model tasks and source-message reminders with `runAt`, status-derived counts, dated cards, terminal history, and real result navigation. `/agent?tab=schedules&view=create` addresses the create dialog; `view=cancel&scheduleTask=<id>` addresses the cancellation review. A `created` URL alone never produces a success message: it requires a current, validated submit receipt. `cancelled`, `completed` and `failed` presentation follows actual task records; query strings never change server states.

Create explicitly submits a future ISO `runAt` and an own, connected, user-selected model. Invalid local calendar/DST-gap normalization, past instants and the actual server's 365-day horizon are rejected. Cancel requires own-task or manager authority and validates task/room identity in the returned receipt. A cancellation/start race is delegated to the existing server: if it returns a different state, the UI does not invent cancellation. Late receipts after account/room/disconnection/access changes are discarded. No renderer timer executes work, recurring schedule, automatic retry, cron or event trigger was introduced.

## DEV boundaries

The eight deterministic projections live only in `apps/desktop/src/dev/S62SchedulesEntry.tsx` and are imported through an `import.meta.env.DEV` lazy boundary in AgentWorkspace. Example: `?fixture=S62&variant=create#/agent?tab=schedules`. They use the actual production component with no AgentBridge and visible `Yerel demo önizlemesi` labeling. Mutations and real-result opening are precisely disabled. Unsupported variant names throw. Shared shell/capture allowlist integration belongs to the root owner and remains outside this assignment.

## Honest reference differences and integration limits

- AgentTask has no separate title/description fields; cards display the real prompt instead of inventing a title or summary.
- AgentTask has no cancellation actor or cancellation timestamp; cancelled cards show the actual state without fabricated provenance.
- The existing submit API stores only UTC `runAt`, with no persisted IANA timezone. The dialog shows the device's current IANA timezone read-only and converts that wall time to an ISO instant. Arbitrary timezone choice and persisted original timezone require a native/server contract extension. F10's persisted-timezone criterion is therefore not certified.
- A failed record displays its real failure state/reason, rather than asserting the reference's specific login failure without evidence. Connection management is explicit, and task retry requires the existing task surface's user action.
- Source-message reminders appear with model-independent labeling. Creating them remains in the existing source-message workflow; this schedule dialog does not invent source message/channel authority.
- Device DST gaps are rejected. Ambiguous fall-back wall times use the JavaScript local-time interpretation; an explicit offset choice remains a future contract/UI extension.
- No promotional/explanatory page subtitle or empty-state filler was restored, in accordance with owner copy instructions.

## Commands and results

1. `pnpm typecheck` initially failed on four obsolete generic schedule branches narrowed by the new early schedule return. Removed only those replaced branches; subsequent check exited 0.
2. `pnpm test -- tests/s62-schedules.test.tsx` unexpectedly passed a double separator into the script and started a broader suite. Interrupted it (exit 130) once observed; no full-suite result is claimed. During that run one S62 assertion exposed an asynchronous navigation wait in the test, fixed by awaiting the displayed status.
3. `pnpm exec vitest run --config vitest.config.ts tests/s62-schedules.test.tsx`: final result **1 file / 19 tests passed**, exit 0, duration 2.05 seconds. Earlier intermediate focused runs also passed 16/16 before the three added boundaries.
4. Final `pnpm typecheck`: exit 0.

The focused cases exercise actual component room/model filtering, multiple active cards, ISO one-shot submission, receipt-only success, service failure retention, past/far-future rejection, cancellation review/race behavior, other-owner authority denial, access invalidation, stale account completion rejection, mismatched receipt rejection, and all eight DEV projections with no bridge.

All checks used isolated spies and local DEV data. They do not verify deployed Agent scheduling, provider access at execution time, actual reminder delivery, cancellation/start transport race, two-client behavior or native hardware. No remote mutation, release, signing, deployment or production account access was performed. No screenshots were captured in this assignment; exact fresh fixture captures, original-PNG comparison, responsive/native macOS visual checks and owner manual acceptance remain required. Windows has not been validated on this macOS host. Root owns tracker and final integration evidence.
