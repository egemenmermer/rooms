// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { configureI18n } from '../packages/i18n/src';
import { Avatar } from '../packages/design-system/src/index';
import { guardTimer } from '../apps/desktop/src/games/shared/TurnClock';

afterEach(cleanup);
const initialsOf = (name: string) =>
  render(<Avatar name={name} />).container.querySelector('.avatar > span')?.textContent;

describe('avatar initials', () => {
  it.each([
    ['Can (demo)', 'C'],
    ['Ali (demo)', 'A'],
    ['(demo) Zeynep', 'Z'],
    ['[BOT] Mert Ay', 'MA'],
    ['  - Ece', 'E'],
    ['"Deniz" Kaya', 'DK'],
    ['(demo)', 'D'],
    ['((', '?'],
    ['🎮 Can', '🎮C'],
    ['Sam Lee Jr', 'SL'],
  ])('%s -> %s', (name, expected) => expect(initialsOf(name)).toBe(expected));

  it('keeps the Turkish dotted I for names with Turkish letters in any UI language', () => {
    configureI18n({ locale: 'en', catalog: {} });
    expect(initialsOf('ilker')).toBe('I');
    expect(initialsOf('ışık')).toBe('I');
    expect(initialsOf('İpek')).toBe('İ');
    expect(initialsOf('ışıl ilgaz')).toBe('Iİ');
  });
  it('uppercases i as İ in the Turkish UI', () => {
    configureI18n({ locale: 'tr', catalog: {} });
    expect(initialsOf('ilker')).toBe('İ');
    configureI18n({ locale: 'en', catalog: {} });
  });
});

describe('guardTimer', () => {
  it('passes real turn times and clamps below zero', () => {
    expect(guardTimer(30)).toBe(30);
    expect(guardTimer(0)).toBe(0);
    expect(guardTimer(-5)).toBe(0);
    expect(guardTimer(7.4)).toBe(7);
  });
  it('draws nothing for no clock or a value that cannot be a turn time', () => {
    expect(guardTimer(null)).toBeNull();
    expect(guardTimer(undefined)).toBeNull();
    expect(guardTimer(Number.NaN)).toBeNull();
    expect(guardTimer(2_208_341_980)).toBeNull();
    expect(guardTimer(Infinity)).toBeNull();
    expect(guardTimer(601)).toBeNull();
  });
});
