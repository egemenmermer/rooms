import {
  GAME_ACTION_PATTERN,
  GAME_KIND_PATTERN,
  MAX_GAME_SEATS,
} from '../../activity-protocol/src/index';
import { batakModule } from './batak-module';
import { blackjackModule } from './blackjack-module';
import { holdemModule } from './holdem-module';
import type { AnyGameModule } from './module';
import { okey101Module } from './okey101-module';

/**
 * Every table game the activity service can host. Adding a game is one module file that
 * implements `GameModule` (see module.ts) plus one line here; the protocol, service dispatcher,
 * storage codec and bots pick it up from the registry.
 */
const registeredModules: AnyGameModule[] = [
  holdemModule,
  blackjackModule,
  batakModule,
  okey101Module,
];

/** Names the service handles at table level before a module sees a command. */
const RESERVED_ACTIONS = new Set(['start']);
/** Shared-player activities use the same id space as game kinds (`primary.activity`). */
const RESERVED_KINDS = new Set(['cinema', 'youtube', 'hall', 'screen']);
const registry = new Map<string, AnyGameModule>();

function validate(module: AnyGameModule) {
  const problem = (reason: string) => new Error(`Invalid game module ${module.kind}: ${reason}`);
  if (!GAME_KIND_PATTERN.test(module.kind) || RESERVED_KINDS.has(module.kind))
    throw problem('kind');
  if (
    !module.seats.length ||
    module.seats.some((count) => !Number.isInteger(count) || count < 1 || count > MAX_GAME_SEATS)
  )
    throw problem('seats');
  if (
    !module.actions.length ||
    new Set(module.actions).size !== module.actions.length ||
    module.actions.some((name) => !GAME_ACTION_PATTERN.test(name) || RESERVED_ACTIONS.has(name))
  )
    throw problem('actions');
}
/** Adds a module at runtime (tests, or a game shipped behind a flag). Returns the matching unregister. */
export function registerGame(module: AnyGameModule): () => void {
  validate(module);
  if (registry.has(module.kind)) throw new Error(`Game kind ${module.kind} is already registered`);
  registry.set(module.kind, module);
  return () => {
    if (registry.get(module.kind) === module) registry.delete(module.kind);
  };
}
for (const module of registeredModules) registerGame(module);

export const gameModule = (kind: string): AnyGameModule | undefined => registry.get(kind);
export function requireGameModule(kind: string): AnyGameModule {
  const module = registry.get(kind);
  if (!module) throw new Error('UNKNOWN_GAME');
  return module;
}
export const isGameKind = (kind: unknown): kind is string =>
  typeof kind === 'string' && registry.has(kind);
export const gameKinds = (): string[] => [...registry.keys()];
