# How ROOMS works
## Startup and navigation
Electron selects an optional isolated profile, starts native services, installs narrow IPC handlers and creates the sandboxed window. The production renderer loads bundled assets; development uses the controlled loopback Vite origin.
The renderer initializes the community session. Signed-out first launch reaches welcome/sign-in/invite registration. Remembered credentials are restored in main, not read from renderer localStorage. Routes select views while persistent voice and player runtimes live outside the selected page.
The root boundary can reload the view after a rendering failure. A displayed welcome screen proves rendering, not successful authentication.

## Invite → account → community
A ROOMS signup ticket is separate from an upstream community invitation. The broker stores the ticket lookup digest, expiry and consumption state. Registration claims the ticket before external account creation.
The upstream account creation/onboarding/community-join work occurs through the server-side broker. The raw upstream account-create path stays private. Successful account session storage uses the native vault when “remember” is selected.
Uncertain or partially completed creation must not be retried as though nothing happened. A consumed/failed ticket requires accurate recovery/operator investigation rather than duplicate account creation.
Signed-in invite join and account creation are distinct flows. A ticket being valid does not establish that SMTP, every partial-signup recovery case or the newest GUI has been accepted.

## Chat and relationships
The renderer requests channel/message data through native social methods. The adapter performs scoped REST calls and listens to actual gateway events.
Messages are reconciled with optimistic sends and incoming create/update/delete events. Bounded hot history avoids blanking a conversation during refresh; account/server/access changes invalidate old results and native cache reads.
An encrypted account/server-scoped disk cache contains bounded message text and author labels, not permanent attachment/avatar URLs. Logout clears it. This cache is not authoritative social storage.
Friends, incoming/outgoing requests, blocks, profile and presence use upstream relationships/events. UI state must not synthesize online users or turn a failed read into a verified empty list.

## Join voice → publish → navigate → leave
1. Native code obtains a broker grant for the current real account/channel.
2. Broker verifies membership and effective view/connect/speak/video/listen permissions.
3. Client connects to the authorized LiveKit room.
4. User action/device permission precedes microphone/camera publication.
5. Screens can change while the media runtime stays connected.
6. Mute/deafen/local gain affect the appropriate tracks; participant UI derives from actual transport state.
7. Leave/logout/revocation cleans up publication and connection.
A media-connected badge is not proof another machine can hear the microphone. Physical audibility, missing-device fallback, permission denial and restrictive-network recovery are separate acceptance steps.

## Screen and system-audio sharing
User opens native source selection, chooses a screen/window and explicitly opts into supported system audio. Source access is short-lived and bound to the selected capability. A presenter reservation controls simultaneous screen publication.
The application requests a quality profile, but observed dimensions/FPS/codec may differ. Missing requested audio publication must not be described as successful stereo sharing. Stopping, leaving or revoking access must end source publication.
Presenter handoff concerns media-source permission; it is not automatically transferred because Activity host changes.

## Shared Activity
The client submits a validated envelope containing protocolVersion, commandId, expectedRevision and a typed command.
Server authenticates current membership, serializes the room operation, checks revision/idempotency and persists authoritative state. Other clients receive long-poll snapshots/events and update their projections.
The native client retries only explicit revision-conflict rejection with refreshed state and the same command identity/payload; it must not repeat an uncertain external mutation blindly.
Polls and board coexist with the primary room Activity. Ending an Activity does not end voice. Game deck/private hands are projected separately for each authenticated player.

## Personal playback and together viewing
A selected local file or connected personal provider produces an opaque local playback handle. Private URLs and credentials remain native.
Shared timeline/source-reference metadata is not a rebroadcast license or shared credential. Each participant must independently have an allowed source, or use explicitly permitted screen sharing.
The older official YouTube iframe loads separately for each viewer. Current production /youtube opens the DJ popup instead: do not confuse historical player evidence with current audio-bot behavior.

## Optional music worker
An authenticated controller already in voice asks the broker for a music action. A lease authorizes a publish-only worker identity. The worker connects to the SFU, resolves a bounded queue/source and publishes PCM audio.
The queue is volatile; popup close does not stop the worker. Stop, empty/revoked room, lease expiry or idle policy can terminate it. Provider/cookie failures are real errors; displaying a bot participant is not proof of decoding or audible playback.
The extractor is a third-party path, not the official YouTube iframe. Provider/content permissions must be settled before public distribution.

## Optional Agent task
A scoped user selects their own model profile and room task. The separate host persists tasks, approvals, logs/artifacts and operation journals; workers receive only permitted resources.
External writes need operation-specific approval unless the authorized automation policy permits them. Uncertain effects require reconciliation, not blind retries. Reminders have source-message scope and a durable delivery outbox.
Configured buttons or fixture task cards do not establish actual Linux execution, bot delivery or connected external accounts.

## Signed update
An owner-selected identity signs the Mac bundle. The pipeline requires accepted notarization, stapled tickets and trust assessment, recreates the ZIP from the stapled app and signs an appcast.
A packaged configured Sparkle bridge owns update checking/download/install UI; explicit opt-out is preserved after migration. Feed reachability proves neither actual upgrade success nor data preservation. Test a real older client and failure/interruption recovery.
