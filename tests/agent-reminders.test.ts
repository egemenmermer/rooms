import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { AgentRepository, type AgentOutboxItem } from '../apps/services/agent/repository';
import { createAgentServer } from '../apps/services/agent/server';
const principal = { userId: 'alice', roomIds: ['room'], canManage: true };
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'rooms-reminders-')),
    key = randomBytes(32);
  let now = Date.now(),
    mapped = true,
    enabled = true,
    failDelivery = false,
    models = 0;
  const delivered: AgentOutboxItem[] = [];
  const config = () => ({
    repository: new AgentRepository(directory, key),
    clock: () => now,
    authorize: async (token: string) => {
      if (token !== 'fixture-token' || !enabled)
        throw Object.assign(new Error('AUTH_DENIED'), { statusCode: 403 });
      return principal;
    },
    reauthorize: async () => {
      if (!enabled) throw new Error('Revoked');
      return principal;
    },
    executor: async () => {
      models++;
      throw new Error('Reminder must not invoke models');
    },
    remindersAvailable: async () => mapped,
    reminderTarget: async (
      _p: unknown,
      input: { roomId: string; channelId: string; sourceMessageId: string },
    ) => {
      if (!mapped || input.channelId !== 'channel' || input.sourceMessageId !== 'ordinary-message')
        throw Object.assign(new Error('REMINDER_TARGET_DENIED'), { statusCode: 403 });
      return {
        platform: 'stoat' as const,
        channelId: input.channelId,
        sourceMessageId: input.sourceMessageId,
        sourceAuthorId: 'mapped-stoat-author',
      };
    },
    deliverNotification: async (item: AgentOutboxItem) => {
      delivered.push(item);
      if (failDelivery) throw new Error('Unknown ACK');
    },
  });
  let current = config();
  let app = await createAgentServer(current);
  await app.server.listen({ host: '127.0.0.1', port: 0 });
  const request = (path: string, method = 'GET', body?: unknown) =>
    fetch(app.server.listeningOrigin + path, {
      method,
      headers: { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  const create = async () => {
    const response = await request('/v1/reminders', 'POST', {
      roomId: 'room',
      channelId: 'channel',
      sourceMessageId: 'ordinary-message',
      text: 'Film gecesi',
      runAt: new Date(now + 60000).toISOString(),
    });
    expect(response.status).toBe(200);
    return response.json() as Promise<any>;
  };
  return {
    request,
    create,
    delivered,
    repository: () => current.repository,
    models: () => models,
    advance: () => {
      now += 60001;
    },
    tick: () => app.tick(),
    read: async () => (await request('/v1/tasks?roomId=room')).json() as Promise<any[]>,
    revokeMapping: () => {
      mapped = false;
    },
    revokeUser: () => {
      enabled = false;
    },
    fail: () => {
      failDelivery = true;
    },
    restart: async () => {
      await app.server.close();
      current = config();
      app = await createAgentServer(current);
      await app.server.listen({ host: '127.0.0.1', port: 0 });
    },
    memory: async () => (await request('/v1/memory?roomId=room')).json() as Promise<any[]>,
    close: async () => {
      await app.server.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
describe('ordinary-message reminders over actual HTTP', () => {
  it('schedules an explicitly approved source reply without a model or automatic memory and sends once across restart', async () => {
    const f = await fixture();
    try {
      expect(((await (await f.request('/v1/status')).json()) as any).capabilities).toContain(
        'stoat-reminders',
      );
      const t = await f.create();
      expect(t.kind).toBe('reminder');
      expect(t.state).toBe('scheduled');
      expect(t.modelConnectionId).toBe('');
      await f.restart();
      f.advance();
      await f.tick();
      expect(f.delivered).toHaveLength(1);
      expect(f.delivered[0]).toMatchObject({
        channelId: 'channel',
        sourceMessageId: 'ordinary-message',
        content: 'Hatırlatma: Film gecesi',
      });
      expect((await f.read())[0].state).toBe('completed');
      expect(await f.memory()).toHaveLength(0);
      expect(f.models()).toBe(0);
      await f.restart();
      await f.tick();
      expect(f.delivered).toHaveLength(1);
    } finally {
      await f.close();
    }
  });
  it('rejects unauthorized source channels and stops cancelled or revoked reminders', async () => {
    const f = await fixture();
    try {
      expect(
        (
          await f.request('/v1/reminders', 'POST', {
            roomId: 'room',
            channelId: 'wrong-channel',
            sourceMessageId: 'ordinary-message',
            text: 'No',
            runAt: new Date(Date.now() + 60000).toISOString(),
          })
        ).status,
      ).toBe(403);
      const t = await f.create();
      await f.request(`/v1/tasks/${t.id}/cancel`, 'POST', {});
      f.advance();
      await f.tick();
      expect(f.delivered).toHaveLength(0);
      expect((await f.read())[0].state).toBe('cancelled');
      await f.create();
      f.revokeMapping();
      f.advance();
      await f.tick();
      expect(f.delivered).toHaveLength(0);
      expect((await f.read())[1].state).toBe('failed');
      expect(((await (await f.request('/v1/status')).json()) as any).capabilities).not.toContain(
        'stoat-reminders',
      );
    } finally {
      await f.close();
    }
  });
  it('does not replay a reminder after an unknown delivery outcome', async () => {
    const f = await fixture();
    try {
      await f.create();
      f.fail();
      f.advance();
      await f.tick();
      expect(f.delivered).toHaveLength(1);
      expect((await f.read())[0].state).toBe('interrupted');
      await f.restart();
      await f.tick();
      expect(f.delivered).toHaveLength(1);
      expect(f.models()).toBe(0);
      expect(await f.memory()).toHaveLength(0);
    } finally {
      await f.close();
    }
  });
  it('resumes a persisted pending outbox once and prevents sending a cancelled pending reminder', async () => {
    const f = await fixture();
    try {
      const first = await f.create();
      const persistBoundary = (taskId: string) => {
        const repo = f.repository(),
          t = repo.data.tasks.find((t) => t.id === taskId)!;
        t.state = 'running';
        repo.data.outbox.push({
          ...repo.data.notificationTargets[taskId],
          id: `${taskId}:reminder:`,
          taskId,
          userId: 'alice',
          roomId: 'room',
          content: 'Hatırlatma: Film gecesi',
          state: 'pending',
          attempts: 0,
          createdAt: new Date().toISOString(),
          error: null,
        });
        repo.save();
      };
      persistBoundary(first.id);
      await f.request(`/v1/tasks/${first.id}/cancel`, 'POST', {});
      await f.restart();
      await f.tick();
      expect(f.delivered).toHaveLength(0);
      expect((await f.read())[0].state).toBe('cancelled');
      const second = await f.create();
      persistBoundary(second.id);
      await f.restart();
      await f.tick();
      expect(f.delivered).toHaveLength(1);
      expect((await f.read())[1].state).toBe('completed');
      await f.restart();
      await f.tick();
      expect(f.delivered).toHaveLength(1);
    } finally {
      await f.close();
    }
  });
});
