import { expect, test } from '@playwright/test';

test('new navigation opens Studio and keeps saved work in the Library', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible();

  await page.getByRole('link', { name: 'Studio' }).click();
  await expect(page.getByRole('heading', { name: 'Studio', level: 1 })).toBeVisible();
  await expect(page.getByText('No compositions yet')).toBeVisible();

  await page.getByRole('button', { name: 'Use Sample' }).click();
  await expect(page.getByTestId('save-state')).toHaveText('Not saved yet');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('save-state')).toHaveText('Saved');

  await page.getByRole('link', { name: 'Library' }).click();
  const compositions = page.getByRole('list', { name: 'Compositions' });
  await expect(compositions.getByRole('listitem')).toHaveCount(1);
  await compositions.getByRole('button', { name: /^Open / }).click();
  await expect(page.getByTestId('save-state')).toHaveText('Saved');

  await page.getByRole('link', { name: 'Perform' }).click();
  await expect(page.getByRole('heading', { name: 'Camera Setup' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Perform' })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Collaborate' }).click();
  await expect(page.getByRole('link', { name: 'Collaborate' })).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});

test('pausing Studio leaves the rendered frame uncovered', async ({ page }) => {
  await page.goto('./#/studio');
  await page.getByRole('button', { name: 'Use Sample' }).click();
  await expect(page.locator('[class*="canvasHost"] canvas')).toBeVisible();
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await play.click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.waitForTimeout(650);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(page.locator('[class*="pausedArtwork"]')).toHaveCount(0);
  await expect(page.locator('[class*="pausedMessage"]')).toHaveCount(0);
  const canvas = page.locator('[class*="canvasHost"] canvas');
  await expect(canvas).toBeVisible();
  const pausedFrame = await canvas.screenshot();
  await page.waitForTimeout(350);
  expect(await canvas.screenshot()).toEqual(pausedFrame);
});
