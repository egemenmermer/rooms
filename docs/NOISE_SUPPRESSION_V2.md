# Noise suppression v2 — branch implementation

Status: implemented on `feat/noise-suppression-v2`, awaiting owner acceptance with real microphones and two participants. No release or merge. Based on the RNNoise prototype at `f150e99`, which was based on `v0.1.16-preview.2` (`2574d49`). The original checkout's unrelated distribution changes were not included.

## Behavior

The default enabled mode is Strong: GTCRN enhancement at 48 kHz, with RNNoise speech probability and a smoothed speech gate. Two consecutive 10 ms frames at probability >= 0.6 open it; probability >= 0.2 sustains recent speech, with a 300 ms hold and 32 ms extra lookahead. Standard retains RNNoise without that gate. A previously disabled suppression preference remains disabled; missing/invalid mode migrates to Strong. Settings drafts apply when saved; comparisons use the selected draft mode locally.

Microphone capture -> mono worklet -> persistent output track -> LiveKit. Soundboard clips enter after filtering. Browser echo cancellation remains enabled. Native suppression is disabled; AGC is disabled in Strong and enabled in Standard/off. Screen-share audio remains unfiltered with AGC disabled. Room voice and DM calls both pass the stored mode.

Owned worklet assets and both pinned WASM models are bundled locally. No speech, model request, or diagnostic leaves the device for inference. Models are fetched lazily and cached; one caller's cancellation does not abort a shared model load. Worklets acknowledge model readiness, reject unsupported rates, use bounded buffers, validate samples, support explicit disposal and report gate/frame timing state. Worklet frame timing is approximate and excludes the parallel RNNoise VAD in Strong; it is not a complete CPU or network latency measurement.

Initialization failure blocks microphone publication. Runtime failure stops its processed output, mutes/stops the capture track and shows a recoverable error; there is no raw-audio fallback. Failed switches retain the previous filter when possible. Cancel/mute/disconnect invalidate pending microphone opens and dispose pending processors. Reopening an ended publication creates a fresh capture track. UI comparisons cancel on input/mode/call-microphone changes and release contexts, tracks, recorders and object URLs.

REA findings and exact evidence IDs are in [Discord audio study](REA_DISCORD_AUDIO_STUDY.md). This is an independent open-source implementation, not Krisp.

## Local measurements

Measured on macOS Apple Silicon using the exact built worklet and WASM in a Node VM. Input: 48 kHz mono, speech RMS 0.12, noise RMS 0.06, two seconds of initial noise, speech then one second trailing noise. One public human English utterance and a separate synthetic macOS speech sample were used. Noise recordings are looped to the input length. Human fixture results below use delay-aligned SI-SDR over speech: larger means better agreement with clean speech; it combines speech distortion and residual noise, not just noise loudness.

| Human speech case | Input SI-SDR dB | Standard dB | Strong dB |
| --- | ---: | ---: | ---: |
| Clean | No added noise | 23.28 | 22.50 |
| Keyboard | 6.13 | 12.77 | 14.52 |
| Wood knock | 9.76 | 14.21 | 18.96 |
| Glass break | 10.81 | 17.76 | 14.46 |
| Actual cups/cutlery recording | 4.07 | 6.28 | 14.85 |
| Vacuum | 5.52 | 12.21 | 13.34 |

The dishes fixture improved by 8.57 dB relative to Standard in this speech-separation measure. During its noise-only segment, reduction was 18.24 dB Standard and 38.39 dB Strong. Strong keyboard/vacuum noise-only output fell below the benchmark's -120 dBFS power floor; these are reported as below measurement floor, not enormous dB claims.

Estimated algorithm/output delay was 20.67 ms Standard and 63.88 ms Strong, from correlation, excluding capture/Opus/network/playout. Strong required approximately 0.07–0.15 offline real-time factor in this small run; browser workload, low-power hosts and long calls were not characterized. Strong was worse for speech overlapped with the glass-break proxy, and altered clean speech more. Soft speech, whispers, Turkish speakers, music, very loud nearby impacts and diverse microphones need owner acceptance. No filter guarantees rejection of every dish/pen impact while preserving speech.

