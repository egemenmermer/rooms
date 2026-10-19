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

it('walks through renting a server one step at a time, with links that open in the browser', () => {
  const onSignIn = vi.fn();
  render(<SelfHostSteps onSignIn={onSignIn} />);
  const step = (title: string) => {
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe(title);
  };
  const external = (name: string) => {
    const link = screen.getByRole('link', { name: `${name}: siteye git` });
    expect(link.getAttribute('href')).toMatch(/^https:\/\//);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  };
  const next = () => fireEvent.click(screen.getByRole('button', { name: /^İleri/ }));
  // Only the current step is on screen, so the tab never needs to scroll.
  step(SELF_HOST_STEPS[0]!.title);
  expect(screen.getByText(`Adım 1 / ${SELF_HOST_STEPS.length}`)).toBeTruthy();
  expect((screen.getByRole('button', { name: /Geri/ }) as HTMLButtonElement).disabled).toBe(true);
  for (const name of ['Hetzner Cloud', 'DigitalOcean', 'Contabo']) external(name);
  expect(screen.queryByRole('link', { name: 'DuckDNS: siteye git' })).toBeNull();
  next();
  step('Ücretsiz adres al');
  external('DuckDNS');
  expect(screen.queryByRole('link', { name: 'Hetzner Cloud: siteye git' })).toBeNull();
  next();
  step('Portları aç');
  expect(screen.getByText('7882/UDP')).toBeTruthy();
  next();
  step('Kur');
  expect(screen.getByLabelText('Kurulum komutu').textContent).toContain('deploy/install.sh');
  fireEvent.click(screen.getByRole('button', { name: /Geri/ }));
  step('Portları aç');
  next();
  next();
  step('Bağlan ve davet et');
  expect(screen.queryByRole('button', { name: /^İleri/ })).toBeNull();
  expect(screen.getByText(/yerel mod hazırlanıyor/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Giriş yap sekmesine geç/ }));
  expect(onSignIn).toHaveBeenCalledTimes(1);
});

it('jumps between steps from the progress bar and announces the current one', () => {
  render(<SelfHostSteps onSignIn={() => {}} />);
  const fourth = screen.getByRole('button', { name: '4. adım: Kur' });
  fireEvent.click(fourth);
  expect(fourth.getAttribute('aria-current')).toBe('step');
  expect(screen.getByRole('status').textContent).toContain('Adım 4 / 5: Kur');
  fireEvent.click(screen.getByRole('button', { name: '1. adım: Sunucu kirala' }));
  expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Sunucu kirala');
});

it('copies the install command', async () => {
  const writeText = vi.fn(async () => {});
  Object.assign(navigator, { clipboard: { writeText } });
  render(<SelfHostSteps onSignIn={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: '4. adım: Kur' }));
  fireEvent.click(screen.getByRole('button', { name: 'Kurulum komutu: kopyala' }));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('| sudo bash'));
  expect((await screen.findByRole('status')).textContent).toContain('Kopyalandı');
});
