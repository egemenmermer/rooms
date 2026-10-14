import type { ToolOperation } from './repository';
export class AgentApprovalRequired extends Error {
  constructor(readonly operation: ToolOperation) {
    super('This operation awaits an authorized person’s approval.');
  }
}
export class AgentUncertainEffect extends Error {
  constructor(readonly operationId: string) {
    super(
      'The previous operation may have completed. Review its external effects before resuming.',
    );
  }
}
export function redactPreview(value: unknown): string {
  return JSON.stringify(value, (key, item) =>
    /password|token|secret|authorization|cookie|api.?key/i.test(key) ? '[private]' : item,
  ).slice(0, 4000);
}

import type { AgentPrincipal } from './server';
import type { AgentData } from './repository';
import type { AgentAuditSnapshot } from '../../../packages/agent-contracts/src/index';
const auditActions = new Set([
  'model-connected',
  'model-disconnected',
  'yolo-enabled',
  'yolo-disabled',
  'yolo-task-resumed',
  'task-created',
  'task-completed',
  'task-failed',
  'task-interrupted',
  'task-approved',
  'task-cancelled',
  'reminder-created',
  'memory-saved',
  'memory-deleted',
  'operation-approved',
  'operation-awaiting-approval',
  'operation-record-result',
  'operation-confirm-not-applied',
  'mention-ingested',
]);
/** Allowlisted metadata only. Raw targets, prompts, tool previews and results never leave this projection. */
export function projectAgentAudit(
  data: AgentData,
  principal: AgentPrincipal,
  roomId?: string,
): AgentAuditSnapshot {
  const entries: AgentAuditSnapshot['entries'] = [];
  for (const entry of data.audit) {
    if (
      !auditActions.has(entry.action) ||
      !Number.isFinite(Date.parse(entry.at)) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(entry.userId)
    )
      continue;
    const task =
      data.tasks.find((task) => task.id === entry.target) ||
      data.tasks.find((task) =>
        data.checkpoints[task.id]?.operations.some((op) => op.id === entry.target),
      );
    const memory = data.memory.find((memory) => memory.id === entry.target);
    const scope = entry.roomId ?? task?.roomId ?? memory?.roomId ?? null;
    if (scope && !principal.roomIds.includes(scope)) continue;
    if (roomId ? scope !== roomId || !principal.canManage : entry.userId !== principal.userId)
      continue;
    // Unresolved historical records may expose own global/model actions only.
    if (
      !scope &&
      !['model-connected', 'model-disconnected', 'yolo-enabled', 'yolo-disabled'].includes(
        entry.action,
      )
    )
      continue;
    entries.push({
      at: entry.at,
      userId: entry.userId,
      action: entry.action,
      roomId: scope,
      taskId: task?.id ?? null,
    });
  }
  return {
    scope: roomId ? 'room' : 'own',
    roomId: roomId ?? null,
    entries: entries.slice(-100).reverse(),
    limited: entries.length > 100,
  };
}
