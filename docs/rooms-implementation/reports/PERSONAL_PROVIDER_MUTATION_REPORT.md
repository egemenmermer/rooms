# S34/S37 native personal provider updates and authorization cancellation

Status: IMPLEMENTED BUT UNVERIFIED for real native UI, provider authorization, OS encryption, stream playback and Windows behavior. Focused mocked local boundary checks pass. No production request or owner manual acceptance was performed.

## Contract and persistence

- `rooms:provider-playlist-update`: strict `{ id, name, url?, token?, xmltvUrl?: string | null }`. Omitted source and XMLTV fields preserve private existing values; null clears XMLTV. URL and file token cannot be supplied together. Native file tokens are parsed/consumed through the existing private import boundary.
- `rooms:provider-xtream-update`: strict `{ id, name, serverUrl?, username?, password? }`. Omitted credentials preserve existing secrets; supplied replacements must satisfy existing bounds and URL rules. The real personal network helper fetches/parses candidate channels before saving.
- Every update operates on a separate candidate record/list. It compares current session/identity and the original connection object across asynchronous fetch/body work. Fetch/parser/validation/persistence failures preserve the old record, cache and playback capabilities. A successful encrypted save publishes the candidate and revokes the previous connection's playback handles.
- URL/Xtream additions use the same save-before-publish boundary. Disconnect saves the resulting vault before removing in-memory records/capabilities; failed saves preserve the old local connection. Upstream RD access-token revocation is attempted only for an actual connected RD account and is not claimed successful when unavailable.
- Successful RD device grants replace existing RD records atomically, preserving the prior primary ID/resume data and removing stale RD library/playback capabilities only after encrypted save. Cancellation leaves existing connected credentials untouched.

## Account privacy

`setupProviders(assertSender, scopeIdentity?, stableIdentity?)` takes the root's epoch/server/user session callback and a separate stable server/user identity callback. The default stable identity is null and grants no private provider access.

- Private encrypted records are stored in `personal-providers-v2-<SHA256(stableIdentity)>.bin` under userData. The filename contains no raw server URL or account ID. Different servers with equal user IDs are isolated. Session epochs never form the persistent partition.
- Legacy `personal-providers-v1.bin` is never read, migrated, overwritten or deleted. Existing owners must reconnect their personal providers in the current ROOMS identity. This prevents silently assigning an unscoped vault to whichever account signs in first.
- Every native provider IPC refreshes the composite session/identity before use. Changes invalidate private maps, channel/library caches, playback handles, in-flight RD attempts and playlist selection capabilities; only the current identity's vault is restored. Signed-out status returns an empty list and other provider commands fail with a precise signed-in-account reason.
- All async add/update/channel/XMLTV/disconnect/RD refresh/library/auth operations check the captured session before publishing cache, persistent state or renderer results. Epoch changes invalidate old work even when the owner later signs back into the same account.
- Playback handles carry the captured session. Protocol requests refresh scope even without later IPC. Fetch/body/HLS handle registration and every streamed chunk are fenced, preventing a prior account's stream from publishing after the current identity changes.
- A restored remote playlist/Xtream record has `status: error` and channelCount 0 until its channels are fetched and parsed again. Vault restoration is not network, provider authorization or playback readiness evidence. RD status only reflects stored credential expiry, not a fresh upstream account check.

## RD pending attempts

`rooms:provider-rd-cancel` takes no arguments. It increments an attempt generation and clears pending device state. Start/poll capture generation plus composite identity; every fetch, response-body and browser-launch boundary checks the captured attempt. Canceled, superseded, disconnected-session or expired grants cannot persist when old promises finish later. Poll retains `pending | connected | expired`, with precise cancellation/account-change errors for stale in-flight work.

Cancellation is local to the pending login attempt. No unsupported device-code revocation endpoint or upstream revoke success is claimed. Starting a newer login supersedes previous pending/in-flight attempts. The registered public client ID is captured per attempt rather than reread during a later poll.

## Executed checks

Command: `pnpm exec vitest run --config vitest.config.ts tests/provider-connections-ipc.test.ts`.

- First combined run with the prior file-import suite: old file suite 13/13 passed; new mutation suite 7/10 passed, with three new test failures and one unhandled rejection caused by queued mock responses leaking between loop iterations and insufficient waiting for the token boundary. Reset mocked requests per loop and await the actual mocked token call before cancellation; no production bypass was introduced.
- Subsequent native mutation runs passed at 10/10, 16/16 and 19/19 as privacy/body/refresh coverage was added.
- Final mutation run: **20/20 passed**, one file passed, 740 ms, tool timestamp 02:32:35 on 2026-10-11.
- Final combined command: `pnpm exec vitest run --config vitest.config.ts tests/provider-connections-ipc.test.ts tests/playlist-file.test.ts`; **33/33 passed**, two files passed, 755 ms, tool timestamp 02:33:14.

Mocks cover Electron IPC/dialog/browser launch, file descriptors, encrypted read/write/rename and the personal fetch helper. Assertions exercise:

- Omitted-secret preservation and metadata-only receipts; XMLTV clearing; strict input/type rejection; actual file-parser token updates and replay rejection.
- Fetch/parser/persistence failure atomicity and old playback preservation; successful revocation; concurrent update/disconnect and account-change discard.
- Start cancellation before a device receipt and during browser launch; credential/token/body cancellation; superseded polls; grant persistence failure; existing-account preservation and successful reconnect replacement.
- V2 hashed partitioning, no legacy v1 access, equal user IDs on different servers, signed-out denial and epoch ABA.
- Scope-fenced URL/Xtream adds, channels, XMLTV, RD library and token refresh; unrelated provider disconnect preserving RD library.
- Old protocol handles rejected without subsequent IPC and streamed chunks rejected after scope change.

## Remaining acceptance and ownership

Only providers.ts, the new mutation IPC test file and this report changed in this continuation. Root owns contracts/preload/main/renderer/tracker, previous file-test integration, integrated type/build checks and final review. No commit, deployment, actual remote request, UI opening or real-account verification was performed by this implementer. Owner acceptance still needs real chooser/save/restart behavior, authorization cancellation UX, personally authorized provider updates/playback and target-platform validation.
