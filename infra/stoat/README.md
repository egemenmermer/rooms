# ROOMS Stoat integration

Status: IMPLEMENTED / actual upstream acceptance BLOCKED. This document records implementation and commands; fixture tests are not transport verification.

## Architecture

The existing React/Electron desktop remains the ROOMS client. `packages/social-domain` supplies opaque provider-independent identities. `packages/stoat-adapter` translates official Stoat REST and events to the existing normalized social contract; `community.ts` is the native credential boundary. The old Spacebar package and encrypted session are retained for inspection/rollback, but the active native adapter never restores or sends those credentials to Stoat.

The current official self-host deployment is pinned in UPSTREAM.json. Upstream application source is unmodified. Deployment-only proxy/configuration changes live in an ignored, private `.local/stoat` directory. The official native Stoat voice and web clients are opt-in disabled profiles; ROOMS grants use the existing independent LiveKit transport. Social identity uses ULIDs, not Discord snowflakes. Chat time is decoded from actual message ULIDs.

## Durable invite-only registration

ROOMS signup invitations are different from official Stoat account and community invitations. The public proxy rejects direct `/api/auth/account/create`. A private loopback raw API port (3022) lets the broker perform the official account/create, login, onboarding and community-join calls.

The administrator provisions an upstream account ticket and maps it to an owned signup ticket with an expiry and a community invitation. Only the digest of the owned ticket is stored as its lookup key. The official account and community codes remain private server data. The native client submits the owned code to `/rooms-access/v1/auth/register`; it never needs official account-ticket secrets.

The gate obtains an exclusive file lock and atomically fsyncs `claiming` before any external creation call. Successful use becomes `used`; unsuccessful or uncertain use becomes `failed`. A retry cannot create another account. A process crash preserves claiming/lock state and requires administrator inspection before recovering the lock or issuing a new invitation. Do not reset failed tickets: an upstream account may already exist. This conservative behavior is intentional. The single broker process uses one shared ledger on persistent disk; do not scale independent ledgers.

Public previews resolve only still-available owned tickets and include their actual configured expiry. Rate limits apply to signup and all service routes. An administrator CLI writes a private delivery file instead of printing signup codes.

The v0.15.5 upstream community-invite model has no expiry/max-use fields. Upstream main contains newer fields, but those capabilities are not asserted against v0.15.5. In-app invitation creation uses an owner-authorized broker route, creates the official community invitation privately, provisions a separate account ticket through MongoDB, and returns only an expiring single-use ROOMS ticket. Existing signed-in users can also consume a ROOMS ticket to join. Provisioning requires ROOMS_ACCOUNT_INVITE_MONGO_URL; without it the UI receives a precise unavailable reason. Existing upstream invitations remain inspectable/joinable. None of these paths has yet been exercised against live Stoat.

## Commands

```
node scripts/stoat-setup.mjs
node scripts/stoat-start.mjs
node scripts/stoat-issue-invite.mjs --community-code=YOUR_AUTHORIZED_COMMUNITY_CODE --expires-in=86400
node scripts/stoat-integration.mjs
```

Setup is idempotent and preserves existing keys/configuration. It generates private secrets, replaces upstream example RabbitMQ/MinIO passwords and enables upstream invite_only. All generated files are mode 0600 in a mode 0700 directory. No VM restart, seccomp changes or unrelated Docker changes are performed.

Native LiveKit webhook configuration: `node scripts/stoat-configure-media.mjs`, then restart only the owned SFU process to apply. The script was run, but the existing SFU was not restarted. Container deployments must use their reachable internal broker webhook URL with the same SDK API key.

Public development server: `http://127.0.0.1:3021` (REST /api; websocket /ws; native auth vault provider version 1). Private raw API: `http://127.0.0.1:3022`. Development-only Mongo loopback port:3023. `.local/stoat/broker.env` contains broker configuration. Production provisioning must use a MongoDB service account scoped to insert account_invites, not a general database administrator. Broker uses STOAT_INTERNAL_URL=that private raw origin; deployed container setups use the internal API origin. Public proxy forwards /rooms-access to port3002 and /rooms-activities to port3031. Production hostnames, HTTPS/WSS, Mongo access controls, immutable image digests and deployment credentials must be supplied and verified before release.

Actual verification requires `.local/stoat/test-accounts.json` (private, 0600): base public origin, owner/guest/outsider objects with email/password, spaceId, textId and voiceId. `ROOMS_STOAT_TEST_ACCOUNTS` can select another owned private file. The script verifies actual Ready, memberships, message send/edit/delete events, presence, restore and unauthorized third-user access. It writes only sanitized results. Fixtures are not substituted when the file/runtime is absent.

## Permission enforcement

Media grants fetch actual current user, channel, server and member through official REST. They require a server TextChannel with actual voice configuration, exact membership identity, ViewChannel and Connect. Stoat's ranked role overrides, channel overrides, timeout, moderator can_publish/can_receive and native Speak/Video/Listen flags determine track/source and subscribe permissions. Owners still require correct membership/channel/server identity. Every active grant is rechecked every 10 seconds and permissions updated; lost membership/access removes the participant.

