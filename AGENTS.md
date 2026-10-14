# ROOMS engineering instructions

- Communicate with the current owner in their preferred language; write code and technical docs in English.
- Root implements/reviews work; do not delegate without explicit user authorization.
- Preserve the existing Electron/React client, typed Stoat adapter, replaceable media transport and route-independent voice.
- Every visible control must work or explain why it is unavailable. DEV fixtures must remain labeled and excluded from production paths.
- Privileged operations and persistent credentials stay outside the renderer. Validate IPC, source/network permissions and server membership.
- Keep personal media connections private. No provider-token distribution, unauthorized rebroadcasting or DRM bypass.
- Prefer scoped fixes and meaningful regression checks. Do not equate unit/mock/native shell checks with physical two-client transport.
- Do not deploy, sign, publish or run disruptive remote tests unless the user authorizes that operation.
- Never commit generated secrets, account files, private assets, signing keys, database snapshots or private operator evidence.
- Read docs/ARCHITECTURE.md and the relevant module before changing behavior. Keep format-only changes separate from functional changes.

