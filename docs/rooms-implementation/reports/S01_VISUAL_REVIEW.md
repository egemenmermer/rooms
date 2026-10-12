# S01 welcome visual review

Status: **captured and compared; not visually accepted**. This review applies only to the latest capture hash and timestamp below. It records screenshot differences and decisions that need the product owner; it does not certify behavior or completion.

## Evidence reviewed

- Current app capture: `.local/design-review/evidence/S01-default/application.png`
- Capture time: `2026-10-10T11:41:57.069Z`
- App PNG SHA-256: `8aa5887e0810a6a0ec153eb04897f12dca8f02c134f04969efccc3952870ceb3`
- Immutable reference: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S01_welcome.png`
- Reference SHA-256: `06c0d0424018aac1653f24925f5dde74a96d2ed31c794438ee6dcf056c50196c`
- Both PNGs are 2880 × 1800 pixels, representing 1440 × 900 logical pixels at 2×. Capture metadata reports Inter loaded, no overflow, no runtime errors, and status `CAPTURED_NOT_VISUALLY_ACCEPTED`.
- No other `S01*` screenshot, including a responsive-size reference, is present in the package’s `04_screens` directory. Responsive behavior could not be compared to a supplied reference.
- Side-by-side comparison: `.local/design-review/evidence/S01-default/comparison-side-by-side.png` (SHA-256 `6fd604dbff67915575edfa378d4a31b64bb084cd13fe4a117dcce1ac53c20869`); left is the reference, right is the app capture, each shown at logical size.
- Contrast-enhanced pixel difference: `.local/design-review/evidence/S01-default/comparison-difference.png` (SHA-256 `9be42bbe7c4c6a7674e334a1b25c9411cdfc52e541c2ebd03f1a3fda4ef63849`).

## Geometry that now matches

The hero card begins at approximately y=54 and ends at y=862 logical pixels in both images. Its width and left/top placement, bottom clearance, and the large portal artwork’s placement now align closely. The brand mark, hero headline, and supporting copy also align. The prior 30 px downward extension at the bottom of the card is resolved in this capture.

## Remaining visible gaps

1. **Welcome form spacing — low-to-medium impact.** The form’s left edge is aligned. Approximate text-top coordinates in logical CSS pixels are: eyebrow y=239 reference / y=242 app; heading y=271 / y=275; subtitle y=318 / y=321; primary button top y=370 / y=366; invite row y=449 / y=435. The first three lines are 3–4 px low, the button is 4 px high, and the invite row is 14 px high. The button-to-invite gap is about 26 px in the app versus 36 px in the reference. The button arrow now precedes the label as in the reference.
2. **Primary button edge treatment — low impact.** The app button still has a visible pale outline/highlight around the lilac fill; the reference appears as a flatter solid fill. The button width and position are close.
3. **Prototype-only content is intentionally omitted — `DECISION_REQUIRED`.** The reference shows a “Demoyu keşfet” action with synthetic sample data and an explicit prototype disclaimer. The app omits both. Owner instructions prohibit restoring demo mode or synthetic social/media content, so this review does not recommend adding them. The product owner must decide whether to keep these omissions or choose a real-product alternative. This is a product decision, not visual acceptance.
4. **Decorative floating friend cards are intentionally omitted — `DECISION_REQUIRED`.** The reference overlays Ece’s “Film seçiyor” card and a two-person “Birlikte daha iyi.” card on the hero artwork. The app leaves the artwork unobstructed. These cards imply synthetic presence/activity; keep them omitted unless the owner chooses a real-data-backed treatment.
5. **Top window strip is platform context.** The reference includes macOS traffic lights; the browser capture shows a narrow divider and no native controls. Preserve the native OS/browser-frame difference. Do not draw replacement traffic-light controls inside the app.

## Review boundary

This is a static comparison of the local S01 fixture at 1440 × 900. The screenshot cannot establish control behavior or responsive layout. The demo and floating-card omissions remain decision-required, and this review makes no `VERIFIED` or completion claim. If the capture is regenerated, compare against its new timestamp and SHA-256 before carrying these findings forward.
