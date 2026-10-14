# Development

Toolchain: Node22.22.0 and pnpm11.25.0, pinned dependencies and frozen lockfile. Java17+ and Maven are needed only for the optional server YouTube bridge; Docker and isolated service configuration are needed for self-hosting. Do not request an operator's production keys to develop the client.

Run pnpm install --frozen-lockfile, then use a separate ROOMS_PROFILE=dev-contributor for pnpm dev. In PowerShell set $env:ROOMS_PROFILE before the command. pnpm build and pnpm start use the production-style renderer/native shell; this is not a signed release.

The application has no built-in production address. Saved preferences and invitation links remain authoritative. VITE_ROOMS_DEFAULT_SERVER is an optional non-secret build-time default for a self-hosted distribution. Put local values in ignored .env.local, never a source file.

## Structure
- apps/desktop/src: route shell, feature views and renderer state.
- apps/desktop/electron: native session/file/device/update authority.
- apps/distribution: optional invite-gated download portal.
- apps/services: access, Activities, music and optional separate-host Agent.
- packages: shared domain/protocol/schema/adapters/rules.
- tooling/aliases.ts: derives Vite/Vitest aliases from tsconfig.json.
- scripts: build/dev/release and scoped verification. Legacy personal deployment/reboot scripts are excluded from this distribution.
- infra: generic service templates and upstream pins; generated configuration lives in ignored .local/.
- tests: component, protocol, loopback and native shell regressions.

Packages are logical source modules in a shared toolchain, not independently published npm workspaces. Keep that choice explicit. Formatting is provided by Prettier; do not mix format-only changes into a bug fix.

## Verification levels
pnpm lint, pnpm typecheck, pnpm test, pnpm build and pnpm services:build form the source baseline. The desktop shell smoke uses a disposable profile. Any authenticated scenario needs explicit disposable fixture accounts and scopes. Two local mocked clients do not prove a physical screen/audio path. Platform/provider checks must be named and recorded with their version.

DEV reference fixtures remain optional; set ROOMS_REFERENCE_ROOT only when you own an external reference package. Missing reference images are not production media or fake provider success.

