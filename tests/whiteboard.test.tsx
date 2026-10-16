// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Whiteboard from '../apps/desktop/src/Whiteboard';

const media = vi.hoisted(() => ({
  listener: null as null | ((payload: string, sender: string) => void),
  publish: vi.fn(),
  state: {
    status: 'connected',
    channelId: 'room',
    participants: [
      { id: 'me', name: 'Ben' },
      { id: 'ece', name: 'Ece' },
    ],
  },
}));
vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => media.state,
  publishCursor: media.publish,
  onCursor: (listener: (payload: string, sender: string) => void) => {
    media.listener = listener;
    return () => (media.listener = null);
  },
}));
afterEach(() => {
  cleanup();
  media.publish.mockClear();
  vi.unstubAllGlobals();
});
function activity(send: (command: unknown) => Promise<void> = async () => {}) {
  return {
    status: 'connected',
    busy: false,
    error: null,
    serverOffsetMs: 0,
    room: { roomId: 'room', whiteboard: [] },
    send,
    refresh: vi.fn(),
    clearError: vi.fn(),
  } as never;
}
const mount = (send?: (command: unknown) => Promise<void>) =>
  render(<Whiteboard roomId="room" userId="me" roomName="Salon" activity={activity(send)} />);
const cursor = (sender: string, value: unknown) =>
  act(() => media.listener?.(JSON.stringify(value), sender));

it('shows where other people point on this board, by name, and forgets them when they leave', () => {
  mount();
  cursor('ece', { b: 'room', x: 120, y: 80 });
  const label = screen.getByText('Ece');
  expect(label.closest('g')?.getAttribute('transform')).toBe('translate(120 80)');
  cursor('ece', { b: 'other-room', x: 5, y: 5 });
  cursor('me', { b: 'room', x: 1, y: 1 });
  expect(screen.queryByText('Ben')).toBeNull();
  expect(screen.getByText('Ece').closest('g')?.getAttribute('transform')).toBe('translate(120 80)');
  cursor('ece', { b: 'room' });
  expect(screen.queryByText('Ece')).toBeNull();
});

it('writes a note exactly where the board was clicked', async () => {
  const send = vi.fn(async () => {});
  mount(send);
  const svg = screen.getByRole('img', { name: 'Ortak çizim tahtası' }) as unknown as SVGSVGElement;
  // jsdom has neither layout nor geometry types: an identity screen transform stands in.
  class Point {
    constructor(
      public x = 0,
      public y = 0,
    ) {}
    matrixTransform() {
      return this;
    }
  }
  vi.stubGlobal('DOMPoint', Point);
  vi.stubGlobal('PointerEvent', class extends MouseEvent {});
  svg.getScreenCTM = () => ({ inverse: () => ({}) }) as never;
  fireEvent.click(screen.getByRole('button', { name: /Metin/ }));
  fireEvent.pointerDown(svg, { button: 0, clientX: 412, clientY: 233 });
  const input = screen.getByRole('textbox', { name: 'Beyaz tahta notu' });
  expect(document.activeElement).toBe(input);
  fireEvent.change(input, { target: { value: 'Pazar planı' } });
  await act(async () => fireEvent.keyDown(input, { key: 'Enter' }));
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'whiteboard.put',
      element: expect.objectContaining({ kind: 'text', points: [[412, 233]], text: 'Pazar planı' }),
    }),
  );
});
