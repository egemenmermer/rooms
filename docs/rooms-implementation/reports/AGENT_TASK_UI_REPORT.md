# S56–S58 task, result and approval surfaces

Delivered 2026-10-10. Owned files: AgentTaskSurface.tsx, reference-agent-task.css, dev/agent-task-fixture.ts and this report only. Read BRIEF/CHECKPOINT/DECISIONS, prior master/reference instructions, actual AgentTask/AgentBridge/preview schemas, existing Agent and ArtifactPreview, AGENT_AUTHORITY_REPORT and ARTIFACT_PREVIEW_NATIVE_REPORT, immutable assistant.js/CSS and F08/F09 flows. All twenty inventoried original PNGs were individually opened at readable scale (including responsive originals); reference files were not edited.

## Root integration contract

Default and named AgentTaskSurface accepts task:AgentTask, models:ModelConnection[], userId, roomName, notify(message), onReturn(), onRefresh():void|Promise<void>, bridge:AgentBridge. Optional view:'task'|'result', connected:boolean, canManage:boolean, onManageConnection(), onHistory(), initialModal:'approval'|'uncertain', initialTab:'sources', fixture:boolean and fixturePreview:AgentArtifactPreview. Root passes actual AgentStatus.canManage, never community owner inference. Only own initiating model metadata is displayed; another user's private connection is not resolved from models.

Optional scopeKey must include root's current native Agent connection/server and access-invalidation epoch. Internal synchronous key also includes user/room/task/connected/pending-operation/uncertain-operation identity, clearing old previews, pending forms and dialogs immediately. Actual refreshed task snapshot remains parent-owned. onReturn leaves task execution intact, keeping the existing independent host lifetime. onRefresh does not retry or submit execution. Root may route into result through view or component's local result navigation. Missing connection/history callbacks are precisely disabled.

Any explicit fixture query OR fixture prop under DEV disables all privileged bridge calls before dispatch, including accidentally missing sample props. No production task/content is embedded in the component. Local sample plaintext is accepted only with matching task/artifact IDs and visible DEMO label. Native account methods are never used in fixture mode. Production ignores supplied fixturePreview. Plain previews use literal React pre text; no HTML, Markdown processing, active content, remote embedded resources or auto links.

Native reads use supplied bridge.previewArtifact exclusively. Responses apply only to live request generation and matching task/artifact identity. Root scope key/connected change unmounts old operation and invalidates response. Content-free community/channel invalidation clears preview/modal/verified drafts and fails closed until root refreshes the scope epoch. Source/artifact selection changes discard old preview before async completion. Native approve/cancel/resolve/download locks prevent duplicate operations; errors stay in modal/current surface. Success does not fabricate percent/stages, file readiness or completed external writes; parent onRefresh loads actual returned state. Save/cancel notification follows only actual native download boolean, after scope checks. Native download itself reauthorizes across the actual save-dialog lifetime (historical ten-test evidence in native report, not a renderer acceptance claim).

## Actual behavior and deliberate differences

