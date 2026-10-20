import { app, dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { DesktopWindowPreferences } from '@rooms/contracts';
import { hideWindow } from './window-state';

/** Closing a window and explicitly quitting the application are separate user actions. */
export function setupWindowPolicy(
  assertSender: (event: IpcMainInvokeEvent) => void,
  trayAvailable: () => boolean,
  voiceActive: () => boolean,
  isQuitting: () => boolean,
) {
  const file = join(app.getPath('userData'), 'desktop-window.json');
  let keepOpenOnClose = true,
    warnOnVoiceClose = true;
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    keepOpenOnClose = saved.keepOpenOnClose !== false;
    warnOnVoiceClose = saved.warnOnVoiceClose !== false;
  } catch {
    /* New profiles keep calls alive; an explicit saved opt-out is preserved. */
  }
  const status = (): DesktopWindowPreferences => ({
    keepOpenOnClose,
    warnOnVoiceClose,
    trayAvailable: trayAvailable(),
  });
  ipcMain.handle('rooms:desktop-window-status', (event) => {
    assertSender(event);
    return status();
  });
  ipcMain.handle('rooms:desktop-window-preference', (event, key, value) => {
    assertSender(event);
    if (
      !app.isPackaged &&
      event.senderFrame &&
      new URL(event.senderFrame.url).searchParams.has('fixture')
    )
      throw new Error('Window preference changes are disabled in development fixtures.');
    if (!['keepOpenOnClose', 'warnOnVoiceClose'].includes(key) || typeof value !== 'boolean')
      throw new Error('Invalid window preference.');
    if (key === 'keepOpenOnClose' && value && !trayAvailable())
      throw new Error('The system tray is not available.');
    const next = { keepOpenOnClose, warnOnVoiceClose, [key]: value },
      temporary = file + '.tmp';
    try {
      writeFileSync(temporary, JSON.stringify(next), { mode: 0o600 });
      renameSync(temporary, file);
    } finally {
      rmSync(temporary, { force: true });
    }
    keepOpenOnClose = next.keepOpenOnClose;
    warnOnVoiceClose = next.warnOnVoiceClose;
    return status();
  });
  function attach(window: BrowserWindow) {
    let approved = false,
      pending = false;
    window.on('close', (event) => {
      if (isQuitting()) return;
      // A missing tray always falls back to an ordinary, recoverable close.
      if (keepOpenOnClose && trayAvailable()) {
        event.preventDefault();
        hideWindow(window);
        return;
      }
      if (approved || !warnOnVoiceClose || !voiceActive()) return;
      event.preventDefault();
      if (pending) return;
      pending = true;
      void dialog
        .showMessageBox(window, {
          type: 'question',
          title: 'Tayfa',
          message: 'Pencereyi kapat?',
          detail: 'Ses bağlantın sonlanacak.',
          buttons: ['Vazgeç', 'Pencereyi kapat'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        })
        .then((result) => {
          if (result.response !== 1 || window.isDestroyed() || isQuitting()) return;
          // Re-read the policy after the asynchronous dialog; a new keep-open choice must win.
          if (keepOpenOnClose && trayAvailable()) hideWindow(window);
          else {
            approved = true;
            window.close();
          }
        })
        .catch(() => {
          /* A failed confirmation must not disconnect a call. */
        })
        .finally(() => {
          pending = false;
        });
    });
  }
  return { status, attach };
}
