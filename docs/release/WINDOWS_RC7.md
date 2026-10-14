# Windows RC7 candidate — 2026-10-14

Owner requested a Windows build, native verification and addition to the existing RC7 release. Frozen runtime source: b38f8e91b600bd4319e1ddc885b2831542790859 (the existing Mac RC7 source). Later IPTV fixes are not silently included under this tag.

First Windows target: x64, NSIS per-user installer. No Windows publisher certificate is configured. Build artifacts must be labelled unsigned; do not bypass SmartScreen or claim a trusted signature. Certificate acquisition is an owner action.

Record issues before fixes: `build-notices.mjs` previously executed the pnpm shim directly; Windows requires its Node entry point. Portable build tooling is copied to the frozen source checkout; packaged runtime source remains unchanged.

Workflow builds on Windows Server 2022, checks source, installs the generated installer, launches its actual installed executable in a validated disposable profile, verifies bundled models/native APIs/CSP/onboarding and retains screenshots/results. No account, microphone, private stream, live room or server data is used.

Pending: successful native CI receipt; owner decision on unsigned distribution/signing; physical Windows friend acceptance for login/voice/mic/noise, two-way screen/system audio, DJ, soundboard and games. Windows automatic updating is unavailable in RC7: existing updater deliberately enables only verified signed macOS Sparkle. Manual Windows installer updates remain available. Existing Mac assets/appcast must remain unchanged.
