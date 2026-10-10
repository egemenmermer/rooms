# Current feature status

This matrix supersedes the Spacebar-era matrix. Historical transport evidence remains in `VERIFICATION.md`; it is not proof of the current Stoat deployment. All local fixtures are labeled. Acceptance means the precise test described, never an inferred production success.

| Capability | Current evidence | Outstanding acceptance |
|---|---|---|
| Electron shell, Turkish navigation, keyboard controls, glass, settings | Actual running Electron screenshots and native shell acceptance | Sustained M1/8 GB performance run |
| Native local Cinema, seek, pause, fullscreen | Actual Electron video and fullscreen test | Broad personal-file codec/device coverage |
| Stoat login/gateway, messages, DMs, friends, presence, profiles, attachments, reactions, moderation | Implemented native adapter/UI and protocol fixtures | Actual upstream server and two real accounts |
| One-use expiring account invitation broker, separate community invitation | Atomic ledger and authorization fixture tests | Real Mongo/upstream signup and Internet deployment |
| Independent LiveKit transport and safe native source picker | Existing transport implementation; historical two-client synthetic RTP evidence | Current Stoat grants, signed webhook, physical two-Mac audio/video/screen share |
| Authoritative shared Activity timeline, queue and host transfer | Service tests; two actual Electron clients synchronize local Cinema play/pause/seek | Internet reconnect/restart and sustained synchronization |
| Shared polls and whiteboard | Actual service + two Electron UI clients | Real Stoat membership deployment |
| Holdem, Blackjack, four Batak variants, 101 | Authoritative engines, seven public full hands, hidden-state/public-result tests, completed bot games; ten packaged public create/action/close cases including four 101 rule combinations | Advanced native meld/pairs/joker/split/double actions, friends’ full rules/play sessions and Internet reconnect acceptance |
| YouTube Together | Official iframe shim and shared controls implemented | Deployed HTTPS origin and actual YouTube playback/autoplay/error tests |
| Personal IPTV M3U/HLS, Xtream and XMLTV | Native vault, opaque media handles, parsers and network/security tests; UI implemented | Authorized provider playback, EPG and codec tests |
| Personal Real-Debrid | Documented device-flow client/native vault and personal library UI | Owner public client ID and authorized account acceptance |
| Separate agent, own model connections, tasks, scheduling, memory, stop, global YOLO | Kernel HTTP/durable operation tests and UI | Separate Linux server; real OpenRouter and official CLI logins |
| Source-message reminders without models or automatic memory | Durable scheduler/outbox HTTP tests and actual Electron UI fixture | Real configured bot source-chat delivery |
| Agent GitHub/Drive/browser, mention replies | Scoped connectors, persistent browser and operation-specific approval/outbox code; tests | Bot accounts, restricted egress and actual remote operations |
| Signed updates, invitation deep links | Strict native deep-link validation; signing/update implementation | Own Developer ID, notarization and signed update cycle |
| ARM64 development distribution | Current unsigned DMG/ZIP generated; packaged ARM64 app launch/video and build-content match passed | Signing/notarization and public distribution remain separate |
| Windows | Compatible configuration and source retained | Windows machine/build/capture validation |
| Production TLS/TURN, backups, recovery | Deployment instructions/configuration | Servers/domain, restore drill and release acceptance |

The approved phases are not all accepted. Environment and account gates remain explicit in `IMPLEMENTATION_PROGRESS.md`.
