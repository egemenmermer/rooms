# Security and privacy model
This chapter explains intended controls and boundaries. It is not a completed penetration test or a guarantee that every provider/platform/production configuration is accepted.

## Trusted components
Electron main, configured social backend, core operator and the scoped access/Activity services are trusted to process user data. The optional Agent host is a separate trust boundary with distinct resources/credentials.
The renderer is sandboxed, lacks Node integration and accesses privileged operations through a narrow preload bridge. Native code checks the exact window/main frame/trusted origin and validates typed input.
TLS protects server communication; LiveKit uses realtime transport encryption. The architecture does not claim end-to-end encrypted chat/media against server operators.

## Authentication and authorization
Persistent authentication/provider credentials belong to native encrypted storage, not renderer localStorage or room state. Requests use actual current social identity/membership, not UI-selected roles or fixture users.
Access permissions include view/connect/speak/video/listen and upstream role/channel overrides. Media JWTs are short-lived; webhook admission and periodic current membership checks support revocation.
Revocation is asynchronous: a signed token is not instantly invalidated cryptographically merely because a UI state changed. Test delayed arrivals/reconnect and denied tracks explicitly.
Account tickets and community invitations are distinct. Conservative claim-before-create state prevents blind retries after uncertain account creation.

## Local file, screen and network capability
A user explicitly selects local files or capture sources. Native code returns opaque handles/capabilities with scoped lifetime; stop/logout/account changes invalidate relevant state.
Navigation/webviews/window opening and iframe capture are constrained. A hosted player must not receive privileged main-frame/device authority.
Personal-provider fetches reject private/reserved addresses, constrain redirects and protect secret-bearing requests. Uploaded/exported data is bounded and validated rather than trusting arbitrary renderer paths.

## Shared state and hidden information
Strict Activity schema rejects credential-bearing personal source data. Commands authenticate the caller; revisions/idempotency receipts protect state transitions.
Game projections expose the caller’s allowed hand and public results, not the private deck or another player’s hidden cards. Active recovery snapshots still contain sensitive server state and need protected backups/operators.
Cache invalidation must purge revoked channel/account data and fence late async responses.

## Optional execution
Agent workers/browser cannot be cohosted as privileged “just another core feature.” They require separate grants, own model profiles, exact resource scopes, bounded execution and verified egress.
External writes have concrete approval/journal/reconciliation semantics. Automatic mode does not grant access beyond configured scope. Uncertain side effects cannot be resolved with blind repeated writes.

## Provider/content boundaries
Account-owner authorization to use a source/session is distinct from provider and content-owner permission to redistribute media. The music extractor is not the official YouTube player. Personal source credentials must not be shared to other room members.
Do not imply Spotify audio rebroadcast, DRM bypass, broad provider availability or public distribution rights based on a working decoder. Public asset rights need their own provenance review.

## Operation and disclosure
Never publish secret/configuration archives, private sessions/model homes, account delivery files, cookies, signing/notary keys or database dumps in docs/static roots.
The public website is generated from an explicit chapter/asset allowlist; private release reports/operator deployment receipts remain in the private GitHub repository. Static serving uses an exact /docs route and does not browse the whole volume.
Logs/diagnostics should use bounded public categories and release identity while excluding credentials/message contents. Process health is not a comprehensive dependency/security check.
Privacy/terms, retention, export/deletion and support/operator response must accurately reflect current data handling before public release.
