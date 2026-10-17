import { test, expect } from '../support/fixtures';
import { ChatView } from '../support/pages/chat';
import { uniqueText } from '../support/seed';

test.describe('community text chat between two real clients', () => {
  test('messages arrive live in both directions', async ({ owner, guest, run }) => {
    const ownerChat = await new ChatView(owner).open(run.channels.text.name);
    const guestChat = await new ChatView(guest).open(run.channels.text.name);

    const hello = uniqueText('Sahipten merhaba');
    await ownerChat.send(hello);
    await expect(guestChat.message(hello)).toBeVisible();

    const reply = uniqueText('Misafirden yanıt');
    await guestChat.send(reply);
    await expect(ownerChat.message(reply)).toBeVisible();
    await expect(ownerChat.message(reply)).toContainText(run.guest.username);
  });

  test('edit and delete propagate to the other member', async ({ owner, guest, run }) => {
    const ownerChat = await new ChatView(owner).open(run.channels.text.name);
    const guestChat = await new ChatView(guest).open(run.channels.text.name);
    const original = uniqueText('Düzenlenecek');
    await ownerChat.send(original);
    await expect(guestChat.message(original)).toBeVisible();

    const edited = uniqueText('Düzenlendi');
    await ownerChat.edit(original, edited);
    await expect(guestChat.message(edited)).toContainText('düzenlendi');
    await expect(guestChat.message(original)).toHaveCount(0);

    await ownerChat.remove(edited);
    await expect(guestChat.message(edited)).toHaveCount(0);
  });

  test('a member cannot delete someone else’s message', async ({ owner, guest, run }) => {
    const ownerChat = await new ChatView(owner).open(run.channels.text.name);
    const guestChat = await new ChatView(guest).open(run.channels.text.name);
    const text = uniqueText('Sahibin mesajı');
    await ownerChat.send(text);
    const dialog = await guestChat.options(text);
    await expect(dialog.getByRole('button', { name: 'Mesajı sil', exact: true })).toBeDisabled();
  });

  test('reactions are shared and counted', async ({ owner, guest, run }) => {
    // Known defect found by this suite: the picker sends codepoint ids such as "2764", the
    // adapter only accepts [A-Za-z0-9_-], and Stoat v0.15.5 answers 400 InvalidOperation
    // unless it receives the emoji itself. Remove `test.fail` once reactions are fixed.
    test.fail(true, 'Stoat rejects codepoint reaction ids (400 InvalidOperation).');
    const ownerChat = await new ChatView(owner).open(run.channels.text.name);
    const guestChat = await new ChatView(guest).open(run.channels.text.name);
    const text = uniqueText('Reaksiyon bekliyor');
    await ownerChat.send(text);
    await expect(guestChat.message(text)).toBeVisible();

    await guestChat.react(text, 'Kalp');
    await expect(ownerChat.reaction(text, '2764', 1)).toBeVisible();
    await ownerChat.reaction(text, '2764', 1).click();
    await expect(guestChat.reaction(text, '2764', 2)).toBeVisible();
    await expect(ownerChat.reaction(text, '2764', 2)).toHaveAttribute('aria-pressed', 'true');
  });

  test('history survives an app restart', async ({ clients, owner, run }) => {
    const chat = await new ChatView(owner).open(run.channels.text.name);
    const text = uniqueText('Kalıcı mesaj');
    await chat.send(text);

    const reopened = await clients.restart(owner);
    await expect(reopened.nav).toBeVisible({ timeout: 30000 });
    const again = await new ChatView(reopened).open(run.channels.text.name);
    await expect(again.message(text)).toBeVisible();
  });
});
