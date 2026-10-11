# S71 default visual review

Status: **captured and compared; not visually accepted**. This review is bound to the S71/default capture below. It records visible differences and does not certify behavior or completion.

## Evidence

- Current app: `.local/design-review/evidence/S71-default/application.png`
- Capture time: `2026-10-10T12:20:45.962Z`
- App SHA-256: `123c5b9ce6f8bd48ba5664ec025ccbd2990c59a4c676b13400eb532f8a9430c4`
- Immutable reference: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S71_updates_about.png`
- Reference SHA-256: `1081817acfcf630ff02849b19bd0f3549ec2594feeaf93af023d1ca549a85b1d`
- Both images are 2880 × 1800 pixels (1440 × 900 logical pixels at 2×). Capture metadata reports Inter loaded, no overflow, no runtime errors, and `CAPTURED_NOT_VISUALLY_ACCEPTED`.
- Comparison images: `.local/design-review/evidence/S71-default/comparison-side-by-side.png` (SHA-256 `11a91d89578d682748e75c12000274e5a0e3b4ff2380d9ddda709df1b3e5e7c3`) and `.local/design-review/evidence/S71-default/comparison-difference.png` (SHA-256 `275892e1867487bdf62bc2aebe427795ae543bdd68333aeb95b6a2ac81c63d60`).

## Visible differences

1. **Page structure differs by product decision.** The reference is a full-shell settings page. The current app shows settings in a centered dialog spanning about 96% of the window width and 93% of its height, with the underlying app dimmed and a close control. The owner instructed that settings stay in this Discord-like nearly-full-window dialog. Record this as an intentional structural difference from the reference, not as a match.
2. **Release identity and update content differ.** The reference shows the ROOMS mark, version `0.8.3`, macOS / Apple Silicon, an available `0.8.4` release, three release-note bullets, and active “Güncellemeyi indir” / “Güncellemeleri kontrol et” buttons. The capture shows a blank purple app-mark tile, `Sürüm — · —`, “Dağıtım bekleniyor”, no release notes, and a disabled update-check button; the signed-update control is off. These are the captured states. The screenshot does not establish update availability or action behavior. Signed-update gating and DEV-only fixture notes remain in force.
3. **Settings navigation differs.** The reference has distinct “KULLANICI AYARLARI”, “BİZİM ODA”, and “ROOMS” groups, including member/role, assistant-permission, and automation entries. The dialog navigation instead includes “Klavye” and “Tanılama” and does not show the same community-management group or `Sohbete dön` row.
4. **Support/privacy copy and footer differ.** The reference presents crash-report sharing as optional and ends with the ROOMS privacy footer. The app says report sending is not configured; the footer is not visible in the dialog capture.

## Boundary

This is a static comparison at 1440 × 900. It does not verify signed-update, opt-in, release-signature, or support-report behavior. The reference macOS traffic lights are native window chrome; the browser capture does not draw substitutes. No visual acceptance or `VERIFIED` claim is made.
