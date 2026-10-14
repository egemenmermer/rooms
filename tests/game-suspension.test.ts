import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { applyCommand, emptyRoom, pruneDisconnected } from '../apps/services/activities/engine';
import type { ActivityCommand } from '../packages/activity-protocol/src';

describe('retained table suspension', () => {
  it('freezes a closed hand while another Activity is active and resumes the same cards only after explicit seat return', () => {
    const room = emptyRoom('friends', 1000),
      identity = { userId: 'owner', displayName: 'Owner', canControl: true, canCreate: true };
    const send = (command: ActivityCommand) =>
      applyCommand(
        room,
        identity,
        {
          protocolVersion: 1,
          commandId: randomUUID(),
          expectedRevision: room.snapshot.revision,
          command,
        },
        1000,
      );
    send({ type: 'join' });
    send({ type: 'game.create', game: 'holdem' });
    send({ type: 'game.bot.add', seat: 1 });
    send({ type: 'game.action', action: 'start' });
    send({ type: 'game.action', action: 'call' });
    expect(room.game?.holdem?.turn).toBe(1);
    const before = structuredClone(room.game);
    send({ type: 'end' });
    expect(pruneDisconnected(room, 1100)).toBe(false);
    expect(room.game).toEqual(before);
    send({ type: 'start', activity: 'youtube', title: 'Independent watch session' });
    expect(pruneDisconnected(room, 1200)).toBe(false);
    expect(room.game).toEqual(before);
    send({ type: 'end' });
    send({ type: 'game.sit', seat: 0 });
    expect(room.game).toEqual(before);
    expect(pruneDisconnected(room, 1300)).toBe(true);
    expect(room.game?.holdem?.revision).toBeGreaterThan(before!.holdem!.revision);
    expect(room.game?.holdem?.seats[0].cards).toEqual(before?.holdem?.seats[0].cards);
  });
});
