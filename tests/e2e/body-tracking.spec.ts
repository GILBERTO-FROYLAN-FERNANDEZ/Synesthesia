import { expect, test } from '@playwright/test';

test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test('solo uses full-frame motion tracking without a pose-model worker', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const scope = window as unknown as { poseWorkers: number };
    scope.poseWorkers = 0;
    Object.defineProperty(window, 'Worker', { configurable: true, value: function (url: string | URL, options?: WorkerOptions) {
      if (String(url).includes('liveBodyTracking.worker')) scope.poseWorkers++;
      return new NativeWorker(url, options);
    } });
  });
  await page.goto('./#/perform');
  await expect(page.getByText('Full frame', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await page.getByRole('button', { name: /Start Performance/ }).click();
  await expect(page.getByText('Motion tracking live', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('switch', { name: 'Use body tracking' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { poseWorkers: number }).poseWorkers)).toBe(0);
  expect(await page.locator('canvas[aria-label="Motion-driven generated visual"]').evaluate(
    (canvas) => (canvas as HTMLCanvasElement).getContext('webgl2')?.isContextLost(),
  )).toBe(false);
  await page.getByRole('button', { name: 'Start Recording' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Stop Performance' }).click();
  await expect(page.getByText('Session Review', { exact: true })).toBeVisible();
});

test('movement-zone visibility does not change the full-frame tracker', async ({ page }) => {
  await page.goto('./#/perform');
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await page.getByRole('button', { name: /Start Performance/ }).click();
  await expect(page.getByText('Motion tracking live', { exact: true })).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Material properties' }).getByRole('radio', { name: 'Sound' }).click();
  await page.getByRole('radiogroup', { name: 'Sound source' }).getByRole('radio', { name: 'Material', exact: true }).click();
  const zones = page.locator('[data-active-region]');
  await expect(zones).toBeVisible();
  await page.getByRole('switch', { name: 'Show movement zones' }).uncheck();
  await expect(zones).toHaveCount(0);
  await expect(page.getByText('Motion tracking live', { exact: true })).toBeVisible();
});

test('unsupported float textures select a compatible live visual', async ({ page }) => {
  await page.goto('./#/perform');
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await expect(page.getByRole('button', { name: /Start Performance/ })).toBeEnabled();
  await page.evaluate(() => {
    WebGL2RenderingContext.prototype.checkFramebufferStatus = function () {
      return this.FRAMEBUFFER_INCOMPLETE_ATTACHMENT;
    };
  });
  await page.getByRole('button', { name: /Start Performance/ }).click();
  await expect(page.getByText(/Showing Bubbles instead/)).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Material properties' }).getByRole('radio', { name: 'Visual' }).click();
  await expect(page.getByRole('button', { name: 'Visual Bubbles' })).toBeVisible();
  await expect(page.locator('canvas[aria-label="Motion-driven generated visual"]')).toBeVisible();
});

test('visual controls are visible by default and the inspector gives space back to the stage', async ({ page }) => {
  await page.goto('./#/perform');
  await expect(page.getByLabel('Visual Material').locator('option')).toHaveCount(6);
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await page.getByRole('button', { name: /Start Performance/ }).click();
  await expect(page.getByRole('heading', { name: 'Visual material' })).toBeVisible();
  await page.getByRole('button', { name: 'Visual Water' }).click();
  await expect(page.getByRole('listbox', { name: 'Visual material' }).getByRole('option')).toHaveCount(6);
  await expect(page.getByRole('listbox', { name: 'Visual material' }).getByText(/Colored water seen from below/)).toBeVisible();
  await page.getByRole('listbox', { name: 'Visual material' }).getByRole('option', { name: /Filaments/ }).click();
  await expect(page.getByRole('button', { name: 'Visual Filaments' })).toBeVisible();
  await page.getByRole('button', { name: 'Visual Filaments' }).click();
  await page.getByRole('listbox', { name: 'Visual material' }).getByRole('option', { name: /^Water\b/ }).click();
  const stage = page.locator('canvas[aria-label="Motion-driven generated visual"]');
  const before = (await stage.boundingBox())?.width ?? 0;
  const brightness = page.getByRole('group', { name: 'Water visual properties' }).getByRole('slider', { name: 'Brightness' });
  await brightness.focus();
  await brightness.press('ArrowRight');
  await expect(brightness).toHaveAttribute('aria-valuenow', '0.51');
  await page.getByRole('button', { name: 'Hide material controls' }).click();
  await expect(page.getByRole('heading', { name: 'Visual material' })).not.toBeVisible();
  await expect.poll(async () => (await stage.boundingBox())?.width ?? 0).toBeGreaterThan(before + 100);
  await page.getByRole('button', { name: 'Show controls' }).click();
  await expect(page.getByRole('heading', { name: 'Visual material' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Brightness' })).toHaveAttribute('aria-valuenow', '0.51');
});

test('sound material edits can be auditioned while the performer is still', async ({ page }) => {
  await page.goto('./#/perform');
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await page.getByRole('button', { name: /Start Performance/ }).click();
  await page.getByRole('radiogroup', { name: 'Material properties' }).getByRole('radio', { name: 'Sound' }).click();
  await page.getByRole('radiogroup', { name: 'Sound source' }).getByRole('radio', { name: 'Material', exact: true }).click();
  const intensity = page.getByRole('group', { name: 'Water sound properties' }).getByRole('slider', { name: 'Intensity' });
  await intensity.focus();
  await intensity.press('ArrowRight');
  await expect(intensity).toHaveAttribute('aria-valuenow', '0.51');
  await page.getByRole('button', { name: 'Test sound' }).click();
  await expect(page.getByRole('button', { name: 'Stop test' })).toBeVisible();
});

test('material sound remains quiet for a static camera frame and responds to non-human motion', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const scope = window as unknown as { testMoving: boolean };
    scope.testMoving = false;
    let shift = 0;
    const original = CanvasRenderingContext2D.prototype.getImageData;
    // Supply a synthetic textured image to the full-frame 160 × 90 motion sampler.
    CanvasRenderingContext2D.prototype.getImageData = function (x, y, width, height, settings?) {
      if (x !== 0 || y !== 0 || width !== 160 || height !== 90 || this.canvas.width !== 160 || this.canvas.height !== 90) {
        return original.call(this, x, y, width, height, settings);
      }
      if (scope.testMoving) shift++;
      const image = this.createImageData(width, height);
      for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
        const i = (row * width + col) * 4;
        const value = ((Math.imul(col - shift, 73856093) ^ Math.imul(row, 19349663)) >>> 8) & 255;
        image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
        image.data[i + 3] = 255;
      }
      return image;
    };
  });
  await page.goto('./#/perform');
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await page.getByRole('button', { name: /Start Performance/ }).click();
  await expect(page.getByText('Motion tracking live', { exact: true })).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Material properties' }).getByRole('radio', { name: 'Sound' }).click();
  await page.getByRole('radiogroup', { name: 'Sound source' }).getByRole('radio', { name: 'Material', exact: true }).click();
  await expect(page.getByText('Sound: Waiting')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { testMoving: boolean }).testMoving = true; });
  await expect(page.getByText('Sound: Active')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { testMoving: boolean }).testMoving = false; });
  await expect(page.getByText('Sound: Waiting')).toBeVisible();
});
