# S10 default visual review

Status: **captured and compared; not visually accepted**. This review applies to the fresh S10/default capture below. It records visible differences and does not certify behavior or completion.

## Evidence

- Current app: `.local/design-review/evidence/S10-default/application.png`
- Capture time: `2026-10-10T12:21:08.842Z`
- App SHA-256: `ce1275c59acd38168f2edf6eb4fa9eaaa885dd706912eedd69033d1c47c753e0`
- Immutable reference: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S10_channel_chat.png`
- Reference SHA-256: `58d84d090a7a0d1f22097b0c4d9960aa8406ee0ef82476c5832e98a7fc0bf899`
- Both images are 2880 × 1800 pixels (1440 × 900 logical pixels at 2×). Capture metadata reports Inter loaded, no overflow, no runtime errors, and `CAPTURED_NOT_VISUALLY_ACCEPTED`.
- Comparison images: `.local/design-review/evidence/S10-default/comparison-side-by-side.png` (SHA-256 `2959e3953bb53490c3e5eaeaa676438b510f488db69e40542b9c77b73ea15cfa`) and `.local/design-review/evidence/S10-default/comparison-difference.png` (SHA-256 `46f6dd8a755a8bfbc800c82dca451ebce94b6b9f531a2834ff0a8d3105a9140b`).

## Match and remaining gaps

The shell geometry aligns with the reference: 30 px top strip, 72 px rail, 248 px sidebar, 59 px chat header, and 278 px members panel. The channel title and description, cinema announcement, date divider, four-message sequence, reactions, 248 KB PDF card, unread divider, film card, composer, typing indicator, and member roster are visible in corresponding positions.

1. **Right-side context is incomplete — high impact.** The reference continues below Mert with an “ODA ASİSTANI” / ROOMS section and a “Bir film açalım mı?” event card containing time, room, attendee avatars, and “Katıl”. The app capture ends after the offline member, leaving the lower panel blank.
2. **Announcement copy differs.** The reference says “Ece, Can ve Zeynep seni bekliyor.”; the app says “Ece, Can, Zeynep.”
3. **Community mark differs.** The reference lower rail shows the green `h.` mark. The app uses a house glyph inside a green circle, duplicating the selected Home icon above it.
4. **Microphone state differs.** The app user dock shows a slashed microphone; the reference shows an unslashed microphone.

The prior capture's extra sidebar row/control discrepancy is not visible in this fresh image: `SANA ÖZEL` has no extra row in either screenshot, and the `Bizim Oda` header has no adjacent `+` in the current app capture. The macOS traffic lights in the reference are native frame controls; the browser screenshot omits them. Preserve that platform-frame difference.

## Review boundary

This is a static comparison of S10/default at 1440 × 900. It does not establish that message, reaction, attachment, cinema, member, or composer actions work. No visual acceptance or `VERIFIED` claim is made.
