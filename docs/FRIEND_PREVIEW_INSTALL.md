# Install the private Apple Silicon preview

The latest tested preview is [v0.1.3](https://github.com/egemenmermer/rooms/releases/tag/v0.1.3). The private GitHub repository requires authorized repository access. Alternatively, the owner can supply the same DMG and checksum privately. This preview is unsigned and not notarized; it is not the finished signed release.

1. Download `ROOMS-0.1.3-arm64.dmg` and verify its SHA-256 against `docs/RELEASE_SHA256_0.1.3.txt`.
2. Open the DMG and drag ROOMS to Applications. Launch the installed copy.
3. For a developer-verification block, follow Apple's per-app **System Settings → Privacy & Security → Open Anyway** flow only for the known ROOMS package. Do not disable Gatekeeper globally. [Apple's opening guidance](https://support.apple.com/en-us/102445).
4. Open your privately supplied one-use `rooms://invite?...` link. Select **Yeni hesap** and enter your own username, email and password. Existing accounts use **Hesabım var**. Each delivery invitation expires and can be consumed only once.
5. If opening the link fails, open **Ayarlar → Bağlantılar**. Keep the **ROOMS sunucusu** preset (`https://62.238.119.134`) and enter the supplied invitation code in the registration form. An IP address does not require accepting an untrusted certificate: the current public certificate is trusted.
6. Open **Mesajlar** for the real community. Demo content is explicitly labeled and does not represent your friends' presence. **Ses** selects a real room; the dock stays connected when navigating into Cinema or other Activities. Microphone publication starts through **Mikrofonu aç**.
7. Grant macOS microphone, camera or screen recording permission when using that feature. Choose an exact window in ROOMS before **Seçili kaynağı paylaş**. This macOS build does not capture system audio.

Actual checks passed native invitation registration/reuse rejection, two-client message send/edit/delete, session restart/logout, real microphone packet delivery, native ROOMS window selection/received video and voice persistence across Home/Chat/Cinema/Games. Hardware capture checks used the development Electron identity, not fresh packaged ROOMS permission onboarding. Both clients ran on the same Mac; two physical-computer audible voice and restrictive-network acceptance remain outstanding. Camera permission was not determined and camera publication was not claimed.

Shared official YouTube sample playback, pause, pointer/keyboard seek and late rejoin passed with two authoritative viewers. Independent provider accounts, a separate Agent host and final Apple signing are still needed for their respective acceptance. Never give a friend your owner password or a personal media-provider token. The owner's private credential/invitation handoff is deliberately excluded from this repository.
