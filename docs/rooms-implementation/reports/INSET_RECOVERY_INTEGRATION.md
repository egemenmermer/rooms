# Inset playback and account recovery integration

Date: 2026-10-11. Implementation is committed; visual and real-account acceptance remain open.

## Behavior

Personal IPTV and RD playback keeps the app sidebar and toolbar and reuses the persistent video element across navigation. The live view projects actual current/next EPG and observed DVR bounds. Typed network, authorization, expiry and unsupported-media failures have distinct recovery paths. Recent channels are stored privately in the native account partition after a playing acknowledgement; no private stream URL is added to activity state or history. Missing metadata is not invented.

The read-only integration review found two navigation regressions. Root fixed both: a stale player URL without a session no longer makes the browse section inert, and returning from the player restores the already-selected channel/library view. Three new regressions cover these paths. The title, audio/caption action and expiry icon now follow the inset hierarchy.

Password recovery uses explicit native clipboard import and an expiring opaque renderer handle. Native code validates the exact configured HTTPS origin and reset path, binds the handle to sender/session/server, consumes it before mutation, and returns sanitized outcomes. Tokens never enter renderer route state. Other sessions are removed on a successful reset. S04/expired is the expired-session sign-in projection; earlier tracker text incorrectly described expired reset tokens.

## Executed checks

- Full local suite before the final navigation/header polish: `pnpm test`, session 47314, exit 0, 69 files / 567 tests.
- Final `pnpm test tests/personal-media-metadata.test.tsx tests/personal-playback-lifecycle.test.tsx tests/stoat-password-recovery-ui.test.tsx`, session 44303: exit 0, 25 tests, including three new navigation regressions.
- Final `pnpm build`, session 99020: exit 0, strict TypeScript, Vite, 126 dependency notices and Electron bundle. Existing mixed-import and large-chunk warnings remain.
- Thirteen actual browser fixture captures: S04 all four, S36 all five, S38/playing, S39 all three. Receipts are archived in `evidence/2026-10-11/inset-recovery/`; each retains its original source manifest and timestamp. All report loaded Inter, no horizontal overflow and no page errors. S04/sent uses a later capture-tool-only revision after correcting its real label and status selectors; no source manifest was rewritten.
- Root viewed final S04/reset, S36/default, S38/playing and S39/unsupported. Earlier player snapshots and all nine original player references were viewed before the final header polish. Other final captures still require individual visual comparison. Captures are not visual acceptance.

## Remaining gates

External-player launch remains disabled because an authorized private native transport broker is absent. A disabled external option is not a completed external integration. Genuine provider, caption-track, OS picker, native fullscreen, two-device voice, Windows and physical-device behavior remain separate checks. SMTP/hCaptcha and a deployment using a different web-app origin need authorized configuration; the reset broker intentionally does not trust an arbitrary second origin. No real account reset, deployed service mutation, installer replacement or release occurred.

The 413-record scope is unchanged. All records remain NEEDS_RECHECK; zero are accepted as visually verified. Moving the two S04 records out of implementation BLOCKED does not mean the product is complete.
