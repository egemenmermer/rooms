// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
const { attach, detach, media } = vi.hoisted(() => ({
  attach: vi.fn(),
  detach: vi.fn(),
  media: { status: 'connected' },
}));
vi.mock('../apps/desktop/src/realtime', () => ({
  attachMediaTrack: attach,
  useRealtime: () => media,
}));
import { MediaStage } from '../apps/desktop/src/MediaStage';
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it('waits for actual video data and preserves the element through presentation updates', () => {
  attach.mockReturnValue(detach);
  const view = render(<MediaStage id="stream" label="Screen" />);
  const video = screen.getByLabelText('Screen');
  expect(screen.getByRole('status').textContent).toContain('bekleniyor');
  fireEvent.loadedData(video);
  expect(screen.queryByRole('status')).toBeNull();
  view.rerender(<MediaStage id="stream" label="New title" />);
  expect(screen.getByLabelText('New title')).toBe(video);
  expect(attach).toHaveBeenCalledOnce();
  expect(detach).not.toHaveBeenCalled();
  view.unmount();
  expect(detach).toHaveBeenCalledOnce();
});
it('recovers from an ended track when a different stream is selected', () => {
  attach
    .mockImplementationOnce(() => {
      throw new Error('Ended');
    })
    .mockReturnValue(detach);
  const view = render(<MediaStage id="ended" label="Screen" />);
  const video = screen.getByLabelText('Screen');
  expect(screen.getByRole('alert').textContent).toContain('sona erdi');
  view.rerender(<MediaStage id="new" label="Screen" />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('status')).toBeTruthy();
  expect(screen.getByLabelText('Screen')).toBe(video);
  fireEvent.loadedData(video);
  expect(screen.queryByRole('status')).toBeNull();
});
it('cancels frame observation and detaches exactly once when changing streams', () => {
  const callbacks: FrameRequestCallback[] = [];
  const request = vi.fn((callback: FrameRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  const cancel = vi.fn();
  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
    configurable: true,
    value: request,
  });
  Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
    configurable: true,
    value: cancel,
  });
  attach.mockReturnValue(detach);
  const view = render(<MediaStage id="one" label="Screen" />);
  view.rerender(<MediaStage id="two" label="Screen" />);
  expect(cancel).toHaveBeenCalledWith(1);
  expect(detach).toHaveBeenCalledOnce();
  callbacks[0](0);
  expect(screen.getByRole('status')).toBeTruthy();
  view.unmount();
  expect(cancel).toHaveBeenCalledWith(2);
  expect(detach).toHaveBeenCalledTimes(2);
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
  Reflect.deleteProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback');
});

it('waits while the room reconnects and attaches again once it is back', () => {
  attach.mockReturnValue(detach);
  media.status = 'reconnecting';
  const view = render(<MediaStage id="stream" label="Screen" />);
  expect(attach).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toContain('bekleniyor');
  media.status = 'connected';
  view.rerender(<MediaStage id="stream" label="Screen" />);
  expect(attach).toHaveBeenCalledOnce();
});

it('offers to try a failed stream again', () => {
  attach
    .mockImplementationOnce(() => {
      throw new Error('Gone');
    })
    .mockReturnValue(detach);
  render(<MediaStage id="stream" label="Screen" />);
  fireEvent.click(screen.getByRole('button', { name: 'Yeniden dene' }));
  expect(attach).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('alert')).toBeNull();
});
