# S36 / S38 inset personal player styling

Date: 2026-10-11. Owner: bounded inset-player CSS implementer. Status: implemented, awaiting root integration and exact captures; no visual acceptance claimed.

## Scope and reference review

Read the project instructions, complete master prompt, both historical visual-reference files, current reference brief/decisions/checkpoint and relevant progress records. Individually opened these immutable original PNGs with `view_image`:

- `S36_iptv_live_player.png`
- `S36_iptv_live_player__rewound.png`
- `S36_iptv_live_player__buffering.png`
- `S36_iptv_live_player__error.png`
- `S36_iptv_live_player__expired.png`
- `S38_real_debrid_library__playing.png`

All are under `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens`. Originals are 2880×1800 exports of a 1440×900 viewport. They were viewed, not modified or installed into production.

At the reference viewport, S36 content begins near x348/y119, with a 1064×440 stage at y192. The preparation/failure/expired stages are about 1064×512; the rewound warning moves the player down by about82px. The now/next row sits20px below the stage. S38 playing adds a private-area strip and uses an approximately1064×524 stage at y251. The production image is kept contained rather than cropped merely to imitate fixture artwork.

## Files and integration contract

Only `apps/desktop/src/reference-inset-player.css` and this report were created. Root owns the JSX, CSS import, fixtures, tests and tracker.

- Import the new sheet after `reference-media.css`.
- Add `.inset` only to the foreground browse player runtime. Runtime becomes absolute within the positioned main view, retaining the actual app toolbar and sidebar. Background remains under the existing `display:none` rule and must remain mounted.
- `.personal-inset-stage` wraps the existing `.ref-media-stage` and `.personal-live-controls`. Its default `display:contents` preserves the existing full-window/fullscreen/mini containing block. Only the inset non-fullscreen player makes it a positioned box.
- `.personal-programme-grid` accepts two `article` children with `small` or `time`, `strong`, and `p`. The grid is visible only in inset presentation; fullscreen and miniature retain their previous composition.
- `.personal-inset-notice` supports the genuine observed DVR lag and return-live action above the stage. `.personal-inset-privacy` supports the S38 private-area strip before the title. Both are hidden outside inset presentation.
- Loading/error presence (`.ref-media-stage-state`) increases the inset stage ratio to the reference state size and hides its disabled playback strip. Recovery buttons remain interactive.
- Page title/actions remain visible while inset playback controls become idle. The existing fullscreen idle behavior remains untouched.
- The redundant player voice pill is hidden only above1100px when the community app actually contains the voice sidebar. At narrow widths, its content stays in the page flow and can wrap; bottom padding accommodates the shell voice dock.
- The inset wrapper and visual overrides do not replace or remount the media element and do not touch data, source ownership, authentication, navigation or provider adapters.

## Root recommendations and remaining work

The original S36 header presents the real programme title above the real channel name; display an observed guide title only when supplied by the provider. Its trailing actions are return-to-channels and audio/captions. Existing Chat/stop/back affordances have not been hidden by CSS; root should explicitly decide the final functional header composition.

The reference loading, failure and expiry variants have distinct icons, copy and recovery actions. CSS deliberately does not infer an expired account from a generic video error. Root must supply typed outcomes and actual recovery handlers. The reference's branded still/title overlays are not fabricated by CSS. Missing artwork or programme metadata must remain honest.

S38 contains a private-area strip and a Cinema action that requires a real authorized flow; no such action or provider capability was invented here. Its subtitle should only claim resume when an actual saved position is restored.

No tests, type checks, builds, QA harnesses, application screenshots, Git operations or tracker writes were run by this implementer. Read-only `cat`, `sed`, `rg`, targeted JSON reading and the six original image views were used; `apply_patch` created the two owned files. Root should inspect exact current S36 variants and S38/playing at1440×900, narrow layout, fullscreen return and persistent hidden playback, and confirm browser/native focus and voice accessibility. Real provider playback, native fullscreen, Windows and owner manual acceptance remain unverified.
