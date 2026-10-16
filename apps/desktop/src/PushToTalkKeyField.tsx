import { useEffect, useState } from 'react';
import {
  DEFAULT_PUSH_TO_TALK_KEY,
  formatPushToTalkKey,
  pushToTalkKey,
  pushToTalkKeyFromEvent,
  serializePushToTalkKey,
} from './push-to-talk-key';

/** Records the next key combination; Escape alone cancels without changing the shortcut. */
export function PushToTalkKeyField({
  value,
  onChange,
}: {
  value: string;
  onChange(value: string): void;
}) {
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    if (!capturing) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const modified = event.ctrlKey || event.shiftKey || event.altKey || event.metaKey;
      if (event.code === 'Escape' && !modified) {
        setCapturing(false);
        return;
      }
      const key = pushToTalkKeyFromEvent(event);
      if (!key) return;
      onChange(serializePushToTalkKey(key));
      setCapturing(false);
    };
    const cancel = () => setCapturing(false);
    window.addEventListener('keydown', capture, true);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', capture, true);
      window.removeEventListener('blur', cancel);
    };
  }, [capturing, onChange]);
  return (
    <div className="ptt-key-field">
      <kbd aria-live="polite">
        {capturing ? 'Tuşlara bas… (Esc vazgeç)' : formatPushToTalkKey(pushToTalkKey(value))}
      </kbd>
      <button
        type="button"
        className="button secondary"
        aria-pressed={capturing}
        onClick={() => setCapturing((current) => !current)}
      >
        {capturing ? 'Vazgeç' : 'Değiştir'}
      </button>
      {!capturing && value !== DEFAULT_PUSH_TO_TALK_KEY && (
        <button
          type="button"
          className="button secondary"
          onClick={() => onChange(DEFAULT_PUSH_TO_TALK_KEY)}
        >
          Varsayılan
        </button>
      )}
    </div>
  );
}
