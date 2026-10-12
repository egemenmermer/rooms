# Screen-share handoff integration

Date: 2026-10-10 19:09 Europe/Amsterdam

## Implementation

Screen presenter requests now use the access service's real media lease as their authority. The desktop bridge exposes the access service state, request, cancellation and decision routes through typed Electron IPC. The renderer polls that lease state in the application root, so the handoff remains available while navigating away from Voice or Cinema. After approval, the existing presenter stops its local screen publication and releases its lease; the reserved participant must select a source on their own device before acquiring the next lease.

Voice already remained mounted independently of the current route. A route-specific CSS rule had hidden its dock on Chat; that rule is removed. The dock now surfaces a numbered request indicator and a compact approval/denial popover on any route while a screen-share handoff is relevant. The Voice and Cinema screens retain their in-page controls. The popover closes when the route or voice channel changes.

The local `S22` fixture implements only opt-in development behavior. It is not included as a real participant, capture source, or remote service response in production.

An earlier experiment placed a separate screen-request queue in the Activity protocol. It was not wired to the renderer or LiveKit and used Activity-controller identity rather than the real access lease. That duplicate source of authority has been removed from the Activity schema and engine; its historical implementation report is retained and marked superseded below. The access service is the single request/reservation authority.

## Local verification

- `pnpm typecheck` — passed after fixing the development fixture's nullable presenter reference and typing the Fastify test helper.
- `pnpm exec vitest run --config vitest.config.ts tests/screen-handoff-access.test.ts` — 11/11 passed. The test uses mocked Stoat and LiveKit dependencies.
- `pnpm build` — passed: typecheck, production Vite bundle, dependency notices and Electron bundle. Existing Vite chunk-size and mixed static/dynamic import warnings remain.
- S22/request capture at 1920×1080: `.local/design-review/evidence/S22-request/application.png`; receipt `.local/design-review/evidence/S22-request/capture.json`. It records `LOCAL_FIXTURE`, no runtime errors and no horizontal overflow.
- Chat handoff probe: `.local/design-review/evidence/S22-request/chat-dock-probe.png`. At 1440×900 the voice dock remained visible on `/chat`; the request popover stayed within the window, its message wrapped to two lines, and both decision actions were visible. Clicking “Onayla ve devret” updated the fixture to the waiting-for-release state without a renderer error.

These checks confirm a local fixture flow only. They do not establish production network behavior or user acceptance.

## Remaining acceptance

- Run two real authorized clients against the installed private server and verify request, denial, approval, old source stop, track disappearance, new device source selection, acquire and publication.
- Verify source closure, expiry, cancellation and reconnect with actual OS capture permissions and the deployed LiveKit service.
- Capture and visually compare the remaining S22 states: default, handover, request sent, source closed and viewer. The single request screenshot is not acceptance for all named variants.
- Owner manual acceptance is pending. The access service keeps coordination in process memory, so deployment must remain a single authoritative access-service instance unless shared locking is added.
