import { randomUUID } from 'node:crypto';
import { it, expect } from 'vitest';
import { createActivityServer } from '../apps/services/activities/server';
import { MemoryActivityRepository } from '../apps/services/activities/repository';

it('refreshes creation capability after permission changes during a long poll', async () => {
  let canCreate = true,
    reads = 0;
  const app = await createActivityServer({
    repository: new MemoryActivityRepository(),
    authorize: async () => {
      reads++;
      return { userId: 'alice', displayName: 'Alice', canControl: false, canCreate };
    },
  });
  const headers = { authorization: 'Bearer own-test-token' };
  try {
    await app.inject({
      method: 'POST',
      url: '/v1/rooms/r/activity/commands',
      headers,
      payload: {
        protocolVersion: 1,
        commandId: randomUUID(),
        expectedRevision: 0,
        command: { type: 'join' },
      },
    });
    const pending = app.inject({ url: '/v1/rooms/r/activity?afterRevision=1&waitMs=40', headers });
    while (reads < 2) await new Promise((resolve) => setTimeout(resolve, 1));
    canCreate = false;
    const result = await pending;
    expect(result.json().room.participants[0]).toMatchObject({
      canCreate: false,
      canControl: false,
    });
    const denied = await app.inject({
      method: 'POST',
      url: '/v1/rooms/r/activity/commands',
      headers,
      payload: {
        protocolVersion: 1,
        commandId: randomUUID(),
        expectedRevision: 1,
        command: {
          type: 'poll.create',
          pollId: 'p',
          question: 'Choose',
          options: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
        },
      },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toBe('ACTIVITY_CREATE_DENIED');
  } finally {
    await app.close();
  }
});
