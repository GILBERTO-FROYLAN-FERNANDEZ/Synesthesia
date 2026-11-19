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

test('collaborative camera connects body tracking and keeps manual mapping available', async ({ page }) => {
  test.setTimeout(75_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/collaborative');
  await expect(page.getByRole('heading', { name: 'Collaborative Performance' })).toBeVisible();
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await expect(page.getByText('Body tracking live')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('canvas[aria-label="Live movement-driven collaborative visual"]')).toBeVisible();
  expect(await page.locator('canvas[aria-label="Live movement-driven collaborative visual"]').evaluate(
    (canvas) => (canvas as HTMLCanvasElement).getContext('webgl2')?.isContextLost(),
  )).toBe(false);
  await expect(page.getByText('Live camera response')).toBeVisible();

  await page.getByRole('switch', { name: 'Manual test mode' }).check();
  const center = page.getByRole('group', { name: '3 by 3 sound mapping grid' }).getByRole('button', { name: '5 Pulse' });
  await expect(center).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Activate selected region' }).click();
  await expect(center).toHaveAttribute('data-active', '');
  await expect(page.getByLabel('Manual response in Center')).toBeVisible();

  await page.getByRole('button', { name: 'Stop Performance' }).click();
  await expect(page.getByRole('heading', { name: 'Session Summary' })).toBeVisible();
  await expect(page.locator('video')).toHaveJSProperty('srcObject', null);
  expect(errors).toEqual([]);
});

test('live movement activates its mapped sound region independently of selection', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    function makeWorker(url: string | URL, options?: WorkerOptions): Worker {
      if (!String(url).includes('liveBodyTracking.worker')) return new NativeWorker(url, options);
      const worker = {
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null,
        postMessage() {
          const cols = 16;
          const rows = 9;
          const field = new Float32Array(cols * rows * 2);
          for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 5; col++) field[(row * cols + col) * 2] = 0.08;
          }
          const features = {
            energy: 0.08, peak: 0.08, flowX: 0.08, flowY: 0, direction: 0,
            coherence: 0, divergence: 0, curl: 0, acceleration: 0, surge: 0,
            jerk: 0, continuity: 1, density: 0.1, centroidX: 0.15,
            centroidY: 0.15, spread: 0,
          };
          window.setTimeout(() => worker.onmessage?.(new MessageEvent('message', {
            data: { frame: { t: 0, cols, rows, field, features, normalized: features, inTail: false } },
          })), 0);
        },
        terminate() {},
      };
      return worker as unknown as Worker;
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: makeWorker });
  });
  await page.goto('./#/collaborative');
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  const grid = page.getByRole('group', { name: '3 by 3 sound mapping grid' });
  const topLeft = grid.getByRole('button', { name: '1 Water' });
  const center = grid.getByRole('button', { name: '5 Pulse' });
  await expect(topLeft).toHaveAttribute('data-active', '', { timeout: 15_000 });
  await expect(center).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Top left · Water')).toBeVisible();
  await expect(page.getByLabel('Live movement response in Top left')).toBeVisible();
});
