import { randomInt, randomUUID } from 'node:crypto';
import {
  holdemTableRulesSchema,
  type HoldemTableRules,
  type GameKind,
  type GameSpectator,
  type ActivityCommand,
  type GameHistorySeat,
  type GameRecoveryEvent,
  type GamePublicState,
} from '../../../packages/activity-protocol/src/index';
import { holdemRestoredStack, type HoldemHand } from '../../../packages/games/src/holdem';
import type { BlackjackTableRound } from '../../../packages/games/src/blackjack-table';
import type { BatakRound } from '../../../packages/games/src/batak-table';
import type { BatakVariant } from '../../../packages/games/src/batak';
import type { OkeyRound } from '../../../packages/games/src/okey101-table';
import {
  isGameError,
  type AnyGameModule,
  type ChipPlayer,
} from '../../../packages/games/src/module';
import { gameModule, requireGameModule } from '../../../packages/games/src/registry';
import { TURN_DURATION_MS } from '../../../packages/games/src/seats';

// Every game-specific decision goes to the table's module in packages/games/src/registry.ts.
// This file owns the table: seats, spectators, bots, timers, recovery, history and statistics.
interface TableSeat {
  seat: number;
  userId: string;
  name: string;
  bot: boolean;
  permanentBot: boolean;
  chips: number;
  bet: number;
  connected: boolean;
  disconnectedAt: number | null;
  pendingReturn: boolean;
  recoveryEvents?: GameRecoveryEvent[];
  /** Left with "Masadan kalk" (or was removed) during a hand: a bot finishes it, then the seat is freed. */
  left?: boolean;
  /** Turns in a row whose clock ran out; the second one hands the seat to a bot until the player returns. */
  timeouts?: number;
}
export interface GameTable {
  kind: GameKind;
  ownerId: string;
  seats: TableSeat[];
  capacity: number;
  status: GamePublicState['status'];
  handNumber: number;
  turnDeadline: number;
  variant: BatakVariant;
  folding: boolean;
  teams: boolean;
  holdem?: HoldemHand;
  blackjack?: BlackjackTableRound;
  batak?: BatakRound;
  okey?: OkeyRound;
  /** Current round of a registry game without a built-in `stateKey`. */
  round?: unknown;
  /** Options a registry game's module parsed at `game.create`. */
  options?: unknown;
  handContext?: { tableName: string; seats: GameHistorySeat[] };
  holdemRules?: HoldemTableRules;
  spectators?: GameSpectator[];
  history: GamePublicState['history'];
  statistics: Record<string, { hands: number; wins: number; score: number }>;
  /** Seat number of the last round's first position (Hold'em button, dealer); moves clockwise by seat. */
  buttonSeat?: number;
  /** Chip games: the stack each player stood up with, restored (within the buy-in range) when they sit again. */
  savedStacks?: Record<string, number>;
  /** The turn deadline whose expiry was already handled, so one timeout is counted and reported once. */
  timedOutDeadline?: number;
  /** A bot or timeout move failed; no automatic move is tried again before this time. */
  botRetryAt?: number;
}
interface GameActor {
  userId: string;
  displayName: string;
  canCreate: boolean;
  /** The room's activity host, who may tidy the table (remove away seats) like the table owner. */
  roomHost?: boolean;
}
/** Stored hands per table and the time a failed bot move waits before the next try. */
export const GAME_HISTORY_LIMIT = 200;
const BOT_RETRY_MS = 5000;
const SAVED_STACK_LIMIT = 200;
const TAKEOVER_AFTER_TIMEOUTS = 2;
const seated = (table: GameTable, userId: string) => table.seats.find((s) => s.userId === userId);
/** A human who is at the table right now: not played by a bot, connected and not leaving. */
const present = (seat: TableSeat | undefined) =>
  Boolean(seat && !seat.bot && !seat.left && seat.connected);
/**
 * Who may deal the next round: the owner while seated, and any present seated player whenever the owner is
 * not a present seated player (stood up, watching, away), so a table never waits for an absent owner.
 */
