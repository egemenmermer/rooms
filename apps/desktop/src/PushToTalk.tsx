import { tr } from './i18n';
import { useEffect } from 'react';
import { liveKitMediaProvider } from '@rooms/media';
import { useRooms } from './store';
import { useRealtime } from './realtime';
/** A held key owns only the microphone it enabled. Key release and focus loss always remute it. */
export function PushToTalk({ notify }: {
    notify(message: string): void;
}) {
    const enabled = useRooms(s => s.preferences.pushToTalk);
    const { channelId, status } = useRealtime();
    useEffect(() => {
        if (!enabled || !channelId || status !== 'connected')
            return;
        let held = false;
        let disposed = false;
        const fail = (error: unknown) => notify(error instanceof Error ? error.message : tr("Push-to-talk could not access the microphone."));
        const release = () => { if (!held)
            return; held = false; void liveKitMediaProvider.mute(true).catch(fail); };
        void liveKitMediaProvider.mute(true).catch(fail);
        const down = (event: KeyboardEvent) => {
            if (event.code !== 'Space' || !event.ctrlKey || !event.shiftKey || event.repeat || held || liveKitMediaProvider.snapshot().deafened)
                return;
            if ((event.target as HTMLElement).closest('input,textarea,select,[contenteditable="true"]') || document.querySelector('[role="dialog"]') && !(event.target as HTMLElement).closest('[data-soundboard]'))
                return;
            event.preventDefault();
            event.stopImmediatePropagation();
            held = true;
            void liveKitMediaProvider.mute(false).then(() => { if (!held || disposed)
                return liveKitMediaProvider.mute(true); }).catch(fail);
        };
        const up = (event: KeyboardEvent) => { if (event.code === 'Space' || event.code === 'ControlLeft' || event.code === 'ControlRight' || event.code === 'ShiftLeft' || event.code === 'ShiftRight')
            release(); };
        const visibility = () => { if (document.hidden)
            release(); };
        window.addEventListener('keydown', down, true);
        window.addEventListener('keyup', up, true);
        window.addEventListener('blur', release);
        document.addEventListener('visibilitychange', visibility);
        return () => { disposed = true; release(); window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', visibility); };
    }, [enabled, channelId, status, notify]);
    return null;
}
