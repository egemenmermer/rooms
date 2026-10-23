import { useSyncExternalStore } from 'react';
import { t } from './i18n';

// Whether the window stays above other apps. The window starts without it on every launch,
// so this lives in memory; Settings and the cinema screen share it.
let onTop = false;
const listeners = new Set<() => void>();

export async function setWindowOnTop(value: boolean) {
  if (!window.rooms) throw new Error(t('Masaüstü uygulamasını gerektirir.'));
  await window.rooms.setAlwaysOnTop(value);
  onTop = value;
  for (const listener of listeners) listener();
}

export const useWindowOnTop = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => onTop,
  );
