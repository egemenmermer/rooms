import { expect, it } from 'vitest';
import {
  DEFAULT_PUSH_TO_TALK_KEY,
  matchesPushToTalkKey,
  parsePushToTalkKey,
  pushToTalkKey,
  pushToTalkKeyFromEvent,
  releasesPushToTalkKey,
  serializePushToTalkKey,
} from '../apps/desktop/src/push-to-talk-key';

const press = (
  code: string,
  mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {},
) => ({
  code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

it('keeps the previous fixed shortcut as the default', () => {
  expect(pushToTalkKey(undefined)).toEqual({
    code: 'Space',
    ctrl: true,
    shift: true,
    alt: false,
    meta: false,
  });
  expect(serializePushToTalkKey(pushToTalkKey(DEFAULT_PUSH_TO_TALK_KEY))).toBe(
    DEFAULT_PUSH_TO_TALK_KEY,
  );
});

it('captures a key with its modifiers and round-trips it', () => {
  const key = pushToTalkKeyFromEvent(press('KeyV', { altKey: true }))!;
  expect(serializePushToTalkKey(key)).toBe('Alt+KeyV');
  expect(parsePushToTalkKey('Alt+KeyV')).toEqual(key);
  expect(pushToTalkKeyFromEvent(press('Backquote'))).toMatchObject({
    code: 'Backquote',
    ctrl: false,
  });
});

it('waits for a main key when only a modifier is pressed', () => {
  expect(pushToTalkKeyFromEvent(press('ShiftLeft', { shiftKey: true }))).toBeNull();
});

it('matches exact modifiers only and releases on the key or a required modifier', () => {
  const key = parsePushToTalkKey('Ctrl+KeyT')!;
  expect(matchesPushToTalkKey(press('KeyT', { ctrlKey: true }), key)).toBe(true);
  expect(matchesPushToTalkKey(press('KeyT', { ctrlKey: true, shiftKey: true }), key)).toBe(false);
  expect(matchesPushToTalkKey(press('KeyT'), key)).toBe(false);
  expect(releasesPushToTalkKey('KeyT', key)).toBe(true);
  expect(releasesPushToTalkKey('ControlRight', key)).toBe(true);
  expect(releasesPushToTalkKey('ShiftLeft', key)).toBe(false);
});

it('rejects corrupt stored values and falls back to the default', () => {
  for (const value of [
    '',
    'Ctrl+',
    'Ctrl+Ctrl+Space',
    'Hyper+Space',
    'Shift+ShiftLeft',
    'x'.repeat(80),
    7,
  ])
    expect(parsePushToTalkKey(value)).toBeNull();
  expect(serializePushToTalkKey(pushToTalkKey('Ctrl+'))).toBe(DEFAULT_PUSH_TO_TALK_KEY);
});
