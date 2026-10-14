# Architecture

[← README](../README.md) · [Development](DEVELOPMENT.md) · [Self-hosting](SELF_HOSTING.md)

## Contents

- [Process and trust boundaries](#process-and-trust-boundaries)
- [Account and media flow](#account-and-media-flow)
- [State and persistence](#state-and-persistence)
- [Change boundaries](#change-boundaries)

## Process and trust boundaries

ROOMS uses one Electron/React desktop shell and separate service authorities.

The renderer consumes a typed preload bridge. Electron main owns native session storage, files/capture, provider credentials and network capabilities. Renderer Node integration stays disabled; IPC checks the trusted sender/window/frame/origin and validates input. Native authentication is scoped to the selected server/account.

Social domain types and the Stoat adapter normalize official upstream API/events. Do not fork the upstream social server to implement UI features. The legacy Spacebar adapter remains a compatibility module, not the active setup path.

Voice/media state lives outside route components. LiveKit is behind the media-provider boundary; navigating or closing a DJ panel must not stop voice or the server-owned queue. Participant gain is listener-local. Shared Activities use authoritative commands, revisions and per-user projections; hidden game state is never projected to other users.

The access service validates current identity/membership and issues bounded media grants. Activities own serialized room state and compatible persistence. The music worker owns bounded queue/source cleanup and publishes through a short-lived lease. The optional Agent belongs on a separately scoped Linux host.

Community branding is decorative, versioned, bounded and same-origin. Failed/absent branding falls back to the bundled original static image. Branding fetches send no account cookies or provider tokens and never modify the music control contract.

## Account and media flow

1. The user selects a community origin or opens an invitation.
2. Electron's native social boundary authenticates against that community and retains credentials outside the renderer.
3. The typed adapter maps upstream REST/events to the application's social domain.
4. For voice, the access service checks the actual account, channel, membership, and permissions, then issues a short-lived LiveKit grant.
5. The client connects to LiveKit and publishes devices only after the corresponding explicit action/permission flow.
6. Activities independently authorize commands and return per-user projections. Optional music and Agent services have their own authority and lifecycle.

These are distinct systems: a successful social websocket does not prove media reachability, and a visible activity page does not provision its service. See [self-hosting](SELF_HOSTING.md) for routes, ports, and the actual setup sequence.

## State and persistence

| State | Owner |
| --- | --- |
| Account identity, messages, social membership | Stoat and its database/object storage |
| Native account/session and local preferences | The selected desktop profile and native credential boundary |
| Active media session | Route-independent realtime client store plus LiveKit and access grants |
| Signup invitation consumption | Persistent access-service ledger and upstream account creation |
| Activity/game state | One authoritative Activities process with file or PostgreSQL persistence |
| Music queue/source lifecycle | Optional music service; listener gain remains local |
| Agent tasks/grants/encrypted configuration | Optional separate Agent host |

A repository checkout is not a database backup. Back up each persistence owner with compatible configuration and encryption keys, and validate restores before upgrading. Media encryption in transit does not mean E2EE; end-to-end encryption is not configured.

## Change boundaries
Change schemas alongside cross-runtime operations. Preserve account epochs, stale-response fencing, revocation, explicit consent and shutdown cleanup. Prefer small cohesive feature modules over moving all code for cosmetic folder symmetry. Root aliases have one source of truth in tsconfig.json.

The source can be shared as an evolving project without claiming every feature is production-certified. Signing, provider access, physical-device acceptance and server recovery require their own evidence.

