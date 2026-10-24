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
import type { HoldemHand } from '../../../packages/games/src/holdem';
import type { BlackjackTableRound } from '../../../packages/games/src/blackjack-table';
import type { BatakRound } from '../../../packages/games/src/batak-table';
import type { BatakVariant } from '../../../packages/games/src/batak';
import type { OkeyRound } from '../../../packages/games/src/okey101-table';
import { isGameError, type AnyGameModule } from '../../../packages/games/src/module';
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
  /** Left with "Masadan kalk" during a hand: a bot finishes it, then the seat is freed. */
  left?: boolean;
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
}
interface GameActor {
  userId: string;
  displayName: string;
  canCreate: boolean;
}
const seated = (table: GameTable, userId: string) => table.seats.find((s) => s.userId === userId);
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
}
function start(table: GameTable, now: number) {
  if (table.status === 'playing') throw new Error('HAND_ALREADY_PLAYING');
  const players = ordered(table),
    module = moduleOf(table),
    options = optionsOf(table, module),
    counts = seatCounts(module, options);
  if (players.length < Math.min(...counts)) throw new Error('MORE_SEATS_REQUIRED');
  if (!counts.includes(players.length)) throw new Error('SEAT_COUNT_UNSUPPORTED');
  const first = table.handNumber % players.length,
    chips = module.table?.chips;
  setRound(
    table,
    module,
    chips
      ? chips.start(
          players.map((p) => ({ userId: p.userId, chips: p.chips, bet: p.bet })),
          options,
          first,
        )
      : module.start(players.length, options, first, rng),
  );
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
  table.turnDeadline = now + TURN_DURATION_MS;
  recordFinished(table, now);
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
  if (module.parseOptions) {
    parsed = module.parseOptions(command.options);
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
        if (!holdemRulesOf(table)) throw new Error('HOLDEM_BUY_IN_ONLY');
        if (table.status === 'playing') throw new Error('CHIP_CHANGE_DURING_HAND');
        // Chip totals are conserved: a seated player only buys back in once below the minimum,
        // and never above the maximum stack.
        const rules = rulesOf(table);
        if (player.chips >= rules.minBuyIn) throw new Error('CHIP_CHANGE_NOT_ALLOWED');
        player.chips = Math.min(rules.maxBuyIn, player.chips + buyIn(table, command.buyIn));
      }
      player.connected = true;
      player.disconnectedAt = null;
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
    const chips = holdemRulesOf(table) ? buyIn(table, command.buyIn) : 1000;
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
  if (command.type === 'game.leave' && !player) {
    table.spectators = (table.spectators ?? []).filter((value) => value.userId !== actor.userId);
    return;
  }
  if (!player) throw new Error('TAKE_A_SEAT_FIRST');
  if (command.type === 'game.leave') {
    // Between hands the seat is freed now; during a hand a bot plays it to the end.
    if (table.status !== 'playing') {
      table.seats = table.seats.filter((seat) => seat !== player);
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
    if (table.ownerId !== actor.userId) throw new Error('TABLE_OWNER_REQUIRED');
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
/** One seated player's (or a bot's) turn; `resolve` yields the module command after the turn checks. */
function playTurn(
  table: GameTable,
  module: AnyGameModule,
  player: TableSeat,
  now: number,
  byBot: boolean,
  resolve: () => unknown,
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
  if (returning) {
    player.pendingReturn = false;
    player.bot = false;
    recoveryEvent(table, player, 'control-returned', now);
  }
  if (gameTurn(table) !== previousTurn || module.phase?.(next) !== previousPhase)
    table.turnDeadline = now + TURN_DURATION_MS;
  recordFinished(table, now);
  releaseLeftSeats(table);
}
/** Seats whose players left during a hand are freed once no hand is running. */
function releaseLeftSeats(table: GameTable) {
  if (table.status === 'playing' || !table.seats.some((seat) => seat.left)) return false;
  table.seats = table.seats.filter((seat) => !seat.left);
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
  if (player.pendingReturn) {
    player.pendingReturn = false;
    player.bot = false;
    table.turnDeadline = now + TURN_DURATION_MS;
    recoveryEvent(table, player, 'control-returned', now);
    return true;
  }
  const timedOut = !player.bot && now >= table.turnDeadline;
  const module = moduleOf(table),
    state = roundOf(table, module),
    seat = roundPlayers(table, module, state).indexOf(player.userId);
  const details = module.table?.timeoutDetails?.(state, seat) ?? {};
  const command = module.botCommand(state, seat, rng, { timedOut });
  // The bot executes through the same turn checks as a human; the module decides from its own seat.
  playTurn(table, module, player, now, true, () => command);
  changed = true;
  if (timedOut && changed) {
    const action = actionName(command);
    recoveryEvent(table, player, 'turn-timeout', now, {
      ...(action === undefined ? {} : { action }),
      ...details,
    });
  }
  return changed;
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
    table.status !== 'playing' && table.ownerId === userId && seat >= 0 ? ['start'] : [];
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
      ...(rules ? { rules } : {}),
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
