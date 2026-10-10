# Install ROOMS 0.1.14 — private Apple Silicon preview

Download [v0.1.14](https://github.com/egemenmermer/rooms/releases/tag/v0.1.14) from the private repository. The owner can also send the same installer privately if you do not have repository access. This package requires an Apple Silicon Mac and macOS 14+. Windows and Intel Mac packages are not included.

1. Download `ROOMS-0.1.14-arm64.dmg`. Its SHA-256 is listed in the release's `ROOMS-0.1.14-SHA256SUMS.txt` and `docs/RELEASE_SHA256_0.1.14.txt`.
2. Open the DMG and drag ROOMS to Applications. Quit an older ROOMS copy before replacing it, then launch the installed copy.
3. This preview is unsigned and not notarized. If macOS blocks it, use System Settings → Privacy & Security → Open Anyway for this known application. Do not disable Gatekeeper globally.
4. Keep the ROOMS server preset: `https://62.238.119.134`. For the separately provisioned friend account, select **Giriş yap** and enter the privately supplied email/password. The account already belongs to the community; no invitation code or server root password is needed. Do not use **Davetle katıl** for an existing account.
5. Open the community's text or voice channel. Enable the microphone explicitly. Allow microphone/camera/screen-recording permissions when macOS requests them. Screen sharing uses an explicitly selected source; macOS system audio is not included.

The owner requested this preview for manual testing. Its new Settings popup, channel menus, avatar/speaking UI, noise-suppression control and Soundboard are implemented but have not passed new agent acceptance. Earlier versioned evidence does not certify this build. The complete owner checklist is in `MANUAL_CHECKS.md`.

The Soundboard starts empty: import your own clip, up to 8 seconds/2 MB, while in voice. It transmits through the enabled microphone. Clips remain in session memory and are cleared on logout/restart. Use a disposable channel when evaluating delete.

The separate Agent deployment kit is an administrator artifact, not a desktop installer. A separate host/model/bot accounts are still required; personal IPTV/Real-Debrid need authorized accounts. Keep friend credentials and personal provider tokens out of GitHub issues and shared screenshots.
