import { afterEach, expect, it, vi } from 'vitest';
import { StoatClient } from '@rooms/stoat';
afterEach(() => vi.unstubAllGlobals());
it('does not revoke conversation history for message pointer, channel name or icon changes', async () => {
  const client = new StoatClient('http://localhost', 'fixture');
  const events: any[] = [];
  client.subscribe((e) => events.push(e));
  const internal = client as any;
  internal.channels.set('channel', {
    _id: 'channel',
    server: 'space',
    channel_type: 'TextChannel',
  });
  for (const data of [
    { last_message_id: 'message' },
    { name: 'General' },
    { icon: null },
    { description: 'Friends' },
  ])
    await internal.processPacket({ type: 'ChannelUpdate', id: 'channel', data });
  expect(events.filter((e) => e.type === 'CHANNEL_ACCESS_INVALIDATED')).toEqual([]);
  expect(internal.channels.get('channel').last_message_id).toBe('message');
});
it('still invalidates real authority changes, cleared permission fields and unknown fields', async () => {
  for (const packet of [
    { data: { default_permissions: { a: 0, d: 2 ** 20 } } },
    { data: {}, clear: ['DefaultPermissions'] },
    { data: { role_permissions: {} } },
    { data: { new_authority_field: true } },
  ]) {
    const client = new StoatClient('http://localhost', 'fixture');
    const events: any[] = [];
    client.subscribe((e) => events.push(e));
    const internal = client as any;
    internal.channels.set('channel', {
      _id: 'channel',
      server: 'space',
      channel_type: 'TextChannel',
    });
    await internal.processPacket({ type: 'ChannelUpdate', id: 'channel', ...packet });
    expect(events.some((e) => e.type === 'CHANNEL_ACCESS_INVALIDATED')).toBe(true);
  }
});
it('ignores other members role or nickname changes but rechecks the current user', async () => {
  const client = new StoatClient('http://localhost', 'fixture');
  const events: any[] = [];
  client.subscribe((e) => events.push(e));
  const internal = client as any;
  internal.currentUser = { id: 'self' };
  internal.channels.set('channel', {
    _id: 'channel',
    server: 'space',
    channel_type: 'TextChannel',
  });
  await internal.processPacket({
    type: 'ServerMemberUpdate',
    id: { server: 'space', user: 'friend' },
    data: { nickname: 'yeni ad', roles: ['role'] },
  });
  await internal.processPacket({ type: 'ServerMemberLeave', id: 'space', user: 'friend' });
  expect(events.filter((e) => e.type === 'CHANNEL_ACCESS_INVALIDATED')).toEqual([]);
  await internal.processPacket({
    type: 'ServerMemberUpdate',
    id: { server: 'space', user: 'self' },
    data: { roles: [] },
  });
  expect(events.filter((e) => e.type === 'CHANNEL_ACCESS_INVALIDATED')).toHaveLength(1);
});
it('keeps a channel when one message is gone but hides it when the channel is unknown', async () => {
  for (const [type, hidden] of [
    ['NotFound', false],
    ['UnknownChannel', true],
  ] as const) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ type }), { status: 404 })),
    );
    const client = new StoatClient('http://localhost', 'fixture');
    const events: any[] = [];
    client.subscribe((e) => events.push(e));
    await expect(client.getMessage('channel', 'message')).rejects.toMatchObject({ status: 404 });
    expect(events.some((e) => e.type === 'CHANNEL_ACCESS_INVALIDATED')).toBe(hidden);
  }
});
it('does not recheck channel access when a server only changes its channel list or presentation', async () => {
  // Creating or deleting a channel sends ServerUpdate { channels }. Rechecking every channel then
  // spends the 5/10 s server bucket that the next channel write needs.
  for (const packet of [
    { data: { channels: ['channel', 'created'] } },
    { data: { name: 'Yeni ad' } },
    { data: { description: 'Arkadaşlar' }, clear: ['Description'] },
    { data: {}, clear: ['Icon', 'Banner'] },
  ]) {
    const client = new StoatClient('http://localhost', 'fixture');
    const events: any[] = [];
    client.subscribe((e) => events.push(e));
    const internal = client as any;
    internal.channels.set('channel', {
      _id: 'channel',
      server: 'space',
      channel_type: 'TextChannel',
    });
    const epoch = internal.managementEpoch;
    await internal.processPacket({ type: 'ServerUpdate', id: 'space', ...packet });
    expect(events.filter((e) => e.type === 'CHANNEL_ACCESS_INVALIDATED')).toEqual([]);
    expect(internal.managementEpoch).toBe(epoch + 1);
  }
});
it('still rechecks channel access for server authority changes and unknown fields', async () => {
  for (const packet of [
    { data: { default_permissions: 0 } },
    { data: { owner: 'someone' } },
    { data: { channels: ['channel'], roles: {} } },
    { data: { new_authority_field: true } },
    { data: {}, clear: ['DefaultPermissions'] },
  ]) {
    const client = new StoatClient('http://localhost', 'fixture');
    const events: any[] = [];
    client.subscribe((e) => events.push(e));
    const internal = client as any;
    internal.channels.set('channel', {
      _id: 'channel',
      server: 'space',
      channel_type: 'TextChannel',
    });
    await internal.processPacket({ type: 'ServerUpdate', id: 'space', ...packet });
    expect(events.some((e) => e.type === 'CHANNEL_ACCESS_INVALIDATED')).toBe(true);
  }
});
