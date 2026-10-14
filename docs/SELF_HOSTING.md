# Isolated self-hosting

Deploy to an isolated machine/community first. Never run setup against an existing live volume without a compatible backup and a reviewed migration plan.

Use pinned unmodified Stoat from infra/stoat/UPSTREAM.json. pnpm stoat:setup generates private local configuration; node scripts/stoat-start.mjs starts the chosen local stack when Docker is available. Setup alone does not create all application services, accounts, grants or provider connections.

Build Node services with pnpm services:build. Use infra/templates/core.env.example as a configuration checklist, generate independent secrets and load your own ignored environment explicitly. Never replace an existing encryption key without a data migration.

Typical local boundaries:
- Public Stoat proxy:127.0.0.1:3021; raw API:127.0.0.1:3022, kept private.
- Access:127.0.0.1:3002, matching LiveKit key pair and private Stoat origin.
- Activities:127.0.0.1:3031, same identity authority, persistent directory or configured PostgreSQL.
- LiveKit:7880/7881 plus the configured media UDP range, matching signed webhook/grants.
- Optional music:private worker port3040, independent service secret and approved source configuration.
- Optional Agent:separate Linux host, encryption key and explicit model/resource grants.

Node does not implicitly load arbitrary environment files:
```sh
node --env-file=.local/core.env dist-services/access.cjs
node --env-file=.local/core.env dist-services/activities.cjs
```
Configure writable soundboard/data directories, service ownership, database roles, TLS/WSS and reachable media ports. Do not expose the raw registration API; use the one-use invitation broker. See infra/stoat/README.md for the active adapter/setup details.

The optional DJ Java bridge needs Java17/Maven, its documented Linux native artifacts and an explicitly authorized account when the provider requires one. Compiling a JAR is not a Windows/Mac provider playback acceptance. See apps/services/music/youtube-bridge/README.md. Keep upstream/shaded/native notices and treat provider-denied content honestly.

For the download portal, set ROOMS_DISTRIBUTION_ORIGIN to your own origin and provision your own private invitation/release ledger. The source contains no maintainer service address.

Before real use: validate ordinary/outsider permissions, account recovery, data compatibility, an isolated restore and actual two-device media. Keep diagnostics free of credentials/message contents; define your own retention/export/deletion/support policy.

