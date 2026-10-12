# Room music bot — owner request 2026-10-12

The owner clarified Muzox-style behavior: a real separate voice participant controlled by play, pause, resume, stop, skip and queue. Existing YouTube Together is not acceptance of this bot requirement. Muzox is a Discord bot, not a ROOMS/LiveKit integration. Root owns implementation.

Required: one bounded server audio publisher/queue per authorized voice channel, authenticated commands with fresh channel permissions, explicit bot identity authorization in the media webhook, idle disconnect and revocation cleanup, real connected participant and queue/volume controls. Never invent an online bot when no media publisher is connected.

Audio sources: owner-provided files or explicitly permitted streams. Bound uploads/decoding/queue resources, deny arbitrary network targets/private-network SSRF, URL credentials and unsafe redirects. Provider adapters stay replaceable; no shared provider credentials. Spotify official playback cannot be a room rebroadcast source. YouTube official API forbids isolated audio; existing official shared video players remain supported. No hidden players, scraped audio or DRM bypass.

Status: bot not implemented/deployed; preview.2 contains chat/voice observation corrections only. Local transport/worker checks and actual audible multi-Mac acceptance remain separate. Continue this explicit remaining feature without reducing the reference inventory.

Sources inspected:
- https://muzoxbot.xyz/
- https://developer.spotify.com/policy
- https://developers.google.com/youtube/terms/developer-policies
