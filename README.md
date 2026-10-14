# ROOMS

An invite-only desktop clubhouse for chat, voice, screen sharing, games and shared activities.

Built with Electron, React and TypeScript. Social identity uses an unmodified, separately self-hosted Stoat backend; LiveKit provides replaceable realtime transport. Source is MIT licensed; third-party components retain their own licenses.

This is an evolving project, not a promise that every device/provider workflow is production-certified. macOS 14+ Apple Silicon and Windows x64 packaging exist. Signing and physical media acceptance are separate from a successful source build.

## Develop the client
Install Node 22.22.0 and pnpm 11.25.0, then:
```sh
pnpm install --frozen-lockfile
ROOMS_PROFILE=dev-contributor pnpm dev
```
PowerShell:
```powershell
$env:ROOMS_PROFILE = 'dev-contributor'
pnpm dev
```
The development profile protects the installed app's accounts/preferences. No production API key, signing certificate or shared account is needed for client development. Choose your own community URL in onboarding, or open its invitation link. An optional build-time `VITE_ROOMS_DEFAULT_SERVER` can prefill a server; the default is empty.

Browser-only `pnpm dev:web` does not provide native capture, encrypted storage or a verified voice session.

## Check and build
```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm services:build
pnpm test:desktop --grep 'desktop shell'
```
Only use explicitly disposable accounts and isolated environments for authenticated tests. Unit tests and native shell smoke do not establish physical two-computer media acceptance.

`pnpm package:mac` creates an ad-hoc development build. `pnpm package:win` creates an unsigned Windows development installer. Official trusted releases require the maintainer's separate release process.

## Customize your community
The default music-bot character is an original, static generated illustration. A community can supply its own name, poster and optional animation through a same-origin manifest; see [customization](docs/CUSTOMIZATION.md). Custom visuals never control playback and are not bundled or shared between unrelated communities.

## Documentation
- [Development and source organization](docs/DEVELOPMENT.md)
- [Architecture and module boundaries](docs/ARCHITECTURE.md)
- [Isolated self-hosting](docs/SELF_HOSTING.md)
- [Community customization](docs/CUSTOMIZATION.md)
- [Release configuration](docs/RELEASING.md)
- [Contributing](CONTRIBUTING.md) · [Security reporting](SECURITY.md)
- [Asset provenance](docs/ASSETS.md) · [Third-party notices](docs/THIRD_PARTY_NOTICES.md)

No private deployment receipts, account handoffs, provider sessions, signing keys or personal server defaults belong in this source distribution. MIT applies to original ROOMS code/assets; Inter, upstream services and embedded dependencies retain their notices and obligations.

