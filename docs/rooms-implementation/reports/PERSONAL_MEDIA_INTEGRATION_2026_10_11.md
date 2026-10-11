# Personal media integration — 2026-10-11

Status: implementation and isolated checks, not provider or visual acceptance.

## Integrated behavior

The standalone `/media` surface shares the existing personal UI with Settings. Named `view=channels|library`, `dialog=iptv|xtream|rd`, and UUID-only `connection`, `edit`, `remove` entries resolve only metadata already returned for the current native identity. Missing explicit connection IDs do not silently open a different provider. Credentials, filenames, provider URLs and file contents never form route parameters. The account/server wrapper unmounts private drafts on identity changes. Foreground playback also binds the owner server as well as user ID; equal IDs on different servers cannot retain the renderer session.

A native chooser returns only a one-use file token and safe display metadata. Explicit submission imports it through the typed preload boundary. Playlist/Xtream editing leaves every stored secret input empty and omits unchanged fields; XMLTV can be explicitly removed. Failed candidate validation keeps the editing dialog and old connection. Native save-before-publish and scope checks are documented in PERSONAL_PROVIDER_MUTATION_REPORT.md. A failed refresh is not a provider success claim.

RD cancellation invokes the native generation fence rather than merely changing renderer text. Closing or unmounting a pending RD dialog also cancels the native attempt, while stale renderer grants/receipts are ignored. Cancellation does not claim upstream device-code revocation. Reconnection atomically replaces the current owner's RD credentials; a failed pending attempt preserves an existing account.

The legacy unscoped v1 vault is preserved untouched and never assigned to the next signed-in user. V2 encrypted partitions are keyed by a hash of server/account identity. Existing users must reconnect their personal providers. Epoch changes invalidate outstanding work, even on same-account sign-out/sign-in. Every streamed protocol chunk checks ownership; renderer hiding alone is insufficient.

The community sidebar now remains visible beside personal media. Its real voice controls retain access without a duplicate floating dock on wide layouts; narrow layouts retain the dock. Private playback still lives independently of navigation and Activity state.

## Development-only reference entry

The new getter uses the native bridge in production and an explicit opt-in in-memory adapter in development. The adapter is installed before App mounts, cannot invoke native/provider/browser operations, and exposes 31 inventoried S33–S39 metadata intents. It does not manufacture playable URLs. Root added a lazy DEV entry using the production PersonalMedia component, exact bootstrap and capture readiness/interactions.

Exact application captures are enabled for S33, S34, S35, S37, and S38 default/empty/details. Checking/error/waiting/expired/cancelled variants use actual component actions with local fixture receipts, not overwritten DOM or a prototype. S36, S38/playing and S39 capture are deliberately refused until their precise persistent-player presentation/state entry is integrated. Metadata seed support does not certify those screens.

A capture timeout exposed a real StrictMode issue: mount cleanup advanced the dialog epoch, causing a direct edit entry to be skipped. Entry dismissal now uses explicit user-close state, independently of unmount fencing. A focused regression exercises direct edit after StrictMode replay. This is not an owner/provider acceptance scenario.

## Reference gaps retained

A scoped read-only GPT-6.1 Sol audit individually opened all 31 original S33–S39 PNGs. Root opened original S33/S34/S35/S37 main images and actual S34/S35 application images. These establish comparison gaps, not acceptance:

- S33 resume cards need real safe resume/library metadata. No invented artwork, duration, historical playback or reference promotional slogan was added.
- S34 uses one truthful validation spinner; the reference's staged fetch/parse/access success rows require independently observed phases. XMLTV options and retained-secret editing intentionally differ. Initial input focus follows the existing accessible Modal behavior.
- S35 program data currently opens per channel. Inline now/time/progress, coalesced/bounded XMLTV projection, Xtream category names and Xtream guide integration remain open. The empty fixture currently represents a successful zero-channel result rather than the reference's filtered no-match state.
- S36/S38-playing require an inset browse-player mode that preserves the same video element. Typed expiry/format states, actual now/next and observed DVR presentation remain open.
- S37 needs the reference stepper and state-specific hierarchy, an explicit terminal auth-error state and connected removal action; no provider simulation control belongs in production.
- S38 added-date/resume fields require genuine provider metadata; current safe rows expose size/format. Details lack real duration, artwork and resolution.
- S39 unsupported/external review and source-track modal remain unaccepted; external player needs an authorized native broker and must not disclose secrets.

Current local suite/build and exact capture results are recorded in CHECKPOINT.md/PROGRESS.json after completion. All affected inventory records remain NEEDS_RECHECK. No remote provider account, Agent host, production service, Hoppers, signing, physical device or existing delivered release was changed or certified.
