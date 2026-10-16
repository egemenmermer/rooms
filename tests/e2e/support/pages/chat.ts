import { expect, type Locator, type Page } from '@playwright/test';
import type { RoomsClient } from '../client';

/** Text channel conversation: transcript, composer and per-message actions. */
export class ChatView {
  constructor(readonly client: RoomsClient) {}

  get page(): Page {
    return this.client.page;
  }

  get transcript() {
    return this.page.getByRole('log', { name: 'Kanal mesajları' });
  }

  get composer() {
    return this.page.getByRole('textbox', { name: 'Kanala mesaj yaz' });
  }

  async open(channelName: string) {
    await this.client.nav.getByRole('button', { name: channelName, exact: true }).click();
    await expect(this.composer).toBeVisible();
    return this;
  }

  async send(text: string) {
    await this.composer.fill(text);
    await this.composer.press('Enter');
    // Delivered messages lose the pending marker and gain their action row.
    await expect(
      this.message(text).getByRole('button', { name: 'Mesaj seçenekleri' }),
    ).toBeAttached();
  }

  message(text: string): Locator {
    return this.transcript.getByRole('article').filter({ hasText: text });
  }

  async options(text: string) {
    const message = this.message(text);
    await message.hover();
    await message.getByRole('button', { name: 'Mesaj seçenekleri' }).click();
    return this.page.getByRole('dialog', { name: 'Mesaj seçenekleri' });
  }

  async edit(text: string, next: string) {
    const dialog = await this.options(text);
    await dialog.getByRole('button', { name: 'Düzenle', exact: true }).click();
    const editor = this.page.getByRole('textbox', { name: 'Mesajı düzenle' });
    await editor.fill(next);
    await editor.press('Enter');
    await expect(this.message(next)).toContainText('düzenlendi');
  }

  async remove(text: string) {
    const dialog = await this.options(text);
    await dialog.getByRole('button', { name: 'Mesajı sil', exact: true }).click();
    const confirm = this.page.getByRole('dialog', { name: 'Mesajı sil?' });
    await confirm.getByRole('button', { name: 'Mesajı sil', exact: true }).click();
    await expect(this.message(text)).toHaveCount(0);
  }

  /** Adds a reaction through the picker; `label` is the picker name such as "Kalp". */
  async react(text: string, label: string) {
    const message = this.message(text);
    await message.hover();
    await message.getByRole('button', { name: 'Reaksiyon ekle' }).click();
    await this.page
      .getByRole('dialog', { name: 'Bir reaksiyon bırak' })
      .getByRole('button', { name: `${label} reaksiyonunu ekle` })
      .click();
  }

  /** Reaction chip on a message by picker name (e.g. "Kalp") or emoji, with its count. */
  reaction(text: string, label: string, count: number) {
    return this.message(text).getByRole('button', { name: `${label} reaksiyonu · ${count}` });
  }
}
