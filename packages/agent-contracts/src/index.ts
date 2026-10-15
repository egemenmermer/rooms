export type AgentProvider = 'openrouter' | 'codex' | 'claude';
export type AgentTaskState =
  | 'scheduled'
  | 'queued'
  | 'running'
  | 'awaiting-approval'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';
export interface ModelConnection {
  id: string;
  ownerId: string;
  provider: AgentProvider;
  label: string;
  model: string;
  status: 'connected' | 'login-required' | 'unavailable';
  reason?: string;
}
export interface AgentArtifact {
  id: string;
  name: string;
  mime: string;
  size: number;
}
export interface AgentTask {
  execution?: {
    hostId: string;
    workspaceId: string;
    terminalId: string | null;
    backend: 'shared-rootless';
    writer: 'ai' | 'human' | 'none';
    modelProvider: AgentProvider;
    limits: { cpu: number; memoryMiB: number; workspaceMiB: number; minutes: number };
  };
  kind?: 'model' | 'reminder';
  uncertainOperation?: { operationId: string; description: string; tool: string; preview: string };
  pendingApproval?: { operationId: string; description: string; tool: string; preview: string };
  id: string;
  roomId: string;
  ownerId: string;
  prompt: string;
  modelConnectionId: string;
  state: AgentTaskState;
  progress: string[];
  result: string | null;
  artifacts: AgentArtifact[];
  createdAt: string;
  runAt: string | null;
  error: string | null;
}
export interface AgentStatus {
  canManage?: boolean;
  configured: boolean;
  connected: boolean;
  userId?: string;
  yolo: boolean;
  executionHost: 'separate-server' | 'shared-rootless';
  capabilities: string[];
  reason?: string;
}
export interface AgentMemory {
  id: string;
  roomId: string;
  authorId: string;
  text: string;
  sourceMessageId: string | null;
  createdAt: string;
}
export interface AgentBridge {
  workspace?: AgentWorkspaceBridge;
  configure(input: { url: string; token: string }): Promise<void>;
  status(): Promise<AgentStatus>;
  authority(roomId: string): Promise<AgentAuthoritySnapshot>;
  audit(roomId?: string): Promise<AgentAuditSnapshot>;
  tasks(roomId: string): Promise<AgentTask[]>;
  submit(input: {
    roomId: string;
    prompt: string;
    modelConnectionId: string;
    runAt?: string;
  }): Promise<AgentTask>;
  remind(input: {
    roomId: string;
    channelId: string;
    sourceMessageId: string;
    text: string;
    runAt: string;
  }): Promise<AgentTask>;
  cancel(id: string): Promise<AgentTask>;
  approve(id: string): Promise<AgentTask>;
  resolveOperation(
    id: string,
    input: {
      operationId: string;
      resolution: 'record-result' | 'confirm-not-applied';
      result?: string;
    },
  ): Promise<AgentTask>;
  connections(): Promise<ModelConnection[]>;
  connectModel(input: {
    provider: AgentProvider;
    label: string;
    model: string;
    apiKey?: string;
  }): Promise<ModelConnection>;
  disconnectModel(id: string): Promise<void>;
  yolo(value: boolean): Promise<AgentStatus>;
  memory(roomId: string): Promise<AgentMemory[]>;
  saveMemory(input: {
    roomId: string;
    text: string;
    sourceMessageId?: string;
  }): Promise<AgentMemory>;
  deleteMemory(id: string): Promise<void>;
  previewArtifact(taskId: string, artifactId: string): Promise<AgentArtifactPreview>;
  downloadArtifact(taskId: string, artifactId: string): Promise<boolean>;
}
import type { OpsTerminal, TerminalEvent, TerminalInput } from '../../shared-contracts/src/hostops';
export interface AgentWorkspaceBridge {
  terminals(taskId: string): Promise<OpsTerminal[]>;
  take(taskId: string): Promise<OpsTerminal>;
  close(taskId: string, sessionId: string): Promise<OpsTerminal>;
  resume(taskId: string): Promise<AgentTask>;
  attach(taskId: string, sessionId: string): Promise<void>;
  send(input: TerminalInput): Promise<void>;
  detach(): Promise<void>;
  onTerminal(listener: (event: TerminalEvent) => void): () => void;
}

