# Community roles

Settings → Members and roles → Roles exposes a compact role editor. Names and
hex colors are independent from permissions; each tab has an explicit save.
Kanka, Yayıncı and Moderatör are editable draft presets, never automatic grants
or member assignments. Members can hold multiple roles.

The editor supports twelve upstream permissions: view, send, files, connect,
speak, video, manage messages, manage channels, assign roles, manage roles,
manage permissions and kick members. Each value is inherit, allow or deny.
Unexposed permission bits survive edits. Server defaults and channel overrides
continue to apply; this is not a replacement permission engine.

Electron validates each mutation and the typed Stoat adapter reads current
membership, role hierarchy and grantable permissions before sending it to the
upstream API. Appearance/create/delete use ManageRole; permission changes use
ManagePermissions. The upstream server reauthorizes every write. Credentials
remain in the main process. A saved write with a failed refresh has a separate
error and is never automatically repeated.

Regression coverage includes exact pinned API payloads, high permission bits,
hierarchy and grant escalation rejection, strict IPC/trusted-sender validation,
save failures, unsaved drafts, role presets, and gateway invalidation during
save. Development projections remain labeled and cannot mutate an account.
Mock tests and isolated packaged-app checks do not establish live multi-user
acceptance; verify create, edit, reopen and assignment against a real community
before reporting that acceptance.
