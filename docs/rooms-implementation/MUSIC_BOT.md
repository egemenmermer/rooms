# Room music bot — owner request 2026-10-12

The owner clarified Muzox-style behavior: a real separate voice participant controlled by play, pause, resume, stop, skip and queue. Existing YouTube Together is not acceptance of this bot requirement. Muzox is a Discord bot, not a ROOMS/LiveKit integration. Root owns implementation.

Required: one bounded server audio publisher/queue per authorized voice channel, authenticated commands with fresh channel permissions, explicit bot identity authorization in the media webhook, idle disconnect and revocation cleanup, real connected participant and queue/volume controls. Never invent an online bot when no media publisher is connected.

Audio sources: owner-provided files or explicitly permitted streams. Bound uploads/decoding/queue resources, deny arbitrary network targets/private-network SSRF, URL credentials and unsafe redirects. Provider adapters stay replaceable; no shared provider credentials. Spotify official playback cannot be a room rebroadcast source. YouTube official API forbids isolated audio; existing official shared video players remain supported. No hidden players, scraped audio or DRM bypass.

Status: bot not implemented/deployed; preview.2 contains chat/voice observation corrections only. Local transport/worker checks and actual audible multi-Mac acceptance remain separate. Continue this explicit remaining feature without reducing the reference inventory.

Sources inspected:
- https://muzoxbot.xyz/
- https://developer.spotify.com/policy
- https://developers.google.com/youtube/terms/developer-policies

## Compact DJ panel — 2026-10-12

Owner requested the extracted Recep loop over compact playback/queue controls, then explicitly rejected glass and pink. Implemented a draggable, bounded opaque ROOMS dark/purple panel, persistent across ordinary navigation. Silent alpha animation loops independently of music. A visible official YouTube player is kept at least 200px high; closing the panel destroys local playback, not another member's audio. Shared Activity queue supports video URLs, public playlist URLs, previous/next, pause/resume, seek, remove, and host-local shuffle/repeat. Personal volume affects only this installation. Queue limit remains100; imports report partial failure. Unsupported providers are rejected explicitly; Spotify audio publishing is not claimed.

Playlist IDs come only from the official IFrame API's cuePlaylist/getPlaylist, in a visible preview, with source/origin/nonce-checked messages and bounded timeout/results. Native IPC validates identifiers, and the HTTPS wrapper stays backwards compatible with existing video URLs. Owner separately authorized activities-only deployment; encrypted backup rooms-20261012T123634Z.tar.age and previous activities bundle retained. New bundle SHA25649e05edc9389c291aec4cfc0840b89667354fcabfa8fbda1dd43444187c86349, health passed, public playlist wrapper HTML returned. No Hoppers/access/provider account changes.

Six local tests passed (URL scope, route compatibility/schema, video command sequence and trusted playlist import). Browser DEV-only visual checks confirmed actual alpha loop running/muted, draggable panel, no backdrop filter and bounded950x700 layout with zero page errors; resize initially exposed a placement bug which was corrected and rerun. Screenshots are private evidence under .local/dj. A direct external-provider playlist browser attempt timed out; do not claim live playlist playback or two-Mac synchronization acceptance. Existing separate voice-publisher bot requirement remains unimplemented.

Official API reference: https://developers.google.com/youtube/iframe_api_reference .
