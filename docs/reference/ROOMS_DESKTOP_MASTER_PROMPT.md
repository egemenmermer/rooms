# MASTER BUILD PROMPT — ROOMS (working title)
## Private desktop social club · Apple TV cinematic direction · macOS Liquid Glass-inspired controls · Discord-like communication · Activities-first

> Copy this whole file into Codex / Claude Code / another coding agent. Replace the working product name only if needed. Use the linked visual references in `ROOMS_VISUAL_REFERENCES.html` alongside this brief. This is an original product inspired by design principles; do not copy Apple's code, assets, logos, icons, screenshots, or trade dress.

---

## 0. YOUR ROLE AND THE OUTCOME

Act as a principal product designer, exceptional desktop UX engineer, real-time systems architect, and pragmatic staff full-stack developer. Your mission is to actually BUILD and ITERATE on a highly polished, private, installable desktop app tentatively called **Rooms** (working title only). Think of a private social clubhouse that brings together the useful parts of Discord, Apple TV, watch-party applications, and collaborative mini-activities.

The primary users are a close group of friends (initially 4–20) who want to meet in persistent voice rooms, chat, screen-share, watch YouTube together, open a cinema session, watch personally authorized IPTV sources, link their own media accounts, and start interactive games or predictions without bouncing between apps. They are mostly on Windows desktops with some macOS users. The owner should be able to self-host the project. The first release is not for public growth or monetization.

**This is NOT:** a marketing site, a mobile-first responsive dashboard, a Discord clone with a generic glass skin, a concept-only Figma mockup, a static slideshow, a piracy streaming platform, a generic glassmorphism UI kit, or a fake prototype pretending to support media playback.

**This IS:** a real desktop app with a premium aesthetic, thoughtfully designed navigation and motion, clear usable daily flows, reliable calls and screen sharing, provider-aware media playback, and an extensible Activity framework.

Your first duty is to inspect the existing repository/environment. Do not assume there is an existing codebase, particular credentials, or a configured Spacebar server. If a repo is present, map it and propose an incremental approach. If none exists, scaffold a suitable monorepo. Distinguish completed code from integrations requiring credentials/servers. Keep all mock/dev data explicitly labelled, never fabricate successful test results, and never hide a broken integration under a polished UI.

At the end of each phase, supply actual screenshots from the running desktop UI, specific working commands, tests executed, known limitations, and the next unblocked milestone. Never declare a feature finished if you have not exercised its happy path and its important failure states.

## 1. PRODUCT DNA

Working name: ROOMS. Naming, logo and exact accent are provisional.
Product thesis: **Your private place to hang out, watch, talk, and do things together.**
Core emotional qualities: cinematic, calm, intimate, joyful, exceptionally crafted, effortless, tactile, fluid, premium, familiar but distinctive.

Product rules:
1. The user's current social context should always be obvious: which room, who is there, what is playing, who controls it, and how to join.
2. Joining a friend's activity is easier than creating a new server/channel.
3. Voice is persistent. Opening Cinema, YouTube or a mini-game does not unexpectedly disconnect the user's microphone.
4. The content is the hero, controls are quiet. Minimize chrome during playback, and restore it on interaction.
5. The whole UI is designed for the desktop pointer, keyboard, and native windowing—not a web page trapped in a desktop shell.
6. Invite-only by default. Friends and a few private spaces before any public discovery system.
7. Activities are modules with their own state but shared presence, room membership, permissions and communication.
8. Every status is real: connecting, connected, retrying, unavailable, permission denied, expired provider authorization, media not licensed, etc.
9. Never imply that an external account, stream, or screen is shared across viewers if no legitimate sharing pathway exists.
10. The owner can self-host. Avoid expensive infrastructure or overbuilt microservices.

Primary user moments:
- Launch Rooms, see friends live, click a room, and talk in under ten seconds after authentication.
- One person starts screen share; everyone already in the voice room sees a small stage preview and can expand to immersive viewing.
- Someone opens YouTube Together, pastes a link, presses Play; each viewer runs the permitted official player locally and playback stays synchronized.
- Someone starts Cinema with a media source they are authorized to access; other viewers join the room, with the actual playback/share path made explicit.
- Each person can privately connect their own IPTV or Real-Debrid credentials. Tokens are never exposed to other friends.
- Someone queues a video, requests the remote, creates a movie poll, or starts a trivia game without losing voice.

## 2. DESIGN INSPIRATION: USE PRINCIPLES, NOT CLONES

Use four complementary reference lenses:

**A — Apple TV for Mac:** dark cinematic canvas; visually dominant feature/artwork; highly curated content hierarchy; edge-to-edge media stage; editorial title composition; restrained content shelves; contextual, minimal actions.