## Verification performed

- `pnpm build`: TypeScript and production renderer/Electron build passed. Existing large renderer-chunk warning remains. Generated third-party notices include GTCRN, RNNoise and FFT notices.
- `node --experimental-vm-modules scripts/benchmark-noise-suppression.mjs --owned --human`: all 12 human/noise/mode cases produced finite, nonzero speech output. Injecting NaN input stopped each owned worklet with an error. VM intentionally omits `performance`, matching Chromium AudioWorkletGlobalScope.
- `node scripts/verify-noise-suppression.mjs`: isolated Electron DEV fixture, no account, microphone capture or remote server. Both modes initialized; mode/off/on switches retained the output track ID; restart and disposal passed; pre-aborted initialization, destroyed-mixer reuse and 44.1 kHz were rejected. Injected processor-error event invoked failure handling. Actual Settings file comparison produced two local recordings; decoding both confirmed finite, non-silent PCM (raw 6.00 s, filtered 6.06 s). Clear removed them, cancel returned to idle, zero renderer errors. This tests a local audio graph, not actual LiveKit publication/transport or physical mic permissions.
- Visual review of the local Settings screenshot, clearly marked DEMO.

A Chromium runtime check discovered that `performance` is unavailable in AudioWorkletGlobalScope; the worklet now uses Date.now there. Event errors use an explicit processorerror listener. Early readiness checks alone did not expose the former runtime issue; file inference verification did.

Local evidence: `.local/noise-v2/build.log`, `human-benchmark.json`, `browser-results.json`, `settings.png`, generated WAVs. These and vendor snapshots are ignored, not shipped.

## Reproduce / owner acceptance

Prepare dependencies with `pnpm install --frozen-lockfile`; then:

```sh
node scripts/prepare-noise-fixtures.mjs
pnpm build
node --experimental-vm-modules scripts/benchmark-noise-suppression.mjs --owned --human
node --experimental-vm-modules scripts/benchmark-noise-suppression.mjs --owned
pnpm dev:web
# In another terminal, after dev server is listening on 5173:
node scripts/verify-noise-suppression.mjs
```

Fixture preparation uses macOS say/afconvert; on other platforms supply PCM16 WAV files at the same local paths. Assets are local evaluation inputs and are not redistributed with the application:

- ESC-50: keyboard `1-137-A-32`, vacuum `1-100210-A-36`, wood knock `1-101336-A-30`, glass break `1-20133-A-39`, from [ESC-50](https://github.com/karolpiczak/ESC-50). Wood and glass are proxies, not the user's pen or dishes. Dataset licensing is separate from product dependencies.
- Actual cups/glasses/cutlery: IENBA, [Cup Glasses And Cutlery Clinks, 848942](https://freesound.org/people/IENBA/sounds/848942/), CC0, published 2026-03-24, public HQ preview converted to WAV.
- Human speech: [Mozilla DeepSpeech smoke-test LDC93S1.wav](https://github.com/mozilla/DeepSpeech/blob/master/data/smoke_test/LDC93S1.wav). Public test fixture does not establish redistribution rights for the source speech corpus; kept local only.
- Synthetic speech: macOS say, local generated sample; pronunciation/voice can vary by host.

Before merge, both participants should use this branch with Strong saved. Use the same microphone, volume and 15-second recording: first 3 seconds noise alone, then normal and quiet Turkish speech with keyboard, real pen taps and actual dishes, ending in noise. Compare raw/Strong/Standard recordings; check first syllables and word endings as well as rejection. Repeat in an actual call, after device changes, mute/deafen, reconnect and sleep/wake. Verify runtime/model-load failures keep raw sound off the publication. Windows, physical microphone permissions, two-client transport, long-call stability and these actual user recordings remain unverified. The owner requested no release or merge until review.
