import { test, expect } from '../support/fixtures';

test.describe('local preferences', () => {
  test('appearance changes need an explicit save and persist across restart', async ({
    clients,
    owner,
  }) => {
    await owner.goto('/settings?tab=appearance');
    const page = owner.page;
    await page.getByRole('button', { name: 'Kompakt', exact: true }).click();
    const unsaved = page.getByRole('region', { name: 'Kaydedilmemiş ayarlar' });
    await expect(unsaved).toBeVisible();
    await unsaved.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(unsaved).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kompakt', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const reopened = await clients.restart(owner);
    await expect(reopened.nav).toBeVisible({ timeout: 30000 });
    await reopened.goto('/settings?tab=appearance');
    await expect(
      reopened.page.getByRole('button', { name: 'Kompakt', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('discarding unsaved changes restores the previous value', async ({ owner }) => {
    await owner.goto('/settings?tab=appearance');
    const page = owner.page;
    const reduce = page.getByRole('switch', { name: 'Hareketi azalt', exact: true });
    const before = await reduce.getAttribute('aria-checked');
    await reduce.click();
    await page.getByRole('button', { name: 'Vazgeç', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Kaydedilmemiş ayarlar' })).toHaveCount(0);
    await expect(reduce).toHaveAttribute('aria-checked', before ?? 'false');
  });
});
