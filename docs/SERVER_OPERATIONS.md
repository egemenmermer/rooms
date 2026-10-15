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

- OPS-008: actual Linux PTY CI exposed a size mismatch caused by tmux's extra status row. Disable that internal status bar: the desktop already displays host/user/session status. Keep the real33×91 terminal assertion; do not weaken it to mask a row loss.

## Shared-host runner work — 2026-10-15

- OPS-009: the existing Agent required a dedicated Docker host. Added an explicit optional rootless Podman backend; its default dedicated-host guards remain intact. Startup checks actual cgroups v2, root-owned aggregate limits, distinct UID and a private bounded persistent workspace filesystem. Worker arguments accept only offline per-task workspace commands; arbitrary mounts, model homes and network flags are rejected.
- OPS-010: shared-host tasks had no host-capacity admission/pressure guard. Added a continuous actual60s CPU window, memory/disk reserve,15minute duration and pressure interruption. Gaps/unknown measurements fail closed. Mutating-command uncertainty remains recorded rather than replayed.

Focused admission/mount-boundary and existing Agent tests passed17tests. Actual rootless runtime verification is being added as a separate disposable Linux CI job: UID/network/filesystem boundaries, actual cgroup limits, persistent files, cancellation and enforced ENOSPC. Do not enable production Agent availability until that job and shared terminal/grant integration pass. This is source work, not a deployment or release.

- OPS-011: CI rootless setup inherited the runner's private HOME/runtime/cwd. Give the disposable user a clean environment and accessible working directory; the production adapter also constructs a clean environment without provider/storage secrets or automatic proxy propagation. No folder permissions or OS isolation were relaxed.
- OPS-012: human takeover could otherwise overlap a model API/tool write. Added task-wide stop acknowledgement, isolated persistent rootless workspace shell, one writer and explicit close-before-resume; uncertain operations retain verification gates. The task terminal uses distinct process contexts with shared files, not the privileged host terminal. HTTP/WebSocket ownership and live grant revocation have focused regression coverage.
- OPS-013: Agent authority was independent of host operator grants. Added a private, membership-checked HostOps authority bridge, shared-mode startup requirements and ongoing task/detached-shell revocation checks. The renderer never receives the authority key or bot token.

Stage3 source is in progress: rootless runtime, workspace takeover/stream/native bridge and task UI are now present; actual Linux runtime/PTY, UI acceptance and deployment remain pending. Stage4 native remote desktop input and host migration transport remain unimplemented. Preserve `agentAvailable:false` until actual acceptance passes.

Stage4 issue recorded before implementation: OPS-014 — screen sharing has presentation handoff but no consented OS input. Implement per-source/per-track/per-participant consent, native permission/input boundaries and emergency revocation; never treat the existing presentation request as control approval. Native input must remain unavailable until its actual Mac/Windows checks pass.

Stage3 actual acceptance evidence: hosted Verify run38738821243 passed baseline, Mac native smoke, host PTY and the new rootless native job. Actual rootless test covered identity/network/readonly boundaries, enforced container/ancestor quotas, ENOSPC, cancellation, persistent PTY Unicode/33×91/Ctrl+C, broker reconstruction/no replay and grant revocation. This remains isolated CI, not live Core coexistence or physical participant acceptance. Source d6720c4 is pushed; no release/deployment was performed.

Stage4 source work: added ephemeral source/participant-bound human consent, a private native input gateway, Mac CoreGraphics/Windows SendInput adapter, local/emergency release, targeted signed data frames, independent reliable/lossy ordering, task/source/account fences, native confirmation and viewer controls. Measured data-channel round-trip uses signed ping/pong; no physical latency result is claimed. Details and the still-open physical matrix are in `docs/REMOTE_CONTROL.md`.

- OPS-015: a partial LiveKit permission update can clear unrelated booleans. Control transport updates now rederive all current voice/video/source permissions; tests assert mic/listening/screen preservation and control-data revocation on rejoin. Normal media tokens do not grant data publication.
- OPS-016: delayed UI input could otherwise target a newly approved lease. Main signing requires the originating lease ID, publisher approval is local/native, and dialog/source/account generations fence late results. Native tests use an injected adapter and never operate a real desktop.

Mac native compile/load/unapproved-input smoke passed locally. Windows native compilation/package-resource checks, full final CI/UI verification and physical consent/input/coexistence are pending. No server update, installer, update feed or release was published by this checkpoint.

OPS-017 recorded: task execution showed resource ceilings but had no actual Agent utilization projection. Add cgroup/volume measurements with explicit aggregate scope, missing-data handling and measurement time; do not present limits as usage.

OPS-018 recorded from actual Windows CI: native helper name `boolean` collides with Windows RPC SDK's typedef. Rename the N-API helper; retain the Windows compile/load gate. Also recheck OS input permission during an active lease, including secure-desktop changes; no elevation or permission bypass.

OPS-017 source fix: task execution now reports the dedicated Agent-user cgroup's measured CPU (normalized to host cores), memory and PID count plus bounded workspace-volume usage every5seconds. The scope is explicitly aggregate and timestamps/missing/reset/stale counters are shown honestly. Late reports are fenced to the running task/controller. Unit cases cover startup/reset/staleness/unavailable data; the actual rootless CI also reads real cgroup/volume counters.

OPS-019 recorded before fix: repeated upstream server REST authorization can exhaust its narrow read limit, and a static Agent room list does not notice a private-channel permission revocation. Reuse the existing find-only authorization adapter in HostOps, keep its database credential outside the Agent boundary, and intersect current channel visibility with the configured Agent room list on every authority refresh.

OPS-019 source fix: HostOps can use the existing find-only community reader to avoid repeated server REST reads. Shared Agent authority requires that reader and returns only the intersection of requested rooms and current channel visibility; denied/missing/malformed membership or channel context fails closed. No new bot or Core database credential is given to Agent. Focused permission-revocation/community-boundary tests passed, alongside TypeScript/lint.

OPS-020 recorded from prepared-host PTY acceptance: node-pty inherited an inaccessible invoking process cwd, producing `chdir(2) failed` before the fixed helper could attach. Give native launcher processes an explicit `/` cwd; the helper still selects only the fixed unprivileged profile directory. Do not broaden permissions on the invoking private directory.
