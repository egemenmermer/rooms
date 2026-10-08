import { randomUUID } from 'node:crypto';
import type { ActivityCommand, GamePublicState } from '../../../packages/activity-protocol/src/index';
import { holdemAction, holdemView, startHoldem, type HoldemHand } from '../../../packages/games/src/holdem';
import { blackjackTableAction, blackjackTableView, startBlackjackTable, type BlackjackTableRound } from '../../../packages/games/src/blackjack-table';
import { blackjackTotal } from '../../../packages/games/src/blackjack';
import { batakAction, batakView, startBatak, type BatakRound } from '../../../packages/games/src/batak-table';
import { legalBatakCards, type BatakVariant } from '../../../packages/games/src/batak';
import { okey101Action, okey101View, startOkey101, type OkeyRound } from '../../../packages/games/src/okey101-table';
import { validate101Meld, type OkeyTile } from '../../../packages/games/src/okey101';

interface TableSeat { seat: number; userId: string; name: string; bot: boolean; permanentBot: boolean; chips: number; bet: number; connected: boolean; disconnectedAt: number | null; pendingReturn: boolean }
export interface GameTable {
  kind: GamePublicState['kind']; ownerId: string; seats: TableSeat[]; capacity: number; status: GamePublicState['status']; handNumber: number; turnDeadline: number; variant: BatakVariant; folding: boolean; teams: boolean;
  holdem?: HoldemHand; blackjack?: BlackjackTableRound; batak?: BatakRound; okey?: OkeyRound;
  history: GamePublicState['history']; statistics: Record<string, { hands: number; wins: number; score: number }>;
}
interface GameActor { userId: string; displayName: string; canCreate: boolean }
const seated = (table: GameTable, userId: string) => table.seats.find(s => s.userId === userId);
const ordered = (table: GameTable) => [...table.seats].sort((a, b) => a.seat - b.seat);
export function gameTurn(table: GameTable): number | null {
  if (table.status !== 'playing') return null;
  if (table.kind === 'holdem') return table.holdem?.turn === null ? null : table.seats.find(s => s.userId === table.holdem!.seats[table.holdem!.turn!].userId)?.seat ?? null;
  if (table.kind === 'blackjack') return table.blackjack?.turn === null ? null : table.seats.find(s => s.userId === table.blackjack!.players[table.blackjack!.turn!].userId)?.seat ?? null;
  const turn = table.kind === 'batak' ? table.batak!.turn : table.okey!.turn;
  return turn === null ? null : ordered(table)[turn]?.seat ?? null;
}
function recordFinished(table: GameTable, now: number) {
  const done = table.kind === 'holdem' ? table.holdem?.stage === 'ended' : table.kind === 'blackjack' ? table.blackjack?.finished : table.kind === 'batak' ? table.batak?.stage === 'ended' : table.okey?.stage === 'ended';
  if (!done || table.status === 'finished') return;
  table.status = 'finished'; let result: Record<string, unknown> = {};
  if (table.kind === 'holdem') { result = { payouts: table.holdem!.payouts, board: table.holdem!.board }; for (const player of table.holdem!.seats) seated(table, player.userId)!.chips = player.chips; }
  else if (table.kind === 'blackjack') { result = { results: table.blackjack!.results }; for (const player of table.blackjack!.players) seated(table, player.userId)!.chips = player.credits; }
  else result = { scores: table.kind === 'batak' ? table.batak!.scores : table.okey!.scores };
  const participants = table.kind === 'holdem' ? new Set(table.holdem!.seats.map(s => s.userId)) : table.kind === 'blackjack' ? new Set(table.blackjack!.players.map(s => s.userId)) : null;
  for (const [index, seat] of ordered(table).entries()) {
    if (participants && !participants.has(seat.userId)) continue;
    const stats = table.statistics[seat.userId] ?? { hands: 0, wins: 0, score: 0 }; stats.hands++;
    const win = table.kind === 'holdem' ? table.holdem!.winners.includes(seat.userId) : table.kind === 'blackjack' ? table.blackjack!.results.some(r => r.userId === seat.userId && ['win', 'blackjack'].includes(r.outcome)) : table.kind === 'batak' ? table.batak!.scores[index] > 0 : table.okey!.winner === index;
    if (win) stats.wins++;
    if (table.kind === 'batak') stats.score += table.batak!.scores[index]; else if (table.kind === '101') stats.score += table.okey!.scores[index];
    table.statistics[seat.userId] = stats;
  }
  table.history.push({ hand: table.handNumber, endedAt: now, result });
}
function start(table: GameTable, now: number) {
  if (table.status === 'playing') throw new Error('HAND_ALREADY_PLAYING');
  const players = ordered(table); if (players.length < (table.kind === 'holdem' ? 2 : table.kind === 'blackjack' ? 1 : table.capacity)) throw new Error('MORE_SEATS_REQUIRED');
  if (table.kind === 'holdem') table.holdem = startHoldem(players.map(p => ({ userId: p.userId, chips: p.chips })), table.handNumber % players.length, 10, 20);
  else if (table.kind === 'blackjack') table.blackjack = startBlackjackTable(players.map(p => ({ userId: p.userId, credits: p.chips, bet: p.bet })));
  else if (table.kind === 'batak') table.batak = startBatak(table.variant, table.handNumber % players.length);
  else table.okey = startOkey101(table.folding, table.teams, table.handNumber % 4);
  table.handNumber++; table.status = 'playing'; table.turnDeadline = now + 45000; recordFinished(table, now);
}
export function createGame(command: Extract<ActivityCommand, { type: 'game.create' }>, actor: GameActor): GameTable {
  if (!actor.canCreate) throw new Error('ACTIVITY_CREATE_DENIED');
  const capacity = command.game === 'holdem' ? 9 : command.game === 'blackjack' ? 7 : command.game === 'batak' && command.variant === 'gommeli' ? 3 : 4;
  return { kind: command.game, ownerId: actor.userId, seats: [{ seat: 0, userId: actor.userId, name: actor.displayName, bot: false, permanentBot: false, chips: 1000, bet: 10, connected: true, disconnectedAt: null, pendingReturn: false }], capacity, status: 'waiting', handNumber: 0, turnDeadline: 0, variant: command.variant ?? 'ihaleli', folding: command.folding ?? false, teams: command.teams ?? false, history: [], statistics: {} };
}
export function gameCommand(table: GameTable, command: ActivityCommand, actor: GameActor, now: number) {
  const player = seated(table, actor.userId);
  if (command.type === 'game.sit') {
    if (player) { player.connected = true; player.disconnectedAt = null; player.pendingReturn = player.bot; return; }
    if (command.seat >= table.capacity || table.seats.some(s => s.seat === command.seat)) throw new Error('SEAT_UNAVAILABLE');
    table.seats.push({ seat: command.seat, userId: actor.userId, name: actor.displayName, bot: false, permanentBot: false, chips: 1000, bet: 10, connected: true, disconnectedAt: null, pendingReturn: false }); return;
  }
  if (command.type === 'game.bot.add') {
    if (table.ownerId !== actor.userId) throw new Error('TABLE_OWNER_REQUIRED');
    if (command.seat >= table.capacity || table.seats.some(s => s.seat === command.seat)) throw new Error('SEAT_UNAVAILABLE');
    table.seats.push({ seat: command.seat, userId: `bot-${randomUUID()}`, name: `ROOMS Bot ${command.seat + 1}`, bot: true, permanentBot: true, chips: 1000, bet: 10, connected: true, disconnectedAt: null, pendingReturn: false }); return;
  }
  if (!player) throw new Error('TAKE_A_SEAT_FIRST');
  if (command.type === 'game.leave') { player.connected = false; player.disconnectedAt = now; return; }
  if (command.type !== 'game.action') throw new Error('INVALID_GAME_COMMAND');
  if (command.action === 'start') { if (table.ownerId !== actor.userId) throw new Error('TABLE_OWNER_REQUIRED'); start(table, now); return; }
  if (command.action === 'bet') { if (table.kind !== 'blackjack' || table.status === 'playing' || !command.amount || command.amount % 2 || command.amount < 2 || command.amount > player.chips) throw new Error('INVALID_VIRTUAL_BET'); player.bet = command.amount; return; }
  if (table.status !== 'playing' || gameTurn(table) !== player.seat) throw new Error('NOT_YOUR_TURN');
  if (player.pendingReturn) { player.pendingReturn = false; player.bot = false; }
  if (player.bot && !player.permanentBot) throw new Error('REQUEST_SEAT_RETURN_FIRST');
  const previousTurn = gameTurn(table);
  if (table.kind === 'holdem') {
    if (!['fold', 'check', 'call', 'raise'].includes(command.action)) throw new Error('INVALID_HOLDEM_ACTION');
    table.holdem = holdemAction(table.holdem!, actor.userId, table.holdem!.revision, command.action === 'raise' ? { type: 'raise', to: command.amount ?? 0 } : { type: command.action as 'fold' | 'check' | 'call' });
  } else if (table.kind === 'blackjack') {
    if (!['hit', 'stand', 'double', 'split'].includes(command.action)) throw new Error('INVALID_BLACKJACK_ACTION'); table.blackjack = blackjackTableAction(table.blackjack!, actor.userId, command.action as 'hit' | 'stand' | 'double' | 'split');
  } else if (table.kind === 'batak') table.batak = batakAction(table.batak!, ordered(table).findIndex(p => p.userId === actor.userId), command);
  else table.okey = okey101Action(table.okey!, ordered(table).findIndex(p => p.userId === actor.userId), command);
  if (gameTurn(table) !== previousTurn) table.turnDeadline = now + 45000; recordFinished(table, now);
}
export function heartbeatGame(table: GameTable, userId: string) { const seat = seated(table, userId); if (seat && !seat.permanentBot) { seat.connected = true; seat.disconnectedAt = null; } }
export function disconnectGame(table: GameTable, userId: string, now: number) { const seat = seated(table, userId); if (seat) { seat.connected = false; seat.disconnectedAt = now; } }
function botMelds(hand: OkeyTile[]): OkeyTile[][] {
  let available = hand.filter(t => !t.joker); const melds: OkeyTile[][] = [];
  for (let value = 13; value >= 1; value--) { const group = [...new Map(available.filter(t => t.value === value).map(t => [t.color, t])).values()]; if (group.length >= 3) { melds.push(group); available = available.filter(t => !group.some(g => g.id === t.id)); } }
  for (const color of ['red', 'yellow', 'blue', 'black']) {
    const ordered = [...new Map(available.filter(t => t.color === color).map(t => [t.value, t])).values()].sort((a, b) => a.value - b.value); let run: OkeyTile[] = [];
    const keep = () => { if (run.length >= 3) melds.push(run); run = []; };
    for (const tile of ordered) { if (run.length && tile.value !== run[run.length - 1].value + 1) keep(); run.push(tile); } keep();
  }
  // A discard must remain; return the lowest-value meld to the hand if necessary.
  while (melds.flat().length >= hand.length && melds.length) melds.pop(); return melds;
}
export function advanceGameBots(table: GameTable, now: number): boolean {
  let changed = false;
  for (const player of table.seats) if (!player.connected && player.disconnectedAt !== null && now - player.disconnectedAt >= 30000 && !player.bot) { player.bot = true; changed = true; }
  const turn = gameTurn(table), player = table.seats.find(s => s.seat === turn);
  if (!player || table.status !== 'playing' || (!player.bot && now < table.turnDeadline)) return changed;
  if (player.pendingReturn) { player.pendingReturn = false; player.bot = false; table.turnDeadline = now + 45000; return true; }
  const action: Extract<ActivityCommand, { type: 'game.action' }> = { type: 'game.action', action: 'check' };
  if (table.kind === 'holdem') { const seat = table.holdem!.seats.find(s => s.userId === player.userId)!; action.action = seat.streetBet === table.holdem!.maximumBet ? 'check' : 'call'; }
  else if (table.kind === 'blackjack') { const seat = table.blackjack!.players.find(p => p.userId === player.userId)!; action.action = blackjackTotal(seat.hands[seat.activeHand].cards) < 17 ? 'hit' : 'stand'; }
  else if (table.kind === 'batak') { const state = table.batak!, index = ordered(table).indexOf(player), cards = state.hands[index];
    if (state.stage === 'bidding') action.action = 'pass';
    else if (state.stage === 'trump') { action.action = 'trump'; action.trump = [...new Set(cards.map(c => c.suit))].sort((a, b) => cards.filter(c => c.suit === b).length - cards.filter(c => c.suit === a).length)[0]; }
    else if (state.stage === 'bury') { action.action = 'bury'; action.tileIds = [...cards].sort((a, b) => (a.suit === state.trump ? 100 : 0) + a.rank - ((b.suit === state.trump ? 100 : 0) + b.rank)).slice(0, 4).map(c => c.id); }
    else { action.action = 'play'; action.cardId = legalBatakCards(cards, state.trick, state.trump).sort((a, b) => a.rank - b.rank)[0].id; }
  } else {
    const state = table.okey!, index = ordered(table).indexOf(player), hand = state.hands[index];
    if (state.stage === 'draw' || state.pickedDiscard && hand.some(t => t.id === state.pickedDiscard)) action.action = 'draw';
    else {
      const melds = botMelds(hand), points = melds.flat().reduce((sum, tile) => sum + tile.value, 0);
      if (melds.length && (state.opened[index] === 'runs' || !state.opened[index] && points >= 101 && (!state.rules.folding || points > state.highestOpening))) { action.action = 'open'; action.melds = melds.map(meld => meld.map(tile => tile.id)); }
      else {
        let extension: { meld: number; tileId: string } | null = null;
        if (state.opened[index] === 'runs' && hand.length > 1) for (const [meldIndex, meld] of state.melds.entries()) { if (meld.pairs) continue; for (const tile of hand.filter(t => !t.joker)) for (const candidate of [[tile, ...meld.tiles], [...meld.tiles, tile]]) try { validate101Meld(candidate); extension = { meld: meldIndex, tileId: tile.id }; } catch { /* Skip illegal extension. */ } }
        if (extension) { action.action = 'process'; action.amount = extension.meld; action.tileIds = [extension.tileId]; }
        else { action.action = 'discard'; const potential = (tile: OkeyTile) => tile.joker ? 100 : hand.filter(t => t.id !== tile.id && (t.color === tile.color && Math.abs(t.value - tile.value) <= 2 || t.value === tile.value)).length; action.cardId = [...hand].sort((a, b) => potential(a) - potential(b) || b.value - a.value)[0].id; }
      }
    }
  }
  // The bot executes through the same validation as a human and sees only its own hand/public state.
  const permanent = player.permanentBot; player.permanentBot = true;
  try { gameCommand(table, action, { userId: player.userId, displayName: player.name, canCreate: false }, now); changed = true; }
  finally { player.permanentBot = permanent; }
  return changed;
}
export function gameView(table: GameTable, userId: string): GamePublicState {
  const seat = ordered(table).findIndex(s => s.userId === userId);
  const view = table.kind === 'holdem' && table.holdem ? holdemView(table.holdem, userId) : table.kind === 'blackjack' && table.blackjack ? blackjackTableView(table.blackjack) : table.kind === 'batak' && table.batak ? batakView(table.batak, seat < 0 ? null : seat) : table.kind === '101' && table.okey ? okey101View(table.okey, seat < 0 ? null : seat) : {};
  const turn = gameTurn(table), ownTurn = table.seats.some(s => s.userId === userId && s.seat === turn);
  let legalActions: string[] = table.status !== 'playing' && table.ownerId === userId ? ['start'] : [];
  if (ownTurn) {
    if (table.kind === 'holdem') { const own = table.holdem!.seats.find(s => s.userId === userId)!; legalActions = ['fold', own.streetBet === table.holdem!.maximumBet ? 'check' : 'call']; if (own.chips + own.streetBet > table.holdem!.maximumBet && (own.actedAt === null || table.holdem!.maximumBet - own.actedAt >= table.holdem!.minimumRaise)) legalActions.push('raise'); }
    else if (table.kind === 'blackjack') { const own = table.blackjack!.players.find(p => p.userId === userId)!, hand = own.hands[own.activeHand]; legalActions = ['hit', 'stand']; if (hand.cards.length === 2 && hand.bet <= own.credits) { legalActions.push('double'); const point = (rank: number) => rank === 14 ? 11 : Math.min(rank, 10); if (point(hand.cards[0].rank) === point(hand.cards[1].rank) && own.hands.length < 4) legalActions.push('split'); } }
    else if (table.kind === 'batak') legalActions = table.batak!.stage === 'bidding' ? ['bid', 'pass'] : table.batak!.stage === 'trump' ? ['trump'] : table.batak!.stage === 'bury' ? ['bury'] : ['play'];
    else { const mode = table.okey!.opened[seat]; legalActions = table.okey!.stage === 'draw' ? ['draw'] : mode === 'runs' ? ['discard', 'open', 'process'] : mode === 'pairs' ? ['discard', 'open-pairs', 'process'] : ['discard', 'open', 'open-pairs']; if (table.okey!.stage === 'discard' && table.okey!.pickedDiscard) legalActions.push('draw'); }
  }
  return { kind: table.kind, ownerId: table.ownerId, status: table.status, seats: table.seats.map(({ seat, userId, name, bot, chips, connected }) => ({ seat, userId, name, bot, chips, connected })), turn, view: { ...view, legalActions, turnDeadline: table.turnDeadline, capacity: table.capacity, statistics: table.statistics }, history: table.history.slice(-100) };
}
