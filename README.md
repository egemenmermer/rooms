# ROOMS

## Download the private-friend release

[Download ROOMS 0.1.18-rc.7 for Mac](https://62.238.119.134/rooms-updates/ROOMS-0.1.18-rc.7-arm64.dmg) — macOS 14+ on Apple Silicon (M-series). GitHub sign-in is not required to download.

Open the DMG, drag ROOMS into Applications and open it. Use your existing account or an account invitation from the community owner. The private service remains invite-only. This release is Developer ID signed and Apple notarized; real two-Mac voice/share/DJ acceptance remains open. Windows and Intel packages are not included.

The immutable binary and its manifest are retained in [RC7](https://github.com/egemenmermer/rooms/releases/tag/v0.1.18-rc.7). SHA256: `efb3c1eb6341f0b9d2f4c4fed6356c6fa23db86f8c2aa2a3e5854a8d0d01f520`.

Current candidate: [changes and acceptance limits](docs/release/RC_0_1_18_7_NOTES.md), [publication evidence](docs/release/RC_0_1_18_7_RESULTS.json). Includes local Strong/Standard microphone suppression, fitting parallel shares, durable community sounds and verified owner-playlist DJ playback.

## Project documentation

Read the [project handbook](docs/project/README.md) for architecture, runtime/data flows, services, security, operations and release engineering. The handbook documents audited reference implementation `06f5477`; the current private-friend release and integration evidence are in [the release records](docs/release/MAIN_INTEGRATION.md). The [initial release audit](docs/release/AUDIT_REPORT.md) includes readiness, scope, blockers, QA and the phased V1 roadmap. Historical sections below retain their original acceptance limits.

[Hosted handbook](https://62.238.119.134/docs/) · [Documentation build/deployment](docs/site/README.md)

A Turkish, macOS-first private desktop clubhouse built with Electron, React and TypeScript. The current social foundation is **unmodified upstream Stoat**, behind a native typed adapter. LiveKit is replaceable; voice survives navigation and Activity changes. Local fixtures are visibly labeled **Yerel demo** or **QA fixture**.

## Open the application

Apple Silicon, macOS 14+:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

For the production renderer in the native desktop shell:

```sh
pnpm build
pnpm start
```

`pnpm package:mac` creates an **unsigned development** DMG, ZIP and `release/mac-arm64/ROOMS.app`. Signing and notarization need the owner's Apple Developer credentials; this is not yet a validated public release. Command K opens navigation, Command comma opens Settings, and Cinema supports Space and arrow keys outside text fields. Push-to-talk is opt-in and requires app focus.

## What is implemented

Home, Spaces, Chat, friends/profile, Voice, Cinema, YouTube Together, shared polls/whiteboard, game tables, personal media settings and Agent screens have working navigation and stateful controls. Shared Activities use an authoritative service. Games include Holdem, Blackjack, four Batak variants and 101. Cinema plays the bundled original demo or an explicitly selected personal file. Personal M3U/HLS, Xtream, XMLTV and Real-Debrid device authorization run behind native encrypted storage; credentials and media URLs are not distributed to other members.

Implementation is different from live-provider acceptance. Stoat infrastructure, real paid-provider accounts, the separate Linux agent host, physical two-computer media and remaining real-provider journeys still require acceptance. Signed/notarized RC5 delivery, owner installation and preserved-profile launch have separate evidence in [the current release records](docs/release/RC_0_1_18_5_RESULTS.json). See [current implementation evidence](docs/IMPLEMENTATION_PROGRESS.md) and [feature matrix](docs/FEATURE_MATRIX.md).

## Run services

```sh
pnpm stoat:setup
pnpm services:build
# Requires a healthy Docker runtime; this workstation currently has none.
docker compose --env-file .local/stoat/.env -f .local/stoat/compose.yml up -d
```

Use the generated configuration and [Stoat deployment guide](infra/stoat/README.md), including public HTTPS routing and the account-invitation broker. The raw upstream API must remain private. Account invitations and community invitations are separate; the broker enforces one use and expiration. Do not distribute private `.local/`, `infra/local/`, account files or credentials.

The Agent executes only on a **separate Linux/Hetzner host**. Each authorized user connects their own OpenRouter key or authenticates the official Codex/Claude CLI profile. The bot has its own accounts and responds to mentions. See [agent deployment](docs/AGENT_DEPLOYMENT.md). No remote agent execution has been validated on this Mac.

## Verify

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm services:build
pnpm test:desktop --grep 'desktop shell'
node scripts/verify-activity-desktop.mjs
```

The last command opens two actual Electron clients and uses the actual Activity service with explicitly marked **social authorization QA fixtures**. It verifies game interaction, poll voting, whiteboard sharing and shared local-demo playback; it does not verify production Stoat login. `pnpm stoat:verify` requires live Stoat and its private fixtures. Legacy Spacebar scripts/evidence remain historical and do not establish Stoat acceptance.

[Approved remaining phases](docs/REMAINING_PHASES_PLAN.md), [design](docs/DESIGN_SYSTEM.md), [visual QA](docs/VISUAL_QA.md), [Activity protocol](docs/ACTIVITY_PROTOCOL.md), [game rules](docs/GAME_RULES.md), and [third-party notices](docs/THIRD_PARTY_NOTICES.md) describe scope and boundaries.

## Mac in-app updates

Signed Sparkle-enabled releases can check updates in Settings → Güncelleme ve hakkında. With automatic updates enabled, downloaded updates install on normal app quit and are used at the next open. Cmd-Q quits; closing to tray may keep the application running. Releases without Sparkle need one manual signed installation. See [Sparkle delivery](docs/rooms-implementation/SPARKLE_DELIVERY.md) and [actual old-to-new acceptance](docs/release/SPARKLE_UPDATE_ACCEPTANCE.md).

### Windows RC.7 friend-test package

[Windows x64 installer](https://62.238.119.134/rooms-updates/ROOMS-0.1.18-rc.7-windows-x64-setup.exe) — unsigned, manual updates. Same frozen runtime source as Mac RC.7. Native hosted Windows installation/launch and780client-applicable tests passed; physical friend voice/screen/soundboard acceptance remains open. [Results](docs/release/WINDOWS_RC7_RESULTS.json). SHA256: `eacd4adb42f8db1aeacfd9bfbe533427cebd461ecb71001df9fabe6ba3388add`.
