// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
const mock = vi.hoisted(() => ({
  volume: vi.fn(),
  voice: {
    channelId: 'room',
    status: 'connected',
    participants: [
      { id: 'bob', name: 'Bob', local: false, volume: 0.4 },
      { id: 'self', name: 'Me', local: true, volume: 1 },
    ],
  },
}));
vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => mock.voice,
  setParticipantVolume: mock.volume,
}));
import { ParticipantAudioMenu } from '../apps/desktop/src/ParticipantAudioMenu';
afterEach(() => {
  cleanup();
  mock.volume.mockClear();
  mock.voice.participants[0].volume = 0.4;
});
it('opens remote playback controls from right click, mutes only that listener and restores prior volume', () => {
  const view = render(
    <>
      <button data-voice-participant-id="bob">Bob tile</button>
      <ParticipantAudioMenu />
    </>,
  );
  fireEvent.contextMenu(screen.getByText('Bob tile'), { clientX: 30, clientY: 60 });
  fireEvent.click(screen.getByText('Sesini kapat'));
  expect(mock.volume).toHaveBeenLastCalledWith('bob', 0);
  mock.voice.participants[0].volume = 0;
  view.rerender(
    <>
      <button data-voice-participant-id="bob">Bob tile</button>
      <ParticipantAudioMenu />
    </>,
  );
  fireEvent.click(screen.getByText('Sesini aç'));
  expect(mock.volume).toHaveBeenLastCalledWith('bob', 0.4);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('does not offer receiver controls on oneself and closes when a participant leaves', () => {
  const view = render(
    <>
      <button data-voice-participant-id="self">My tile</button>
      <button data-voice-participant-id="bob">Bob tile</button>
      <ParticipantAudioMenu />
    </>,
  );
  fireEvent.contextMenu(screen.getByText('My tile'));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.keyDown(screen.getByText('Bob tile'), { key: 'F10', shiftKey: true });
  expect(screen.getByRole('dialog')).toBeTruthy();
  const prior = mock.voice.participants;
  mock.voice.participants = [];
  view.rerender(<ParticipantAudioMenu />);
  expect(screen.queryByRole('dialog')).toBeNull();
  mock.voice.participants = prior;
});
