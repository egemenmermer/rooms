# Optional native stereo publisher

The generic music runtime is built by infra/music.Dockerfile. Dockerfile.stereo is an optional derivative requiring an explicitly selected compatible immutable base image and verified-stereo build context. It is not a reference to a public maintainer image.

The build-only music-stereo workflow pins the upstream LiveKit Rust SDK revision, submodules, toolchain, patch and collected native notices. Verify its source, patch and native hashes before use; retain LiveKit, libyuv and generated WebRTC notices. Do not copy a macOS module into Linux.

ROOMS changes the published audio feature declaration only for a two-channel source. This is independent of provider authorization and microphone consent. Validate actual native load, separate-channel transport, source cleanup and compatible rollback in an isolated environment before replacing a running service. A bitrate ceiling is not delivered bitrate or a lossless guarantee.

Build and physical/provider acceptance are different checks. Previous private deployment receipts are not part of this public source distribution.
