# Host your own ROOMS community

[← README](../README.md) · [User guide](USER_GUIDE.md) · [Troubleshooting](TROUBLESHOOTING.md)

## Contents

- [What you are hosting](#what-you-are-hosting)
- [Requirements](#requirements)
- [1. Get the source](#1-get-the-source)
- [2. Prepare the social backend](#2-prepare-the-social-backend)
- [3. Configure LiveKit](#3-configure-livekit)
- [4. Configure and start ROOMS services](#4-configure-and-start-rooms-services)
- [5. Bootstrap accounts and invitations](#5-bootstrap-accounts-and-invitations)
- [6. Connect a desktop client](#6-connect-a-desktop-client)
- [7. Make the deployment reachable](#7-make-the-deployment-reachable)
- [Optional services](#optional-services)
- [Data and backups](#data-and-backups)
- [Operational checks](#operational-checks)
- [Before inviting other people](#before-inviting-other-people)

## What you are hosting

One operator hosts the backend; members run desktop clients. You do not need to give every member Docker, database access, or service secrets.

| Component | Responsibility | Needed for |
| --- | --- | --- |
| Stoat stack | Accounts, chat/events, uploads, and social data | Community login and chat |
| ROOMS access | Membership checks, signup broker, short-lived media grants | ROOMS signup and voice authorization |
| LiveKit | Realtime media signaling and transport | Voice, video, screen sharing |
| ROOMS Activities | Authoritative shared activity state | Activities and games |
| Music worker | Community queue/source handling | Optional DJ |
| Agent host | Scoped workers and task state | Optional Agent |
| Reverse proxy | Public HTTPS/WSS routes | Remote use |

This guide describes the current source and setup boundaries. It is **not a one-command production deployment**. In particular, first-account/community provisioning is an upstream administration step; this repository does not automate it. Do not advertise an untested installation as ready for members.

The local walkthrough uses loopback addresses. Complete the public-network steps before connecting from another computer. Use a fresh machine or isolated environment first; do not run setup against an existing live volume without a backup and compatibility review.

## Requirements

- A host you administer, with persistent storage and an appropriate firewall.
- Git, Node.js **22.22.0**, and pnpm **11.25.0**.
- Docker Engine with Docker Compose for the pinned Stoat stack.
- A LiveKit server compatible with the client and server SDKs in the lockfile.
- TLS/reverse-proxy and public media-network configuration for remote clients.
- Capacity monitoring and an independent backup location.

No particular CPU/RAM tier or user count is certified here. Measure media bandwidth and server load with your intended number of publishers/viewers. Optional music and Agent workloads have separate resource needs.

## 1. Get the source

```sh
git clone https://github.com/egemenmermer/rooms.git
cd rooms
pnpm install --frozen-lockfile
pnpm services:build
```

Keep commands in the repository root unless stated otherwise. `dist-services/` contains the built service entry points. Installing dependencies does not start any server.

## 2. Prepare the social backend

ROOMS uses an **unmodified** Stoat deployment pinned by [UPSTREAM.json](../infra/stoat/UPSTREAM.json). Do not silently substitute upstream `main` for that pin. The setup helper downloads the pinned deployment files and creates private configuration:

```sh
pnpm stoat:setup
```

Generated files live in ignored `.local/stoat/`, including `compose.yml`, `Revolt.toml`, service environment files, and secrets. The helper enables invite-only registration and a public proxy that blocks direct upstream account creation. It preserves an existing `Revolt.toml`; rerunning it is not an upgrade or configuration migration.

Inspect the generated configuration locally without copying secrets to an issue. Then validate it:

```sh
docker info
# Run from the repository root:
docker compose --project-directory .local/stoat config --quiet
node scripts/stoat-start.mjs
```

The start helper launches the selected social services, not ROOMS access, Activities, or an independent ROOMS LiveKit instance. Upstream web/native voice profiles are disabled by default. See [integration details](../infra/stoat/README.md).

### Local addresses

| Address | Purpose | Exposure |
| --- | --- | --- |
| `http://127.0.0.1:3021` | Public-facing local Stoat proxy; API `/api`, events `/ws` | Loopback during setup |
| `http://127.0.0.1:3022` | Raw upstream API for the broker | Private only |
| `127.0.0.1:3023` | Development MongoDB mapping | Private only |
| `127.0.0.1:3002` | ROOMS access service | Behind proxy |
| `127.0.0.1:3031` | Activities service | Behind proxy |

For Docker-to-host proxying, generated `.env.web` uses `host.docker.internal`. Verify that this name and the host binding work in your Docker environment. If services move into containers, replace the upstreams with their actual internal service names and reachable bindings. A loopback-only listener may not be reachable from a Linux bridge container. Do not solve that by publicly exposing internal APIs or databases.

## 3. Configure LiveKit

Install/run the official LiveKit server using its [self-hosting documentation](https://docs.livekit.io/transport/self-hosting/). Supply your own configuration; a public client URL and an internal service URL have different purposes.

For an isolated native local server, create an ignored `.local/livekit.yaml` like the example below. **Replace both placeholders with an independently generated key/secret before starting it.** This is an example, not a usable credential pair.

```yaml
port: 7880
bind_addresses: ["127.0.0.1"]
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50020
  use_external_ip: false
keys:
  YOUR_LIVEKIT_API_KEY: YOUR_LIVEKIT_API_SECRET
webhook:
  api_key: YOUR_LIVEKIT_API_KEY
  urls:
    - "http://127.0.0.1:3002/v1/media/webhook"
```

```sh
livekit-server --config .local/livekit.yaml
```

Keep the file readable only by the service account. Use the **same** key/secret in ROOMS access. Configure the signed webhook to reach that service from the LiveKit runtime: container deployments cannot necessarily use the native-host loopback URL above.

This loopback configuration is not suitable for remote callers. Public deployment needs a reachable advertised IP, WSS signaling, appropriate TCP/UDP ports, and a tested NAT/TURN design where required. LiveKit API secrets stay on the server; clients receive short-lived grants.

Historical local helpers under `scripts/livekit-*` expect private files under `infra/local/`. They are verification conveniences, not the deployment recipe in this guide. Inspect their expected inputs before using them; the explicit configuration above avoids relying on historical generated files.

## 4. Configure and start ROOMS services

Create an ignored directory and copy the environment checklist:

```sh
mkdir -p .local/soundboard .local/activities
cp infra/templates/core.env.example .local/core.env
```

On PowerShell, use `New-Item -ItemType Directory -Force` and `Copy-Item` for the equivalent filesystem steps. Edit `.local/core.env` locally. Do not commit it.

| Setting | Meaning |
| --- | --- |
| `SERVICE_HOST` | Bind address; keep services private and proxy only intended routes |
| `PORT` / `ACTIVITY_PORT` | Access / Activities ports; defaults 3002 / 3031 |
| `STOAT_INTERNAL_URL` | Private raw API origin; local setup uses `http://127.0.0.1:3022` |
| `LIVEKIT_INTERNAL_URL` | LiveKit address reachable by access; local `http://127.0.0.1:7880` |
| `LIVEKIT_PUBLIC_URL` | Client-reachable media URL; local `ws://127.0.0.1:7880`, remote `wss://…` |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Your matching LiveKit credentials |
| `ROOMS_SOUNDBOARD_DIRECTORY` | Writable persistent soundboard directory |
| `ROOMS_ACTIVITY_DATA` | Writable file-backed activity directory when PostgreSQL is not configured |
| `ROOMS_ACTIVITY_DATABASE_URL` | Optional Activities PostgreSQL connection string |
| `ROOMS_REGISTRATION_INVITES_FILE` | Persistent signup ticket ledger |
| `ROOMS_ACCOUNT_INVITE_MONGO_URL` | Scoped Mongo connection for account-invite provisioning |
| `ROOMS_SOCIAL_READ_MONGO_URL` | Optional scoped social authorization reader connection |

For local signup, add the following paths/settings to your private environment; the generated broker configuration in `.local/stoat/broker.env` is a reference for them. Node does not load it automatically:

```dotenv
ROOMS_REGISTRATION_INVITES_FILE=.local/stoat/registration-invites.json
ROOMS_ACCOUNT_INVITE_MONGO_URL=mongodb://127.0.0.1:3023/revolt
```

The loopback development Mongo URL is not a production credential strategy. Provision scoped database service accounts for production; account-invite insertion does not require general administrator access. Keep existing encryption keys stable when optional services use encrypted stores.

Run each service in its own terminal, from the repository root:

```sh
node --env-file=.local/core.env dist-services/access.cjs
```

```sh
node --env-file=.local/core.env dist-services/activities.cjs
```

The same environment can supply shared values, while each process uses its own port setting. Node does not implicitly load arbitrary `.env` files. For production, use supervised services with a dedicated OS user, explicit working directory/environment, writable data directories, and restart limits.

## 5. Bootstrap accounts and invitations

**This is a required operator step, not an automatic result of setup.** The invitation-issuing script needs an existing authorized upstream community invitation. It does not create the first administrator or community.

1. Bootstrap your first account, community, and channels using the pinned upstream deployment's supported administrative/API process. Consult the pinned deployment's generated `.local/stoat/Guides.md` and upstream API documentation. Configure mail/recovery if your account flow needs it.
2. Obtain a community invitation for the community you own. Keep it private. The public ROOMS proxy deliberately blocks raw account creation; do not leave a temporary bootstrap bypass exposed.
3. Confirm the configured ROOMS access broker and persistent ticket ledger are available.
4. Issue a ROOMS signup ticket:

```sh
node scripts/stoat-issue-invite.mjs --community-code=YOUR_AUTHORIZED_COMMUNITY_CODE --expires-in=86400
```

Replace the placeholder with your authorized upstream invitation. The script uses the owned Docker Compose database runtime, inserts an upstream account invitation, and stores a digest-keyed ROOMS ticket. It writes a private `.local/stoat/signup-invite-*.json` delivery file instead of printing the signup code.

The delivery file has a local `serverUrl`; for remote delivery, use your actual public community URL. Send the intended member the correct server address and ROOMS ticket privately. Do not publish tickets or upstream invite codes in GitHub docs or screenshots.

A ticket is single-use and expiring. A crash or uncertain upstream result leaves `claiming`/`failed` state for inspection. Check whether an account was created before recovering a stale lock or replacing the invitation. Do not turn uncertain tickets back into available tickets blindly. Run one authoritative broker/ledger; independent replicas with separate ledgers are not a supported way to scale signup.

The detailed integration notes record upstream acceptance gaps. Do not treat documentation of the API path as proof that your first-account/registration flow has been tested.

## 6. Connect a desktop client

Run or install a compatible desktop build. Enter the local proxy URL for same-machine development, or your actual public HTTPS origin for remote members. Use the account/invitation from the previous step.

`VITE_ROOMS_DEFAULT_SERVER` can optionally prefill a server address at **build time**. It is not required and must not contain credentials. Saved server preferences and invitation links remain relevant. See [development](DEVELOPMENT.md) and [user guide](USER_GUIDE.md).

Test text messages with two accounts before testing voice. Then join a voice-enabled channel with proper membership, ViewChannel, Connect, and publishing permissions. An ordinary text channel without voice configuration is not enough for a voice grant.

## 7. Make the deployment reachable

Use your chosen public origin and configure matching advertised HTTPS/WSS URLs in the backend. A domain is a convenient option; if using an IP address, you still need a client-trusted TLS setup. Remote insecure WS is rejected by the client.

The public proxy must preserve the deployment's Stoat API/events/uploads routes and forward these ROOMS paths:

| Public path | Internal target | Notes |
| --- | --- | --- |
| `/api/*`, `/ws`, upload/proxy paths | Pinned upstream routes | Keep the direct-account-creation block |
| `/rooms-access/*` | Access port 3002 | Strip `/rooms-access` before forwarding |
| `/rooms-activities/*` | Activities port 3031 | Strip `/rooms-activities` before forwarding |
| `/rooms-branding/*` | Your decorative static assets | Optional customization |

LiveKit signaling has its own configured client-reachable endpoint. Common local port values are 7880 for signaling, 7881 for media TCP, and 50000–50020 for the example UDP range. Production rules must match your actual configuration; an HTTPS proxy alone does not make UDP media reachable.

Keep raw API, MongoDB, Redis, RabbitMQ, object-store administration, and service secrets private. Supply scoped service credentials and trusted internal networking. Pin and record container digests before relying on a production installation; the source pin file does not claim image digests were verified.

## Optional services

Add these only after core login, chat, permissions, and media work:

- **Music:** [native worker notes](../infra/music/README.md), [Compose fragment](../infra/music-compose.fragment.yml), and [Java source bridge](../apps/services/music/youtube-bridge/README.md). Configure an independent matching worker secret, approved sources, and Java 17/Maven or native artifacts where required. Compiling the bridge is not proof that a provider accepts playback.
- **Agent:** follow [Agent deployment](AGENT_DEPLOYMENT.md). Use an isolated Linux host with explicit model/resource grants. The host does not need core database or personal provider vault access.
- **Download portal:** the source is under `apps/distribution/`. Set `ROOMS_DISTRIBUTION_ORIGIN` and provision your own private invitation/release ledger. No maintainer download origin is supplied.
- **Branding:** serve your own [community manifest](CUSTOMIZATION.md) for DJ name/poster/animation. Branding is decorative, not a playback integration.

## Data and backups

| Data | Where to look | Recovery requirement |
| --- | --- | --- |
| Social accounts/messages | Stoat database volumes | Compatible upstream backup/restore |
| Uploads | Stoat object-storage volumes | Back up together with relevant metadata/keys |
| Signup state | `ROOMS_REGISTRATION_INVITES_FILE` and its operational lock state | Preserve consumed/uncertain states |
| Activities | `ROOMS_ACTIVITY_DATA` or PostgreSQL | Restore a compatible serialized state |
| Soundboard | `ROOMS_SOUNDBOARD_DIRECTORY` | Preserve assets and ownership |
| Optional Agent/configuration | Its configured data directory and encryption key | Preserve encrypted data and matching key separately |

For Activities, PostgreSQL initialization creates the current `rooms_activity_state` table on startup. This is not a complete versioned migration/downgrade system. Use one authoritative Activities process; shared PostgreSQL does not by itself make independent command processors safe.

Record source SHA, configuration version, upstream images, data paths, and backup timestamp. Restrict access to backups; they can contain credentials and personal data. Store copies away from the host and test restoration into an isolated environment. Never use `docker compose down -v` as routine troubleshooting.

Before an upgrade, stop or quiesce writers as needed, take a consistent backup, and review serialized-state compatibility. Rolling back code without compatible data is not a complete rollback plan.

## Operational checks

With services running locally:

```sh
curl --fail http://127.0.0.1:3002/health
curl --fail http://127.0.0.1:3031/health
```

These are service probes, not full acceptance tests. Monitor process restarts, disk/backup age, database health, API errors, websocket disconnects, media bitrate/loss/latency, and network egress. Keep logs free of passwords, tokens, private message contents, and personal media URLs.

`pnpm stoat:verify` requires explicitly owned disposable accounts in a private JSON file; see [integration details](../infra/stoat/README.md). Verification harnesses may create data or need historical private inputs. Read their scope before running them and never point them at someone else's live community.

## Before inviting other people

- Two actual accounts can register/sign in and exchange messages through the public origin.
- Unauthorized outsiders cannot read channels or obtain media/activity access.
- Two physical devices on different networks can hear each other and share a selected screen.
- Mute/deafen, leave/rejoin, reconnect, and revoked membership behave correctly.
- Optional music/activities work or clearly report why they are unavailable.
- A backup has been restored successfully in an isolated environment.
- Operators know how to stop/recover services and handle partial signup.
- Retention, account recovery, export/deletion, abuse handling, and a support contact are defined.
- Distributed installers, notices, signing, and updates meet [release requirements](RELEASING.md).

Record actual results for your deployment. Gallery images, successful compilation, and fixture tests are not substitutes for these checks.
