import { app } from 'electron';
import { WebSocket } from 'ws';
import { z } from 'zod';
import {
  terminalInfoSchema,
  terminalEventSchema,
  terminalInputSchema,
} from '../../../packages/shared-contracts/src/hostops';
import { t } from '@rooms/i18n';

export function setupAgentWorkspace(input: {
  bind(name: string, action: (...args: any[]) => unknown): void;
  context(): { connection: { url: string; token: string } | null; userId: string | null };
  request(path: string, method?: string, body?: unknown, limit?: number): Promise<unknown>;
  window(): Electron.BrowserWindow | null;
}) {
  let active: {
    socket: WebSocket;
    connection: NonNullable<ReturnType<typeof input.context>['connection']>;
    userId: string;
  } | null = null;
  let epoch = 0;
  const detach = () => {
    epoch++;
    const previous = active;
    active = null;
    previous?.socket.close();
  };
  const current = () => {
    const scope = input.context();
    return !!active && active.connection === scope.connection && active.userId === scope.userId;
  };
  const uuid = (id: unknown) => z.string().uuid().parse(id);
  const route = (id: unknown) => `/v1/tasks/${uuid(id)}/terminals`;
  input.bind('workspace-terminals', async (id) =>
    z
      .array(terminalInfoSchema)
      .max(3)
      .parse(await input.request(route(id), 'GET', undefined, 16384)),
  );
  input.bind('workspace-take', async (id) =>
    terminalInfoSchema.parse(await input.request(route(id) + '/take', 'POST', {}, 16384)),
  );
  input.bind('workspace-close', async (id, session) =>
    terminalInfoSchema.parse(
      await input.request(route(id) + `/${uuid(session)}/close`, 'POST', {}, 16384),
    ),
  );
  input.bind('workspace-resume', (id) => input.request(`/v1/tasks/${uuid(id)}/resume`, 'POST', {}));
  input.bind('workspace-detach', detach);
  input.bind('workspace-send', (value) => {
    if (
      !current() ||
      active!.socket.readyState !== WebSocket.OPEN ||
      active!.socket.bufferedAmount > 65536
    )
      throw Error(t('Çalışma terminali bağlı değil.'));
    active!.socket.send(JSON.stringify(terminalInputSchema.parse(value)));
  });
  input.bind('workspace-attach', async (id, session) => {
    detach();
    const generation = epoch;
    const taskId = uuid(id),
      sessionId = uuid(session),
      scope = input.context();
    const sessions = z
      .array(terminalInfoSchema)
      .parse(await input.request(route(taskId), 'GET', undefined, 16384));
    if (!sessions.some((s) => s.id === sessionId && s.taskId === taskId && s.kind === 'workspace'))
      throw Error(t('Çalışma terminali erişimi doğrulanamadı.'));
    if (
      !scope.connection ||
      !scope.userId ||
      generation !== epoch ||
      input.context().connection !== scope.connection ||
      input.context().userId !== scope.userId
    )
      throw Error(t('Hesap değişti. Yeniden bağlan.'));
    const url = new URL(scope.connection.url + route(taskId) + `/${sessionId}/stream`);
    if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password)
      throw Error(t('Güvenli Agent bağlantısı gerekli.'));
    url.protocol = 'wss:';
    const socket = new WebSocket(url, {
      headers: { Authorization: `Bearer ${scope.connection.token}` },
      followRedirects: false,
      handshakeTimeout: 15000,
      maxPayload: 1_100_000,
    });
    const selected = { socket, connection: scope.connection, userId: scope.userId };
    active = selected;
    const send = (value: unknown) => {
      if (active === selected && current())
        input.window()?.webContents.send('rooms:agent-workspace-event', value);
    };
    socket.on('message', (data) => {
      if (active !== selected || !current()) {
        socket.close();
        return;
      }
      try {
        const value = terminalEventSchema.parse(JSON.parse(String(data)));
        if (
          value.type === 'state' &&
          (value.session.id !== sessionId ||
            value.session.taskId !== taskId ||
            value.session.kind !== 'workspace')
        )
          throw Error('SCOPE_CHANGED');
        send(value);
      } catch {
        socket.close(1008, 'INVALID_EVENT');
      }
    });
    socket.on('error', () =>
      send({ type: 'error', message: t('Çalışma terminaline bağlanılamadı. Yeniden dene.') }),
    );
    socket.on('close', () => {
      send({ type: 'error', message: t('Çalışma terminali bağlantısı kesildi.') });
      if (active === selected) active = null;
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => {
        if (generation !== epoch || active !== selected || !current()) {
          socket.close();
          reject(Error(t('Hesap veya terminal değişti.')));
        } else resolve();
      });
      socket.once('error', () => reject(Error(t('Çalışma terminaline bağlanılamadı.'))));
      socket.once('close', () => reject(Error(t('Çalışma terminali bağlantısı kapandı.'))));
    });
  });
  const timer = setInterval(() => {
    if (active && (!current() || !input.window() || input.window()!.isDestroyed())) detach();
  }, 500);
  timer.unref();
  app.on('before-quit', () => {
    clearInterval(timer);
    detach();
  });
}
