// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

const load = async () => {
  const module = await import('../apps/desktop/src/cinema/hall-keys');
  module.resetHallKeys();
  return module;
};

describe('cinema hall keys', () => {
  beforeEach(() => localStorage.clear());

  it('runs the default keys, letters in either case, Shift only when spelled out', async () => {
    const keys = await load();
    expect(keys.hallCommandOf({ key: 'f', shiftKey: false })).toBe('fullscreen');
    expect(keys.hallCommandOf({ key: 'F', shiftKey: false })).toBe('fullscreen');
    expect(keys.hallCommandOf({ key: 'F', shiftKey: true })).toBeNull();
    expect(keys.hallCommandOf({ key: '?', shiftKey: true })).toBe('help');
    expect(keys.hallCommandOf({ key: 'ArrowRight', shiftKey: false })).toBe('seekForward');
    expect(keys.hallCommandOf({ key: ' ', shiftKey: false })).toBe('playPause');
    expect(keys.hallCommandOf({ key: '5', shiftKey: false })).toBeNull();
  });

  it('moves a taken key to the new command and says which one lost it', async () => {
    const keys = await load();
    expect(keys.bindHallKey('pictureInPicture', { key: 'f', shift: false })).toBe('fullscreen');
    expect(keys.hallCommandOf({ key: 'f', shiftKey: false })).toBe('pictureInPicture');
    expect(keys.hallKeys().fullscreen).toBeNull();
    expect(keys.keyLabel(keys.hallKeys().fullscreen)).toBe('—');
    expect(keys.bindHallKey('fullscreen', { key: 'ArrowRight', shift: true })).toBeNull();
    expect(keys.keyLabel(keys.hallKeys().fullscreen)).toBe('⇧ →');
    expect(keys.bindHallKey('mute', { key: 'Escape', shift: false })).toBe('reserved');
    expect(keys.bindHallKey('mute', { key: '7', shift: false })).toBe('reserved');
    // Stored only as differences from the defaults.
    expect(JSON.parse(localStorage.getItem('rooms.cinema.keys')!)).toEqual({
      fullscreen: { key: 'ArrowRight', shift: true },
      pictureInPicture: { key: 'f', shift: false },
    });
  });

  it('resets one command, freeing its default key, or all of them', async () => {
    const keys = await load();
    keys.bindHallKey('pictureInPicture', { key: 'f', shift: false });
    keys.resetHallKeys('fullscreen');
    expect(keys.hallKeys().fullscreen).toEqual({ key: 'f', shift: false });
    expect(keys.hallKeys().pictureInPicture).toBeNull();
    keys.resetHallKeys();
    expect(keys.hallKeys()).toEqual(keys.defaultKeys);
  });
});

describe('programme reminders', () => {
  beforeEach(() => localStorage.clear());

  it('fires once at the start, drops programmes long gone, keeps later ones', async () => {
    const r = await import('../apps/desktop/src/cinema/reminders');
    const at = (start: number, title: string) => ({
      hallId: 'h',
      ref: 'l-1',
      channel: 'Kanal',
      title,
      start,
    });
    const now = 1_000_000_000;
    r.toggleReminder(at(now + 60_000, 'Sonra'));
    r.toggleReminder(at(now + 10_000, 'Şimdi'));
    r.toggleReminder(at(now - 20 * 60_000, 'Kaçtı'));
    expect(r.hasReminder(at(now + 10_000, 'Şimdi'))).toBe(true);
    expect(r.takeDue(now).map((x) => x.title)).toEqual(['Şimdi']);
    expect(r.takeDue(now)).toEqual([]);
    expect(r.reminders().map((x) => x.title)).toEqual(['Sonra']);
    r.toggleReminder(at(now + 60_000, 'Sonra'));
    expect(r.reminders()).toEqual([]);
  });

  it("hands a reminder's channel to its own hall once", async () => {
    const r = await import('../apps/desktop/src/cinema/reminders');
    r.requestHallOpen('h', 'l-7');
    expect(r.takeHallOpen('other')).toBeNull();
    expect(r.takeHallOpen('h')).toBe('l-7');
    expect(r.takeHallOpen('h')).toBeNull();
  });
});
