# Owner-reported room corrections — 2026-10-11

The owner's live Discord screenshots supersede the package's S19/S20 appearance for production voice rooms. The implementation uses a black stage, centered horizontal 16:9 participant tiles, compact grouped controls, a red leave button, and local participants listed beneath their voice channel. Actual media-provider speaking events drive green avatar/tile outlines; no simulated speaking state is added to production. Camera rendering contains the actual source instead of stretching it. Single-person rooms expose working invite/activity actions. Original package fixtures retain their old comparison layout unless the explicit development `roomLayout=discord` flag is supplied. This is not a claim of pixel-identical Discord reproduction.

Home recent-conversation and private-sidebar avatar sizing now overrides broad span-flex rules. The live Home title is utilitarian. Unsupported channel-description/category/private-creation controls are omitted from the live creation dialog; fixture controls remain isolated. A successful native channel mutation followed by a failed list refresh now preserves the server-returned channel and reports a refresh warning, rather than suggesting that creation failed. The exact owner-reported remote channel failure has not been reproduced. Read-only server logs included successful channel creation, so this regression guard addresses a plausible post-write failure without claiming a proven diagnosis.

Read-only inspection of the deployed activity bundle found an older strict game.create schema without the current Holdem options. The desktop preserves a bounded public error code across Electron IPC and explains INVALID_COMMAND as a service-version incompatibility. It does not silently discard chosen table settings. Opening a different creation dialog clears the previous action error. The deployed service is unchanged and still requires a separately authorized update; private-call endpoint availability also remains open. Real-Debrid requires the application's registered public client ID in the packaged native runtime; its missing-registration copy now identifies that accurately. No provider authorization or playback is claimed.

## Observed local verification

- Focused native activity, channel post-write refresh and private-call lifecycle tests: 18 passed (session89521). Earlier focused Stoat/activity checks: 26 passed (session3422).
- Final production build/typecheck: session1753, exit0. Existing chunk-size warnings remain.
- Actual Chromium development-component captures at1440×900 and950×650: session6794, no page errors or horizontal overflow. Single-person tile geometry568×319.5 and427×240.1875 respectively. Camera toggle was exercised against the isolated development media adapter, not a physical camera or a remote call.
- Private local captures: `.local/design-review/discord-room-1440.png`, `discord-room-950.png`, plus prior five-participant/camera/avatar captures. Original Discord screenshots were reviewed alongside these; remaining visual differences are not accepted.
- Production fixtures, real two-client microphone/camera/screen transport, OS permissions, Windows, signing and owner acceptance are not established by these checks.

The owner revoked all delegation. Root performs all subsequent implementation and review. No server restart/deployment, main merge, release replacement, credential change or Hoppers change occurred.

An intermediate build session88702 passed TypeScript/Vite but failed while collecting dependency notices because `pnpm list` reported a transient SQLite database-open error. A full rerun session1753 exited0, including notices/native bundling. No source workaround or dependency change was introduced.