**B — macOS Tahoe / Liquid Glass:** believable floating sidebar, titlebar, navigation, floating playback controls and transient sheets; physically plausible translucency, depth, subtle highlights and luminosity adaptation. Use glass on navigation and controls, NOT on every content tile. Preserve legibility and hierarchy.

**C — fokus.to:** calm spacing, exquisitely polished lightweight UI, quick keyboard-native actions, intelligently sized floating panels, unobtrusive overlays, effortless dismiss/reveal behavior, non-gimmicky motion.

**D — Contemporary native media software:** thoughtful media-player behavior, true keyboard and window affordances, robust device selection, reliable tray and small pop-out mini-player.

Reference links:
- Apple TV for Mac, Home: https://support.apple.com/guide/tvapp-mac/start-watching-atv7bf64f99/mac
- Apple TV for Mac, Search: https://support.apple.com/guide/tvapp-mac/search-atvfdeac607/mac
- Apple HIG, Materials: https://developer.apple.com/design/human-interface-guidelines/materials
- Liquid Glass: https://developer.apple.com/documentation/technologyoverviews/liquid-glass
- Fokus: https://fokus.to/
- Spacebar backend: https://github.com/spacebarchat/server
- Spacebar project: https://github.com/spacebarchat/spacebarchat

Review the accompanying linked-image reference gallery. Keep this product's own original visual identity. No Apple logos, copied Apple interface screens, Apple TV branding, Discord branding, copyrighted promotional poster assets without licensing, or proprietary fonts bundled without rights. Use system fonts for macOS and Inter or appropriate licensed fallback elsewhere.

## 3. DESIGN SYSTEM — PREMIUM, QUIET, DARK-FIRST

The UI must look like a desktop app designed with exceptional taste. Not generic shadcn cards stacked on a page. Not overly thick borders, neon gamer gradients, rainbow glows, visible CSS noise, dozens of colorful glass panes, emoji-as-icons, or exaggerated iOS-like bubbles.

Base tokens (adjust gently if actual reference study justifies it):
- Window background: `#0B0D11`; background elevation: `#11151B`
- Content surface: `#151A22`; elevated solid surface: `#1B212A`
- Primary type: `#F4F6F8`; secondary: `#ABB3C0`; tertiary: `#78818E`
- Accent: cool pearl-blue `#B8CDFF`, optional neutral ivory as primary focus depending on context
- Success: muted emerald `#65BC94`; warning: amber `#E7B96F`; destructive: soft red `#E57B7B`
- Hairlines: `rgba(255,255,255,.10)`; stronger border `rgba(255,255,255,.18)`
- Glass regular: e.g. translucent neutral material with backdrop blur 16–30px and sufficient text contrast
- Glass clear: more transparent ONLY over media, with optional local dark scrim
- Radii: 10–14px input/control; 16–20px sheets/panels; 22–28px prominent activity surfaces
- Density: careful 4/8px rhythm; generous top-level breathing room; compact sensible text channels
- Typography: platform system font on macOS; Inter/system-ui elsewhere; correct font weight and tracking

Important glass principles:
- Use real OS native vibrancy/material effects where maintainable; CSS `backdrop-filter` is an approximation, never claim genuine macOS material elsewhere.
- Only floating navigation, the primary command bar, context menus, inspectors, mini-player chrome and media control overlays use glass. Primary reading surfaces remain readable and mostly opaque.
- Glass edges get a fine bright hairline, a subtle inner upper highlight, barely visible soft ambient reflection, and restrained drop shadow. No obvious white blur rectangles.
- Backdrop only blurs what's actually underneath. Avoid flat translucent fills with no context.
- The background artwork may influence a very subtle ambient color bloom behind the player; this is not decorative neon lighting.
- Blur and motion MUST degrade gracefully on low-end hardware and when Reduce Motion/Transparency is enabled.
- Animations: hover 90–140ms, standard transition 160–220ms, modal/sheet 220–320ms; spring-like, not bouncy. Inactive/hidden components should not continuously animate.
- States: rest, hover, pressed, focused, selected, disabled, loading, destructive, success, permission-denied, offline, recovering.

Build a reusable design system: Shell, WindowChrome, GlassSidebar, GlassToolbar, GlassPopover, HoverToolbar, ActivityTile, PlayerControls, MediaShelf, ArtworkCard, MiniPresenceAvatar, VoiceMemberRow, ChatBubble, ChatComposer, ContextMenu, ActionSheet, NativeDialog, ComboBox, CommandPalette, KeyboardHint, SegmentedControl, VolumeSlider, Scrubber, DevicePicker, ProgressRing, Skeleton, ErrorPane, Toast, ToolTip, ConfirmationDialog, and SettingsRow.

