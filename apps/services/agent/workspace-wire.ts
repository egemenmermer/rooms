import type { FastifyInstance } from 'fastify';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import type { AgentTask } from '../../../packages/agent-contracts/src/index';
import { terminalInputSchema } from '../../../packages/shared-contracts/src/hostops';
import type { OpsTerminal } from '../../../packages/shared-contracts/src/hostops';
import type { AgentPrincipal } from './server';
import type { WorkspaceTerminals } from './workspace-terminals';

export function registerWorkspaceTerminals(
  app: FastifyInstance,
  terminal: WorkspaceTerminals,
  config: {
    authenticate(header: string | undefined): Promise<AgentPrincipal>;
    task(principal: AgentPrincipal, id: string): AgentTask;
    stop(task: AgentTask): Promise<void>;
    changed?(task: AgentTask, terminal: OpsTerminal | null): void;
  },
) {
  const own = (p: AgentPrincipal, id: string) => {
    const task = config.task(p, id);
    if (task.ownerId !== p.userId || task.kind === 'reminder')
      throw Object.assign(Error('OWN_WORKSPACE_REQUIRED'), { statusCode: 403 });
    return task;
  };
  const identity = async (header: string | undefined, id: string) => {
    const p = await config.authenticate(header);
    return { p, task: own(p, id) };
  };
  app.get<{ Params: { id: string } }>('/v1/tasks/:id/terminals', async (req) => {
    const { task } = await identity(req.headers.authorization, req.params.id);
    return terminal.list(task);
  });
  app.post<{ Params: { id: string } }>('/v1/tasks/:id/terminals/take', async (req) => {
    const { task } = await identity(req.headers.authorization, req.params.id);
    const value = await terminal.take(task, () => config.stop(task));
    // Authority can change while the command is stopping. Never expose or leave a new shell behind.
    try {
      await identity(req.headers.authorization, req.params.id);
    } catch (error) {
      terminal.close(task, value.id);
      throw error;
    }
    config.changed?.(task, value);
    return value;
  });
  app.post<{ Params: { id: string; session: string } }>(
    '/v1/tasks/:id/terminals/:session/close',
    async (req) => {
      const { task } = await identity(req.headers.authorization, req.params.id);
      const value = terminal.close(task, z.string().uuid().parse(req.params.session));
      config.changed?.(task, null);
      return value;
    },
  );
  const server = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  let stopped = false,
    pending = 0;
  app.server.on('upgrade', (req, socket, head) => {
    if (stopped || pending >= 8 || server.clients.size >= 16) {
      socket.destroy();
      return;
    }
    pending++;
    const timeout = setTimeout(() => socket.destroy(), 15_000);
    timeout.unref();
    void (async () => {
      const path = new URL(req.url ?? '', 'http://localhost');
      const match = /^\/v1\/tasks\/([a-f0-9-]{36})\/terminals\/([a-f0-9-]{36})\/stream$/.exec(
        path.pathname,
      );
      if (!match || path.search) throw Error('INVALID_UPGRADE');
      const { p, task } = await identity(req.headers.authorization, match[1]);
      const sessionId = z.string().uuid().parse(match[2]);
      if (!terminal.list(task).some((s) => s.id === sessionId))
        throw Error('TERMINAL_ACCESS_DENIED');
      if (stopped || socket.destroyed) return;
      server.handleUpgrade(req, socket, head, (ws) => {
        let closed = false,
          queue = Promise.resolve(),
          inputs = 0,
          second = 0,
          count = 0;
        let attached: ReturnType<WorkspaceTerminals['hub']['attach']>;
        try {
          attached = terminal.hub.attach(terminal.hostId, sessionId, p.userId, (event) => {
            if (ws.readyState !== WebSocket.OPEN) return;
            if (ws.bufferedAmount > 1024 * 1024) {
              ws.close(1008, 'BACKPRESSURE');
              return;
            }
            ws.send(JSON.stringify(event));
          });
        } catch {
          ws.close(1008, 'TERMINAL_ACCESS_DENIED');
          return;
        }
        const recheck = async () => {
          const fresh = await identity(req.headers.authorization, match[1]);
          if (fresh.p.userId !== p.userId) throw Error('IDENTITY_CHANGED');
          terminal.hub.check(terminal.hostId, sessionId, p.userId);
        };
        const timer = setInterval(
          () =>
            void recheck().catch(() => {
              // Losing host Agent authority also terminates the isolated human shell.
              try {
                terminal.close(task, sessionId);
              } catch {
                /* Already closed. */
              }
              ws.close(1008, 'AUTHORITY_REVOKED');
            }),
          2000,
        );
        timer.unref();
        ws.on('message', (data) => {
          const at = Math.floor(Date.now() / 1000);
          if (at !== second) {
            second = at;
            count = 0;
          }
          if (++count > 120 || ++inputs > 32) {
            ws.close(1008, 'INPUT_LIMIT');
            return;
          }
          queue = queue
            .then(async () => {
              if (closed) return;
              await recheck();
              if (!closed) attached.input(terminalInputSchema.parse(JSON.parse(String(data))));
            })
            .catch(() => {
              try {
                terminal.close(task, sessionId);
              } catch {
                /* Already closed. */
              }
              ws.close(1008, 'INPUT_REFUSED');
            })
            .finally(() => {
              inputs--;
            });
        });
        ws.on('close', () => {
          closed = true;
          clearInterval(timer);
          attached.detach();
        });
        ws.on('error', () => ws.close());
      });
    })()
      .catch(() => socket.destroy())
      .finally(() => {
        pending--;
        clearTimeout(timeout);
      });
  });
  const expire = setInterval(() => terminal.hub.expire(), 5000);
  expire.unref();
  app.addHook('onClose', async () => {
    stopped = true;
    clearInterval(expire);
    for (const ws of server.clients) ws.terminate();
    server.close();
  });
}
