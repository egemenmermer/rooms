# Personal IPTV recently watched channels

Status: IMPLEMENTED BUT UNVERIFIED for actual media playback, renderer event delivery and target-platform owner acceptance. Focused mocked native boundary checks pass. No external provider/network/account operation was executed.

## Contract and actual event boundary

- `PersonalRecentChannel` contains exactly `{ channelId: string; watchedAt: string }`.
- `ProviderBridge.recentChannels(connectionId)` invokes `rooms:provider-recent-channels` and returns current private connection history for currently loaded owned channels only.
- `ProviderBridge.acknowledgePlayback(url)` invokes `rooms:provider-acknowledge-playback` with the original opaque URL returned by `play`. The root renderer must call it from the first actual media `playing` event for that source, then refresh its list. Merely resolving/clicking `play` records nothing.
- Channel playback handles privately bind their owning connection and channel ID. The acknowledgement validates exact handle shape, UUID, current session/identity, expiry, connection type and current loaded channel ownership. Source URLs/paths are never accepted as history inputs or returned as history metadata. RD handles and derived HLS resource handles have no channel acknowledgement authority.
- A handle can acknowledge once. Later genuine playback using a newly issued handle updates that channel's timestamp and places it first. Repeated `playing` events for the same handle cause no additional encrypted write or invented recency.

The acknowledgement is evidence supplied by the trusted renderer media event. The native layer validates its capability and account boundaries; it does not independently attest decoded audiovisual output or physical playback. Mocked acknowledgements are not real provider-playback acceptance.

## Encrypted history and private lifetime

History lives in the existing encrypted, stable server/account-partitioned native connection record, with at most 100 unique channels per connection. Native acknowledgement time is stored in UTC ISO format; values are sorted newest first and deduplicated. Only bounded valid channel IDs and valid canonical timestamps are projected. Missing/unloaded/removed channels and invalid persisted entries are ignored.

An acknowledgement saves a candidate vault before publishing memory state or marking the handle acknowledged. Encrypted persistence failure leaves prior history intact and permits a later retry. Source updates preserve current genuine history only for channels present in their successfully parsed candidate list and revoke previous playback handles. Disconnect removes the connection and its history from the encrypted vault. ClearPlayback, session changes, logout and account/server changes revoke outstanding acknowledgement capabilities. Saved history remains accessible solely when its original private account partition is selected again and its channels are loaded.

Root owns preload/renderer integration, user-visible projection, current account/event fences and Git consolidation. This continuation changes only providers.ts, provider-contracts.ts, new provider-channel-history.test.ts and this report.

## Executed checks

Command: `pnpm exec vitest run --config vitest.config.ts tests/provider-channel-history.test.ts tests/provider-media-metadata.test.ts tests/provider-connections-ipc.test.ts tests/playlist-file.test.ts`.

- Initial run: 54/54 passed, four files, 1.49 seconds, tool timestamp 03:12:45 on 2026-10-11.
- Final run after adding RD/owning-connection checks: **55/55 passed**, four files, 1.14 seconds, tool timestamp 03:13:12. History suite: 10 checks; existing metadata, mutation/privacy and import suites: 12, 20 and 13 checks.

Electron, encrypted filesystem and provider transport are mocked. Coverage checks no history from source resolution; first acknowledgement and actual subsequent native timestamp; idempotence and deduplication; 100-entry bounds; exact/forged/raw/altered/expired handles; update/disconnect/clear revocation; restart persistence with unloaded/missing-channel filtering; equal user IDs on different servers; signed-out and epoch ABA rejection; encrypted-save failure rollback/retry; strict arguments and invalid persisted data; RD rejection and owning-connection isolation.

No automated renderer acceptance, native UI opening, real provider playback, Windows validation, commit or push was performed by this implementer. Owner acceptance still needs the real `playing` event path, recently watched UI and authorized streams on target platforms. Historical test evidence remains distinct from owner acceptance.
