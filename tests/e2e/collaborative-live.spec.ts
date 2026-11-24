import { expect, test } from '@playwright/test';

for (const route of ['/collaborative', '/collaborative/example-composition']) {
  test(`collaboration is a read-only preview at ${route}`, async ({ page }) => {
    await page.addInitScript(() => {
      const scope = window as unknown as { mediaRequests: number; audioContexts: number };
      scope.mediaRequests = 0;
      scope.audioContexts = 0;
      const nativeGet = navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);
      if (nativeGet) navigator.mediaDevices.getUserMedia = (constraints) => {
        scope.mediaRequests++;
        return nativeGet(constraints);
      };
      const NativeAudio = window.AudioContext;
      window.AudioContext = class extends NativeAudio {
        constructor(options?: AudioContextOptions) { super(options); scope.audioContexts++; }
      };
    });
    await page.goto(`./#${route}`);
    await expect(page.getByRole('heading', { name: 'Collaborative Performance' })).toBeVisible();
    await expect(page.getByText('Under development', { exact: true })).toBeVisible();
    await expect(page.getByText('Concept demo', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').locator('button, input, select, video, canvas')).toHaveCount(0);
    expect(await page.evaluate(() => {
      const scope = window as unknown as { mediaRequests: number; audioContexts: number };
      return [scope.mediaRequests, scope.audioContexts];
    })).toEqual([0, 0]);
    await page.getByRole('link', { name: 'Go to Solo Performance' }).click();
    await expect(page).toHaveURL(/#\/perform$/);
  });
}
