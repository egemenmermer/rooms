# ROOMS contributor starter pack

Prepared 2026-10-14. Share this file with an invited contributor. It contains no credentials. Current source is on `main`; published desktop packages are RC.7 and may lag behind later source fixes.

## What the owner needs to provide

1. Access to the private repository: https://github.com/egemenmermer/rooms. Invite the contributor's own GitHub account; do not share an account or personal access token. For a personal-repository collaborator, repository write access permits branches; agree to use pull requests and keep release/deployment credentials with the owner. Fork access depends on repository settings.
2. A separate ROOMS account invitation if the contributor needs real chat/voice. The website download invitation and account/community invitations are separate. Use a development community or dedicated staging environment for disruptive tests.
3. This document and a feature/bug description. UI and client development need no production server API key.

No access has been provisioned by preparing this file. The contributor's GitHub username is needed to send a repository invitation.

## First run

Install Git, Node **22.22.0**, and pnpm **11.25.0** (the versions used by CI). Java 17+ and Maven are only needed for the server YouTube bridge; Docker is only needed for a separate backend stack. Use the checked-in lockfile. Windows x64 is supported; Mac delivery targets macOS 14+ / Apple Silicon.

```sh
git clone https://github.com/egemenmermer/rooms.git
cd rooms
git switch main
git pull --ff-only
git switch -c feature/my-change
pnpm install --frozen-lockfile
```

Use a separate development profile so the installed app's accounts and preferences remain intact. The profile name accepts only letters, digits and hyphens, with a maximum of 40 characters. It is a local profile selector, not an authentication key.

Mac/Linux terminal:

```sh
ROOMS_PROFILE=dev-contributor pnpm dev
```

Windows PowerShell:

```powershell
$env:ROOMS_PROFILE = 'dev-contributor'
pnpm dev
```

Open the native Electron application and log in with your own account if needed. The current private service address is `https://62.238.119.134`. Selecting this service is a real connection: messages, uploads and room joins affect the real community. Coordinate changes with the owner. There is no frontend `.env` containing production tokens to request.

`pnpm dev` starts the controlled local Vite origin and native shell. Close it normally when finished. Browser-only `pnpm dev:web` is useful for UI but cannot establish native permissions, encrypted storage or actual screen capture. If port 5173 is occupied, inspect your own running development instance before starting another; do not stop somebody else's service.

## Credentials: what is actually required

| Work | Credential/access | How to obtain it |
|---|---|---|
| Clone, branch, submit PR | Own GitHub identity with repository access | Owner invites that identity; authenticate normally on your own computer |
| UI, settings, game rules, client code, local unit checks | No server/provider key | Install dependencies and use a separate development profile |
| Real chat, voice and sharing | Own ROOMS account and allowed community membership | Owner supplies a personal invitation; log in through the app |
| Separate local/staging LiveKit + access broker | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Generate new values for that isolated server; same pair in its LiveKit configuration and broker |
| Separate local/staging DJ worker | `ROOMS_MUSIC_SECRET` | Generate a new service secret of at least 32 characters; same value in that environment's access broker and music worker |
| YouTube bridge playback | Separate, explicitly authorized DJ account OAuth refresh token | Normal Google device authorization for that environment; private token file, not renderer/env/argv/Git |
| Optional Agent server | `ROOMS_AGENT_STORAGE_KEY`, private authorization/policy files | Generate a persistent 32-byte encryption key for the separate Agent instance; use `infra/agent/service.env.example` and Agent deployment guide |
| Optional model/provider integrations | Contributor's own provider connection | Connect through the application/provider's official flow; do not request the owner's keys |
| Optional Real-Debrid device flow | `ROOMS_RD_CLIENT_ID` and user's own provider authorization | Registered public client ID is configuration; user tokens remain in native encrypted storage |
| Signed release / production deployment | Owner-controlled signing, notarization, updater and deployment credentials | Handled by the maintainer; not required for normal contributions |

Generate a new development-only 32-byte value without using the owner's secrets:

```sh
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex')+'\n')"
```

Run separately for independent secrets. Save them privately in ignored environment/config files. Do not replace an existing encryption key: previously encrypted data depends on it. The example command prints the new local secret, so do not paste its output into shared logs or tickets.

Do not copy production `.local/`, `infra/local/`, environment files, database/backup dumps, invitation ledgers, browser cookies, OAuth refresh tokens, SSH private keys, Apple signing keys or Sparkle signing keys into a contributor pack. Source and a personal app login are sufficient for most work.

## Backend work: isolated environment

The active social backend is **unmodified upstream Stoat**. The old `infra/docker-compose.yml` and `pnpm services:native` contain legacy Spacebar wiring; they are not the current Stoat quick start.

