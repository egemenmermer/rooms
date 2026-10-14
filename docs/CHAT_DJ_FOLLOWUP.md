# Chat and DJ controls

Text and voice creation controls are visible in the compact sidebar. Channel management uses current upstream capabilities; successful text creation navigates to the new conversation. Private-message creation selects a friend or an authorized community member through the existing upstream DM path.

Raster photo previews load through native IPC: authoritative message/attachment lookup, same-origin configured file service, bounded MIME/bytes, channel and account rechecks. No arbitrary renderer URL fetch or image CSP expansion. Photos open larger on click; failures have retry.

DJ commands include UUID-based track selection and complete queue reordering. Reordering preserves the current playing track without restarting it; stale/duplicate membership is refused. Keyboard move controls accompany drag-and-drop. A completed final track restarts from zero; adding to a finished queue starts the new entry.

Room listening sessions are stored by the music service in a private state volume with atomic synchronized writes. Public YouTube references only; provider credentials and private media URLs are not archived. Spotify/SoundCloud references already resolve to these public recordings. Authorized clients receive only bounded metadata and played indicators, with access rechecked after reads. Restoring a session or an individual historical track requires the existing joined DJ-control grant; it adds the recording(s) to the queue and starts the chosen entry. Thirty sessions per room and two hundred total bound retention. Sessions from before this feature cannot be reconstructed automatically.

Provider matching retains artist, title, version and duration checks. Flat Topic metadata can omit featured artists: a fallback requires exact primary Topic artist/title, a duration difference of at most two seconds, and a single unambiguous candidate. Shorter music-video edits, wrong artists and ambiguous results are rejected. Failures distinguish metadata matching, provider refusal, loading timeout, audio decoding, transport and history persistence.

## Distribution boundary

Source and public packages must exclude community addresses/configuration, private artwork, account data, listening history, signing/private keys, private receipts and real-user screenshots. Community runtime configuration and custom branding stay outside source. Public source branding fallback and explicit-server onboarding remain intact. Publication tree/history checks are required; current community binaries, feed and accounts are not changed by a source commit. Private signing/update configuration must be audited separately before any public binary publication.

## Validation boundary

Scoped automated and local fixture/native checks are recorded privately by the operator. They do not close physical-device acceptance or certify every provider recording. No release is authorized by this implementation document.
