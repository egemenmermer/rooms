import type { HoldemTableRules } from '../../activity-protocol/src/index';

/**
 * The contract every server-authoritative table game implements. The activity service
 * (`apps/services/activities/games.ts`) owns seats, bots, timers, history and statistics and
 * dispatches everything game-specific to the module registered for the table's kind
 * (`registry.ts`). A module is pure rules: no I/O, no clock, no ambient randomness.
 */
export interface GameModule<State, Command, View, Options = unknown> {
  /** Protocol id, e.g. 'rooms-pisti-v1'. Lowercase letters, digits and '-' (see `GAME_KIND_PATTERN`). */
  kind: string;
  /** Allowed seat counts, e.g. [2, 4]. A table has max(seats) chairs and deals when the seated count is listed. */
  seats: readonly number[];
  /** Command names the client may send in game.action (validated server-side before action()). */
  actions: readonly string[];
  /** Zod-free plain validator for the per-game payload; returns the typed command or an error string. */
  parseCommand(input: GameActionInput): Command | GameError;
  /** New round. `rng` must be the only randomness source (tests pass a seeded one). */
  start(seatCount: number, options: Options, first: number, rng: () => number): State;
  /** Apply one seated player's command. Returns the new state or an error string (never throws for player mistakes). */
  action(state: State, seat: number, command: Command, rng: () => number): State | GameError;
  /** What `viewerSeat` may see (null = spectator). MUST hide other players' hidden cards/tiles and the deck order. */
  view(state: State, viewerSeat: number | null): View;
  /** Whose turn it is (seat index) or null when nobody must act (round over). */
  turn(state: State): number | null;
  /**
   * A legal, reasonable command for a bot or a timed-out player in `seat`. `context.timedOut` is true when a
   * human's turn timer ran out (a module may play more cautiously, e.g. fold instead of call).
   */
  botCommand(state: State, seat: number, rng: () => number, context?: BotContext): Command;
  /** Final result once the round is over (null while it runs): points per seat (this round) and winner seats. */
  settle(state: State): { points: number[]; winners: number[] } | null;

  /* Optional refinements; leave them out and the service uses the documented default. */

  /** Display name used as the activity title. Default: `kind`. */
  title?: string;
  /** Seat counts for these options (e.g. Gömmeli Batak is 3-handed). Default: `seats`. */
  seatsFor?(options: Options): readonly number[];
  /** Validates `game.create.options`. Default: the options are `undefined`. */
  parseOptions?(input: Record<string, GameOptionValue> | undefined): Options | GameError;
  /** Buttons for the seat whose turn it is. Default: every name in `actions`. */
  legalActions?(state: State, seat: number): readonly string[];
  /** Public end-of-round record kept in the table history. MUST NOT reveal hidden info. Default: settle(). */
  summary?(state: State): Record<string, unknown>;
  /** A new phase (e.g. a betting street) restarts the turn timer even when the same seat keeps acting. */
  phase?(state: State): string | number | null;
  /** Service integration only the original four tables need. New games leave it out. */
  table?: GameTableHooks<State, Options>;
}

/** A player mistake. `action()`/`parseCommand()` return it instead of throwing; `error` is the code shown to clients. */
export interface GameError {
  error: string;
}
export interface BotContext {
  timedOut: boolean;
}
export type GameOptionValue = string | number | boolean;

/** The `game.action` command as the client sent it. New games read `payload`; the flat fields are the legacy shape. */
export interface GameActionInput {
  action: string;
  payload?: unknown;
  amount?: number;
  cardId?: string;
  tileIds?: string[];
  melds?: string[][];
  trump?: 'clubs' | 'diamonds' | 'hearts' | 'spades';
}

/** What the service tells the virtual-chip hooks about a seated player. */
export interface ChipPlayer {
  userId: string;
  chips: number;
  bet: number;
}
/** Option fields the built-in tables store at the top level (from `game.create`/`game.configure`). */
export interface LegacyTableFields {
  variant: 'ihaleli' | 'esli' | 'koz-maca' | 'gommeli';
  folding: boolean;
  teams: boolean;
  /** The table's Hold'em rules, defaults filled in. */
  holdemRules: HoldemTableRules;
}

/** Hooks for the built-in Hold'em, Blackjack, Batak and 101 tables, kept so stored tables and clients stay compatible. */
export interface GameTableHooks<State, Options> {
  /** Stored-table property that holds the round. Default: `round`. */
  stateKey?: 'holdem' | 'blackjack' | 'batak' | 'okey';
  /** Reads the options from the built-in top-level table fields instead of `options`. */
  tableOptions?(fields: LegacyTableFields): Options;
  /**
   * User ids in module-seat order when the round tracks its own players (Hold'em, Blackjack).
   * Default: every seated player, ordered by seat number.
   */
  roundPlayers?(state: State): readonly string[];
  /** Players may sit and bots be added while a round runs; they join the next round (Hold'em). */
  lateSeating?: boolean;
  /** Virtual-chip economy (Hold'em, Blackjack): seated stacks go into the round and come back after it. */
  chips?: {
    /** Replaces `start()` so the round gets every player's stack and bet. */
    start(players: ChipPlayer[], options: Options, first: number): State;
    /** Stacks to write back to the seats once the round is settled. */
    finalChips(state: State): readonly { userId: string; chips: number }[];
    /** Players set a per-round `bet` between rounds (Blackjack). */
    tableBets?: boolean;
  };
  /** Extra fields for the turn-timeout recovery notice (Hold'em `toCall`), read before the bot acts. */
  timeoutDetails?(state: State, seat: number): { toCall?: number };
}

/** Any registered module, with its type parameters erased for the dispatcher. */
export type AnyGameModule = GameModule<any, any, any, any>;

/** `{ error }` results are told apart from states by shape: an object whose only key is a string `error`. */
export function isGameError(value: unknown): value is GameError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { error?: unknown }).error === 'string' &&
    Object.keys(value).length === 1
  );
}
/** Wraps a legacy rule function that throws error codes into the `State | GameError` contract. */
export function caught<T>(run: () => T): T | GameError {
  try {
    return run();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
