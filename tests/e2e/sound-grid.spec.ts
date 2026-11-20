import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    spSoundGrid: {
      engine: { isSounding: boolean };
      frame(x: number, y: number, u: number, v: number): void;
    };
  }
}

// The sound grid harness (dev/sound-grid) plays the grid from synthetic frames, no camera.
test.describe('sound grid', () => {
  test('lights the zone movement is in and plays sound when switched on', async ({ page }) => {
    await page.goto('dev/sound-grid/');
    const zones = page.locator('[data-zone]');
    await expect(zones).toHaveCount(9);

    // A blob moving in the camera's top-left shows in the screen's top-right (mirrored).
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.spSoundGrid.frame(0.15, 0.15, 0.8, 0));
      await page.waitForTimeout(30);
    }
    await expect(page.locator('[data-zone="2"]')).toHaveAttribute('data-active', '');
    await expect(page.locator('[data-zone="0"]')).not.toHaveAttribute('data-active', '');

    await page.getByRole('switch', { name: 'Play the grid' }).check();
    await expect.poll(() => page.evaluate(() => window.spSoundGrid.engine.isSounding)).toBe(true);

    await page.getByRole('radio', { name: '4 × 4' }).click();
    await expect(zones).toHaveCount(16);
  });
});
