# Separate ROOMS agent host

Run the agent exclusively on its separate Linux Hetzner host. The desktop sends authorized tasks and receives progress and results. This host must have no core database credentials, personal IPTV/Real-Debrid vault, desktop filesystem mount, or attachment to the core private network. No production host or external credentials were supplied for this implementation.

## Install and provision

Build with `pnpm services:build`. Install Node.js and Docker on the dedicated host, and run `dist-services/agent.cjs` as a dedicated service user with **UID 10001**. Provision `/var/lib/rooms-agent` owned by that user with mode 0700. Workspace, model-home and browser-profile bind mounts use UID 10001 in containers; root-owned mode-0700 directories will fail. The host service needs Docker access, which is a privileged host capability. Never mount the Docker socket into workers or expose the service to arbitrary clients.

Build the worker using `docker build -t rooms-agent-worker:local -f infra/agent/worker.Dockerfile infra/agent`. The image specifies official Codex 0.161.0, Claude Code 2.1.293 and Playwright 1.64.0. Resolve and pin approved base-image digests before production deployment. The image has not been built or exercised on the separate Linux host in this session.

Use a TLS reverse proxy and leave the service on loopback port 3041. `SERVICE_HOST` and `AGENT_PORT` override those defaults. Supply these private values:

- `ROOMS_AGENT_STORAGE_KEY`: persistent random 32-byte hex encryption key, outside source control.
- `ROOMS_AGENT_AUTH_FILE`: mode-0600 JSON array of grants `{userId,roomIds,canManage,tokenSha256,enabled}`. Issue distinct random 256-bit bearer tokens privately; store SHA-256 hashes here. Grants are reread for HTTP authorization, execution and notification delivery.
- `ROOMS_AGENT_DATA`: optional mode-0700 data directory, default `/var/lib/rooms-agent`. Its encrypted atomic store contains connections, tasks, checkpoints, memory, outbox and audit.
- `ROOMS_AGENT_WORKER_IMAGE`: optional image, default `rooms-agent-worker:local`.
- `ROOMS_AGENT_POLICY_FILE`: optional mode-0600 JSON policy, shown below. Missing policy disables worker networking and external connector scopes.
- `ROOMS_AGENT_CONNECTORS_FILE`: optional mode-0600 JSON containing dedicated bot credentials and exact repository/folder allowlists. These tokens never enter prompts, renderer projections or worker mounts.

Example policy:

```json
{
  "version": 1,
  "networkName": "rooms-agent-egress",
  "egressVerified": false,
  "allowedResearchHosts": ["example.org"],
  "browserHosts": ["example.org"],
  "connectorScopes": ["github.read", "github.write", "drive.read", "drive.write"]
}
```

Example connector configuration:

```json
{
  "githubToken": "DEDICATED_BOT_TOKEN",
  "githubRepositories": ["organization/repository"],
  "driveOAuth": {
    "clientId": "BOT_OAUTH_CLIENT_ID",
    "clientSecret": "BOT_OAUTH_CLIENT_SECRET",
    "refreshToken": "DEDICATED_BOT_REFRESH_TOKEN"
  },
  "driveFolderIds": ["AUTHORIZED_FOLDER_ID"]
}
```

These are examples, not supplied credentials. Drive can use dedicated `driveOAuth` credentials or a `driveToken` access-token fallback. OAuth refresh uses only `https://oauth2.googleapis.com/token`, refuses credential redirects, bounds response size and token expiry, and caches access tokens only in service memory until shortly before expiry. Refresh credentials never enter model arguments, projections or worker mounts. An API rejection invalidates the cache without automatically retrying a potentially mutating operation. Access-token-only configuration reports expiration/revocation precisely; replace that private token when required. GitHub supports scoped content reads, issues, file writes with expected commit SHA, and draft pull requests. Drive supports listing/reading in allowed folders and creating text files. Capability metadata reflects configured scopes, not live-provider verification.

