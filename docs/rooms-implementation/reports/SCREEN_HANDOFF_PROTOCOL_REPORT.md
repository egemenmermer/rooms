# S21/S22 presenter request protocol foundation

> **Superseded and removed on 2026-10-10:** this Activity-controller request queue was not integrated with LiveKit or native capture and duplicated the access-service lease authority. Its schema, engine branch and test were removed. Use `SCREEN_HANDOFF_ACCESS_REPORT.md` and `SCREEN_HANDOFF_INTEGRATION_REPORT.md` as the current design and implementation records.

Date: 2026-10-10
Owner: GPT-6.1 Sol bounded protocol implementer

## Reference and actual integration inspection

Inspected immutable original PNGs `S21_share_source_picker.png`, `S22_active_screen_share__request.png`, and `S22_active_screen_share__handover.png`, plus journey F04 in `06_handoff/flows.json`. The reference requires one active screen presenter, explicit source selection on the new presenter's own device, and continued voice when a screen stops. Approval must stop the old source before announcing completed handover.

Inspected `packages/activity-protocol/src/index.ts`, the Activity engine and repository, and actual `RealSocial.tsx` screen controls. Native/LiveKit screen tracks currently exist independently of the primary Activity. No authoritative capture lease, release acknowledgement, publication fencing, or server-confirmed screen presenter binding exists in the current Activity contract. An Activity host is consequently not proof of the current SFU/native presenter.

## Implemented scope

Added typed commands `screen.request`, `screen.request.cancel`, and `screen.request.decide`. Every command uses the existing authenticated Activity identity, participant membership, expected revision, command ID receipts and primary session/controller context. Requests expire after 60 seconds, are bounded to 20 per room, and allow one outstanding request per participant. The request owner alone cancels; the current Activity controller must also retain current control permission to approve or deny. Approval is one-time consent recorded in `screenRequests`, with no extension of its expiration. Denial removes the request and does not remove the user from voice/Activity membership.

Expiry, participant departure, controller transfer, Activity end/start and game replacement invalidate consent. Snapshot responses omit expired or obsolete requests even before persistence pruning. Legacy persisted rooms work without the optional field. Repository changes are unnecessary because RoomSnapshot is already durably stored.

## Fail-closed integration seam

This is a coordination queue foundation only. An approved request does not change `primary.hostUserId`, alter `primary.state`, stop any screen track, grant SFU publication rights, open the picker, transfer an OS capture, or assert completed handover. Existing renderer transfer controls remain disabled. The request controller is the Activity controller, not a verified media presenter. Do not label approval as "handover completed" or expose this as actual takeover until the integration below exists.

A complete implementation needs a verified current presenter binding and a generation-fenced capture/publication lease. The old presenter must explicitly release its native capture and published SFU screen tracks; authoritative transport confirmation must invalidate old publication rights before host/presenter reassignment. The approved participant must then explicitly choose, acquire and publish its own local source under a new lease. Disconnect/reconnect, delayed release acknowledgements, source loss, permission denial, client restart and conflicting publication must fail closed. Voice lifetime remains independent. An OS source ID, provider URL or capture credential must never enter this queue.

## Verification evidence and limits

Executed only the focused command:

`pnpm exec vitest run --config vitest.config.ts tests/screen-presenter-requests.test.ts`

Result: exit 0; 1 file, 7 tests passed (2026-10-10 18:37 local). Cases cover authenticated membership, approval without host/transport mutation, current ownership/permission, duplicate/cancel/deny rules, stale revisions, expiration/pruning, controller departure, requester departure/end and receipt retry conflict.

No broad tests, build, screenshots, remote deployment, SFU/native capture checks or two-client acceptance were performed by this implementer. This report does not verify S21/S22/F04 acceptance. Production behavior is additive server protocol only and is not yet wired to renderer controls.
