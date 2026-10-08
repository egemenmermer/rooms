# Architecture

ROOMS separates the desktop, social authority, realtime media, shared Activities and the remote agent. macOS 14+ ARM64 is first; the renderer is Turkish. Approved changes are recorded in `REMAINING_PHASES_PLAN.md`.

## Boundaries

- `apps/desktop`: sandboxed React renderer, Electron main and narrow preload. Native services own credentials, account requests, file selection and media handles. Renderer state never contains persistent authentication secrets.
- `packages/social-domain` / `packages/stoat-adapter`: provider-neutral opaque IDs and the pinned, unmodified upstream Stoat REST/events integration. Legacy Spacebar code is retained as historical rollback material.
- `packages/media-providers`: replaceable LiveKit transport; one connection lives independently of routes and primary Activity lifetime. Explicit user actions precede publishing.
- `apps/services/access`: live Stoat identity/membership/source permission checks, account registration invitation ledger, short-lived SFU grants, single-presenter reservations and authenticated media webhooks.
- `packages/activity-protocol` / `apps/services/activities`: versioned, revision-checked idempotent commands, authoritative timeline/queues, participant leases, host transfer, polls/whiteboard and game state. A single authoritative process serializes each room. PostgreSQL durability does not by itself make multiple writers safe; clustering is not implemented.
- `packages/games`: authoritative rules and per-user projections. Private hands and deck state stay server-side. Persisted history/statistics contain public results only; the active recovery snapshot contains the live hand and must be protected.
- `packages/personal-media` / native providers: DNS-pinned public-source requests, native encrypted personal connections, opaque playback handles, HLS rewriting and XMLTV. No personal paths/URLs/provider secrets enter shared state or the agent.
- `apps/services/agent`: separate Linux host, its own encrypted state and dedicated bot accounts. Each user owns their model profile. Durable tool journals pause for concrete write approval; uncertain effects require reconciliation. YOLO skips confirmations within existing scopes. Restricted worker/browser networks require deployment validation.

## Security and operation

Context isolation, renderer sandbox, no Node integration, exact trusted main-frame IPC, denied external top-level navigation/webviews and explicit capture permissions define the desktop boundary. File selection grants only an opaque selected-file handle. Personal requests reject private/reserved addresses and secret-bearing POST redirects; redirected GETs drop cross-origin credentials. Main-frame validation also denies device capture by the hosted YouTube iframe.

The official YouTube iframe runs on an isolated deployed HTTPS origin with branding and controls. Each member loads an independently authorized player. Native fullscreen applies to the desktop. Safe signed updates start opt-out, require a packaged Developer ID signature and embedded HTTPS feed, and become installable after native signature validation.

There is no end-to-end encryption claim. TLS and DTLS/SRTP protect transports; server administrators remain trusted. Deployments, credentials, current platform limitations and acceptance evidence are documented separately. A unit test or a social fixture is never proof of live membership or physical-device capture.
