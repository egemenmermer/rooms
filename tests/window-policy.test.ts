import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
const mock = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  saved: '{}',
  fail: false,
  dialog: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { getPath: () => '/fixture', isPackaged: false },
  ipcMain: { handle: (key: string, handler: Function) => mock.handlers.set(key, handler) },
  dialog: { showMessageBox: mock.dialog },
}));
vi.mock('node:fs', () => ({
  readFileSync: () => mock.saved,
  writeFileSync: (_path: string, value: string) => {
    if (mock.fail) throw new Error('disk failure');
    mock.saved = value;
  },
  renameSync: vi.fn(),
  rmSync: vi.fn(),
}));
import { setupWindowPolicy } from '../apps/desktop/electron/window-policy';
const event = {} as IpcMainInvokeEvent;
let tray = true,
  voice = false,
  quitting = false;
const invoke = (key: string, value?: unknown) =>
  mock.handlers.get('rooms:desktop-window-preference')!(event, key, value);
function setup() {
  const service = setupWindowPolicy(
    (e) => {
      if (e !== event) throw new Error('untrusted');
    },
    () => tray,
    () => voice,
    () => quitting,
  );
  const window = Object.assign(new EventEmitter(), {
    hide: vi.fn(),
    close: vi.fn(),
    isDestroyed: () => false,
    isFullScreen: () => false,
  });
  service.attach(window as unknown as BrowserWindow);
  const close = () => {
    const e = { preventDefault: vi.fn() };
    window.emit('close', e);
    return e;
  };
  return { service, window, close };
}
beforeEach(() => {
  mock.handlers.clear();
  mock.saved = '{"keepOpenOnClose":false}';
  mock.fail = false;
  mock.dialog.mockReset();
  mock.dialog.mockResolvedValue({ response: 0 });
  tray = true;
  voice = false;
  quitting = false;
});
afterEach(() => vi.restoreAllMocks());
describe('desktop close policy', () => {
  it('keeps a new profile alive by default without overriding a saved opt-out', () => {
    mock.saved = '{}';
    const { service, window, close } = setup();
    expect(service.status()).toEqual({
      keepOpenOnClose: true,
      warnOnVoiceClose: true,
      trayAvailable: true,
    });
    expect(close().preventDefault).toHaveBeenCalledOnce();
    expect(window.hide).toHaveBeenCalledOnce();
  });
  it('hides an opted-in window without ending its active call or showing a leave confirmation', () => {
    const { window, close } = setup();
    invoke('keepOpenOnClose', true);
    voice = true;
    expect(close().preventDefault).toHaveBeenCalledOnce();
    expect(window.hide).toHaveBeenCalledOnce();
    expect(window.close).not.toHaveBeenCalled();
    expect(mock.dialog).not.toHaveBeenCalled();
  });
  it('does not hide a window if the tray became unavailable', () => {
    const { window, close } = setup();
    invoke('keepOpenOnClose', true);
    tray = false;
    expect(close().preventDefault).not.toHaveBeenCalled();
    expect(window.hide).not.toHaveBeenCalled();
  });
  it('confirms an active call once and cancellation keeps the window open', async () => {
    let resolve!: (value: { response: number }) => void;
    mock.dialog.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { window, close } = setup();
    voice = true;
    close();
    close();
    expect(mock.dialog).toHaveBeenCalledOnce();
    resolve({ response: 0 });
    await Promise.resolve();
    expect(window.close).not.toHaveBeenCalled();
  });
  it('approved close does not recursively ask again', async () => {
    mock.dialog.mockResolvedValue({ response: 1 });
    const { window, close } = setup();
    window.close.mockImplementation(() => close());
    voice = true;
    close();
    await vi.waitFor(() => expect(window.close).toHaveBeenCalledOnce());
    expect(mock.dialog).toHaveBeenCalledOnce();
  });
  it('uses the latest keep-open preference after an asynchronous confirmation', async () => {
    let resolve!: (value: { response: number }) => void;
    mock.dialog.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { window, close } = setup();
    voice = true;
    close();
    invoke('keepOpenOnClose', true);
    resolve({ response: 1 });
    await vi.waitFor(() => expect(window.hide).toHaveBeenCalledOnce());
    expect(window.close).not.toHaveBeenCalled();
  });
  it('explicit quit bypasses hide and call-close confirmation', () => {
    const { window, close } = setup();
    invoke('keepOpenOnClose', true);
    voice = true;
    quitting = true;
    expect(close().preventDefault).not.toHaveBeenCalled();
    expect(window.hide).not.toHaveBeenCalled();
    expect(mock.dialog).not.toHaveBeenCalled();
  });
  it('persists independent preferences and preserves state on write failure', () => {
    setup();
    invoke('warnOnVoiceClose', false);
    const { service, close } = setup();
    voice = true;
    expect(close().preventDefault).not.toHaveBeenCalled();
    expect(service.status().warnOnVoiceClose).toBe(false);
    mock.fail = true;
    expect(() => invoke('keepOpenOnClose', true)).toThrow('disk failure');
    expect(service.status().keepOpenOnClose).toBe(false);
  });
  it('rejects invalid values, untrusted callers and unavailable tray opt-in', () => {
    setup();
    expect(() => invoke('unknown', true)).toThrow('Invalid');
    expect(() => invoke('warnOnVoiceClose', 1)).toThrow('Invalid');
    expect(() =>
      mock.handlers.get('rooms:desktop-window-preference')!({}, 'warnOnVoiceClose', false),
    ).toThrow('untrusted');
    tray = false;
    expect(() => invoke('keepOpenOnClose', true)).toThrow('tray');
  });
});
