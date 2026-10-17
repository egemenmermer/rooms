import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
const fs = vi.hoisted(() => ({ files: new Map<string, string>() }));
vi.mock('node:fs', () => ({
  readFileSync: (path: string) => {
    const value = fs.files.get(path);
    if (value === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return value;
  },
  writeFileSync: (path: string, value: string) => fs.files.set(path, value),
  renameSync: (from: string, to: string) => {
    fs.files.set(to, fs.files.get(from)!);
    fs.files.delete(from);
  },
  rmSync: (path: string) => fs.files.delete(path),
}));
import {
  hideWindow,
  readWindowState,
  restoreWindowState,
  showRestored,
  showWindow,
  trackWindowState,
} from '../apps/desktop/electron/window-state';

const left = { x: 0, y: 0, width: 1512, height: 944 },
  right = { x: 1512, y: 0, width: 2560, height: 1415 };
const workArea = (rect: { x: number }) => (rect.x >= 1512 ? right : left);
beforeEach(() => fs.files.clear());

function fakeWindow(state: { maximized?: boolean; fullscreen?: boolean } = {}) {
  const calls: string[] = [];
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    isMinimized: () => false,
    isMaximized: () => state.maximized === true,
    isFullScreen: () => state.fullscreen === true,
    getNormalBounds: () => ({ x: 1700, y: 80, width: 1400, height: 900 }),
    maximize: () => calls.push('maximize'),
    show: () => calls.push('show'),
    hide: () => calls.push('hide'),
    setFullScreen: (value: boolean) => {
      calls.push(`fullscreen:${value}`);
      state.fullscreen = value;
    },
  });
  return { window: window as unknown as BrowserWindow & EventEmitter, calls, state };
}

it('reopens on the monitor and in the fullscreen state it was closed in', () => {
  const { window } = fakeWindow({ fullscreen: true });
  trackWindowState(window, '/w.json');
  window.emit('close');
  const restored = readWindowState('/w.json', workArea);
  expect(restored).toMatchObject({ x: 1700, y: 80, width: 1400, fullscreen: true });
  const shown = fakeWindow();
  showRestored(shown.window, restored);
  expect(shown.calls).toEqual(['show', 'fullscreen:true']);
});

it('remembers a maximized window without forcing fullscreen', () => {
  const { window } = fakeWindow({ maximized: true });
  trackWindowState(window, '/w.json');
  window.emit('maximize');
  const restored = readWindowState('/w.json', workArea);
  expect(restored).toMatchObject({ maximized: true, fullscreen: false });
  const shown = fakeWindow();
  showRestored(shown.window, restored);
  expect(shown.calls).toEqual(['maximize', 'show']);
});

it('keeps a window from a removed monitor inside the remaining display', () => {
  const restored = restoreWindowState(
    { x: 5000, y: 3000, width: 1400, height: 900, maximized: false },
    () => left,
  );
  expect(restored).toMatchObject({ x: 112, y: 44, width: 1400, height: 900 });
});

it('starts with the default size when nothing valid was saved', () => {
  expect(readWindowState('/missing.json', workArea)).toEqual({
    width: 1440,
    height: 900,
    maximized: false,
    fullscreen: false,
  });
  expect(restoreWindowState({ width: 'x', height: 900 }, workArea).width).toBe(1440);
});

it('leaves fullscreen before hiding a closed Mac window, then returns to it when shown', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  try {
    const { window, calls } = fakeWindow({ fullscreen: true });
    trackWindowState(window, '/w.json');
    hideWindow(window);
    // Hiding at once would leave an empty black fullscreen Space behind.
    expect(calls).toEqual(['fullscreen:false']);
    window.emit('leave-full-screen');
    expect(calls).toEqual(['fullscreen:false', 'hide']);
    // macOS occlusion changes also emit 'show'; only an explicit show restores fullscreen.
    window.emit('show');
    expect(calls).toEqual(['fullscreen:false', 'hide']);
    // Quitting while hidden still reopens fullscreen next time.
    window.emit('close');
    expect(readWindowState('/w.json', workArea).fullscreen).toBe(true);
    showWindow(window);
    expect(calls.slice(-2)).toEqual(['show', 'fullscreen:true']);
    showWindow(window);
    expect(calls.filter((c) => c === 'fullscreen:true')).toHaveLength(1);
  } finally {
    Object.defineProperty(process, 'platform', platform);
  }
});

it('keeps a window up when it is shown again while still leaving fullscreen', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  try {
    const { window, calls } = fakeWindow({ fullscreen: true });
    hideWindow(window);
    showWindow(window);
    window.emit('leave-full-screen');
    expect(calls).toEqual(['fullscreen:false', 'show', 'fullscreen:true']);
  } finally {
    Object.defineProperty(process, 'platform', platform);
  }
});

it('hides a closed Mac window even if leaving fullscreen never reports back', () => {
  vi.useFakeTimers();
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  try {
    const { window, calls } = fakeWindow({ fullscreen: true });
    hideWindow(window);
    hideWindow(window);
    vi.advanceTimersByTime(1500);
    expect(calls).toEqual(['fullscreen:false', 'hide']);
  } finally {
    Object.defineProperty(process, 'platform', platform);
    vi.useRealTimers();
  }
});

it('hides a normal window at once', () => {
  const { window, calls } = fakeWindow();
  hideWindow(window);
  expect(calls).toEqual(['hide']);
});