- S56 default/running: actual task.prompt, state, progress strings, owner and room. A fixed neutral status track preserves composition; no arbitrary fill, total stages, denominator or completion percentage is inferred from progress logs. Logs have no projected timestamps or per-stage outcomes, so icons are neutral records rather than fabricated completed steps. Header uses actual prompt, because AgentTask has no separate short title/description.
- S56 waiting: real queued state and empty log. S56 completed: actual result/artifact metadata and open/download/result navigation. S56 failed: actual error without assuming provider quota or claiming no external change. S56 stopped: actual cancelled state and warning that prior external writes are not undone. S56 offline: connected=false shows retained task and asks for status revalidation; actual refresh only, no timer or implicit rerun. All three responsive originals use bounded main padding, rail collapse and wrapping.
- S57 default: actual artifact picker, supplied bridge plain-text preview and actual native download. White document styling matches composition while text stays literal; prototype styled HTML is deliberately not reproduced. No invented page count. empty uses real zero artifacts/result. preview_error handles actual rejected request, unsupported, too-large or unavailable projection, with retry and download where supported. sources opens precise unavailable list state with no fictional messages, source count, visibility ACL or provenance guarantee.
- S58 default: actual pending operation tool/description/preview and room/owner scope. Approval uses actual bridge.approve with server authorization; task owner or supplied actual Agent manager capability enables actions. Pending task-level approval without concrete operation is clearly labelled task execution. Dismissing a modal does not reject an operation. Explicit Durdur confirmation uses actual task cancellation, not an invented per-operation rejection API. There is no independent rejection method in AgentBridge.
- S58 unauthorized: actual owner mismatch/canManage false disables privileged action with precise reason. S58 uncertain: actual uncertain operation preview; manually recorded verified result or explicit checked-not-applied confirmation calls actual bridge.resolveOperation. No automatic retry, guessed target URL or fabricated last-send timestamp. No separate active connector state is claimed. Actual service does not cancel interrupted tasks; cancellation is not offered for that state.
- S58 approved/rejected: AgentTask currently lacks persisted approval/rejection receipt, approving actor/time and proof of an external target change. The component does not convert completed/cancelled task into a false Drive confirmation modal. Exact receipt surfaces are internal contract/implementation gaps. Source fixture metadata explicitly marks these limitations.

## Exact DEV getter

getAgentTaskFixture(id,variant) validates exact S56/S57/S58 keys and throws for unknown IDs/variants and non-DEV execution. It allocates fresh task/model/preview objects and exports typed AgentTaskFixture. Task/model/artifact IDs are valid UUID-shaped local IDs; pending operation ID is 64 hexadecimal characters. No native/runtime/store installation, account credentials, bridge mutation or timer occurs. Root installs its isolated common shell and maps fixture.modal to component initialModal, fixture.view/initialTab/connected/canManage/fixturePreview to matching props plus fixture=true. Samples are visibly LOCAL_FIXTURE and never certify real presence, source provenance, provider or external writes.

All variants return explicit metadata including originalPath and unsupportedReason. S57/sources and S58/approved/rejected have non-null unsupportedReason and intentionally show only safe existing states. This is no silent alias to S10 or success receipt. S56/offline is a retained local task with connected=false, not a claimed real transport disruption. Fixture text preview is passive local example content, not the prototype's executable HTML. Shared root bootstrap/capture must dynamically import this module only under DEV and avoid touching actual account methods.

## Evidence and pending checks

Source review only by this implementer; no automated tests, typechecks, builds, screenshots, native reads or remote operations performed. Root owns integrated build/capture and source-exclusion audit. Native tests cited in prior reports remain separate historical protocol evidence. All records remain awaiting visual/interaction recheck and owner manual acceptance; Windows not validated here. Root must preserve the shell/context panel/voice lifetime and route return, pass real account/server/access epoch and connected status, wire manager capability and existing history/model callbacks, and discard stale account/room task list data before mounting this component. Real configured Agent host/provider/executor remains an independent external acceptance prerequisite; missing task receipts/source lists are internal unfinished features.

## Individually reviewed immutable originals

- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S56_assistant_task.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S56_assistant_task__approval.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S56_assistant_task__completed.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S56_assistant_task__failed.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S56_assistant_task__offline.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S56_assistant_task__running.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S56_assistant_task__stopped.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S56_assistant_task__waiting.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S56_assistant_task__1280x800.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S56_assistant_task__900x700.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S56_assistant_task__1920x1080.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S57_assistant_result_files.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S57_assistant_result_files__empty.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S57_assistant_result_files__preview_error.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S57_assistant_result_files__sources.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S58_assistant_action_approval.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S58_assistant_action_approval__approved.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S58_assistant_action_approval__rejected.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S58_assistant_action_approval__unauthorized.png
- /Users/egemenmermer/Downloads/ROOMS_Design_Package/04_screens/S58_assistant_action_approval__uncertain.png