export function canDeal(table: GameTable, userId: string) {
  const seat = seated(table, userId);
  if (!seat || seat.permanentBot || seat.left) return false;
  return table.ownerId === userId || (present(seat) && !present(seated(table, table.ownerId)));
}
const ordered = (table: GameTable) => [...table.seats].sort((a, b) => a.seat - b.seat);
export const defaultHoldemRules = (): HoldemTableRules => ({
  name: 'Hold’em',
  capacity: 9,
  smallBlind: 10,
  bigBlind: 20,
  minBuyIn: 1000,
  maxBuyIn: 1000,
  initialChips: 1000,
  spectatorsAllowed: true,
});
const rulesOf = (table: GameTable) => table.holdemRules ?? defaultHoldemRules();
/** Hold'em's configurable table rules (`game.configure`, buy-in, spectators); null for other games. */
const holdemRulesOf = (table: GameTable) => (table.kind === 'holdem' ? rulesOf(table) : null);
/** Uniform [0, 1) from the OS CSPRNG: the only randomness a registry game gets. */
const RNG_SCALE = 2 ** 47;
const rng = () => randomInt(RNG_SCALE) / RNG_SCALE;
const moduleOf = (table: GameTable) => requireGameModule(table.kind);
const stateKeyOf = (module: AnyGameModule) => module.table?.stateKey ?? 'round';
const roundOf = (table: GameTable, module: AnyGameModule): unknown =>
  (table as unknown as Record<string, unknown>)[stateKeyOf(module)];
function setRound(table: GameTable, module: AnyGameModule, state: unknown) {
  (table as unknown as Record<string, unknown>)[stateKeyOf(module)] = state;
}
function optionsOf(table: GameTable, module: AnyGameModule): unknown {
  return module.table?.tableOptions
    ? module.table.tableOptions({
        variant: table.variant,
        folding: table.folding,
        teams: table.teams,
        holdemRules: rulesOf(table),
        options: table.options,
      })
    : table.options;
}
const seatCounts = (module: AnyGameModule, options: unknown): readonly number[] =>
  module.seatsFor?.(options) ?? module.seats;
/** User ids in module-seat order: the round's own players, or every seated player by seat number. */
function roundPlayers(table: GameTable, module: AnyGameModule, state: unknown): readonly string[] {
  return state != null && module.table?.roundPlayers
    ? module.table.roundPlayers(state)
    : ordered(table).map((seat) => seat.userId);
}
/** The action name a timeout notice shows, when the module's command carries one. */
const actionName = (command: unknown) =>
  typeof command === 'object' &&
  command !== null &&
  typeof (command as { action?: unknown }).action === 'string'
    ? (command as { action: string }).action
    : undefined;
export const gameTitle = (kind: string) => gameModule(kind)?.title ?? kind;
const buyIn = (table: GameTable, value?: number) => {
  const rules = rulesOf(table),
    amount = value ?? rules.initialChips;
  if (!Number.isSafeInteger(amount) || amount < rules.minBuyIn || amount > rules.maxBuyIn)
    throw new Error('BUY_IN_OUT_OF_RANGE');
  return amount;
};