Start with the reviewed guides: `infra/stoat/README.md`, `docs/project/services.md`, `docs/project/operations.md`, `docs/AGENT_DEPLOYMENT.md`, and `apps/services/music/youtube-bridge/README.md`. Their dated acceptance sections describe historical checks, not the status of today's release.

On a new, isolated local stack only:

```sh
pnpm services:build
pnpm stoat:setup
node scripts/stoat-start.mjs
```

These commands prepare/start the pinned upstream social stack; they do **not** finish all ROOMS services, create a usable development account, configure LiveKit or install the private DJ bridge. Do not run them against the existing production server.

Local routing contracts:

| Service | Local configuration |
|---|---|
| Stoat public proxy | `http://127.0.0.1:3021`; desktop server selection uses this origin |
| Private Stoat raw API | `http://127.0.0.1:3022`; keep private |
| Access broker | `SERVICE_HOST=127.0.0.1`, `PORT=3002`, `STOAT_INTERNAL_URL=http://127.0.0.1:3022` |
| Media transport | `LIVEKIT_INTERNAL_URL=http://127.0.0.1:7880`, `LIVEKIT_PUBLIC_URL=ws://127.0.0.1:7880`, own LiveKit key pair |
| Activity authority | `SERVICE_HOST=127.0.0.1`, `ACTIVITY_PORT=3031`, same private Stoat URL; `ROOMS_ACTIVITY_DATA` defaults to `.local/activities` |
| Optional durable Activity database | `ROOMS_ACTIVITY_DATABASE_URL`, own database/user; otherwise file repository |
| Registration broker | Generated `.local/stoat/broker.env`: Mongo URL and private invitation-ledger path |
| Community sounds | `ROOMS_SOUNDBOARD_DIRECTORY`, own writable persistent directory; the broker default `/state/soundboard` is intended for containers |
| Optional DJ | `ROOMS_MUSIC_URL`, `ROOMS_MUSIC_SECRET` in broker; same secret plus `ROOMS_ACCESS_INTERNAL_URL` in music worker |

Load the chosen private environment explicitly when running Node service bundles; Node does not automatically load arbitrary `.env` files. Example, **after** configuring the broker's own LiveKit pair and soundboard directory in a local-only file:

```sh
node --env-file=.local/stoat/broker.env dist-services/access.cjs
```

Run Activities separately with that environment and any additional Activity configuration. `dist-services/activities.cjs` is the Activity bundle. Configure LiveKit's own matching key pair, ports, routing and signed webhook before claiming voice is fully operational. Loopback URLs are appropriate for same-computer tests; another computer needs reachable staging HTTPS/WSS, firewall and media port configuration.

Account creation is invite-only. Use the owned stack's administrator account/community invitation and `scripts/stoat-issue-invite.mjs` to issue a local ticket; it writes a private delivery file. A production invitation is not a development fixture. Do not reset used/failed invitation ledgers.

The YouTube bridge currently uses Linux native artifacts at fixed private paths. Maven compilation alone does not make it runnable on a Windows/Mac laptop. Build/deploy the isolated Linux service according to its guide, retain dependency notices and authorize a dedicated account if playback needs it. Provider-denied media is not a successful test. Agent execution also belongs on a separate authorized Linux host.

## Source map

| Change | Main files |
|---|---|
| Settings/preferences | `apps/desktop/src/Settings.tsx`, `store.ts` |
| Voice/sharing lifecycle | `apps/desktop/src/realtime.ts`, `packages/media-providers/src` |
| Native IPC, capture, encrypted account state | `apps/desktop/electron` |
| Chat/community | `apps/desktop/src/community.ts`, `RealSocial.tsx`, `packages/stoat-adapter` |
| Games/Kiraathane | `apps/desktop/src/Games.tsx`, `packages/games`, `apps/services/activities` |
| DJ UI/server/source resolution | `apps/desktop/src/MusicDJ.tsx`, `apps/services/music`, `apps/services/access` |
| Invite-only download website | `apps/distribution` |
| Contracts | `packages/shared-contracts`, `packages/activity-protocol` |
| Checks, build, publication | `tests`, `scripts`, `.github/workflows`, `docs/release` |

Read `AGENTS.md` and the project handbook before changing product behavior. Technical documents/code are English; user-facing copy is Turkish. Keep secrets outside the renderer, voice independent of navigation, account-change cancellation and existing persistent data intact. Development fixtures must stay visibly labeled and unavailable in production.

## Submit a change

