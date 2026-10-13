# RNNoise voice prototype

Base: `v0.1.16-preview.2` (`2574d49b1d276bc7d3c2ef2ac840d7306c83f471`). Local prototype version: `0.1.16-rnnoise.1`. The repository's default `main` is older (0.1.14); the owner's latest-tag correction was applied before delivery. The installed `/Applications/ROOMS.app` reports `0.1.16-preview.2` and was not replaced by this work.

## Implementation

- LiveKit microphone creation attaches one audio processor before publishing. Capture retains echo cancellation and automatic gain control; browser noise suppression is disabled to avoid stacking it with RNNoise.
- 48 kHz mono RNNoise runs locally in an AudioWorklet with bundled normal/SIMD Wasm. No inference service or credentials are required.
- Existing SoundboardMixer filters only the microphone branch; clips enter the destination after noise suppression. Toggling RNNoise keeps the same published output track.
- LiveKit microphone/device restart preserves the audio context when its restart callback omits audioContext. Serialized microphone work fences publication against leaving/deafening the room.
- The current reference Settings layout and Save/Discard behavior remain intact. The draft setting applies to a local meter; saving applies it to the current voice provider.
- Settings > Ses ve video includes a 15-second local comparison recording and 5–30-second audio-file processing, concurrent raw/filtered recordings, playback, download, delete, and cancellation. No feedback path connects capture to speakers. URLs are revoked on cleanup. The first 0.5–3 seconds provide a noise-only RMS level estimate; startup is excluded. Users must remain silent for the first three seconds.
- CSP permits Wasm compilation with `wasm-unsafe-eval`; it does not permit general JavaScript eval. Assets are bundled locally.

## Scope of evidence

The owner explicitly requested keyboard/vacuum testing in this chat. Only scoped local audio checks are authorized here; this does not establish general acceptance of the application. No remote deployment, real account conversation, physical microphone capture, or two-computer LiveKit test is claimed.

Test inputs: ESC-50 `1-137-A-32.wav` (keyboard_typing) and `1-100210-A-36.wav` (vacuum_cleaner), plus macOS synthesized speech. Mixed cases repeat each noise recording, normalize noise RMS to 0.06 and speech RMS to 0.12, and start speech at 3 seconds. This is a development test fixture, not a human speech corpus. Only the pre-speech noise segment contributes to the reported dB reduction; it is not speech-quality, SNR improvement during speech, CPU, or end-to-end latency evidence. MediaRecorder encodes both listening branches as Opus WebM.

Audio research files/output are ignored under `.local/rnnoise`; they are not shipped in the app. Dataset source: https://github.com/karolpiczak/ESC-50 (CC BY-NC 3.0; individual upstream clip conditions apply). Exact source URLs and SHA256 are saved by the preparation script.

## Reproduce

Start the development app server:

```sh
pnpm install
pnpm dev:web
```

In another terminal, prepare only local research recordings, build native app code, and run the scoped audio pipeline checks:

```sh
node scripts/prepare-rnnoise-fixtures.mjs
node scripts/build-electron.mjs
node scripts/verify-rnnoise.mjs
```

The verifier opens a separate Electron profile (`rnnoise-verification`), processes four file cases through the production comparison helper, checks nonempty output/duration, toggles the production microphone mixer, exercises the SDK-style restart without audioContext, and releases its output. It does not request microphone permission or connect to LiveKit. Results and playable outputs are written to `.local/rnnoise`.

Production renderer/native build commands used: `pnpm exec vite build` and `node scripts/build-electron.mjs`. General automated suites and type checks were not run for this task.

## Local file results — 2026-10-12

The scoped check on the preview.2-based prototype completed at 48 kHz, with no renderer errors. Output-length checks and processor toggle/restart/cleanup checks passed.

| Input | Noise-only RMS reduction (0.5–3 s) |
|---|---:|
| keyboard / original noise only | 21.2 dB |
| keyboard / mixed with synthesized speech after 3 s | 27.4 dB |
| vacuum / original noise only | 56.4 dB |
| vacuum / mixed with synthesized speech after 3 s | 45.7 dB |

Values describe these exact clips and levels, not all keyboards/vacuums. Speech preservation and remote call latency remain unverified. Listening outputs/results are in `.local/rnnoise`.

## Manual acceptance still required

1. In a current two-client voice room, save RNNoise enabled; compare remote listening with it disabled. Test quiet speech, typing while speaking, and a running vacuum at several microphone distances.
2. Check word endings, low-volume speech, and voice timbre. dB suppression of noise alone does not establish intelligibility.
3. Change microphone, mute/unmute, enable push-to-talk, deafen, reconnect, leave, and rejoin. Verify no capture remains after logout/quit.
4. Play a soundboard clip while RNNoise is enabled; verify it is audible and stops on mute/deafen/leave.
5. Use the local comparison panel, cancel while preparing/recording, navigate away, switch input, download/delete both recordings, and verify no feedback.
6. Measure added processing latency and sustained CPU on a physical target Mac. Windows is unverified.

Status: implementation and local file pipeline prototype; owner manual acceptance pending.

## Local Mac delivery

The ARM64 local test application is in `~/Downloads/ROOMS-RNNoise-0.1.16-rnnoise.1/mac-arm64/ROOMS.app`. `RNNoise Prototipini Aç.command` opens this exact application with `ROOMS_PROFILE=rnnoise-prototype`, avoiding the installed application’s single-instance lock and account storage. Sign in separately to exercise actual calls. The generated bundle is ad-hoc signed for local testing and is not notarized or a published release. The installed preview.2 application was not replaced.

Audio Settings screenshot `.local/rnnoise/audio-settings.png` is explicitly a DEV local fixture capture of the current Settings component, not an authenticated production call.

Packaged file-origin smoke check completed: 48 kHz AudioContext, bundled Wasm compilation and RNNoise AudioWorklet creation succeeded with the production CSP (`.local/rnnoise/package-smoke.json`). This verifies asset/CSP compatibility, not live-call acceptance.
