# Experimental native stereo correction

This patch is **not enabled by `infra/music.Dockerfile` or deployed**. Linux build and actual Linux transport are acceptance gates before production use.

Official source: https://github.com/livekit/rust-sdks
Pinned ffi0.12.73 revision: `63128d01d955d9d8967544f46cff64a361232bf6`.
Consumer: `@livekit/rtc-node@1.1.0`, native bindings0.12.73.
Upstream reports: https://github.com/livekit/rust-sdks/issues/1018 and https://github.com/livekit/rust-sdks/pull/1337.

ROOMS modification: add the existing `TfStereo` feature only when a native audio source has exactly two channels. Stock native publication otherwise negotiates a mono mix even with two-channel PCM. Existing track features and source authorization are retained.

macOS verification used the pinned protocol/libyuv submodules, installed protoc29 and normal `cargo build --release --locked -p rtc-node-ffi-bindings` with two build jobs. The resulting library was loaded through the SDK's documented `NAPI_RS_NATIVE_LIBRARY_PATH`. Actual SFU audio receipt and channel separation are recorded in `docs/release/DJ_LOCAL_NATIVE_RESULTS.json`. This is a controlled generated source, not provider authorization or physical listening acceptance.

The upstream Apache-2.0 license is retained in `LICENSE.livekit-rust`. Any packaged native artifact must also retain the upstream generated WebRTC/libyuv notices and immutable source/artifact hashes; do not package the local experimental module as a production dependency without those records and Linux verification.

Linux build-only workflow `.github/workflows/music-stereo.yml` uses the official Rust1.97.1 DebianBookworm amd64 image pinned by digest and exact upstream revision/submodules. It applies only this patch, uses Cargo.lock and collects the module hash, toolchain/submodule records and LiveKit/libyuv/generatedWebRTC notices. It does not deploy, sign or publish a release. An artifact is still experimental until the production runtime loads it and actual Linux SFU receipt proves channel separation.
