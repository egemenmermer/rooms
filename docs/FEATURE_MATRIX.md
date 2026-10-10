# Current feature status

This matrix supersedes the Spacebar-era matrix. Historical transport evidence remains in `VERIFICATION.md`; it is not proof of the current Stoat deployment. All local fixtures are labeled. Acceptance means the precise test described, never an inferred production success.

| Capability | Current evidence | Outstanding acceptance |
|---|---|---|
| Electron shell, Turkish navigation, keyboard controls, glass, settings | Actual Electron/native shell acceptance; packaged 0.1.4 passed 908-second local-playback soak and 15 navigation cycles | Full-evening M1/8 GB voice/Activity performance |
| Native local Cinema, seek, pause, fullscreen | Actual Electron video and fullscreen test | Broad personal-file codec/device coverage |
| Stoat login/gateway, messages, DMs, friends, presence, profiles, attachments, reactions, moderation | Pinned public upstream; real two-account social/native onboarding, message edit/delete/restore/logout, live presence and native attachment delivery passed | Friends’ sustained use and broader moderation UI acceptance |
| One-use expiring account invitation broker, separate community invitation | Actual public registration, consumed invitation rejection and raw-registration denial passed | Friend installation and invitation handoff |
| Independent LiveKit transport and safe native source picker | Current public Stoat-authorized SFU transport, native microphone/window capture and presenter/logout/revocation passed on two development clients on one Mac | Fresh packaged permissions, physical two-computer audible audio/camera/PTT/device loss/reconnect; restrictive-network TURN/TLS |
| Authoritative shared Activity timeline, queue and host transfer | Service tests; two actual Electron clients synchronize local Cinema play/pause/seek | Internet reconnect/restart and sustained synchronization |
| Activity transport admission | Real six-connection/two-identity public load passed 151 seconds after shared-IP and authorization-error fixes; anonymous/outsider denial and cleanup passed | Six distinct identities/native clients and sustained room capacity |
| Shared polls and whiteboard | Public membership-authorized mutations and persisted recovery after Activity restart/full core reboot passed | Broader native collaboration and friends’ sessions |
| Holdem, Blackjack, four Batak variants, 101 | Authoritative engines, seven public full hands, hidden-state/public-result tests, completed bot games; ten packaged 0.1.5 public create/action/close cases including four 101 combinations; two native grouping/removal and clean new-table cases | Advanced native meld/pairs/joker/split/double actions, friends’ full rules/play sessions and Internet reconnect acceptance |
| YouTube Together | Two actual packaged 0.1.4 clients on public HTTPS passed official play/pause, pointer/keyboard seek, membership and late return; owned loading interruption/retry and provider error passed | Whole-network reconnect and sustained sync; normal per-viewer autoplay gesture remains required |
| Personal IPTV M3U/HLS, Xtream and XMLTV | Native vault, opaque media handles, parsers and network/security tests; UI implemented | Authorized provider playback, EPG and codec tests |
| Personal Real-Debrid | Documented device-flow client/native vault and personal library UI | Owner public client ID and authorized account acceptance |
| Separate agent, own model connections, tasks, scheduling, memory, stop, global YOLO | Kernel HTTP/durable operation tests and UI | Separate Linux server; real OpenRouter and official CLI logins |
| Source-message reminders without models or automatic memory | Durable scheduler/outbox HTTP tests and actual Electron UI fixture | Real configured bot source-chat delivery |
| Agent GitHub/Drive/browser, mention replies | Scoped connectors, persistent browser and operation-specific approval/outbox code; tests | Bot accounts, restricted egress and actual remote operations |
| Signed updates, invitation deep links | Strict native deep-link validation; signing/update implementation | Own Developer ID, notarization and signed update cycle |
| ARM64 preview distribution | Private v0.1.5 DMG/ZIP/checksum publication and uploaded digest matching passed; actual package launch/video and 22 bundled files match | Signing/notarization, friend fresh install/update and public distribution remain separate |
| Windows | Compatible configuration and source retained | Windows machine/build/capture validation |
| Production TLS/TURN, backups, recovery | Dedicated core with trusted IP TLS, scoped maintenance and full reboot; encrypted off-host database/object/TLS restore passed; actual regular scheduled backup and encrypted off-host copy passed | Seven-archive retention threshold, real certificate renewal and restrictive-network TURN/TLS acceptance |

The approved phases are not all accepted. Environment and account gates remain explicit in `IMPLEMENTATION_PROGRESS.md`.
