import type { DesktopBridge } from '@rooms/contracts';
import { liveKitMediaProvider, type RealtimeMediaProvider } from '@rooms/media';
import type { RoomSnapshot } from '@rooms/activity-protocol';
import { t } from './i18n';

interface DevelopmentRuntime {
  mediaProvider: RealtimeMediaProvider;
  mediaBridge: DesktopBridge['media'];
  activityBridge: DesktopBridge['activity'];
  activityState?: {
    room: RoomSnapshot;
    status: 'connected' | 'loading' | 'error';
    error: string | null;
    serverTimeMs: number;
  };
}
let development: DevelopmentRuntime | null = null;

/** Only explicit development bootstrap can replace transports; never exposed over IPC. */
export function installDevelopmentRuntime(value: DevelopmentRuntime): () => void {
  if (!import.meta.env.DEV) throw new Error('Development runtimes are unavailable in production.');
  const previous = development;
  development = value;
  return () => {
    development = previous;
  };
}
export const mediaProvider = (): RealtimeMediaProvider =>
  import.meta.env.DEV && development ? development.mediaProvider : liveKitMediaProvider;
export function mediaBridge(): DesktopBridge['media'] {
  if (import.meta.env.DEV && development) return development.mediaBridge;
  if (!window.rooms?.media)
    throw new Error('Open the Electron desktop app to use voice and screen sharing.');
  return window.rooms.media;
}
export function activityBridge(): DesktopBridge['activity'] {
  if (import.meta.env.DEV && development) return development.activityBridge;
  if (!window.rooms?.activity)
    throw new Error(
      t('Ortak etkinlikler masaüstü uygulaması ve yapılandırılmış sunucu gerektirir.'),
    );
  return window.rooms.activity;
}
/** Explicit private development projection, never read from IPC or production configuration. */
export function developmentActivityState(roomId: string) {
  return import.meta.env.DEV && development?.activityState?.room.roomId === roomId
    ? development.activityState
    : null;
}
