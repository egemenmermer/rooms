# S70 actual Agent authority and sanitized history — 2026-10-10

## Reference and owned scope

Read actual AgentPrincipal, grant provisioning, executor capabilities, connector/mapping configuration, service approval and reauthorization, repository audits and native credential handling. Opened all five immutable originals separately: S70_assistant_permissions_history.png and __history, __discord, __discord_disconnected, __permission. Read complete S70 assistant.js definition; prototype person permissions and live Discord connection indicators are not evidence of runtime state.

Changed packages/agent-contracts/src/index.ts; apps/services/agent/{server,repository,authority,start}.ts; apps/desktop/electron/agent.ts; tests/agent-authority.test.ts. Root owns UI/shared-index/preload/router. No remote host configuration, account, connector, bot or provider mutation. No full typecheck by this agent.

## Read contracts

AgentBridge adds `authority(roomId):Promise<AgentAuthoritySnapshot>` and `audit(roomId?):Promise<AgentAuditSnapshot>`. IPC is `rooms:agent-authority(roomId)` and `rooms:agent-audit(roomId?)`. Corresponding authenticated service GET routes are `/v1/authority?roomId=...` and `/v1/audit[?roomId=...]`. Runtime response schemas reject extra fields and bound collections. Native invokes retain the initiating account/connection and reject late results after either changes. Native fixture windows reject actual agent access.

`AgentStatus.canManage` is additive/optional for old-host compatibility; this service returns the actual principal value in status and successful YOLO responses, with its userId. Missing canManage must not be inferred from community owner or client UI state.

Authority snapshot fields:

- userId, requested roomId, actual canManage and current global yolo.
- principals: userId/canManage/canStart:true, drawn from enabled configured grants for that room. Managers see that room's rows; others see self only. canStart denotes room authorization, not model readiness or guaranteed task success.
- scopes: kind room/workspace/github/drive/research/browser, actual read/write capability and bounded safe resource identifiers. Native workspaces expose no paths. GitHub repo identifiers, Drive folder IDs and allowed hostnames are shown only to a manager with access to the requested room. Ordinary principals receive capability flags but no host resource roster. Browser write is true when browser_action is enabled because click/fill can mutate an external site; operation approval still applies.
- discord: state configured/not-configured/unknown, mentionOnly:true, authorized same-room mappings with userId/channelId/personalModel. Configured only means required official-bot configuration exists; the existing gateway does not export a verified live connection status. No invented server/channel names. An own mapping is selected when its model ID resolves to an existing own model; it is not a health claim. Other users always have personalModel:private, including for managers. No other model ID/provider/label/status/credential is returned.
- permissionsMutable:false and configurationSource:server-admin. The host grant file, connector policy, bot provisioning and mapping files have no safe application mutation interface. Save/add-person/manage-bot controls must remain disabled with that precise reason. This change does not write a decorative permissions table or pretend to alter executor scope.

`start.ts` rereads enabled grant and Discord mapping files for projection, matching their existing execution-time rereads. Tool scopes come from the same running executorConfig and executorCapabilities as actual tool availability; connector/policy changes require existing host lifecycle/restart because the executor holds its startup snapshot. Authority reauthenticates after awaiting policy projection, rejecting room revocation or manager downgrade before return. Principal/mapping filters prevent unrelated rooms' identities from appearing.

## Audit privacy and semantics

Without roomId, audit is the current principal's own allowlisted events, restricted to currently authorized rooms. With roomId, both room membership and canManage are mandatory; results contain only that room's events, never other rooms or another person's global/model events.

Each event contains only at, userId, action, roomId|null, taskId|null. There are no raw targets, prompts, results, message IDs, tool arguments/previews, API keys, provider tokens, filesystem paths, shell commands, credential-bearing URLs or model metadata. Actions are allowlisted; arbitrary historical action strings are omitted. Last 100 matching records are returned newest first, with a limited boolean, not a total count of hidden history.

Existing task/checkpoint/memory relations establish historical room scope. New deleted-memory and mention entries retain explicit roomId; unresolved historical room events are withheld rather than guessed. Own model and global YOLO events remain visible without exposing their raw target. Actual completed/failed/interrupted model executions now append their observed terminal event; no historical completion is fabricated. Existing approval audit events remain attached to actual operations. This is recorded service history, not a complete external provider audit or social ACL audit feed.

## Preserved authority

Task execution continues to reauthorize the initiating owner, require that owner's model, use authorized room memory, and recheck before tool operations. Managers viewing metadata do not acquire another user's model. Global YOLO only removes operation approval in the existing allowed scope; this work neither expands scope nor changes that global setting's existing semantics. Permission-save endpoints were not added. Discord remains official bot mention ingestion with existing source mapping validation and owned model lookup; ordinary chat, session copying and user-account automation were not introduced.

## Local evidence and remaining gates

Actual isolated loopback HTTP service tests with temporary encrypted repositories and injected executor/policy fixtures: initial 16/16 passed at 14:25:17 across agent-authority, agent-service, agent-operations and agent-reminders. Final run including actual terminal-history verification passed 17/17 at 14:26:11: `pnpm exec vitest run --config vitest.config.ts tests/agent-authority.test.ts tests/agent-service.test.ts tests/agent-operations.test.ts tests/agent-reminders.test.ts --maxWorkers=1`. These are local service integration checks, not a live configured Linux worker/provider or Discord gateway verification.

New authority tests cover manager/self/outsider scope, safe resource filtering, personal-model redaction, disabled permission mutation, current canManage, room-manager audit restriction, own audit, revoked room filtering, deleted-memory history, async manager downgrade, bounded history, actual task completion and initiating model ownership. Existing operation/reminder tests preserve cancellation, uncertain side effects, approval, notification and reauthorization behavior.

Root must wire preload/renderer, show real IDs through separately authorized social names if available, clear stale authority/history on account/room changes, and keep unsupported mutation controls disabled. Remaining acceptance: integrated build, native interaction/captures, actual remote configuration, official bot transport status, real providers/isolated Linux executor and owner manual acceptance. No production data was used.