1. Start from current `main`, use a feature branch and keep the change focused.
2. Record the problem and expected behavior. Check relevant failure cases as well as the happy path.
3. Run relevant local checks; the main CI runs the full baseline. Windows excludes four POSIX directory-fsync server-only tests; do not remove them from the Linux baseline. Java bridge changes also need Maven compilation.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm services:build
```

4. Inspect scripts before running native/remote acceptance harnesses. Do not use real user accounts or disrupt the live server without coordination. Record operating system, source commit, checks and what remains unverified. A unit check is not a real two-device voice/share test.
5. Commit and push your feature branch, then open a pull request targeting `main`:

```sh
git add path/to/changed-file
git commit -m "Fix the specific problem"
git push -u origin feature/my-change
```

Use explicit changed paths rather than blindly adding private/generated files. Include the trigger, resulting behavior, validation and limitations in the PR. The maintainer reviews and merges. Do not force-push shared branches, overwrite release tags, publish packages or use administrator bypasses.

## Main is not a release

Pushing or merging source into `main` does **not** update installed ROOMS clients. A client release requires a versioned build, exact-source checks, signed/notarized Mac artifacts, appropriate Windows labeling/signing, artifact hashes, GitHub release assets and the separately maintained download catalog/update feed. Backend changes require a separate coordinated service deployment and rollback record.

Contributor workflow: **feature branch → PR → green checks + review → main → maintainer release**. Send your PR link to the owner. Do not reuse RC.7 filenames/tags for different binaries. Windows RC.7 is unsigned and updates manually; Mac uses the configured Sparkle feed. Physical Windows and two-Mac acceptance remain separate gates.

## Apple account and signing: who does what?

An Apple Developer Program membership is **not required to edit ROOMS or run `pnpm dev` on your own computer**. This is an Electron application; a contributor can code, run the native development shell, build and submit changes without the owner's Apple account or Keychain. Windows development also does not require an Apple account. Actual device/privacy permissions still belong to that computer and user.

Recommended arrangement for this project:

1. Contributor develops and checks their feature on their own machine and opens a PR.
2. Maintainer reviews the exact source and merges it.
3. The existing authorized Mac release machine builds that committed source, signs with the existing ROOMS Developer ID identity, notarizes with Apple, staples and verifies the resulting package.
4. Maintainer signs the Sparkle update metadata and publishes the immutable package and download catalog. Apple application signing and Sparkle update signing are separate keys.

The contributor does not need to purchase a membership or sign each code change. Source commits are not Apple application signatures. The final distributed Mac application is signed after building. For the existing ROOMS update channel, keep the current authorized team identity and updater trust configuration. A different team's certificate is not a drop-in replacement: it needs a planned trust/update migration and actual upgrade/permission validation.

If the owner explicitly delegates **release signing**, selective credential provisioning is possible; do not send an entire Keychain or Apple login:

- A Developer ID Application certificate **and its matching private key** are needed on the signing Mac. A `.cer` file alone cannot sign. The relevant certificate/private key can be exported as a password-protected `.p12` and imported on an explicitly trusted signing Mac. This grants the ability to sign software under that identity, beyond merely editing ROOMS.
- Apple notarization authorization must be provisioned separately. A local `notarytool` Keychain profile name is only a reference to credentials on that Mac; sending the name does not transfer authorization. Prefer authorized team access and a separately provisioned release credential where the membership supports it. Individual and organization membership permissions differ.
- Publishing updates also requires the appropriate Sparkle signing authority and restricted deployment/release access. Do not include these secrets in the starter document, repository, chat or ordinary shared archive.
- Our signed packaging script is `scripts/package-signed-mac.mjs`, invoked through `pnpm package:mac:signed`. It currently requires an Apple Silicon Mac and explicit/approved signing configuration (`ROOMS_SIGNING_IDENTITY`, `ROOMS_NOTARY_KEYCHAIN_PROFILE`, `APPLE_TEAM_ID`). Development commands do not require those variables. The signing script has project defaults; those names are not transferable credentials.

For normal contributions, keep all release credentials with the maintainer. If release delegation is later chosen, provision only the exact authorized credentials through a private channel; this document does not export or grant them.

Official references: [Apple membership comparison](https://developer.apple.com/support/compare-memberships/), [Developer ID certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/), [certificate/private-key export](https://help.apple.com/xcode/mac/current/en.lproj/dev154b28f09.html), [macOS notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

## Open work as of this handoff

- The reported Settings save problem was resolved by the owner selecting a microphone. The later proposed Settings edits were reverted at the owner's request; no Settings cleanup or save-logic change is included in this handoff.
- Owner-reported soundboard problem still needs a precise reproduced action/error.
- Post-RC.7 IPTV category/recovery fixes are on source; real playback failure acceptance remains open.
- Physical Windows microphone/screen/community-sound acceptance remains open.
- Record exact-version multi-device game/media acceptance; do not count old results as universal coverage.

Coordinate ownership before editing these files concurrently. Current source fixes do not authorize a new release until their relevant acceptance is complete.
