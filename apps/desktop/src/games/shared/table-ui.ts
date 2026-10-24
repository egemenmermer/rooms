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
  /** Owner/host may free this seat (bot, left, taken over or away); `SeatAvatar` reads the same via context. */
  canRemoveSeat?(seat: GamePublicState['seats'][number]): boolean;
  removeSeat?(seat: number): Promise<boolean>;
  /** A chip table's buy-back between hands ("Para al"), shown by the shell's end-of-hand strip. */
  canRebuy?: boolean;
  rebuy?(): Promise<boolean>;
};
