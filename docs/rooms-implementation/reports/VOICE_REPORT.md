# S19–S23 voice and activity implementation report

Requested execution model: `gpt-6.1-sol`, medium. Actual model identifier: unavailable to this agent; not inferred. Scope: `RealSocial.tsx` CommunityVoice / RealVoiceDock and imports, `Activities.tsx`, `reference-voice.css`. CommunityChat, MediaStage and CommunityInvite implementations were preserved. No realtime, provider, IPC, authentication, service or fixture source was edited. No build, typecheck, automated test, browser capture or two-client transport validation was run by this agent; root coordinates these checks.

## Reference evidence

All 23 original PNGs below were opened through the image viewer, including every listed variant. Studied `05_prototype/media.js` and `media.css`; reference source is immutable. SHA-256 values below were computed from original PNG bytes and compared with inventory hashes. Dimensions: 2880 × 1800 for each original.

| ID | Variant | SHA-256 | State |
| --- | --- | --- | --- |
| S19 | default | `3c606df9d6245a4d02778e63f6e97619250fbfced4e26c86a57780249b82169d` | IMPLEMENTED_NEEDS_RECHECK |
| S19 | alone | `51d8c4475ace5eeac3878cf1f7f96d9a994712834400319c12039dc8c18d8159` | IMPLEMENTED_NEEDS_RECHECK |
| S19 | dm | `c5d1e0180a14de61d96c7d598b6e74d633286d166f8535b5d03ee0a8ce4e5754` | BLOCKED_DEPENDENCY — native DM grant |
| S19 | empty | `dfa8cd3b27faffe4f490dd66e100292fd14631e2f1b19bfb4259a8c31f0f25ba` | IMPLEMENTED_NEEDS_RECHECK |
| S19 | offline | `79a0907b360752db27f33f9d12b91aebbbfc04f616e91ff7a28aa75365d3f4d7` | IMPLEMENTED_NEEDS_RECHECK |
| S19 | ptt | `6b4acda7e05a7ee35df85ed18a44b3718d2e3ba8d8f2537942102b1038133821` | IMPLEMENTED_NEEDS_RECHECK |
| S20 | default | `376a8045876950c4d231fdfa2d5b3fc642dc0ddca425cb0b7973d95d00d8f7cd` | IMPLEMENTED_NEEDS_RECHECK |
| S20 | camera_off | `25c6d9b295dec965b1154c2c7140dbc7fe05b54e6fc11abdd6534a57473d5e42` | IMPLEMENTED_NEEDS_RECHECK |
| S20 | dm | `3400a1da261b812e4239c9e814451f0379476a236aba596e01c741e8c89d961a` | BLOCKED_DEPENDENCY — native DM grant |
| S20 | focus | `7e8df5f182d2dc05fa0caf2b26936e8bff3010f8366f4ccb4259340291c82b12` | IMPLEMENTED_NEEDS_RECHECK |
| S20 | no_device | `fa206d6e47659b43c18883c94eca882fa489e85334a02b99313eaea4ff5b8281` | IMPLEMENTED_NEEDS_RECHECK |
| S21 | default | `9a4df4b72c4979c0c590aa24985d8cd2e905d5d4b061e3545369f0e1af9e9614` | IMPLEMENTED_NEEDS_RECHECK |
| S21 | denied | `279566e32c0fe984c117b61c5c2ca6987bac6fd74d353479cb72264df2c4f935` | IMPLEMENTED_NEEDS_RECHECK |
| S21 | system_audio_unavailable | `9a4df4b72c4979c0c590aa24985d8cd2e905d5d4b061e3545369f0e1af9e9614` | IMPLEMENTED_NEEDS_RECHECK |
| S22 | default | `021cddc8cfc336f9b5152711b7b6943a1bbd828a3f3b75fe6ac7edc57c3a6358` | IMPLEMENTED_NEEDS_RECHECK |
| S22 | handover | `7489fd3644b69630132fde17b0f1df5715a155d9f5d5098c267206d184549b74` | BLOCKED_DEPENDENCY — handover protocol |
| S22 | request | `2ce2fa10f0d84c33b6cefd918cf861ac11260693034beb748be791800ef70b4e` | BLOCKED_DEPENDENCY — request protocol |
| S22 | request_sent | `31e3fe6bb674ba514f5f38d6d4ab23de12af1cf5981e5c202755344d6b877050` | BLOCKED_DEPENDENCY — request protocol |
| S22 | source_closed | `e9684c1f939f6c36ddcc0b0459d18b7cdf36555f5dcd86ba6aa00eff944a7817` | IMPLEMENTED_NEEDS_RECHECK |
| S22 | viewer | `c9d74b3d92abe4fbc7ea4d2f1b3a14d2a4c7c9efdf59cc79eef587789822edbd` | IMPLEMENTED_NEEDS_RECHECK |
| S23 | default | `388f91bbbfa131480e55904f035fb8e7eda77bd578dca2ccee7e31ca5e9dd819` | IMPLEMENTED_NEEDS_RECHECK |
| S23 | active | `f1a3280a3dffbdefe2f81d9c5199d1299b8fb43f7f52406f48bf974432fb31ba` | IMPLEMENTED_NEEDS_RECHECK |
| S23 | forbidden | `ded8cb52675167889a128f88ac4b9b7f4f128cd290c6152d93a4e5af7d647761` | IMPLEMENTED_NEEDS_RECHECK |

