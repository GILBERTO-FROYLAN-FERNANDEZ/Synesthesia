import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
type WarpApi = {
  spVisual: {
    ready: boolean;
    renderStats(o: unknown): Promise<{ litFraction: number; meanLuma: number; hash: string }>;
    renderImage(o: unknown): Promise<string>;
  };
};
for (const materialId of ['grass']) {
  test(`${materialId} deforms and recovers repeatably`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./dev/materials/?autoplay=0');
    await page.waitForFunction(() => Boolean((window as unknown as WarpApi).spVisual?.ready));
    const base = {
      materialId,
      mapping: 'displacement',
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
    expect(Math.abs(recovered.meanLuma - still.meanLuma)).toBeLessThan(0.002);
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
test('Grass lives in Movement and supports full and sampled existing material only', async ({
  page,
}) => {
  await page.goto('./#/studio/live');
  const mapping = page.getByRole('radiogroup', { name: 'Visual mapping' });
  await expect(mapping.getByRole('radio', { name: 'Warping', exact: true })).toHaveCount(0);
  await mapping.getByRole('radio', { name: 'Movement', exact: true }).click();
  await page
    .getByRole('radiogroup', { name: 'Material source' })
    .getByRole('radio', { name: 'Generated', exact: true })
    .click();
  await page.getByRole('button', { name: /^Visual / }).click();
  await expect(page.getByRole('option', { name: /^Color field/ })).toHaveCount(0);
  await page.getByRole('option', { name: /^Grass/ }).click();
  const source = page.getByRole('radiogroup', { name: 'Material source' });
  await expect(source.getByRole('radio', { name: 'Existing', exact: true })).toBeChecked();
  await expect(source.getByRole('radio', { name: 'Generated', exact: true })).toBeDisabled();
  await page
    .getByRole('radiogroup', { name: 'Movement coverage' })
    .getByRole('radio', { name: 'Sampled', exact: true })
    .click();
  await expect(page.getByRole('button', { name: /^Visual Grass/ })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Blade size', exact: true })).toBeHidden();
  await mapping.getByRole('radio', { name: 'Ripples', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Visual Water/ })).toBeVisible();
  await page.getByRole('button', { name: /^Visual / }).click();
  await expect(page.getByRole('option', { name: /^Grass/ })).toHaveCount(0);
});

test('Grass exports visible video and preserves mapping and width in the composition file', async ({
  page,
}) => {
  await page.goto('./dev/render/');
  type RenderApi = {
    spRender: {
      ready: boolean;
      renderToBytes(options: {
        visual: string;
        mapping: 'displacement';
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
      visual: 'grass',
      mapping: 'displacement',
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
  expect(saved.visual.mapping).toBe('displacement');
  expect(saved.visual.properties.size).toBe(0.75);
});

test('Grass renders distinct up, down, and diagonal bends with fixed roots', async ({
  page,
}, info) => {
  await page.goto('./dev/materials/?autoplay=0');
  await page.waitForFunction(() => Boolean((window as unknown as WarpApi).spVisual?.ready));
  const hashes = new Set<string>();
  const coverage = new Map<string, number>();
  for (const [name, vector] of [
    ['rest', [0, 0]],
    ['up', [0, -0.4]],
    ['down', [0, 0.4]],
    ['down-right', [0.4, 0.4]],
    ['up-left', [-0.4, -0.4]],
  ] as const) {
    const opts = {
      materialId: 'grass',
      mapping: 'displacement',
      kind: 'still',
      fieldVector: vector,
      steps: 45,
      seed: 7,
      width: 480,
      height: 270,
      quality: 'draft',
    };
    const stats = await page.evaluate(
      (o) => (window as unknown as WarpApi).spVisual.renderStats(o),
      opts,
    );
    expect(stats.litFraction).toBeGreaterThan(0.005);
    hashes.add(stats.hash);
    coverage.set(name, stats.litFraction);
    const image = await page.evaluate(
      (o) => (window as unknown as WarpApi).spVisual.renderImage(o),
      opts,
    );
    await writeFile(
      info.outputPath(`grass-${name}.png`),
      Buffer.from(image.split(',')[1], 'base64'),
    );
  }
  expect(hashes.size).toBe(5);
  expect(coverage.get('up')!).toBeGreaterThan(coverage.get('rest')! * 1.15);
});

test('Sampled grass bends a visible trail rather than isolated blades', async ({ page }) => {
  await page.goto('./dev/materials/?autoplay=0');
  await page.waitForFunction(() => Boolean((window as unknown as WarpApi).spVisual?.ready));
  const opts = {
    materialId: 'grass',
    mapping: 'sampled-displacement',
    kind: 'sweep',
    steps: 75,
    seed: 7,
    width: 480,
    height: 270,
    quality: 'draft',
  };
  const difference = await page.evaluate(async (o) => {
    const api = (window as unknown as WarpApi).spVisual;
    const images = await Promise.all([
      api.renderImage(o),
      api.renderImage({ ...o, kind: 'still' }),
    ]);
    const pixels = await Promise.all(
      images.map(async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      }),
    );
    let changed = 0;
    for (let i = 0; i < pixels[0].length; i += 4) {
      if (Math.max(...[0, 1, 2].map((c) => Math.abs(pixels[0][i + c] - pixels[1][i + c]))) > 12)
        changed++;
    }
    return changed / (pixels[0].length / 4);
  }, opts);
  expect(difference).toBeGreaterThan(0.025);
  expect(difference).toBeLessThan(0.4);
});
