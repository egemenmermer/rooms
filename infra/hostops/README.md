# HostOps deployment kit

HostOps is optional. It does not change Core, Agent, user accounts or release archives. Deploy phases separately; do not advertise terminal or Agent availability until their acceptance gates pass.

## Service

Build with `pnpm services:build`. Install `dist-services/hostops.cjs` outside Core as a root-owned application, with a dedicated unprivileged `rooms-ops` Linux identity. Use Node 22.13+ or Node 24 (builtin SQLite). Set up `/var/lib/rooms-hostops` owned by that identity, mode0700. Service config is root:rooms-ops0640. All parent directories, helpers, binaries and units must be root-owned and not group/other-writable.

Copy `config.example.json` to a private `/etc/rooms-hostops/service.json`; choose the actual community ID and private Stoat endpoint. Never commit that file. Bind to loopback. Proxy only `/rooms-ops/v1/*` and health to localhost3042 with prefix stripping, TLS and WebSocket support. Never proxy `/internal/*`. Configure private `socialReadMongoUrl` with the existing find-only role for channels, servers and server_members to avoid upstream server REST read limits; identity authentication remains upstream REST. Keep this credential only in HostOps, never in the Agent identity or renderer. No public standalone management port, bearer tokens in URLs or logging of Authorization headers. The existing signed-in social session authenticates every request; only the current community owner or explicitly granted operators see a host. Recheck membership and grants during open streams. In-app alert receipt is acknowledged separately per user; delivery failures stay pending.

Start with no terminal profiles and `agentAvailable:false`. Monitoring requires no account secret in the desktop, Docker socket or privileged shell. Optional status metrics use `rooms-status-helper.py`, installed root:root0755 as `/usr/local/libexec/rooms-status-helper`, and root-owned0640 `status.json`. Allowlist exact container names and friendly labels. It returns only health/restart counts and an optional verified backup receipt, never environment variables, mounts, logs or provider credentials. Missing backup receipt remains unknown. A backup job writes `{ "verified": true, "completedAt": <epoch milliseconds> }` only after successful validation.

## Persistent human terminals

Install tmux, sudo, Python3 and the separate native kit (`package.json` plus its lockfile) under `/opt/rooms-hostops/native`. Use the normal package manager dependency-build approval for node-pty. Do not disable build approval policies. Never ship node-pty in desktop packages.

Install `rooms-terminal-helper.py` root:root0755 as `/usr/local/libexec/rooms-terminal-helper`; install `profiles.example.json` privately as `/etc/rooms-hostops/profiles.json`, root:root0640. Each operator must have a distinct Linux user/profile and writable workspace. Do not reuse the Core/music UID, docker group, root, service accounts or private configuration directories. Human terminal access grants the privileges of that configured Linux user; it is not an arbitrary root console. Explicit per-session sharing delegates those same privileges.

Install the `rooms-host-terminal@.service` template. Its independent tmux server survives broker restarts. Configure `ReadWritePaths` per operator using a root-owned drop-in; the example allows only `/srv/rooms-operator`. Root helper starts only the profile's configured unit, drops all supplementary groups and switches UID/GID before attaching. There are no caller-supplied commands, paths or environment values. Keep those users out of sudoers and Core file groups. Set writable workspaces0700. This is a human host shell; AI never receives this route or profile.

Validate and install the sudoers example with `visudo -cf`; the two helper paths are the only sudo capabilities for rooms-ops. Unit `ProtectSystem`/`ProtectHome` apply independently to persistent tmux servers. Broker PrivateTmp/cgroup restarts cannot kill those separate servers. Reboot interrupts sessions and does not replay commands. Panel close detaches; explicit session termination kills it. Detached sessions expire after24h while broker runs (or at first access after restart). Output replay is bounded in RAM; tmux retains bounded screen history only, no transcript files.

Set `helper`, `nativeModules` and distinct `terminalProfiles` in private service config and assign an owner profile. Broker validates configured profiles; operator API cannot create Linux users. Configure TLS proxy before granting users. Maximum3 sessions per operator; exactly one writer, explicit read-only/control sharing, monotonic input sequence, bounded output/backpressure. Permission/account loss prevents further input and detaches streams.

## Acceptance and rollback

Before enabling: validate unit/sudoers, run the actual Linux collector, test PTY Unicode/resize, close panel and reconnect, restart only HostOps and reconnect to the same shell, test revoked grants, and verify no Core file/network privileges. Monitor CPU/RAM with voice/DJ active. Test normal member denial and account switching in the desktop. Do not count fake drivers as persistent Linux acceptance.

Rollback by removing the reverse-proxy route and stopping HostOps. Revoke operator grants before disabling service. List/close explicitly created persistent terminal units separately; do not stop unrelated tmux processes or Core services. Keep metrics/config backup privately with permissions preserved. No automatic client update or release is performed by this kit.

Shared-host rootless Agent execution and consented native desktop control have separate acceptance gates in `docs/SERVER_OPERATIONS.md`; these helpers do not implement or grant either capability.
