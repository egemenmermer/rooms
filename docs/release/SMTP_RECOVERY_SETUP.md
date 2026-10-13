# Private SMTP recovery setup

## Inspection — 2026-10-13

Owner authorized completing recovery email. Read-only SSH inspection of `/opt/rooms/config/Revolt.toml` confirms no `[api.smtp]` section. Relevant environment files on server and project have no configured SMTP/provider keys. Public `GET https://62.238.119.134/api` reports `features.email=false`. Existing app/API hosts are `https://62.238.119.134` and `/api`; invite-only registration remains enabled. No live config, account, credentials or process was changed.

Pinned upstream v0.15.5 root feature derives email capability from nonempty SMTP host; it does not prove successful delivery. The default SMTP schema includes host, username, password, from_address, optional reply_to/port/use_tls and expiry configuration. Never mark delivery accepted solely from this flag.

## Required external input

Owner must identify an authorized SMTP sender/provider. No stored usable sender was found. Credentials must enter an owner-controlled private file or provider UI, never chat, committed config, build artifacts or logs. A domain/provider account cannot be invented or a Gmail mailbox used without its authorized mail credentials. Keep SMTP disabled until a verified sender and secure transport can be tested.

## Apply and verify once sender is available

1. Verify pinned upstream transport behavior for chosen TLS mode/port. Prepare complete config privately, validate without printing credentials. Validate authenticated secure SMTP sender acceptance.
2. Preserve live config in a private rollback file and record its hash; preserve invite-only/CAPTCHA/host/service settings. Confirm existing account verification behavior before enabling mail, without rewriting account records.
3. Atomically install the minimal SMTP change; reload only services that read this config, using their existing deployment procedure. On health/mail failure restore prior config and relevant services. Do not change databases, secrets unrelated to mail, Hoppers, volumes or current accounts.
4. Verify API healthy and email capability true. Send only an owner-authorized account-neutral recovery request. SMTP acceptance is separate from actual inbox receipt. Confirm the link origin/path matches the native trusted-link importer; never log the link/token.
5. Owner imports received link and enters/submits new password themselves. Verify subsequent sign-in and desired session revocation with owner participation. No agent may set or print their password.

Client origin handoff fix is committed at c10a5cb and locally tested; installed RC.1 remains unchanged. New packaging/installation and live delivery/reset acceptance are still pending. Existing immutable notarized RC and rollback bundles remain available.


## Owner steering — 2026-10-13

Owner deferred SMTP setup (“tamam kalsın”). Do not continue sender provisioning or deployment without renewed instruction. The separate owner password-change request remains open; no new password was set and no credentials were copied into Trello or chat.
