import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { applyCommand, emptyRoom } from '../apps/services/activities/engine';
import { MemoryActivityRepository } from '../apps/services/activities/repository';
import { createActivityServer } from '../apps/services/activities/server';

it('keeps sweeping the other rooms when one room fails to load', async () => {
  const repository = new MemoryActivityRepository();
  for (const id of ['bad', 'good']) {
    const room = emptyRoom(id, 0);
    applyCommand(
      room,
      { userId: 'ece', displayName: 'Ece', canControl: true, canCreate: true },
      {
        protocolVersion: 1,
        commandId: randomUUID(),
        expectedRevision: 0,
        command: { type: 'join' },
      },
      0,
    );
    await repository.save(room);
  }
  const load = repository.load.bind(repository);
  repository.load = async (id) => {
    if (id === 'bad') throw new Error('corrupt row');
    return load(id);
  };
  const events = vi.fn();
  const app = await createActivityServer({
    repository,
    authorize: async () => {
      throw new Error('unused');
    },
    clock: () => 10 * 60_000,
    sweepIntervalMs: 20,
    onOperationalEvent: events,
  } as never);
  try {
    await vi.waitFor(async () =>
      expect((await load('good'))?.snapshot.participants).toHaveLength(0),
    );
    expect(events).toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
