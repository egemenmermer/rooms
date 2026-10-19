/** Actual owned public deployment acceptance. No fixtures, no credentials in output. */
import { readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const config = JSON.parse(
  await readFile(
    process.env.ROOMS_STOAT_TEST_ACCOUNTS ?? '.local/production/test-accounts.json',
    'utf8',
  ),
);
await build({
  entryPoints: ['packages/stoat-adapter/src/index.ts'],
  outfile: '.local/production/adapter.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
});
const { StoatClient } = await import(pathToFileURL(resolve('.local/production/adapter.mjs')));
const owner = new StoatClient(config.base),
  guest = new StoatClient(config.base),
  outsider = new StoatClient(config.base);
const results = [];
const check = async (name, run) => {
  try {
    await run();
    results.push({ name, status: 'PASS' });
  } catch (e) {
    results.push({
      name,
      status: 'FAIL',
      reason: e.code ?? e.message?.slice(0, 140) ?? 'ASSERTION_FAILED',
    });
  }
};
const request = async (role, path, body) => {
  const r = await fetch(config.base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config[role].token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
};
const suffix = randomUUID().slice(0, 8);
let current;
const snapshot = async (role = 'owner') => {
  const r = await request(role, `/rooms-activities/v1/rooms/${config.voiceId}/activity`);
  assert.equal(r.status, 200);
  return r.data;
};
const command = async (role, body, id = randomUUID()) => {
  const envelope = {
    protocolVersion: 1,
    commandId: id,
    expectedRevision: current.room.revision,
    command: body,
  };
  const response = await request(
    role,
    `/rooms-activities/v1/rooms/${config.voiceId}/activity/commands`,
    envelope,
  );
  assert.equal(
    response.status,
    200,
    `Activity ${body.type}: HTTP ${response.status} ${response.data.error ?? ''}`,
  );
  current = response.data;
  // Respect upstream authentication budgets; repeated command execution remains idempotent.
  await new Promise((resolve) => setTimeout(resolve, 550));
  return envelope;
};
try {
  await Promise.all([
    owner.login(config.owner.email, config.owner.password),
    guest.login(config.guest.email, config.guest.password),
    outsider.login(config.outsider.email, config.outsider.password),
  ]);
  await Promise.all([owner.connect(), guest.connect()]);
  await check('public TLS and registration gates', async () => {
    for (const path of [
      '/api/auth/account/create',
      '/api/auth/account/create/',
      '/api/auth/account%2fcreate',
    ]) {
      const r = await fetch(config.base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert(r.status === 403 || r.status === 404);
    }
    const noTicket = await request('owner', '/rooms-access/v1/auth/register', {
      email: 'invalid',
      password: 'not-a-password',
      username: 'qa',
      inviteCode: 'invalid',
    });
    assert.equal(noTicket.status, 400);
  });
  await check('actual direct message and read marker restoration', async () => {
    const recipient = await guest.getCurrentUser(),
      sender = await owner.getCurrentUser();
    if (
      !(await owner.listFriends()).some(
        (x) => x.user.id === recipient.id && x.relationship === 'friend',
      )
    ) {
      await owner.addFriend(`${recipient.username}#${recipient.discriminator}`);
      await guest.addFriend(`${sender.username}#${sender.discriminator}`);
    }
    const dm = await owner.createDM(recipient.id);
    const m = await owner.sendMessage(dm.id, 'ROOMS owned deployment QA');
    assert((await guest.listMessages(dm.id)).some((x) => x.id === m.id));
    await guest.ackRead(dm.id, m.id);
    assert(
      (await guest.readStates()).some((x) => x.channelId === dm.id && x.lastReadMessageId === m.id),
    );
    await owner.deleteMessage(dm.id, m.id);
  });
  await check('actual attachment upload, receipt and download', async () => {
    const attachment = await owner.uploadAttachment(
      new TextEncoder().encode('ROOMS owned attachment verification\n'),
      'rooms-qa.txt',
      'text/plain',
    );
    const m = await owner.sendMessage(config.textId, 'Owned attachment check', [attachment.id]);
    const received = (await guest.listMessages(config.textId)).find((x) => x.id === m.id);
    assert(received?.attachments?.[0]?.url);
    const download = await fetch(received.attachments[0].url);
    assert.equal(download.status, 200);
    assert((await download.text()).includes('owned attachment verification'));
    await owner.deleteMessage(config.textId, m.id);
  });
  await check(
    'actual invitation link: landing page, broker signup, use count and revoke',
    async () => {
      const invitation = await owner.createInvite(config.textId);
      assert.match(invitation.code, /^[a-f0-9]{64}$/);
      assert(invitation.expiresAt);
      assert.equal(invitation.maxUses, 10);
      assert.equal((await guest.inspectInvite(invitation.code)).space.id, config.spaceId);
      const landing = await fetch(`${new URL(config.base).origin}/davet/${invitation.code}`);
      assert.equal(landing.status, 200);
      assert.equal(landing.headers.get('cache-control'), 'no-store');
      assert((await landing.text()).includes('rooms://invite?'));
      const account = {
        email: `egemenmermerroomsqa${suffix}@gmail.com`,
        password: randomUUID() + randomUUID(),
        username: `qa_${suffix}`,
        inviteCode: invitation.code,
      };
      await writeFile(`.local/production/registration-${suffix}.json`, JSON.stringify(account), {
        mode: 0o600,
      });
      const fresh = new StoatClient(config.base);
      const id = createHash('sha256').update(invitation.code).digest('hex').slice(0, 16);
      try {
        await fresh.register(account);
        await fresh.connect();
        assert((await fresh.listSpaces()).some((x) => x.id === config.spaceId));
        const listed = (await owner.listInviteLinks(config.spaceId)).find((x) => x.id === id);
        assert.equal(listed?.uses, 1);
      } finally {
        await fresh.disconnect();
        await owner.revokeInviteLink(config.spaceId, id).catch(() => {});
      }
      await assert.rejects(() => guest.inspectInvite(invitation.code));
    },
  );
  await check('outsider denied media and Activity access', async () => {
    const media = await request('outsider', '/rooms-access/v1/media/grant', {
      channelId: config.voiceId,
    });
    assert.equal(media.status, 403);
    const activity = await request(
      'outsider',
      `/rooms-activities/v1/rooms/${config.voiceId}/activity`,
    );
    assert(activity.status >= 400);
  });
  await check('signed webhook rejects unsigned callbacks', async () => {
    const r = await request('owner', '/rooms-access/v1/media/webhook', {
      event: 'participant_joined',
    });
    assert.equal(r.status, 401);
  });
  await check('actual queue, timeline, poll and whiteboard shared state', async () => {
    current = await snapshot();
    if (current.room.primary) await command('owner', { type: 'end' });
    await command('owner', { type: 'join' });
    await command('guest', { type: 'join' });
    await command('owner', { type: 'start', activity: 'cinema', title: 'Owned deployment QA' });
    await command('owner', {
      type: 'queue.add',
      itemId: 'qa-' + suffix,
      media: {
        kind: 'independent-source',
        referenceId: 'owned-' + suffix,
        title: 'Owned independent source',
      },
    });
    await command('owner', { type: 'queue.select', itemId: 'qa-' + suffix });
    await command('owner', { type: 'playback', playing: false, positionSec: 14, rate: 1 });
    await command('owner', {
      type: 'poll.create',
      pollId: 'poll-' + suffix,
      question: 'Deployment QA',
      options: [
        { id: 'a', label: 'Film' },
        { id: 'b', label: 'Game' },
      ],
    });
    await command('guest', { type: 'poll.vote', pollId: 'poll-' + suffix, optionId: 'a' });
    const envelope = await command('owner', {
      type: 'whiteboard.put',
      element: {
        id: 'note-' + suffix,
        kind: 'text',
        points: [[10, 10]],
        text: 'Owned two-client state',
        color: '#ffffff',
        width: 2,
      },
    });
    const revision = current.room.revision;
    const duplicate = await request(
      'owner',
      `/rooms-activities/v1/rooms/${config.voiceId}/activity/commands`,
      envelope,
    );
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.data.room.revision, revision);
    const other = await snapshot('guest');
    assert.equal(other.room.timeline.positionSec, 14);
    assert.equal(
      other.room.polls.find((x) => x.id === 'poll-' + suffix).votes[config.guest.userId],
      'a',
    );
    assert(other.room.whiteboard.some((x) => x.id === 'note-' + suffix));
    await writeFile(
      '.local/production/persistence-before.json',
      JSON.stringify({
        roomId: config.voiceId,
        revision: other.room.revision,
        pollId: 'poll-' + suffix,
        elementId: 'note-' + suffix,
      }),
      { mode: 0o600 },
    );
    await command('owner', { type: 'end' });
  });
  await check('actual holdem table keeps hands private and records result', async () => {
    current = await snapshot();
    await command('owner', { type: 'game.create', game: 'holdem' });
    await command('owner', { type: 'game.sit', seat: 0 });
    await command('guest', { type: 'game.sit', seat: 1 });
    await command('owner', { type: 'game.action', action: 'start' });
    const a = await snapshot(),
      b = await snapshot('guest');
    assert(a.room.game && b.room.game);
    assert.notDeepEqual(a.room.game.view, b.room.game.view);
    const seat = a.room.game.seats.find((s) => s.seat === a.room.game.turn);
    await command(seat.userId === config.owner.userId ? 'owner' : 'guest', {
      type: 'game.action',
      action: 'fold',
    });
    assert.equal(current.room.game.status, 'finished');
    assert.equal(current.room.game.history.at(-1).hand, 1);
    await command('owner', { type: 'end' });
  });
  await check('official YouTube iframe served from the public HTTPS origin', async () => {
    const r = await fetch(
      `${config.base}/rooms-activities/player/youtube?videoId=M7lc1UVf-VE&nonce=${randomUUID()}`,
    );
    assert.equal(r.status, 200);
    assert((await r.text()).includes('https://www.youtube.com/iframe_api'));
    assert(r.headers.get('content-security-policy'));
  });
  await check(
    'current upstream membership revocation immediately denies both adapters',
    async () => {
      const invite = await owner.createUpstreamInvite(config.textId);
      let removed = false;
      try {
        await owner.removeMember(config.spaceId, config.guest.userId);
        removed = true;
        const activity = await request(
          'guest',
          `/rooms-activities/v1/rooms/${config.voiceId}/activity`,
        );
        assert(activity.status >= 400);
        const media = await request('guest', '/rooms-access/v1/media/grant', {
          channelId: config.voiceId,
        });
        assert.equal(media.status, 403);
      } finally {
        if (removed) await guest.acceptInvite(invite.code);
      }
    },
  );
} finally {
  await Promise.allSettled([owner.disconnect(), guest.disconnect(), outsider.disconnect()]);
}
await writeFile(
  'infra/production/ACCEPTANCE_RESULTS.json',
  JSON.stringify(
    { kind: 'actual-owned-public-deployment', at: new Date().toISOString(), results },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(results, null, 2));
if (results.some((x) => x.status !== 'PASS')) process.exitCode = 1;
