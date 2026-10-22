// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import {
  ChannelPermissions,
  type ChannelPermissionSnapshot,
} from '../apps/desktop/src/CommunitySettings';

vi.mock('../apps/desktop/src/realtime', () => ({
  useRealtime: () => ({ participants: [], status: 'idle' }),
}));

afterEach(cleanup);

const channel = { id: 'chan', spaceId: 'space', name: 'genel', type: 0, topic: null } as never;
const snapshot = (): ChannelPermissionSnapshot => ({
  channelId: 'chan',
  subjects: [
    {
      id: 'everyone',
      kind: 'default',
      name: 'Herkes',
      editable: true,
      values: { send: 'inherit' },
    },
    { id: 'mods', kind: 'role', name: 'Moderatör', editable: true, values: { send: 'inherit' } },
  ],
});

it('keeps an unsaved change and the selection when the parent re-renders with the same permissions', async () => {
  const onSave = vi.fn(async (draft: ChannelPermissionSnapshot) => structuredClone(draft));
  const props = { channel, access: 'allowed' as const, canEdit: true, onSave, onReturn() {} };
  const { rerender } = render(<ChannelPermissions {...props} snapshot={snapshot()} />);
  fireEvent.click(screen.getByRole('button', { name: /Moderatör/ }));
  const send = () => within(screen.getByRole('group', { name: 'Mesaj gönder' }));
  fireEvent.click(send().getByRole('button', { name: 'Ret' }));
  // A message or typing event re-renders the surface with a new, equal snapshot.
  rerender(<ChannelPermissions {...props} snapshot={snapshot()} />);
  expect(screen.getByRole('heading', { name: 'Moderatör' })).toBeTruthy();
  expect(send().getByRole('button', { name: 'Ret' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));
  await screen.findByText('İzinler sunucu tarafından kaydedildi.');
  // The surface then shows the saved permissions; the notice and selection stay.
  const saved = snapshot();
  saved.subjects[1]!.values.send = 'deny';
  rerender(<ChannelPermissions {...props} snapshot={saved} />);
  await waitFor(() =>
    expect(screen.getByText('İzinler sunucu tarafından kaydedildi.')).toBeTruthy(),
  );
  expect(screen.getByRole('heading', { name: 'Moderatör' })).toBeTruthy();
});
