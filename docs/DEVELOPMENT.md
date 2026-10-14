# Develop and build ROOMS

[← README](../README.md) · [Architecture](ARCHITECTURE.md) · [Self-hosting](SELF_HOSTING.md)

## Contents

- [Toolchain](#toolchain)
- [First run](#first-run)
- [Commands](#commands)
- [Build a desktop package](#build-a-desktop-package)
- [Source layout](#source-layout)
- [Working safely](#working-safely)
- [Verification levels](#verification-levels)

## Toolchain

| Tool | Version / purpose |
| --- | --- |
| Node.js | 22.22.0 |
| pnpm | 11.25.0, declared in `package.json` |
| Git | Clone and track the source version |
| Xcode Command Line Tools | Native macOS compilation; install with `xcode-select --install` if needed |
| Docker Compose | Self-hosted Stoat development, not required merely to install client dependencies |
| Java 17+ and Maven | Optional server YouTube bridge |
| Playwright browser/runtime | Only for the specific tests/captures that use it |

Use the pinned lockfile. Installation does not require the maintainer's API keys, signing certificates, or shared accounts. macOS 14+ Apple Silicon and Windows x64 are the configured desktop packaging targets; Linux desktop packaging is not advertised.

## First run

```sh
git clone https://github.com/egemenmermer/rooms.git
cd rooms
pnpm install --frozen-lockfile
```

macOS/Linux shell:

```sh
ROOMS_PROFILE=dev-contributor pnpm dev
```

Windows PowerShell:

```powershell
$env:ROOMS_PROFILE = 'dev-contributor'
pnpm dev
```

The development command builds Electron main/preload, starts Vite on loopback port 5173, and opens Electron. Use the separate profile to avoid changing an installed app's preferences. Stop your own development session with Ctrl+C.

The client has no built-in production server address. Enter your own community URL or use its invitation. Client startup does not provision accounts, databases, or voice servers; follow [self-hosting](SELF_HOSTING.md) for that.

An optional non-secret build-time `VITE_ROOMS_DEFAULT_SERVER` can prefill a server in a customized distribution. Keep local settings in ignored `.env.local`. Never put passwords or tokens in a `VITE_` variable: those values can enter the renderer bundle.

## Commands

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Build/start native Electron development app plus Vite |
| `pnpm dev:web` | Browser layout development; no native capture, credential storage, or verified voice session |
| `pnpm lint` | ESLint checks |
| `pnpm typecheck` | TypeScript checks |
| `pnpm test` | Vitest suite |
| `pnpm build` | Typecheck, renderer build, notices, and Electron build |
| `pnpm services:build` | Access, Activities, Agent, and music service bundles |
| `pnpm start` | Run the already-built desktop app; run `pnpm build` first |
| `pnpm test:desktop --grep 'desktop shell'` | Scoped native shell smoke |
| `pnpm verify:ci` | Source baseline: lint, typecheck, tests, client build, services build |
| `pnpm format:check` | Existing code/tooling format check |

Do not run every `verify-*` script indiscriminately. Some require owned accounts, running services, private files, platform capture permissions, or provider access. Read [script categories](../scripts/README.md) and the harness before executing it.

## Build a desktop package

```sh
pnpm package:mac
```

Creates an ad-hoc macOS Apple Silicon development package on a suitable Mac. Native build tools and the release preflight must succeed. This is not Developer ID signing/notarization.

```sh
pnpm package:win
```

Creates an unsigned Windows x64 development installer; use a suitable Windows packaging environment for target-platform acceptance. Output defaults to ignored `release/`.

Trusted distribution needs a separate [release process](RELEASING.md), the distributor's own signing identities, and accepted installation/update checks. Do not describe unsigned development artifacts as official trusted releases.

## Source layout

| Path | Responsibility |
| --- | --- |
| `apps/desktop/src/` | React shell, feature views, renderer state |
| `apps/desktop/electron/` | Native session, files, devices, capture, and update authority |
| `apps/distribution/` | Optional invitation-gated download portal |
| `apps/services/access/` | Signup, identity/permission checks, and media grants |
| `apps/services/activities/` | Authoritative activity state and persistence |
| `apps/services/music/` | Optional music worker and source bridges |
| `apps/services/agent/` | Optional isolated task workers and grants |
| `packages/` | Shared domain, protocols, schemas, adapters, and rules |
| `infra/` | Generic deployment templates and upstream pins |
| `scripts/` | Build, setup, release, and scoped verification helpers |
| `tests/` | Component, protocol, loopback, and native regressions |
| `tooling/aliases.ts` | Derives aliases from `tsconfig.json` |
| `docs/` | Public user, operator, and contributor documentation |

Packages are logical source modules in a shared toolchain, not independently published npm workspaces. Start a change in the owning module; preserve typed cross-process contracts. See [architecture](ARCHITECTURE.md).

Generated data stays in ignored `.local/`, `dist*`, `release/`, and test-output directories. `ROOMS_REFERENCE_ROOT` is optional for an external reference asset package you own; it is not a production dependency.

## Working safely

Use disposable accounts and isolated environments for authenticated development. Do not request a production session, provider account, or signing Keychain from an operator. Keep privileged credentials in Electron main/server boundaries, not renderer state or screenshots.

Development visual fixtures are excluded from production paths. README gallery captures use sample community data; their presentation does not establish a live backend result. Do not ship fixture bridge behavior or remove the runtime fixture marker as a product change.

Follow [CONTRIBUTING.md](../CONTRIBUTING.md), keep format-only edits separate, and do not commit local secrets, account fixtures, database snapshots, or operator evidence.

## Verification levels

1. **Static/source checks:** lint, types, unit/component tests, and builds.
2. **Native shell smoke:** Electron starts and its scoped shell behavior works.
3. **Service integration:** actual accounts, gateways, authorization, persistence, and recovery against the configured backend.
4. **Physical-device acceptance:** two computers, actual microphone/camera/screen permissions, audibility, and update installation.

Each level establishes different facts. Two mocked clients do not prove a real media session; a successful source build does not prove a signed installer. Name the environment/version and record unresolved checks honestly in a pull request.
