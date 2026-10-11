# S04 safe password reset and session-expired sign-in

Date: 2026-10-11. Scope: real upstream confirmation wiring, main-only reset-token ingress, actual onboarding components and isolated DEV entry. No remote service mutation or account/email acceptance occurred.

## Original reference review and corrected mapping

All four immutable S04 PNGs were opened individually: `S04_account_recovery.png`, `S04_account_recovery__sent.png`, `S04_account_recovery__reset.png`, and `S04_account_recovery__expired.png` under `/Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/`.

The original **expired** image is a **session-expired sign-in screen**, with email/current password and a login-and-continue action. It is not an invalid-reset-token form. Previous reports/tracker text conflating those states is superseded by this original review. `ReferenceOnboarding` maps only the existing actual `AUTH_EXPIRED` error, signed-out identity and error status to the expired sign-in treatment; a generic connection failure or query flag cannot create it. `ConnectionPane` keeps actual native sign-in submission. Root owns the app-level navigation/return-route integration.

The reset image establishes the two new-password fields and save action. These use actual `PasswordResetPane` controls. Owner-required utilitarian copy and absence of synthetic social cards/marketing remain deliberate differences. No image is used as a production background or full-screen implementation.

## Safe native ingress and confirmation

`apps/desktop/electron/password-recovery.ts` implements `PasswordRecoveryBroker`:

- Only an explicit import command reads the clipboard; asynchronous Electron 44 clipboard receipts are fenced by native epoch and import generation. A newer import, scope change or broker clear invalidates a delayed read.
- Selected HTTPS Stoat configuration determines the confirmation destination. The pasted URL is never opened, followed or fetched. It must use the exact selected server origin, `/login/reset/`, and a literal 32-character URL-safe nanoid. Queries, fragments, credentials, encoded tokens, traversal, HTTP and different application origins are rejected. The official upstream produces 32-character reset tokens; arbitrary unknown application hosts are not trusted.
- The renderer receives only a random opaque UUID, local expiry and safe origin. The reset URL/token stays in native memory. Capabilities expire after three minutes with an actual native deletion timer, bind to sender/server/native auth epoch, are replaced on a new selection, and are consumed before confirmation. Cancellation/quit/scope invalidation removes native selections.
- Confirmation uses a fresh unauthenticated Stoat client and official PATCH with `remove_sessions:true`. No existing session token, persistent recovery secret, vault write, gateway operation, retry or redirect is introduced.
- Only the adapter's known `PASSWORD_RECOVERY_INVALID_TOKEN` result becomes invalid-token UI. Local capability expiry is distinct. Known pre-mutation bad-input status is rejected; transport/server/unexpected outcomes are uncertain because a password mutation might already have occurred. Uncertain outcomes consume the capability and tell the user to try sign-in first. No automatic retry occurs.

Root integrates the shared contract, preload and validated main handlers. These reject native fixture access and sanitize errors. Root also owns account-attempt/session/native lifecycle invalidation; this report does not certify a live account transition or delivered-email flow.

## Renderer and isolated fixtures

`PasswordResetPane` stores only transient new-password drafts. The confirmation field is local-only; IPC sends the opaque handle and one password. Drafts clear before awaiting a receipt and on account/server change, expiry, cancellation and unmount. Stale imports are cancelled; stale confirmation receipts cannot claim completion in another view. The native result does not automatically authenticate or fabricate presence.

`ReferenceOnboarding` offers `Kurtarma bağlantım var` before/after a generic request and switches between named local request/reset views. It uses the saved server preference, ignores query-provided reset token/server values for recovery, and mounts the reset pane with existing identity/server/status scope. Recovery routes contain no reset secret. The original request pane still disables SMTP/hCaptcha prerequisites and claims only request acceptance.

`dev/S04RecoveryEntry.tsx` reuses `ReferenceAuthFrame`, request/reset panes and `ConnectionPane`. Its runtime is imported only through the DEV app entry and is explicitly labelled demo. Request/sent captures require actual local form actions; reset captures require the actual local import action. Fixture confirmation deliberately throws rather than changing any account. The native bridge is never invoked by these local fixture runtimes. Root owns app/capture-tool integration and screenshot receipts.

## Actual local verification

Final focused command:

```text
pnpm exec vitest run --config vitest.config.ts tests/stoat-password-reset-broker.test.ts tests/stoat-password-reset-ui.test.tsx tests/stoat-password-reset-onboarding.test.tsx tests/stoat-password-recovery-ui.test.tsx tests/stoat-password-recovery-ipc.test.ts tests/stoat-password-recovery.test.ts
```

Observed exit 0 at 03:13:35 Europe/Amsterdam: **6 files, 67 tests passed**, 2.66s. Breakdown: broker 25, reset pane 7, actual onboarding/DEV entry 5, prior request pane 6, expanded validated native IPC 13, existing upstream adapter 11. Fetch/Electron/clipboard are mocked; tests are development-only. Cases include exact-origin URL rejection, no renderer token, one-use capabilities, sender/server/auth fences, delayed clipboard invalidation, native timed deletion, uncertain mutation handling, transient draft clearing, saved-server versus query isolation, real sign-in callback and fixture denial of native operations.

After a DEV-only label placement adjustment, `pnpm exec vitest run --config vitest.config.ts tests/stoat-password-reset-onboarding.test.tsx` also exited 0: 5/5 passed. The label is fixed in the titlebar and does not affect the auth-form flex geometry.

An initial UI test run lacked the explicit jsdom environment; that test harness declaration was fixed before the passing run. The asynchronous clipboard integration initially bypassed the main import catch; root added `await` so sanitized errors are verified. Early epoch tests were updated to reflect native deletion of invalidated handles rather than an assumed retained handle. These failures are not acceptance evidence.

No standalone build/typecheck, broad test suite, native clipboard OS check, actual password reset, SMTP delivery, external challenge, Windows check or visual acceptance was performed by this bounded implementer. Root owns integrated build/capture and tracker updates; their separate receipts must be retained with actual timestamps/source manifests.

## Primary-source contract reviewed

- [Pinned Stoat password reset route](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/account/password_reset.rs): official PATCH shape, password policy, one-use token, optional session removal and invalid-token response.
- [Pinned account model](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/core/database/src/models/accounts/model.rs): native reset token generation and expiry, reset-email generation.
- [Pinned public root route](https://github.com/stoatchat/stoatchat/blob/v0.15.5/crates/delta/src/routes/root.rs): recovery email/captcha configuration does not establish a trusted separate application origin.

## Remaining actual gates

A same-origin HTTPS reset email link can be imported and confirmed through the implemented native path, but actual SMTP delivery, new-password login and upstream session revocation remain unverified against an authorized test account. If the server's configured Stoat **application host differs from its selected API origin**, ROOMS intentionally rejects that link; use the configured Stoat web reset flow until an explicitly trusted application-origin configuration exists. No application origin is guessed or learned from arbitrary clipboard content. SMTP/hCaptcha requirements of the request flow remain unchanged.

Exact current screenshots, all four original comparisons and owner manual acceptance remain open until root supplies the timestamp-bound receipts. The presence of these files or passing local tests must not mark S04 visually verified or claim an actual account password changed.
