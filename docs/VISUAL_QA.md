# Visual and interaction QA

> The **Turkish UI and shared Activity addendum** below supersedes the earlier M0–M3 integration scope. Earlier Spacebar login evidence does not verify the replacement Stoat deployment.

Run on 2026-10-08 in actual Electron on macOS / Apple Silicon. Screenshots are captured from Electron web contents by Playwright; native traffic lights are therefore outside the captured pixels. These are application screenshots, not design mockups.

## Commands and results

- `pnpm typecheck` — passed after final UI changes.
- `pnpm build` — passed. Vite reported the large LiveKit-containing application chunk; this is a performance follow-up, not a build failure.
- `node scripts/visual-qa.mjs` — passed against the final built UI, with an isolated desktop profile and actual local community services on `http://127.0.0.1:3011`.
- `node scripts/visual-edge-qa.mjs` — passed against the same built UI, with an isolated profile.

The full visual run asserted actual media playback time advancing (1.20 seconds observed), a 30-second duration, seeking to 10 seconds, 1.5× playback speed, queue insertion/removal, local message send, persistent local mute state, command dialog dismissal, activity launcher, poll voting, reduced-effects preferences, empty fixtures and no horizontal document overflow at 1280×800 and 900×700.

The same run signed in through the real UI, sent an actual private community message, joined an authorized LiveKit room with the microphone off, and signed out. No renderer page errors occurred. These observations do not substitute for two-device audible voice or physical screen-capture testing.

The final Cinema test entered native macOS fullscreen, captured a 1920×1080 stage, pressed the player’s Exit fullscreen action and asserted `BrowserWindow.isFullScreen() === false`. An earlier HTML Fullscreen exit promise hung in Electron; the desktop player now uses native window fullscreen with an immersive CSS stage. The browser preview retains the standard Fullscreen API.

The edge run asserted 125% and 150% Chromium zoom with no horizontal document overflow, a genuinely empty local voice roster, a media-load failure caused by a missing test source, recovery after restoring the bundled source and pressing Reload, and that typing Space in the Cinema chat composer does not start media playback. Zoom checks are macOS rendering checks, not Windows OS scaling validation.

## Screenshot index

All paths are relative to this document.

| State | Screenshot |
| --- | --- |
| Home, 1440×900 | [home-1440.png](screenshots/home-1440.png) |
| Home, 1280×800 | [home-1280.png](screenshots/home-1280.png) |
| Home, 900×700 | [home-900.png](screenshots/home-900.png) |
| Home, 125% Chromium zoom | [home-zoom-125.png](screenshots/home-zoom-125.png) |
| Home, 150% Chromium zoom | [home-zoom-150.png](screenshots/home-zoom-150.png) |
| Cinema with room dock | [cinema-1440.png](screenshots/cinema-1440.png) |
| Native fullscreen stage, 1920×1080 | [cinema-fullscreen.png](screenshots/cinema-fullscreen.png) |
| Media error state | [cinema-media-error.png](screenshots/cinema-media-error.png) |
| Local Chat with room dock | [chat-1440.png](screenshots/chat-1440.png) |
| Local Voice preview | [voice-1440.png](screenshots/voice-1440.png) |
| Empty Voice roster | [voice-empty-1440.png](screenshots/voice-empty-1440.png) |
| Settings | [settings-1440.png](screenshots/settings-1440.png) |
| Reduced effects | [settings-reduced-effects.png](screenshots/settings-reduced-effects.png) |
| Empty Home fixtures | [home-empty-1440.png](screenshots/home-empty-1440.png) |
| Activity launcher | [activity-launcher.png](screenshots/activity-launcher.png) |
| Command palette | [command-palette.png](screenshots/command-palette.png) |
| Working local poll | [poll-1440.png](screenshots/poll-1440.png) |
| Real connection form | [connections-1440.png](screenshots/connections-1440.png) |
| Signed-in real Home | [community-home-1440.png](screenshots/community-home-1440.png) |
| Real private messages | [community-chat-1440.png](screenshots/community-chat-1440.png) |
| Real authorized voice room | [community-voice-1440.png](screenshots/community-voice-1440.png) |

## Visual inspection and corrections

The actual screenshots were inspected at 1440×900 and the narrow supported layout. Corrections made during QA:

- Replaced a missing stylesheet and missing Cinema screen with the complete visual system and actual player.
- Fixed invalid nested template syntax in the local message composer.
- Prevented IconButton actions inside forms from accidentally submitting them.
- Corrected local Chat scrolling the outer document; the document is now fixed and conversation scrolling stays within its pane.
- Reset the main scroll position when changing routes so Home never opens halfway down after Settings.
- Compacted the Chat sidebar so channel navigation, settings and profile fit at normal desktop height; remaining overflow scrolls within the sidebar.
- Reserved space for the persistent room controls so they do not cover the message composer.
- Removed duplicate Voice-page controls when a persistent room dock is present.
- Changed the decorative “Save the idea” notification into a working route to movie-night polls.
- Removed fixture identities from real community mode. The right inspector displays actual LiveKit room membership; unreliable upstream social presence is explicitly unavailable.
- Corrected trusted native fullscreen entry and exit, and captured the final immersive stage.