Icons: consistent slim, well-aligned vector icons; use Lucide as a starting point, customize only when useful. Use properly licensed or original sample media artwork.

## 4. DESKTOP WINDOW SHELL

Target Windows 11 first and macOS 14+ next, with macOS Apple Silicon included. Aim for excellent behavior at 1280×800 and 1440×900, 125%/150% Windows scaling, and high-density Mac screens. Smallest supported usable width around 900px with collapsed regions.

Recommended stack: **Electron (current stable) + Vite + React + TypeScript** for mature desktop capture and Chromium media support; only choose Tauri if a verified platform capture and system-audio plan exists. Use a secure preload bridge with `contextIsolation`, sandboxing where compatible, no Node integration in untrusted renderer, a strict navigation policy, safe external URL handling, appropriate CSP, and tested updater/signing flow. Renderer should NEVER directly receive privileged provider credentials.

Shell specification:
- Native-feeling titlebar with macOS traffic-light space and Windows minimize/maximize/close. Include draggable and non-draggable regions correctly.
- Leftmost rail for Spaces (approx. 66–74px), optional channel sidebar (240–272px), main adaptive area, optional right contextual inspector (300–340px).
- Home or Cinema modes can hide the channel sidebar, letting the media stage dominate. Never waste half the width on fixed sidebars.
- Sidebar overlay/collapse at narrow widths. Center stage and member dock use responsive constraints.
- Persist window size, last open space, panel visibility, audio/output preference, mini-player geometry.
- System tray icon, background connection behavior, user-controlled launch at login, configurable notifications.
- Support native deep links to invitation, friend, room and activity (validate them!).
- Optional floating mini-player / call bar with always-on-top toggle, drag, mute/deafen and leave.
- No fake macOS window controls on Windows. Platform-adaptive rather than pretending both OSes are identical.
- No accidental OS audio-loop; mic and speaker settings distinct.

### Suggested global layout

LEFT SPACES RAIL [72] | CHANNEL SIDEBAR [260] | PRIMARY STAGE [flex] | CONTEXT INSPECTOR [320 when needed]
TOP: minimal intelligent titlebar / breadcrumb / member avatars / session action
BOTTOM: floating compact voice dock, separated from activity player controls

The window should feel edge-to-edge. Immersive content flows beneath overlays instead of existing inside a conventional bordered admin card.

## 5. APP SCREENS: IMPLEMENT EVERY STATE THOUGHTFULLY

### 5.1 First launch, sign in, and invitation
- Beautiful sparse introduction with one core action: Join your friends.
- Secure account flow backed by actual server/auth integration. Local development may expose explicit Demo Mode.
- Invite-only registration with expiry, one-time or reusable invites, copy link and helpful invalid/expired states.
- Input display name and avatar, mic permissions check, optional speaker test and basic 2-step onboarding.
- Do not collect unnecessary personal data.

### 5.2 Home / Tonight
- The emotional home screen, not a traditional server list.
- Editorial hero for "Your friends are here" / active event; gently artwork-tinted if a session exists.
- "Happening now" horizontal / editorial group showing live room sessions: Cinema, screen share, YouTube, voice lounge, match night.
- Each card: room title, current activity, organizer/host, overlapping friends avatars, number in room, a very clear Join button, live status and last updated. Never fake numeric engagement metrics.
- "Your spaces", "Recently visited", "Up next" and quick actions without excessive scroll.
- Empty: "It's quiet here. Start a room." with useful CTA.
- Keyboard shortcut to search / join.

### 5.3 Space / channels / chat
- Slim spaces rail with subtle selected marker and tooltip.
- Channel sidebar grouped into Text, Voice, Activities; collapsible sections with correct unread indicator, mute, membership and join controls.
- Text channel main area: conversation bubbles or calm message grouping, time dividers, threads if supported, inline attachments, reactions, mentions, edit/delete with correct permissions, channel topic and message composer.
- Member/context inspector invoked when useful; not permanently visible by default.
- Chat should not look like a giant collection of chat cards. Design dense but breathable.
- Ensure optimistic send, error retry, new-message badge, scroll anchoring, read state and pagination.

### 5.4 Voice lounge
- Clicking a voice room connects. One coherent prominent bottom floating voice control bar with microphone, headphones/deafen, screen share, camera optional, quick Activity +, devices, exit.
- Friend avatars / waveform/volume state; talking border rings are tasteful and not flashy.
- Display connecting/reconnecting, muted locally/by moderator, device disconnected, low bandwidth and permission denied states.
- Joined voice stays joined when switching between chat, cinema and queue. Leaving an activity does not equal leaving the room.
- Voice roster with individual volume control, mute-for-self, context menu, speaking indicator.

