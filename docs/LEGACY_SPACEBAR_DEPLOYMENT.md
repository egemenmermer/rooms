# Local self-host deployment

Requires Docker Compose and Node24+. No Vercel deployment is involved in this private desktop/SFU stack.

1. Run `node scripts/spacebar-setup.mjs` to create random PostgreSQL credentials and invite-only upstream config under ignored `infra/local/`.
2. Run `node scripts/livekit-setup.mjs` to create local LiveKit credentials/config. Never commit local credentials.
3. Run `docker compose --env-file infra/local/.env -f infra/docker-compose.yml up -d --build`.
4. For first local owner only, run `node scripts/spacebar-bootstrap.mjs`. It temporarily enables loopback-only upstream registration, creates a private community and two integration accounts, then restores invite-only config in a finally block. Credentials stay in mode0600 `infra/local/test-accounts.json` and never print to console.
5. Run `node scripts/spacebar-integration.mjs` for real distinct-account API/Gateway evidence.

Public development social endpoint: http://127.0.0.1:3001. Access/media broker: http://127.0.0.1:3002. Raw upstream bootstrap endpoint: http://127.0.0.1:3003. LiveKit: ws://127.0.0.1:7880; TCP7881 and UDP50000–50020. All host bindings are loopback-only. Tokens are private and the gateway returns the public social origin.

## Production constraints

This is a local deployment recipe, not a production-ready Internet deployment. Before remote friends connect, configure an owner-managed TLS domain and HTTPS/WSS reverse proxy, remove raw upstream3003 host publication, rotate secrets, use pinned image digests, resolve upstream patch-package issues, and verify invite-only access. LiveKit UDP/TCP must be reachable through real NAT/firewall configuration; use production TURN/TLS support where required. Docker loopback NAT is insufficient evidence of external screen-share connectivity.

## Maintenance and recovery

PostgreSQL and Spacebar files use named persistent volumes. Back up PostgreSQL with `pg_dump` and the files volume together before upstream upgrades; store encrypted backups outside this checkout. Test restores on an isolated Compose project. Do not use `docker compose down -v` unless intentionally deleting all community data. For ordinary restart use `docker compose ... restart`. Disable registration/invalidate invites and rotate service secrets in an emergency. Never upload raw container logs without checking for secrets; upstream registration-token paths can log tokens.

Keep the pinned upstream revision until compatibility tests pass against a candidate upgrade. Update deployment revision and source offer together. See SPACEBAR_COMPATIBILITY.md for license obligations and known constraints.

## OrbStack ARM64 local runtime issue

On the test host, OrbStack2.2.3's Linux VM stalled while applying Docker seccomp BPF filters. Its runtime log showed `bpf_jit_binary_pack_finalize -> do_seccomp` and VM health-check timeouts. This is an actual deployment blocker. The normal Compose recipe retains syscall isolation; ROOMS does not restart the global VM or weaken its seccomp configuration. A separately owned native local PostgreSQL/Spacebar fallback is provided via `node scripts/spacebar-native.mjs`, keeping all processes bound to loopback.

### Native macOS fallback prerequisites

Use a verified official Node24 ARM64 archive under ignored `.local/` (tested24.21.0; SHA256 `bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057`). The Homebrew Node24 executable on the test host is broken due to an absent simdjson dylib; no global library repairs are performed. PostgreSQL16 server binaries under `/opt/homebrew/opt/postgresql@16/bin/` are used; Homebrew's default libpq-only initdb lacks its companion server binary.

Upstream contains a `RateLimits.ts` file alongside a `ratelimits/` directory, which TypeScript resolves incorrectly on a case-insensitive filesystem. Native source must be built on a case-sensitive volume. The local development build uses `.local/spacebar-source.sparseimage` mounted at `/tmp/rooms-spacebar-case-sensitive` with the unmodified pinned source beneath `upstream/`. Set `SPACEBAR_SOURCE` to another case-sensitive source directory if needed. Bootstrap accepts `SPACEBAR_NATIVE=1`, restarting only its saved owned SpacebarPID. The local PostgreSQL trust-auth database is loopback-only and dedicated to this development checkout; it is not a production authentication configuration.

Native fallback currently uses **public social3011** because the hung OrbStack VM retains the original3001 port. Raw upstream stays3003 and access3002. Run `SPACEBAR_URL=http://127.0.0.1:3011 node scripts/spacebar-integration.mjs`. Docker deployments continue to use public3001. Local bootstrap credentials are for integration testing, not shared friend accounts.
