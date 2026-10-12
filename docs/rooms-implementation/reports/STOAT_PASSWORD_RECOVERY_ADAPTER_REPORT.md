# Stoat password recovery adapter

Date: 2026-10-10. Scope: native Stoat adapter only; no renderer, IPC, remote service, SMTP configuration, deployed account or production secret changes.

## Official source contract

The adapter follows the project's pinned upstream v0.15.5 source:

- [Send password reset](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/account/send_password_reset.rs): `POST /auth/account/reset_password`, body `{email,captcha?}`, success `204`. After syntax/captcha checks, upstream intentionally hides account lookup and email failures to prevent enumeration. A `204` proves neither account existence nor email delivery.
- [Confirm password reset](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/account/password_reset.rs): `PATCH /auth/account/reset_password`, body `{token,password,remove_sessions?}`, success `204`. Upstream enforces reset token validity, password policy, one-time consumption, and optional session deletion.
- [Account request models](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/models/src/v0/accounts.rs): public request shapes above; upstream defaults `remove_sessions` to false. ROOMS explicitly defaults it to true unless the caller selects otherwise.
- [Public root configuration](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/root.rs): `features.email` reflects configured SMTP host; `features.captcha.enabled/key` exposes the requirement and public hCaptcha site key.
- [Captcha verification](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/database/src/util/captcha.rs): enabled hCaptcha requires an upstream-verified token. The adapter never bypasses this check.
- [Account reset email generation](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/database/src/models/accounts/model.rs) and [email templates](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/database/src/util/email.rs): actual email transport and application reset-link configuration remain server prerequisites.

## Added API

`StoatClient.passwordRecoveryCapabilities()` returns `{emailEnabled,captcha:{required,siteKey}}` after validated public root configuration. Unknown/malformed configuration fails closed.

`requestPasswordRecovery({email,captcha?})` reads that configuration, rejects disabled email or absent required captcha before the reset POST, and returns only `{accepted:true}` for exact `204`. It does not disclose whether an account exists.

`confirmPasswordRecovery({token,password,removeSessions?})` sends the official PATCH and returns `{completed:true}` only for exact `204`. Invalid tokens produce a local constant error code. No upstream diagnostic body is surfaced.

All recovery fetches are unauthenticated even if the client already holds a session/bot token, use `credentials:omit`, `cache:no-store`, `redirect:error`, a 15-second AbortSignal timeout, and no retries. Inputs are length/control-character bounded. Reset tokens, passwords and captcha solutions are not retained on the client, emitted, or logged. The caller must keep them ephemeral too; renderer/main integration remains root-owned.

## Local verification

`pnpm exec vitest run --config vitest.config.ts tests/stoat-password-recovery.test.ts` exited 0: 11/11 tests passed. Fetch is fully mocked. Cases cover official methods/bodies, unauthenticated headers, exact status acceptance, captcha gating, email/config gating, default and explicit session removal, bounded validation, timeout configuration, sanitized failures, and no retry. No remote calls or email-delivery verification were performed. No broad type/build/acceptance checks were run by this agent.

## Remaining external prerequisites

SMTP must be configured and actually deliver mail; `features.email:true` alone is only a configuration signal. Upstream email generation links use the configured application host and `/login/reset/` route, so reset links need a reachable supported Stoat web application or an explicitly implemented ROOMS handoff. ROOMS must not claim a delivered email or working external reset-link integration from the adapter result. A server with hCaptcha enabled additionally needs an approved challenge UI using the exposed public site key. The adapter accepts a solution but does not implement that UI.
