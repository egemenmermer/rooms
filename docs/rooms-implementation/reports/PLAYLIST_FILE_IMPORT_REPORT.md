# S34 personal playlist file import

Status: IMPLEMENTED BUT UNVERIFIED for native chooser, OS encryption and actual playback. Focused local mocked boundary checks pass. No owner manual acceptance or visual acceptance is claimed.

## Delivered boundary

- `rooms:provider-pick-playlist`: no arguments, native single-file M3U/M3U8 chooser; cancellation returns null. Renderer receives only `{ token, fileName, channelCount }`.
- `rooms:provider-playlist-file`: strict `{ name, token, xmltvUrl? }`, returns existing sanitized `ProviderConnection`. Renderer paths and raw contents are not accepted.
- Main reads the selected file descriptor only. Extension, regular-file status, nonempty size, strict UTF-8 and bounded 2 MiB read are validated. Read-time growth cannot exceed the allocation/limit. POSIX no-follow/nonblocking flags are used when available.
- Extended M3U channel lists require absolute remote HTTP(S) URLs. Local paths, relative URLs, userinfo, known local/reserved literal addresses, HLS manifests and custom playback/DRM directives fail safely. Existing `personalURL` and `parsePlaylist` validate and normalize channels; the fixed internal parser base cannot resolve unvalidated relative resources.
- Selection has a random UUID capability, five-minute expiry and one-use consumption. New selection replaces the old selection. Native chooser concurrency is bounded to one. Cancellation/invalid import saves no connection.
- `PlaylistFileImports` captures account scope before the chooser/read and checks it after asynchronous completion and before consumption. `setupProviders(assertSender, scopeIdentity?)` allows root to supply the current community server/account scope. `clearPlayback` invalidates pending capabilities and in-flight selections. Root integration passes sessionEpoch, instanceUrl and user ID as scope, preventing same-account logout/login ABA reuse; pending capability cleanup is available through clearPlayback.
- Existing sender validation runs before provider commands. Native provider IPC rejects development fixture windows. Fixture components require their isolated adapters.
- Personal text is stored solely inside the existing native encrypted `Stored.playlistText` record. Path is never persisted. Channel refresh parses the private stored text with no file request or network request. Failed encrypted persistence rolls back the new connection/cache.
- Stream playback continues through existing opaque `rooms-provider` handles and `privateFetch`, including DNS pinning/public-address checks at fetch time. No stream availability/authentication/playback claim is inferred from local parsing. Optional XMLTV remains a separate authorized network operation.

## Executed checks

Command: `pnpm exec vitest run --config vitest.config.ts tests/playlist-file.test.ts`.

- Initial run: 12 tests passed (02:23:06 local tool timestamp, 495 ms).
- Added clearPlayback/encryption check: 12 passed, one failed because its reused mocked descriptor was exhausted after the first read. Fixed the mock to provide a fresh descriptor for the second native selection; no production change was required.
- Final run: 13 tests passed, one file passed (02:23:33 local tool timestamp, 595 ms).

The focused checks mock Electron dialogs, native filesystem descriptors, encrypted storage and network. They exercise file growth, UTF-8 errors, regular-file/size/extension validation, safe access errors, unsafe URLs/directives, cancellation, replacement, token expiry/reuse, account change during chooser/read/consumption, clearPlayback, encrypted-storage failure rollback, strict renderer-path rejection and fixture access. The import/channel-list checks assert that network fetch is never invoked and that encrypted contents include no original selected path.

## Remaining acceptance

No live accounts, native UI, network, provider service, deployment, build or platform acceptance checks were run by this implementer. Root owns shared contract/preload/renderer/main integration and overall type/build verification. Owner acceptance must confirm the macOS chooser, safeStorage availability, restart reload, selected authorized channel playback and error UX. Windows behavior is implemented through existing Electron/Node interfaces but was not validated on macOS. No production fixture/demo media was added.
