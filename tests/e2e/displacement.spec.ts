import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    spVisual: {
      ready: boolean;
      renderFilmstrip(options: {
        materialId: string;
        mapping: 'displacement';
        kind: string;
        repeatMotion: boolean;
        steps: number;
        checkpoints: number[];
        seed: number;
        width: number;
        height: number;
        quality: string;
        props: Record<string, number>;
      }): Promise<string[]>;
      renderImage(options: {
        repeatMotion?: boolean;
        materialId: string;
        mapping: 'displacement';
        kind: string;
        steps: number;
        seed: number;
        width: number;
        height: number;
        quality: string;
        props?: Record<string, number>;
        overrides?: { forceManualFiltering?: boolean; forceRgba?: boolean };
      }): Promise<string>;
      renderStats(options: {
        materialId: string;
        mapping?: 'wake' | 'displacement';
        kind: string;
        steps: number;
        seed: number;
        props: Record<string, number>;
        width: number;
        height: number;
        quality: string;
      }): Promise<{ hash: string; meanLuma: number; litFraction: number }>;
    };
  }
}

for (const materialId of ['water', 'honey', 'smoke', 'bubbles', 'filaments']) {
  test(`${materialId}: displacement pushes an existing medium repeatably`, async ({ page }) => {
    await page.goto('./dev/materials/?autoplay=0');
    await page.waitForFunction(() => window.spVisual?.ready);
    const render = (kind: string, steps: number, seed = 7, props = {}) =>
      page.evaluate((options) => window.spVisual.renderStats(options), {
        materialId,
        mapping: 'displacement' as const,
        kind,
        steps,
        seed,
        props,
        width: 320,
        height: 180,
        quality: 'draft',
      });
    const initial = await render('still', 0);
    const still = await render('still', 80);
    const moving = await render('sweep', 80);
    if (materialId !== 'bubbles') expect(initial.litFraction).toBeGreaterThan(0.01);
    else expect(still.litFraction).toBeGreaterThan(initial.litFraction);
    if (['water', 'honey'].includes(materialId))
      expect(still.meanLuma).toBeCloseTo(initial.meanLuma, 2);
    if (materialId === 'smoke') expect(still.litFraction).toBeGreaterThan(0.01);
    expect(moving.hash).not.toBe(still.hash);
    expect((await render('sweep', 80)).hash).toBe(moving.hash);
    expect((await render('still', materialId === 'bubbles' ? 80 : 0, 8)).hash).not.toBe(
      materialId === 'bubbles' ? still.hash : initial.hash,
    );
    if (['water', 'honey', 'smoke'].includes(materialId))
      expect((await render('still', 0, 7, { density: 1 })).meanLuma).toBeGreaterThan(
        initial.meanLuma,
      );
  });
}

test('live mapping is separate from the medium and survives medium changes', async ({ page }) => {
  await page.goto('./#/studio/live');
  const mapping = page.getByRole('radiogroup', { name: 'Visual mapping' });
  await expect(mapping.getByRole('radio', { name: 'Displacement', exact: true })).toBeChecked();
  for (const medium of ['Water', 'Honey', 'Smoke']) {
    await page.getByRole('button', { name: /^Visual / }).click();
    await expect(page.getByRole('option', { name: /Displacement/ })).toHaveCount(0);
    await expect(page.getByRole('option', { name: /Filaments/ })).toHaveCount(0);
    await page.getByRole('option', { name: new RegExp(`^${medium}`) }).click();
    await expect(mapping.getByRole('radio', { name: 'Displacement', exact: true })).toBeChecked();
  }
  await mapping.getByRole('radio', { name: 'Wake', exact: true }).click();
  await page.getByRole('button', { name: /^Visual / }).click();
  await page.getByRole('option', { name: /^Water/ }).click();
  await expect(mapping.getByRole('radio', { name: 'Wake', exact: true })).toBeChecked();
});

test('realistic displacement surfaces render distinctly and support the filtering fallback', async ({
  page,
}, testInfo) => {
  await page.goto('./dev/materials/?autoplay=0');
  await page.waitForFunction(() => window.spVisual?.ready);
  const images: { name: string; still: string; moving: string }[] = [];
  for (const materialId of ['water', 'honey', 'smoke']) {
    const options = {
      materialId,
      mapping: 'displacement' as const,
      kind: 'sweep',
      seed: 7,
      width: 640,
      height: 480,
      quality: 'standard',
    };
    const still = await page.evaluate(
      (opts) => window.spVisual.renderImage({ ...opts, steps: 0 }),
      options,
    );
    const moving = await page.evaluate(
      (opts) => window.spVisual.renderImage({ ...opts, steps: 100 }),
      options,
    );
    expect(moving).not.toBe(still);
    images.push({ name: materialId, still, moving });
    await writeFile(
      testInfo.outputPath(`${materialId}.png`),
      Buffer.from(moving.split(',')[1], 'base64'),
    );
  }
  const fallback = await page.evaluate(() =>
    window.spVisual.renderImage({
      materialId: 'water',
      mapping: 'displacement',
      kind: 'sweep',
      steps: 30,
      seed: 7,
      width: 320,
      height: 240,
      quality: 'draft',
      overrides: { forceManualFiltering: true, forceRgba: true },
    }),
  );
  expect(fallback.startsWith('data:image/png;base64,')).toBe(true);
  await page.evaluate((surfaces) => {
    document.body.replaceChildren();
    document.body.style.cssText =
      'margin:0;padding:24px;background:#10171c;color:#edf1f4;font:16px system-ui;';
    const header = document.createElement('h1');
    header.textContent = 'Displacement · material surfaces';
    header.style.cssText = 'font-size:22px;font-weight:500;margin:0 0 20px';
    document.body.append(header);
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:16px';
    for (const surface of surfaces) {
      const column = document.createElement('div');
      const title = document.createElement('h2');
      title.textContent = surface.name[0].toUpperCase() + surface.name.slice(1);
      title.style.cssText = 'font-size:16px;font-weight:500;margin:0 0 12px';
      column.append(title);
      for (const [caption, src] of [
        ['At rest', surface.still],
        ['After movement', surface.moving],
      ]) {
        const image = document.createElement('img');
        image.src = src;
        image.style.cssText = 'display:block;width:100%;aspect-ratio:4/3;object-fit:contain';
        const label = document.createElement('p');
        label.textContent = caption;
        label.style.cssText = 'font-size:12px;color:#a6b2bc;margin:6px 0 16px';
        column.append(image, label);
      }
      grid.append(column);
    }
    document.body.append(grid);
  }, images);
  await page.screenshot({ path: testInfo.outputPath('medium-preview.png'), fullPage: true });
});

