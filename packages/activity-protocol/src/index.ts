import { z } from 'zod';

export const opaqueId = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().trim().min(1).max(240);
const media = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('youtube'), videoId: z.string().regex(/^[a-zA-Z0-9_-]{11}$/), title: text }).strict(),
  // A shared reference describes the work, never a filesystem path or provider URL.
  z.object({ kind: z.literal('independent-source'), referenceId: opaqueId, title: text }).strict(),
]);
export const commandSchema = z.object({
  protocolVersion: z.literal(1), commandId: z.string().uuid(), expectedRevision: z.number().int().nonnegative(),
  command: z.discriminatedUnion('type', [
    z.object({ type: z.literal('join') }).strict(),
    z.object({ type: z.literal('leave') }).strict(),
    z.object({ type: z.literal('start'), activity: z.enum(['cinema', 'youtube', 'screen', 'holdem', 'blackjack', 'batak', '101']), title: text }).strict(),
    z.object({ type: z.literal('end') }).strict(),
    z.object({ type: z.literal('playback'), playing: z.boolean(), positionSec: z.number().finite().min(0).max(86400), rate: z.number().min(0.25).max(2) }).strict(),
    z.object({ type: z.literal('queue.add'), itemId: opaqueId, media }).strict(),
    z.object({ type: z.literal('queue.remove'), itemId: opaqueId }).strict(),
    z.object({ type: z.literal('queue.reorder'), itemIds: z.array(opaqueId).max(100) }).strict(),
    z.object({ type: z.literal('queue.select'), itemId: opaqueId }).strict(),
    z.object({ type: z.literal('poll.create'), pollId: opaqueId, question: text, options: z.array(z.object({ id: opaqueId, label: text }).strict()).min(2).max(12) }).strict(),
    z.object({ type: z.literal('poll.vote'), pollId: opaqueId, optionId: opaqueId }).strict(),
    z.object({ type: z.literal('poll.close'), pollId: opaqueId }).strict(),
    z.object({ type: z.literal('whiteboard.put'), element: z.object({ id: opaqueId, kind: z.enum(['stroke', 'text', 'rectangle', 'ellipse']), points: z.array(z.tuple([z.number().finite().min(0).max(4096), z.number().finite().min(0).max(4096)])).min(1).max(500), text: z.string().max(2000).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), width: z.number().min(1).max(24) }).strict() }).strict(),
    z.object({ type: z.literal('whiteboard.remove'), elementId: opaqueId }).strict(),
    z.object({ type: z.literal('game.create'), game: z.enum(['holdem', 'blackjack', 'batak', '101']), variant: z.enum(['ihaleli', 'esli', 'koz-maca', 'gommeli']).optional(), folding: z.boolean().optional(), teams: z.boolean().optional() }).strict(),
    z.object({ type: z.literal('game.sit'), seat: z.number().int().min(0).max(8) }).strict(),
    z.object({ type: z.literal('game.bot.add'), seat: z.number().int().min(0).max(8) }).strict(),
    z.object({ type: z.literal('game.leave') }).strict(),
    z.object({ type: z.literal('game.action'), action: z.enum(['start', 'fold', 'check', 'call', 'raise', 'bet', 'hit', 'stand', 'double', 'split', 'bid', 'pass', 'bury', 'trump', 'play', 'draw', 'discard', 'open', 'open-pairs', 'process']), amount: z.number().int().min(0).max(1000000).optional(), cardId: opaqueId.optional(), tileIds: z.array(opaqueId).max(30).optional(), melds: z.array(z.array(opaqueId).max(13)).max(10).optional(), trump: z.enum(['clubs', 'diamonds', 'hearts', 'spades']).optional() }).strict(),
  ]),
}).strict();
export type CommandEnvelope = z.infer<typeof commandSchema>;
export type ActivityCommand = CommandEnvelope['command'];
export type SharedMedia = z.infer<typeof media>;
export interface Participant { userId: string; displayName: string; joinedAt: number; lastSeenAt: number; canControl: boolean }
export interface QueueItem { id: string; media: SharedMedia; addedBy: string }
export interface Timeline { playing: boolean; positionSec: number; rate: number; effectiveServerTimeMs: number; epoch: number; itemId: string | null }
export interface Poll { id: string; question: string; options: { id: string; label: string }[]; votes: Record<string, string>; createdBy: string; closed: boolean }
export interface BoardElement { id: string; kind: 'stroke' | 'text' | 'rectangle' | 'ellipse'; points: [number, number][]; text?: string; color: string; width: number; authorId: string }
export interface RoomSnapshot {
  roomId: string; revision: number; participants: Participant[];
  primary: null | { activity: 'cinema' | 'youtube' | 'screen' | 'holdem' | 'blackjack' | 'batak' | '101'; title: string; hostUserId: string; startedAt: number; state: 'live' | 'awaiting-source' };
  timeline: Timeline; queue: QueueItem[]; polls: Poll[]; whiteboard: BoardElement[];
  game?: GamePublicState | null;
}
export interface GamePublicState { kind: 'holdem' | 'blackjack' | 'batak' | '101'; ownerId: string; status: 'waiting' | 'playing' | 'finished'; seats: { seat: number; userId: string; name: string; bot: boolean; chips: number; connected: boolean }[]; turn: number | null; view: Record<string, unknown>; history: { hand: number; endedAt: number; result: Record<string, unknown> }[] }
export interface ActivityEvent { revision: number; commandId: string | null; type: string; actorId: string; serverTimeMs: number }
export interface ActivityResponse { protocolVersion: 1; serverTimeMs: number; room: RoomSnapshot; events: ActivityEvent[]; replayRequired: boolean }
export function playbackPosition(timeline: Timeline, serverTimeMs: number): number {
  return Math.max(0, timeline.positionSec + (timeline.playing ? Math.max(0, serverTimeMs - timeline.effectiveServerTimeMs) / 1000 * timeline.rate : 0));
}

export type ActivityCommandEnvelope = CommandEnvelope;
