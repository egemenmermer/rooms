// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import type { HostOpsBridge, OpsHost, OpsSnapshot } from '../packages/shared-contracts/src/hostops';
const state = vi.hoisted(() => ({ user: { id: 'owner' }, serverUrl: 'https://qa.invalid' }));
vi.mock('../apps/desktop/src/community', () => ({
  useCommunity: (select: (v: typeof state) => unknown) => select(state),
}));
import { HostOperations } from '../apps/desktop/src/HostOperations';
afterEach(() => {
  cleanup();
  state.user = { id: 'owner' };
  delete window.rooms;
});
const host: OpsHost = {
  id: 'core',
  label: 'QA FIXTURE HOST',
  physicalHostId: 'primary',
  mode: 'shared',
  owner: true,
  permissions: ['monitor'],
  terminalAvailable: false,
  agentAvailable: false,
  reason: null,
};
const snapshot: OpsSnapshot = {
  host,
  sample: null,
  stale: true,
  thresholds: { cpuPercent: 85, cpuSeconds: 60, diskFreePercent: 15, backupHours: 24 },
  alerts: [],
};
it('shows absent sensors honestly and clears old-account telemetry on account switch', async () => {
  let resolve!: (value: []) => void;
  const history = new Promise<[]>((r) => {
    resolve = r;
  });
  const api = {
    hosts: vi.fn(async () => [host]),
    snapshot: vi.fn(async () => snapshot),
    history: vi.fn(() => history),
  } as unknown as HostOpsBridge;
  window.rooms = { hostOps: api } as typeof window.rooms;
  const view = render(<HostOperations />);
  await screen.findByText('Güncel ölçüm alınamıyor.');
  expect(screen.getByText('Desteklenmiyor')).toBeTruthy();
  state.user = { id: 'other' };
  vi.mocked(api.hosts).mockResolvedValue([]);
  view.rerender(<HostOperations />);
  await screen.findByText('Bu toplulukta sunucu yönetimi yetkin yok.');
  await act(async () => {
    resolve([]);
    await history;
  });
  expect(screen.queryByText('QA FIXTURE HOST')).toBeNull();
  expect(screen.queryByText('Güncel ölçüm alınamıyor.')).toBeNull();
});
it('offers an explicit unavailable state without a native bridge', () => {
  render(<HostOperations />);
  expect(
    screen.getByText('Sunucu yönetimi için güncel masaüstü uygulamasını kullan.'),
  ).toBeTruthy();
});
