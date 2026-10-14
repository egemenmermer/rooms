import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  saved: '{}',
  fail: false,
  shown: [] as Record<string, unknown>[],
  focused: false,
}));
vi.mock('electron', () => ({
  app: { getPath: () => '/fixture' },
  ipcMain: { handle: (name: string, handler: Function) => mock.handlers.set(name, handler) },
  Notification: class {
    static isSupported() {
      return true;
    }
    constructor(options: Record<string, unknown>) {
      mock.shown.push(options);
    }
    on() {}
    show() {}
  },
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
import { setupNotifications } from '../apps/desktop/electron/notifications';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';
const event = {} as IpcMainInvokeEvent;
let scope = { serverUrl: 'https://rooms.example', userId: 'owner' };
const invoke = (name: string, value?: unknown) =>
  mock.handlers.get('rooms:notification-' + name)!(event, value);
function setup() {
  return setupNotifications(
    () =>
      ({
        isFocused: () => mock.focused,
        webContents: { getURL: () => 'https://rooms.example' },
      }) as unknown as BrowserWindow,
    (e) => {
      if (e !== event) throw new Error('untrusted');
    },
    () => scope,
  );
}
beforeEach(() => {
  mock.handlers.clear();
  mock.saved = '{}';
  mock.fail = false;
  mock.shown = [];
  mock.focused = false;
  scope = { serverUrl: 'https://rooms.example', userId: 'owner' };
});
afterEach(() => vi.useRealTimers());
describe('native notification preferences', () => {
  it('persists account/server-scoped channel mutes without message contents or identifiers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T07:00:00Z'));
    let service = setup();
    invoke('opt-in', true);
    const input = { ...scope, channelId: 'channel-1', muted: true };
    invoke('channel-mute', input);
    service = setup();
    expect(invoke('channel-status', input)).toEqual({ muted: true });
    service.message(scope, 'channel-1');
    expect(mock.shown).toHaveLength(0);
    service.message({ ...scope, userId: 'other' }, 'channel-1');
    expect(mock.shown).toHaveLength(1);
    vi.advanceTimersByTime(5001);
    service.message({ ...scope, serverUrl: 'https://other.example' }, 'channel-1');
    expect(mock.shown).toHaveLength(2);
    expect(mock.saved).not.toContain('owner');
    expect(mock.saved).not.toContain('channel-1');
    expect(mock.saved).not.toContain('rooms.example');
  });
  it('unmutes only the selected channel and does not consume the global notification rate limit when muted', () => {
    const service = setup();
    invoke('opt-in', true);
    const input = { ...scope, channelId: 'channel-1' };
    invoke('channel-mute', { ...input, muted: true });
    service.message(scope, 'channel-1');
    service.message(scope, 'channel-2');
    expect(mock.shown).toHaveLength(1);
    invoke('channel-mute', { ...input, muted: false });
    expect(invoke('channel-status', input)).toEqual({ muted: false });
  });
  it('rejects stale identity, invalid channel values and failed mute persistence without changing state', () => {
    setup();
    const input = { ...scope, channelId: 'channel-1', muted: true };
    expect(() => invoke('channel-mute', { ...input, userId: 'other' })).toThrow('account changed');
    expect(() => invoke('channel-mute', { ...input, channelId: '../private' })).toThrow();
    expect(() => invoke('channel-mute', { ...input, muted: 'yes' })).toThrow('Invalid channel');
    mock.fail = true;
    expect(() => invoke('channel-mute', input)).toThrow('disk failure');
    expect(invoke('channel-status', input)).toEqual({ muted: false });
  });

  it('pauses notifications during a refreshed voice lease and expires crash-stale state', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T06:00:00Z'));
    const service = setup();
    invoke('opt-in', true);
    invoke('pause-voice', true);
    invoke('voice-active', true);
    service.message();
    expect(mock.shown).toHaveLength(0);
    vi.advanceTimersByTime(20000);
    invoke('voice-active', true);
    vi.advanceTimersByTime(20000);
    service.message();
    expect(mock.shown).toHaveLength(0);
    vi.advanceTimersByTime(10001);
    service.message();
    expect(mock.shown).toHaveLength(1);
  });
  it('releases suppression on disconnect without persisting transient voice state', () => {
    const service = setup();
    invoke('opt-in', true);
    invoke('pause-voice', true);
    invoke('voice-active', true);
    invoke('voice-active', false);
    service.message();
    expect(mock.shown).toHaveLength(1);
    expect(JSON.parse(mock.saved)).toEqual({
      enabled: true,
      sound: false,
      pauseDuringVoice: true,
      mutedChannels: [],
    });
  });
  it('ignores voice state unless the owner enabled suppression', () => {
    const service = setup();
    invoke('opt-in', true);
    invoke('voice-active', true);
    service.message();
    expect(mock.shown).toHaveLength(1);
  });
  it('starts opt-out and silent and preserves content-free notification text', () => {
    const service = setup();
    service.message();
    expect(mock.shown).toHaveLength(0);
    invoke('opt-in', true);
    service.message();
    expect(mock.shown).toEqual([
      { title: 'ROOMS', body: 'Topluluğunda yeni bir mesaj var.', silent: true },
    ]);
  });
  it('enables system sound only by explicit preference and restores it', () => {
    setup();
    invoke('sound', true);
    invoke('opt-in', true);
    const service = setup();
    service.message();
    expect(invoke('status')).toEqual({
      enabled: true,
      sound: true,
      pauseDuringVoice: false,
      supported: true,
    });
    expect(mock.shown[0].silent).toBe(false);
  });
  it('does not opt in when changing sound and keeps focus/rate suppression', () => {
    const service = setup();
    invoke('sound', true);
    service.message();
    expect(mock.shown).toHaveLength(0);
    invoke('opt-in', true);
    mock.focused = true;
    service.message();
    expect(mock.shown).toHaveLength(0);
    mock.focused = false;
    service.message();
    service.message();
    expect(mock.shown).toHaveLength(1);
  });
  it('keeps previous preferences on persistence failure', () => {
    setup();
    mock.fail = true;
    expect(() => invoke('sound', true)).toThrow('disk failure');
    expect(invoke('status').sound).toBe(false);
  });
  it('rejects untrusted senders and non-boolean values', () => {
    setup();
    expect(() => mock.handlers.get('rooms:notification-sound')!({}, true)).toThrow('untrusted');
    for (const value of ['true', 1, null, {}])
      expect(() => invoke('sound', value)).toThrow('Invalid notification preference');
  });
});