### 5.5 Activity launcher
- Clicking the plus opens a floating glass launcher, ideally keyboard searchable and constrained in size.
- Tabs/categories: Watch, Share, Play, Together.
- First-party tiles: Cinema, YouTube Together, Screen Share, Live TV, Queue, Poll, Quiz, Tier List, Whiteboard.
- Clearly show "Ready", "Requires setup" or "Coming later" rather than clickable dead UI.
- Create/join permission and one-active-primary-media-activity policy per room. Voice persists.

### 5.6 Cinema / theater — HERO SCREEN
- The cinematic signature screen. A large dominant player/black stage that uses the available area elegantly, never a tiny player boxed into a dashboard.
- Floating top control: Back, title, activity status, participants, invited friends, activity menu.
- Bottom overlay: play/pause, progress/scrubber, timecode, volume, captions/audio/subtitle menus when supported, playback speed if permitted, fullscreen, theater settings, queue, remote-control status.
- Auto-hide overlays after idle with instant reveal on pointer/key; correct focus management.
- Adjustable right dock with Voice / Chat / Queue tabs. In fullscreen theater, dock can appear as overlay without stealing huge width.
- Participants may react; reactions appear briefly near player EDGE or separate stage margin, never on top of protected player controls or third-party embedded players.
- Host avatar/pill "Egemen is hosting" (use generic fixture names in demo), request remote control, delegate with expiry and revocation. Only authorized roles can control.
- Joining mid-session reads authoritative current state, asks for permission if needed, and syncs playback if source supports it.
- Distinguish "Synchronized viewing (each user plays a permitted source)" from "Screen sharing (host sends pixels/audio)". Never obscure this distinction.
- Permission or provider failure: detailed, human wording and recovery action.
- New session setup sheet: Choose activity, Choose media source, Choose participants/private room, Check access, Start. One operation per step.
- Cinema title, backdrop, cover/poster, subtitle tracks and media details come only from licensed, user-owned, authorized sources or generic development placeholders.

### 5.7 YouTube Together
- Official YouTube embedded IFrame Player API. DO NOT scrape YouTube or circumvent ads, region blocks, embeds, DRM, or player controls.
- Paste URL, validate video/playlist ID, resolve metadata where authorized; show title and cover.
- Each participant loads their own YouTube player. Synchronize host-selected player state via a room activity service: media ID, queue, `playing`, `positionSec`, `effectiveServerTime`, revision, controller identity and playback epoch.
- Add drift correction only when needed (e.g. minor time delta tolerance). Debounce seek bursts. Avoid feedback loops from `onStateChange`. Handle host left, late join, autoplay prevented, buffering, expired/blocked embeddability, optional manual "Sync now".
- Do not cover up official YouTube player metadata/branding, ads, controls or links with custom UI. Offer user click-to-play where autoplay is blocked. Ensure supported referrer/origin configuration in desktop environment; fallback "Open on YouTube".
- Queue with reorder by authorized participants, add/remove, vote-skip optional, keep playing on minimized window only if permitted by provider rules.

### 5.8 Screen sharing / Go Live
- The user explicitly chooses screen or app window via OS-provided picker (where available). Optional audio share only when supported/authorized and OS consent granted.
- Presenter gets source preview, screen/window label, toggle sound, choose quality (adaptive/default, 720p30 baseline), Stop Share.
- Viewers see stage, adaptive playback, device-level volume, stream resolution/fps indicators in Diagnostics, member presence and leave/expand.
- One current presenter per media stage for MVP. Screen-share handoff via clear Request to Present; no silent capture or remote desktop control.
- Correct echo cancellation, audio output device and self-audio ducking; avoid rebroadcast feedback.
- Protected/DRM video may render black due to platform restrictions; show honest guidance, do not offer circumvention.
- Test separately on Windows and macOS. Document platform-specific audio-capture constraints and permissions.

### 5.9 Live TV / IPTV
- Provider connections added individually per user in Settings → Media Connections.
- Support user-authorized M3U / M3U8 playlists, optional authorized Xtream-compatible credentials if API and license permit, optional XMLTV EPG. Validate and normalize channel lists; preserve icons/covers from permitted source and show groups / Favorites / Recently played / Live Now.
- Expose loading, offline source, codec unsupported, authorization expired, stream error. Check HLS playback in Electron Chromium; use a legitimate codec/player path when permitted and platform-dependent; DASH optionally later.
- Do not ship illegal channel playlists, premium channel branding/catalogues, shared logins, account scraping, or a piracy discovery index.
- Default playback is personal. Cinema room may synchronize a non-protected publicly licensed stream only if every participant can legitimately access it independently. Do not distribute a single account's authenticated feed or proxy credentials to peers.
- Credential-bearing URL must not appear in logs, analytics, notifications, DOM-visible tooltips or other users' network payloads.

