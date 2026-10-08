# Spacebar compatibility

ROOMS uses unmodified upstream https://github.com/spacebarchat/server at commit `0eb6f04f6d8055dba0194d10c47c33e074a8a281`. The container builds upstream source and its lockfile; it is not a ROOMS backend fork.

## Security boundary

Spacebar supports `register.requireInvite=true`. Source inspection found an upstream constraint: registration creates the account before `Invite.joinGuild` validates a supplied invite. Missing invitations are rejected before account creation, but invalid invitation strings may leave orphan accounts. The public nginx endpoint routes registration/login through the ROOMS access service, which checks invitations before registration and requires real guild membership after authentication. Raw upstream port3003 is a loopback bootstrap/test exception only and MUST be removed from production compose ports. Keep all other upstream administrative registration-token endpoints private.

The adapter belongs in Electron main. Authentication tokens never belong in renderer state, URLs, exported diagnostics or activity payloads. HTTP is allowed only for loopback development; production requires HTTPS/WSS. Gateway origins are checked against the configured social origin.

## Upstream build caveats

The pinned commit builds successfully on Linux ARM64/Node24, but upstream's own `patch-package` reports nonfatal mismatches for body-parser patch2.2.2 against dependency2.3.0 and typescript-json-schema patch0.67.4 against0.68.0. This is an upstream production-readiness constraint. Do not silently claim a clean upstream dependency installation; test the needed API paths and resolve the upstream patches before an Internet-facing release.

## API mapping

- Auth: POST `/api/v9/auth/login`, POST `/auth/register`, GET `/users/@me`.
- Spaces: GET `/users/@me/guilds`; channels GET `/guilds/:id/channels`.
- Messages: GET/POST `/channels/:id/messages`; PATCH/DELETE `/channels/:id/messages/:id`.
- Invitations: GET/POST `/invites/:code`; POST `/channels/:id/invites`.
- DMs: GET/POST `/users/@me/channels`.
- Permissions for media broker: GET `/channels/:id`, `/guilds/:id/members/:userId`, `/guilds/:id/roles`.
- Gateway: GET `/gateway`; JSON v9, HELLO/IDENTIFY, ACK-checked heartbeat, RESUME, exponential reconnect, normalized message events and raw compatible presence events.

`SpacebarClient` provides these methods with typed normalized user/space/channel/message/invite models. Error messages are deliberately sanitized and never echo upstream bodies or credentials.

## License and source availability

Upstream package declares AGPL-3.0-only; source files contain AGPL notices, and `COPYING` accompanies upstream. Distribute its complete corresponding source, notices, build instructions and exact revision with server distributions. If a modified version is later served to remote users, provide the corresponding source offer required by AGPL section13. ROOMS currently makes no modifications to upstream source. Separate-service and client linkage boundaries need license review before public distribution; separation alone is not a promise that obligations disappear. Upstream source is available at https://github.com/spacebarchat/server/tree/0eb6f04f6d8055dba0194d10c47c33e074a8a281 .

## Evidence

See the generated sanitized `docs/SPACEBAR_TEST_RESULTS.json` once integration tests complete. Missing test evidence means implemented but unverified, not working by assumption.

### Verified native development result

On macOS ARM64, unmodified upstream built on a case-sensitive local volume and ran with official Node24.21.0 and a separately owned PostgreSQL16 cluster. Public endpoint3011 (access gate) verified two distinct account authentication, real guild/channel membership, two Gateway READY sessions, cross-account MESSAGE_CREATE delivery, message edit/history/delete, forbidden cross-user edit, missing/invalid invitations, and fresh Gateway reconnect. Docker itself remains blocked by the host OrbStack kernel issue.

**Presence is BLOCKED by an upstream bug.** `src/gateway/opcodes/PresenceUpdate.ts` selects only `client_status` from `Session`, then calls `session.getPublicStatus()`, which requires the missing `status` property. Actual `idle` updates emitted a self-only event with omitted `status` and empty `client_status`; the other account received no idle update. The observed `offline` events came from disconnect broadcasts. The adapter does not invent online state or patch upstream. Until upstream corrects this, UI must show presence unavailable/unknown; transport connection status remains separately verified. The integration report intentionally records this failed acceptance test.

### Additional verified APIs and constraints

Member listing passes an explicit `after=0` cursor because upstream coerces missing `after` to the literal string `undefined`. Block/unblock, per-user read acknowledgement and rejection of a non-owner kick against the owner are covered by actual API tests. The media broker checks real guild roles/channel overwrites before issuing room-scoped five-minute grants; invalid and unauthenticated requests are denied.

Upstream's invitation creation currently applies `temporary: body.temporary || true`; an explicit `false` is ignored. Do not promise permanent-member invitation policy until upstream fixes that behavior. Repeated gateway test connects produced an upstream `MaxListenersExceededWarning` for process stopping listeners. It did not prevent message or reconnect tests, but long-session memory behavior requires upstream investigation before release.

Gateway events passed to the renderer bridge are restricted to domain events; arbitrary upstream auth/session dispatches are not forwarded.

Sanitized raw presence observations are recorded in `SPACEBAR_PRESENCE_EVIDENCE.json`. The public-gate integration suite currently records 15 passes and one intentionally failing upstream presence acceptance test. Successful invitation signup and single-use invitation rejection are exercised; the additional temporary test member is removed after the test.
