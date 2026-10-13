# Native DJ stereo correction

The standard `infra/music.Dockerfile` remains the stock runtime builder. `Dockerfile.stereo` creates a verified derivative of an immutable compatible music image, checks SDK1.1.0/ffi0.12.73 and native SHA256, retains licenses/provenance and selects the documented `NAPI_RS_NATIVE_LIBRARY_PATH`. Production now uses `rooms-music:20261013-stereo`; prior images and encrypted compose/bundle rollback backups remain retained. No desktop release is implied.

Official source: https://github.com/livekit/rust-sdks
Pinned ffi0.12.73 revision: `63128d01d955d9d8967544f46cff64a361232bf6`.
Consumer: `@livekit/rtc-node@1.1.0`, native bindings0.12.73.
Upstream reports: https://github.com/livekit/rust-sdks/issues/1018 and https://github.com/livekit/rust-sdks/pull/1337.

ROOMS modification: add the existing `TfStereo` feature only when a native audio source has exactly two channels. Stock native publication otherwise negotiates a mono mix even with two-channel PCM. Existing track features and source authorization remain intact. This patch does not grant provider access or affect desktop microphone permissions.

macOS verification used pinned protocol/libyuv submodules, protoc29 and normal `cargo build --release --locked -p rtc-node-ffi-bindings`. Linux build-only workflow `.github/workflows/music-stereo.yml` uses official Rust1.97.1 DebianBookworm amd64 image pinned by digest, exact upstream revision/submodules, Cargo.lock and patch. It collects native hash, toolchain/submodule records and LiveKit/libyuv/generatedWebRTC notices. Initial license collection used the wrong generated path and failed after successful compilation; corrected to `livekit-ffi/WEBRTC_LICENSE.md`, retry38403230313SUCCESS. No artifact from the failed run was used.

Linux module SHA256: `333c965e0e92414f64fa22960d162b6a43843db5cc777d961b3f4b83e13b4c3e`.
Verified derivative image: `sha256:2461a3d8001815eefc62e47af2cc845c517f7fda1d864c454f20839347ba7a96`.
Music bundle SHA256: `a846a8f1896ead8fecaa86e0ee77f8905ab119b936b0063a18e480db4de4ad75`.

Actual Linux stock SFU baseline: both channels contain the same440/880Hz mix. Patched module and baked derivative image each pass true separate-channel receipt: left440~2048/left880<.01, right880~2048/right440<.1. Receipts `docs/release/DJ_LINUX_STOCK_STEREO_BASELINE.json`, `DJ_LINUX_STEREO_RESULTS.json`, `DJ_LINUX_STEREO_IMAGE_RESULTS.json`, `DJ_LINUX_STEREO_PROVENANCE.json`. Controlled generated source, no speakers/human subscriptions. Exact image also passes readonly/networknone startup/native load, and source/pause/resume transport checks. Physical listening and provider availability remain separate acceptance gates.510kbps is an encoder ceiling, not delivered-source bitrate or a lossless claim.

For rebuilding, obtain the build-only workflow artifact for the recorded source, verify upstream/patch/native hashes and all three license notices, place its contents in a root-owned `verified-stereo/` build context, then use `Dockerfile.stereo` with the recorded compatible immutable base image. Re-run actual runtime load and channel separation before any operational switch. Keep prior image/config and encrypted rollback archive. Never copy the macOS module into Linux or omit notices.