const tableName = (table: GameTable) => holdemRulesOf(table)?.name ?? table.kind;
/** Stack limits of a chip game: Hold'em's buy-in range; Blackjack's fixed 1000 bankroll (bets are at least 2). */
function stackRules(table: GameTable) {
  const rules = holdemRulesOf(table);
  return rules
    ? { min: rules.minBuyIn, max: rules.maxBuyIn, initial: rules.initialChips }
    : { min: 2, max: 1000, initial: 1000 };
}
/** Remembers a leaving player's stack so standing up and sitting again neither refills nor loses it. */
function saveStack(table: GameTable, seat: TableSeat) {
  if (!moduleOf(table).table?.chips || seat.permanentBot) return;
  const saved = { ...(table.savedStacks ?? {}) };
  delete saved[seat.userId];
  saved[seat.userId] = seat.chips;
  table.savedStacks = Object.fromEntries(Object.entries(saved).slice(-SAVED_STACK_LIMIT));
}
function freeSeat(table: GameTable, seat: TableSeat) {
  saveStack(table, seat);
  table.seats = table.seats.filter((value) => value !== seat);
}
function recoveryEvent(
  table: GameTable,
  seat: TableSeat,
  type: GameRecoveryEvent['type'],
  now: number,
  details: Pick<GameRecoveryEvent, 'action' | 'toCall'> = {},
) {
  if (seat.permanentBot) return;
  seat.recoveryEvents = [
    ...(seat.recoveryEvents ?? []),
    { id: randomUUID(), at: now, hand: table.handNumber, type, ...details },
  ].slice(-8);
}
export function gameTurn(table: GameTable): number | null {
  if (table.status !== 'playing') return null;
  const module = moduleOf(table),
    state = roundOf(table, module),
    turn = module.turn(state);
  if (turn === null) return null;
  const userId = roundPlayers(table, module, state)[turn];
  return table.seats.find((s) => s.userId === userId)?.seat ?? null;
}
function recordFinished(table: GameTable, now: number) {
  const module = moduleOf(table),
    state = roundOf(table, module),
    settled = state == null ? null : module.settle(state);
  if (!settled || table.status === 'finished') return;
  table.status = 'finished';
  const result: Record<string, unknown> = module.summary
    ? module.summary(state)
    : { points: settled.points, winners: settled.winners };
  const chips = module.table?.chips;
  for (const player of chips?.finalChips(state) ?? [])
    seated(table, player.userId)!.chips = player.chips;
  const players = roundPlayers(table, module, state);
  for (const seat of ordered(table)) {
    const index = players.indexOf(seat.userId);
    if (index < 0) continue;
    const stats = table.statistics[seat.userId] ?? { hands: 0, wins: 0, score: 0 };
    stats.hands++;
    if (settled.winners.includes(index)) stats.wins++;
    // Chip games track the stack, not a score.
    if (!chips) stats.score += settled.points[index];
    table.statistics[seat.userId] = stats;
  }
  table.history.push(
    structuredClone({
      hand: table.handNumber,
      endedAt: now,
      result,
      ...(table.handContext
        ? { tableName: table.handContext.tableName, seats: table.handContext.seats }
        : {}),
    }),
  );
  if (table.history.length > GAME_HISTORY_LIMIT)
    table.history = table.history.slice(-GAME_HISTORY_LIMIT);
}
/**
 * The seats dealt into the next round, by seat number, with the stake each brings. A chip game leaves out a
 * stack it cannot deal (Hold'em: no chips; Blackjack: below the smallest bet) and lowers a bet the stack no
 * longer covers; a permanent bot that cannot play is topped up to a fresh stack instead.
 */
