// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { UpdateNotice } from '../apps/desktop/src/UpdateNotice';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as { rooms?: unknown }).rooms;
});
function Where() {
  const location = useLocation();
  return <output>{location.pathname + location.search}</output>;
}
async function mount(status: ReturnType<typeof vi.fn>) {
  (window as { rooms?: unknown }).rooms = { updates: { status } };
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="*" element={<><UpdateNotice /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

it('stays hidden while no release is waiting or updates are switched off', async () => {
  await mount(vi.fn(async () => ({ enabled: true, state: 'idle', version: null })));
  expect(screen.queryByRole('button')).toBeNull();
  cleanup();
  await mount(vi.fn(async () => ({ enabled: false, state: 'ready', version: '0.1.18-rc.21' })));
  expect(screen.queryByRole('button')).toBeNull();
});

it('glows beside Settings once a release is ready and opens the restart prompt', async () => {
  await mount(vi.fn(async () => ({ enabled: true, state: 'ready', version: '0.1.18-rc.21' })));
  const button = screen.getByRole('button', { name: 'ROOMS 0.1.18-rc.21 hazır, güncellemek için tıkla' });
  expect(button.className).toContain('update-notice');
  fireEvent.click(button);
  expect(screen.getByRole('status').textContent).toBe('/settings?tab=about&install=1');
});

it('notices a release found later without a restart', async () => {
  vi.useFakeTimers();
  const status = vi
    .fn()
    .mockResolvedValueOnce({ enabled: true, state: 'idle', version: null })
    .mockResolvedValue({ enabled: true, state: 'available', version: '0.1.18-rc.21' });
  await mount(status);
  expect(screen.queryByRole('button')).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(screen.getByRole('button', { name: /0\.1\.18-rc\.21 hazır/ })).toBeTruthy();
});
