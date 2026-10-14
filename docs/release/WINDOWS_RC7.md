# Windows RC7 candidate — 2026-10-14

Owner requested a Windows build, native verification and addition to the existing RC7 release. Frozen runtime source: b38f8e91b600bd4319e1ddc885b2831542790859 (the existing Mac RC7 source). Later IPTV fixes are not silently included under this tag.

First Windows target: x64, NSIS per-user installer. No Windows publisher certificate is configured. Build artifacts must be labelled unsigned; do not bypass SmartScreen or claim a trusted signature. Certificate acquisition is an owner action.

Record issues before fixes: `build-notices.mjs` previously executed the pnpm shim directly; Windows requires its Node entry point. Portable build tooling is copied to the frozen source checkout; packaged runtime source remains unchanged.

Workflow builds on Windows Server 2022, checks source, installs the generated installer, launches its actual installed executable in a validated disposable profile, verifies bundled models/native APIs/CSP/onboarding and retains screenshots/results. No account, microphone, private stream, live room or server data is used.

Pending: successful native CI receipt; owner decision on unsigned distribution/signing; physical Windows friend acceptance for login/voice/mic/noise, two-way screen/system audio, DJ, soundboard and games. Windows automatic updating is unavailable in RC7: existing updater deliberately enables only verified signed macOS Sparkle. Manual Windows installer updates remain available. Existing Mac assets/appcast must remain unchanged.

## First native source-check result

Run38535360423: TypeScript PASS;781/784 tests PASS. Three failures were `EPERM fsync` in Linux-only Access service registration persistence tests. That module is not in the desktop bundle. Do not weaken its POSIX durability or claim Windows server support. Windows client verification excludes only `tests/stoat-registration.test.ts` (four tests); the complete backend suite remains required on Ubuntu. Full Mac/Ubuntu verification of tooling7c9dd49 passed in run38535360105. First attempt did not package or publish.

## Native Windows verification

Run38535819401 (toolingbec563c, runtime frozenb38f8e9) PASS:117files/780tests, types/build, NSIS installation, installed ASAR equality, packaged Win32/x64 launch, sandboxed onboarding, two viewport screenshots, Strong+Standard bundled model readiness, invalid privileged command rejection and preference persistence on relaunch. Capture enumeration:3sources/1screen; enumeration is not publication/transport acceptance.

Installer:135103498bytes; SHA256 eacd4adb42f8db1aeacfd9bfbe533427cebd461ecb71001df9fabe6ba3388add. The next workflow adds only this frozen verified unsigned candidate and its receipts/screenshots to existing RC7 without replacing any asset. Physical friend voice/screen/soundboard acceptance remains open.

## Distribution

Verified Windows installer and receipts/screenshots added to https://github.com/egemenmermer/rooms/releases/tag/v0.1.18-rc.7 by run38537078822. Unsigned Windows friend-test download: https://62.238.119.134/rooms-updates/ROOMS-0.1.18-rc.7-windows-x64-setup.exe . Source remains existing Mac RC7 b38f8e9. GitHub existing assets preserved byte/hash metadata; public server file hash matches native receipt.

Manual friend acceptance: normal installation and login with existing account; join Lounge with a Mac participant; microphone/mute/deafen and Strong/Standard filters; two-way screen share including system sound; DJ playlist/Next; community soundboard upload/play; restart and confirm saved levels. Record actual outcomes and error text, never provider credentials. Existing RC7 soundboard/real-provider issues remain open; this platform build does not silently fix them.
