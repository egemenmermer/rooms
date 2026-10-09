# Historical Spacebar-era verification

This file preserves the earlier build evidence. It does not describe current Stoat acceptance. See [current evidence](IMPLEMENTATION_PROGRESS.md) and [feature matrix](FEATURE_MATRIX.md) for the active implementation.

# Verification — 2026-10-08

## Actual environment

macOS26.5.2, Apple Silicon ARM64,8GB RAM. No Windows or second physical computer was available. Spacebar/PostgreSQL/LiveKit ran as owned native loopback services because this host's OrbStack VM deadlocked. Do not interpret local tests as Internet/NAT/TURN deployment acceptance.

## Results

| Command | Result | Scope |
|---|---|---|
| `pnpm typecheck` | PASS | Strict TypeScript across native, renderer, adapters, broker and tests |
| `pnpm build` | PASS | Vite renderer and bundled/sandboxed Electron main/preload |
| `pnpm test` | PASS,17tests | Adapter, Activity domain, permission calculation/rejection, media lifecycle; SDK doubles clearly separate from transport |
| `pnpm test:desktop` | PASS,2tests,9.6s | Actual Electron shell, bridge isolation/invalid IPC, palette, actual playback/seek, native fullscreen entry **and exit**, two distinct native login sessions, actual Gateway delivery, two authorized LiveKit joins, voice persists across Cinema, actual single-presenter race and release/handoff |
| `SPACEBAR_URL=http://127.0.0.1:3011 pnpm verify:social` | 15PASS /1FAIL | Actual pinned upstream; detailed sanitized SPACEBAR_TEST_RESULTS.json. Presence fails and remains BLOCKED |
| `pnpm verify:media` | PASS | Two actual Electron renderers, actual synthetic audio/video RTP receipt, receiver-observed publication mute/unmute/unpublish, actual signaling interruption/reconnection with continued RTP |
| `node scripts/visual-qa.mjs` | PASS,18checks | Final build, actual native fullscreen enter/exit, 1920×1080fullscreen screenshot, local/real UI interactions; no page errors |
| `pnpm exec electron-builder --mac dmg zip --arm64` | PASS | Unsigned local ARM64DMG/ZIP; signing identity explicitly null |
| `node scripts/verify-package.mjs` | PASS | Actual packaged ARM64app opens; bundled video advances; final artifact result in PACKAGE_TEST_RESULTS.json |

Native Cinema initially exposed a macOS `document.exitFullscreen()` transition hang. We reproduced it and replaced the Electron player path with actual native window fullscreen plus an immersive stage; browser preview keeps standard Fullscreen API. Final desktop test validates native `BrowserWindow.isFullScreen()` true then false and the stage restoring, rather than dropping the exit assertion.

## Performance observations

A packaged playback sample recorded per-process working sets: browser164512KB, GPU115776KB, renderer151568KB, utilities41376KB and45600KB, totaling roughly507MiB. Process working sets include shared pages and are not a precise exclusive footprint. The later native-fullscreen development sample totals roughly549MiB; the final packaged playback sample totals roughly566MiB (see PACKAGE_TEST_RESULTS.json). CPU values sampled on the first metrics read were zero and do **not** establish sustained idle/playback CPU. These are point-in-time observations on an8GB host, not a completed frame-rate, battery, thermal or memory-pressure benchmark. Renderer main bundle remains ~959KB/minified270KB gzip, including LiveKit; further lazy transport loading is outstanding.

## Explicitly outstanding

- Upstream presence observer delivery and authoritative status are broken; UI reports unavailable.
- Physical microphone audibility, camera/TCC permission, native screen/window selected-source receipt on another computer, OS-stop behavior, actual device hotplug, SFU restart and network outage acceptance remain unverified.
- System audio is disabled. E2EE is not configured; WebRTC transport uses DTLS-SRTP.
- Desktop DM/moderation actions exist and APIs are tested; full action-by-action UI acceptance is still pending. Server-based unread restoration after restart is incomplete.
- Revocation sweep checks membership periodically; an already-issued short-lived JWT may be reused until its five-minute expiry. Production must address this residual authorization window.
- Signing/notarization, updater, Windows build/runtime, Internet deployment and production backups/restores remain later acceptance.
- YouTube Together, IPTV, Real-Debrid, shared Cinema timeline and networked polls/games remain later activities. Bundled media and polls are local and labeled accordingly.

No secrets or passwords appear in screenshots, diagnostics, test output or packaged assets. Test account secrets remain ignored in `infra/local/`.