The broker validates LiveKit participant_joined webhooks using the official SDK signature and SHA256 of the exact raw body. Unknown/revoked grants are removed through the SFU API, including old JWT arrivals after a broker restart. Allowed participants receive fresh current permission settings. A reused five-minute JWT can still briefly connect before its webhook is processed; this is bounded asynchronous removal, not instantaneous cryptographic revocation. Ten-second sweeps provide another check. Real two-client media revocation is unverified for Stoat.

## Evidence on 2026-10-08

- Read master brief in full and both reference files before changes.
- Official API/model/protocol source researched on upstream main and specifically v0.15.5; permission precedence compared with pinned tag.
- `docker info --format '{{.ServerVersion}}'`: FAILED, OrbStack Docker socket absent. No runtime changed.
- `node scripts/stoat-setup.mjs`: PASS; created owned private generated configuration, secrets not output.
- `docker compose config --quiet` from `.local/stoat`: PASS; actual containers were not launched.
- `node scripts/stoat-start.mjs`: BLOCKED, Docker unavailable.
- `node scripts/stoat-issue-invite.mjs --community-code=fixture-unverified-only`: BLOCKED, no database runtime; no invitation issued.
- `node scripts/stoat-integration.mjs`: BLOCKED, no actual test account configuration; no fixture treated as success.
- `pnpm typecheck`: PASS during integration; concurrent project changes may require a final rerun.
- `node scripts/build-access.mjs` and `node scripts/build-electron.mjs`: PASS.
- 8 Stoat permission/origin tests + 11 adapter protocol fixture tests + 4 durable registration fixture tests: PASS. Adapter tests include multipart same-origin upload bytes and stable bot reply delivery headers. Signed webhook and unknown arrival removal tests use SDK signatures and a clearly labeled HTTP SFU fixture. Bot mention filtering fixture also passes. These are separate from upstream acceptance.

## Unverified acceptance

Actual account registration/email verification/partial-signup recovery; invite expiry/one-use through the running proxy; two actual account messaging/DM/friends/presence/moderation; attachments/reactions/profile UI; websocket reconnect/Ready refresh and read-state; actual Stoat membership media grants/moderator mute/deafen/revocation; two physical macOS clients; production deployment/signing/restore. No actual Stoat integration or screenshot is claimed.

## Official bot connection

The agent-side Stoat bot connector uses verified official x-bot-token REST authentication and gateway token authentication. It checks that /users/@me identifies a bot, ignores bots/self/ordinary messages, requires actual mention metadata plus an authorized human author, and hands mentions to the agent job boundary. It does not join voice. Upstream v0.15.5 users/rocket.rs and bonfire/websocket.rs were inspected for bot auth behavior; live bot credentials and end-to-end results remain unverified.

## Social capabilities added

Native APIs now support authoritative friends/incoming/outgoing/blocked relationships, official username#discriminator friend requests/removal, self display-name/bio/status edits, message reaction add/remove with gateway refresh, attachment metadata and controlled uploads. Attachment choice uses an explicit native file dialog, supported media/document extensions, a 25MiB nonempty limit and a bounded descriptor read that rejects changing files. Uploaded IDs are scoped to the selected conversation and cleared when switching accounts; raw paths never cross preload. Discarding a selected attachment releases its native send capability; upstream owns cleanup of unused uploaded bytes. Attachment-only messages are allowed. Autumn's discovered URL must have the exact configured Stoat origin, no credentials/query/fragment, before receiving session headers or bytes. Renderer download metadata contains only same-origin public attachment paths from upstream, never a bearer token.

Presence starts from actual Ready online flags and official UserUpdate events. Native presence subscriptions are sent only while the main window is focused, renew at most once per 10minutes and enforce upstream's 5active/15minute limits. This implementation does not prove live presence without actual two-client tests.

Permission role precedence follows pinned upstream for distinct ranks. Equal-ranked conflicting overrides have ambiguous upstream HashMap order, so the broker conservatively treats denies as winning within that rank rather than risk granting excess voice permissions. Fixture tests cover both member role orders.

Social/profile/reaction/upload happy paths have protocol fixtures and native compile/build checks, but no actual Stoat server was available. Do not mark these features VERIFIED until the live integration script and actual desktop UI exercise them.

## Authoritative read restoration

Pinned v0.15.5 [sync route](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/sync/get_unreads.rs) returns authenticated own channel records through `/sync/unreads`. The [ChannelUnread model](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/models/src/v0/channel_unreads.rs) contains `last_id` and mention message IDs, not a total unread count. Native `readStates()` returns normalized `SocialReadState` records. Every actual Ready/reconnect fetches these records and emits `READ_STATE_SYNC`; current-user ChannelAck and successful native acknowledgement refetch them. Other users' acknowledgements do not overwrite own read state. Channels expose their actual `last_message_id` as `lastMessageId`.

A missing record or failed/unsupported sync is unknown, never an invented zero count. Failure emits `READ_STATE_UNAVAILABLE`. No local storage is used to claim upstream restored unread state. Protocol fixtures cover own-user filtering, the official acknowledgement route, post-ack authoritative refetch and invalid-response failure. Actual reconnect/read synchronization still requires the unavailable live Stoat runtime. Native incoming-message notification checks an existing signed-in user and normalized string `author.id`, excluding own messages; it does not inspect raw provider author fields.