## Implemented behavior and differences

- S19 default/alone: reference three-column participant tiles, 68px genuine social avatars, muted indicators, connected-only speaking outlines and audio bars, invite tile, 24px room title, real participant count and compact dock. Alone naturally renders the actual participant roster plus invite tile; no synthetic empty people. Empty lists actual selectable voice channels. Offline/reconnecting uses actual transport status and explicit rejoin; no invented connection-quality badge. PTT banner uses the implemented `Ctrl + Shift + Space`, rather than the reference's unsupported bare Space shortcut. Parent owns shared channel/sidebar/context geometry and connection status there.
- S19/S20 DM: renderer does not claim a DM media session. Existing native grant accepts voice channel IDs; direct-call grant/lifecycle remains root's dependency. No fixture call is introduced in production.
- S20 default/camera_off/focus: actual LiveKit camera tracks are attached through unchanged MediaStage. Two-column gallery, actual-avatar camera-off tiles, microphone/name chips, camera indicators and gallery/focus selector. Focus has one large chosen participant plus a thumbnail column; selecting a thumbnail changes focus. `/voice?view=video` retains the video surface when all cameras turn off. No-device errors use the actual provider error with the real device-settings route. No fake camera art or pre-recorded production streams.
- S21 default: explicit desktop-native picker, Window / Entire screen tabs from source ID types, actual source thumbnails, selected border, privacy notice and consent button. No capture begins while listing or selecting a source. `mediaBridge()` resolves the real desktop bridge or root’s explicit development injection. `captureSources` and `captureStatus` are read independently; actual denial/error remains visible and retry re-reads native state. Denied variant provides exact macOS permission instructions; opening OS System Settings is not falsely wired to an unsupported bridge. System audio switch is honestly disabled because this publish flow does not send system audio, even when a future OS capability snapshot reports support. No fake source previews.
- S22 default/viewer: real screen-share track stage, actual presenter name, local stop action and view badge. No invented viewer count, media poster or playback controls. Change source first stops this device's publication, then opens the explicit native picker; source selection and start require another consent. Stopping screen sharing does not leave voice. `/voice?view=share` retains the share surface after source loss; a previously observed real track disappearing produces the source-closed empty state, otherwise the empty state says no screen share. No remote screen is adopted automatically.
- S22 request/request_sent/handover: existing native presenter acquire/release supports exclusivity but lacks a typed request/approval/transfer contract. Viewer request action is disabled with this precise reason; no fictitious sent/request approval modal. A new presenter must select a local native source after a future authoritative grant. Root owns this dependency.
- S23 default: 710px three-card picker using original film/play/cards icons, secondary poll/whiteboard/assistant controls and 155px cards. Every card uses a real existing route. Product copy describes current Cinema local-file behavior rather than claiming the missing independently sourced synchronized session. Personal-provider setup remains accessible from settings; screen capture remains accessible from the real dock. S23 active reads the genuine activity snapshot and offers return or explicit `end` command; own screen publication is stopped if ending an own screen primary. Failed end stays visible. Voice is preserved. S23 forbidden uses the actual current participant's `canControl: false`, without invented permission state.

## Integration and verification needed

1. Root shared shell should show the reference 59px room header and appropriate S19/S22 context panel, and omit context in S20 gallery/focus. Child presentation reserves bottom dock space. Root owns shell placement, responsive width and sidebar volume surface.
2. For captures use `/voice`, `/voice?view=video`, `/voice?view=share`, with root's development-only fixture adapter feeding the existing stores/provider. No development fixture was created here. Actual native permission/media setup is required for production validation.
3. Root should run central typecheck and capture all implemented states. No passing visual score, automated acceptance or real transport behavior is claimed in this report.
4. Verify native screen-source closure, explicit reselect, camera off/on, microphone/deafen, participant volume, audio unblock, soundboard, rejoin and leave with two genuine clients. Existing singleton provider remains lifecycle owner.
5. DM call grant, screen request/handover, exact real capture source label in the ongoing stage, verified receiver counts and synchronized independent-source Cinema remain dependency work. These states must not be marked accepted from this renderer change.
