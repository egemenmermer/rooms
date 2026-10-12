# Minimal room UI — implementation record

Owner-approved plan, 2026-10-13. Before repair: three navigation columns, duplicated chat/toolbar headings and voice controls, floating DJ trigger and permanent activity rows compete with conversation. Voice join ignores subsequent requests while busy and awaits disconnect before target selection. No room-event audio cues. Home always opens regardless of last account-scoped conversation.

Implement single240px sidebar, room occupants, conversation-first room, one voice strip, contextual activity/DJ, scoped last-view restore and non-blocking latest-request voice transitions. Preserve provider/security/data boundaries, all existing features, retained archives and Hoppers. Physical two-Mac transport/audibility remains owner/friend acceptance. No SMTP, password or production-service mutation.

## Implementation and local verification

Conversation-first shell removes space rail and duplicate dock/header. One240px sidebar exposes authoritative room directory and current participants, profile/settings and a single audio group; voice menu opens upward, capture picker remains mounted independently of dock controls, Soundboard and handoff remain reachable. Members are opt-in drawer, profile from participant; no unknown occupancy is shown as empty. Messages and activity catalog preserve all existing destinations.

Account/server-scoped last conversation records store only space/channel IDs, respect explicit deep links and never join voice. Voice requests are serialized/latest-request fenced; pending target paints immediately, repeated same target deduplicates, leave/account changes fence stale grants/connect/device/mic completion. Pending UI cannot show old-room participants/media as belonging to target.

Original local240ms PCM entry/exit cues use chosen output, low gain, no mic/publication. Initial/reconnect rosters and music-bot identities are suppressed; state notifications coalesce before roster comparison; deafening/preference disables playback and cleanup removes subscriptions/players. Preference roomEventSounds defaults true and follows existing Settings Save/Discard.

Full local tests PASS105files/704tests, including voice transitions, scoped restore, cue state/runtime/output/deafen. Lint/typecheck PASS; production/native build PASS. Current signed-out desktop smoke PASS. One later smoke invocation used a nonmatching filter and selected zero tests; it is not counted as verification. Native DEMO S19 shell inspected at actual1440×774 (screen-constrained requested1440×900) and900×700: rail/dock removed, no horizontal overflow, DJ/launcher open-close, drawer Escape, community menu and member drawer close; no renderer pageerrors. Avatar sizing and legacy hidden-toolbar CSS corrected from actual screenshot inspection. Evidence `.local/minimal-ui/visual.json`, wide.png/narrow.png/narrow-sidebar.png. These are explicit DEV fixtures, not authenticated or physical acceptance. Broken fixture-only activity artwork is not accepted as production asset evidence.

Candidate version0.1.18-rc.2 will be independently signed/notarized; existing /ApplicationsRC.1, profiles, retained archives, production services, SMTP/password and Hoppers remain unchanged. No feed publication. Physical audibility/transport and six-user soak remain OPEN. Signing result is pending until pipeline receipt.

Source review during initial packaging found microphone mute intention was not account-scoped. Owned pre-notarization packaging process tree stopped; log/staging preserved. Added scope reset and regression: a new account starts muted while same-account room switches preserve intent. New committed source will use a fresh staging output; no accepted artifact overwritten.

Final navigation review corrected the unified member action: DM opens peer profile; room inspector also works on activity destinations. Anonymous DJ trigger disabled with sign-in reason. Owned second pipeline stopped before notarization, with generated signed staging retained; fresh output binds the corrected source. No signing/security checks are weakened.

## Final candidate result — 2026-10-13

Final source30ffd4216026e43f8846debc6ced4d60d6ff1dbb: full105files/705tests PASS, lint/typecheck PASS; exact-source hosted CI38319224595 Ubuntu baseline/macOS native-smoke PASS. Two earlier packaging runs were intentionally stopped before notarization to include review fixes; logs/staging retained, neither accepted as final. Reviewed pipeline completed exit0 with publication disabled.

RC.2/build1791845627 Apple notarizationa146c82e-8f11-4860-8555-69a32aceca07 Accepted; strict signatures, app/DMG staple and Gatekeeper PASS. ZIP/DMG copied into release/candidates/0.1.18-rc.2 with exact manifest hash parity. Copied ZIP separately extracted under private temp: nested signature/staple/version PASS; extraction removed. Signed candidate launched with random disposable profile: version/About correct, renderer Node unavailable, zero pageerrors. Direct cold Forgot-password now reads the default public origin and accurately shows SMTP disabled; no recovery request sent. QA profile removed after normal close.

Native DEMO visual journey additionally verifies the selected voice room uses its own composer/channel, activity member inspector and DM peer profile. Actual dimensions1440×774/900×700; no horizontal overflow. Screenshots remain DEV evidence, not real-account/media acceptance. Some legacy fixture-only cinema artwork is unavailable; no production artwork assertion. See RC_0_1_18_2_RESULTS.json.

Owner-installedRC.1 remains unchanged. Prior app rollback and release/retained unchanged; no feed/production service/SMTP/password/Hoppers mutation. RC.2 is a separately prepared local candidate, not final private freeze/distribution or physical transport acceptance. Trello https://trello.com/c/9O9jcyNc tracks local implementation/package completion separately from owner/friend gates.
