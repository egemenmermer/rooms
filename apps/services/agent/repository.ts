import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type {
  AgentTask,
  AgentMemory,
  ModelConnection,
} from '../../../packages/agent-contracts/src/index';
export interface SecretModel extends ModelConnection {
  secret?: string;
}
export interface ToolOperation {
  id: string;
  callId: string;
  tool: string;
  description: string;
  preview: string;
  mutates: boolean;
  status: 'planned' | 'approved' | 'started' | 'completed' | 'uncertain';
  result?: string;
  artifact?: { id: string; name: string; mime: string; size: number };
}
export interface AgentCheckpoint {
  version: 1;
  modelConnectionId: string;
  step: number;
  messages: Record<string, any>[];
  artifacts: AgentTask['artifacts'];
  operations: ToolOperation[];
}
export interface NotificationTarget {
  platform: 'stoat' | 'discord';
  channelId: string;
  sourceMessageId: string;
  sourceAuthorId?: string;
}
export interface AgentOutboxItem extends NotificationTarget {
  id: string;
  taskId: string;
  userId: string;
  roomId: string;
  content: string;
  state: 'pending' | 'sending' | 'sent' | 'uncertain';
  attempts: number;
  createdAt: string;
  error: string | null;
}
export interface AgentData {
  version: 1;
  yolo: boolean;
  tasks: AgentTask[];
  memory: AgentMemory[];
  models: SecretModel[];
  audit: { at: string; userId: string; action: string; target: string; roomId?: string }[];
  checkpoints: Record<string, AgentCheckpoint>;
  notificationTargets: Record<string, NotificationTarget>;
  outbox: AgentOutboxItem[];
}
export class AgentRepository {
  data: AgentData = {
    version: 1,
    yolo: false,
    tasks: [],
    memory: [],
    models: [],
    audit: [],
    checkpoints: {},
    notificationTargets: {},
    outbox: [],
  };
  constructor(
    readonly directory: string,
    private key: Buffer,
  ) {
    if (key.length !== 32) throw new Error('Agent encryption key must be 32 bytes.');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    try {
      const b = readFileSync(join(directory, 'agent.enc'));
      const decipher = createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
      decipher.setAuthTag(b.subarray(12, 28));
      this.data = JSON.parse(
        Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString(),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error('Agent storage cannot be decrypted. Do not replace its key.');
    }
    this.data.checkpoints ??= {};
    this.data.notificationTargets ??= {};
    this.data.outbox ??= [];
    for (const item of this.data.outbox)
      if (item.state === 'sending') {
        item.state = 'uncertain';
        item.error = 'Delivery interrupted. Verify the remote message before retrying.';
      }
    for (const task of this.data.tasks)
      if (task.state === 'running' || task.state === 'queued') {
        if (task.kind === 'reminder') {
          const delivery = this.data.outbox.find((item) => item.taskId === task.id);
          if (delivery?.state === 'sent') {
            task.state = 'completed';
            task.result = 'Hatırlatma kaynak mesaja gönderildi.';
          } else if (!delivery || delivery.state === 'pending') {
            task.state = 'queued';
            task.error = null;
          } else {
            task.state = 'interrupted';
            task.error =
              'Reminder delivery outcome uncertain. Verify the source chat before creating another reminder.';
          }
          continue;
        }
        const checkpoint = this.data.checkpoints[task.id];
        for (const op of checkpoint?.operations ?? [])
          if (op.status === 'started' && !op.mutates) op.status = 'planned';
        const uncertain = checkpoint?.operations.some(
          (op) => op.status === 'started' || op.status === 'uncertain',
        );
        if (checkpoint && !uncertain) {
          task.state = 'queued';
          task.error = null;
        } else {
          task.state = 'interrupted';
          task.error =
            'Server restarted during execution. Review external effects before retrying.';
          const operation = checkpoint?.operations.find(
            (op) => op.status === 'started' || op.status === 'uncertain',
          );
          if (operation)
            task.uncertainOperation = {
              operationId: operation.id,
              tool: operation.tool,
              description: operation.description,
              preview: operation.preview,
            };
        }
      }
    this.save();
  }
  save() {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(this.data)), cipher.final()]);
    const path = join(this.directory, 'agent.enc');
    writeFileSync(path + '.tmp', Buffer.concat([iv, cipher.getAuthTag(), encrypted]), {
      mode: 0o600,
    });
    renameSync(path + '.tmp', path);
  }
  audit(userId: string, action: string, target: string, roomId?: string) {
    this.data.audit.push({
      at: new Date().toISOString(),
      userId,
      action,
      target,
      ...(roomId ? { roomId } : {}),
    });
    this.data.audit = this.data.audit.slice(-10000);
    this.save();
  }
}
