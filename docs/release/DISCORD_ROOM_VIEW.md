# Voice-room view correction

## Recorded owner issue — 2026-10-13
Voice room selection (Lounge) opens a chat-only page. Owner requests the supplied Discord-style participant room view and visible bottom microphone/camera/share/activity/soundboard/leave controls. This supersedes the earlier conversation-first default for voice-room clicks; text-channel chat and minimalist community navigation remain.

## Implementation scope
Reuse actual LiveKit participants/tracks, existing capture picker and commands. No invented presence, automatic publication, new backend APIs or owner-account test actions. Room chat remains explicitly accessible. Local QA authorized; physical two-Mac acceptance remains open. Record navigation, waiting/error state and source-picker checks before packaging a new candidate.

## Local verification
Voice-room clicks now navigate to /voice and default to actual participant stage; explicit chat stays on the room's own selected channel. Last voice-room location restores the view without joining audio. Sidebar media buttons and visible room dock reuse the current microphone/camera/capture/activity/soundboard/leave commands; microphone/camera arrows expose real device settings. Capture query intent handled and picker invalidated on room/account changes. Shared screen is explicitly watched rather than forcing the page. Active video supports browser picture-in-picture; without video the separate-window button is disabled with a reason. Fullscreen enter/exit is supported. Full room popout is not implemented; the button is explicitly labelled for video.

Full suite109files/716tests PASS, focused15checks PASS, lint/typecheck PASS. Native Electron disposable DEV DEMO: actual1440×774 and900×700, single participant plus activity tile and five-member gallery, room click/stage, actual-channel chat return, mic toggle, device-menu Escape, source picker/cancel (no publication), exactly one Soundboard modal, fullscreen enter/exit, explicit incoming-share watch, no horizontal overflow/pageerrors. Screenshots inspected; inherited primary-button inset highlight removed and fixed controls centered in workspace. These do not establish real owner audio/camera/share reception or physical two-Mac acceptance. Evidence .local/voice-room/visual.json and screenshots. Two strict test type errors (unsupported testing-library exact option) corrected; final typecheck/lint passed.

RC.4 will use existing independently signed/notarized publication/install flow; preserve RC.3/retained archives, accounts/data/Hoppers. No backend API/service rollout. Owner physical acceptance remains OPEN.