### 5.10 Real-Debrid / personal media connection
- Treat RD as a private, PERSONAL provider adapter; do not create group link-sharing, torrent discovery, or a common shared account.
- Use the provider's documented OAuth/device auth path where appropriate. Show Connect, Connected as [safe display name], Refresh, Disconnect, auth expired/error states.
- Privately list authorized downloads/media with metadata, search, sorting, resume and local personal playback when technically supported and permitted by provider terms.
- Keep access/refresh credentials inside secure storage; never provide direct personal playback URLs to peers or save them in shareable messages, room state or database accessible to other accounts.
- For group sessions, friends who possess separate authorized sources may sync locally; otherwise a rights-compliant screen-share may be used where the license allows. Do not design automatic retransmission of single-account media as a feature.
- No DRM bypass, account sharing, token-sharing, stream URL leaking, unlawful media catalogue indexing, or promise that every format plays.

### 5.11 Shared queue and remote control
- Activity queue displayed in sidebar sheet with source icons, titles, added-by avatar, duration and drag handles; keyboard up/down as accessible alternative.
- Hosts and approved controllers can reorder. Members can request addition/skip based on permission policy.
- Remote controls: host, eligible member, request, accept/deny, countdown expiry, revoke; controlling the app's shared playback state only, never controlling someone's OS desktop.
- Queue progression needs confirmed end state and a safe fallback when next media fails.

### 5.12 Friends, presence and DMs
- Friends list sorted by "In a room", "Online", "Away", "Offline"; avatar, current consented activity, meaningful context.
- Join/Invite action with permission/visibility rules; respect invisible status and private room visibility.
- DMs with text, attachments and invites using Spacebar compatibility where supported.
- Avoid social feeds, follower growth and public discovery in MVP.

### 5.13 Profiles, room admin, member moderation
- Edit avatar, display name, audio profile, status.
- Room settings: room details, visibility, invite links, permissions, remove/kick, room activity privileges and admin audit entries as appropriate.
- Report/block controls, rate limits and spam controls even for private group. Do not expose private media-provider details to admins.

### 5.14 Settings & diagnostics
- Appearance: System / Dark / Light (Dark first), transparency level / reduce effects, compact mode, accent options.
- Voice & Video: input/output devices, mic/speaker test, input sensitivity, push-to-talk toggle/key, voice activity, noise reduction options where supported, echo cancellation, screen share quality.
- Connections: Spacebar server URL (owner/admin policy), connected YouTube status (if API auth needed), IPTV sources, Real-Debrid OAuth, Local/Personal media (optional future).
- Keyboard shortcuts, notifications, autostart, app updates, storage/cache, language (English first, Turkish localization ready), data export/logout.
- Diagnostics: connected Spacebar instance, gateway state, media-service state, WebRTC SFU state, current bitrate, packet loss, ping, current mic/speaker permissions; sanitized debug export.
- Errors are actionable. Never just say "Something went wrong".

### 5.15 Mini-player and compact hangout
- Collapse media to a floating always-on-top window or in-app PiP mini-stage; keep room join and mic state visible.
- Camera/stream stage window supports native fullscreen, Escape to exit, keyboard seeking only when appropriate, focus management and double-click toggles.

## 6. INTERACTIVE ACTIVITIES — MODULAR PLATFORM

An Activity is not a hardcoded page. Create a typed versioned activity framework independent of Spacebar core.

Suggested conceptual contract:

```ts
export type ActivityState = "idle" | "preparing" | "live" | "paused" | "recovering" | "ended" | "error";
export type ActivityKind = "shared-player" | "live-stream" | "collaborative" | "game";
export interface ActivityManifest {
  id: string;
  version: number;
  label: string;
  category: "watch" | "share" | "play" | "together";
  kind: ActivityKind;
  capabilities: Array<"timeline" | "queue" | "host-control" | "voice" | "reactions" | "participants">;
  supportedPlatforms: Array<"windows" | "macos">;
}
export interface ActivitySession {
  id: string;
  roomId: string;
  activityId: string;
  hostUserId: string;
  controllerUserId: string | null;
  revision: number;
  state: ActivityState;
  startedAt: string;
  endedAt?: string;
  publicSharedState: Record<string, unknown>;
}
```

Implement a shared service with session create, join, leave, end, patch-state, participant-presence, permission, host-transfer, controller-transfer, queue and reaction events. All authoritative mutations are validated server-side and versioned to prevent races. Activity-specific data is strongly typed using discriminated unions; never trust arbitrary client patches.

Lifecycle: `create → preparing → live → paused/recovering → ended`. Do not automatically destroy the voice room when the activity ends. Clearly show who is viewing, who is speaking, and who is controlling separately.

Add a lightweight first-party example (poll or quiz) to demonstrate real extensibility, not just interfaces named after future activities.

