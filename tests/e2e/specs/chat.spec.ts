import { test, expect } from '../support/fixtures';
import { ChatView } from '../support/pages/chat';
import { uniqueText } from '../support/seed';
import { StoatApi } from '../support/stoat-api';

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
    const ownerChat = await new ChatView(owner).open(run.channels.text.name);
    const guestChat = await new ChatView(guest).open(run.channels.text.name);
    const text = uniqueText('Reaksiyon bekliyor');
    await ownerChat.send(text);
    await expect(guestChat.message(text)).toBeVisible();

    await guestChat.react(text, 'Kalp');
    await expect(ownerChat.reaction(text, 'Kalp', 1)).toBeVisible();
    await ownerChat.reaction(text, 'Kalp', 1).click();
    await expect(guestChat.reaction(text, 'Kalp', 2)).toBeVisible();
    await expect(ownerChat.reaction(text, 'Kalp', 2)).toHaveAttribute('aria-pressed', 'true');

    // Upstream stores the emoji itself, so other Stoat clients count the same reaction.
    const messages = await new StoatApi(run.owner.token).request<
      { content?: string; reactions?: Record<string, string[]> }[]
    >(`/channels/${run.channels.text.id}/messages?limit=20`);
    const stored = messages.find((message) => message.content === text);
    expect(Object.keys(stored?.reactions ?? {})).toEqual(['\u2764\ufe0f']);
    expect(stored?.reactions?.['\u2764\ufe0f']?.sort()).toEqual(
      [run.owner.userId, run.guest.userId].sort(),
    );
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
