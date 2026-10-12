# Repository cleanup and local release retention

Date: 2026-10-12 (Europe/Amsterdam). Owner authorized removal of old build/release files, keeping the last working release and one rollback package, and publication of this report on GitHub.

## Result

The installed macOS Apple Silicon application remains **0.1.17-preview.4**, build **1791819276**. Local packaging storage now contains exactly two application archives under `release/retained/`, plus checksum and retention metadata. The rollback is the immediately preceding **0.1.17-preview.3**, build **1791817336**, used in the documented native upgrade acceptance run.

| Role | Local archive | Bytes |
| --- | --- | ---: |
| current | `release/retained/ROOMS-0.1.17-preview.4-arm64-current.zip` | 159,744,964 |
| rollback | `release/retained/ROOMS-0.1.17-preview.3-arm64-rollback.zip` | 159,744,957 |

### SHA-256

```text
5be9ed7895ee1577d99aa355d4b0e483bcdc8824383693aea0064a4008297433  ROOMS-0.1.17-preview.4-arm64-current.zip
ea776bf29606dc3b72095f42d4036154c6fc6b18c329191be8b4b16fd44d0cb1  ROOMS-0.1.17-preview.3-arm64-rollback.zip
```

These are fresh **local retention archives** made from the installed application and the saved predecessor. They retain the signed application payload but are not byte-identical to the previously published download archives. They have not been uploaded as GitHub release assets or substituted into the Sparkle feed. Their hashes and local paths above are the recovery inventory.

## Removed in the release cleanup

- Old `release/` ZIP, DMG, blockmaps, Electron Builder metadata and unpacked preview.2 application.
- Seven unpacked historical applications in `.local/delivery/previous-installed/`; preview.3 was archived and verified before its unpacked copy was removed.
- `.local/desktop-delivery/` reference.5 packaging output.
- Generated `dist/`, `dist-electron/`, `dist-native/` and `dist-services/` outputs.
- The three old preview.1–preview.3 delivery folders and the RNNoise prototype build folder in Downloads, containing only obsolete delivery/build artifacts.

The 24 explicitly inventoried targets occupied approximately **5.58 GB**. The two retained archives total **319.49 MB**, giving approximately **5.26 GB net reduction** in inventoried local files. APFS clones/shared blocks can make actual free-space change differ from that estimate.

## Earlier cleanup in the same session

Approximately **725 MB** of disposable files were removed: the completed documentation and Sparkle worktrees (merged through [PR #2](https://github.com/egemenmermer/rooms/pull/2) and [PR #3](https://github.com/egemenmermer/rooms/pull/3)), extracted Node installer archive, Sparkle sample application and SDK debug symbols. The Node runtime/headers and Sparkle framework, tools, license and checksum-pinned SDK archive remain. Branches and commits were retained.

## Verification and preserved state

- Both retained archives were extracted into temporary directories. `codesign --verify --deep --strict` passed on each restored application.
- Restored `Info.plist` and `app.asar` SHA-256 matched the respective source bundle, and version/build metadata matched the inventory above. Source bundles were not resigned; only derived copies omitted extraneous extended attributes and resource metadata.
- A before/after SHA-256 inventory of **942 tracked and untracked non-ignored files** found zero changed, added or missing files for this cleanup. The owner's existing uncommitted development changes remain.
- No process was running from the deleted application/build paths when inventoried. `/Applications/ROOMS.app`, its user profile, credentials, databases, current dependencies and signing/update tools were preserved.
- Historical delivery receipts, logs, documentation, screenshots, tests and legacy implementation evidence remain. Older receipt paths may refer to intentionally removed artifacts; this report is the current local retention inventory.
- Hosted documentation, the live Sparkle appcast/downloads, remote infrastructure and existing GitHub release assets were not changed. This is a local disk cleanup; historical remote release assets remain available.
- No product test suite, typecheck, application journey or rollback installation was performed for this filesystem-only task. Signature/payload checks establish recoverable retained artifacts, not new functional acceptance. See [Sparkle update acceptance](SPARKLE_UPDATE_ACCEPTANCE.md) for the earlier actual upgrade evidence and its limitations.

## Recovery and subsequent development

Quit ROOMS before manually restoring a retained package. Verify the selected ZIP against `release/retained/SHA256SUMS.txt`, extract it with macOS `ditto`, verify the restored application signature, then replace the installed application while preserving the separate user profile. Keep automatic update behavior in mind when intentionally running the older version. This procedure is documented, not executed by this cleanup.

Generated outputs must be rebuilt before running commands that consume `dist*` or packaging paths: the normal application build recreates renderer/Electron outputs; `services:build` recreates service bundles; `scripts/prepare-sparkle.mjs` recreates native Sparkle output with the required SDK/headers. The current `release:mac` command also enables publication (`ROOMS_PUBLISH_UPDATES=1`), so reserve it for an authorized release rather than using it only to recreate deleted output. No implementation code or package configuration was modified.

Retention policy for future local deliveries: keep the latest accepted release and one accepted predecessor, with hashes and signature verification recorded before older artifacts are removed. This report does not install an automatic deletion job.