Follow [Google's official OAuth offline-access flow](https://developers.google.com/identity/protocols/oauth2/web-server#offline). Provision a Google OAuth client and authorize the dedicated bot account administratively using Google's supported consent flow with offline access and the minimum Drive scope suitable for its allowed folders. Put the resulting client ID, client secret and refresh token only in the mode-0600 connectors file; ROOMS does not provide a browser consent callback or collect these values from the renderer. Revoke or rotate them through the Google account/project when needed, then restart the service. Configured folder allowlists remain mandatory after refresh. OAuth consent, token refresh and Drive calls have not been tested against a live account.

## Restricted networking

Code containers default to `--network none`. Official CLI login/execution and browser tasks require `ROOMS_AGENT_WORKER_NETWORK=enabled` plus `egressVerified:true`. Startup accepts only the internal `rooms-agent-egress` network with bridge name `br-rooms-agent`.

Set `ROOMS_EGRESS_HOSTS_FILE` to a mode-0600 JSON array of exact HTTPS hostnames, then run `docker compose -f infra/agent/compose.yml up -d --build`. This starts the restricted CONNECT proxy with an internal worker network and separate uplink. No host port is published. Include required provider/login, research and browser hosts; wildcards are unsupported. The proxy accepts port 443, pins DNS-resolved public IPs, rejects private/reserved destinations and limits connections/timeouts. Worker environment variables and Chromium use `http://rooms-egress:3128`.

**Docker's internal network is only part of the policy.** Configure the host firewall to drop INPUT from `br-rooms-agent` and deny worker forwarding/direct egress except established replies and TCP 3128 to the proxy's internal address. Cover IPv4, IPv6, bridge traffic and host gateways. Keep proxy uplink separate from worker membership. Verify from a worker that direct public-IP connections, host/private/link-local addresses, non-allowlisted hosts, non-443 tunnels, UDP and core addresses fail, while approved proxy HTTPS succeeds. Set `egressVerified:true` only after recording these checks. Startup validates topology; it cannot certify firewall rules. No live host firewall or egress test was performed here.

Host-broker research uses exact host allowlists, DNS-pinned public-address checks, bounded reads and redirect checks. Connectors stay on provider API hosts with exact repository/folder scopes. Workers drop capabilities, prohibit privilege escalation, cap CPU/memory/processes, use read-only roots and bounded temporary storage, and mount only the task workspace and, for CLI tasks, the initiating model's private auth home.

## Model accounts and tool availability

Each user owns their connection. OpenRouter keys are encrypted at rest. OpenRouter tasks use the durable broker tool loop for scoped files, isolated code, approved research, persistent bot-browser actions and configured GitHub/Drive operations. Every model/tool step rechecks current room/user access. Saved connection status indicates configuration; successful live invocation proves provider access.

For Codex/Claude subscriptions, the account owner runs official login on the dedicated host as UID 10001:

```sh
node scripts/agent-model-login.mjs codex OWNER_ID CONNECTION_ID
node scripts/agent-model-login.mjs claude OWNER_ID CONNECTION_ID
```

The helper uses the internal network and proxy, preserving separate official auth homes per owner/connection. ROOMS does not collect OAuth session tokens or account passwords. Check providers' supported login/subscription policies. Cached auth-file presence does not prove current authentication. Never pool subscriptions.

**Official CLI tasks do not use the OpenRouter broker's GitHub/Drive or persistent bot-browser tools.** They execute the CLI's native code/research behavior within the isolated workspace and configured network. These are separate capabilities. Live provider login/execution remain unverified.

## Approval, resume and memory

Authorized managers control global YOLO. It skips confirmations within configured scopes and cannot add connections, mounts or permissions. Normal tasks require initial approval and per-operation approval for mutations such as file writes, code, browser actions and external writes. Approval resumes the exact saved operation. Reads still recheck authorization.

Encrypted checkpoints retain model messages and operation ledgers before side effects. Completed operations are reused on resume. Safe interrupted reads can resume; started or uncertain writes become interrupted and require `record-result` or `confirm-not-applied` reconciliation for the exact operation ID. Check the external system before confirming non-application. There is no blind retry. Official CLI invocations likewise use a durable ledger and manual reconciliation after uncertain execution. Cancellation aborts HTTP work and explicitly removes isolated workers.

Single-shot schedules persist and recheck room access and model ownership. Completed tasks stay completed. Prompts/results addressed to the bot enter room-scoped memory; ordinary messages require explicit manual save. Authorized room users can inspect/delete that room's memory.

One persistent isolated bot-browser profile uses a serialized action queue. DOM/cookies can persist between actions/tasks; the profile is not mounted into code/CLI workers. Actions require configured HTTPS hosts; password/token-field fills are rejected. Provision bot authentication administratively: an interactive browser-login setup flow is not implemented. Real Linux browser behavior remains unverified.

## Mention-only bot delivery

Optional dedicated accounts use `ROOMS_STOAT_BOT_URL`, `ROOMS_STOAT_BOT_TOKEN`, `ROOMS_STOAT_BOT_MAPPING_FILE`, and/or `ROOMS_DISCORD_BOT_TOKEN`, `ROOMS_DISCORD_BOT_ID`, `ROOMS_DISCORD_MAPPING_FILE`. Mapping files are mode-0600 JSON arrays:

- Stoat: `{authorId,channelId,userId,roomId,modelConnectionId}`.
- Discord: `{discordAuthorId,channelId,userId,roomId,modelConnectionId}`.

Only mapped authorized mentions enqueue work. Bots do not join voice or ingest ordinary messages. Adding author identities requires gateway restart; changes/revocations are reread for every mention and delivery. Immutable source author/channel/message are stored with the task and must still match the current mapping and grant for delivery.

The durable outbox records approval requests, results and failures before official bot API replies. Stable nonce/identifiers help bounded provider deduplication but do not guarantee durable exactly-once delivery. Failure after send becomes uncertain and is not automatically retried; restarted sending entries likewise become uncertain. Inspect authorized `/v1/outbox?roomId=...` and reconcile manually. Production accounts and live delivery were not tested here.

## Ordinary-message reminders

`POST /v1/reminders` accepts `{roomId,channelId,sourceMessageId,text,runAt}`. This explicit exact note/time/source submission authorizes a single reminder; it needs no model connection or model approval. Tasks have `kind:reminder` and an empty legacy model-connection field. The service verifies the current user's room grant and Stoat mapping, official bot identity, and exact source message before creation, due processing and delivery. Per-user status exposes `stoat-reminders` only when a current mapped bot configuration is available.

The reminder replies to the original message through the durable outbox. It does not invoke a model or save ordinary message contents or reminder text to bot memory. Scheduled and pending entries survive restart; sent entries stay completed. A pending cancelled reminder is never sent, and revoked mapping/access or deleted source stops delivery. Cancellation after transmission begins cannot recall a remote message. Sending/unknown outcomes remain interrupted without automatic retry; bounded upstream nonce deduplication does not imply network-level exactly-once delivery. Check the source chat before creating a replacement for an uncertain reminder. Real bot delivery remains a deployment acceptance gate.

## Evidence and remaining deployment gates

Actual local HTTP tests cover authority, room/user model ownership, encrypted persistence, approval/resume, uncertain-write reconciliation, YOLO scope limits, schedules, mentions and uncertain outbox handling. Tool-loop tests inject a named model transport; connector tests inject provider HTTP responses. They prove kernel behavior, not live OpenRouter, GitHub, Drive, CLI, bots, Docker or browser integration.

Before production acceptance, record the actual host image build, UID/mount permissions, firewall rejection matrix, each live model/tool invocation, bot mentions/replies, browser persistence, cancellation, uncertain-operation recovery and encrypted-backup restore. Back up encrypted data and its key separately. Local tests do not imply deployed Hetzner operation or verified external integration.