Potential future activities: synchronized photo gallery, Codenames-like word game, drawing room, shared tier lists, voting, sports match prediction with virtual points, music listening via properly authorized integrations, custom movie-night rituals, reaction soundboard with per-user volume and rate limiting, trivia, whiteboard, collaborative links, chess, fantasy league and party games. Keep real-money betting/gambling OUT of scope.

## 7. TECHNICAL ARCHITECTURE — BUILDABLE, NOT FANTASY

A practical monorepo outline:

```
apps/
  desktop/                # Electron main/preload + React renderer
  services/activities/    # Fastify (or NestJS if strong justification) activity service
packages/
  design-system/          # UI components, tokens, animations
  shared-contracts/       # schemas, event types, permissions, Zod
  spacebar-adapter/       # Spacebar API + Gateway integration
  media-providers/        # client-scoped authorized adapters, never shared credentials
  activity-sdk/           # activity manifest and state lifecycle
infra/
  docker-compose.yml      # Spacebar, database, activity service, SFU, proxy as needed
  env.example
  DEPLOYMENT.md
```

Use pnpm workspaces; React + TypeScript strict mode; TanStack Query for server state, Zustand for local UI state; React Router for navigation; a small primitive/component layer (Radix where useful); Framer Motion/Motion sparingly; Vitest, Testing Library, and Playwright for renderer flows. Exact dependency versions should be selected after checking latest stable and compatibility, not hallucinated in this prompt.

### Spacebar boundaries
- Use upstream `spacebarchat/server` as self-hosted backend for users, roles, guilds/spaces, channels, messages, attachments, presence and gateway events, to the extent features are actually compatible.
- Do NOT start by forking/rewriting the Spacebar backend. Preserve upstream upgrade path. A small adapter translates its quirks to our typed domain.
- Spacebar official React client is unmaintained; do NOT base the desktop UI on it.
- Validate each API behavior via actual integration tests. Discord-compatible does not mean exactly feature-complete.
- Keep Spacebar subject IDs and our application room/activity IDs clearly mapped; avoid parallel inconsistent identity systems.
- Respect its AGPL-3.0 license, especially if modified versions are made available to remote users. Document source-availability obligations and separate-service boundary review. Legal review before public release.

