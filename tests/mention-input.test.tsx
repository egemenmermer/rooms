// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DesktopBridge } from '@rooms/contracts';
import { useMentionInput } from '../apps/desktop/src/MentionInput';
import { useCommunity } from '../apps/desktop/src/community';
import { queryClient } from '../apps/desktop/src/query-client';
const original = useCommunity.getState();
const person = (id: string) => ({ id, username: id, displayName: 'Same Name', avatar: null });
function Composer({ send }: { send: (value: string) => void }) {
  const [value, setValue] = useState('');
  const mention = useMentionInput(value, setValue);
  return (
    <>
      {mention.menu}
      <textarea
        aria-label="Composer"
        ref={mention.input}
        value={value}
        onSelect={mention.onSelect}
        onChange={(e) => mention.change(e.target.value, e.target.selectionStart)}
        onKeyDown={(e) => {
          if (!mention.onKeyDown(e) && e.key === 'Enter') send(mention.serialize());
        }}
      />
      <button onClick={() => send(mention.serialize())}>Send</button>
    </>
  );
}
beforeEach(() => {
  queryClient.clear();
  useCommunity.setState({
    user: person('self'),
    serverUrl: 'https://example.test',
    activeSpaceId: 'space',
    activeChannelId: 'chat',
    messages: [],
    channels: [{ id: 'chat', name: 'Chat', type: 0, spaceId: 'space', topic: null }],
    dms: [],
  });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  useCommunity.setState(original, true);
  delete window.rooms;
});
it('selects same-name members by keyboard identity and sends canonical mentions only after selection', async () => {
  window.rooms = {
    social: { members: async () => [{ user: person('alice') }, { user: person('bob') }] },
  } as unknown as DesktopBridge;
  const send = vi.fn();
  render(<Composer send={send} />);
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: '@Same', selectionStart: 5 } });
  await screen.findByText('@bob');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Tab' });
  expect((input as HTMLTextAreaElement).value).toBe('@Same Name ');
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(send).toHaveBeenLastCalledWith('<@bob> ');
  fireEvent.change(input, { target: { value: '@Some Name ', selectionStart: 11 } });
  fireEvent.click(screen.getByText('Send'));
  expect(send).toHaveBeenLastCalledWith('@Some Name ');
});
it('does not show late member results from a previous account', async () => {
  let finish!: (people: unknown[]) => void;
  window.rooms = {
    social: {
      members: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((r) => {
              finish = r;
            }),
        )
        .mockResolvedValue([]),
    },
  } as unknown as DesktopBridge;
  render(<Composer send={vi.fn()} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '@', selectionStart: 1 } });
  await screen.findByText('Kişiler yükleniyor…');
  await act(async () => {
    useCommunity.setState({ user: person('new-account') });
    finish([{ user: person('old-private-member') }]);
  });
  expect(screen.queryByText('@old-private-member')).toBeNull();
});

it('limits direct-message suggestions to the conversation rather than a previously selected community', async () => {
  const members = vi.fn(async () => [{ user: person('community-only') }]);
  window.rooms = { social: { members } } as unknown as DesktopBridge;
  useCommunity.setState({
    activeChannelId: 'dm',
    dms: [
      { id: 'dm', name: 'DM', type: 1, spaceId: null, topic: null, recipients: [person('friend')] },
    ],
  });
  render(<Composer send={vi.fn()} />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '@', selectionStart: 1 } });
  await screen.findByText('@friend');
  expect(members).not.toHaveBeenCalled();
  expect(screen.queryByText('@community-only')).toBeNull();
});
