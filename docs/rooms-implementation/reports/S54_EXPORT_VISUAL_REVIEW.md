# S54 Export Visual Review

**Status:** `CAPTURED_NOT_VISUALLY_ACCEPTED`. This is a visual comparison only; it does not verify the export action.

The fresh browser capture was recorded at `2026-10-10T12:57:16.937Z` for a 1440×900 viewport at 2× scale. Its application image SHA-256 is `176df439149625f3683eb472b3601a687ba93d7e48116ca9c960b2a0cfe797b6`; the immutable package reference SHA-256 is `d08b7e1b4ebd0bef532b1924a9b2abe500e92b93b0be4f95e2e1e0a3a6fd5b13`. The capture is bound to source-manifest SHA-256 `0ded4ae3ba813b51b5fd4cda3c524daafce95150ca752397e3f1f32a354f3d0c` and working-tree-diff SHA-256 `226d9eea43a78bbd5d4f5b412cbed5a89afd4510bd10f494d296a57c1edf5106`. Runtime errors were empty.

The [comparison image](../../../.local/design-review/evidence/S54-export/comparison.png) (SHA-256 `5b5dd125743c56fd1e1089a26412037b695e78ea4887bdcf5d53e75594b1eb2c`) places both full viewports side by side and shows an original-resolution crop of the dialog below.

The dialog width matches at 490 CSS px. Its measured bounds are x=475–965 CSS px in both images; the app dialog is 440 px tall (y=230–670), while the reference is 432 px tall (y=234–666). Both remain vertically centered. The header divider is 1 CSS px lower in the app capture (y≈309 vs. 308), and the footer divider is 4 CSS px lower (y≈598 vs. 594), accounting for the extra height. Preview width, dashed border, background row, footer alignment, and overall panel colors are close.

Remaining differences:

- The explanatory body copy is substantially dimmer in the app capture: its dominant text color is `#a2a0b2`, compared with `#f2f3f7` in the reference. The text and wrapping otherwise match.
- The export button is muted and reads as disabled in the browser capture; the reference shows a bright enabled button. This capture uses the `S54/export` local fixture without the desktop `window.rooms.activity.exportBoard` bridge, so it cannot establish the real desktop button state or export behavior. The disabled state has no visible reason in this screenshot.
- The preview filename is `whiteboard.png` rather than the reference sample’s `cumartesi-plani.png`. The displayed dimensions are `2000 × 1240 px` rather than `2000 × 860 px`. The app board’s 1000×620 working area produces a 2× 2000×1240 export; this is the actual board geometry and should not be reshaped to the reference sample’s aspect ratio. The generic filename reflects the current unnamed board.
- The underlying page differs: the reference shows “Cumartesi planı” and a visible green note with a connector; the app capture shows “Whiteboard” and does not show that diagram. The app background is consequently less legible in the same region, so this comparison cannot isolate backdrop opacity from the different underlying fixture content.
- The package screenshot includes native macOS traffic lights. The browser capture has a 30 px application chrome strip and no native traffic lights; these are host-window controls and should not be simulated inside the renderer.

**No acceptance claim:** the screenshot establishes only the recorded appearance of this local browser fixture. It does not confirm the native export bridge, generated file contents, or a successful download.
