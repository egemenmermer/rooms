# Server operations delivery

Owner-approved sequence: monitoring → persistent operator terminals → human/Agent collaboration → consented remote desktop control. Each stage has independent acceptance and release gates. No physical-device acceptance is implied by source or CI checks.

Initial deployment shares the existing physical Core server. This explicitly replaces the earlier separate-host-only assumption for the new rootless runner; the existing dedicated Docker runner remains a separate-host option. Agent may never receive Core credentials, Core network membership, a host/root shell, Docker socket or personal provider vault. Separate logical workloads on one machine are not physical isolation. Host registry identities permit later migration.

Access is owner plus explicitly delegated host-specific monitor/terminal/Agent grants. Community membership and Agent canManage are not host permissions. Human host terminals and Agent workspace terminals are distinct; only the latter can be handed to AI. One writer per session. Revocation, account changes and source changes fence asynchronous results.

Defaults: sample every5s; raw24h/minute7d/hour30d. CPU alert85%/60s, disk free15%, backup age24h, unhealthy services. No sensor means unavailable. Operators3 terminals; detached24h; bounded1MiB scrollback without persistent transcripts. Agent1 active job,0.5CPU,512MiB worker/768MiB aggregate,128processes,2GiB workspace,15minutes. Admission requires CPU≤70%/60s, available RAM≥1GiB and disk≥6GiB. Sustained CPU>90%/30s or availableRAM<512MiB interrupts Agent execution; uncertain external operations are not replayed.

Remote control is humans only, full selected monitor, Mac+Windows. Publisher must approve each control session; loss of sharing/identity/membership/network ends it. No reconnect auto-grant. No clipboard synchronization, file transfer, unattended access or AI desktop control. OS permission/elevation restrictions are never bypassed. Global emergency release: Ctrl+Alt+Shift+K (Control+Option+Shift+K on macOS).

## Delivery ledger

Implementation started from main8946b2f. Inspection confirms existing Agent tasks/approval/checkpoint APIs and isolated ephemeral Docker commands, but no host monitoring, persistent PTY or native remote-input backend. Shared-host operation needs an explicit rootless runner and distinct Linux identity, not removal of existing guards. Current live Core has2logicalCPUs/~4GiB RAM; a single load-average snapshot does not certify capacity.

Pending gates: isolated behavioral/security tests, actual collector/PTY/rootless execution, permission revocation/restart tests, native Mac/Windows control tests with physical participants, measured voice/DJ coexistence, approved phase rollout and rollback. Account data, Hoppers and retained release archives must be preserved. No release or acceptance is claimed by this ledger.

## Implementation checkpoint — 2026-10-15

Stages1–2 source implementation: optional HostOps service, strict shared schemas and native Electron gateway; owner/delegated monitor/terminal/Agent permissions; Linux CPU/memory/disk/network collector, bounded SQLite history and deduplicated alerts; Settings → Server; resumable human terminals using a separate tmux service and server-only node-pty kit. AI host-shell access remains absent. No production route, operator identity or client release was enabled by this checkpoint.

Tracked implementation defects and regression coverage:

- OPS-001: metrics were absent. Added actual Linux readings; missing sensors/media metrics stay null. CPU startup and network counter resets are tested.
- OPS-002: no persistent operator terminal existed. Added owner/session sharing, one writer, monotonic input,3-session/24h limits and private helper profiles. Distinct operators cannot reuse a Linux profile.
- OPS-003: initial SQLite alert ordering used an invalid JSON path. Corrected and tested acknowledgement isolation, deduplication and history retention.
- OPS-004: a late WebSocket close callback could persist state after broker shutdown. Added an idempotent shutdown fence; the full suite now checks clean termination.
- OPS-005: revoking one shared session detached other sessions. Revocation now targets the selected session; operator removal/profile changes also terminate owned sessions and clear previous shares.
- OPS-006: streaming responses could outlive account changes. Native body completion and renderer identity/host generations fence stale responses; tests cover account switching.

Verification evidence is private under `.local/qa/hostops/`. Linux smoke used an isolated, unprivileged, network-disabled, read-only Node container with strict CPU/RAM/PID limits: real2-core CPU/memory data and SQLite passed; temperature was correctly unsupported. A separate temporary unprivileged systemd/tmux service produced a terminal marker through its private socket and was stopped/collected. This is not full node-pty/broker/UI restart acceptance. Electron UI fixture is explicitly labeled and isolated from real accounts;1440×900 and900×700, keyboard and operator disclosure checks passed.

Open gates before stage1/2 rollout: install/verify the optional Linux native kit and root-owned profiles/units, end-to-end PTY/Unicode/Ctrl+C/resize and broker restart, configure the private reverse proxy, measure collector cost with real voice/DJ use, and verify alert transport outside the open Server view. Media bitrate/RTT/loss/jitter and service error rates remain unavailable until an actual scoped source exists. No6-person/two-hour physical acceptance is claimed.

Stages3–4 remain unimplemented: rootless shared-host runner and aggregate quotas/admission, human–AI workspace takeover/checkpoint integration, host migration transport, and consented native Mac/Windows desktop input with emergency release. Keep `agentAvailable:false`; preserve the existing dedicated Agent backend guards. Those stages cannot be marked complete from the monitoring/terminal tests.

Validation checkpoint: `pnpm verify:ci` passed lint, strict TypeScript,135test files/875tests, desktop build/notices and all service bundles. Subsequent terminal hardening passed14focused tests plus TypeScript/lint/service build. No signature, installation, update feed, tag or release artifact was changed.

- OPS-007: two windows from the same account could previously submit input under one user-level writer. The broker now binds writes to one connection; read-only state is projected per connection. Late terminal actions are fenced when the host/panel/account changes.

A separate ephemeral Linux CI job now installs the pinned node-pty kit with a narrowly scoped build approval and tests the real root-owned helper/unprivileged tmux chain: Unicode, resize, Ctrl+C, detach, broker reconstruction, once-only counter and explicit termination. Its result must be checked before treating that gate as passed. It never uses production profiles or credentials.
