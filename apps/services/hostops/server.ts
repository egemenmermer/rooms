import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { createHash, timingSafeEqual } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { z, ZodError } from 'zod';
import {
  opsId,
  opsGrantSchema,
  opsThresholdsSchema,
  terminalInputSchema,
  type OpsHost,
  type OpsPermission,
  type HostSample,
} from '../../../packages/shared-contracts/src/hostops';
import { HostOpsStore } from './store';
import { TerminalHub } from './terminals';
import { ingressLimit, TRUSTED_PROXIES } from '../shared/ingress';
export interface HostSpec {
  id: string;
  label: string;
  physicalHostId: string;
  mode: 'shared' | 'dedicated';
  communityId: string;
  ownerProfileId: string | null;
  agentAvailable: boolean;
}
export interface OpsIdentity {
  userId: string;
  owner: boolean;
}
export function createHostOpsServer(config: {
  hosts: HostSpec[];
  store: HostOpsStore;
  identify(token: string, host: HostSpec): Promise<OpsIdentity>;
  terminals?: TerminalHub;
  sample?: () => Promise<HostSample>;
  now?: () => number;
  onAlert?: (input: { hostId: string; alertId: string; message: string }) => Promise<void>;
  internalAgent?: {
    key: string;
    identifyUser(userId: string, host: HostSpec): Promise<OpsIdentity>;
    visibleRooms?(userId: string, host: HostSpec, roomIds: string[]): Promise<string[]>;
  };
}) {
  const app = Fastify({ logger: false, trustProxy: TRUSTED_PROXIES, bodyLimit: 16384 });
  ingressLimit(app, { perMinute: 1200, error: 'RATE_LIMITED' });
  void app.register(rateLimit, {
    max: 180,
    timeWindow: '1 minute',
    keyGenerator: (req) =>
      req.headers.authorization
        ? createHash('sha256').update(req.headers.authorization.slice(0, 4096)).digest('hex')
        : req.ip,
  });
  const now = config.now ?? (() => Date.now()),
    wsServer = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  const failure = (message: string, statusCode = 403) =>
    Object.assign(Error(message), { statusCode });
  // Sign-in and membership refusals carry a 4xx status or an error code; anything else broke.
  const refused = (error: unknown) => {
    const e = error as { status?: unknown; statusCode?: unknown; message?: unknown };
    const status = e.statusCode ?? e.status;
    if (typeof status === 'number') return status < 500;
    return typeof e.message === 'string' && /^[A-Z_]{1,70}$/.test(e.message);
  };
  const tokenOf = (header: unknown) => {
    if (typeof header !== 'string' || header.length > 4096) throw failure('SIGN_IN_REQUIRED', 401);
    return header.replace(/^Bearer /, '');
  };
  const hostOf = (id: unknown) => {
    const h = config.hosts.find((h) => h.id === opsId.parse(id));
    if (!h) throw failure('HOST_UNAVAILABLE', 404);
    return h;
  };
  async function authorize(header: unknown, host: HostSpec, permission?: OpsPermission) {
    const p = await config.identify(tokenOf(header), host);
    const grant = config.store.grant(host.id, p.userId);
    const permissions: OpsPermission[] = p.owner
      ? ['monitor', 'terminal', 'agent']
      : (grant?.permissions ?? []);
    if (permission && !permissions.includes(permission)) throw failure('HOST_PERMISSION_REQUIRED');
    return {
      ...p,
      permissions,
      profileId: p.owner ? host.ownerProfileId : (grant?.profileId ?? null),
    };
  }
  function project(host: HostSpec, p: Awaited<ReturnType<typeof authorize>>): OpsHost {
    return {
      id: host.id,
      label: host.label,
      physicalHostId: host.physicalHostId,
      mode: host.mode,
      owner: p.owner,
      permissions: p.permissions,
      terminalAvailable: !!config.terminals && !!p.profileId,
      agentAvailable: host.agentAvailable,
      reason: null,
    };
  }
  app.setErrorHandler((error, _request, reply) => {
    const e = error as Error & { statusCode?: number };
    const code =
      e instanceof ZodError
        ? 'INVALID_REQUEST'
        : /^[A-Z_]{1,70}$/.test(e.message)
          ? e.message
          : 'HOSTOPS_UNAVAILABLE';
    reply.code(e instanceof ZodError ? 400 : (e.statusCode ?? 503)).send({ error: code });
  });
  app.get('/health', async () => ({ ok: true }));
  // Server-to-server only; the desktop never receives this key or a user-id impersonation API.
  app.post('/internal/agent-authority', async (req) => {
    const authority = config.internalAgent;
    const provided = req.headers.authorization ?? '';
    const expected = authority ? `Bearer ${authority.key}` : '';
    if (
      !authority ||
      !expected ||
      !timingSafeEqual(
        createHash('sha256').update(provided).digest(),
        createHash('sha256').update(expected).digest(),
      )
    )
      throw failure('AUTHORITY_SERVICE_DENIED');
    const body = z
      .object({ hostId: opsId, userId: opsId, roomIds: z.array(opsId).max(100).default([]) })
      .strict()
      .parse(req.body);
    const host = hostOf(body.hostId);
    const person = await authority.identifyUser(body.userId, host);
    if (person.userId !== body.userId) throw failure('IDENTITY_CHANGED');
    const grant = config.store.grant(host.id, person.userId);
    const allowed = person.owner || !!grant?.permissions.includes('agent');
    const visible =
      allowed && authority.visibleRooms
        ? await authority.visibleRooms(person.userId, host, body.roomIds)
        : [];
    return { allowed, roomIds: [...new Set(body.roomIds.filter((id) => visible.includes(id)))] };
  });
  app.get('/v1/hosts', async (req) => {
    const hosts: OpsHost[] = [];
    for (const h of config.hosts) {
      try {
        const p = await authorize(req.headers.authorization, h);
        if (p.permissions.length) hosts.push(project(h, p));
      } catch (error) {
        // No inaccessible host metadata; a check that could not run is an outage, not a refusal,
        // so the owner is never told they lack permission while the membership store is down.
        if (!refused(error)) throw failure('HOSTOPS_UNAVAILABLE', 503);
      }
    }
    return { hosts };
  });
  app.get<{ Params: { hostId: string } }>('/v1/hosts/:hostId/snapshot', async (req) => {
    const h = hostOf(req.params.hostId),
      p = await authorize(req.headers.authorization, h, 'monitor'),
      sample = config.store.latest(h.id);
    const stale = !sample || now() - sample.at > 15000;
    if (stale) config.store.collectorFailed(h.id);
    return {
      host: project(h, p),
      sample,
      stale,
      thresholds: config.store.thresholds(h.id),
      alerts: config.store.alerts(h.id, p.userId),
    };
  });
  app.get<{ Params: { hostId: string }; Querystring: { range?: string } }>(
    '/v1/hosts/:hostId/history',
    async (req) => {
      const h = hostOf(req.params.hostId);
      await authorize(req.headers.authorization, h, 'monitor');
      return config.store.history(
        h.id,
        z.enum(['hour', 'day', 'week', 'month']).parse(req.query.range ?? 'hour'),
      );
    },
  );
  app.get<{ Params: { hostId: string } }>('/v1/hosts/:hostId/operators', async (req) => {
    const h = hostOf(req.params.hostId),
      p = await authorize(req.headers.authorization, h);
    if (!p.owner) throw failure('OWNER_REQUIRED');
    return config.store.grants(h.id);
  });
  app.put<{ Params: { hostId: string } }>('/v1/hosts/:hostId/operators', async (req) => {
    const h = hostOf(req.params.hostId),
      p = await authorize(req.headers.authorization, h);
    if (!p.owner) throw failure('OWNER_REQUIRED');
    const g = opsGrantSchema.parse(req.body);
    // The profile matters only for terminal access: revoking a grant whose profile was removed
    // from the machine must still work.
    if (
      g.permissions.includes('terminal') &&
      g.profileId &&
      !config.terminals?.hasProfile(g.profileId)
    )
      throw failure('TERMINAL_PROFILE_UNAVAILABLE', 400);
    const previous = config.store.grant(h.id, g.userId);
    if (
      g.permissions.includes('terminal') &&
      g.profileId &&
      (h.ownerProfileId === g.profileId ||
        config.store
          .grants(h.id)
          .some(
            (other) =>
              other.userId !== g.userId &&
              other.profileId === g.profileId &&
              other.permissions.includes('terminal'),
          ))
    )
      throw failure('TERMINAL_PROFILE_IN_USE', 409);
    config.store.setGrant(h.id, g);
    if (!g.permissions.includes('terminal') || previous?.profileId !== g.profileId)
      config.terminals?.revokeUser(h.id, g.userId);
    else config.terminals?.detachAll(h.id, g.userId);
    config.store.audit(p.userId, h.id, 'operator-updated', g.userId);
    return { ok: true };
  });
  app.put<{ Params: { hostId: string } }>('/v1/hosts/:hostId/thresholds', async (req) => {
    const h = hostOf(req.params.hostId),
      p = await authorize(req.headers.authorization, h);
    if (!p.owner) throw failure('OWNER_REQUIRED');
    config.store.setThresholds(h.id, opsThresholdsSchema.parse(req.body));
    config.store.audit(p.userId, h.id, 'thresholds-updated', h.id);
    return { ok: true };
  });
  app.post<{ Params: { hostId: string } }>('/v1/hosts/:hostId/alerts/ack', async (req) => {
    const h = hostOf(req.params.hostId),
      p = await authorize(req.headers.authorization, h, 'monitor');
    const ids = z
      .object({ ids: z.array(z.string().uuid()).max(200) })
      .strict()
      .parse(req.body).ids;
    config.store.acknowledge(h.id, p.userId, ids);
    return { ok: true };
  });
  const hub = () => {
    if (!config.terminals) throw failure('TERMINAL_NOT_CONFIGURED', 503);
    return config.terminals;
  };
  app.get<{ Params: { hostId: string } }>('/v1/hosts/:hostId/terminals', async (req) => {
    const h = hostOf(req.params.hostId),
      p = await authorize(req.headers.authorization, h, 'terminal');
    return hub().list(h.id, p.userId);
  });
  app.post<{ Params: { hostId: string } }>('/v1/hosts/:hostId/terminals', async (req) => {
    const h = hostOf(req.params.hostId),
      p = await authorize(req.headers.authorization, h, 'terminal');
    if (!p.profileId) throw failure('TERMINAL_PROFILE_UNAVAILABLE', 503);
    const t = hub().create(h.id, p.userId, p.profileId);
    config.store.audit(p.userId, h.id, 'terminal-created', t.id);
    return t;
  });
  app.post<{ Params: { hostId: string; sessionId: string } }>(
    '/v1/hosts/:hostId/terminals/:sessionId/action',
    async (req) => {
      const h = hostOf(req.params.hostId),
        p = await authorize(req.headers.authorization, h, 'terminal');
      const body = z
        .object({
          action: z.enum(['close', 'take', 'release', 'share']),
          target: z
            .object({ userId: opsId, access: z.enum(['view', 'control', 'none']) })
            .strict()
            .optional(),
        })
        .strict()
        .parse(req.body);
      const t = hub().action(
        h.id,
        z.string().uuid().parse(req.params.sessionId),
        p.userId,
        body.action,
        body.target,
      );
      config.store.audit(p.userId, h.id, 'terminal-' + body.action, t.id);
      return t;
    },
  );
  let pendingUpgrades = 0;
  app.server.on('upgrade', (request, socket, head) => {
    if (pendingUpgrades >= 16 || wsServer.clients.size >= 100) {
      socket.destroy();
      return;
    }
    pendingUpgrades++;
    const upgradeTimeout = setTimeout(() => socket.destroy(), 15000);
    upgradeTimeout.unref();
    socket.once('close', () => clearTimeout(upgradeTimeout));
    void (async () => {
      const path = new URL(request.url ?? '', 'http://localhost'),
        m = /^\/v1\/hosts\/([\w-]+)\/terminals\/([a-f0-9-]{36})\/stream$/.exec(path.pathname);
      if (!m || path.search) throw Error('INVALID_UPGRADE');
      const h = hostOf(m[1]),
        p = await authorize(request.headers.authorization, h, 'terminal');
      if (socket.destroyed) return;
      clearTimeout(upgradeTimeout);
      wsServer.handleUpgrade(request, socket, head, (ws) => {
        let closed = false,
          busy = Promise.resolve();
        const send = (event: unknown) => {
          if (ws.readyState === WebSocket.OPEN) {
            if (ws.bufferedAmount > 1048576) {
              ws.close(1008, 'OUTPUT_BACKPRESSURE');
              return;
            }
            ws.send(JSON.stringify(event));
          }
        };
        let attached: ReturnType<TerminalHub['attach']>;
        try {
          attached = hub().attach(h.id, z.string().uuid().parse(m[2]), p.userId, send);
        } catch {
          ws.close(1008, 'TERMINAL_ACCESS_DENIED');
          return;
        }
        let lastSecond = 0,
          count = 0,
          pending = 0;
        const recheck = async () => {
          const fresh = await authorize(request.headers.authorization, h, 'terminal');
          if (fresh.userId !== p.userId) throw Error('IDENTITY_CHANGED');
          hub().check(h.id, m[2], p.userId);
        };
        const timer = setInterval(() => {
          void recheck().catch(() => ws.close(1008, 'AUTHORITY_REVOKED'));
        }, 2000);
        timer.unref();
        ws.on('message', (data) => {
          const second = Math.floor(now() / 1000);
          if (second !== lastSecond) {
            lastSecond = second;
            count = 0;
          }
          if (++count > 120 || ++pending > 32) {
            ws.close(1008, 'INPUT_RATE_LIMIT');
            return;
          }
          busy = busy
            .then(async () => {
              if (closed) return;
              await recheck();
              attached.input(terminalInputSchema.parse(JSON.parse(String(data))));
            })
            .catch(() => ws.close(1008, 'INPUT_REFUSED'))
            .finally(() => {
              pending--;
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
        clearTimeout(upgradeTimeout);
        pendingUpgrades--;
      });
  });
  let sampling = false,
    stopped = false;
  const collect = async () => {
    if (sampling || stopped) return;
    config.terminals?.expire();
    if (!config.sample) return;
    sampling = true;
    try {
      const sample = await config.sample();
      if (stopped) return;
      config.store.sample(sample);
      for (const alert of config.store
        .alerts(sample.hostId, 'notification-channel')
        .filter((a) => !a.resolvedAt && a.delivery === 'pending')) {
        if (config.onAlert)
          try {
            await config.onAlert({
              hostId: sample.hostId,
              alertId: alert.id,
              message: alert.message,
            });
            config.store.acknowledge(sample.hostId, 'notification-channel', [alert.id]);
          } catch {
            /* Keep pending; never claim delivery. */
          }
      }
    } catch {
      if (!stopped) for (const h of config.hosts) config.store.collectorFailed(h.id);
    } finally {
      sampling = false;
    }
  };
  let timer: ReturnType<typeof setInterval> | undefined;
  app.addHook('onReady', async () => {
    await collect();
    if (config.sample || config.terminals) {
      timer = setInterval(() => void collect(), 5000);
      timer.unref();
    }
  });
  app.addHook('onClose', async () => {
    stopped = true;
    if (timer) clearInterval(timer);
    for (const ws of wsServer.clients) ws.terminate();
    wsServer.close();
    config.terminals?.shutdown();
    config.store.close();
  });
  return app;
}
