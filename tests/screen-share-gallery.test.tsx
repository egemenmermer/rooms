// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ScreenShareGallery } from '../apps/desktop/src/ScreenShareGallery';
import type { MediaTrack, MediaParticipant } from '@rooms/media';
afterEach(cleanup);
const tracks = ['one', 'two'].map((id, i) => ({
  id,
  participantId: id,
  source: 'screen_share',
  kind: 'video',
  local: i === 0,
  muted: false,
})) as MediaTrack[];
const people = [
  { id: 'one', name: 'DEMO Alice' },
  { id: 'two', name: 'DEMO Bob' },
] as MediaParticipant[];
it('shows self and friend previews, enlarges the selected share, and falls back when it ends', () => {
  const props = {
    tracks,
    people,
    notify: () => {},
    renderTrack: (id: string) => <video data-testid={id} />,
  };
  const view = render(<ScreenShareGallery {...props} initialTrackId="two" />);
  expect(
    view.container.querySelector('[data-screen-focus] video')?.getAttribute('data-testid'),
  ).toBe('two');
  fireEvent.click(screen.getByRole('button', { name: 'DEMO Alice (sen) ekranını büyüt' }));
  expect(
    view.container.querySelector('[data-screen-focus] video')?.getAttribute('data-testid'),
  ).toBe('one');
  view.rerender(<ScreenShareGallery {...props} tracks={[tracks[1]]} />);
  expect(
    view.container.querySelector('[data-screen-focus] video')?.getAttribute('data-testid'),
  ).toBe('two');
});
