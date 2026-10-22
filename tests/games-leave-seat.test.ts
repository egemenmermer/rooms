import { describe, expect, it } from 'vitest';
import {
  advanceGameBots,
  createGame,
  gameCommand,
  heartbeatGame,
} from '../apps/services/activities/games';

const actor = (userId: string) => ({
  userId,
  displayName: userId,
  canControl: true,
  canCreate: true,
});

describe('Masadan kalk', () => {
  it('frees the seat between hands, and polling does not take it back', () => {
    const table = createGame({ type: 'game.create', game: 'batak' }, actor('owner'));
    gameCommand(table, { type: 'game.sit', seat: 0 }, actor('owner'), 1000);
    gameCommand(table, { type: 'game.sit', seat: 1 }, actor('ece'), 1000);
    gameCommand(table, { type: 'game.leave' }, actor('ece'), 2000);
    heartbeatGame(table, 'ece');
    expect(table.seats.map((seat) => seat.userId)).toEqual(['owner']);
    // Someone else can take the seat now.
    gameCommand(table, { type: 'game.sit', seat: 1 }, actor('can'), 3000);
    expect(table.seats.find((seat) => seat.seat === 1)?.userId).toBe('can');
  });

  it('lets a bot finish the hand and frees the seat once it ends', () => {
    const table = createGame({ type: 'game.create', game: 'holdem' }, actor('owner'));
    gameCommand(table, { type: 'game.sit', seat: 0 }, actor('owner'), 1000);
    gameCommand(table, { type: 'game.sit', seat: 1 }, actor('ece'), 1000);
    gameCommand(table, { type: 'game.action', action: 'start' }, actor('owner'), 1000);
    expect(table.status).toBe('playing');
    gameCommand(table, { type: 'game.leave' }, actor('ece'), 2000);
    heartbeatGame(table, 'ece');
    const ece = table.seats.find((seat) => seat.userId === 'ece')!;
    expect(ece.connected).toBe(false);
    expect(ece.bot).toBe(true);
    for (let now = 3000; table.status === 'playing' && now < 200_000; now += 1000) {
      const turn = table.holdem?.turn;
      const current = table.seats.find(
        (seat) => seat.seat === table.holdem?.seats[turn ?? -1]?.seat,
      );
      if (current?.userId === 'owner')
        gameCommand(table, { type: 'game.action', action: 'fold' }, actor('owner'), now);
      else advanceGameBots(table, now);
    }
    expect(table.status).not.toBe('playing');
    advanceGameBots(table, 300_000);
    expect(table.seats.map((seat) => seat.userId)).toEqual(['owner']);
  });
});
