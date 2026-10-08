# ROOMS visual system

ROOMS is a private evening space. The shell stays quiet, the activity takes the stage, and the user's room context remains visible. The macOS desktop is the first implementation target.

## Visual decisions

- A 64 px spaces rail, 211 px floating navigation panel, adaptive central content, and optional 216 px friends inspector. The friends inspector collapses below 1250 px. Cinema removes navigation and uses a 263 px contextual room dock.
- The window uses native traffic lights in Electron. A 44 px draggable title area reserves native control space. No HTML imitations of OS controls.
- The Home hero is a full photographic landscape with an asymmetric scrim, an editorial serif headline, one primary action and one secondary action. Original artwork is bundled locally; no entertainment-provider posters are shipped.
- Content shelves use opaque artwork and bare typography. CSS glass is restricted to floating navigation, transient panels, the persistent room bar and playback controls. It is a CSS approximation, not a claim of native Liquid Glass.
- Cinema opens a dominant 16:9 stage. Original media is actually playable. Controls float over a readable gradient; volume, seeking, speed, PiP and fullscreen operate on the HTML media element. The controls hide after pointer inactivity during playback and remain visible for keyboard focus.
- Serif type is platform Georgia for editorial moments only; UI type is the native system sans-serif. Initial avatars and tone-based space marks intentionally avoid fabricated portrait photography.

## Tokens

| Role | Value |
| --- | --- |
| Canvas | `#0B0D11` |
| Surface | `#151A22` |
| Primary text | `#F4F6F8` |
| Secondary text | `#ABB3C0` |
| Quiet text | `#8B95A4` |
| Pearl focus accent | `#B8CDFF` |
| Sage alternate accent | `#AFCBB8` |
| Hairline | `rgba(255,255,255,.075)` |
| Glass | `rgba(27,32,42,.78)` + 25 px backdrop blur |

Controls use 7–10 px corner radii, panels 12–20 px. Spacing follows a 4/8 px rhythm with optical adjustments for tight desktop controls. Body copy is compact; primary editorial headlines range from 25–54 px depending on placement and window size.

## Implemented reusable primitives

`packages/design-system/src/index.tsx` owns labeled IconButton, Avatar, AvatarStack, Modal, EmptyState and Toggle. Modals trap keyboard focus, dismiss with Escape and restore the previous active element. Icon buttons default to `type="button"` to avoid accidental form submission. Each icon action has an accessible name and native tooltip.

Shared CSS establishes buttons, input fields, segmented selection, room artwork cards, settings rows, chat groups, popovers, command palette, queue items, media controls, device controls, errors, toasts and connection state banners. Product screens remain separate React components to keep ownership explicit.

## Interaction and accessibility

- Command/Ctrl K opens command search; Command/Ctrl 1–5 navigates; Command/Ctrl comma opens settings.
- Space plays/pauses local Cinema, arrows seek by five seconds. Keyboard media shortcuts ignore text fields, buttons and open dialogs.
- Every native range input has an accessible label. Native select controls provide keyboard-compatible settings.
- Reduced motion honors both the OS setting and the app preference. Reduced transparency replaces glass with solid surfaces. Compact conversations changes message spacing.
- Message actions are revealed on pointer hover or focus within the message. Local message edit/delete uses real state and destructive confirmation.
- Empty room, empty queue, empty poll collection, unavailable media, denied microphone access, missing integration, connection failure and reconnecting states have explicit text.
- The local fixture label stays visible. No sample avatar implies a real connected call. Signed-in community data is isolated from local fixtures.

## Reference study

The supplied master prompt and both reference gallery files informed the work. Apple TV support's Home composition informed stage dominance and focused actions. Apple's materials documentation informed limiting glass to controls. The fokus site informed compact command panels and keyboard-led transient UI. None of their screenshots, logos, code or protected artwork is shipped.

The primary reference URLs are preserved in `docs/reference/ROOMS_VISUAL_REFERENCES.md`.

## Connected community and media states

Real mode uses `community.ts` and `realtime.ts`, independently of the local fixture store. `ConnectionPane.tsx` presents actual server login and invitation registration. `RealSocial.tsx` renders channels, optimistic and failed messages, retry, editing, removal, history, direct-message entry, block controls and owner-only removal confirmation. No fixture identities are mixed into signed-in mode.

The real room dock persists across routes and includes real mic/deafen/camera state, a deliberate screen-source picker, visible Stop sharing, audio-autoplay recovery and leave. Error notices persist near the dock. Microphones start muted. Push-to-talk is opt-in in Voice & audio; holding Ctrl + Shift + Space unmutes only while ROOMS is focused. Release, modifier release, window blur and visibility loss remute. Text editing and dialogs are excluded.

Social presence from the current upstream instance is explicitly unavailable. Actual LiveKit participant membership and speaking state are used only while a room is connected. Native Cinema fullscreen uses the Electron window control and a fixed stage, with a browser-only standard Fullscreen API fallback.


## Turkish connected surfaces — current implementation

The expanded UI retains the cinematic photographic stage, quiet charcoal shell, serif editorial moments, and glass confined to navigation and floating controls. Added surfaces reuse those materials instead of introducing a card grid across every screen.

- `i18n.ts` and `messages.tr.ts` provide the Turkish message boundary and native-error translations. Provider names, protocol identifiers, user content and actual operation previews remain faithful to their source; general application copy is Turkish. The source-message key interface leaves room for a later locale without persisting translated data.
- `Games.tsx` uses a restrained green felt, clear seated identities and explicit bot labels, card/tile private hands, server-derived legal actions, actual hand outcomes, and virtual-only points. Open seats and insufficient-player states explain their requirements.
- `Together.tsx` provides authoritative shared polls and an SVG whiteboard with drawing, text and author-scoped removal. It never substitutes a local vote for a failed shared command.
- `YouTube.tsx` uses the official player inside a configured-origin isolated shim. Its iframe source and nonce are validated; room transport controls remain separate from the official player.
- `Agent.tsx` uses an editorial empty state followed by a jobs master/detail view. Progress, task results, actual downloadable artifacts, concrete pending operations, single-shot scheduling and explicitly saved memory each have their own clear treatment. Global YOLO affects only server-authorized work; its label never implies expanded privileges.
- `Providers.tsx` keeps playlist, Xtream and Real-Debrid connection forms in personal settings. Credentials are submitted to native APIs; only opaque playable references reach the renderer. Channel favorites, XMLTV guide, library, and resume position remain personal.
- `People.tsx`, `RealSocial.tsx` and `Invite.tsx` use real native friend/profile/message/attachment/reaction/invite APIs. An invite is previewed before acceptance. Existing account/server mismatch is explicit.
- Native update and notification preferences use authoritative native status. Signed updates remain disabled with their configuration reason in development; no fabricated update availability is shown.

Voice is still owned by the persistent realtime store and dock, independently of route transitions or Activity end. Shared media state, personal media state, social authorization and Agent authorization use separate paths. The UI never infers online presence, an authenticated model, or a successfully performed action from a decorative state.

Normal messages have a separate Clock action for a one-time reminder. `Reminder.tsx` shows the original message and author/channel context separately from the editable notification note and local date/time. It requires the actual `stoat-reminders` capability, uses no model connection, and never saves the source message to Agent memory. Reminder jobs are labeled distinctly and can be cancelled from the existing Agent task view. Missing bot configuration remains a visible, disabled state with an actionable explanation.
