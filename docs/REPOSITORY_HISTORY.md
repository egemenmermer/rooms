# Repository import and verification

This repository imports the completed ROOMS workspace in feature-focused commits. At the owner's request, author and committer timestamps are distributed across October 8 and 9, 2026 (Europe/Amsterdam). The commits organize the existing implementation; they are not reconstructed intermediate development snapshots.

Pre-push verification on October 9, 2026:

- `pnpm typecheck`: passed.
- `pnpm test`: 94 tests passed across 21 files.
- `pnpm build`: passed; existing bundle-size and mixed-import warnings remain.
- `pnpm services:build`: passed.

Source code, reference materials, original demo assets, technical documentation, test evidence, and application screenshots are included. Local credentials, account fixtures, native session storage, upstream checkouts, dependency caches, and generated build directories are excluded.

The previously verified October 8 Apple Silicon DMG and ZIP are distributed as an unsigned development prerelease, with their existing SHA-256 checksums. This import does not claim production Stoat, physical two-computer media, paid media providers, remote Agent deployment, Windows validation, signing, or notarization acceptance. See `IMPLEMENTATION_PROGRESS.md` and `FEATURE_MATRIX.md` for the actual verified boundaries.
