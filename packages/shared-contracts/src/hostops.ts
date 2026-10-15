import { z } from 'zod';
export const opsId = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,128}$/)
  .refine((id) => !['__proto__', 'constructor', 'prototype'].includes(id));
const finite = z.number().finite();
const nonnegative = finite.nonnegative();
const optionalMetric = nonnegative.nullable();
export const opsPermission = z.enum(['monitor', 'terminal', 'agent']);
export type OpsPermission = z.infer<typeof opsPermission>;
export const opsThresholdsSchema = z
  .object({
    cpuPercent: z.number().min(10).max(100).default(85),
    cpuSeconds: z.number().int().min(10).max(3600).default(60),
    diskFreePercent: z.number().min(1).max(90).default(15),
    backupHours: z.number().min(1).max(720).default(24),
  })
  .strict();
export type OpsThresholds = z.infer<typeof opsThresholdsSchema>;
export const hostSampleSchema = z
  .object({
    hostId: opsId,
    at: nonnegative,
    cpuPercent: finite.min(0).max(100).nullable(),
    cores: z.number().int().min(1).max(4096),
    perCorePercent: z.array(finite.min(0).max(100).nullable()).max(4096),
    load: z.array(nonnegative).length(3),
    memory: z
      .object({
        total: nonnegative,
        available: nonnegative,
        swapTotal: nonnegative,
        swapUsed: nonnegative,
      })
      .strict(),
    disk: z
      .object({
        total: nonnegative,
        free: nonnegative,
        readBps: optionalMetric,
        writeBps: optionalMetric,
      })
      .strict(),
    network: z
      .object({
        receiveBps: optionalMetric,
        sendBps: optionalMetric,
        receivedBytes: optionalMetric,
        sentBytes: optionalMetric,
      })
      .strict(),
    temperatureC: finite.min(-50).max(150).nullable(),
    services: z
      .array(
        z
          .object({
            name: z.string().min(1).max(100),
            state: z.enum(['healthy', 'unhealthy', 'unknown']),
            restarts: z.number().int().nonnegative().nullable(),
          })
          .strict(),
      )
      .max(100),
    lastBackupAt: nonnegative.nullable(),
    media: z
      .object({
        rooms: optionalMetric,
        participants: optionalMetric,
        streams: optionalMetric,
        bitrate: optionalMetric,
        rttMs: optionalMetric,
        lossPercent: finite.min(0).max(100).nullable(),
        jitterMs: optionalMetric,
      })
      .strict(),
    workloads: z
      .array(
        z.object({ id: opsId, cpuPercent: optionalMetric, memoryBytes: optionalMetric }).strict(),
      )
      .max(100),
  })
  .strict();
export type HostSample = z.infer<typeof hostSampleSchema>;
export const opsHostSchema = z
  .object({
    id: opsId,
    label: z.string().min(1).max(100),
    physicalHostId: opsId,
    mode: z.enum(['shared', 'dedicated']),
    owner: z.boolean(),
    permissions: z.array(opsPermission),
    terminalAvailable: z.boolean(),
    agentAvailable: z.boolean(),
    reason: z.string().max(300).nullable(),
  })
  .strict();
export type OpsHost = z.infer<typeof opsHostSchema>;
export const opsAlertSchema = z
  .object({
    id: z.string().uuid(),
    hostId: opsId,
    kind: z.enum(['cpu', 'disk', 'backup', 'service', 'collector']),
    message: z.string().max(200),
    createdAt: nonnegative,
    updatedAt: nonnegative,
    resolvedAt: nonnegative.nullable(),
    delivery: z.enum(['pending', 'delivered']),
  })
  .strict();
export type OpsAlert = z.infer<typeof opsAlertSchema>;
export const opsSnapshotSchema = z
  .object({
    host: opsHostSchema,
    sample: hostSampleSchema.nullable(),
    stale: z.boolean(),
    thresholds: opsThresholdsSchema,
    alerts: z.array(opsAlertSchema).max(200),
  })
  .strict();
export type OpsSnapshot = z.infer<typeof opsSnapshotSchema>;
export const opsGrantSchema = z
  .object({
    userId: opsId,
    permissions: z.array(opsPermission).max(3),
    profileId: opsId.nullable(),
  })
  .strict();
export type OpsGrant = z.infer<typeof opsGrantSchema>;
export const terminalInfoSchema = z
  .object({
    id: z.string().uuid(),
    hostId: opsId,
    ownerId: opsId,
    user: z.string().max(64),
    directory: z.string().max(512),
    kind: z.enum(['host', 'workspace']),
    taskId: z.string().uuid().nullable(),
    state: z.enum(['active', 'detached', 'closed', 'interrupted']),
    writer: z.string().max(128).nullable(),
    createdAt: nonnegative,
    detachedAt: nonnegative.nullable(),
    access: z.enum(['owner', 'control', 'view']),
  })
  .strict();
export type OpsTerminal = z.infer<typeof terminalInfoSchema>;
export const terminalInputSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('input'),
      sequence: z.number().int().nonnegative(),
      data: z.string().max(4096),
    })
    .strict(),
  z
    .object({
      type: z.literal('resize'),
      cols: z.number().int().min(20).max(300),
      rows: z.number().int().min(5).max(150),
    })
    .strict(),
  z.object({ type: z.literal('detach') }).strict(),
]);
export type TerminalInput = z.infer<typeof terminalInputSchema>;
export const terminalEventSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('output'),
      sequence: z.number().int().nonnegative(),
      data: z.string().max(1048576),
      reset: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal('state'), session: terminalInfoSchema }).strict(),
  z.object({ type: z.literal('error'), message: z.string().max(300) }).strict(),
]);
export type TerminalEvent = z.infer<typeof terminalEventSchema>;
export interface HostOpsBridge {
  hosts(): Promise<OpsHost[]>;
  snapshot(hostId: string): Promise<OpsSnapshot>;
  history(hostId: string, range: 'hour' | 'day' | 'week' | 'month'): Promise<HostSample[]>;
  operators(hostId: string): Promise<OpsGrant[]>;
  setOperator(hostId: string, grant: OpsGrant): Promise<void>;
  thresholds(hostId: string, value: OpsThresholds): Promise<void>;
  acknowledge(hostId: string, ids: string[]): Promise<void>;
  terminals(hostId: string): Promise<OpsTerminal[]>;
  createTerminal(hostId: string): Promise<OpsTerminal>;
  terminalAction(
    hostId: string,
    sessionId: string,
    action: 'close' | 'take' | 'release' | 'share',
    target?: { userId: string; access: 'view' | 'control' | 'none' },
  ): Promise<OpsTerminal>;
  attach(hostId: string, sessionId: string): Promise<void>;
  send(input: TerminalInput): Promise<void>;
  detach(): Promise<void>;
  onTerminal(listener: (event: TerminalEvent) => void): () => void;
}
