# Contributing

Read [development](docs/DEVELOPMENT.md) and [architecture](docs/ARCHITECTURE.md). Use your own account, a separate ROOMS_PROFILE and an isolated backend when service changes require one. Client contributions do not require production credentials or Apple Developer membership.

1. Describe the observed defect or intended user journey before changing it.
2. Keep changes scoped; separate behavior changes from broad formatting.
3. Update the typed contract and relevant validation when crossing a runtime boundary.
4. Run relevant regressions and the normal lint/type/test/build checks. State platform/provider/device limitations.
5. Submit a PR with the problem, resulting behavior, verification and migration/configuration impact.

Preserve route-independent voice, native credential storage, current authorization and account/channel invalidation. Never restore synthetic production data or weaken tests to manufacture success. Do not access or disrupt another community for development.

Use pnpm format for consistent formatting. Logical packages currently share one root toolchain and TypeScript alias map. Add a real workspace manifest only when an independently enforced/released boundary justifies it.

Maintainers review and sign official releases separately. Never send Keychain exports, private SSH/signing keys, provider sessions or production environment files in a PR. Do not run release:mac:publish as a build check. Security concerns follow SECURITY.md.

