# Personal IPTV playback follow-up

Owner reports missing human category names, intermittent playback, stalls and opaque failures. The same failing channel plays continuously in the owner's VLC test. This narrows investigation to the ROOMS playback path; it does not identify a specific codec or rule out differences in requests to the provider. No private provider URL/account was supplied or inspected.

Source fixes accept standard, wrapped and keyed Xtream category responses and normalize decimal identifiers without lossy numeric conversion. Inline category names are used when category metadata is unavailable. Unresolved names are labeled explicitly rather than presenting internal numbers as human group names. Live waiting/stalled events now have a bounded watchdog, cancel on real progress/pause/account disposal, and use existing bounded HLS recovery. Unknown failures no longer imply that the account or source is invalid. These changes do not certify playback of the reported channel.

## Native-engine direction

Use libVLC as a candidate native personal-media backend while retaining ROOMS navigation and controls. Official embedding interfaces provide macOS NSView and Windows HWND surfaces. The current HTML/HLS path already delegates decoding to Chromium/hls.js; it is not a new decoder written from scratch. A VLC backend can expand supported formats, but provider failures and category metadata still require their own handling.

Do not connect the renderer directly to libVLC with provider credentials. Reuse the current native provider authority, account epochs, bounded network validation, handle revocation and local-only playback. VLC does not understand `rooms-provider:`; an authorized loopback streaming adapter must translate that capability and rewritten playlist/segment URLs without exposing the original provider credentials or enabling arbitrary file/network access. Engine logs/events must omit source URLs and authorization data.

Evaluate a pinned native binding and matching ARM64/x64 libVLC runtime before adoption. The reviewed electron-vlc-player wrapper does not bundle libVLC and documents a fixed container with no page scrolling; its native window/overlay lifecycle cannot be assumed to fit the current UI unchanged. Validate resize/fullscreen, controls, route hide/return, stop/account switch, crashes, audio/video track selection and actual sustained playback on both platforms. Distribute licenses/notices and required source/relinking materials for the selected runtime/plugins; do not assume every VLC binary/plugin shares one license.

No VLC dependency/runtime, native engine, player swap or release is introduced by these source fixes. Native proof of playback and the reported real IPTV channel remain open.

Primary references: [VideoLAN source and engine licensing](https://github.com/videolan/vlc), [official libVLC media-player interfaces](https://videolan.videolan.me/vlc-3.0/group__libvlc__media__player.html), [reviewed Electron binding requirements](https://github.com/ssnangua/electron-vlc-player).
