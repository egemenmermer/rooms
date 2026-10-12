# S04 recovery request integration

Date: 2026-10-10. Scope: desktop request-only recovery; renderer reset confirmation remains intentionally unavailable.

## Implementation

- Added `SocialPasswordRecoveryCapabilities` and typed `SocialBridge.passwordRecoveryCapabilities(serverUrl)` / `requestPasswordRecovery({serverUrl,email})` in the shared contract and preload.
- Native community handlers validate sender and strict fields, create an isolated unauthenticated Stoat client, and leave the current client, gateway, vault, user and authentication epochs unchanged. At most one recovery request is pending. Missing SMTP or required hCaptcha without a real desktop challenge is blocked natively, even if a renderer attempts the request.
- `PasswordRecoveryPane` in `ReferenceOnboarding.tsx` reads the existing saved server preference. Recovery does not use query-provided server/reset-token values. Email is ephemeral component state; it is cleared on server change and accepted response, and is not stored or included in URL/query parameters. Pending results are discarded on unmount or server change.
- The form is disabled while configuration is loading, unavailable, SMTP disabled or hCaptcha required. The latter two states give precise reasons. Unknown configuration fails closed. Retry reconnects public configuration, and back returns to sign-in.
- All accepted requests show the same generic wording: “İstek kabul edildi. Hesap uygunsa sunucunun e-posta kurtarma bağlantısıyla devam edebilirsin.” This claims neither account existence nor email delivery. Native/server diagnostics are not displayed by this pane.
- The bridge exposes no token-confirmation API, password/reset-token field, captcha solution field, storage operation or reset URL handler. The adapter-only confirmation method remains native code and is not exposed through preload or IPC. Upstream's configured web reset flow owns those secrets.

## Deliberate owner-copy differences

The persistent owner instruction supersedes promotional reference copy. Removed the auth artwork's slogans, tagline, private-friends marketing line and eyebrow. Kept the ROOMS mark and visual sculpture. Welcome now uses “Giriş”, “Giriş yap” and “Davet aç”; profile/device/invite headings are utilitarian. These are intentional text differences from the immutable artwork and must not be restored during visual comparison.

## Local verification only

- `pnpm exec vitest run --config vitest.config.ts tests/stoat-password-recovery-ui.test.tsx` — exit 0, 6/6 passed. Mocked bridge: selected server, generic acceptance, no localStorage persistence, SMTP/hCaptcha disabled states, unavailable configuration/retry, stale server response rejection, functional back navigation.
- `pnpm exec vitest run --config vitest.config.ts tests/stoat-password-recovery-ipc.test.ts` — exit 0, 7/7 passed. Mocked Electron/Stoat: untrusted sender rejection, isolated recovery during an existing login, strict rejection of token/password/captcha extras, native SMTP/hCaptcha gates, one pending request and guard release after failure.
- Prior isolated adapter suite: 11/11 mocked tests, documented in `STOAT_PASSWORD_RECOVERY_ADAPTER_REPORT.md` with pinned official primary-source links.

No remote calls, account mutations, SMTP changes, delivered-email checks, production-data changes, full build, broad tests or visual acceptance were performed by this agent. These focused fixtures are development-only evidence. Root owns integration/build checks and tracker updates.

## Remaining blocked gates

S04 token confirmation/reset and expired-token desktop states are still blocked by the deliberate no-renderer-reset-secret boundary. They must not be marked complete from this request pane. Email delivery remains unverified; the server must configure SMTP and a reachable application reset host. Upstream constructs `/login/reset/{token}` links using its application host. If hCaptcha is enabled, users must initiate recovery in the supported Stoat web flow until a genuine approved desktop challenge is implemented. Configured SMTP and a `204` response alone do not establish delivery or working link routing.
