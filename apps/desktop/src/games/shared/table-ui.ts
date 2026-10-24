import type {
  ActivityCommand,
  GamePublicState,
} from '../../../../../packages/activity-protocol/src';

type GameAction = Extract<ActivityCommand, { type: 'game.action' }>['action'];
export type TableUI = {
  game: GamePublicState;
  userId?: string;
  can(action: string): boolean;
  action(name: GameAction, extra?: Record<string, unknown>): Promise<boolean>;
  timer: number | null;
  busy: boolean;
};
