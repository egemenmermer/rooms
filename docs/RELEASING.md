# Build and distribute a release

[← README](../README.md) · [Development](DEVELOPMENT.md) · [Self-hosting](SELF_HOSTING.md)

## Contents

- [Source versus installers](#source-versus-installers)
- [Development packages](#development-packages)
- [Trusted macOS releases](#trusted-macos-releases)
- [Updates and publication](#updates-and-publication)
- [Release checklist](#release-checklist)

## Source versus installers

The repository is public and MIT licensed for original ROOMS code. Public source does not enroll users in a hosted community or provide a maintained public installer feed. Community operators distribute their own compatible builds and invitations.

A Git tag identifies source. It does not prove a signed, notarized, or tested downloadable application. Do not redistribute private community archives or unreviewed historical artifacts as public release packages.

## Development packages

After [installing the development toolchain](DEVELOPMENT.md):

```sh
pnpm package:mac
# Or, in the target Windows packaging environment:
pnpm package:win
```

These create ad-hoc macOS / unsigned Windows development packages, with output under `release/`. They do not need a maintainer's production credentials. The native build/preflight and platform tools still need to succeed.

## Trusted macOS releases

A distributor supplies their own configuration:

| Variable | Purpose |
| --- | --- |
| `ROOMS_SIGNING_IDENTITY` | Developer ID Application identity |
| `APPLE_TEAM_ID` | Your Apple developer team |
| `ROOMS_NOTARY_KEYCHAIN_PROFILE` | Your configured notarization profile; supported explicit notarization credentials are an alternative |
| `ROOMS_SPARKLE_PUBLIC_KEY` | Base64 public key corresponding to your private updater signing key |
| `ROOMS_UPDATE_FEED` | Your HTTPS update-feed base URL, ending with `/` |
| `ROOMS_RELEASE_OUTPUT` | Optional output directory; preflight checks available disk space |

Keep the Sparkle private signing key in the protected signing account used by `generate_appcast`. The public verification key is intended to be distributed; it is not the private key. Do not copy a maintainer Keychain or provider session.

```sh
pnpm release:mac
```

Builds/signs/notarizes a candidate without publishing it. Require Accepted notarization, stapled artifacts, and trusted Gatekeeper checks before distribution. Windows development packaging is configured separately; this guide does not assert a completed trusted Windows signing pipeline.

## Updates and publication

macOS in-app updates use Sparkle when the distributor supplies a compatible key/feed and correctly signed artifacts. A local source build has no automatic membership in someone else's update feed. Windows/native packaging and update acceptance must be checked separately for the target build.

```sh
pnpm release:mac:publish
```

**This command publishes artifacts.** It is not a verification command. It additionally requires `ROOMS_DEPLOY_HOST`, `ROOMS_DEPLOY_KEY`, `ROOMS_DEPLOY_KNOWN_HOSTS`, and `ROOMS_UPDATE_REMOTE_DIR`. Use least-privilege deployment access; SSH host verification remains strict. Read the release/publish scripts before using your configuration.

Do not replace an archive beneath an already signed appcast entry with different bytes. Test an actual old-to-new update, profile preservation, and a compatible rollback before asking members to update.

## Release checklist

- Record version/build, source SHA, artifact hashes, and target platform/architecture.
- Pass source checks and native startup checks for that source.
- Exercise core login/chat/media on actual devices against your backend.
- Review configuration/schema compatibility and restore a backup in isolation.
- Inspect the packaged payload for private files, sessions, keys, and operator media; follow [package policy](publication/PACKAGE_POLICY.md).
- Include license and third-party notices.
- Verify signing/notarization/trust requirements for the actual distributed artifact.
- Test a clean install, an update from the supported prior version, and recovery/rollback.
- Publish only the reviewed bytes; make the version, supported platforms, limitations, and support contact clear.

Public source preparation and CI do not by themselves sign, deploy, or certify a release.