### Voice/video/media transports
- RECOMMENDATION for initial reliability: self-host **LiveKit** (or another evaluated SFU) as a replaceable voice/screen-share transport, with server-issued short-lived membership-scoped tokens; keep Spacebar as the social/chat layer. Do not operate two simultaneous competing voice sessions.
- Alternative: Spacebar's Pion/WebRTC voice path can be evaluated in a dedicated spike; adopt only after real cross-platform voice/screenshare tests pass.
- Have a `RealtimeMediaProvider` abstraction supporting: connectRoom, publishMic, publishScreen, subscribe, deviceSelection, participantState, diagnostics, mute, disconnect, reconnect.
- Check privacy, E2EE claims (don't claim end-to-end encryption unless actually supported), secure TURN / STUN, HTTPS/WSS, and reconnect behavior.
- The activity server is not a video streaming origin or redistribution CDN. It stores room state and secure permissions.
- Service should remain practical on a small VPS for 4–20 friends; voice/SFU egress depends heavily on actual usage. Measure bandwidth instead of inventing pricing.

### Data model, minimal starting point
- UserIdentity: internal ID, Spacebar user ID, normalized display info
- SpaceMapping: Spacebar guild ID, visibility/owner, friendly metadata
- RoomMapping: Spacebar channel ID, room type, permissions
- RoomMembership / SessionPresence
- ActivitySession / ActivityParticipant / ActivityStateRevision
- MediaQueueItem / QueueVote / ControllerGrant
- Poll / PollOption / Vote (demo activity)
- ProviderConnectionMetadata (no secrets in public DB)
- LocalCredentialVault in OS secure storage for personal tokens
- Invite / Membership / AuditEntry
- Preferences / DeviceSelection

### Security and deployment basics
- Single authoritative API for activity mutation and its access checks.
- Dedicated service credentials never exposed to Electron renderer.
- Strict allowlist for navigations, safe URL parsing, CSP, sandbox/preload, `contextIsolation`, no `nodeIntegration`, avoid unsafe remote modules, permission handlers and external open approvals.
- Validate M3U/URLs; protect against SSRF on any server fetching user-supplied URLs, block local/private IP ranges unless explicitly allowed for documented local-playback use, cap playlist size and response length.
- Provider tokens in encrypted OS/keychain store only; encrypted backup/export disabled by default; never print tokens.
- Rate limiting, invite control, no enumeration of private spaces, audit sensitive actions and remove credentials on logout/disconnect.
- Self-host docs: Docker Compose, persistent volumes, reverse proxy TLS, TURN port requirements, backups/restore, logs, maintenance/updates, upgrade guide, emergency kill switch for compromised invites.

## 8. PERFORMANCE, RELIABILITY AND NATIVE FEEL

- Target comfortable performance on MacBook Air M1 8GB RAM and typical Windows laptops (do not mandate powerful GPUs).
- Virtualize large message/channel lists; lazy-load activity panels and media metadata; avoid needless rerenders. Avoid massive continuous blur of full viewport.
- Never run background GPU glows/animations while window is minimized, in reduced-motion mode or on battery-saving settings.
- Watch Chromium GPU process crashes and avoid unbounded memory retention from prior media sessions.
- Persistent connections should reconnect with exponential backoff; app provides real last-known state, never a false "Online" label.
- Design for 0/1/2/5/10 participants; never rely on fixed demo images or names.
- Screen sharing should survive view navigation; stopping capture revokes it instantly. Hot unplugging mic/headphones must recover gracefully.
- Don’t preload massive posters or demo videos. Use licensed placeholder artwork in development.
- Keyboard and pointer are first class: `Cmd/Ctrl+K` command menu, `Cmd/Ctrl+1..N` navigate, Esc closes topmost transient surface, Enter submits composer where appropriate, Shift+Enter multiline, Space controls local player when focus context allows, configurable PTT hotkey with conflict checks.
- Media controls must not hijack chat input or other text fields.
- Full accessible focus ring, contrast, screen reader descriptions, color-blind-safe states and reduced-transparency mode.

## 9. EXACT COMPONENT INTERACTION DETAILS

Specify and build:
- Hover over a channel: subtle trailing `...` and shortcut actions; channel selection remains clean without persistent buttons everywhere.
- Click room avatar cluster: small layered popover, participant list and Join button.
- Starting screen share: permissions preflight, OS source picker, live preview, Start Share confirmation when appropriate, persistent red/active recording marker, instantly accessible Stop.
- Click `+ Activity`: transforms from compact button into elegant searchable popover; open/close animation preserves spatial anchor.
- Cinema opens with stage-first transition, sidebar gently minimizes, participant audio dock persists, film poster/backdrop enters subtly without dramatic zoom.
- Mouse idle: controls disappear, stage expands; move cursor/keyboard focus: control strip reappears over gradient scrim.
- Volume popup: thumb precise and accessible; icon cycles muted/low/high.
- Queue drawer: animate width without reflowing stage violently; preserve playback position and voice session.
- Press controller avatar: request/give/revoke remote menu with countdown; no silent role escalation.
- Presence cards show actual live activity; `Join` handles invitation/private permission and reports errors.
- Reactions: tiny bounded particles outside protected embedded players, locally rate-limited, option to disable.
- Loading skeletons match final geometry; avoid arbitrary shimmer on entire page.
- Reconnect banners are persistent until actual recovery, not 2-second fading toasts.
- Error recovery restores activity state safely and never loses mic mute state.
- Empty/error/offline/disabled/loading/restricted variants must be designed for every major screen.

## 10. PRODUCTION-FACING SECURITY / LEGAL BOUNDARIES

This is a communication and legitimate personal-media utility; do not make a piracy service or account-sharing service. No bundled unauthorized streams, access to illegal public catalogues, credentials shared among friends, unlicensed rebroadcasting, or bypassing copy protection/DRM. IPTV must originate from user-authorized sources. RD accounts remain personal; no generated-link sharing or pooled subscriptions. Media rooms must show which model they use (individual authorized playback vs authorized host screen share). Do not implement real-money gambling or sports-betting transactions; social predictions use nonredeemable points only. Maintain report/block/moderation and a private-by-default posture.

When an integration conflicts with provider platform policy, implement a honest supported fallback or disable that integration with a precise explanation. NEVER silently bypass terms or deceive users about how it works.

## 11. IMPLEMENTATION MILESTONES: DO NOT JUMP TO THE END

**Milestone 0: Inspect and plan**
- Inspect current files, dependency state, upstream documentation, device/build environment.
- Produce `ARCHITECTURE.md`, `FEATURE_MATRIX.md`, `RISKS.md`, `DESIGN_SYSTEM.md` and milestone implementation plan.
- List verified vs hypothetical compatibility for Spacebar, voice/SFU, YouTube embed, IPTV codec and RD OAuth.
- Explicitly identify external dependencies, secrets, available test accounts, unsupported features.

**Milestone 1: Remarkable desktop shell + visual system**
- Scaffold installable Electron+React app; implement the design system and shell.
- Fully designed high-fidelity UI for: Home, Chat, Voice, Cinema, Activity launcher, Settings. Real local navigation with explicit demo fixtures only.
- No decorative controls that do nothing; wire stateful interactions, modals, navigation, hover, keyboard actions, collapse and responsive behavior.
- Show screenshots at 1440x900, 1280x800, Cinema fullscreen, empty room, Voice active, Settings and Windows scaling. Verify visual QA.

**Milestone 2: Real private community**
- Deploy self-hosted Spacebar server, connect registration/invitation, rooms/channel lists, channel messaging and presence. Verify on two distinct test accounts.
- Implement permissions, private invites and a robust connection banner.

**Milestone 3: Real voice and screen sharing**
- Pick/test SFU; add voice join/mute/deafen, device picker, participant indicators, user-disconnected recovery, screen/window picker, receiving playback and stop/handoff flow.
- Test separately on 2+ computers or real distinct clients; validate Windows system audio and macOS capture limits. Do not claim successful media transport from two tabs with fabricated signaling.

**Milestone 4: Watch together**
- Implement ActivitySession backend protocol, YouTube sync with real iframe embed, queue, seeking, late join, host transfer, remote requests and error handling.
- Implement Cinema shell and a permitted local/public demonstration media source first; prove actual two-client sync before provider integrations.

**Milestone 5: Personal media providers**
- Add personal authorized IPTV playlists and channel player with proper error handling, and RD OAuth / personal library functionality according to provider policy. No leakage to shared room state.
- Add media account connection UX and permissions tests.

**Milestone 6: Activities ecosystem**
- Build working Poll/Quiz; show dynamic activity manifest wiring and clean state model; optional Match Night prediction using virtual points only.
- Preserve polish and performance.

**Milestone 7: Installable release**
- Signed/notarized macOS builds if access to signing infrastructure; signed Windows installer if available, or clear honest local development builds otherwise.
- Package updater, onboarding, crash reporting opt-in or privacy-preserving local logs, self-host setup instructions, backing up credentials and data policies.
- Publish source/licensing obligations and a comprehensible release checklist.

## 12. ACCEPTANCE CRITERIA — NO FAKE SUCCESS

Before saying v0.1 works, DEMONSTRATE these checks, with test results:
1. Fresh install opens a functioning app on Windows/macOS target(s).
2. First invite can register/login, invalid or expired invite fails clearly.
3. Two different accounts see actual channel messages/presence updates in real time.
4. User joins voice, mute/deafen actually changes audio track and other participant sees state.
5. User shares permitted screen/window with user-selected source; remote viewer receives it; Stop ends publication.
6. Real network interruption triggers reconnect; once restored users rejoin safely without false success status.
7. A YouTube room starts from a valid video URL, works through official embed path, syncs pause/seek to a second client, and recovers when autoplay is blocked.
8. Cinema player provides a real playable permitted test source, actual progress/captions when available, queue/host controls and error states.
9. An authorized M3U source loads, channels are listed, successful playback shows signal, and an invalid source fails non-destructively.
10. RD connection uses legitimate auth when credentials available; without them, UI accurately shows "Not connected" and demo data never impersonates the account.
11. Tokens never appear in logs, UI, clipboard by default, or activity state sent to friends.
12. Push-to-talk doesn't capture keystrokes typed in composer, and mute state persists through tab switches.
13. Window resizing, reduced motion/transparency, keyboard navigation, 125% scaling and accessibility states are verified.
14. Screenshot comparison catches overflow, clipped sidebar, poor text contrast, glass overload and awkward overlay placement.
15. All visible buttons and navigation either work or are disabled with clear explanatory text.
16. All automatic background behaviors (startup, updates, notifications, capture) are opt-in where appropriate.

For every integration, record status as VERIFIED WORKING / IMPLEMENTED BUT UNVERIFIED / PLACEHOLDER / BLOCKED and describe the exact blocker.

## 13. OUTPUT BEHAVIOR FOR THE CODING AGENT

Start by explaining in a brief Turkish response (a) what exists in the repo, (b) architecture recommendation and any blockers, (c) first implementable milestone, and (d) the exact files you will create/change. Then proceed with implementation when local execution is available. Write code/types/comments mostly in English. Do not stop after planning unless essential data/permission truly blocks the task.

For each milestone:
- Show the key design decisions and file structure.
- Implement real files, not just pseudocode.
- Run build/typecheck/tests; report exact commands and results.
- Take screenshots of the app itself with actual dimensions if tooling allows. Never hallucinate screenshots.
- Document unresolved platform limitations and test coverage honestly.
- End with a short clear changelog and next-step checklist.

**Do not build a landing page. Do not fake real-time users, linked accounts, calls or media playback. Do not spray glass everywhere. Do not call it finished after pretty static mockups.** The standard is a product that a small group of friends can really open every night, talk, watch, queue, react and enjoy.
