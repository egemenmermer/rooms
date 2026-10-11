# ROOMS project instructions

## Implementation ownership — persistent user preference
- As explicitly requested on 2026-10-10, the main agent implements all work, including UI, interactions, animations and Liquid Glass. Do not delegate to Astra/high or open design subagents unless the user explicitly re-enables delegation.
- This supersedes earlier Astra/high design-ownership requirements in historical milestone and continuation documents.
- Read `docs/reference/ROOMS_DESKTOP_MASTER_PROMPT.md` in full and study both visual-reference files before implementing product changes.
- macOS 14+ and Apple Silicon come first. Preserve Windows compatibility without claiming Windows validation on macOS.
- Main agent owns product design, architecture, security, real integrations, visual QA, acceptance testing and final verification.

## Product and engineering
- Communicate with the user in Turkish. Write code, comments, and technical documents in English.
- Follow `docs/MILESTONES_0_3.md` and the approved continuation in `docs/REMAINING_PHASES_PLAN.md`. Treat the master brief as the complete product specification.
- Use upstream Stoat behind a typed adapter, as approved by the user after the original brief. Keep the existing Electron + React shell. Do not fork or rebuild its social backend. Preserve legacy Spacebar evidence separately.
- Keep realtime media replaceable and voice independent of navigation and Activity lifetime.
- Label all local fixtures as demo. Never imply real presence, calls, playback, authorization, or synchronization without actual verification.
- Every visible action must work or be disabled with a precise reason.
- Keep privileged operations and persistent authentication secrets out of the renderer. Validate IPC, navigation, permissions, and media-source access.
- No account sharing, provider-token distribution, unauthorized rebroadcasting, or DRM bypass.
- Record actual commands, results, screenshots, platform limitations, and unverified acceptance checks. Do not equate unit tests with two-client transport verification.

## Copy and manual acceptance — owner instruction 2026-10-10
- Keep product copy utilitarian: screen names, controls, concise empty states and necessary connection/error reasons. No slogans, promotional heroes, emotional taglines or generic explanatory filler.
- Do not restore demo mode or synthetic social/media content.
- The owner now performs all testing. Do not run automated tests, type checks, QA harnesses, acceptance scenarios or remote disruption/load tests unless explicitly reauthorized. Building and opening the application to deliver changes is allowed; do not call that acceptance or claim it passed tests.
- Existing verification evidence is historical. New changes remain awaiting the owner's manual acceptance.

## Current reference implementation task
- For the owner's 2026-10-10 design-package task, read `docs/rooms-implementation/BRIEF.md`, `CHECKPOINT.md`, `PROGRESS.json` and `DECISIONS.md` before continuing. The new user request explicitly reauthorizes scoped model delegation and QA; preserve all other instructions and production-data boundaries.
- Model preference updated by the owner (2026-10-11): additional agents may use `gpt-6.1-sol`, or `gpt-6-astra` with high reasoning for difficult design/integration work. Astra/high is explicitly reauthorized; Luna and other models remain unapproved. Root remains responsible for all shared files and `PROGRESS.json`. Maximum two independent implementers and one read-only reviewer, with one owner per shared file.
