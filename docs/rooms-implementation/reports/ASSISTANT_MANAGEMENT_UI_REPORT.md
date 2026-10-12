# S70 actual authority UI integration

All five original PNGs reviewed individually: default, history, discord, discord_disconnected, permission. Prototype assistant.js S70 and assistant.css table/tab metrics inspected. Appearance remains awaiting exact visual and functional acceptance.

Entry: `/settings?tab=assistant-permissions`. Actual component AssistantManagement.tsx with reference-agent-management.css, typed native AgentBridge.authority/audit, server grant projection. Changes in community identity, server URL or room clear previous data immediately and discard pending responses. Authorized actual public member names supplement safe actor identifiers; no model keys, file paths, task prompts or private connection labels appear in history.

Permissions tab maps actual canManage/principals and configured read/write scopes. Saving is disabled with precise server-admin configuration reason: no mutation endpoint exists. Nonmanagers see the permission state; history uses own-only server projection. Filters work on returned actor and action values. Inspect navigates to actual task UUID. Raw safe action codes remain visible when no localized label exists.

Discord tab reports configured/not-configured/unknown rather than claiming gateway connectivity. Fixed mention-only policy, real authorized mappings, own model selected/missing and others' private metadata distinction preserved. Connection management remains disabled with server-admin reason. No OAuth account automation or pretend connected result.

DEV exact five variants use real production component through opt-in reference-fixtures; native Agent operations remain rejected. Shared social/voice baseline is explicitly installed as local example state. Original conceptual permissions/per-person external tool capabilities and gateway-connected badges cannot be inferred from current server response. These are recorded gaps, not fabricated fields.

Captures under `.local/design-review/evidence/S70-<variant>/`; receipts identify current code source hash and original hash. Initial capture wrongly recorded lazy loading: capture runner now waits for actual S70 component and projected status before saving. That initial image is superseded. Latest Settings full screen surface supersedes older popup geometry per new immutable reference task. Root has not marked any S70 record visually accepted.

Verification: focused agent-authority/channel-access/whiteboard export 11/11 tests passed; activity long-poll capability1/1 passed; separate Agent HTTP core report17/17. Isolated native info/license/support preview passed, update feed unconfigured. No deployed Agent, physical voice or Windows acceptance claim. Current sources require fresh combined build after subsequent shell/game changes.
