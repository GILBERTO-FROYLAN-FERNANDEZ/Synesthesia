import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';
import { expect, test } from '@playwright/test';

test.use({
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--enable-unsafe-swiftshader',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});

test('live camera recording becomes an editable Library composition', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('./#/perform');
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await expect(page.getByRole('button', { name: /Start Performance/ })).toBeEnabled();
  await page.getByRole('button', { name: /Start Performance/ }).click();
  await expect(page.getByText(/(?:Body|Camera motion) tracking live/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Trail Leave a path/ }).click();
  await expect(page.getByRole('button', { name: /^Trail Leave a path/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Ripple Make waves/ }).click();
  await expect(page.getByRole('button', { name: /^Ripple Make waves/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('radiogroup', { name: 'Material properties' }).getByRole('radio', { name: 'Sound' }).click();
  const viscosity = page.getByRole('group', { name: 'Water sound properties' })
    .getByRole('slider', { name: 'Viscosity' });
  await viscosity.press('ArrowRight');
  const savedViscosity = Number(await viscosity.getAttribute('aria-valuenow'));
  expect(savedViscosity).toBeGreaterThan(0.5);
  await page.getByRole('switch', { name: 'Record original camera separately' }).check();
  await page.getByRole('button', { name: 'Start Recording' }).click();
  await page.waitForTimeout(2_000);
  await page.getByRole('button', { name: 'Stop Performance' }).click();

  await expect(page.getByText('Session Review', { exact: true })).toBeVisible();
  await expect(page.getByText(/real camera-derived frames/)).toBeVisible();
  await page.getByRole('button', { name: 'Save as Composition' }).click();
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();
  const compositions = page.getByRole('list', { name: 'Compositions' });
  await expect(compositions.getByRole('listitem')).toHaveCount(1);
  await page.reload();
  await expect(compositions.getByRole('listitem')).toHaveCount(1);
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Back up everything' }).click();
  const backup = await backupDownload;
  const backupFiles = unzipSync(new Uint8Array(readFileSync(await backup.path())));
  expect(Object.keys(backupFiles).filter((path) => path.startsWith('media/'))).toHaveLength(2);
  await compositions.getByRole('button', { name: /^More actions for / }).click();
  await page.getByRole('menuitem', { name: 'Play generated recording' }).click();
  await expect(page.getByRole('heading', { name: 'Generated performance' })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(1);
  await page.getByRole('button', { name: 'Back to Library' }).click();
  await compositions.getByRole('button', { name: /^Open / }).click();
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await expect(page.getByRole('button', { name: /^Ripple Make waves/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Push Move what's there/ }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByRole('button', { name: /^Push Move what's there/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: 'Sound' }).click();
  await expect(page.getByRole('slider', { name: 'Viscosity', exact: true }))
    .toHaveAttribute('aria-valuenow', String(savedViscosity));
  await expect(page.getByRole('button', { name: 'Source', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.locator('video')).toHaveCount(2);
  expect(errors).toEqual([]);
});
