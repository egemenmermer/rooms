import { test, expect } from '../support/fixtures';
import { ChatView } from '../support/pages/chat';
import { joinSpace, provisionAccount, uniqueText } from '../support/seed';
import { userTag } from '../support/stoat-api';

test.describe('friends and private messages', () => {
  test('a friend request is accepted and the pair can exchange DMs', async ({ clients, run }) => {
    // Fresh accounts: relationships must not leak between tests or runs.
    const alice = await provisionAccount(run.runId, 'alice');
    const bob = await provisionAccount(run.runId, 'bob');
    const aliceApp = await clients.signedIn('alice', alice);
    const bobApp = await clients.signedIn('bob', bob);

    await aliceApp.goto('/friends');
    await aliceApp.page
      .getByRole('main')
      .getByRole('button', { name: 'Arkadaş ekle' })
      .first()
      .click();
    const add = aliceApp.page.getByRole('dialog', { name: 'Arkadaş ekle' });
    await add.getByRole('textbox', { name: 'Kullanıcı adı' }).fill(userTag(bob));
    await add.getByRole('button', { name: 'İstek gönder' }).click();

    await bobApp.goto('/friends');
    await bobApp.page.getByRole('tab', { name: /^İstekler · 1/ }).click();
    const request = bobApp.page.getByRole('main').getByText(alice.username).first();
    await expect(request).toBeVisible();
    await bobApp.page.getByRole('main').getByRole('button', { name: /Kabul/ }).first().click();
    await bobApp.page.getByRole('tab', { name: /^Tümü/ }).click();
    await expect(bobApp.page.getByRole('main').getByText(alice.username).first()).toBeVisible();

    await aliceApp.page.getByRole('tab', { name: /^Tümü/ }).click();
    await expect(aliceApp.page.getByRole('tab', { name: 'Tümü · 1' })).toBeVisible();

    await aliceApp.nav.getByRole('button', { name: 'Mesajlar', exact: true }).click();
    await aliceApp.page.getByRole('button', { name: 'Yeni özel mesaj' }).click();
    const picker = aliceApp.page.getByRole('dialog', { name: 'Yeni özel mesaj' });
    await picker.getByRole('textbox', { name: 'Kişi ara' }).fill(bob.username);
    await picker
      .getByRole('button', { name: new RegExp(bob.username) })
      .first()
      .click();

    await aliceApp.page
      .getByRole('main')
      .getByRole('button', { name: new RegExp(`^${bob.username}`) })
      .click();
    const text = uniqueText('Özel merhaba');
    const aliceChat = new ChatView(aliceApp);
    await expect(aliceChat.composer).toBeVisible();
    await aliceChat.send(text);

    await bobApp.nav.getByRole('button', { name: 'Mesajlar', exact: true }).click();
    await bobApp.page
      .getByRole('main')
      .getByRole('button', { name: new RegExp(`^${alice.username}`) })
      .first()
      .click();
    await expect(new ChatView(bobApp).message(text)).toBeVisible();
  });

  test('private messages to a non-friend explain the friendship rule', async ({ clients, run }) => {
    const carol = await provisionAccount(run.runId, 'carol');
    await joinSpace(carol, run.space.inviteCode);
    const carolApp = await clients.signedIn('carol', carol);
    await carolApp.nav.getByRole('button', { name: 'Mesajlar', exact: true }).click();
    await carolApp.page.getByRole('button', { name: 'Yeni özel mesaj' }).click();
    const picker = carolApp.page.getByRole('dialog', { name: 'Yeni özel mesaj' });
    await picker.getByRole('textbox', { name: 'Kişi ara' }).fill(run.owner.username);
    await picker
      .getByRole('button', { name: new RegExp(run.owner.username) })
      .first()
      .click();
    const rule = carolApp.page.getByRole('dialog', { name: 'Önce arkadaş olun' });
    await expect(rule).toContainText('önce arkadaş olmanız gerekiyor');
    await expect(rule.getByRole('button', { name: 'Arkadaşlık isteği gönder' })).toBeEnabled();
  });
});
