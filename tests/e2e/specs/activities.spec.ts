import { test, expect } from '../support/fixtures';
import type { RoomsClient } from '../support/client';
import { VoiceView } from '../support/pages/voice';
import { createChannel, uniqueText } from '../support/seed';

// The first snapshot of a room at revision 0 is a 20 s long-poll (see the known-defect test).
const firstLoad = { timeout: 40000 };

async function openPolls(client: RoomsClient, room: string) {
  await new VoiceView(client).join(room);
  await client.goto('/together');
  await expect(client.page.getByRole('heading', { name: 'Oda anketi' })).toBeVisible();
}

/**
 * Workaround for a known defect (see the `test.fail` below): the poll button requires an
 * activity participant, but the client only joins when it sends its first command. This
 * sends the same `join` envelope the client itself would send, through the preload bridge.
 */
async function joinActivityRoom(client: RoomsClient, roomId: string) {
  await client.page.evaluate(async (id) => {
    const bridge = (window as any).rooms.activity;
    const snapshot = await bridge.snapshot(id);
    await bridge.command(id, {
      protocolVersion: 1,
      commandId: crypto.randomUUID(),
      expectedRevision: snapshot.room.revision,
      command: { type: 'join' },
    });
  }, roomId);
}

test.describe('shared room activities', () => {
  test('a poll is created, voted on and counted for both members', async ({
    owner,
    guest,
    run,
  }) => {
    test.setTimeout(180000);
    const room = await createChannel(
      run.owner,
      run.space.id,
      uniqueText('anket').replace(' ', '-'),
      true,
    );
    await expect(owner.nav.getByRole('button', { name: room.name, exact: true })).toBeVisible();
    await openPolls(owner, room.name);
    await openPolls(guest, room.name);

    const question = `Akşam ne yapalım ${run.runId}?`;
    await joinActivityRoom(owner, room.id);
    await owner.page.getByRole('button', { name: 'Yeni anket' }).first().click(firstLoad);
    const form = owner.page.getByRole('dialog');
    await form.getByLabel('Soru').fill(question);
    await form.getByLabel('Seçenek 1').fill('Film');
    await form.getByLabel('Seçenek 2').fill('Oyun');
    await form.getByRole('button', { name: 'Anketi başlat' }).click();
    await expect(owner.page.getByRole('heading', { name: question })).toBeVisible();

    await expect(guest.page.getByRole('heading', { name: question })).toBeVisible(firstLoad);
    await guest.page.getByRole('button', { name: /Oyun/ }).filter({ hasText: 'oy' }).click();
    await expect(owner.page.getByText('1 kişi oy verdi')).toBeVisible();
    await expect(
      owner.page.getByRole('button', { name: /Oyun/ }).filter({ hasText: '1 oy' }),
    ).toBeVisible();
  });

  test('the activity view of a new room loads promptly', async ({ owner, run }) => {
    // Known defect found by this suite: the first observe() call long-polls with
    // afterRevision=0, so a never-used room (revision 0) waits the full waitMs=20000
    // before anything renders. Remove `test.fail` once the first load is immediate.
    test.fail(true, 'First activity snapshot of a revision-0 room waits 20 s.');
    const room = await createChannel(
      run.owner,
      run.space.id,
      uniqueText('bos-oda').replace(' ', '-'),
      true,
    );
    await expect(owner.nav.getByRole('button', { name: room.name, exact: true })).toBeVisible();
    await openPolls(owner, room.name);
    await expect(owner.page.getByText('Oda getiriliyor…')).toHaveCount(0, { timeout: 5000 });
  });

  test('a member can start a poll in a fresh voice room', async ({ owner, run }) => {
    // Known defect found by this suite: "Yeni anket" stays disabled with "Bu odada anket
    // oluşturma yetkin yok." because createReason needs an activity participant, the client
    // only joins inside send(), and the service drops participants after 30 s idle. Nobody,
    // not even the owner, can open the poll form in a fresh or idle room.
    test.fail(true, 'Poll creation requires a prior activity join that the UI never sends.');
    test.setTimeout(90000);
    const room = await createChannel(
      run.owner,
      run.space.id,
      uniqueText('anketsiz').replace(' ', '-'),
      true,
    );
    await expect(owner.nav.getByRole('button', { name: room.name, exact: true })).toBeVisible();
    await openPolls(owner, room.name);
    await expect(owner.page.getByRole('button', { name: 'Yeni anket' }).first()).toBeEnabled(
      firstLoad,
    );
  });

  test('the game hall offers every table game in a voice room', async ({ owner, run }) => {
    await new VoiceView(owner).join(run.channels.voice.name);
    await owner.goto('/games');
    const hall = owner.page.getByRole('region', { name: 'Kıraathane' });
    await expect(hall).toBeVisible();
    for (const game of ['Texas Hold’em', 'Blackjack', 'Batak', '101 Okey']) {
      const card = hall
        .getByRole('article')
        .filter({ has: owner.page.getByRole('heading', { name: game }) });
      await expect(card.getByRole('button', { name: 'Masa aç' })).toBeEnabled(firstLoad);
    }
  });
});
