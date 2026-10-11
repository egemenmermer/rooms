# Install ROOMS reference.4 — private Apple Silicon preview

The current friend preview is `0.1.15-reference.4`, built from source4f3e6fb. Download the [reference.4 prerelease](https://github.com/egemenmermer/rooms/releases/tag/v0.1.15-reference.4); private repository access is required. The owner can also send its DMG or ZIP privately. It requires an Apple Silicon Mac and macOS14+. The earlier [v0.1.14 GitHub release](https://github.com/egemenmermer/rooms/releases/tag/v0.1.14) is preserved; it does not contain the current redesign/fixes. Windows and Intel Mac packages are not included.

1. Use `ROOMS-0.1.15-reference.4-arm64.dmg` or unzip `ROOMS-0.1.15-reference.4-arm64-mac.zip`. Checksums accompany the privately supplied installers.
2. Open the DMG and drag ROOMS to Applications. Quit an older ROOMS copy before replacing it, then launch the installed copy.
3. This preview is unsigned and not notarized. If macOS blocks it, use System Settings → Privacy & Security → Open Anyway for this known application. Do not disable Gatekeeper globally.
4. Keep the ROOMS server preset: `https://62.238.119.134`. For the separately provisioned friend account, select **Giriş yap** and enter the privately supplied email/password. The account already belongs to the community; no invitation code or server root password is needed. Do not use **Davetle katıl** for an existing account.
5. Open the community's text or voice channel. Enable the microphone explicitly. Allow microphone/camera/screen-recording permissions when macOS requests them. Screen sharing uses an explicitly selected source; macOS system audio is not included.

The owner requested this preview for manual testing. It includes the new reference UI, corrected horizontal room tiles/avatars, quieter unavailable-private-call handling, and confirmed-channel-write/failed-refresh guards. Build checks are delivery evidence, not physical two-client acceptance. The current deployed activity service does not support all new table options; private-call signaling endpoints are missing. Real-Debrid authorization also requires the application's registered client ID. These are known prerequisites, not successful integrations. The owner checklist is in `MANUAL_CHECKS.md`.

The Soundboard starts empty: import your own clip, up to 8 seconds/2 MB, while in voice. It transmits through the enabled microphone. Clips remain in session memory and are cleared on logout/restart. Use a disposable channel when evaluating delete.

The separate Agent deployment kit is an administrator artifact, not a desktop installer. A separate host/model/bot accounts are still required; personal IPTV/Real-Debrid need authorized accounts. Keep friend credentials and personal provider tokens out of GitHub issues and shared screenshots.
