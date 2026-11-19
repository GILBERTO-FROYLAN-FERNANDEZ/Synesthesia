import { expect, test } from '@playwright/test';

test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test('live body tracking initializes with the local model', async ({ page }) => {
  test.setTimeout(60_000);
  const messages: string[] = [];
  page.on('console', (message) => { if (message.type() === 'warning' || message.type() === 'error') messages.push(message.text()); });
  page.on('pageerror', (error) => messages.push(error.message));
  await page.goto('./#/perform');
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await page.getByRole('button', { name: /Start Performance/ }).click();
  await expect(page.getByText(/(?:Body|Camera motion) tracking live/)).toBeVisible();
  await expect(page.getByText(/Body-segmented optical flow/)).toBeVisible({ timeout: 20_000 });
  expect(await page.locator('canvas[aria-label="Motion-driven generated visual"]').evaluate(
    (canvas) => (canvas as HTMLCanvasElement).getContext('webgl2')?.isContextLost(),
  )).toBe(false);
  await page.getByRole('button', { name: 'Start Recording' }).click();
  await page.waitForTimeout(1_500);
  await page.getByRole('button', { name: 'Stop Performance' }).click();
  await expect(page.getByText('Session Review', { exact: true })).toBeVisible();
  expect(messages.filter((message) => message.includes('Body tracking unavailable'))).toEqual([]);
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
  await expect(page.getByText(/Showing Descending bubbles instead/)).toBeVisible();
  await expect(page.locator('select').first()).toHaveValue('bubbles');
  await expect(page.locator('canvas[aria-label="Motion-driven generated visual"]')).toBeVisible();
});

test('live sound stays gated at 0–2% camera energy and resumes on deliberate movement', async ({ page }) => {
  await page.addInitScript(() => {
    const scope = window as unknown as { testMotionEnergy: number; activityGain?: GainNode };
    scope.testMotionEnergy = 0.004;
    const nativeConnect = Reflect.get(GainNode.prototype, 'connect') as
      (this: GainNode, destination: AudioNode) => AudioNode;
    Object.defineProperty(GainNode.prototype, 'connect', {
      value: function (this: GainNode, destination: AudioNode) {
        if (destination instanceof MediaStreamAudioDestinationNode) scope.activityGain = this;
        return nativeConnect.call(this, destination);
      },
    });
    const NativeWorker = window.Worker;
    function makeWorker(url: string | URL, options?: WorkerOptions): Worker {
      if (!String(url).includes('liveBodyTracking.worker')) return new NativeWorker(url, options);
      let closed = false;
      const worker = {
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null,
        postMessage() {
          window.setTimeout(() => {
            if (closed) return;
            const energy = scope.testMotionEnergy;
            const field = new Float32Array(16 * 9 * 2);
            field[0] = energy;
            const features = {
              energy, peak: energy, flowX: 0, flowY: 0, direction: 0,
              coherence: 0, divergence: 0, curl: 0, acceleration: 0, surge: 0,
              jerk: 0, continuity: 1, density: 0.1, centroidX: 0.5,
              centroidY: 0.5, spread: 0,
            };
            worker.onmessage?.(new MessageEvent('message', {
              data: { frame: { t: 0, cols: 16, rows: 9, field, features,
                normalized: { ...features, energy: 1 }, inTail: false } },
            }));
          }, 0);
        },
        terminate() { closed = true; },
      };
      return worker as unknown as Worker;
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: makeWorker });
  });
  await page.goto('./#/perform');
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await page.getByRole('button', { name: /Start Performance/ }).click();
  await expect(page.getByText('Sound response: Waiting for movement')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { activityGain?: GainNode }).activityGain?.gain.value)).toBe(0);

  await page.evaluate(() => { (window as unknown as { testMotionEnergy: number }).testMotionEnergy = 0.03; });
  await expect(page.getByText('Sound response: Active')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { activityGain?: GainNode }).activityGain?.gain.value ?? 0,
  )).toBeGreaterThan(0.9);

  await page.evaluate(() => { (window as unknown as { testMotionEnergy: number }).testMotionEnergy = 0.004; });
  await expect(page.getByText('Sound response: Waiting for movement')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { activityGain?: GainNode }).activityGain?.gain.value ?? 1,
  )).toBeLessThan(0.01);
});
