/** A push-to-talk shortcut: one non-modifier key plus exact modifier state, by physical key code. */
export interface PushToTalkKey {
  code: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}
export const DEFAULT_PUSH_TO_TALK_KEY = 'Ctrl+Shift+Space';
const modifierCodes = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);
const codePattern = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
const isMac = () => typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

export function parsePushToTalkKey(value: unknown): PushToTalkKey | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  const parts = value.split('+');
  const code = parts.pop();
  if (!code || !codePattern.test(code) || modifierCodes.has(code)) return null;
  const key = { code, ctrl: false, shift: false, alt: false, meta: false };
  for (const part of parts) {
    const name = ({ Ctrl: 'ctrl', Shift: 'shift', Alt: 'alt', Meta: 'meta' } as const)[
      part as 'Ctrl'
    ];
    if (!name || key[name]) return null;
    key[name] = true;
  }
  return key;
}
export function serializePushToTalkKey(key: PushToTalkKey) {
  return [key.ctrl && 'Ctrl', key.shift && 'Shift', key.alt && 'Alt', key.meta && 'Meta', key.code]
    .filter(Boolean)
    .join('+');
}
/** Valid stored shortcut, or the default for missing or corrupt values. */
export function pushToTalkKey(value: unknown): PushToTalkKey {
  return parsePushToTalkKey(value) ?? parsePushToTalkKey(DEFAULT_PUSH_TO_TALK_KEY)!;
}
/** Captures a shortcut from a key press; modifier-only presses wait for the main key. */
export function pushToTalkKeyFromEvent(event: {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): PushToTalkKey | null {
  if (modifierCodes.has(event.code) || !codePattern.test(event.code)) return null;
  return {
    code: event.code,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
  };
}
export function matchesPushToTalkKey(
  event: { code: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean },
  key: PushToTalkKey,
) {
  return (
    event.code === key.code &&
    event.ctrlKey === key.ctrl &&
    event.shiftKey === key.shift &&
    event.altKey === key.alt &&
    event.metaKey === key.meta
  );
}
/** Releasing the main key or any required modifier ends the transmission. */
export function releasesPushToTalkKey(code: string, key: PushToTalkKey) {
  return (
    code === key.code ||
    (key.ctrl && code.startsWith('Control')) ||
    (key.shift && code.startsWith('Shift')) ||
    (key.alt && code.startsWith('Alt')) ||
    (key.meta && code.startsWith('Meta'))
  );
}
export function formatPushToTalkKey(key: PushToTalkKey) {
  const mac = isMac();
  const main = key.code
    .replace(/^Key([A-Z])$/, '$1')
    .replace(/^Digit(\d)$/, '$1')
    .replace(/^Numpad/, 'Num ')
    .replace(/^Arrow/, '');
  return [
    key.ctrl && (mac ? 'Control' : 'Ctrl'),
    key.alt && (mac ? 'Option' : 'Alt'),
    key.shift && 'Shift',
    key.meta && (mac ? 'Cmd' : 'Win'),
    main,
  ]
    .filter(Boolean)
    .join(' ');
}
