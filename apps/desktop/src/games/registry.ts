import type { ComponentType } from 'react';
import type { ActivityCommand, GamePublicState } from '../../../../packages/activity-protocol/src';
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

/** What `shared/Lobby.tsx` hands a table it renders itself (`LobbyTable`, Hold'em). */
export interface LobbyTableProps {
  game: GamePublicState;
  userId?: string;
  /** The lobby's own check: legal, own turn, connected, not taken over. Not TableShell's `can`. */
  can(action: string): boolean;
  /** The lobby's command path: one command at a time, scoped to the room and activity. */
  send(command: ActivityCommand): Promise<boolean>;
  /** Opens the lobby's "Masaya katıl" dialog for an empty seat. */
  onSit(seat: number): void;
  /** False while a lobby dialog is open, so table shortcuts stay off. */
  shortcuts: boolean;
  ready: boolean;
  busy: boolean;
  /** A labelled local fixture: every command stays closed with this reason. */
  fixtureReason?: string;
  /** Turn seconds left (server clock), null when nobody is on the clock. */
  timer: number | null;
  /** Why the next hand cannot be dealt yet ('' = ready), from the lobby's start checks. */
  startReason: string;
}

/** Table rules typed in the lobby's plain "Masayı kur" dialog and, by the owner, before the first hand. */
export interface TableRulesDefinition {
  /** Starting values: the waiting table's rules, or a new table's defaults (`game` null); null = not known yet. */
  initial(game: GamePublicState | null): GameSetupValues | null;
  /** `editing`: the waiting table's "Düzenle" dialog, which can only send `configure`. */
  Form: ComponentType<{
    value: GameSetupValues;
    onChange(value: GameSetupValues): void;
    editing: boolean;
  }>;
  valid(value: GameSetupValues): boolean;
  /** Game-specific part of `game.create`. */
  command(value: GameSetupValues): Partial<Omit<GameCreateCommand, 'type' | 'game'>>;
  /** The owner's change before the first hand; without it the lobby offers no "Düzenle". */
  configure?(value: GameSetupValues): ActivityCommand;
}

/** Chips a player brings to a seat; the lobby's "Masaya katıl" dialog shows `Field` and sends `buyIn`. */
export interface BuyInDefinition {
  initial(game: GamePublicState): number;
  Field: ComponentType<{ game: GamePublicState; value: number; onChange(value: number): void }>;
  valid(game: GamePublicState, value: number): boolean;
}

/**
 * One game's client views. A new game is one folder (`games/<game>/catalog.tsx` + `entry.tsx`) plus
 * one line here and one in `catalog.ts`; shared views (TableShell, Lobby, History, CreateGame) never
 * branch on the kind.
 */
export interface GameDefinition {
  /** Name, art, players, description; also loaded on its own by the main bundle (`catalog.ts`). */
  catalog: GameCatalogEntry;
  /**
   * The playing table, rendered by `shared/TableShell.tsx` under the shared header and banners, in a
   * table area that fills the space above the dock. Put the player's own hand/rack/action bar in
   * `<TableDock>` (`shared/TableDock.tsx`) so it stays on screen; size the felt to the area.
   */
  Table?: ComponentType<TableUI>;
  /** The playing table stays on the lobby page (Hold'em: late seating and buy-ins); set with `LobbyTable`. */
  tableInLobby?: boolean;
  /** The table `shared/Lobby.tsx` renders while a `tableInLobby` game is playing or finished. */
  LobbyTable?: ComponentType<LobbyTableProps>;
  /** Rules form in the plain create dialog and the waiting lobby's "Düzenle". */
  tableRules?: TableRulesDefinition;
  /** Buy-in field when taking a seat. */
  buyIn?: BuyInDefinition;
  /** "Masa kuralları" rows on the playing table. */
  ruleRows(game: GamePublicState): RuleRow[];
  /** Extra "Masa kuralları" rows in the waiting lobby, after "Oyun" and "Koltuk". */
  lobbyRuleRows?(game: GamePublicState): RuleRow[];
  /** Body of a finished hand in the history page (`shared/History.tsx`). */
  HistoryDetail: ComponentType<{ entry: GameHistoryEntry }>;
  /**
   * Wording of the finish strip and heading when a table ends: default "El tamamlandı" /
   * "Yeni el başlatabilirsin." / "Sonraki el"; return null to keep it (match games use `matchFinishLabels`).
   */
  finishLabels?(game: GamePublicState): { title: string; hint: string; next: string } | null;
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
