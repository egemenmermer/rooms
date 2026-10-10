# Current deployment and recovery

The active backend is Stoat. `LEGACY_SPACEBAR_DEPLOYMENT.md` preserves the earlier environment and evidence; do not use its accounts or configuration as Stoat acceptance.

Follow `infra/stoat/README.md` to generate the pinned upstream configuration and private keys, and `docs/AGENT_DEPLOYMENT.md` for the separate agent host. Build native services with `pnpm services:build`. The dedicated core is deployed at `https://62.238.119.134` using a publicly trusted IP certificate. See `docs/OVERNIGHT_DEPLOYMENT_PLAN.md` and sanitized `infra/production/*_RESULTS.json` for actual acceptance and limits. The separate Agent host, personal provider/model account connections and signing identity are still unavailable. Private deployment files are under `/opt/rooms/config` on the core; do not regenerate them or expose credentials.

## Core host

Run unmodified Stoat's MongoDB, message brokers, object storage, API, events and Autumn upload services behind public TLS. The raw upstream API and MongoDB remain private. The ROOMS broker handles account registration invitations and is routed at `/rooms-access/`; public raw `/api/auth/account/create` must be denied. The Activity service is routed at `/rooms-activities/`; its official YouTube player requires the actual HTTPS origin. Maintain a single Activity writer until multi-process locking is implemented. PostgreSQL stores durable Activity snapshots.

The media broker checks current Stoat permissions before granting LiveKit access. Configure LiveKit's signed webhook to the broker, public WSS and reachable UDP/TCP transport, including TURN/TLS for restrictive networks. Do not infer public connectivity from loopback tests. Pin deployment image digests, rotate development keys and verify an unauthorized identity cannot join or publish. Never expose broker service secrets to a desktop package.

The separate agent host receives per-user hashed access grants, private encryption key, dedicated bot account tokens and restricted execution/browser network policy. It does not receive personal IPTV/Real-Debrid vaults. Validate network allowlists and isolated filesystem boundaries before enabling research/browser capabilities. Backup model profiles as sensitive account material only when the respective provider permits it.

## Consistent encrypted backups

A useful backup must include the following as a consistent recovery point:

1. MongoDB dump and Stoat object-storage files/buckets, plus protected deployment configuration.
2. PostgreSQL Activity data; the invitation ledger and presenter/access service state as applicable.
3. Separate agent `agent.enc`, its unchanged encryption key stored through the owner's secret manager, generated artifacts and persistent bot browser profile. Unknown external effects must stay uncertain on recovery.

For an initial low-traffic deployment, enter a maintenance window, stop public ingress and all mutating ROOMS services, stop upstream writers, then use `mongodump --archive`, `pg_dump --format=custom`, and an object-storage snapshot. Quiesced filesystem snapshots are an alternative only when database and object-store documentation explicitly permits them. Encrypt the backup with an owner-controlled recipient before off-host transfer. Keep encryption keys separate, rotate retention, and do not publish raw archives or logs.

Restore into an isolated empty environment with a distinct domain and blocked external bot writes. Use `mongorestore --archive` and `pg_restore` against the new databases, restore object files and protected state, verify image/schema versions, then check private attachments, messages, invitation consumption, Activity recovery and agent operation journals. Reconcile uncertain external operations instead of reissuing them. Revoke old user sessions and rotate service secrets when appropriate. Only promote the restored environment after the drill passes.

Backup commands are a runbook, not a completed restore test. The first friends release requires an actual encrypted backup/restore drill. No destructive volume deletion or global VM repair is authorized by this runbook.

## Release gates

Own Developer ID signing/notarization, signed update cycle, fresh installation, Internet two-client social/media/Activity tests, physical two-Mac audio/video/screen sharing, and a sustained M1/8 GB performance run remain gates. Windows compatibility is preserved in source; this Mac does not establish Windows acceptance.

## Scoped core maintenance

The dedicated `rooms-deploy` account accepts the existing owner public SSH key. The owner's root account remains available. The maintenance account has no Docker group membership and cannot read private deployment configuration. Its sole passwordless sudo entry runs the root-owned `/usr/local/sbin/rooms-maintain` wrapper. `status` reports the fixed ROOMS Compose project; `restart <service>` accepts only the known ROOMS service names. Arbitrary commands, other project names and bundle uploads are not granted. A code deployment remains an owner operation rather than a claim of unrestricted least-privilege deployment.

Actual SSH checks passed permitted status, general-root denial, direct-Docker denial, other-project denial and private-config denial (`infra/production/MAINTENANCE_ACCESS_RESULTS.json`). Root-owned wrapper source is in `infra/production/rooms-maintain.py`; it ignores caller-supplied Docker endpoints, Compose overrides and executable paths. Routine status: `ssh rooms-deploy@62.238.119.134 sudo -n /usr/local/sbin/rooms-maintain status` with the same pinned host-key settings used for deployment.
