# S72 offline visual review

Status: **captured and compared; not visually accepted**. This review applies to the fresh S72/offline capture listed below. It records screenshot differences; it does not certify behavior or completion.

## Evidence

- Current app: `.local/design-review/evidence/S72-offline/application.png`
- Capture time: `2026-10-10T12:20:54.380Z`
- App SHA-256: `434f8c7766dc936cf25c75dd4a58f3c387df6945c444c8187ccfcc412adc7103`
- Immutable reference: `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S72_common_system_states__offline.png`
- Reference SHA-256: `64de23996ad1efcb6779bb838f0c558e449216f0387d1548527c6bb77e2ea4e0`
- Both images are 2880 × 1800 pixels (1440 × 900 logical pixels at 2×). Capture metadata reports Inter loaded, no overflow, no runtime errors, and `CAPTURED_NOT_VISUALLY_ACCEPTED`.
- Comparison images: `.local/design-review/evidence/S72-offline/comparison-side-by-side.png` (SHA-256 `f226871d8d58cc8a52e11c823d94e995ce40174fddc178733e28c3aabcf117a8`) and `.local/design-review/evidence/S72-offline/comparison-difference.png` (SHA-256 `47c1ae11dc088ae0527639996a31746a9bfe9b89fc59d6e93db1c757e4791206`).

## Match and remaining gaps

The shell geometry matches at a 30 px top strip, 72 px rail, and 248 px sidebar; both images have no members panel. The `Bağlantı durumu` header, `Bizim Oda` context, offline illustration, heading, copy, and two buttons are present. The central offline content remains about 8 logical px lower than the reference: illustration bounds y≈343–424 reference / y≈351–432 app; heading y≈483 / y≈490; copy y≈524 / y≈532; buttons y≈586 / y≈593. “Son kontrol: 10 Ekim · 20.18” is still visible in the reference but absent from the app.

The cached left context remains incomplete. The reference keeps `#genel` selected and shows the Salon count, Ece/Can/Zeynep roster, and “Cinema sürüyor” activity row. The app shows the channel list and two voice-room names, but no selected channel, Salon count/roster, or activity row.

The reference header includes notification, pin, member, and search controls; the app shows search only. The lower community tile is a house glyph inside a green circle rather than the reference green `h.` mark. The bottom user dock shows a slashed microphone while the reference shows an unslashed one. The previous extra `Dosyalar` row is no longer present; the sidebar shows `Medyam` as in the reference.

The macOS traffic lights are native window chrome; the browser capture has no native controls. The centered ROOMS and lock/“Özel topluluk” status match. Do not draw replacement traffic-light controls inside the app.

## Review boundary

This is a static comparison at 1440 × 900. It cannot establish whether retry or cached-message actions work. Status remains captured but not visually accepted; no `VERIFIED` or completion claim is made.
