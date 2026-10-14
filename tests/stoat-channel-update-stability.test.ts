import { expect, it } from 'vitest';
import { StoatClient } from '@rooms/stoat';
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
