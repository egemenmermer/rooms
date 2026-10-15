import { app, dialog, globalShortcut, screen } from 'electron';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import {
  remoteInputSchema,
  remoteStateSchema,
  publicRemoteStateSchema,
} from '../../../packages/shared-contracts/src/remote-control';
import { opsId } from '../../../packages/shared-contracts/src/hostops';
import { RemoteInputGate } from './remote-input-gate';
interface NativeInput {
  status(): { supported: boolean; permission: boolean; active: boolean };
  begin(displayId: number, x: number, y: number, width: number, height: number): boolean;
  apply(kind: number, a: number, b: number, code: number, down: boolean): boolean;
  end(): void;
}
const macKeys: Record<string, number> = {
  KeyA: 0,
  KeyS: 1,
  KeyD: 2,
  KeyF: 3,
  KeyH: 4,
  KeyG: 5,
  KeyZ: 6,
  KeyX: 7,
  KeyC: 8,
  KeyV: 9,
  KeyB: 11,
  KeyQ: 12,
  KeyW: 13,
  KeyE: 14,
  KeyR: 15,
  KeyY: 16,
  KeyT: 17,
  Digit1: 18,
  Digit2: 19,
  Digit3: 20,
  Digit4: 21,
  Digit6: 22,
  Digit5: 23,
  Equal: 24,
  Digit9: 25,
  Digit7: 26,
  Minus: 27,
  Digit8: 28,
  Digit0: 29,
  BracketRight: 30,
  KeyO: 31,
  KeyU: 32,
  BracketLeft: 33,
  KeyI: 34,
  KeyP: 35,
  Enter: 36,
  KeyL: 37,
  KeyJ: 38,
  Quote: 39,
  KeyK: 40,
  Semicolon: 41,
  Backslash: 42,
  Comma: 43,
  Slash: 44,
  KeyN: 45,
  KeyM: 46,
  Period: 47,
  Tab: 48,
  Space: 49,
  Backquote: 50,
  Backspace: 51,
  Escape: 53,
  MetaRight: 54,
  MetaLeft: 55,
  ShiftLeft: 56,
  CapsLock: 57,
  AltLeft: 58,
  ControlLeft: 59,
  ShiftRight: 60,
  AltRight: 61,
  ControlRight: 62,
  F5: 96,
  F6: 97,
  F7: 98,
  F3: 99,
  F8: 100,
  F9: 101,
  F11: 103,
  F10: 109,
  F12: 111,
  Insert: 114,
  Home: 115,
  PageUp: 116,
  Delete: 117,
  F4: 118,
  End: 119,
  F2: 120,
  PageDown: 121,
  F1: 122,
  ArrowLeft: 123,
  ArrowRight: 124,
  ArrowDown: 125,
  ArrowUp: 126,
};
Object.assign(macKeys, {
  IntlBackslash: 10,
  Numpad0: 82,
  Numpad1: 83,
  Numpad2: 84,
  Numpad3: 85,
  Numpad4: 86,
  Numpad5: 87,
  Numpad6: 88,
  Numpad7: 89,
  Numpad8: 91,
  Numpad9: 92,
  NumpadEnter: 76,
  NumpadDecimal: 65,
  NumpadMultiply: 67,
  NumpadAdd: 69,
  NumpadDivide: 75,
  NumpadSubtract: 78,
  NumpadEqual: 81,
});
const winKeys: Record<string, number> = {
  Enter: 13,
  Escape: 27,
  Backspace: 8,
  Tab: 9,
  Space: 32,
  Delete: 46,
  Home: 36,
  End: 35,
  PageUp: 33,
  PageDown: 34,
  Insert: 45,
  CapsLock: 20,
  ShiftLeft: 160,
  ShiftRight: 161,
  ControlLeft: 162,
  ControlRight: 163,
  AltLeft: 164,
  AltRight: 165,
  MetaLeft: 91,
  MetaRight: 92,
  ArrowLeft: 37,
  ArrowRight: 39,
  ArrowUp: 38,
  ArrowDown: 40,
  Minus: 189,
  Equal: 187,
  BracketLeft: 219,
  BracketRight: 221,
  Backslash: 220,
  Semicolon: 186,
  Quote: 222,
  Comma: 188,
  Period: 190,
  Slash: 191,
  Backquote: 192,
};
Object.assign(winKeys, {
  IntlBackslash: 226,
  NumLock: 144,
  NumpadEnter: 13,
  NumpadDecimal: 110,
  NumpadMultiply: 106,
  NumpadAdd: 107,
  NumpadDivide: 111,
  NumpadSubtract: 109,
  NumpadEqual: 187,
});
for (let i = 0; i < 10; i++) winKeys[`Numpad${i}`] = 96 + i;
for (let i = 0; i < 26; i++) winKeys[`Key${String.fromCharCode(65 + i)}`] = 65 + i;
for (let i = 0; i < 10; i++) winKeys[`Digit${i}`] = 48 + i;
for (let i = 1; i <= 12; i++) winKeys[`F${i}`] = 111 + i;

