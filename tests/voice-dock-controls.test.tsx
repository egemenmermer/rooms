// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
const f = vi.hoisted(() => ({
  snapshot: {
    status: 'connected',
    channelId: 'room',
    roomName: 'Test room',
    muted: true,
    camera: false,
    sharing: false,
    deafened: false,
    participants: [],
    tracks: [],
    busy: false,
    error: null,
  },
  capture: vi.fn(),
  status: vi.fn(),
  start: vi.fn(),
  mic: vi.fn(),
  camera: vi.fn(),
  leave: vi.fn(),
}));
vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => f.snapshot,
  joinVoice: vi.fn(),
  leaveVoice: f.leave,
  toggleMic: f.mic,
  toggleDeafen: vi.fn(),
  toggleCamera: f.camera,
  startScreen: f.start,
  stopScreen: vi.fn(),
  setParticipantVolume: vi.fn(),
  startRoomAudio: vi.fn(),
  attachMediaTrack: vi.fn(),
  playSoundboard: vi.fn(),
  stopSoundboard: vi.fn(),
}));
vi.mock('../apps/desktop/src/runtime-sources', () => ({
  mediaBridge: () => ({ captureSources: f.capture, captureStatus: f.status }),
}));
vi.mock('../apps/desktop/src/screen-handoff', () => ({
  ScreenHandoffControls: () => null,
  cancelScreenHandoff: vi.fn(),
  decideScreenHandoff: vi.fn(),
  useScreenHandoff: (selector: any) => selector({ value: null, error: null }),
}));
import { RealVoiceDock } from '../apps/desktop/src/RealSocial';
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  f.snapshot.status = 'connected';
  f.capture.mockResolvedValue([{ id: 'window:test', name: 'DEMO window', thumbnail: '' }]);
  f.status.mockResolvedValue({ screen: 'granted', systemAudio: false });
  f.mic.mockResolvedValue(undefined);
  f.start.mockResolvedValue(undefined);
});
const mount = () =>
  render(
    <MemoryRouter initialEntries={['/voice']}>
      <RealVoiceDock openLauncher={() => {}} notify={() => {}} />
    </MemoryRouter>,
  );
it('navigation alone never publishes; source selection requires explicit final confirmation', async () => {
  mount();
  expect(f.mic).not.toHaveBeenCalled();
  expect(f.camera).not.toHaveBeenCalled();
  expect(f.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Ekran paylaş' }));
  await screen.findByRole('button', { name: /DEMO window/ });
  expect(f.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /DEMO window/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Seçili kaynağı paylaş' }));
  await waitFor(() =>
    expect(f.start).toHaveBeenCalledWith('window:test', expect.objectContaining({ audio: false })),
  );
});
it('visible microphone toggle invokes the real command and disconnected capture remains disabled', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Mikrofonu aç' }));
  expect(f.mic).toHaveBeenCalledOnce();
  cleanup();
  f.snapshot.status = 'reconnecting';
  mount();
  expect((screen.getByRole('button', { name: 'Ekran paylaş' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(f.capture).not.toHaveBeenCalled();
});

function CurrentRoute() {
  const route = useLocation();
  return (
    <output data-testid="capture-route">
      {route.pathname}
      {route.search}
    </output>
  );
}
it.each(['/media', '/cinema/room'])(
  'keeps the personal player visible after explicit capture from %s',
  async (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <RealVoiceDock openLauncher={() => {}} notify={() => {}} />
        <CurrentRoute />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ekran paylaş' }));
    fireEvent.click(await screen.findByRole('button', { name: /DEMO window/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Seçili kaynağı paylaş' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Seçili kaynağı paylaş' })).toBeNull(),
    );
    expect(f.start).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByTestId('capture-route').textContent).toBe(
        path === '/media' ? '/media' : '/cinema/room?view=screen',
      ),
    );
  },
);
