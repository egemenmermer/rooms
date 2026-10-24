import type { ComponentType } from 'react';
import type {
  ActivityCommand,
  GamePublicState,
} from '../../../../packages/activity-protocol/src';
import { batakGame } from './batak/entry';
import { blackjackGame } from './blackjack/entry';
import type { GameCatalogEntry } from './catalog';
import { holdemGame } from './holdem/entry';
import { okeyGame } from './okey/entry';
import { okey101Game } from './okey101/entry';
import { pistiGame } from './pisti/entry';
import { comingSoonGame } from './shared/ComingSoonTable';
import type { TableUI } from './shared/table-ui';
import { tavlaGame } from './tavla/entry';

export type GameHistoryEntry = GamePublicState['history'][number];
export type GameCreateCommand = Extract<ActivityCommand, { type: 'game.create' }>;
/**
 * Table setup choices made before `game.create` (flat, like `game.create.options`). The route
 * (`games/index.tsx`) keeps them so dev fixtures can preset them; each game reads its own keys.
 */
export type GameSetupValues = Record<string, string | number | boolean>;
export type RuleRow = [label: string, value: string];

/** A setup page shown before the table is created (Batak variants, 101 house rules). */
export interface GameCreateDefinition {
  /** Choices before the person touches anything; the route's values override them. */
  defaults: GameSetupValues;
  title: string;
  subtitle: string;
  /** The choice buttons; `onChange` merges a patch into the setup values. */
  Options: ComponentType<{ value: GameSetupValues; onChange(patch: GameSetupValues): void }>;
  /** "Masa özeti" rows between "Oyun" and "Puan". */
  summary(value: GameSetupValues): RuleRow[];
  /** "Masa kuralları" modal rows. */
  rules(value: GameSetupValues): RuleRow[];
  /** Game-specific part of the `game.create` command, e.g. `{ variant }` or `{ options }`. */
  command(value: GameSetupValues): Partial<Omit<GameCreateCommand, 'type' | 'game'>>;
}

/**
 * One game's client views. A new game is one folder (`games/<game>/catalog.tsx` + `entry.tsx`) plus
 * one line here and one in `catalog.ts`; shared views (TableShell, Lobby, History, CreateGame) never
 * branch on the kind.
 */
export interface GameDefinition {
  /** Name, art, players, description; also loaded on its own by the main bundle (`catalog.ts`). */
  catalog: GameCatalogEntry;
  /** The playing table, rendered by `shared/TableShell.tsx` under the shared header and banners. */
  Table?: ComponentType<TableUI>;
  /** Hold'em only, until phase B moves its table out of `shared/Lobby.tsx`. */
  tableInLobby?: boolean;
  /** "Masa kuralları" rows on the playing table. */
  ruleRows(game: GamePublicState): RuleRow[];
  /** Extra "Masa kuralları" rows in the waiting lobby, after "Oyun" and "Koltuk". */
  lobbyRuleRows?(game: GamePublicState): RuleRow[];
  /** Body of a finished hand in the history page (`shared/History.tsx`). */
  HistoryDetail: ComponentType<{ entry: GameHistoryEntry }>;
  /** The viewer's own result on a history row; default: their seat's points. */
  historyResult?(result: Record<string, unknown>, entry: GameHistoryEntry, userId?: string): string;
  /** Setup page before `game.create`; without it the lobby's plain "Masayı kur" dialog is used. */
  create?: GameCreateDefinition;
  /** Seated players needed before the lobby offers "Oyunu başlat"; default: every seat. */
  minSeats?: number;
  /** Why the waiting lobby cannot deal yet once enough seats are taken ('' = ready). */
  startBlocker?(game: GamePublicState): string;
  /**
   * Actions a seated player may send between hands, outside the server's `legalActions` and turn
   * order (Blackjack's opening `bet`). Everything else follows `view.legalActions`.
   */
  betweenHandActions?: readonly string[];
}

/** Every game the client renders. One line per game. */
const definitions: readonly GameDefinition[] = [
  holdemGame,
  blackjackGame,
  batakGame,
  okey101Game,
  pistiGame,
  okeyGame,
  tavlaGame,
];

export const gameRegistry: ReadonlyMap<string, GameDefinition> = new Map(
  definitions.map((definition) => [definition.catalog.kind, definition]),
);

/** A game this client does not know yet (a newer server) gets the "coming soon" table. */
export function gameDefinition(kind: string): GameDefinition {
  return gameRegistry.get(kind) ?? unknownGame(kind);
}

const unknown = new Map<string, GameDefinition>();
function unknownGame(kind: string) {
  let definition = unknown.get(kind);
  if (!definition) {
    definition = comingSoonGame({
      kind,
      name: kind,
      players: '',
      detail: '',
      lobbyDetail: '',
      scoring: 'points',
      section: 'tables',
      fallbackCapacity: 4,
      offered: false,
      Art: () => null,
      LobbyArt: () => null,
    });
    unknown.set(kind, definition);
  }
  return definition;
}
