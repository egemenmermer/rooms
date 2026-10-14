# Architecture

ROOMS uses one Electron/React desktop shell and separate service authorities.

The renderer consumes a typed preload bridge. Electron main owns native session storage, files/capture, provider credentials and network capabilities. Renderer Node integration stays disabled; IPC checks the trusted sender/window/frame/origin and validates input. Native authentication is scoped to the selected server/account.

Social domain types and the Stoat adapter normalize official upstream API/events. Do not fork the upstream social server to implement UI features. The legacy Spacebar adapter remains a compatibility module, not the active setup path.

Voice/media state lives outside route components. LiveKit is behind the media-provider boundary; navigating or closing a DJ panel must not stop voice or the server-owned queue. Participant gain is listener-local. Shared Activities use authoritative commands, revisions and per-user projections; hidden game state is never projected to other users.

The access service validates current identity/membership and issues bounded media grants. Activities own serialized room state and compatible persistence. The music worker owns bounded queue/source cleanup and publishes through a short-lived lease. The optional Agent belongs on a separately scoped Linux host.

Community branding is decorative, versioned, bounded and same-origin. Failed/absent branding falls back to the bundled original static image. Branding fetches send no account cookies or provider tokens and never modify the music control contract.

## Change boundaries
Change schemas alongside cross-runtime operations. Preserve account epochs, stale-response fencing, revocation, explicit consent and shutdown cleanup. Prefer small cohesive feature modules over moving all code for cosmetic folder symmetry. Root aliases have one source of truth in tsconfig.json.

The source can be shared as an evolving project without claiming every feature is production-certified. Signing, provider access, physical-device acceptance and server recovery require their own evidence.

