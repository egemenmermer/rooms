// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { StartTabs, type StartTab } from '../apps/desktop/src/StartTabs';
import { SelfHostSteps } from '../apps/desktop/src/SelfHostSteps';
import { SELF_HOST_STEPS } from '../apps/desktop/src/self-host-content';
afterEach(() => cleanup());

function Harness({ onSelect }: { onSelect(tab: StartTab): void }) {
  const [active, setActive] = useState<StartTab>('register');
  return (
    <StartTabs
      active={active}
      onSelect={(tab) => {
        onSelect(tab);
        setActive(tab);
      }}
    />
  );
}

it('offers three start tabs with arrow, Home and End navigation', () => {
  const onSelect = vi.fn();
  render(<Harness onSelect={onSelect} />);
  const list = screen.getByRole('tablist', { name: 'Başlangıç' });
  const tabs = screen.getAllByRole('tab');
  expect(list).toBeTruthy();
  expect(tabs.map((tab) => tab.textContent)).toEqual([
    'Kayıt ol',
    'Giriş yap',
    'Kendi sunucunu kur',
  ]);
  expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
  expect(onSelect).toHaveBeenLastCalledWith('signin');
  expect(document.activeElement).toBe(tabs[1]);
  fireEvent.keyDown(tabs[1]!, { key: 'End' });
  expect(onSelect).toHaveBeenLastCalledWith('selfhost');
  fireEvent.keyDown(tabs[2]!, { key: 'ArrowRight' });
  expect(onSelect).toHaveBeenLastCalledWith('register');
  fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' });
  expect(onSelect).toHaveBeenLastCalledWith('selfhost');
  fireEvent.keyDown(tabs[2]!, { key: 'Home' });
  expect(onSelect).toHaveBeenLastCalledWith('register');
  expect(screen.getByRole('tab', { name: 'Kayıt ol' }).getAttribute('aria-selected')).toBe('true');
});

it('walks through renting a server with external links that open in the browser', () => {
  const onSignIn = vi.fn();
  render(<SelfHostSteps onSignIn={onSignIn} />);
  expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(SELF_HOST_STEPS.length);
  for (const name of ['Hetzner Cloud', 'DigitalOcean', 'Contabo', 'DuckDNS']) {
    const link = screen.getByRole('link', { name: `${name}: siteye git` });
    expect(link.getAttribute('href')).toMatch(/^https:\/\//);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  }
  expect(screen.getByLabelText('Kurulum komutu').textContent).toContain('deploy/install.sh');
  expect(screen.getByText(/yerel mod hazırlanıyor/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Giriş yap sekmesine geç/ }));
  expect(onSignIn).toHaveBeenCalledTimes(1);
});

it('copies the install command', async () => {
  const writeText = vi.fn(async () => {});
  Object.assign(navigator, { clipboard: { writeText } });
  render(<SelfHostSteps onSignIn={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Kurulum komutu: kopyala' }));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('| sudo bash'));
  expect(await screen.findByRole('status')).toBeTruthy();
});
