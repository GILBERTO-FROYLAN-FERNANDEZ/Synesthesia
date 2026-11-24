import { expect, test } from '@playwright/test';

test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
});

test('solo grid controls share the live workspace and can switch back to materials', async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto('./#/perform');
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await page.getByRole('button', { name: /Start Performance/ }).click();
  const enable = page.getByRole('button', { name: 'Enable sound', exact: true });
  await expect(enable).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('[data-zone]')).toHaveCount(9);
  await enable.click();
  await expect(page.getByRole('button', { name: 'Mute sound', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sound settings →' })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Mute sound', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mute sound', exact: true }).click();
  await expect(enable).toBeVisible();
  await expect(page.getByText('Sound: Muted', { exact: true })).toBeVisible();
  await enable.click();
  await expect(page.getByRole('button', { name: 'Mute sound', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Sound', exact: true }).click();
  await page.getByRole('radio', { name: '4 × 4' }).click();
  await expect(page.locator('[data-zone]')).toHaveCount(16);
  await page.getByLabel('Tone', { exact: true }).selectOption('bell');
  await page.getByLabel('Scale', { exact: true }).selectOption('minor');
  await page.getByRole('radio', { name: 'Strike', exact: true }).click();
  await page.getByRole('switch', { name: 'Show sound grid' }).uncheck();
  await expect(page.locator('[data-zone]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mute sound', exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Show sound grid' }).check();
  await page.getByRole('radio', { name: 'Material', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Test sound', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Sound Grid', exact: true }).click();
  await expect(enable).toBeVisible();
  await enable.click();
  await expect(page.getByRole('button', { name: 'Mute sound', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start Recording' }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Stop Performance' }).click();
  await expect(page.getByText('Session Review', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download generated video' })).toBeVisible();
});