for (const materialId of ['water', 'honey', 'smoke']) {
  test(`${materialId}: prolonged stirring retains texture and visible motion`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.goto('./dev/materials/?autoplay=0');
    await page.waitForFunction(() => window.spVisual?.ready);
    const frames = await page.evaluate(
      (medium) =>
        window.spVisual.renderFilmstrip({
          materialId: medium,
          mapping: 'displacement',
          kind: 'sweep',
          repeatMotion: true,
          steps: 3600,
          checkpoints: [0, 3540],
          seed: 7,
          width: 320,
          height: 240,
          quality: 'draft',
          props: { intensity: 1, viscosity: 0, range: 1 },
        }),
      materialId,
    );
    const metrics = await page.evaluate(async (urls) => {
      const images: Float64Array[] = [];
      for (const url of urls) {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, image.width, image.height).data;
        const values: number[] = [];
        // Measure the stirred center, excluding untouched edges that could hide a failure.
        for (let y = Math.floor(image.height * 0.2); y < image.height * 0.8; y++) {
          for (let x = Math.floor(image.width * 0.2); x < image.width * 0.8; x++) {
            const i = (y * image.width + x) * 4;
            values.push(
              (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255,
            );
          }
        }
        images.push(Float64Array.from(values));
      }
      const contrast = (values: Float64Array) => {
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
      };
      let difference = 0;
      for (let i = 0; i < images[1].length; i++)
        difference += Math.abs(images[1][i] - images[2][i]);
      return {
        initialContrast: contrast(images[0]),
        lateContrast: contrast(images[2]),
        motion: difference / images[1].length,
      };
    }, frames);
    await testInfo.attach('readability-after-one-minute', {
      body: JSON.stringify(metrics),
      contentType: 'application/json',
    });
    await writeFile(
      testInfo.outputPath(`${materialId}-after-one-minute.png`),
      Buffer.from(frames[2].split(',')[1], 'base64'),
    );
    expect(metrics.lateContrast).toBeGreaterThan(0.015);
    expect(metrics.lateContrast).toBeGreaterThan(metrics.initialContrast * 0.2);
    expect(metrics.motion).toBeGreaterThan(0.005);
  });
}

test('bubble source falls from the top and remains interactive', async ({ page }, testInfo) => {
  await page.goto('./dev/materials/?autoplay=0');
  await page.waitForFunction(() => window.spVisual?.ready);
  const frames = await page.evaluate(() =>
    window.spVisual.renderFilmstrip({
      materialId: 'bubbles',
      mapping: 'displacement',
      kind: 'still',
      repeatMotion: false,
      steps: 600,
      checkpoints: [0, 60, 240],
      seed: 7,
      width: 640,
      height: 480,
      quality: 'standard',
      props: {},
    }),
  );
  const occupancy = await page.evaluate(async (urls) => {
    const result: { lit: number; middle: number; lowest: number }[] = [];
    for (const src of urls) {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      let lit = 0,
        middle = 0,
        lowest = 0;
      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          const i = (y * image.width + x) * 4;
          if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) < 20) continue;
          lit++;
          lowest = Math.max(lowest, y / image.height);
          if (y > image.height * 0.4 && y < image.height * 0.6) middle++;
        }
      }
      result.push({ lit, middle, lowest });
    }
    return result;
  }, frames);
  expect(occupancy[0].lit).toBe(0);
  expect(occupancy[1].lit).toBeGreaterThan(50);
  expect(occupancy[1].lowest).toBeLessThan(0.35);
  expect(occupancy[2].middle).toBeGreaterThan(50);
  expect(occupancy[3].middle).toBeGreaterThan(50);
  const moved = await page.evaluate(() =>
    window.spVisual.renderImage({
      materialId: 'bubbles',
      mapping: 'displacement',
      kind: 'sweep',
      repeatMotion: true,
      steps: 600,
      seed: 7,
      width: 640,
      height: 480,
      quality: 'standard',
    }),
  );
  expect(moved).not.toBe(frames[3]);
  await writeFile(
    testInfo.outputPath('falling-bubbles.png'),
    Buffer.from(frames[3].split(',')[1], 'base64'),
  );
  await writeFile(
    testInfo.outputPath('pushed-bubbles.png'),
    Buffer.from(moved.split(',')[1], 'base64'),
  );
});
