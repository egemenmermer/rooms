import { afterEach, expect, it, vi } from 'vitest';
import {
  configureI18n,
  intlLocale,
  placeholders,
  resolveLocale,
  t,
} from '../packages/i18n/src/index';
vi.mock('electron', () => ({ app: {}, ipcMain: {} }));
import { currentLocale } from '../apps/desktop/electron/locale';

afterEach(() => configureI18n({ locale: 'tr' }));

it('returns the Turkish source with its placeholders filled', () => {
  configureI18n({ locale: 'tr', catalog: { '{name} katıldı': '{name} joined' } });
  expect(t('{name} katıldı', { name: 'Ece' })).toBe('Ece katıldı');
  expect(t('{name} katıldı')).toBe('{name} katıldı');
  expect(intlLocale()).toBe('tr-TR');
});

it('translates through the English catalog and falls back to the source', () => {
  const missing = vi.fn();
  configureI18n({
    locale: 'en',
    catalog: {
      '{name} katıldı': '{name} joined',
      '{count} kişi': { one: '{count} person', other: '{count} people' },
    },
    onMissing: missing,
  });
  expect(t('{name} katıldı', { name: 'Ece' })).toBe('Ece joined');
  expect(t('{count} kişi', { count: 1 })).toBe('1 person');
  expect(t('{count} kişi', { count: 4 })).toBe('4 people');
  expect(t('{count} kişi', { count: 0 })).toBe('0 people');
  expect(t('Henüz çevrilmedi')).toBe('Henüz çevrilmedi');
  expect(missing).toHaveBeenCalledWith('Henüz çevrilmedi');
  expect(intlLocale()).toBe('en-US');
});

it('leaves unknown placeholders and $-patterns untouched', () => {
  configureI18n({ locale: 'en', catalog: { '{a} ve {b}': '{a} and {b}' } });
  expect(t('{a} ve {b}', { a: '$&', b: 2 })).toBe('$& and 2');
  expect(t('{a} ve {b}', { a: 'x' })).toBe('x and {b}');
});

it('picks Turkish for a Turkish system or a Turkey region, English elsewhere', () => {
  expect(resolveLocale('system', ['tr-TR', 'en-US'])).toBe('tr');
  expect(resolveLocale('system', ['tr'])).toBe('tr');
  expect(resolveLocale('system', ['en-TR', 'tr-TR'])).toBe('tr');
  expect(resolveLocale('system', ['en-US', 'tr-TR'])).toBe('en');
  expect(resolveLocale('system', ['de-DE'])).toBe('en');
  expect(resolveLocale('system', [])).toBe('en');
  expect(resolveLocale('en', ['tr-TR'])).toBe('en');
  expect(resolveLocale('tr', ['en-US'])).toBe('tr');
});

it('lets ROOMS_LOCALE pin the main-process language for test machines', () => {
  expect(currentLocale('system', ['en-US'], 'tr')).toEqual({
    preference: 'system',
    resolved: 'tr',
  });
  expect(currentLocale('tr', ['en-US'], 'en')).toEqual({ preference: 'tr', resolved: 'en' });
  expect(currentLocale('system', ['en-US'], 'fr')).toEqual({
    preference: 'system',
    resolved: 'en',
  });
  expect(currentLocale('system', ['en-US'], '').resolved).toBe('en');
});

it('lists the placeholders of plain and plural messages', () => {
  expect(placeholders('{b} ve {a} {a}')).toEqual(['a', 'b']);
  expect(placeholders({ one: 'one item', other: '{count} items' })).toEqual(['count']);
});
