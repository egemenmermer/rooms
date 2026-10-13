# Dedicated YouTube DJ source fix — 2026-10-13

The owner's exact `vKHu4uPOJVg` video and ten-track `PLG1BwrnSjAvFsNgMRhA0CgTKLNA_Xbfgs` playlist now produce room audio. The owner confirmed both the first playlist track (Diyar Pala - Bensiz Yapama) and next track (Diyar Pala - Yeşilimi Ver) audible in Lounge. Desktop release remains HOLD; this does not complete remaining UI/game/share/physical-Mac acceptance.

## Actual cause and correction

The published youtube-source1.18.2 TV client returns PAGE_RELOAD_REQUIRED with the owner's newly approved dedicated Google account. The official upstream TV compatibility fix `b33460b38ad13b5cd07da75e46444397cf0ea2df` clears that stage. The bundled local player-script parser then throws ScriptExtractionException. The project's documented parser interface, served privately by pinned kikkia/yt-cipher image/source revision, clears the script parsing stage. This is a fixed dependency combination, not client/IP rotation, captcha/poToken generation, DRM decoding, another-song substitution or token distribution.

The previous generic diagnostic did not distinguish these two stages. Refined baseline proves PAGE_RELOAD_REQUIRED; fixed-TV-only probe proves the subsequent script-parser failure; fixed-TV/private-parser probe yields150PCM frames/RMS2877.66. The isolated probe initially could not map its temporary JNI library because of noexec. Production bakes the exact Lavaplayer native into the immutable image and loads that path, keeping temporary directories non-executable.

## Integration

An opt-in server-only Java source bridge uses the pinned published upstream libraries and the dedicated-account refresh token mounted readonly0600. It publishes raw48k stereo PCM through the existing ffmpeg/LiveKit stereo publisher. Public playback controls/API, bot identity, FIFO and lease membership checks remain intact. Pause/next/stop retire the subprocess via existing generation guards; resume preserves real position, including unknown-length references.

The bridge validates provider video ID, positive duration <=2h, non-live state and absence of stream license info before audio. It never implements DRM playback. Authoritative duration comes from the authorized provider response; a missing TV title is obtained from the exact video's official oEmbed metadata with bounded text and DNS/redirect protection. No fabricated title/duration. Playlist import retains the existing bounded flat metadata parser and ten-track order; it no longer loads primary-account browser cookies in the new source mode. Spotify/SoundCloud matching remains the existing conservative resolver; this turn does not claim fresh acceptance of every provider/source.

The source is selected with ROOMS_YOUTUBE_ENGINE=lavalink. Google tokens, signed source URLs and account details stay out of renderer, shared snapshots, source arguments, artifacts and logs. Private parser receives only playback/parser inputs; it does not mount Google credentials and exposes no host/public port. Prior primary-account cookie file and abandoned new main-account device state are preserved but not consumed by this production mode. The owner controls revocation of the earlier Google grant.

## Evidence and limitations

DJ_OAUTH_LINUX_SOURCE_RESULTS.json: actual exact video -> publisher -> isolated SFU receiver,1163frames/RMS11909, position7.598s, stable pause/resume8.643s.

DJ_OAUTH_PLAYLIST_ROOM_RESULTS.json: current guarded bridge/worker, exact video duration203s and real audio, ten-track playlist first duration200s, next-track audio, pause/resume/stop PASS; isolated grants/namespace explicitly DEMO. Owner subsequently confirms real Lounge audibility of both tracks. This is not blanket two-physical-Mac acceptance or a guarantee that unavailable/private/DRM/provider-denied tracks can play.

Maven build,19focused tests, scoped music TypeScript check and scoped lint PASS in disposable Linux QA. Original Mac checks stalled/worker startup failed and are not reported as success; the first replacement harness hit a Vite peer mismatch and AppleDouble files, corrected before the clean pass. No desktop installer/feed/main merge. Rollback image, encrypted scoped backup and old compose preserved. Other service container identities unchanged.

Sources:
- https://github.com/lavalink-devs/youtube-source/issues/226
- https://github.com/lavalink-devs/youtube-source/commit/b33460b38ad13b5cd07da75e46444397cf0ea2df
- https://github.com/lavalink-devs/youtube-source#using-a-remote-cipher-server
- https://github.com/kikkia/yt-cipher/tree/1e1fd8e2f34ca90cf23545be72e46307bd3d3d2a
