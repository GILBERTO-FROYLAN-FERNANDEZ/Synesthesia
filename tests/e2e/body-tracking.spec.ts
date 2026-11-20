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
  await expect(page.getByText('Body tracking', { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await page.locator('canvas[aria-label="Motion-driven generated visual"]').evaluate(
    (canvas) => (canvas as HTMLCanvasElement).getContext('webgl2')?.isContextLost(),
  )).toBe(false);
  await page.getByRole('button', { name: 'Start Recording' }).click();
  await page.waitForTimeout(1_500);
  await page.getByRole('button', { name: 'Stop Performance' }).click();
  await expect(page.getByText('Session Review', { exact: true })).toBeVisible();
  expect(messages.filter((message) => message.includes('Body tracking unavailable'))).toEqual([]);
});

test('body tracking failure is visible while camera motion keeps running', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    class FailingBodyWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror = null;
      postMessage() {
        window.setTimeout(() => {
          this.onmessage?.(new MessageEvent('message', {
            data: { error: true, msg: 'Test body model unavailable.' },
          }));
        }, 0);
      }
      terminate() {}
    }
    Object.defineProperty(window, 'Worker', {
      configurable: true,
      value: function (url: string | URL, options?: WorkerOptions) {
        return String(url).includes('liveBodyTracking.worker')
          ? new FailingBodyWorker()
          : new NativeWorker(url, options);
      },
    });
  });
  await page.goto('./#/perform');
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await page.getByRole('button', { name: /Start Performance/ }).click();
  await expect(page.getByRole('alert')).toContainText('Body tracking unavailable: Test body model unavailable.');
  await expect(page.getByText('Camera fallback', { exact: true })).toBeVisible();
  await expect(page.getByText('Camera motion tracking live')).toBeVisible();
});

test('body tracking switch changes the live tracker without stopping camera motion', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./#/perform');
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await page.getByRole('switch', { name: 'Use body tracking' }).uncheck();
  await page.getByRole('button', { name: /Start Performance/ }).click();
  await expect(page.getByText('Camera motion', { exact: true })).toBeVisible();
  const zones = page.locator('[data-active-region]');
  await expect(zones).toBeVisible();
  await page.getByRole('switch', { name: 'Show movement zones' }).uncheck();
  await expect(zones).toHaveCount(0);
  await page.getByRole('switch', { name: 'Use body tracking' }).check();
  await expect(page.getByText('Body tracking', { exact: true })).toBeVisible({ timeout: 25_000 });
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
  await page.getByRole('radiogroup', { name: 'Material properties' }).getByRole('radio', { name: 'Visual' }).click();
  await expect(page.getByRole('button', { name: 'Visual Descending bubbles' })).toBeVisible();
  await expect(page.locator('canvas[aria-label="Motion-driven generated visual"]')).toBeVisible();
});

test('visual controls are visible by default and the inspector gives space back to the stage', async ({ page }) => {
  await page.goto('./#/perform');
  await expect(page.getByLabel('Visual Material').locator('option')).toHaveCount(5);
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await page.getByRole('button', { name: /Start Performance/ }).click();
  await expect(page.getByRole('heading', { name: 'Visual material' })).toBeVisible();
  await page.getByRole('button', { name: 'Visual Water' }).click();
  await expect(page.getByRole('listbox', { name: 'Visual material' }).getByRole('option')).toHaveCount(5);
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
  await expect(page.getByRole('heading', { name: 'Visual material' })).toHaveCount(0);
  await expect.poll(async () => (await stage.boundingBox())?.width ?? 0).toBeGreaterThan(before + 100);
  await page.getByRole('button', { name: 'Show visual controls' }).click();
  await expect(page.getByRole('heading', { name: 'Visual material' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Brightness' })).toHaveAttribute('aria-valuenow', '0.51');
});

test('sound material edits can be auditioned while the performer is still', async ({ page }) => {
  await page.goto('./#/perform');
  await page.getByRole('button', { name: 'Enable Camera' }).click();
  await page.getByRole('button', { name: /Start Performance/ }).click();
  await page.getByRole('radiogroup', { name: 'Material properties' }).getByRole('radio', { name: 'Sound' }).click();
  const intensity = page.getByRole('group', { name: 'Water sound properties' }).getByRole('slider', { name: 'Intensity' });
  await intensity.focus();
  await intensity.press('ArrowRight');
  await expect(intensity).toHaveAttribute('aria-valuenow', '0.51');
  await page.getByRole('button', { name: 'Test sound' }).click();
  await expect(page.getByRole('button', { name: 'Stop test' })).toBeVisible();
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
            for (let row = 0; row < 3; row++) {
              for (let col = 0; col < 5; col++) field[(row * 16 + col) * 2] = energy;
            }
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
  await expect(page.getByText('Sound: Waiting')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { activityGain?: GainNode }).activityGain?.gain.value)).toBe(0);

  await page.evaluate(() => { (window as unknown as { testMotionEnergy: number }).testMotionEnergy = 0.03; });
  await expect(page.getByText('Sound: Active')).toBeVisible();
  await expect(page.locator('[data-active-region]')).toHaveAttribute('data-active-region', '0');
  await expect(page.getByText('Active zone: Top left')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { activityGain?: GainNode }).activityGain?.gain.value ?? 0,
  )).toBeGreaterThan(0.9);

  await page.evaluate(() => { (window as unknown as { testMotionEnergy: number }).testMotionEnergy = 0.004; });
  await expect(page.getByText('Sound: Waiting')).toBeVisible();
  await expect(page.locator('[data-active-region]')).toHaveAttribute('data-active-region', 'none');
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { activityGain?: GainNode }).activityGain?.gain.value ?? 1,
  )).toBeLessThan(0.01);
});
