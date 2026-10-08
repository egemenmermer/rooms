# Realtime media transport

## Implementation

`LiveKitMediaProvider` implements the replaceable `RealtimeMediaProvider` contract using pinned `livekit-client` 2.22.3. `liveKitMediaProvider` is the singleton owned by the renderer realtime store, outside route components. Navigation does not destroy the voice session.

The privileged access broker validates the Spacebar account and channel membership and returns an ephemeral grant `{ roomId, url, token }`. The adapter retains the token only in memory. It never receives the LiveKit service signing secret. Remote servers require WSS; insecure WS is accepted only for loopback development. Token-bearing URLs are rejected.

Connect establishes signaling and auto-subscription, but never starts microphone, camera, or screen capture. Explicit actions publish devices. Microphone capture requests echo cancellation and noise suppression. Camera starts at 640×360/24fps; screen at 1280×720/30fps, with adaptive delivery. Screen audio is deliberately disabled until platform-specific capture support is separately verified. Native source selection is handled by Electron's main process; this adapter invokes the SDK's browser display capture request.

Remote audio attaches to managed hidden audio elements. Deafen actually silences these elements and mutes the microphone; undeafen restores hearing without automatically unmuting capture. Individual volume ranges from 0–100%. UI owns video elements through `attachTrack`, whose cleanup detaches without deleting UI DOM. Disconnect stops local tracks, removes managed audio elements and event handlers, clears diagnostics and secrets, and disposes the previous room. The adapter reports transient SDK reconnect states without reporting a successful connection before SDK completion. A complete reconnect requires a freshly authorized broker grant; it does not silently reuse expired credentials.

## Authorization boundary

The client rejects an already-observed competing presenter before asking for capture. This is a UX check, **not a race-safe authorization guarantee**. The broker must reserve presenter ownership and issue LiveKit publish-source grants accordingly. Grant microphone/camera by default and grant `screen_share` only to the reserved presenter. Revoke presenter publish permission at stop/disconnect/host transfer. Client-only checks do not complete one-presenter acceptance.

Transport is encrypted in transit using WebRTC DTLS-SRTP. End-to-end encryption is not configured and must not be claimed.

## Diagnostics

Every five seconds, the adapter reads RTC reports from current tracks and deduplicates report IDs. It reports received bitrate (bits/second, derived from byte-counter deltas), cumulative receive packet loss fraction, and nominated candidate-pair round-trip latency in milliseconds. No invented defaults replace unavailable metrics; missing values remain null. This is a received-media aggregate, not total network egress billing.

## Verification

- `pnpm exec vitest run --root . tests/media-provider.test.ts`: **9 tests passed** on 2026-10-08. Tests cover transport URL validation, explicit capture lifecycle, actual microphone deafen semantics, capture denial, secret-safe error state, competing presenter preflight, reconnect state, and deafen on existing/later remote audio subscriptions, and immediate capture stop during failed reconnect unpublication.
- These tests inject SDK doubles; they are **not** two-client transport verification.
- Initial full typecheck found only a pre-existing `Youtube` icon export error in Activities.tsx; no media-provider type errors.
- Physical microphone/camera capture, macOS screen permission/source picker, remote audio audibility, Windows capture/system audio, and two physical computer testing require runtime acceptance. Do not mark these verified based on unit tests.
- `node scripts/livekit-verify.mjs`: **BLOCKED**, 2026-10-08. The verifier launched two actual Electron renderer clients, but the media server at `127.0.0.1:7880` refused connections. SDK connect failed; no received-media result is claimed. The script reads ignored `infra/local/.env` without printing credentials, generates distinct short-lived identities, and will verify synthetic audio/video RTP receipt, remote publication mute/unmute, and screen unpublication when a real server is available. Synthetic media verifies transport only, not native device capture or the source picker.

### Native fallback and actual transport result

Docker was unavailable because the local VM runtime stalled. Following the [official local self-hosting instructions](https://docs.livekit.io/transport/self-hosting/local/), `HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 brew install livekit` installed **LiveKit Server 1.13.9** on macOS ARM64. No unrelated Homebrew dependency repair or global Docker restart was performed.

`node scripts/livekit-native.mjs` starts the official server using the generated local keys, with signaling bound to `127.0.0.1`. This is a local development fallback, not deployment or remote access. Stop with Ctrl+C. It derives a mode-0600 ignored native config from `infra/local/livekit.yaml` and removes it when the process exits.

`node scripts/livekit-verify.mjs` then **PASSED** against the actual server on 2026-10-08: two actual distinct Electron renderer clients joined with short-lived test identities; synthetic audio and canvas-video RTP packets reached the receiver; the receiver observed real microphone publication mute/unmute and screen unpublication. The initial refused-connection blocker was resolved by the native server.

This verifies WebRTC transport using actual SDK, signaling and media, not two tabs with fabricated signaling. It does **not** verify physical microphone audibility, camera permission, native screen/window selection, system audio, or two physical computers. Those acceptance cases remain IMPLEMENTED BUT UNVERIFIED.

A follow-up verifier run also **PASSED** actual signaling interruption: LiveKit's `signal-reconnect` test scenario closes the real signaling connection, the adapter observes `reconnecting` then `connected`, and received RTP packet counts continue increasing afterward. This exercises actual socket reconnection; it does not substitute for an OS/network outage or SFU restart test.
