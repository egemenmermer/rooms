# Discord audio architecture study with REA

Date: 2026-10-13. Scope: installed macOS Discord artifacts, static inspection only. Tool: [Reverse Engineer Anything](https://github.com/morluto/rea), `rea-agents@6.4.0`, using its `reverse-engineer-anything` skill and JavaScript application recovery workflow. No Discord process was attached or modified.

## Evidence and reproducibility

The CLI performed `analyze-javascript-application` on app.asar and selected JavaScript module snapshots, and `inspect-macho` on the installed native modules. The native files were inspected in place. Only index.js, package.json and manifest.json were copied to ignored local snapshots for the JavaScript workflows. Neither vendor sources nor models are committed or bundled.

Equivalent CLI invocations (paths depend on the installed Discord version):

```sh
npx -y rea-agents@6.4.0 analyze-javascript-application /Applications/Discord.app/Contents/Resources/app.asar --format json
npx -y rea-agents@6.4.0 analyze-javascript-application .local/rea/voice-snapshot --format json
npx -y rea-agents@6.4.0 analyze-javascript-application .local/rea/krisp-snapshot --format json
npx -y rea-agents@6.4.0 inspect-macho /path/to/discord_voice.node --format json
npx -y rea-agents@6.4.0 inspect-macho /path/to/discord_krisp.node --format json
```

The module directory inspected was Discord app-0.0.415, discord_voice-1 and discord_krisp-1. Raw result envelopes remain locally under `.local/rea/`. Snapshot hashes cover selected files, not the entire installed module.

| Artifact | SHA-256 / snapshot root | REA evidence ID |
| --- | --- | --- |
| Bootstrap ASAR | `61a72bb967b1681d3926886c5f41489ceccd1a4237b2f11feb0da1747765a4e5` | `ev_c39ffb415e2635f8d0a545c9c5b82e1ebbd62555c7f16eedb8bc09a7f675f4f1` |
| Voice JS snapshot | `ab3da2bbbbe70d4c93b09120dc4136ef9d1e21d1484701cc8d46054bec74a610` | `ev_09a278927f895cdf85ec8144868d7f2d2ed0ced5b91cfc2f42158151a45b2654` |
| Voice native | `fd4bd58a25f69039ce3f9670cf671b4982f2f7c4dd3ff28651305d23d25c851c` | `ev_75266352188351cc0e8b5672b81c293edd5d5e73c4b67ce032700f3005338de9` |
| Krisp JS snapshot | `79ffd3d3529658fc56b4c0e9ea978b158f43aba31705ed433f3bdaf84ae810d3` | `ev_aa1416b6081e6c9b9217611abd1fb8eb8ce5f8b84dcc528f6fa06077314d71b7` |
| Krisp native | `fefd3195c3f85484a7a187056e02b83d29b0b8a5fa81f8e78ed2dc5c1ab9b684` | `ev_7d58714e55332519ebce6b15f91bf8b82fef94b8297c0281997c758319087a7e` |

## Observed boundaries

- Voice JavaScript resolves `discord_krisp` with `getModulePath`, then gives that directory to the native voice module with `setKrispPath`. Thus changing JavaScript settings alone does not supply Krisp inference.
- The Krisp wrapper calls `_initialize` and exposes separate NC and VAD model discovery (`_getNcModels`, `_getVadModels`, `_getNcModelFilename`). Model resource names include NC lite/med/nb, VAD and BVC `.kef` files. File names indicate separate resources, not recovered model internals.
- Voice native exports include noise suppression, noise cancellation, automatic gain control, echo cancellation and noise-cancellation stats interfaces. Feature declarations include `krisp_native_error`.
- The two native modules are Mach-O universal artifacts containing x86_64 and arm64 slices.

These are shipped-artifact/static observations. Function names and JS call sites do not establish runtime DSP ordering, gate thresholds, quality, model weights, defaults, or end-to-end latency. No proprietary model was decrypted, executed, copied, or recreated; no native DSP algorithm was decompiled. This study does not demonstrate Krisp equivalence.

## Application to Rooms

The implementation adopts the observable separation of enhancement, speech detection, capture controls and failure reporting. It uses independently sourced open-source GTCRN enhancement and RNNoise speech probability. Strong mode disables capture AGC, retains browser echo cancellation, and avoids stacking native noise suppression. A processor must acknowledge initialization before publication; a runtime failure stops the microphone rather than changing to raw audio. Standard RNNoise remains available because stronger gating can alter soft speech and some transient cases.

See [implementation and measured limitations](NOISE_SUPPRESSION_V2.md). Thresholds and lookahead are Rooms choices, not recovered Discord constants.
