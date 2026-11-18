import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
type WarpApi = {
  spVisual: {
    ready: boolean;
    renderStats(o: unknown): Promise<{ litFraction: number; meanLuma: number; hash: string }>;
    renderImage(o: unknown): Promise<string>;
  };
};
for (const materialId of ['warp-colors', 'warp-grass', 'warp-bubbles']) {
  test(`${materialId} deforms and recovers repeatably`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./dev/materials/?autoplay=0');
    await page.waitForFunction(() => Boolean((window as unknown as WarpApi).spVisual?.ready));
    const base = {
      materialId,
      mapping: 'warping',
      kind: 'sweep',
      steps: 85,
      seed: 7,
      width: 640,
      height: 360,
      quality: 'standard',
    };
    const stats = (opts: typeof base) =>
      page.evaluate((o) => (window as unknown as WarpApi).spVisual.renderStats(o), opts);
    const moving = await stats(base),
      still = await stats({ ...base, kind: 'still' });
    expect(moving.litFraction).toBeGreaterThan(0.005);
    expect(moving.hash).not.toBe(still.hash);
    expect((await stats(base)).hash).toBe(moving.hash);
    expect((await stats({ ...base, seed: 8 })).hash).not.toBe(moving.hash);
    const recovered = await stats({ ...base, steps: 600 });
    if (materialId !== 'warp-bubbles')
      expect(Math.abs(recovered.meanLuma - still.meanLuma)).toBeLessThan(0.002);
    else expect(recovered.litFraction).toBeGreaterThan(0.005);
    const image = await page.evaluate(
      (o) => (window as unknown as WarpApi).spVisual.renderImage(o),
      base,
    );
    await writeFile(
      info.outputPath(`${materialId}.png`),
      Buffer.from(image.split(',')[1], 'base64'),
    );
    expect(errors).toEqual([]);
  });
}
test('Warping has its own scenes and switches back to the standard mediums', async ({ page }) => {
  await page.goto('./#/studio/live');
  const mapping = page.getByRole('radiogroup', { name: 'Visual mapping' });
  await mapping.getByRole('radio', { name: 'Warping', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Visual Color field/ })).toBeVisible();
  for (const name of ['Grass', 'Falling bubbles', 'Color field']) {
    await page.getByRole('button', { name: /^Visual / }).click();
    await expect(page.getByRole('option', { name: /^Water/ })).toHaveCount(0);
    await expect(page.getByRole('option', { name: /^Honey/ })).toHaveCount(0);
    await page.getByRole('option', { name: new RegExp(`^${name}`) }).click();
  }
  await mapping.getByRole('radio', { name: 'Ripples', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Visual Water/ })).toBeVisible();
  await page.getByRole('button', { name: /^Visual / }).click();
  await expect(page.getByRole('option', { name: /^Grass/ })).toHaveCount(0);
});

test('Warping exports visible video and preserves mapping and width in the composition file', async ({
  page,
}) => {
  await page.goto('./dev/render/');
  type RenderApi = {
    spRender: {
      ready: boolean;
      renderToBytes(options: {
        visual: string;
        mapping: 'warping';
        seconds: number;
        width: number;
        height: number;
        quality: 'draft';
        sidecar: boolean;
        props: { visual: { size: number; brightness: number } };
        mute: { sound: boolean };
      }): Promise<{
        ok: boolean;
        base64: string;
        error: unknown;
        result: { sidecarText: string; frameCount: number };
      }>;
    };
  };
  await page.waitForFunction(() => (window as unknown as RenderApi).spRender?.ready);
  const result = await page.evaluate(async () => {
    const rendered = await (window as unknown as RenderApi).spRender.renderToBytes({
      visual: 'warp-colors',
      mapping: 'warping',
      seconds: 2.2,
      width: 320,
      height: 180,
      quality: 'draft',
      sidecar: true,
      props: { visual: { size: 0.75, brightness: 0.8 } },
      mute: { sound: true },
    });
    if (!rendered.ok) return { ok: false, error: rendered.error, lit: 0, sidecar: '', frames: 0 };
    const video = document.createElement('video');
    video.muted = true;
    video.src = `data:video/mp4;base64,${rendered.base64}`;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Could not decode Warping export'));
    });
    const seek = new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });
    video.currentTime = 0.8;
    await seek;
    const canvas = new OffscreenCanvas(320, 180);
    const context = canvas.getContext('2d')!;
    context.drawImage(video, 0, 0);
    const pixels = context.getImageData(0, 0, 320, 180).data;
    let lit = 0;
    for (let i = 0; i < pixels.length; i += 4)
      if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 15) lit++;
    video.removeAttribute('src');
    video.load();
    return {
      ok: true,
      error: null,
      lit,
      sidecar: rendered.result.sidecarText,
      frames: rendered.result.frameCount,
    };
  });
  expect(result.ok, JSON.stringify(result.error)).toBe(true);
  expect(result.lit).toBeGreaterThan(10);
  expect(result.frames).toBe(66);
  const saved = JSON.parse(result.sidecar) as {
    visual: { mapping: string; properties: { size: number } };
  };
  expect(saved.visual.mapping).toBe('warping');
  expect(saved.visual.properties.size).toBe(0.75);
});
