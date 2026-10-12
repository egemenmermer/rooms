// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Kiraathane } from '../apps/desktop/src/Kiraathane';
import type { GamePublicState } from '../packages/activity-protocol/src';
afterEach(cleanup);
const callbacks = () => ({ onCreate: vi.fn(), onOpen: vi.fn(), onChat: vi.fn(), onHistory: vi.fn(), onRetry: vi.fn() });
it('unknown connection never invents occupancy and never opens a new game', () => {
  const f = callbacks(); render(<Kiraathane {...f} game={null} ready={false} error={null} blocked="" busy={false}/>);
  expect(screen.getByRole('img').getAttribute('src')).toBe('./kiraathane/interior.jpg');
  const button = screen.getByRole('button', { name: /Masa 2/ }); expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByText('0/4')).toBeNull(); fireEvent.click(button); expect(f.onCreate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Masa 1 / })); expect(f.onChat).toHaveBeenCalled();
});
it('only the matching table shows server seats and opening it does not create or leave a game', () => {
  const f = callbacks(); const game = { kind: 'holdem', status: 'waiting', seats: [{ userId: 'demo-test-owner' }], view: { rules: { capacity: 6 } } } as unknown as GamePublicState;
  render(<Kiraathane {...f} game={game} ready error={null} blocked="" busy={false}/>);
  expect(screen.getByText('1/6')).toBeTruthy(); expect(screen.queryByText('3/4')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Masa 7/ })); expect(f.onOpen).toHaveBeenCalledOnce(); expect(f.onCreate).not.toHaveBeenCalled();
  expect((screen.getByRole('button', { name: /Masa 2/ }) as HTMLButtonElement).disabled).toBe(true);
});
it('routes supported games into existing creation and explicitly disables unimplemented games', () => {
  const f = callbacks(); render(<Kiraathane {...f} game={null} ready error={null} blocked="" busy={false}/>);
  fireEvent.click(screen.getByRole('button', { name: /Masa 2/ })); expect(f.onCreate).toHaveBeenCalledWith('batak');
  expect((screen.getByRole('button', { name: /Masa 3/ }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: /Masa 5/ }) as HTMLButtonElement).disabled).toBe(true);
});