function dealtSeats(table: GameTable, module: AnyGameModule, options: unknown) {
  const chips = module.table?.chips,
    seats = ordered(table).filter((seat) => !seat.left);
  const stake = (seat: TableSeat): ChipPlayer => ({
    userId: seat.userId,
    chips: seat.chips,
    bet: seat.bet,
  });
  const dealable = (seat: TableSeat) =>
    chips?.dealable ? chips.dealable(stake(seat), options) : stake(seat);
  const dealt: { seat: TableSeat; stake: ChipPlayer }[] = [];
  for (const seat of seats) {
    let value = dealable(seat);
    if (!value && seat.permanentBot) {
      seat.chips = stackRules(table).initial;
      value = dealable(seat);
    }
    if (value) dealt.push({ seat, stake: value });
  }
  return dealt;
}
/** The first position moves to the next dealt seat clockwise, by seat number, not by list index. */
function nextButton(table: GameTable, seats: readonly TableSeat[]) {
  if (table.buttonSeat === undefined) return table.handNumber % seats.length;
  const after = seats.findIndex((seat) => seat.seat > table.buttonSeat!);
  return after < 0 ? 0 : after;
}
function start(table: GameTable, now: number) {
  if (table.status === 'playing') throw new Error('HAND_ALREADY_PLAYING');
  const module = moduleOf(table),
    options = optionsOf(table, module),
    counts = seatCounts(module, options),
    dealt = dealtSeats(table, module, options),
    players = dealt.map((value) => value.seat);
  if (players.length < Math.min(...counts)) throw new Error('MORE_SEATS_REQUIRED');
  if (!counts.includes(players.length)) throw new Error('SEAT_COUNT_UNSUPPORTED');
  const first = nextButton(table, players),
    chips = module.table?.chips;
  setRound(
    table,
    module,
    chips
      ? chips.start(
          dealt.map((value) => value.stake),
          options,
          first,
        )
      : module.start(players.length, options, first, rng),
  );
  table.buttonSeat = players[first].seat;
  delete table.timedOutDeadline;
  delete table.botRetryAt;
  table.handContext = {
    tableName: tableName(table),
    seats: players.map((player, position) => ({
      seat: player.seat,
      position,
      userId: player.userId,
      name: player.name,
      bot: player.bot,
      ...(chips ? { startingChips: player.chips } : {}),
    })),
  };
  table.handNumber++;
  table.status = 'playing';
  // A round can be over as soon as it is dealt (Hold'em blinds put everyone all-in, a Blackjack dealer
  // natural): it is settled and paid out at once, with no turn clock.
  recordFinished(table, now);
  table.turnDeadline = table.status === 'playing' ? now + TURN_DURATION_MS : 0;
}
export function createGame(
  command: Extract<ActivityCommand, { type: 'game.create' }>,
  actor: GameActor,
): GameTable {
  if (!actor.canCreate) throw new Error('ACTIVITY_CREATE_DENIED');
  const module = gameModule(command.game);
  if (!module) throw new Error('UNKNOWN_GAME');
  if (command.holdem && command.game !== 'holdem') throw new Error('HOLDEM_RULES_ONLY');
  const rules =
    command.game === 'holdem'
      ? holdemTableRulesSchema.parse(command.holdem ?? defaultHoldemRules())
      : undefined;
  const variant = command.variant ?? 'ihaleli',
    folding = command.folding ?? false,
    teams = command.teams ?? false;
  // House rules from `game.create.options`; built-in tables combine them with their top-level fields.
  let parsed: unknown;
  const parse = module.table?.tableOptions ? module.table.parseRules : module.parseOptions;
  if (parse) {
    parsed = parse(command.options);
    if (isGameError(parsed)) throw new Error(parsed.error);
  } else if (command.options) throw new Error('GAME_OPTIONS_UNSUPPORTED');
  const options = module.table?.tableOptions
    ? module.table.tableOptions({
        variant,
        folding,
        teams,
        holdemRules: rules ?? defaultHoldemRules(),
        options: parsed,
      })
    : parsed;
  const capacity = Math.max(...seatCounts(module, options));
  return {
    kind: command.game,
    ownerId: actor.userId,
    seats: [
      {
        seat: 0,
        userId: actor.userId,
        name: actor.displayName,
        bot: false,
        permanentBot: false,
        chips: rules?.initialChips ?? 1000,
        bet: 10,
        connected: true,
        disconnectedAt: null,
        pendingReturn: false,
      },
    ],
    holdemRules: rules,
    spectators: [],
    capacity,
    status: 'waiting',
    handNumber: 0,
    turnDeadline: 0,
    variant,
    folding,
    teams,
    ...(parsed === undefined ? {} : { options: parsed }),
    history: [],
    statistics: {},
  };
}
export function gameCommand(
  table: GameTable,
  command: ActivityCommand,
  actor: GameActor,
  now: number,
) {
  const player = seated(table, actor.userId);
  if (command.type === 'game.configure') {
    if (table.ownerId !== actor.userId) throw new Error('TABLE_OWNER_REQUIRED');
    if (table.kind !== 'holdem') throw new Error('HOLDEM_RULES_ONLY');
    if (table.handNumber > 0 || table.status !== 'waiting') throw new Error('TABLE_RULES_LOCKED');
    const rules = holdemTableRulesSchema.parse(command.holdem);
    if (
      table.seats.some(
        (seat) =>
          seat.seat >= rules.capacity || seat.chips < rules.minBuyIn || seat.chips > rules.maxBuyIn,
      )
    )
      throw new Error('EXISTING_SEATS_CONFLICT');
    table.holdemRules = rules;
    table.capacity = rules.capacity;
    if (!rules.spectatorsAllowed) table.spectators = [];
    return;
  }
  if (command.type === 'game.watch') {
    const spectators = table.spectators ?? [];
    if (!command.watching) {
      table.spectators = spectators.filter((value) => value.userId !== actor.userId);
      return;
    }
    if (player) throw new Error('ALREADY_SEATED');
    if (holdemRulesOf(table)?.spectatorsAllowed === false) throw new Error('SPECTATORS_DISABLED');
    if (!spectators.some((value) => value.userId === actor.userId)) {
      if (spectators.length >= 100) throw new Error('SPECTATOR_LIMIT');
      table.spectators = [...spectators, { userId: actor.userId, name: actor.displayName }];
    }
    return;
  }

  if (command.type === 'game.sit') {
    if (player) {
      if (command.buyIn !== undefined) {
        if (!moduleOf(table).table?.chips) throw new Error('HOLDEM_BUY_IN_ONLY');
        if (table.status === 'playing') throw new Error('CHIP_CHANGE_DURING_HAND');
        // Chip totals are conserved: a seated player only buys back in once below the minimum,
        // and never above the maximum stack. Blackjack rebuys once a stack cannot cover the smallest bet.
        const limits = stackRules(table),
          amount = holdemRulesOf(table) ? buyIn(table, command.buyIn) : command.buyIn;
        if (player.chips >= limits.min) throw new Error('CHIP_CHANGE_NOT_ALLOWED');
        player.chips = Math.min(limits.max, player.chips + amount);
      }
      player.connected = true;
      player.disconnectedAt = null;
      player.timeouts = 0;
      if (player.left) delete player.left;
      const requested = player.bot && !player.pendingReturn;
      player.pendingReturn = player.bot;
      if (requested) recoveryEvent(table, player, 'return-requested', now);
      return;
    }
    if (command.seat >= table.capacity || table.seats.some((s) => s.seat === command.seat))
      throw new Error('SEAT_UNAVAILABLE');
    if (table.status === 'playing' && !moduleOf(table).table?.lateSeating)
      throw new Error('WAIT_FOR_NEXT_HAND');
    if (command.buyIn !== undefined && !holdemRulesOf(table)) throw new Error('HOLDEM_BUY_IN_ONLY');
    const limits = stackRules(table);
    // A returning player gets the stack they stood up with (a busted one buys in fresh).
    const chips = holdemRestoredStack(
      table.savedStacks?.[actor.userId],
      limits.max,
      holdemRulesOf(table) ? buyIn(table, command.buyIn) : limits.initial,
      limits.min,
    );
    if (table.savedStacks?.[actor.userId] !== undefined) {
      const { [actor.userId]: _restored, ...rest } = table.savedStacks;
      table.savedStacks = rest;
    }
    table.spectators = (table.spectators ?? []).filter((value) => value.userId !== actor.userId);
    table.seats.push({
      seat: command.seat,
      userId: actor.userId,
      name: actor.displayName,
      bot: false,
      permanentBot: false,
      chips,
      bet: 10,
      connected: true,
      disconnectedAt: null,
      pendingReturn: false,
    });
    return;
  }
  if (command.type === 'game.bot.add') {
    if (table.ownerId !== actor.userId) throw new Error('TABLE_OWNER_REQUIRED');
    if (command.seat >= table.capacity || table.seats.some((s) => s.seat === command.seat))
      throw new Error('SEAT_UNAVAILABLE');
    if (table.status === 'playing' && !moduleOf(table).table?.lateSeating)
      throw new Error('WAIT_FOR_NEXT_HAND');
    table.seats.push({
      seat: command.seat,
      userId: `bot-${randomUUID()}`,
      name: `Tayfa Bot ${command.seat + 1}`,
      bot: true,
      permanentBot: true,
      chips: holdemRulesOf(table)?.initialChips ?? 1000,
      bet: 10,
      connected: true,
      disconnectedAt: null,
      pendingReturn: false,
    });
    return;
  }
  if (command.type === 'game.seat.remove') {
    removeSeat(table, command.seat, actor, now);
    return;
  }
  if (command.type === 'game.leave' && !player) {
    table.spectators = (table.spectators ?? []).filter((value) => value.userId !== actor.userId);
    return;
  }
  if (!player) throw new Error('TAKE_A_SEAT_FIRST');
  if (command.type === 'game.leave') {
    // Between hands the seat is freed now; during a hand a bot plays it to the end.
    if (table.status !== 'playing') {
      freeSeat(table, player);
      return;
    }
    player.left = true;
    player.connected = false;
    player.disconnectedAt = now;
    if (!player.bot) {
      player.bot = true;
      player.pendingReturn = false;
      recoveryEvent(table, player, 'takeover-started', now);
    }
    return;
  }
  if (command.type !== 'game.action') throw new Error('INVALID_GAME_COMMAND');
  if (command.action === 'start') {
    if (!canDeal(table, actor.userId)) throw new Error('TABLE_OWNER_REQUIRED');
    start(table, now);
    return;
  }
  const module = moduleOf(table);
  if (command.action === 'bet' && !module.actions.includes('bet')) {
    if (
      !module.table?.chips?.tableBets ||
      table.status === 'playing' ||
      !command.amount ||
      command.amount % 2 ||
      command.amount < 2 ||
      command.amount > player.chips
    )
      throw new Error('INVALID_VIRTUAL_BET');
    player.bet = command.amount;
    return;
  }
  playTurn(table, module, player, now, false, () => {
    const parsed = module.parseCommand(command);
    if (isGameError(parsed)) throw new Error(parsed.error);
    if (!module.actions.includes(command.action)) throw new Error('INVALID_GAME_ACTION');
    return parsed;
  });
}
/**
 * The table owner or the room's host frees a seat nobody plays in person: a permanent bot, or a player who
 * left, lost the connection for 30 s or was handed to a bot after timeouts. During a round the seat's bot
 * finishes it (folding where it can) and the seat is freed afterwards.
 */
