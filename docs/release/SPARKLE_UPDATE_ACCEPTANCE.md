# Sparkle integration and real update acceptance — 2026-10-12

Scope: move the existing Sparkle implementation into main without the unrelated music/audio changes or the production chat's uncommitted work. Implementation imported from reference snapshot 06f5477. This is a targeted integration, not a public V1 declaration.

## Result
**PASS: native update installation and next launch.**
Actual old signed application 0.1.17-preview.3 / build1791817336 updated to the published 0.1.17-preview.4 / build1791819276. The old application’s own Updates/About control initiated the real signed HTTPS update. Sparkle downloaded the161,526,863-byte archive. Native helpers installed it when the test application quit normally; reopening the updated application succeeded.

Automatic immediate relaunch was **not observed**. This acceptance covers install-on-quit and the next normal launch, not the separate “restart immediately” UI journey. Downloading/installation UI is owned by Sparkle. The React status remained “checking” at part of the staged-install phase; its coarse progress/state reporting is a UX follow-up, not evidence that the native installer failed.

## Evidence
- Old app updater status: enabled:true, configured:true, state:idle; checking state after the application's button click.
- Native accessibility tree observed Downloading update, including6.5MB,44.8MB,116.7MB and148.7MB of161.5MB.
- Native Autoupdate and Updater helpers observed, scoped to the test app.
- Normal Cmd-Q terminated the old application; app bundle version changed to preview.4/build1791819276 without manual file replacement.
- Next launch created a new test process and rendered the actual welcome view.
- Test profile sentinel and renderer localStorage marker survived. New helpers used the same explicitly isolated user-data directory.
- Strict deep codesign verification passed after installation.
- xcrun stapler validate passed; Gatekeeper accepted as Notarized Developer ID.
- Owner /Applications/ROOMS.app Info.plist/app.asar and existing native session fingerprint remained identical.
- Existing public appcast/archive and production services were not modified. No new release, notarization submission or account operation was needed.
- Sanitized machine-readable result: [SPARKLE_UPDATE_RESULTS.json](SPARKLE_UPDATE_RESULTS.json).

## Failure and environment record
The original older backup had Finder metadata that invalidated strict code-sign verification. It was not modified. An initial Documents-folder clone was also rejected by signed-update configuration; that failed attempt is not counted as acceptance.
A fresh short-path temporary clone was metadata-cleaned only, without changing signed file contents or re-signing it. Strict verification then passed before the real update. The successfully updated new bundle independently passed signature/notary/Gatekeeper checks.
The first unit fixture lacked Electron process.resourcesPath and failed4/5 assertions. The fixture was corrected; product checks/assertions were not weakened.
A shared dependency link initially allowed pnpm to adjust the original development dependency layout. It was removed; original frozen-lock dependencies were restored (Vitest4.1.11), and the integration checkout installed its own offline frozen-lock dependencies. No original product source or its uncommitted changes were edited.

## Validation of main integration
- Isolated frozen-lock dependency installation, offline: PASS. Product dependency manifests/lockfile unchanged other than adding the release:mac script.
- TypeScript no-emit typecheck: PASS.
- Native Sparkle2.10 preparation/N-API bridge compilation: PASS.
- Production renderer and Electron main/preload builds: PASS. Existing chunk warnings remain.
- Five new native update integration tests: PASS: first migration, existing explicit opt-out, invalid preference rejection, startup failure and untrusted IPC rejection.
- Full isolated baseline suite:92 files /657 tests PASS.
- Native link/window scoped suite:10 tests PASS.
These local tests use native stubs; the real old-to-new installation evidence above is separate.

## Integration files
Native Sparkle bridge, Electron updater branch, framework/addon/license packaging, pinned preparation helper, explicit Apple Accepted/staple/Gatekeeper/sign-appcast pipeline, publication helper, release:mac script and generated-native ignore rule.
New tests protect native routing/preference/sender/failure behavior. Existing renderer About controls already route through the typed updater bridge.
No music worker, microphone, provider cookie handling, social feature or production chat repair is imported in this PR.

## Instructions for friends
On a **Sparkle-enabled signed Mac build**:
1. Open Settings → Güncelleme ve hakkında → Güncellemeleri kontrol et.
2. Allow the signed native update download.
3. With automatic updates enabled, quit ROOMS normally after download/staging; next normal open uses the updated application. Follow a native install prompt if shown.
4. Confirm the new version under Updates/About.
Closing only the window may leave ROOMS in the tray and does not necessarily quit; Cmd-Q performs a normal application quit.

Versions shipped **without Sparkle** need one manual install of a signed Sparkle-enabled release. Nothing can bootstrap a missing updater through that missing updater. Windows is not certified by this Mac acceptance.
A user’s explicit update opt-out is retained. No new signing key/feed origin is distributed by this integration.

## Remaining separate gates
Fresh install on another Mac; signed-in session upgrade acceptance on a separate device; interrupted/low-disk update; forced invalid-signature failure; immediate restart UX; other platform delivery. REL-010’s full release work package is therefore still OPEN even though its native old-to-new happy path is now verified.
Initial audit scores/counts remain dated evidence and were not recomputed from this one scoped acceptance.