export function setupRemoteControl(config: {
  handle(name: string, handler: (...args: unknown[]) => unknown): void;
  broker(path: string, body: unknown): Promise<unknown>;
  identity(): { userId: string | null; scope: unknown };
  capture(): { epoch: string; displayId: string } | null;
  window(): Electron.BrowserWindow | null;
}) {
  const gate = new RemoteInputGate();
  let native: NativeInput | null = null,
    channel: string | null = null;
  let owner: ReturnType<typeof config.identity> | null = null,
    requested: string | null = null;
  let publisher = false,
    epoch: string | null = null;
  let deciding = false,
    scopeEpoch = 0,
    everActivated = false;
  let shortcutOwned = false;
  const hotkey = 'Control+Alt+Shift+K';
  const load = () => {
    if (native) return native;
    if (!['darwin', 'win32'].includes(process.platform))
      throw Error('Uzaktan kontrol Mac ve Windows sürümlerinde kullanılabilir.');
    const path = app.isPackaged
      ? join(process.resourcesPath, 'native', 'rooms-remote-input.node')
      : join(app.getAppPath(), 'dist-native', 'rooms-remote-input.node');
    if (!existsSync(path)) throw Error('Bu sürümde yerel uzaktan kontrol modülü bulunmuyor.');
    try {
      native = createRequire(join(app.getAppPath(), 'package.json'))(path) as NativeInput;
    } catch {
      throw Error('Yerel kontrol modülü yüklenemedi. Uygulamayı yeniden başlat.');
    }
    return native;
  };
  const sameIdentity = () => {
    const current = config.identity();
    return !!owner && current.userId === owner.userId && current.scope === owner.scope;
  };
  const stop = async (unregister = false) => {
    scopeEpoch++;
    const previous = channel,
      canRevoke = sameIdentity();
    gate.clear();
    native?.end();
    everActivated = false;
    requested = null;
    publisher = false;
    epoch = null;
    if (shortcutOwned) {
      globalShortcut.unregister(hotkey);
      shortcutOwned = false;
    }
    if (previous && canRevoke)
      await config
        .broker('remote/revoke', { channelId: previous, source: unregister })
        .catch(() => {});
  };
  const select = async (value: unknown) => {
    const next = opsId.parse(value),
      person = config.identity();
    if (!person.userId) throw Error('Önce topluluğa giriş yap.');
    if (channel !== next || !sameIdentity()) {
      const pending = scopeEpoch + 1;
      const stopping = stop(true);
      channel = next;
      owner = person;
      await stopping;
      if (scopeEpoch !== pending) throw Error('Ekran veya hesap değişti.');
      channel = next;
      owner = person;
    }
    return next;
  };
  const rawState = async (id: string) => {
    const started = Date.now();
    const value = remoteStateSchema.parse(await config.broker('remote/state', { channelId: id }));
    if (Date.now() - started > 1500)
      throw Error('Bağlantı kontrol için fazla gecikiyor. Yeniden dene.');
    return value;
  };
  const publicState = async (id: string) => {
    const expected = scopeEpoch;
    const value = await rawState(id);
    if (expected !== scopeEpoch || channel !== id) throw Error('Oda değişti.');
    if (!sameIdentity()) {
      await stop();
      throw Error('Hesap değişti.');
    }
    if (gate.active()) {
      if (
        !gate.refresh(value.lease, value.serverAt) ||
        (publisher &&
          (!native?.status().active ||
            !native?.status().permission ||
            config.capture()?.epoch !== epoch))
      )
        await stop();
    } else if (everActivated) {
      await stop();
    } else if (
      requested &&
      value.lease?.id === requested &&
      value.lease.controllerId === owner!.userId
    ) {
      gate.activate(value.lease, owner!.userId!, null, value.serverAt);
      everActivated = true;
    }
    const lease =
      gate.active() && value.lease ? (({ inputKey: _key, ...safe }) => safe)(value.lease) : null;
    return publicRemoteStateSchema.parse({ ...value, lease, latencyMs: gate.latencyMs });
  };
  config.handle('rooms:remote-register', async (room, track) => {
    const id = await select(room),
      capture = config.capture();
    try {
      load();
      if (!capture || !screen.getAllDisplays().some((d) => String(d.id) === capture.displayId))
        throw Error('Uzaktan kontrol için bir pencere yerine tüm ekranını paylaş.');
      await config.broker('remote/register', {
        channelId: id,
        trackId: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,128}$/)
          .parse(track),
        epoch: capture.epoch,
      });
      return {
        supported: true,
        reason: native!.status().permission
          ? null
          : 'Kontrol vermeden önce ROOMS için Erişilebilirlik ve Giriş İzleme izinlerini açmalısın.',
      };
    } catch (error) {
      return {
        supported: false,
        reason: error instanceof Error ? error.message : 'Yerel kontrol kullanılamıyor.',
      };
    }
  });
  config.handle('rooms:remote-state', async (room) => publicState(await select(room)));
  config.handle('rooms:remote-request', async (room, peer, sourceEpoch) => {
    const id = await select(room);
    const value = z
      .object({ requestId: z.string().uuid() })
      .strict()
      .parse(
        await config.broker('remote/request', {
          channelId: id,
          publisherId: opsId.parse(peer),
          epoch: z.string().uuid().parse(sourceEpoch),
        }),
      );
    if (sameIdentity() && channel === id) requested = value.requestId;
  });
  config.handle('rooms:remote-decide', async (room, requestId, approve) => {
    if (deciding) throw Error('Bir kontrol isteği zaten yanıtlanıyor.');
    deciding = true;
    try {
      const id = await select(room),
        request = z.string().uuid().parse(requestId),
        allow = z.boolean().parse(approve);
      const capture = config.capture(),
        scope = config.identity(),
        expected = scopeEpoch;
      const state = await rawState(id),
        pending = state.requests.find(
          (r) => r.id === request && r.source.publisherId === scope.userId,
        );
      if (!pending || !capture || pending.source.epoch !== capture.epoch)
        throw Error('Kontrol isteği veya paylaşılan ekran değişti.');
      if (!allow) {
        await config.broker('remote/decide', { channelId: id, requestId: request, approve: false });
        return;
      }
      const module = load();
      if (!module.status().permission)
        throw Error(
          'Sistem Ayarları → Gizlilik ve Güvenlik bölümünde ROOMS için Erişilebilirlik ve Giriş İzleme izinlerini aç.',
        );
      const display = screen.getAllDisplays().find((d) => String(d.id) === capture.displayId);
      if (!display) throw Error('Paylaşılan ekran artık bağlı değil.');
      const window = config.window();
      if (!window) throw Error('ROOMS penceresi kapandı.');
      const answer = await dialog.showMessageBox(window, {
        type: 'question',
        buttons: ['Reddet', 'Kontrol ver'],
        defaultId: 0,
        cancelId: 0,
        title: 'Ekran kontrolü',
        message: `${pending.controllerName || pending.controllerId} paylaştığın ekranın fare ve klavyesini kontrol etmek istiyor.`,
        detail: `${display.label || 'Seçilen ekran'} · Yalnızca bu paylaşım. Kendi fare/klavyenle işlem yapman kontrolü geri alır. Acil bırakma: Control + Alt/Option + Shift + K. Dosya ve pano aktarımı yok.`,
      });
      if (answer.response !== 1) {
        await config.broker('remote/decide', { channelId: id, requestId: request, approve: false });
        return;
      }
      if (
        expected !== scopeEpoch ||
        !sameIdentity() ||
        scope.scope !== config.identity().scope ||
        config.capture()?.epoch !== capture.epoch ||
        channel !== id
      )
        throw Error('Ekran veya hesap değişti.');
      if (!globalShortcut.register(hotkey, () => void stop()))
        throw Error('Acil bırakma kısayolu kullanılamıyor; kontrol açılmadı.');
      shortcutOwned = true;
      try {
        await config.broker('remote/decide', { channelId: id, requestId: request, approve: true });
        const current = await rawState(id);
        if (
          expected !== scopeEpoch ||
          !sameIdentity() ||
          current.lease?.id !== request ||
          current.lease.source.epoch !== config.capture()?.epoch
        )
          throw Error('Kontrol onayı artık geçerli değil.');
        const bounds =
          process.platform === 'win32'
            ? screen.dipToScreenRect(null, display.bounds)
            : display.bounds;
        if (!module.begin(Number(display.id), bounds.x, bounds.y, bounds.width, bounds.height))
          throw Error(
            'Yerel kontrol başlatılamadı. Sistem izinlerini ve seçilen ekranı kontrol et.',
          );
        gate.activate(current.lease, scope.userId!, capture.epoch, current.serverAt);
        publisher = true;
        everActivated = true;
        epoch = capture.epoch;
      } catch (error) {
        await stop();
        throw error;
      }
    } finally {
      deciding = false;
    }
  });
  config.handle('rooms:remote-revoke', () => stop());
  config.handle('rooms:remote-frame', async (value, leaseId) => {
    if (!sameIdentity()) {
      await stop();
      throw Error('Hesap değişti.');
    }
    const input = remoteInputSchema.parse(value),
      result = gate.encode(input, z.string().uuid().parse(leaseId));
    if (input.type === 'release') void stop();
    return result;
  });
  config.handle('rooms:remote-receive', async (value) => {
    if (!sameIdentity() || (publisher && config.capture()?.epoch !== epoch)) {
      if (publisher) await stop();
      return null;
    }
    const input = gate.decode(z.string().max(4096).parse(value));
    if (!input) return null;
    if (input.type === 'ping') return publisher ? gate.response(input.nonce) : null;
    if (input.type === 'pong') return null;
    if (!publisher) return null;
    const module = load();
    if (!module.status().active || !gate.active() || input.type === 'release') {
      await stop();
      return null;
    }
    let ok = false;
    if (input.type === 'key') {
      const code = (process.platform === 'darwin' ? macKeys : winKeys)[input.code];
      if (code === undefined) return null;
      ok = module.apply(2, 0, 0, code, input.down);
    } else if (input.type === 'move') ok = module.apply(0, input.x, input.y, 0, false);
    else if (input.type === 'button')
      ok = module.apply(
        1,
        input.x,
        input.y,
        ['left', 'right', 'middle'].indexOf(input.button),
        input.down,
      );
    else if (input.type === 'scroll') ok = module.apply(3, input.dx, input.dy, 0, false);
    if (!ok) await stop();
    return null;
  });
  const timer = setInterval(() => {
    if (
      (publisher || requested) &&
      (!sameIdentity() ||
        (!gate.active() && everActivated) ||
        (publisher &&
          (!native?.status().active ||
            !native?.status().permission ||
            config.capture()?.epoch !== epoch)))
    )
      void stop();
  }, 100);
  timer.unref();
  const displayChanged = () => void stop(true);
  screen.on('display-removed', displayChanged);
  screen.on('display-metrics-changed', displayChanged);
  const dispose = () => {
    clearInterval(timer);
    native?.end();
    gate.clear();
    if (shortcutOwned) {
      globalShortcut.unregister(hotkey);
      shortcutOwned = false;
    }
    screen.removeListener('display-removed', displayChanged);
    screen.removeListener('display-metrics-changed', displayChanged);
  };
  app.on('before-quit', dispose);
  return {
    dispose,
    stop: () => {
      native?.end();
      gate.clear();
      void stop(true);
    },
  };
}
