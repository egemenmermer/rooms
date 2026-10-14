import { app, ipcMain, screen, type BrowserWindow } from 'electron';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { safeMediaLabel } from '../../../packages/personal-media/src/playlist';
import { createVLCStream } from './personal-vlc-stream';
import type { setupProviders } from './providers';
import type { PersonalNativeState } from './provider-contracts';

interface Binding {
  initialize(runtime: string, plugins: string): void;
  create(handle: Buffer): Promise<void>;
  play(url: string): void;
  bounds(x: number, y: number, width: number, height: number, visible: boolean): void;
  state(): PersonalNativeState;
  control(action: string, value: number): void;
  dispose(): Promise<void>;
}
const bounds = z
  .object({
    x: z.number().finite().min(0).max(32768),
    y: z.number().finite().min(0).max(32768),
    width: z.number().finite().min(0).max(32768),
    height: z.number().finite().min(0).max(32768),
    visible: z.boolean(),
  })
  .strict();
const control = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause'), value: z.number().int().min(0).max(1) }).strict(),
  z.object({ action: z.literal('seek'), value: z.number().finite().min(0).max(604800) }).strict(),
  z.object({ action: z.literal('volume'), value: z.number().int().min(0).max(100) }).strict(),
  z
    .object({ action: z.enum(['audio', 'caption']), value: z.number().int().min(-1).max(65535) })
    .strict(),
]);
/** Own libVLC binding, with all authority and network capabilities retained in main. */
export function setupPersonalVLC(
  assertSender: (event: Electron.IpcMainInvokeEvent) => void,
  getWindow: () => BrowserWindow | null,
  providers: ReturnType<typeof setupProviders>,
  runtimeRoot = app.isPackaged
    ? join(process.resourcesPath, 'native')
    : join(app.getAppPath(), 'dist-native'),
) {
  let binding: Binding | undefined;
  let token: string | null = null;
  let check: (() => void) | undefined;
  let stream: Awaited<ReturnType<typeof createVLCStream>> | undefined;
  let revision = 0;
  let currentWindow: BrowserWindow | undefined;
  let queue = Promise.resolve();
  let disposal = Promise.resolve();

  function load() {
    if (binding) return binding;
    const addon = join(runtimeRoot, 'rooms-vlc.node');
    const runtime = join(
      runtimeRoot,
      'vlc',
      process.platform === 'darwin' ? 'lib/libvlc.dylib' : 'libvlc.dll',
    );
    const plugins = join(runtimeRoot, 'vlc/plugins');
    if (
      !['darwin', 'win32'].includes(process.platform) ||
      !existsSync(addon) ||
      !existsSync(runtime)
    )
      throw new Error('VLC motoru bu kurulumda bulunmuyor.');
    const candidate = createRequire(__filename)(addon) as Binding;
    candidate.initialize(runtime, plugins);
    binding = candidate;
    return candidate;
  }
  function teardown() {
    currentWindow?.off('closed', revoke);
    currentWindow = undefined;
    token = null;
    check = undefined;
    stream?.close();
    stream = undefined;
    if (binding) {
      binding.bounds(0, 0, 0, 0, false);
      disposal = disposal.then(() => binding!.dispose()).catch(() => {});
    }
  }
  function revoke() {
    revision++;
    teardown();
  }
  async function stop() {
    revoke();
    await disposal;
  }
  const cancelRevocation = providers.onPlaybackRevoked(revoke);
  const scopeTimer = setInterval(() => {
    try {
      check?.();
    } catch {
      revoke();
    }
  }, 250);
  scopeTimer.unref();
  function assertPlayback(value: unknown) {
    if (typeof value !== 'string' || value !== token || !token || !check)
      throw new Error('Oynatma oturumu değişti. Kaynağı yeniden aç.');
    check();
    return load();
  }
  ipcMain.handle('rooms:provider-native-status', (event) => {
    assertSender(event);
    try {
      load();
      return { available: true };
    } catch {
      return { available: false };
    }
  });
  ipcMain.handle('rooms:provider-native-start', async (event, input) => {
    assertSender(event);
    const url = z
      .string()
      .regex(/^rooms-provider:\/\/[a-f0-9-]{36}\/stream$/)
      .parse(input);
    const sourceCheck = providers.authorizePlayback(url);
    const current = ++revision;
    let result!: { token: string };
    const task = queue.then(async () => {
      if (current !== revision) throw new Error('Oynatma hedefi değişti.');
      teardown();
      await disposal;
      if (current !== revision) throw new Error('Oynatma hedefi değişti.');
      const ownRevision = revision;
      sourceCheck();
      const native = load();
      const win = getWindow();
      if (!win || win.isDestroyed()) throw new Error('Oynatıcı penceresi kapandı.');
      const nextStream = await createVLCStream(url, providers.fetchPlayback, sourceCheck);
      if (ownRevision !== revision) {
        nextStream.close();
        throw new Error('Oynatma hedefi değişti.');
      }
      stream = nextStream;
      check = sourceCheck;
      currentWindow = win;
      win.once('closed', revoke);
      await native.create(win.getNativeWindowHandle());
      if (ownRevision !== revision) {
        nextStream.close();
        await native.dispose();
        throw new Error('Oynatma hedefi değişti.');
      }
      sourceCheck();
      if (win.isDestroyed()) throw new Error('Oynatıcı penceresi kapandı.');
      native.play(nextStream.url);
      token = randomUUID();
      result = { token };
    });
    queue = task.catch(() => {});
    try {
      await task;
      return result;
    } catch {
      if (current === revision) {
        teardown();
        await disposal;
      }
      throw new Error('VLC yayını başlatamadı. Kaynak bağlantısını kontrol edip yeniden dene.');
    }
  });
  ipcMain.handle('rooms:provider-native-state', (event, value) => {
    assertSender(event);
    const state = assertPlayback(value).state();
    for (const tracks of [state.audio ?? [], state.captions ?? []])
      for (const track of tracks) track.label = safeMediaLabel(track.label, 'Track');
    return state;
  });
  ipcMain.handle('rooms:provider-native-bounds', (event, value, input) => {
    assertSender(event);
    const native = assertPlayback(value);
    const rect = bounds.parse(input);
    const win = getWindow();
    if (!win || win.isDestroyed()) {
      revoke();
      return;
    }
    const zoom = win.webContents.getZoomFactor();
    const [width, height] = win.getContentSize();
    // macOS NSView is measured in points, HWND in physical pixels.
    const scale =
      process.platform === 'win32' ? screen.getDisplayMatching(win.getBounds()).scaleFactor : 1;
    const x = rect.x * zoom,
      y = rect.y * zoom;
    const w = Math.max(0, Math.min(rect.width * zoom, width - x));
    const h = Math.max(0, Math.min(rect.height * zoom, height - y));
    native.bounds(
      Math.min(x, width) * scale,
      Math.min(y, height) * scale,
      w * scale,
      h * scale,
      rect.visible && w > 0 && h > 0 && win.isVisible() && !win.isMinimized(),
    );
  });
  ipcMain.handle('rooms:provider-native-control', (event, value, input) => {
    assertSender(event);
    const parsed = control.parse(input);
    assertPlayback(value).control(parsed.action, parsed.value);
  });
  ipcMain.handle('rooms:provider-native-stop', async (event, value) => {
    assertSender(event);
    // A cleanup from an older React instance may never stop its replacement.
    if (value === token && token) await stop();
  });
  return {
    async close() {
      clearInterval(scopeTimer);
      cancelRevocation();
      await stop();
    },
  };
}
