// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

beforeEach(() => {
  vi.resetModules();
  globalThis.__roomsLocale = 'en';
});
afterEach(() => {
  cleanup();
  globalThis.__roomsLocale = 'tr';
});

it('renders the language picker in English when English is chosen', async () => {
  const { LanguageSetting } = await import('../apps/desktop/src/LanguageSetting');
  render(<LanguageSetting />);
  expect(screen.getByRole('heading', { name: 'Language / Dil' })).toBeTruthy();
  expect(screen.getByRole('option', { name: 'System language' })).toBeTruthy();
  expect(screen.getByRole('option', { name: 'Türkçe' })).toBeTruthy();
  expect(document.documentElement.lang).toBe('en');
});

it('translates server error codes for English readers', async () => {
  const { uiError, locale } = await import('../apps/desktop/src/i18n');
  expect(locale).toBe('en-US');
  expect(uiError(new Error('SOME_UNKNOWN_CODE'))).toBe(
    'The action could not be completed. Try again.',
  );
});
