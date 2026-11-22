import { expect, test } from '@playwright/test';

test('live tracking reflects camera position and velocity to match the mirrored preview', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const observed: { flowX: number; flowY: number; centroidX: number }[] = [];
    Object.assign(window, { observedLiveMotion: observed });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener(
          'message',
          ({
            data,
          }: MessageEvent<{
            frame?: { features: { flowX: number; flowY: number; centroidX: number } };
          }>) => {
            if (data.frame?.features) {
              const { flowX, flowY, centroidX } = data.frame.features;
              if (Math.abs(flowX) > 0.01) observed.push({ flowX, flowY, centroidX });
            }
          },
        );
      }
    };
    // A textured patch moves right on the raw camera's left side. In the mirrored
    // preview it must appear on the right and travel left, without vertical motion.
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext('2d')!;
        let start: number | undefined;
        function draw(time: number) {
          start ??= time;
          const x = 20 + ((((time - start) / 1000) * 25) % 70);
          context.fillStyle = '#111';
          context.fillRect(0, 0, 320, 180);
          for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
              context.fillStyle = (col + row) % 2 ? '#eee' : '#777';
              context.fillRect(x + col * 5, 60 + row * 5, 5, 5);
            }
          }
          requestAnimationFrame(draw);
        }
        requestAnimationFrame(draw);
        return Promise.resolve(canvas.captureStream(30));
      },
    });
  });
  await page.goto('./#/studio/live');
  await page.waitForFunction(() => {
    const samples = (window as unknown as { observedLiveMotion: unknown[] }).observedLiveMotion;
    return samples.length >= 8;
  });
  const samples = await page.evaluate(() =>
    (
      window as unknown as {
        observedLiveMotion: { flowX: number; flowY: number; centroidX: number }[];
      }
    ).observedLiveMotion.slice(0, 8),
  );
  expect(samples.filter((frame) => frame.flowX < 0).length).toBeGreaterThanOrEqual(7);
  expect(samples.every((frame) => frame.centroidX > 0.5)).toBe(true);
  expect(
    samples.reduce((sum, frame) => sum + Math.abs(frame.flowY), 0) / samples.length,
  ).toBeLessThan(0.02);
  await expect(page.getByRole('status')).toContainText('Live');
});
