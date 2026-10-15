import { z } from 'zod';
import { opsId } from './hostops';
const uuid = z.string().uuid();
const trackId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const remoteSourceSchema = z
  .object({ channelId: opsId, publisherId: opsId, participantSid: trackId, trackId, epoch: uuid })
  .strict();
export type RemoteSource = z.infer<typeof remoteSourceSchema>;
export const remoteRequestSchema = z
  .object({
    id: uuid,
    source: remoteSourceSchema,
    controllerId: opsId,
    controllerName: z.string().max(128).optional(),
    controllerSid: trackId,
    createdAt: z.number().finite(),
    expiresAt: z.number().finite(),
  })
  .strict();
export const remoteLeaseSchema = remoteRequestSchema
  .extend({
    leaseId: uuid,
    inputKey: z.string().regex(/^[a-f0-9]{64}$/),
    approvedAt: z.number().finite(),
    expiresAt: z.number().finite(),
  })
  .strict();
export type RemoteLease = z.infer<typeof remoteLeaseSchema>;
export const publicRemoteLeaseSchema = remoteLeaseSchema.omit({ inputKey: true });
export type PublicRemoteLease = z.infer<typeof publicRemoteLeaseSchema>;
export const remoteStateSchema = z
  .object({
    serverAt: z.number().finite(),
    sources: z.array(remoteSourceSchema).max(20),
    requests: z.array(remoteRequestSchema).max(20),
    lease: remoteLeaseSchema.nullable(),
  })
  .strict();
export const publicRemoteStateSchema = remoteStateSchema
  .extend({
    lease: publicRemoteLeaseSchema.nullable(),
    latencyMs: z.number().finite().min(0).max(10_000).nullable().optional(),
  })
  .strict();
export type RemoteState = z.infer<typeof publicRemoteStateSchema>;
const keyCode = z
  .string()
  .regex(
    /^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Arrow(?:Up|Down|Left|Right)|Shift(?:Left|Right)|Control(?:Left|Right)|Alt(?:Left|Right)|Meta(?:Left|Right)|Enter|Escape|Backspace|Tab|Space|Delete|Home|End|PageUp|PageDown|Insert|CapsLock|NumLock|IntlBackslash|Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal)|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote)$/,
  );
export const remoteInputSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('move'),
      x: z.number().finite().min(0).max(1),
      y: z.number().finite().min(0).max(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('button'),
      button: z.enum(['left', 'right', 'middle']),
      down: z.boolean(),
      x: z.number().finite().min(0).max(1),
      y: z.number().finite().min(0).max(1),
    })
    .strict(),
  z.object({ type: z.literal('key'), code: keyCode, down: z.boolean() }).strict(),
  z
    .object({
      type: z.literal('scroll'),
      dx: z.number().finite().min(-1200).max(1200),
      dy: z.number().finite().min(-1200).max(1200),
    })
    .strict(),
  z.object({ type: z.literal('release') }).strict(),
  z.object({ type: z.literal('ping'), nonce: uuid }).strict(),
  z.object({ type: z.literal('pong'), nonce: uuid }).strict(),
]);
export type RemoteInput = z.infer<typeof remoteInputSchema>;
export const remoteFrameBodySchema = z
  .object({
    leaseId: uuid,
    epoch: uuid,
    sequence: z.number().int().nonnegative().safe(),
    sentAt: z.number().finite(),
    input: remoteInputSchema,
  })
  .strict();
export const remoteFrameSchema = remoteFrameBodySchema
  .extend({ mac: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export type RemoteFrame = z.infer<typeof remoteFrameSchema>;
export interface RemoteControlBridge {
  register(
    channelId: string,
    trackId: string,
  ): Promise<{ supported: boolean; reason: string | null }>;
  state(channelId: string): Promise<RemoteState>;
  request(channelId: string, publisherId: string, epoch: string): Promise<void>;
  decide(channelId: string, requestId: string, approve: boolean): Promise<void>;
  revoke(): Promise<void>;
  frame(
    input: RemoteInput,
    leaseId: string,
  ): Promise<{ payload: string; destination: string; reliable: boolean }>;
  receive(
    payload: string,
  ): Promise<{ payload: string; destination: string; reliable: boolean } | null>;
}
