import { z } from 'zod';
import { SOCIAL_ID_PATTERN } from '@rooms/social';
const id = z.string().regex(SOCIAL_ID_PATTERN);
export const dmCallStartSchema = z.object({ dmId: id, mode: z.enum(['audio', 'video']) }).strict();
export const dmCallActionSchema = z.object({ callId: z.string().uuid(), action: z.enum(['accept', 'reject', 'end']) }).strict();
export const dmCallIdSchema = z.object({ callId: z.string().uuid() }).strict();
export const dmCallSessionSchema = z.object({
  id: z.string().uuid(), dmId: id, callerId: id, calleeId: id,
  callerName: z.string().max(128), calleeName: z.string().max(128),
  mode: z.enum(['audio', 'video']), state: z.enum(['ringing', 'accepted', 'ended']),
  reason: z.enum(['rejected', 'cancelled', 'ended', 'missed', 'disconnected', 'access-lost']).nullable(),
  createdAt: z.number().finite(), acceptedAt: z.number().finite().nullable(), expiresAt: z.number().finite(),
}).strict();
export type DmCallSession = z.infer<typeof dmCallSessionSchema>;
export interface DmCallBridge {
  poll(): Promise<{ call: DmCallSession | null }>;
  start(dmId: string, mode: 'audio' | 'video'): Promise<DmCallSession>;
  respond(callId: string, action: 'accept' | 'reject' | 'end'): Promise<DmCallSession>;
  grant(callId: string): Promise<{ serverUrl: string; roomName: string; token: string; expiresAt: string }>;
}