function removeSeat(table: GameTable, seatNumber: number, actor: GameActor, now: number) {
  if (table.ownerId !== actor.userId && !actor.roomHost) throw new Error('TABLE_OWNER_REQUIRED');
  const target = table.seats.find((seat) => seat.seat === seatNumber);
  if (!target) throw new Error('SEAT_EMPTY');
  // A player who pressed Otur to take their seat back is present again, even before their turn returns it.
  const away =
    target.permanentBot ||
    target.left ||
    (target.bot && !target.pendingReturn) ||
    (!target.connected && target.disconnectedAt !== null && now - target.disconnectedAt >= 30000);
  if (target.userId === actor.userId || !away) throw new Error('SEAT_REMOVE_NOT_ALLOWED');
  const module = moduleOf(table),
    state = roundOf(table, module);
  if (table.status !== 'playing' || !roundPlayers(table, module, state).includes(target.userId)) {
    freeSeat(table, target);
    return;
  }
  target.left = true;
  target.connected = false;
  target.disconnectedAt ??= now;
  if (!target.bot) {
    target.bot = true;
    recoveryEvent(table, target, 'takeover-started', now);
  }
  target.pendingReturn = false;
}
/** One seated player's (or a bot's) turn; `resolve` yields the module command after the turn checks. */
function playTurn(
  table: GameTable,
  module: AnyGameModule,
  player: TableSeat,
  now: number,
  byBot: boolean,
  resolve: () => unknown,
  timedOut = false,
) {
  if (table.status !== 'playing' || gameTurn(table) !== player.seat)
    throw new Error('NOT_YOUR_TURN');
  const returning = player.pendingReturn;
  if (!byBot && player.bot && !player.pendingReturn && !player.permanentBot)
    throw new Error('REQUEST_SEAT_RETURN_FIRST');
  const state = roundOf(table, module),
    seat = roundPlayers(table, module, state).indexOf(player.userId),
    previousTurn = gameTurn(table),
    previousPhase = module.phase?.(state);
  const next = module.action(state, seat, resolve(), rng);
  if (isGameError(next)) throw new Error(next.error);
  setRound(table, module, next);
  delete table.botRetryAt;
  if (!byBot) player.timeouts = 0;
  if (returning) {
    player.pendingReturn = false;
    player.bot = false;
    player.timeouts = 0;
    recoveryEvent(table, player, 'control-returned', now);
  }
  // Every new turn, and every new decision of the same seat (phase), gets a full clock. A timed-out
  // player's remaining moves of the same turn are played at once instead of waiting for another timeout.
  const turn = gameTurn(table);
  if (
    (turn !== previousTurn || module.phase?.(next) !== previousPhase) &&
    !(timedOut && turn === player.seat)
  )
    table.turnDeadline = now + TURN_DURATION_MS;
  recordFinished(table, now);
  releaseLeftSeats(table);
}
/** Seats whose players left during a hand are freed once no hand is running. */
function releaseLeftSeats(table: GameTable) {
  if (table.status === 'playing' || !table.seats.some((seat) => seat.left)) return false;
  for (const seat of table.seats.filter((value) => value.left)) freeSeat(table, seat);
  return true;
}
export function heartbeatGame(table: GameTable, userId: string) {
  const seat = seated(table, userId);
  // Polling must not undo "Masadan kalk".
  if (seat && !seat.permanentBot && !seat.left) {
    seat.connected = true;
    seat.disconnectedAt = null;
  }
}
export function disconnectGame(table: GameTable, userId: string, now: number) {
  table.spectators = (table.spectators ?? []).filter((value) => value.userId !== userId);
  const seat = seated(table, userId);
  if (seat) {
    seat.connected = false;
    seat.disconnectedAt = now;
  }
}
export function advanceGameBots(table: GameTable, now: number): boolean {
  let changed = releaseLeftSeats(table);
  for (const player of table.seats)
    if (
      !player.connected &&
      player.disconnectedAt !== null &&
      now - player.disconnectedAt >= 30000 &&
      !player.bot
    ) {
      player.bot = true;
      recoveryEvent(table, player, 'takeover-started', now);
      changed = true;
    }
  const turn = gameTurn(table),
    player = table.seats.find((s) => s.seat === turn);
  if (!player || table.status !== 'playing' || (!player.bot && now < table.turnDeadline))
    return changed;
  if (table.botRetryAt !== undefined && now < table.botRetryAt) return changed;
  if (player.pendingReturn) {
    player.pendingReturn = false;
    player.bot = false;
    player.timeouts = 0;
    table.turnDeadline = now + TURN_DURATION_MS;
    recoveryEvent(table, player, 'control-returned', now);
    return true;
  }
  const timedOut = !player.bot && now >= table.turnDeadline;
  // One expired clock is one timeout, however many moves (gösterge, draw, discard) finish the turn.
  const newTimeout = timedOut && table.timedOutDeadline !== table.turnDeadline;
  if (newTimeout) table.timedOutDeadline = table.turnDeadline;
  const module = moduleOf(table),
    state = roundOf(table, module),
    seat = roundPlayers(table, module, state).indexOf(player.userId);
  const context = {
    timedOut,
    absent: Boolean(player.left || (player.bot && !player.permanentBot)),
  };
  let details: { toCall?: number } = {},
    action: string | undefined;
  try {
    details = module.table?.timeoutDetails?.(state, seat) ?? {};
    const command = module.botCommand(state, seat, rng, context);
    // The bot executes through the same turn checks as a human; the module decides from its own seat.
    playTurn(table, module, player, now, true, () => command, timedOut);
    action = actionName(command);
  } catch {
    action = fallbackMove(table, module, player, now, timedOut);
    if (action === undefined) {
      // Nothing legal could be played: retry later instead of every sweep, and keep the room sweeping.
      table.botRetryAt = now + BOT_RETRY_MS;
      reportBotFailure(table.kind);
      return true;
    }
  }
  if (newTimeout) {
    recoveryEvent(table, player, 'turn-timeout', now, {
      ...(action === undefined ? {} : { action }),
      ...details,
    });
    // Idle but still polling: after the second timed-out turn in a row a bot plays on at bot speed
    // until the player presses Otur.
    player.timeouts = (player.timeouts ?? 0) + 1;
    if (player.timeouts >= TAKEOVER_AFTER_TIMEOUTS && !player.bot && table.seats.includes(player)) {
      player.bot = true;
      player.pendingReturn = false;
      recoveryEvent(table, player, 'takeover-started', now);
    }
  }
  return true;
}
/** The first legal plain action (fold, stand, pass, draw…) when the module's own bot move failed. */
function fallbackMove(
  table: GameTable,
  module: AnyGameModule,
  player: TableSeat,
  now: number,
  timedOut: boolean,
): string | undefined {
  const state = roundOf(table, module),
    seat = roundPlayers(table, module, state).indexOf(player.userId);
  let names: readonly string[];
  try {
    names = module.legalActions?.(state, seat) ?? module.actions;
  } catch {
    names = module.actions;
  }
  for (const name of names)
    try {
      const command = module.parseCommand({ action: name });
      if (isGameError(command)) continue;
      playTurn(table, module, player, now, true, () => command, timedOut);
      return name;
    } catch {
      /* Try the next action. */
    }
  return undefined;
}
/** Fixed fields only: the game kind, never the state or the command. */
function reportBotFailure(kind: string) {
  console.error(
    JSON.stringify({ service: 'rooms-activities', category: 'game-bot-stalled', game: kind }),
  );
}
export function gameView(table: GameTable, userId: string): GamePublicState {
  const seat = ordered(table).findIndex((s) => s.userId === userId);
  const spectators = table.spectators ?? [],
    watching = spectators.some((value) => value.userId === userId),
    rules = holdemRulesOf(table);
  const spectatorAccess = seat >= 0 || ((!rules || rules.spectatorsAllowed) && watching);
  const module = moduleOf(table),
    state = roundOf(table, module),
    players = roundPlayers(table, module, state),
    roundSeat = players.indexOf(userId);
  const view =
    !spectatorAccess || state == null ? {} : module.view(state, roundSeat < 0 ? null : roundSeat);
  const turn = gameTurn(table),
    ownTurn = table.seats.some((s) => s.userId === userId && s.seat === turn);
  let legalActions: string[] =
    table.status !== 'playing' && canDeal(table, userId) ? ['start'] : [];
  if (ownTurn) legalActions = [...(module.legalActions?.(state, roundSeat) ?? module.actions)];
  const ownSeat = seated(table, userId);
  const ownRecovery =
    ownSeat && !ownSeat.permanentBot
      ? {
          disconnectedAt: ownSeat.disconnectedAt,
          takeoverAt: ownSeat.disconnectedAt === null ? null : ownSeat.disconnectedAt + 30_000,
          pendingReturn: ownSeat.pendingReturn,
          takeover: ownSeat.bot,
          events: structuredClone(ownSeat.recoveryEvents ?? []),
        }
      : null;
  return {
    kind: table.kind as GamePublicState['kind'],
    ownerId: table.ownerId,
    status: table.status,
    seats: table.seats.map(({ seat, userId, name, bot, chips, connected }) => ({
      seat,
      userId,
      name,
      bot,
      chips,
      connected,
      pendingNextHand:
        Boolean(module.table?.lateSeating) &&
        table.status === 'playing' &&
        !(state != null && players.includes(userId)),
    })),
    turn,
    view: {
      ...view,
      ownRecovery,
      tableName: tableName(table),
      // The published table rules plus the house rule: it is stored in `table.options` as parsed at creation.
      ...(rules
        ? {
            rules: {
              ...rules,
              muckLosers:
                (table.options as { muckLosers?: boolean } | undefined)?.muckLosers === true,
            },
          }
        : {}),
      spectators,
      watching,
      spectatorAccess,
      legalActions,
      turnDeadline: table.turnDeadline,
      capacity: table.capacity,
      statistics: table.statistics,
    },
    history: spectatorAccess ? table.history.slice(-100) : [],
  };
}
