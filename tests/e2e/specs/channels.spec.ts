import { test, expect } from '../support/fixtures';
import type { RoomsClient } from '../support/client';
import { StoatApi } from '../support/stoat-api';
import { ChatView } from '../support/pages/chat';
import { createChannel, uniqueText } from '../support/seed';

async function createFromSidebar(client: RoomsClient, kind: 'text' | 'voice', name: string) {
  await client.nav
    .getByRole('button', { name: kind === 'text' ? 'Sohbet kanalı oluştur' : 'Ses odası oluştur' })
    .click();
  const dialog = client.page.getByRole('dialog', { name: 'Kanal oluştur' });
  await dialog
    .getByRole('button', { name: kind === 'text' ? /^Metin kanalı/ : /^Ses odası/ })
    .click();
  await dialog.getByRole('textbox', { name: 'Ad' }).fill(name);
  await dialog.getByRole('button', { name: 'Oluştur', exact: true }).click();
  // A save should close the dialog in well under a second, but see the known-defect note
  // below: it intermittently stalls for ~20 s, so functional tests allow 30 s.
  await expect(dialog).toHaveCount(0, { timeout: 30000 });
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

  // Known defect found by this suite (intermittent, so not asserted): creating a channel
  // from the sidebar sometimes keeps the dialog on "Kaydediliyor…" for ~20 s although the
  // channel already exists upstream; other times it closes in ~0.3 s. The ~20 s matches the
  // activity long-poll window (waitMs=20000). See docs/E2E_TESTING.md, "Bulunan hatalar".
  test.fixme('channel creation always closes the dialog within 5 s', async () => {});

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

  test('members are told why channel management is unavailable', async ({ guest }) => {
    await guest.nav.getByRole('button', { name: 'Sohbet kanalı oluştur' }).click();
    const dialog = guest.page.getByRole('dialog', { name: 'Kanal oluştur' });
    await dialog.getByRole('textbox', { name: 'Ad' }).fill('yetkisiz');
    await expect(dialog.getByText('Kanal yönetimi için yetkili olman gerekiyor.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Oluştur', exact: true })).toBeDisabled();
  });
});
