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
  await expect(page.getByRole('link', { name: 'Collaborate' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(errors).toEqual([]);
});

test('Prepare live motion opens the redesigned Perform setup', async ({ page }) => {
  await page.goto('./#/prepare');
  await page.getByRole('button', { name: 'Start Live Motion' }).click();
  await expect(page).toHaveURL(/#\/perform$/);
  await expect(page.getByRole('heading', { name: 'Camera Setup' })).toBeVisible();
});

test('Prepare source chooser keeps three actions and a compact Guide link', async ({ page }) => {
  await page.goto('./#/prepare');
  await expect(page.getByRole('heading', { name: 'Choose a movement source' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prepare', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Guide: Making a signature (Prepare)' }),
  ).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Prepare' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose a clip…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use Webcam' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Live Motion' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Start Live Motion' })).toBeVisible();
});

test('Studio shows its actual first frame and explains unavailable source views', async ({
  page,
}) => {
  await page.goto('./#/studio');
  await page.getByRole('button', { name: 'Use Sample' }).click();
  const canvas = page.getByRole('img', { name: 'The wake' });
  await expect(canvas).toBeVisible();
  await expect(page.getByText('Getting to know this computer…')).toBeHidden();
  await expect(page.locator('[class*="pausedArtwork"]')).toHaveCount(0);
  await expect(page.locator('[class*="pausedMessage"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Original' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Compare', exact: true })).toBeDisabled();
  await expect(page.getByText('Original video not saved')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Result' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('Studio movement panel closes and reopens with a width transition', async ({ page }) => {
  await page.goto('./#/studio');
  await page.getByRole('button', { name: 'Use Sample' }).click();
  await expect(page.getByRole('button', { name: 'Collapse Movement Source' })).toBeVisible();
  const panel = page.getByRole('complementary', { name: 'Movement Source' });
  const transitionSeconds = await panel
    .locator('..')
    .evaluate((grid) => parseFloat(getComputedStyle(grid).transitionDuration));
  expect(transitionSeconds).toBeGreaterThan(0);
  const widthBefore = (await panel.boundingBox())?.width ?? 0;
  await page.getByRole('button', { name: 'Collapse Movement Source' }).click();
  await expect(page.getByRole('button', { name: 'Expand Movement Source' })).toBeVisible();
  await expect.poll(async () => (await panel.boundingBox())?.width ?? 0).toBeLessThan(60);
  await page.getByRole('button', { name: 'Expand Movement Source' }).click();
  await expect
    .poll(async () => (await panel.boundingBox())?.width ?? 0)
    .toBeGreaterThan(widthBefore - 2);
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
