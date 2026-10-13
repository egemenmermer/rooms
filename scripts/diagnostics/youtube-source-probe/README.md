# Bounded youtube-source diagnostic

This is an isolated diagnostic, not a production replacement or release artifact. It uses the published `dev.lavalink.youtube:common:1.18.2` and `dev.arbjerg:lavaplayer:2.2.7`. Build with `mvn package`; supply one eleven-character video ID to the resulting executable JAR. It requests at most150 PCM frames, has25s metadata and30s audio deadlines, and prints only a bounded diagnostic result. Wrap the process in a70s external timeout.

Only the WEB client is registered. No credentials, cookie extraction, OAuth initialization, IP rotation, alternate-client fallback, remote cipher service or room publication is configured. This deliberately constrained check does not establish behavior of the full upstream default client list. Do not automatically broaden it after a provider access denial.

Use a disposable non-root container with read-only root, dropped capabilities, memory/CPU/PID limits and a private temporary filesystem. No source audio is saved or played through speakers. Metadata alone is not success; PASS_PCM requires150 frames with non-silent PCM. Even PASS_PCM is not physical room acceptance.

Upstream projects: https://github.com/lavalink-devs/youtube-source (MIT), https://github.com/lavalink-devs/lavaplayer (Apache2.0). No upstream source copied into this diagnostic. A shaded local build includes dependencies and their licenses and must not be distributed as a product without the normal dependency/license review.

## Explicitly requested device-login preparation

`rooms.DeviceLogin` is a separate opt-in entry point. After owner approval it requests the upstream Google device screen and writes the pending device response to `/private/pending-device.json` with0600 permissions, refusing to overwrite an existing request. It prints only the user-facing verification URL/code and expiry. It does not poll for tokens or authorize an account. The upstream scope includes broad YouTube account permissions, not merely audio playback; disclose this and leave Google account selection/consent to the owner. Never enable upstream token logging, print the device secret/refresh token, or copy credentials into artifacts. Production does not consume this pending state.
