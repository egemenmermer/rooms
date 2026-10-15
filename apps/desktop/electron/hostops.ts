import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { WebSocket } from 'ws';
import { z } from 'zod';
import {
  opsId,
  opsHostSchema,
  opsSnapshotSchema,
  hostSampleSchema,
  opsGrantSchema,
  opsThresholdsSchema,
  terminalInfoSchema,
  terminalEventSchema,
  terminalInputSchema,
} from '../../../packages/shared-contracts/src/hostops';
interface NativeIdentity {
  instanceUrl: string;
  getToken(): string | null;
}
const messages: Record<string, string> = {
  INVALID_REQUEST: 'Alanları kontrol et. Girilen değerlerden biri geçerli değil.',
  HOST_PERMISSION_REQUIRED: 'Bu sunucu işlemi için yetkin yok.',
  OWNER_REQUIRED: 'Bu işlemi yalnızca topluluk sahibi yapabilir.',
  HOSTOPS_UNAVAILABLE: 'Sunucu yönetimine ulaşılamıyor. Yeniden dene.',
  TERMINAL_NOT_CONFIGURED: 'Bu sunucuda terminal henüz kurulmadı.',
  TERMINAL_PROFILE_UNAVAILABLE: 'Terminal kullanıcı profili henüz yapılandırılmadı.',
  TERMINAL_PROFILE_IN_USE: 'Bu Linux profili başka bir operatöre ait. Ayrı bir profil gerekiyor.',
  TERMINAL_LIMIT: 'En fazla üç terminal açabilirsin. Önce bir oturumu sonlandır.',
  TERMINAL_ACCESS_DENIED: 'Bu terminale erişimin yok.',
  TERMINAL_WRITER_BUSY: 'Terminali başka bir operatör kullanıyor.',
  TERMINAL_OWNER_REQUIRED: 'Bu işlemi terminalin sahibi yapabilir.',
};
export function setupHostOps(
  getClient: () => NativeIdentity,
  getWindow: () => BrowserWindow | null,
  assertSender: (event: IpcMainInvokeEvent) => void,
) {
  let socket: WebSocket | undefined,
    epoch = 0,
    watch: ReturnType<typeof setInterval> | undefined;
  let activeScope = () => false;
  const detach = () => {
    activeScope = () => false;
    epoch++;
    if (watch) clearInterval(watch);
    watch = undefined;
    socket?.close();
    socket = undefined;
  };
  async function request(path: string, method = 'GET', body?: unknown) {
    const client = getClient(),
      token = client.getToken();
    if (!token) throw Error('Önce hesabına giriş yap.');
    const endpoint = new URL('/rooms-ops/v1/' + path, new URL(client.instanceUrl).origin);
    if (
      endpoint.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
    )
      throw Error('Sunucu yönetimi için güvenli bağlantı gerekiyor.');
    const response = await fetch(endpoint, {
      method,
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (getClient() !== client || client.getToken() !== token) throw Error('Oturum değişti.');
    if (Number(response.headers.get('Content-Length') ?? 0) > 4000000)
      throw Error('Sunucu yanıtı çok büyük.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 4000000) throw Error('Sunucu yanıtı çok büyük.');
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
    }
    if (getClient() !== client || client.getToken() !== token) throw Error('Oturum değişti.');
    const text = Buffer.concat(chunks).toString('utf8');
    const value = (() => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })();
    if (!response.ok)
      throw Error(
        messages[value?.error] ??
          (response.status === 404
            ? 'Sunucu yönetimi bu toplulukta henüz yapılandırılmadı.'
            : 'Sunucu işlemi tamamlanamadı. Yetkini ve bağlantını kontrol et.'),
      );
    return value;
  }
  const handle = (name: string, fn: (...args: unknown[]) => unknown) =>
    ipcMain.handle('rooms:hostops-' + name, (event, ...args) => {
      assertSender(event);
      getClient();
      return fn(...args);
    });
  const host = (id: unknown) => 'hosts/' + encodeURIComponent(opsId.parse(id));
  handle(
    'hosts',
    async () =>
      z
        .object({ hosts: z.array(opsHostSchema).max(20) })
        .strict()
        .parse(await request('hosts')).hosts,
  );
  handle('snapshot', async (id) => opsSnapshotSchema.parse(await request(host(id) + '/snapshot')));
  handle('history', async (id, range) =>
    z
      .array(hostSampleSchema)
      .max(720)
      .parse(
        await request(
          host(id) + '/history?range=' + z.enum(['hour', 'day', 'week', 'month']).parse(range),
        ),
      ),
  );
  handle('operators', async (id) =>
    z
      .array(opsGrantSchema)
      .max(500)
      .parse(await request(host(id) + '/operators')),
  );
  handle('operator', async (id, grant) => {
    await request(host(id) + '/operators', 'PUT', opsGrantSchema.parse(grant));
  });
  handle('thresholds', async (id, value) => {
    await request(host(id) + '/thresholds', 'PUT', opsThresholdsSchema.parse(value));
  });
  handle('ack', async (id, ids) => {
    await request(host(id) + '/alerts/ack', 'POST', {
      ids: z.array(z.string().uuid()).max(200).parse(ids),
    });
  });
  handle('terminals', async (id) =>
    z
      .array(terminalInfoSchema)
      .max(500)
      .parse(await request(host(id) + '/terminals')),
  );
  handle('create-terminal', async (id) =>
    terminalInfoSchema.parse(await request(host(id) + '/terminals', 'POST', {})),
  );
  handle('terminal-action', async (id, sessionId, action, target) =>
    terminalInfoSchema.parse(
      await request(
        host(id) + '/terminals/' + z.string().uuid().parse(sessionId) + '/action',
        'POST',
        {
          action: z.enum(['close', 'take', 'release', 'share']).parse(action),
          ...(target === undefined
            ? {}
            : {
                target: z
                  .object({ userId: opsId, access: z.enum(['view', 'control', 'none']) })
                  .strict()
                  .parse(target),
              }),
        },
      ),
    ),
  );
  handle('attach', async (id, sessionId) => {
    detach();
    const scope = epoch,
      client = getClient(),
      token = client.getToken();
    if (!token) throw Error('Önce hesabına giriş yap.');
    const endpoint = new URL(
      '/rooms-ops/v1/' + host(id) + '/terminals/' + z.string().uuid().parse(sessionId) + '/stream',
      new URL(client.instanceUrl).origin,
    );
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    if (
      endpoint.protocol === 'ws:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
    )
      throw Error('Terminal için güvenli bağlantı gerekiyor.');
    const ws = new WebSocket(endpoint, {
      headers: { Authorization: token },
      followRedirects: false,
      maxPayload: 1100000,
      handshakeTimeout: 15000,
    });
    socket = ws;
    const current = () => {
      try {
        return epoch === scope && getClient() === client && client.getToken() === token;
      } catch {
        return false;
      }
    };
    activeScope = current;
    const send = (value: unknown) => {
      if (current()) getWindow()?.webContents.send('rooms:hostops-terminal', value);
    };
    ws.on('message', (data) => {
      if (!current()) {
        ws.close();
        return;
      }
      try {
        send(terminalEventSchema.parse(JSON.parse(String(data))));
      } catch {
        send({ type: 'error', message: 'Terminal yanıtı doğrulanamadı.' });
        ws.close();
      }
    });
    ws.on('close', () => {
      if (current())
        send({
          type: 'error',
          message: 'Terminal bağlantısı kapandı. Yetkin varsa yeniden bağlanabilirsin.',
        });
    });
    ws.on('error', () =>
      send({ type: 'error', message: 'Terminal bağlantısı kurulamadı. Oturumun korunuyor.' }),
    );
    watch = setInterval(() => {
      if (!current()) detach();
    }, 500);
    watch.unref();
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => {
        if (!current()) {
          ws.close();
          reject(Error('Oturum değişti.'));
        } else resolve();
      });
      ws.once('error', () => reject(Error('Terminal bağlantısı kurulamadı.')));
      ws.once('close', () => reject(Error('Terminal bağlantısı kapandı.')));
    });
  });
  handle('send', (value) => {
    const event = terminalInputSchema.parse(value);
    if (!activeScope() || !socket || socket.readyState !== WebSocket.OPEN)
      throw Error('Terminal bağlı değil.');
    if (socket.bufferedAmount > 65536) throw Error('Terminal bağlantısı yoğun. Biraz bekle.');
    socket.send(JSON.stringify(event));
  });
  handle('detach', detach);
  return { close: detach };
}
