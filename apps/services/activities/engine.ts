import { createHash } from 'node:crypto';
import type { ActivityCommand, ActivityResponse, CommandEnvelope, RoomSnapshot } from '../../../packages/activity-protocol/src/index';
import { playbackPosition } from '../../../packages/activity-protocol/src/index';
import type { StoredRoom } from './repository';
import { advanceGameBots, createGame, disconnectGame, gameCommand, gameView } from './games';

export interface ActivityIdentity { userId: string; displayName: string; canControl: boolean; canCreate: boolean }
export class ActivityError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
function fail(status: number, code: string): never { throw new ActivityError(status, code); }
export function emptyRoom(roomId: string, now: number): StoredRoom {
  return { snapshot: { roomId, revision: 0, participants: [], primary: null, timeline: { playing: false, positionSec: 0, rate: 1, effectiveServerTimeMs: now, epoch: 0, itemId: null }, queue: [], polls: [], whiteboard: [] }, events: [], receipts: [] };
}
export function response(room: StoredRoom, after: number, now: number, userId = ''): ActivityResponse {
  const snapshot = structuredClone(room.snapshot); snapshot.game = room.game ? gameView(room.game, userId) : null;
  if (snapshot.game?.view.spectatorAccess) snapshot.game.view.previousTables = structuredClone(room.gameArchives ?? []);
  return { protocolVersion: 1, serverTimeMs: now, room: snapshot, events: room.events.filter(e => e.revision > after), replayRequired: after > room.snapshot.revision || (after < room.snapshot.revision && after < (room.events[0]?.revision ?? 1) - 1) };
}
function transferHost(state: RoomSnapshot, now: number) {
  if (!state.primary || state.participants.some(p => p.userId === state.primary!.hostUserId)) return;
  const next = [...state.participants].filter(p => p.canControl).sort((a, b) => a.joinedAt - b.joinedAt || a.userId.localeCompare(b.userId))[0];
  if (!next) { state.primary = null; state.timeline.playing = false; return; }
  state.primary.hostUserId = next.userId;
  if (state.primary.activity === 'screen') { state.primary.state = 'awaiting-source'; state.timeline.playing = false; }
  state.timeline.positionSec = playbackPosition(state.timeline, now); state.timeline.effectiveServerTimeMs = now;
}
export function pruneDisconnected(room: StoredRoom, now: number): boolean {
  const remaining = room.snapshot.participants.filter(p => now - p.lastSeenAt <= 30000);
  const expired = room.snapshot.participants.filter(p => !remaining.some(r => r.userId === p.userId));
  for (const participant of expired) if (room.game) disconnectGame(room.game, participant.userId, now - 30000);
  let sourcesExpired = false;
  for (const source of room.snapshot.cinema?.sources ?? []) if (source.ready && now - source.updatedAt > 15000) { source.ready = false; sourcesExpired = true; }
  const botsChanged = room.game && room.snapshot.primary?.activity === room.game.kind ? advanceGameBots(room.game, now) : false;
  if (remaining.length === room.snapshot.participants.length && !botsChanged && !sourcesExpired) return false;
  if (room.snapshot.cinema) room.snapshot.cinema.sources = room.snapshot.cinema.sources.filter(source => remaining.some(p => p.userId === source.userId));
  room.snapshot.participants = remaining; transferHost(room.snapshot, now);
  if (room.game && room.snapshot.primary?.activity === room.game.kind) room.game.ownerId = room.snapshot.primary.hostUserId;
  room.snapshot.revision++;
  room.events.push({ revision: room.snapshot.revision, commandId: null, type: 'presence.expired', actorId: 'server', serverTimeMs: now });
  room.events = room.events.slice(-256); return true;
}
export function applyCommand(room: StoredRoom, identity: ActivityIdentity, envelope: CommandEnvelope, now: number): boolean {
  const { snapshot: state } = room;
  const fingerprint = createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
  const receipt = room.receipts.find(r => r.actorId === identity.userId && r.commandId === envelope.commandId);
  if (receipt) { if (receipt.fingerprint !== fingerprint) fail(409, 'COMMAND_ID_REUSED'); return false; }
  if (envelope.expectedRevision !== state.revision) fail(409, 'REVISION_CONFLICT');
  const command: ActivityCommand = envelope.command;
  const participant = state.participants.find(p => p.userId === identity.userId);
  if (command.type !== 'join' && !participant) fail(403, 'JOIN_ACTIVITY_FIRST');
  const control = () => { if (!identity.canControl) fail(403, 'ACTIVITY_CONTROL_DENIED'); };
  const cinema = (itemId: string, timelineEpoch: number) => {
    if (state.primary?.activity !== 'cinema') fail(409, 'CINEMA_REQUIRED');
    const source = state.cinema;
    if (!source || source.itemId !== itemId || source.timelineEpoch !== timelineEpoch || state.timeline.itemId !== itemId || state.timeline.epoch !== timelineEpoch) fail(409, 'CINEMA_SOURCE_STALE');
    return source;
  };
  const media = () => { control(); if (!state.primary || !['cinema', 'youtube'].includes(state.primary.activity)) fail(409, 'SHARED_PLAYER_REQUIRED'); };
  switch (command.type) {
    case 'join':
      if (!participant) { if (state.participants.length >= 100) fail(409, 'ROOM_FULL'); state.participants.push({ ...identity, joinedAt: now, lastSeenAt: now }); }
      break;
    case 'leave': if (state.cinema) state.cinema.sources = state.cinema.sources.filter(source => source.userId !== identity.userId); state.participants = state.participants.filter(p => p.userId !== identity.userId); if (room.game) disconnectGame(room.game, identity.userId, now); transferHost(state, now); if (room.game && state.primary?.activity === room.game.kind) room.game.ownerId = state.primary.hostUserId; break;
    case 'start':
      if (!identity.canCreate) fail(403, 'ACTIVITY_CREATE_DENIED');
      if (state.primary) fail(409, 'PRIMARY_ACTIVITY_ACTIVE');
      if (['holdem', 'blackjack', 'batak', '101'].includes(command.activity)) fail(409, 'GAME_SERVICE_NOT_CONNECTED');
      state.primary = { activity: command.activity, title: command.title, hostUserId: identity.userId, startedAt: now, state: 'live' };
      state.cinema = null; state.queue = state.queue.filter(item=>command.activity==='cinema'?item.media.kind==='independent-source':command.activity==='youtube'?item.media.kind==='youtube':false); state.timeline = { playing: false, positionSec: 0, rate: 1, effectiveServerTimeMs: now, epoch: state.timeline.epoch + 1, itemId: null }; break;
    case 'end': control(); state.cinema = null; state.primary = null; state.timeline.playing = false; break;
    case 'playback': media(); if (state.primary?.activity === 'cinema') fail(409, 'CINEMA_SOURCE_REQUIRED'); if (!state.timeline.itemId) fail(409, 'MEDIA_SOURCE_REQUIRED'); state.timeline = { ...state.timeline, playing: command.playing, positionSec: command.positionSec, rate: command.rate, effectiveServerTimeMs: now }; break;
    case 'cinema.source': {
      const context = cinema(command.itemId, command.timelineEpoch);
      if (context.referenceId !== command.referenceId) fail(409, 'CINEMA_REFERENCE_MISMATCH');
      const previous = context.sources.find(source => source.userId === identity.userId);
      if ((previous?.sourceVersion ?? null) !== command.expectedSourceVersion) fail(409, 'CINEMA_SOURCE_STALE');
      if (previous?.sourceVersion === command.sourceVersion) fail(409, 'CINEMA_SOURCE_VERSION_REUSED');
      context.durationSec ??= command.durationSec;
      context.sources = context.sources.filter(source => source.userId !== identity.userId);
      context.sources.push({ userId: identity.userId, sourceVersion: command.sourceVersion, durationSec: command.durationSec, ready: false, updatedAt: now });
      break;
    }
    case 'cinema.release': {
      const context = cinema(command.itemId, command.timelineEpoch);
      const source = context.sources.find(value => value.userId === identity.userId);
      if (!source || source.sourceVersion !== command.sourceVersion) fail(409, 'CINEMA_SOURCE_STALE');
      context.sources = context.sources.filter(value => value.userId !== identity.userId); break;
    }
    case 'cinema.ready': {
      const context = cinema(command.itemId, command.timelineEpoch);
      const source = context.sources.find(value => value.userId === identity.userId);
      if (!source || source.sourceVersion !== command.sourceVersion) fail(409, 'CINEMA_SOURCE_STALE');
      if (command.ready && (context.durationSec === null || Math.abs(source.durationSec - context.durationSec) > 2)) fail(409, 'CINEMA_DURATION_MISMATCH');
      source.ready = command.ready; source.updatedAt = now; break;
    }
    case 'cinema.playback': {
      control();
      const context = cinema(command.itemId, command.timelineEpoch);
      const source = context.sources.find(value => value.userId === identity.userId);
      if (!source || source.sourceVersion !== command.sourceVersion) fail(409, 'CINEMA_SOURCE_STALE');
      if (!source.ready || now - source.updatedAt > 15000) fail(409, 'CINEMA_NOT_READY');
      if (context.durationSec === null || command.positionSec > context.durationSec) fail(409, 'CINEMA_POSITION_INVALID');
      state.timeline = { ...state.timeline, playing: command.playing, positionSec: command.positionSec, rate: command.rate, effectiveServerTimeMs: now };
      break;
    }
    case 'queue.add': media(); if ((state.primary?.activity === 'cinema') !== (command.media.kind === 'independent-source')) fail(409, 'MEDIA_KIND_MISMATCH'); if (state.queue.length >= 100) fail(409, 'QUEUE_FULL'); if (state.queue.some(i => i.id === command.itemId)) fail(409, 'QUEUE_ITEM_EXISTS'); state.queue.push({ id: command.itemId, media: command.media, addedBy: identity.userId }); break;
    case 'queue.remove': media(); if (!state.queue.some(i => i.id === command.itemId)) fail(404, 'QUEUE_ITEM_NOT_FOUND'); if (state.timeline.itemId === command.itemId) fail(409, 'QUEUE_ACTIVE_ITEM_FIXED'); state.queue = state.queue.filter(i => i.id !== command.itemId); break;
    case 'queue.reorder': media(); if (command.itemIds.length !== state.queue.length || new Set(command.itemIds).size !== state.queue.length || command.itemIds.some(id => !state.queue.some(i => i.id === id))) fail(400, 'QUEUE_PERMUTATION_REQUIRED'); if (state.timeline.itemId) { const activeIndex = state.queue.findIndex(item => item.id === state.timeline.itemId); if (activeIndex >= 0 && command.itemIds[activeIndex] !== state.timeline.itemId) fail(409, 'QUEUE_ACTIVE_ITEM_FIXED'); } state.queue = command.itemIds.map(id => state.queue.find(i => i.id === id)!); break;
    case 'queue.select': media(); if (!state.queue.some(i => i.id === command.itemId)) fail(404, 'QUEUE_ITEM_NOT_FOUND'); state.timeline = { playing: false, positionSec: 0, rate: 1, effectiveServerTimeMs: now, epoch: state.timeline.epoch + 1, itemId: command.itemId }; { const selected = state.queue.find(item => item.id === command.itemId)!; state.cinema = state.primary?.activity === 'cinema' && selected.media.kind === 'independent-source' ? { itemId: command.itemId, timelineEpoch: state.timeline.epoch, referenceId: selected.media.referenceId, durationSec: null, sources: [] } : null; } break;
    case 'poll.create': if (!identity.canCreate) fail(403, 'ACTIVITY_CREATE_DENIED'); if (state.polls.length >= 50) fail(409, 'POLL_LIMIT'); if (state.polls.some(p => p.id === command.pollId) || new Set(command.options.map(o => o.id)).size !== command.options.length) fail(409, 'POLL_ID_EXISTS'); state.polls.push({ id: command.pollId, question: command.question, options: command.options, votes: {}, createdBy: identity.userId, closed: false }); break;
    case 'poll.vote': { const poll = state.polls.find(p => p.id === command.pollId); if (!poll) fail(404, 'POLL_NOT_FOUND'); if (poll.closed) fail(409, 'POLL_CLOSED'); if (!poll.options.some(o => o.id === command.optionId)) fail(400, 'POLL_OPTION_NOT_FOUND'); poll.votes[identity.userId] = command.optionId; break; }
    case 'poll.close': { const poll = state.polls.find(p => p.id === command.pollId); if (!poll) fail(404, 'POLL_NOT_FOUND'); if (poll.createdBy !== identity.userId && !identity.canControl) fail(403, 'POLL_CONTROL_DENIED'); poll.closed = true; break; }
    case 'whiteboard.put': { const existing = state.whiteboard.find(e => e.id === command.element.id); if (existing && existing.authorId !== identity.userId) fail(403, 'WHITEBOARD_AUTHOR_REQUIRED'); if (!existing && state.whiteboard.length >= 1000) fail(409, 'WHITEBOARD_FULL'); state.whiteboard = state.whiteboard.filter(e => e.id !== command.element.id); state.whiteboard.push({ ...command.element, authorId: identity.userId }); break; }
    case 'whiteboard.remove': { const existing = state.whiteboard.find(e => e.id === command.elementId); if (!existing) fail(404, 'WHITEBOARD_ELEMENT_NOT_FOUND'); if (existing.authorId !== identity.userId) fail(403, 'WHITEBOARD_AUTHOR_REQUIRED'); state.whiteboard = state.whiteboard.filter(e => e.id !== command.elementId); break; }
    case 'game.create': {
      if(!identity.canCreate)fail(403,'ACTIVITY_CREATE_DENIED');
      if(command.replacePrimary){control();if(!state.primary||state.primary.activity!==command.replacePrimary.activity||state.primary.startedAt!==command.replacePrimary.startedAt)fail(409,'PRIMARY_ACTIVITY_STALE');}
      else if(state.primary)fail(409,'PRIMARY_ACTIVITY_ACTIVE');
      // Validate the complete replacement before touching the previous activity, queue or archive.
      let next;try{next=createGame(command,identity);}catch(error){fail(409,error instanceof Error?error.message:'INVALID_GAME_RULES');}
      if(room.game){room.gameArchives??=[];room.gameArchives.push({kind:room.game.kind,history:structuredClone(room.game.history),statistics:structuredClone(room.game.statistics)});}
      if(command.replacePrimary){state.timeline={...state.timeline,playing:false,positionSec:playbackPosition(state.timeline,now),effectiveServerTimeMs:now,epoch:state.timeline.epoch+1};state.cinema=null;}
      room.game=next;state.primary={activity:command.game,title:next.holdemRules?.name??(command.game==='101'?'101 Okey':command.game),hostUserId:identity.userId,startedAt:now,state:'live'};break;
    }
    case 'game.configure': case 'game.watch': case 'game.sit': case 'game.bot.add': case 'game.leave': case 'game.action': {
      const adopting=command.type==='game.sit'&&room.game&&!state.primary&&identity.canCreate;
      if(!room.game||(!adopting&&(!state.primary||state.primary.activity!==room.game.kind)))fail(409,'GAME_TABLE_REQUIRED');
      const next=structuredClone(room.game);if(adopting)next.ownerId=identity.userId;
      try{gameCommand(next,command,identity,now);}catch(error){fail(409,error instanceof Error?error.message:'INVALID_GAME_ACTION');}
      room.game=next;
      if(adopting)state.primary={activity:next.kind,title:next.holdemRules?.name??next.kind,hostUserId:identity.userId,startedAt:now,state:'live'};
      if(command.type==='game.configure'&&state.primary)state.primary.title=next.holdemRules!.name;
      break;
    }
  }
  if (participant) { participant.lastSeenAt = now; participant.canControl = identity.canControl; participant.canCreate=identity.canCreate; }
  state.revision++;
  room.events.push({ revision: state.revision, commandId: envelope.commandId, type: command.type, actorId: identity.userId, serverTimeMs: now });
  room.events = room.events.slice(-256); room.receipts.push({ actorId: identity.userId, commandId: envelope.commandId, fingerprint, revision: state.revision }); room.receipts = room.receipts.slice(-2048);
  return true;
}
