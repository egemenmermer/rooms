# ROOMS — implementation plan, Milestones 0–3

## Outcome and ownership
Build a macOS 14+/Apple Silicon private Electron clubhouse. By M3 two distinct users must exchange actual Spacebar messages, join voice, and receive an explicitly selected screen/window through LiveKit. YouTube synchronization, IPTV, Real-Debrid, shared games, signed updates and production release remain M4–M7.

The implementing designer is always a `gpt-6-astra` subagent with reasoning `high`. It owns UI components, CSS, interaction craft and actual visual QA. The main agent owns architecture, security, integration and final acceptance. This policy persists in root AGENTS.md. Use English application code/docs and Turkish user communication.

## Architecture
Electron + React + strict TypeScript + Vite, pnpm workspace, React Router, Zustand for UI, TanStack Query for server state. Upstream pinned Spacebar with a separate adapter is the social identity and permissions authority. Self-hosted LiveKit behind RealtimeMediaProvider supplies audio/video/screen sharing. A small Fastify access service validates membership and issues short-lived room tokens; it never redistributes personal media credentials. PostgreSQL and Docker Compose provide local reproducibility. Bind development ports to loopback.

Main/preload owns persistent authentication and privileged operations. Use contextIsolation, sandbox, CSP, no Node integration, sender validation, strict navigations, and whitelisted IPC operations. Persist secrets only when Electron safeStorage encryption is available. Voice connection state belongs outside routed views; leaving an Activity does not disconnect voice.

## M0 — inspect, recover and verify
- Audit the prematurely created partial scaffold, recover parse errors and missing styles/Cinema, and verify installed versions and build tooling.
- Create architecture, feature matrix, risk, design-system, deployment and compatibility documents.
- Test upstream auth/invite/channel/message/gateway compatibility against a real local instance; record upstream commit and AGPL source obligations.
- Evaluate LiveKit setup and macOS capture/system-audio limitations. Track every integration as VERIFIED WORKING, IMPLEMENTED BUT UNVERIFIED, PLACEHOLDER or BLOCKED, with exact evidence.
- Exit: documented boundaries, reproducible dependencies and clear external/test-environment requirements.

## M1 — remarkable desktop shell
- Build Home, Spaces, Chat, Voice, Cinema, launcher and Settings with reusable tokens and components.
- Native macOS traffic lights, draggable chrome, fullscreen, persisted geometry/preferences, tray, keyboard shortcuts and accessible menus.
- Original/license-compatible imagery, cinematic stage, collapsible room inspector, controlled glass, reduced effects and narrow-window behavior.
- Local demo chat and poll, real local media playback/seek/volume/ended/error, explicit user file selection and real local microphone/speaker testing.
- Demo is isolated from real data; external actions are accurately disabled. No fake calls or provider connection statuses.
- Exit: functioning Electron, successful typecheck/build/tests, genuine screenshots at 1440x900 and 1280x800, Cinema/fullscreen/empty/voice/settings, ARM64 local development package opens.

## M2 — actual private community
- Run pinned self-hosted Spacebar; owner plus two separate users.
- Real login/logout and server-enforced invite-only registration; expired/invalid/consumed invite states. Never rely on hidden UI for access control.
- Actual spaces/channels/messages/DMs/presence through the adapter, optimistic send/retry, own edit/delete, pagination and unread behavior.
- Gateway heartbeat, resume/reconnect, honest persistent status; isolate real account caches from demo fixtures.
- Verify private permissions, basic block/moderation and absence of token leakage.
- Exit: two real accounts see events; unauthorized access fails; network interruption recovers safely.

## M3 — actual voice/video/screen sharing
- Integrate LiveKit through the replaceable provider; issue short-lived tokens after Spacebar identity/channel authorization.
- One voice connection, actual mute/deafen, input/output devices, roster/speaking/individual volume, opt-in camera.
- Explicit OS/user source picker with preflight, preview, start/stop and visible capture status; one current presenter, controlled handoff.
- Adaptive 720p30 baseline, actual receiving media in Cinema, persistent voice across navigation.
- Handle reconnect, unavailable/denied devices, host leaving, participant removal and source-ended events. Stop/logout/quit release tracks immediately.
- Enable system audio only when supported and tested; report protected-content/platform limits without workarounds.
- Exit: distinct Electron accounts exchange real audio/video/screenshare; stop and mute behavior verified, network/device failure tests pass. Prefer two physical computers; label single-host coverage honestly.

## Validation and defaults
Vitest + Testing Library for domain/UI, Playwright Electron for routes/keyboard/native bridge/media and screenshots, real upstream integration scripts for auth/gateway/access control, real transport tests for LiveKit. Record performance rather than inventing M1 measurements. Production signing/domain/secrets and two-physical-computer tests may remain explicit blockers. No paid provisioning without authorization. Windows is preserved architecturally but is not tested by macOS emulation.
