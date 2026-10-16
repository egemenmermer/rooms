// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ScreenShareGallery } from '../apps/desktop/src/ScreenShareGallery';
import { viewerSummary } from '../apps/desktop/src/RealSocial';
afterEach(cleanup);
const person = (id: string, name: string, watching: string | null, local = false) => ({
  id,
  name,
  local,
  watching,
  muted: false,
  speaking: false,
  camera: false,
  screen: id === 'bob',
  volume: 1,
  quality: 'excellent',
});
it('summarizes who watches a stream from their announcements', () => {
  const people = [
    person('alice', 'Alice', 'bob', true),
    person('bob', 'Bob', null),
    person('carol', 'Carol', 'bob'),
  ];
  expect(viewerSummary(people, 'bob')).toBe('2 kişi izliyor');
  expect(viewerSummary(people, 'bob', true)).toBe('İzleyenler: Sen, Carol');
  expect(viewerSummary(people, 'carol')).toBe('Henüz izleyen yok');
  expect(viewerSummary(people, null)).toBe('Henüz izleyen yok');
});
it('waits for the stream subscription instead of attaching an unsubscribed screen', () => {
  const renderTrack = vi.fn(() => <video />);
  const onWatch = vi.fn();
  render(
    <ScreenShareGallery
      tracks={[
        {
          id: 'screen',
          participantId: 'bob',
          source: 'screen_share',
          kind: 'video',
          local: false,
          muted: false,
          subscribed: false,
        },
      ]}
      people={[person('bob', 'Bob', null)]}
      renderTrack={renderTrack}
      notify={vi.fn()}
      onWatch={onWatch}
    />,
  );
  expect(screen.getByRole('status').textContent).toBe('Yayın açılıyor…');
  expect(renderTrack).not.toHaveBeenCalled();
  expect(onWatch).toHaveBeenCalledWith('bob');
});
