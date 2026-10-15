import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WorkspaceTerminals } from '../apps/services/agent/workspace-terminals';
import type { AgentTask } from '../packages/agent-contracts/src/index';
import type { TerminalDriver } from '../apps/services/hostops/terminals';
import type { ExecutionContext } from '../apps/services/agent/worker';
import Fastify from 'fastify';
import { registerWorkspaceTerminals } from '../apps/services/agent/workspace-wire';
import { WebSocket } from 'ws';
import { once } from 'node:events';
const roots: string[] = [];
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rooms-workspace-')));
  roots.push(root);
  const task: AgentTask = {
    id: randomUUID(),
    roomId: 'room',
    ownerId: 'alice',
    prompt: 'task',
    modelConnectionId: randomUUID(),
    state: 'running',
    progress: [],
    result: null,
    artifacts: [],
    createdAt: new Date().toISOString(),
    runAt: null,
    error: null,
  };
  const alive = new Set<string>();
  const writes: string[] = [];
  const driver: TerminalDriver = {
    exists: (id) => alive.has(id),
    create: (id) => {
      alive.add(id);
    },
    close: (id) => {
      alive.delete(id);
    },
    attach: () => ({ write: (s) => writes.push(s), resize: vi.fn(), detach: vi.fn() }),
  };
  const file = join(root, 'state.json'),
    config = { image: 'test', workspaceRoot: root };
  const manager = new WorkspaceTerminals('core', config, file, driver, [task]);
  return { root, task, driver, file, config, manager, alive, writes };
}
it('waits for the whole AI execution to stop before exposing a writable isolated workspace', async () => {
  const f = fixture();
  let stop!: () => void;
  const stopped = new Promise<void>((resolve) => {
    stop = resolve;
  });
  const executor = f.manager.guard(async () => {
    await stopped;
    return { result: '', artifacts: [] };
  });
  const run = executor({ task: f.task } as ExecutionContext);
  const take = f.manager.take(f.task, async () => {});
  await Promise.resolve();
  expect(f.alive.size).toBe(0);
  stop();
  await run;
  const session = await take;
  expect(session.kind).toBe('workspace');
  expect(session.taskId).toBe(f.task.id);
  await expect(executor({ task: f.task } as ExecutionContext)).rejects.toThrow(
    /insanın kontrolünde/,
  );
  const first = f.manager.hub.attach('core', session.id, 'alice', () => {});
  const second = f.manager.hub.attach('core', session.id, 'alice', () => {});
  first.input({ type: 'input', sequence: 0, data: 'echo safe\r' });
  expect(() => second.input({ type: 'input', sequence: 0, data: 'race\r' })).toThrow(/VIEW_ONLY/);
  expect(f.writes).toEqual(['echo safe\r']);
  first.detach();
  second.detach();
  f.manager.hub.shutdown();
  const restored = new WorkspaceTerminals('core', f.config, f.file, f.driver, [f.task]);
  expect(restored.list(f.task)[0].id).toBe(session.id);
  const guarded = restored.guard(async () => ({ result: '', artifacts: [] }));
  await expect(guarded({ task: f.task } as ExecutionContext)).rejects.toThrow(
    /insanın kontrolünde/,
  );
  restored.close(f.task, session.id);
  await expect(guarded({ task: f.task } as ExecutionContext)).resolves.toEqual({
    result: '',
    artifacts: [],
  });
  await guarded.close?.();
});
it('failed or concurrent takeover never creates a terminal and cannot preempt another task', async () => {
  const f = fixture();
  await expect(
    f.manager.take(f.task, async () => {
      throw Error('stop not confirmed');
    }),
  ).rejects.toThrow(/not confirmed/);
  expect(f.alive.size).toBe(0);
  let finish!: () => void;
  const executor = f.manager.guard(async () => {
    await new Promise<void>((r) => {
      finish = r;
    });
    return { result: '', artifacts: [] };
  });
  const run = executor({ task: f.task } as ExecutionContext);
  await expect(f.manager.take({ ...f.task, id: randomUUID() }, async () => {})).rejects.toThrow(
    /BUSY/,
  );
  finish();
  await run;
  await executor.close?.();
});
it('requires the task owner and rechecks authority during the actual terminal stream', async () => {
  const f = fixture(),
    app = Fastify();
  let enabled = true;
  registerWorkspaceTerminals(app, f.manager, {
    authenticate: async (header) => {
      if (!enabled) throw Error('revoked');
      return { userId: header ?? '', roomIds: ['room'], canManage: true };
    },
    task: (_p, id) => {
      if (id !== f.task.id) throw Error('missing');
      return f.task;
    },
    stop: async () => {},
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  try {
    const path = `/v1/tasks/${f.task.id}/terminals`;
    expect(
      (await app.inject({ url: path, headers: { authorization: 'other-manager' } })).statusCode,
    ).toBe(403);
    const session = (
      await app.inject({ method: 'POST', url: path + '/take', headers: { authorization: 'alice' } })
    ).json();
    expect(session.kind).toBe('workspace');
    const ws = new WebSocket(
      app.listeningOrigin.replace('http:', 'ws:') + path + `/${session.id}/stream`,
      { headers: { authorization: 'alice' } },
    );
    await once(ws, 'open');
    ws.send(JSON.stringify({ type: 'input', sequence: 0, data: 'safe' }));
    const deadline = Date.now() + 3000;
    while (!f.writes.length) {
      if (Date.now() > deadline) throw Error('input timeout');
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(f.writes).toEqual(['safe']);
    enabled = false;
    const closed = once(ws, 'close');
    ws.send(JSON.stringify({ type: 'input', sequence: 1, data: 'must not run' }));
    await closed;
    expect(f.writes).toEqual(['safe']);
  } finally {
    await app.close();
    f.manager.hub.shutdown();
  }
});
