import { test, expect } from '../support/fixtures';
import type { RoomsClient } from '../support/client';
import { StoatApi } from '../support/stoat-api';
import { ChatView } from '../support/pages/chat';
import { createChannel, uniqueText } from '../support/seed';

async function createFromSidebar(
  client: RoomsClient,
  kind: 'text' | 'voice',
  name: string,
  timeout = 10000,
) {
  await client.nav
    .getByRole('button', { name: kind === 'text' ? 'Sohbet kanalı oluştur' : 'Ses odası oluştur' })
    .click();
  const dialog = client.page.getByRole('dialog', { name: 'Kanal oluştur' });
  await dialog
    .getByRole('button', { name: kind === 'text' ? /^Metin kanalı/ : /^Ses odası/ })
    .click();
  await dialog.getByRole('textbox', { name: 'Ad' }).fill(name);
  await dialog.getByRole('button', { name: 'Oluştur', exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout });
}

test.describe('channel management', () => {
  test('owner-created channels appear live for members', async ({ owner, guest, run }) => {
    const voice = uniqueText('ses').replace(' ', '-');
    await createFromSidebar(owner, 'voice', voice);
    await expect(guest.nav.getByRole('button', { name: voice, exact: true })).toBeVisible();

    const text = uniqueText('metin').replace(' ', '-');
    await createFromSidebar(owner, 'text', text);
    await expect(owner.nav.getByRole('button', { name: text, exact: true })).toBeVisible();
    await expect(guest.nav.getByRole('button', { name: text, exact: true })).toBeVisible();

    // The upstream server holds the voice room as a voice-capable channel.
    const api = new StoatApi(run.owner.token);
    const server = await api.request<{ channels: string[] }>(`/servers/${run.space.id}`);
    const channels = await Promise.all(
      server.channels.map((id) =>
        api.request<{ name: string; voice?: unknown }>(`/channels/${id}`),
      ),
    );
    expect(channels.find((channel) => channel.name === voice)?.voice).toBeTruthy();
  });

  // Regression: every create used to spend the POST plus five reads of the upstream server
  // bucket (5 calls / 10 s), so the next save waited ~10-20 s on "Kaydediliyor…" for the window
  // to reset. See docs/E2E_TESTING.md, "Bulunan hatalar".
  test('back-to-back channel creation closes the dialog within 5 s', async ({ owner }) => {
    for (const kind of ['voice', 'text'] as const) {
      const name = uniqueText(`hizli-${kind}`).replace(' ', '-');
      await createFromSidebar(owner, kind, name, 5000);
      await expect(owner.nav.getByRole('button', { name, exact: true })).toBeVisible();
    }
  });

  test('rename and delete from the channel menu reach members', async ({ owner, guest, run }) => {
    const channel = await createChannel(
      run.owner,
      run.space.id,
      uniqueText('gecici').replace(' ', '-'),
    );
    await expect(guest.nav.getByRole('button', { name: channel.name, exact: true })).toBeVisible();

    const renamed = uniqueText('adlandirildi').replace(' ', '-');
    await owner.nav.getByRole('button', { name: channel.name, exact: true }).click({
      button: 'right',
    });
    await owner.page.getByRole('menuitem', { name: 'Adını değiştir' }).click();
    const rename = owner.page.getByRole('dialog', { name: 'Kanalı düzenle' });
    await rename.getByRole('textbox', { name: 'Ad' }).fill(renamed);
    await rename.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(guest.nav.getByRole('button', { name: renamed, exact: true })).toBeVisible();

    await owner.nav.getByRole('button', { name: renamed, exact: true }).click({ button: 'right' });
    await owner.page.getByRole('menuitem', { name: 'Kanalı sil' }).click();
    await owner.page
      .getByRole('dialog', { name: 'Kanalı sil?' })
      .getByRole('button', { name: 'Kanalı sil', exact: true })
      .click();
    await expect(guest.nav.getByRole('button', { name: renamed, exact: true })).toHaveCount(0);
    await expect(owner.nav.getByRole('button', { name: renamed, exact: true })).toHaveCount(0);
  });

  test('members without channel management get no create controls', async ({ guest }) => {
    await expect(guest.nav.getByRole('group', { name: 'Sohbetler' })).toBeVisible();
    await expect(guest.nav.getByRole('button', { name: 'Sohbet kanalı oluştur' })).toHaveCount(0);
    await expect(guest.nav.getByRole('button', { name: 'Ses odası oluştur' })).toHaveCount(0);
  });
});
