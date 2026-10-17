import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import type { BrowserWindow, Rectangle } from 'electron';

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
  fullscreen: boolean;
}
const MIN = { width: 900, height: 700 },
  DEFAULT = { width: 1440, height: 900 };

/**
 * Normal bounds on the display the window was last on, plus how it was shown there.
 * `workAreaFor` picks the display nearest to the saved bounds (a missing monitor falls back).
 */
export function restoreWindowState(
  saved: unknown,
  workAreaFor: (bounds: Rectangle) => Rectangle,
): WindowState {
  const value = (saved ?? {}) as Partial<Record<keyof WindowState, unknown>>;
  const num = (key: keyof WindowState) =>
    typeof value[key] === 'number' && Number.isFinite(value[key]) ? (value[key] as number) : null;
  const width = num('width'),
    height = num('height');
  if (width === null || height === null) return { ...DEFAULT, maximized: false, fullscreen: false };
  const x = num('x'),
    y = num('y');
  const area = workAreaFor({ x: x ?? 0, y: y ?? 0, width, height });
  const state: WindowState = {
    width: Math.min(area.width, Math.max(MIN.width, width)),
    height: Math.min(area.height, Math.max(MIN.height, height)),
    maximized: value.maximized === true,
    fullscreen: value.fullscreen === true,
  };
  if (x !== null && y !== null) {
    state.x = Math.max(area.x, Math.min(x, area.x + area.width - state.width));
    state.y = Math.max(area.y, Math.min(y, area.y + area.height - state.height));
  }
  return state;
}

export function readWindowState(file: string, workAreaFor: (bounds: Rectangle) => Rectangle) {
  try {
    return restoreWindowState(JSON.parse(readFileSync(file, 'utf8')), workAreaFor);
  } catch {
    return restoreWindowState(null, workAreaFor);
  }
}

// Windows that left fullscreen only to be hidden; they still count as fullscreen and return to it.
const hiddenFromFullScreen = new WeakSet<BrowserWindow>();
// Cancels a hide that is still waiting for the window to leave fullscreen.
const pendingHide = new WeakMap<BrowserWindow, () => void>();

/**
 * Hides a window that is closed but kept running. macOS leaves an empty black Space behind a
 * hidden fullscreen window, so the window leaves fullscreen first and hides once it has.
 */
export function hideWindow(window: BrowserWindow) {
  if (pendingHide.has(window)) return;
  if (process.platform !== 'darwin' || !window.isFullScreen()) {
    window.hide();
    return;
  }
  hiddenFromFullScreen.add(window);
  const stop = () => {
    clearTimeout(fallback);
    window.removeListener('leave-full-screen', hide);
    pendingHide.delete(window);
  };
  const hide = () => {
    stop();
    if (!window.isDestroyed()) window.hide();
  };
  // The transition normally takes under a second; a stuck animation must not keep the window up.
  const fallback = setTimeout(hide, 1500);
  window.once('leave-full-screen', hide);
  pendingHide.set(window, stop);
  window.setFullScreen(false);
}

/**
 * Brings a kept-running window back, into fullscreen again if it was hidden from fullscreen.
 * Electron's own 'show' event also fires on macOS occlusion changes, so callers use this instead.
 */
export function showWindow(window: BrowserWindow) {
  pendingHide.get(window)?.();
  window.show();
  if (hiddenFromFullScreen.delete(window)) window.setFullScreen(true);
}

/** Shows the window the way it was closed: maximized or fullscreen on the same display. */
export function showRestored(window: BrowserWindow, state: WindowState) {
  if (state.maximized && !state.fullscreen) window.maximize();
  window.show();
  if (state.fullscreen) window.setFullScreen(true);
}

/**
 * Saves the normal bounds and the maximized/fullscreen flags whenever they change, not only on
 * close, so a quit for an update or a fullscreen close still reopens on the same monitor.
 */
export function trackWindowState(window: BrowserWindow, file: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    clearTimeout(timer);
    if (window.isDestroyed() || window.isMinimized()) return;
    const { width, height, x, y } = window.getNormalBounds();
    const next: WindowState = {
      width,
      height,
      x,
      y,
      maximized: window.isMaximized(),
      fullscreen: window.isFullScreen() || hiddenFromFullScreen.has(window),
    };
    const temporary = file + '.tmp';
    try {
      writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
      renameSync(temporary, file);
    } catch {
      rmSync(temporary, { force: true });
    }
  };
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  };
  for (const event of ['resize', 'move'] as const) window.on(event as 'resize', soon);
  for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'] as const)
    window.on(event as 'maximize', save);
  window.on('close', save);
  return save;
}
