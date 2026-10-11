# Install ROOMS reference.5 — private Apple Silicon preview

The current friend preview is `0.1.15-reference.5`, built from source6c0d71a. Download the [reference.5 prerelease](https://github.com/egemenmermer/rooms/releases/tag/v0.1.15-reference.5); private repository access is required. The owner can also send its DMG or ZIP privately. It requires an Apple Silicon Mac and macOS14+. The earlier [v0.1.14 GitHub release](https://github.com/egemenmermer/rooms/releases/tag/v0.1.14) is preserved; it does not contain the current redesign/fixes. Windows and Intel Mac packages are not included.

1. Use `ROOMS-0.1.15-reference.5-arm64.dmg` or unzip `ROOMS-0.1.15-reference.5-arm64-mac.zip`. Checksums accompany the privately supplied installers.
2. Open the DMG and drag ROOMS to Applications. Quit an older ROOMS copy before replacing it, then launch the installed copy.
3. This preview has verified ad-hoc signatures but is not Developer ID signed or notarized. If macOS blocks it, use System Settings → Privacy & Security → Open Anyway for this known application. Do not disable Gatekeeper globally.
4. Keep the ROOMS server preset: `https://62.238.119.134`. For the separately provisioned friend account, select **Giriş yap** and enter the privately supplied email/password. The account already belongs to the community; no invitation code or server root password is needed. Do not use **Davetle katıl** for an existing account.
5. Open the community's text or voice channel. Enable the microphone explicitly. Allow microphone/camera/screen-recording permissions when macOS requests them. Screen sharing uses an explicitly selected source; macOS system audio is not included.

The owner requested this preview for manual testing. It includes the new reference UI, corrected horizontal room tiles/avatars, quieter unavailable-private-call handling, and confirmed-channel-write/failed-refresh guards. Build checks are delivery evidence, not physical two-client acceptance. The current deployed activity service does not support all new table options; private-call signaling endpoints are missing. Real-Debrid authorization also requires the application's registered client ID. These are known prerequisites, not successful integrations. The owner checklist is in `MANUAL_CHECKS.md`.

The Soundboard starts empty: import your own clip, up to 8 seconds/2 MB, while in voice. It transmits through the enabled microphone. Clips remain in session memory and are cleared on logout/restart. Use a disposable channel when evaluating delete.

The separate Agent deployment kit is an administrator artifact, not a desktop installer. A separate host/model/bot accounts are still required; personal IPTV/Real-Debrid need authorized accounts. Keep friend credentials and personal provider tokens out of GitHub issues and shared screenshots.

## macOS damaged-app warning

Reference.4 had an invalid residual Electron signature; use reference.5 instead. Its application and nested signatures pass strict verification, including after ZIP extraction. If macOS still blocks this known private application, first use Privacy & Security > Open Anyway. After verifying the provided checksum, the owner may explicitly remove only this application's download quarantine:

```sh
xattr -dr com.apple.quarantine "/Applications/ROOMS.app"
```

This bypasses Gatekeeper's download check for ROOMS only. Do not disable Gatekeeper globally. Signature verification is not notarization or physical-device acceptance.