## Scope and remaining verification

- VERIFIED: the visual and interaction checks above, actual bundled media playback, UI login/message send and authorized voice-room join.
- IMPLEMENTED, not physically verified here: microphone transmission, push-to-talk audio gating, camera publication, source picker capture and remote screen viewing, and per-participant audible volume. These require consented hardware and separate real clients.
- IMPLEMENTED UI, requires dedicated integration acceptance: invitation creation/registration, author DM actions, block/unblock and owner-only member removal. Server enforcement remains authoritative.
- PLACEHOLDER: synchronized Cinema, provider playback, captions for the silent bundled source, shared polling, YouTube Together, IPTV and Real-Debrid. Their availability and local scope are explicit in the UI.
- NOT VERIFIED: Windows native rendering and 125%/150% OS scaling, screen readers, color-contrast auditing across every transient state, long-running battery/GPU behavior, and switching OS fullscreen from outside the Cinema controls.
- Native fullscreen exit via the player is verified. If navigating away with an app shortcut while in the immersive stage, the OS may remain fullscreen; window mode is a native user preference. The next screen still renders normally.

No test account password, session token, provider credential or private media URL is included in these screenshots or documents.


## Turkish UI and shared Activity addendum — 2026-10-08

The following checks ran in actual Electron on macOS / Apple Silicon with fresh, isolated profiles. Screenshots under `screenshots/tr/` show the implemented application. Requested window sizes use logical pixels; captured PNGs reflect the host display's pixel density. Native macOS traffic lights are outside Electron web-content captures.

### Reproducible commands

- `pnpm typecheck` and `pnpm build` passed. Vite still reports large LiveKit/application and HLS/settings chunks and a mixed static/dynamic realtime import. These are build warnings, not claimed performance acceptance.
- `node scripts/ui-premium-qa.mjs` passed: Home, Cinema, Agent, Games, Together, YouTube, personal provider settings, Agent settings, signed-update unavailable state, launcher, and Home at 1280×800 and 900×700. Each route loaded, reported no document horizontal overflow, and produced zero renderer page errors. The final run also toggled native notification opt-in on/off in its isolated profile and checked the displayed launch-at-login state against the native bridge. One startup attempt timed out waiting for Home while builds were active; a diagnostic reload showed no renderer errors and the complete fresh run then passed.
- `node scripts/ui-activity-qa.mjs` passed and drives two independent Electron clients through a real local Activity HTTP service. The script uses the separate `electron-activity-fixture.mjs` test harness, whose native handler overrides and synthetic social identities are confined to the test process. A yellow QA footer explicitly identifies fixture authorization. This is real shared-state transport evidence with test authorization, **not Stoat authentication evidence**.

The two-client run covers table creation, a second human seat, hand start, two private cards rendered per own hand, legal fold, completed hand history, an actual shared poll vote, a cross-client whiteboard note, and shared bundled-media play/pause/seek. Card privacy is additionally a server responsibility; the UI assertion checks own-hand rendering and must not be represented as a complete hidden-state security audit.

- `node scripts/ui-games-qa.mjs` passed with zero renderer page errors: actual service creation, seat-fill with explicitly labeled bots, hand start and own cards for Blackjack, all four Batak variants, and 101 with both folding/teams selected. The run performs Blackjack stand when legal, a legal bid or trump selection for each Batak stage, and a legal 101 discard after drawing when required. Each table is closed through its confirmation dialog. This is targeted interaction coverage, not exhaustive hand completion for every game.
- A first additional-games test incorrectly waited for a bid after all bots passed; the service had correctly advanced directly to trump selection. The harness now follows the actual permitted stage. An earlier hand-history assertion exposed a missing space in “El 1”; the UI was corrected and the two-client suite rerun successfully.

### Current screenshot index

