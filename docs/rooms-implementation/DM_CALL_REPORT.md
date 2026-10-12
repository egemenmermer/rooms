# Private DM call lifecycle — 2026-10-10

Implemented by the scoped Astra/medium lifecycle agent. Root owns App, shared-index/preload, SocialSurfaces entry buttons, and the ordinary voice join guard. This report describes private calls, not an extension of room Activity or a backend fork.

## Reference and scope

Read F02 in `06_handoff/flows.json`, including direct video, nonfriend/blocked branches and the explicit requirement that CallSession is scoped to dmId. Opened original `04_screens/S12_direct_message.png`, `S19_voice_room__dm.png`, `S20_video_room__dm.png` from the immutable design package. Implemented private two-person stage, messages return, camera/audio switching, end-to-DM return, and compact navigation controls. No synthetic avatars/presence/call statuses in production. The additional ringing/accept UI makes the real consent boundary explicit.

## Ownership and integration

- `packages/shared-contracts/src/dm-call.ts`: strict public state/input schemas and DmCallBridge.
- `apps/services/access/dm-calls.ts`: isolated transient invitation registry, authorization/liveness, HTTP endpoints, accepted-call grants, signed-webhook predicate and orphan SFU reconciliation.
- `apps/services/access/server.ts`: bounded registration and existing verified webhook dispatch only. Ordinary room grant eligibility remains unchanged.
- `packages/stoat-adapter/src/index.ts`: additive `getCallPeer(dmId)` only in this agent scope; other member/typing changes belong to root.
- `apps/desktop/electron/dm-call-http.ts` and bounded community.ts handlers: native authenticated broker with session-generation checks, schema validation, bounded response, fixed-origin redirect rejection, logout/account/close cleanup. Existing fixture denial and typing/member handlers preserved.
- `apps/desktop/src/dm-call.ts`: transient renderer session/consent/transport lifecycle.
- `apps/desktop/src/DmCallRuntime.tsx`, `reference-dm-call.css`: permanent default-export host. Root mounts it once outside Routes, with empty `/dm-call` route; route changes only alter full/compact presentation.

Root bridge methods/channels are `poll` (`rooms:dm-call-poll`), `start(dmId,mode)` (`rooms:dm-call-start` object `{dmId,mode}`), `respond(callId,action)` (`rooms:dm-call-respond` object `{callId,action}`), `grant(callId)` (`rooms:dm-call-grant` object `{callId}`). All requests POST to `/rooms-access/v1/calls/{poll,start,respond,grant}` using native account authentication.

## Protocol and actual behavior

Public session fields: UUID `id`, `dmId`, caller/callee IDs and bounded display names, requested `audio|video` mode, `ringing|accepted|ended` state, nullable terminal reason, created/accepted/expiry timestamps. No account token, local file/source or provider credential in public call state. The short-lived, room-scoped LiveKit grant follows the existing renderer media adapter architecture; account credentials remain native/server-only.

Upstream REST checks exact `DirectMessage` kind, exactly two distinct recipients including authenticated self, current Friend relationship, and nondeleted peer. Group/SavedMessages/server channels and outsiders cannot acquire a DM grant. Both identities are checked using their own authenticated sessions by acceptance/grant/sweep. Ringing calls reserve both users atomically, reject crossed/busy calls, expire after 45 seconds, and never join media. Only callee can accept/reject; either member can end. Accepted calls require 35-second per-user signaling liveness, refreshed by 3-second client polling. Access service checks at 5-second intervals; friendship/membership/token uncertainty fails closed.

Only accepted participants with an issued grant may enter `rooms-dm-call-<UUID>`. Grants last 60 seconds and permit mic/camera subscription/publication, no screen share, data or own metadata mutation. Signed participant-joined webhook rejects unknown/revoked calls. End revokes registry credentials and deletes the SFU room, retrying failures. Periodic SFU reconciliation removes orphan private-call rooms, including after access-service restart. Ordinary room voice and Activity lifetimes/permissions are preserved.

Starting an outgoing call records explicit local microphone consent and video consent only for video start. Incoming calls require explicit voice accept or separate camera accept. A recovered accepted invitation never autojoins: explicit “Görüşmeye katıl” is required. Camera failure keeps connected voice; mic failure keeps receive-only connection with reason. UI uses real provider participants/tracks/speaking status and never equates acceptance with the peer already being connected. Navigation retains the single provider; return and end remain visible. Ordinary room occupancy disables start/accept with a reason and root’s room join guard rejects overlap. Account changes, logout, last-DM removal, service null response, ending/rejection and expired/revoked calls clear state/transport. Native and renderer generation checks reject late source-account responses. Fixture windows never call the native broker.

## Verification

`pnpm exec vitest run --config vitest.config.ts tests/dm-calls.test.ts tests/dm-call-lifecycle.test.tsx tests/access-permissions.test.ts --maxWorkers=1`: **17/17 passed**, 13:57:42 local (final bounded rerun). Covers direct-membership/friend checks, outsider denial, preaccept grant denial, crossed calls, rejection/cancellation/stale acceptance, friendship loss, ring timeout, heartbeat expiry, revoke retry/retention, strict inputs; incoming device consent, explicit video intent/camera failure, late-grant cancellation, route lifetime/last-DM removal, account switch/recovered consent, fixture isolation and server-null revocation. Existing access permission tests pass. First focused run had a relative import typo, corrected before these results. Root coordinates integrated typecheck; an async narrowing diagnostic was corrected by a fresh registry lookup.

Actual isolated two-client proof: `.local/design-review/evidence/dm-call/check.mjs` and `result.json`. Used two headless Chromium contexts, actual `DmCallRuntime`/session/media provider, an actual temporary access server, an actual isolated LiveKit 1.13.9 process, real signed webhook delivery and synthetic Chromium microphone/camera capture. Upstream identity/DM endpoints were local QA stubs; account transport is not certified by this proof.

The final proof passed: both ringing clients had zero tracks; preaccept grant HTTP403; third-party accept HTTP404; both connected with two participants and received RTP; audio accept did not request the callee camera; explicit camera control produced camera tracks; both video elements obtained decoded frame dimensions before screenshot; RTP continued over messages navigation; end cleared both clients’ tracks/session; subsequent grant HTTP403; 14 signed webhook requests; no browser errors. `video-call.png` shows actual synthetic frames and `compact-call.png` shows ongoing compact controls. Initial evidence screenshot preceded camera frame availability; the harness was tightened and rerun before saving the final frame screenshot. Test-only minimal shell lacks production shared button/Avatar styling, so these screenshots are lifecycle evidence, not full-shell pixel acceptance.

Temporary credentials/config were generated for the proof and removed. Both local test services, browser contexts and owned SFU process were closed; ports 7996/7997 had no listeners afterward. No remote server mutations, real user calls, physical camera/microphone recording, or production fixtures were used.

## Limits and remaining acceptance

This call registry follows the existing broker’s single-instance transient model. Multi-replica deployment needs a shared transactional call registry/lease; do not deploy multiple independent registries against the same SFU namespace. Restart ends calls; it does not silently restore microphone/camera. Orphan cleanup is implemented but abrupt-crash recovery was not separately disruption-tested. SFU unavailability can delay remote revocation until the cleanup retry succeeds; the local UI immediately stops its transport.

Physical macOS microphone/camera permission paths, an actual two-account upstream Stoat session through Electron IPC, two physical computers, reconnect/network disruption, Windows, minimized/background notification behavior, and long-duration reliability remain unverified manual acceptance. This is implemented private-call signaling and media integration, not a claim of those acceptance results. Background ringing is an in-app invitation notice; OS notification/sound is not added by this change.