/** Read-only projection of the running server's actual grant and executor policy. */
export interface AgentAuthorityScope {
  kind: 'room' | 'workspace' | 'github' | 'drive' | 'research' | 'browser';
  read: boolean;
  write: boolean;
  resources: string[];
}
export interface AgentAuthoritySnapshot {
  userId: string;
  roomId: string;
  canManage: boolean;
  yolo: boolean;
  principals: { userId: string; canManage: boolean; canStart: true }[];
  scopes: AgentAuthorityScope[];
  discord: {
    state: 'configured' | 'not-configured' | 'unknown';
    mentionOnly: true;
    mappings: {
      userId: string;
      channelId: string;
      personalModel: 'selected' | 'missing' | 'private';
    }[];
  };
  permissionsMutable: false;
  configurationSource: 'server-admin';
}
export interface AgentAuditEntry {
  at: string;
  userId: string;
  action: string;
  roomId: string | null;
  taskId: string | null;
}
export interface AgentAuditSnapshot {
  scope: 'own' | 'room';
  roomId: string | null;
  entries: AgentAuditEntry[];
  limited: boolean;
}

import { z } from 'zod';
const authorityId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const agentAuthoritySnapshotSchema = z
  .object({
    userId: authorityId,
    roomId: authorityId,
    canManage: z.boolean(),
    yolo: z.boolean(),
    principals: z
      .array(
        z
          .object({ userId: authorityId, canManage: z.boolean(), canStart: z.literal(true) })
          .strict(),
      )
      .max(100),
    scopes: z
      .array(
        z
          .object({
            kind: z.enum(['room', 'workspace', 'github', 'drive', 'research', 'browser']),
            read: z.boolean(),
            write: z.boolean(),
            resources: z
              .array(
                z
                  .string()
                  .min(1)
                  .max(253)
                  .regex(/^[a-zA-Z0-9_-][a-zA-Z0-9_.\/-]*$/),
              )
              .max(200),
          })
          .strict(),
      )
      .max(20),
    discord: z
      .object({
        state: z.enum(['configured', 'not-configured', 'unknown']),
        mentionOnly: z.literal(true),
        mappings: z
          .array(
            z
              .object({
                userId: authorityId,
                channelId: authorityId,
                personalModel: z.enum(['selected', 'missing', 'private']),
              })
              .strict(),
          )
          .max(1000),
      })
      .strict(),
    permissionsMutable: z.literal(false),
    configurationSource: z.literal('server-admin'),
  })
  .strict();
export const agentAuditSnapshotSchema = z
  .object({
    scope: z.enum(['own', 'room']),
    roomId: authorityId.nullable(),
    entries: z
      .array(
        z
          .object({
            at: z.string().datetime(),
            userId: authorityId,
            action: z.string().regex(/^[a-z-]{1,64}$/),
            roomId: authorityId.nullable(),
            taskId: z.string().uuid().nullable(),
          })
          .strict(),
      )
      .max(100),
    limited: z.boolean(),
  })
  .strict();

/** Plain text only: never interpret the preview as HTML, SVG, script or remote content. */
export const AGENT_ARTIFACT_PREVIEW_LIMIT = 262144;
const previewArtifactMetadata = z
  .object({
    id: z.string().uuid(),
    name: z
      .string()
      .min(1)
      .max(240)
      .refine((value) => !/[\\/\x00-\x1f\x7f]/.test(value)),
    mime: z.string().min(1).max(128),
    size: z.number().int().nonnegative().safe(),
  })
  .strict();
const previewBase = { taskId: z.string().uuid(), sourcesAvailable: z.literal(false) };
export const agentArtifactPreviewSchema = z.discriminatedUnion('state', [
  z
    .object({
      ...previewBase,
      state: z.literal('text'),
      artifact: previewArtifactMetadata,
      text: z
        .string()
        .max(AGENT_ARTIFACT_PREVIEW_LIMIT)
        .refine((value) => new TextEncoder().encode(value).length <= AGENT_ARTIFACT_PREVIEW_LIMIT),
      encoding: z.literal('utf-8'),
    })
    .strict(),
  z
    .object({
      ...previewBase,
      state: z.literal('unsupported'),
      artifact: previewArtifactMetadata,
      reason: z.enum(['unsupported-type', 'invalid-text', 'active-content']),
    })
    .strict(),
  z
    .object({
      ...previewBase,
      state: z.literal('too-large'),
      artifact: previewArtifactMetadata,
      reason: z.literal('preview-size-limit'),
    })
    .strict(),
  z
    .object({
      ...previewBase,
      state: z.literal('unavailable'),
      artifact: z.null(),
      reason: z.literal('artifact-unavailable'),
    })
    .strict(),
]);
export type AgentArtifactPreview = z.infer<typeof agentArtifactPreviewSchema>;
