# Release configuration

Unsigned/ad-hoc development builds do not need production credentials. Never copy a maintainer Keychain or provider session to a contributor.

A signed Mac release requires your own:
- ROOMS_SIGNING_IDENTITY (Developer ID Application identity)
- APPLE_TEAM_ID
- ROOMS_NOTARY_KEYCHAIN_PROFILE or the supported explicit notarization credentials
- ROOMS_SPARKLE_PUBLIC_KEY (base64 public key matching your own private updater signing key)
- ROOMS_UPDATE_FEED (your HTTPS feed, ending with /)
- Optional ROOMS_RELEASE_OUTPUT; adequate disk space is checked first.

Keep the Sparkle private signing key in your own protected signing account and match the account used by generate_appcast. No owner identity, public key or feed is silently selected.

pnpm release:mac builds/signs/notarizes a candidate without publishing it. pnpm release:mac:publish additionally invokes explicit publication; it is not a verification command. Publication requires ROOMS_DEPLOY_HOST, ROOMS_DEPLOY_KEY, ROOMS_DEPLOY_KNOWN_HOSTS and ROOMS_UPDATE_REMOTE_DIR. SSH host checking remains strict. Use least-privilege deployment access.

Record source SHA, version/build, artifact hashes, schema/config compatibility, notices and actual acceptance results. Require Accepted notarization, stapled app/archive and trusted Gatekeeper checks before publication. Test a fresh install and old-to-new update with preserved profiles and an actual compatible rollback. Do not substitute a freshly repackaged archive into an existing signed appcast.

This publication candidate is intentionally private and is not installed, released or deployed by preparation. The existing private Git history is not sanitized by deleting files on a new branch: publish only the approved clean export/new repository, or separately review every retained historical ref and asset.