| State | Screenshot |
| --- | --- |
| Turkish cinematic Home | [home-1440.png](screenshots/tr/home-1440.png) |
| Home at minimum narrow layout | [home-900.png](screenshots/tr/home-900.png) |
| Activity launcher | [launcher-1440.png](screenshots/tr/launcher-1440.png) |
| Cinema | [cinema-1440.png](screenshots/tr/cinema-1440.png) |
| Personal provider controls | [providers-1440.png](screenshots/tr/providers-1440.png) |
| Separate Agent connection | [agent-settings-1440.png](screenshots/tr/agent-settings-1440.png) |
| Agent without connected room | [agent-1440.png](screenshots/tr/agent-1440.png) |
| Games catalogue | [games-1440.png](screenshots/tr/games-1440.png) |
| Blackjack against actual service | [blackjack-service-table.png](screenshots/tr/blackjack-service-table.png) |
| Ihaleli Batak | [ihaleli-service-table.png](screenshots/tr/ihaleli-service-table.png) |
| Esli Batak | [esli-service-table.png](screenshots/tr/esli-service-table.png) |
| Koz Maca | [koz-maca-service-table.png](screenshots/tr/koz-maca-service-table.png) |
| Gommeli Batak | [gommeli-service-table.png](screenshots/tr/gommeli-service-table.png) |
| 101 with folding/team rules | [101-service-table.png](screenshots/tr/101-service-table.png) |
| Update configuration unavailable | [updates-1440.png](screenshots/tr/updates-1440.png) |
| Alice at authoritative Hold'em table | [holdem-alice-live-service.png](screenshots/tr/holdem-alice-live-service.png) |
| Bob at the same table | [holdem-bob-live-service.png](screenshots/tr/holdem-bob-live-service.png) |
| Shared poll vote | [poll-two-client-service.png](screenshots/tr/poll-two-client-service.png) |
| Shared whiteboard note | [whiteboard-two-client-service.png](screenshots/tr/whiteboard-two-client-service.png) |
| Shared Cinema, Alice | [cinema-alice-shared-service.png](screenshots/tr/cinema-alice-shared-service.png) |
| Shared Cinema, Bob | [cinema-bob-shared-service.png](screenshots/tr/cinema-bob-shared-service.png) |

### Corrections driven by checks

- The expanded navigation, settings and profile remain reachable; the sidebar and game table were compacted without reducing primary control hit areas.
- Shared Cinema is tied to the verified bundled independent source. Selecting a personal local file disables that shared starter, and personal playback never publishes its URL or position to Activity.
- Ended game activities return to the catalogue; stale persisted table state no longer hides the launcher.
- Hand history now separates “El 1” correctly and displays actual payouts or scores. Batak bidding respects variant-specific minima and the 16-trick Gommeli maximum. Live chip labels use authoritative in-hand values.
- Native errors cross the Turkish message boundary before display. Stored model configuration is distinguished from successfully exercised provider authentication.
- Interrupted Agent operations expose the exact uncertain operation and require externally verified result or explicit confirmation that the operation was not applied. The UI does not offer a blind retry.
- Provider positions remain private in the native vault. Non-live playback saves its position periodically, on pause and on exit; a completed title clears the position.

### Evidence boundaries

The new Stoat live account, friend, attachment, reaction, profile and invite flows are implemented against native APIs; these UI tests do not claim a live Stoat account session. Real-Debrid, Xtream, protected customer IPTV, remote model authentication, external-write approvals, hosted YouTube synchronization, signed production update download/install and OS notification delivery require their configured services or accounts. The disconnected screens show precise reasons rather than fixture success. Parent integration acceptance records any separately verified public HLS or native tests.

Windows, physical microphone/camera/screen capture, long-running rendering performance, a screen reader audit, and all game rules through exhaustive UI play remain unverified here. Domain/service game tests are separate evidence from these Electron checks.

Native desktop preferences now initialize notification opt-in and launch-at-login from the OS bridge. Stoat read markers are restored through `readStates()` and `READ_STATE_SYNC`, with own `MESSAGE_ACK` updates. The UI uses an unread indicator from actual last-message/read-marker differences or observed new messages, never an invented total unread count. Missing server read state is unknown. A failed read acknowledgement does not clear the indicator. These account-dependent read-state flows are implemented and typechecked; no new live Stoat account verification is claimed.

### Source-message reminders — 2026-10-08

`pnpm build` (including typecheck) and `node scripts/ui-reminder-qa.mjs` passed after the dedicated reminder implementation. The test opens a normal message's Clock action, checks the source preview, submits the exact edited note/time and source identifiers, verifies zero model submissions and zero memory writes, displays the reminder kind in Agent, cancels it, and checks the precise disabled reason when `stoat-reminders` is unavailable. Renderer page errors: zero.

This test deliberately substitutes the Agent bridge inside the test-only Electron process; screenshots explicitly say **Simulated Agent bridge · No live bot delivery**. It verifies UI interaction and IPC input binding, not real Stoat delivery, authorization, scheduling durability, or source-chat notification. The Agent service tests cover their own server behavior separately.

- [Reminder form and source preview](screenshots/tr/reminder-dialog-fixture.png)
- [Cancelled reminder without model connection](screenshots/tr/reminder-cancelled-fixture.png)
- [Unavailable bot configuration](screenshots/tr/reminder-unavailable-fixture.png)

Read acknowledgement race correction: `markRead` waits for native acknowledgement without overwriting subsequently received authoritative `READ_STATE_SYNC`. `MESSAGE_ACK` keeps exact mention IDs and compares the latest channel message with the acknowledged ID for the indicator. Opaque message IDs are never ordered to infer read state.
