# Developer ID delivery

The signed packaging path uses an explicitly owner-selected Developer ID Application identity. Never select an unrelated keychain identity automatically. Preview defaults remain ad-hoc; Developer ID packaging explicitly enables hardened runtime.

Prefer notarization credentials stored through Apple's interactive `xcrun notarytool store-credentials` command. The owner supplies the Apple ID/team and enters an app-specific password locally. Do not put passwords in chat, source, command arguments, archives or release notes. Set `ROOMS_NOTARY_KEYCHAIN_PROFILE` (or `APPLE_KEYCHAIN_PROFILE`) to the resulting profile name, and `ROOMS_SIGNING_IDENTITY` to the full authorized Developer ID Application identity. `pnpm package:mac:signed` builds and notarizes using that profile. Explicit environment credential mode is retained for managed build environments.

The selected identity prefix is validated by the script, then removed only for electron-builder's certificate qualifier API, which rejects a literal Developer ID Application prefix. Full selected name/team remains specified; it is not unrestricted auto-discovery.

A signed build is not a notarized build. Require successful Apple submission status, strict application/nested signature verification, stapler validation and Gatekeeper assessment before describing the delivery as notarized. Recreate the ZIP after stapling the application. Preserve published prior versions, application user data and provider secrets. Verify published hashes independently of functional/physical-device acceptance.
