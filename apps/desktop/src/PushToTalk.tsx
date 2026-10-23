import { t, tr } from './i18n';
import { useEffect } from 'react';
import { useRooms } from './store';
import { useRealtime } from './realtime';
import { mediaProvider } from './runtime-sources';
import {
  formatPushToTalkKey,
  matchesPushToTalkKey,
  pushToTalkKey,
  releasesPushToTalkKey,
} from './push-to-talk-key';
/** The room hint names the shortcut this listener chose, not the default. */
export function PushToTalkNotice() {
  const shortcut = useRooms((s) => s.preferences.pushToTalkKey);
  return (
    <span>
      {t('Bas konuş açık · {key}', { key: formatPushToTalkKey(pushToTalkKey(shortcut)) })}
    </span>
  );
}
/** A held key owns only the microphone it enabled. Key release and focus loss always remute it. */
export function PushToTalk({ notify }: { notify(message: string): void }) {
  const enabled = useRooms((s) => s.preferences.pushToTalk);
  const shortcut = useRooms((s) => s.preferences.pushToTalkKey);
  const { channelId, status } = useRealtime();
  useEffect(() => {
    if (!enabled || !channelId || status !== 'connected') return;
    const provider = mediaProvider();
    const key = pushToTalkKey(shortcut);
    let held = false;
    let disposed = false;
    const fail = (error: unknown) =>
      notify(
        error instanceof Error
          ? error.message
          : tr('Push-to-talk could not access the microphone.'),
      );
    const release = () => {
      if (!held) return;
      held = false;
      void provider.mute(true).catch(fail);
    };
    void provider.mute(true).catch(fail);
    const down = (event: KeyboardEvent) => {
      if (!matchesPushToTalkKey(event, key) || event.repeat || held || provider.snapshot().deafened)
        return;
      if (
        (event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]') ||
        (document.querySelector('[role="dialog"]') &&
          !(event.target as HTMLElement).closest('[data-soundboard]'))
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      held = true;
      void provider
        .mute(false)
        .then(() => {
          if (!held || disposed) return provider.mute(true);
        })
        .catch(fail);
    };
    const up = (event: KeyboardEvent) => {
      if (releasesPushToTalkKey(event.code, key)) release();
    };
    const visibility = () => {
      if (document.hidden) release();
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      release();
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [enabled, shortcut, channelId, status, notify]);
  return null;
}
