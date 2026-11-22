import { writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

type Options = {
  materialId: string;
  mapping: 'ripples';
  kind: string;
  steps: number;
  seed: number;
  width: number;
  height: number;
  quality: 'draft' | 'standard';
  props?: Record<string, number>;
};
type Stats = { hash: string; meanLuma: number; litFraction: number };
type Api = {
  spVisual: {
    ready: boolean;
    renderStats: (opts: Options) => Promise<Stats>;
    renderImage: (opts: Options) => Promise<string>;
  };
};
async function stats(page: Page, options: Options) {
  return page.evaluate((opts) => (window as unknown as Api).spVisual.renderStats(opts), options);
}

for (const materialId of ['water', 'honey', 'smoke', 'bubbles']) {
  test(`${materialId} Ripples are visible, repeatable, and respond to sampled movement`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./dev/materials/?autoplay=0');
    await page.waitForFunction(() => (window as unknown as Api).spVisual?.ready);
    const base: Options = {
      materialId,
      mapping: 'ripples',
      kind: 'sweep',
      steps: 85,
      seed: 7,
      width: 640,
      height: 360,
      quality: 'standard',
    };
    const a = await stats(page, base);
    expect(a.litFraction).toBeGreaterThan(0.0001);
    // Dense overlapping smoke is intentional; preserve headroom rather than sparse coverage.
    expect(a.litFraction).toBeLessThan(materialId === 'smoke' ? 0.65 : 0.3);
    expect((await stats(page, base)).hash).toBe(a.hash);
    expect((await stats(page, { ...base, seed: 8 })).hash).not.toBe(a.hash);
    const still = await stats(page, { ...base, kind: 'still' });
    const later = await stats(page, { ...base, steps: materialId === 'honey' ? 1200 : 600 });
    expect(still.litFraction).toBe(0);
    expect(later.litFraction).toBe(0);
    expect((await stats(page, { ...base, props: { size: 0.85 } })).litFraction).toBeGreaterThan(
      a.litFraction,
    );
    const image = await page.evaluate(
      (opts) => (window as unknown as Api).spVisual.renderImage(opts),
      base,
    );
    await writeFile(
      testInfo.outputPath(`${materialId}-ripples.png`),
      Buffer.from(image.split(',')[1], 'base64'),
    );
    expect(errors).toEqual([]);
  });
}

test('Ripples is a separate mapping and retains its width when switching mediums', async ({
  page,
}) => {
  await page.goto('./#/studio/live');
  const mapping = page.getByRole('radiogroup', { name: 'Visual mapping' });
  await mapping.getByRole('radio', { name: 'Ripples', exact: true }).click();
  for (const medium of ['Water', 'Smoke', 'Bubbles']) {
    await page.getByRole('button', { name: /^Visual / }).click();
    await expect(page.getByRole('option', { name: /^Ripples/ })).toHaveCount(0);
    await page.getByRole('option', { name: new RegExp(`^${medium}`) }).click();
    await expect(mapping.getByRole('radio', { name: 'Ripples', exact: true })).toBeChecked();
    const properties = page.getByRole('group', { name: `${medium} visual properties` });
    const more = properties.getByRole('button', { name: 'Show more' });
    if (await more.count()) await more.click();
    await expect(
      properties.getByRole('slider', { name: 'Ripple size', exact: true }),
    ).toBeVisible();
    const width = properties.getByRole('slider', { name: 'Ripple size', exact: true });
    if (medium === 'Water') {
      await width.focus();
      await page.keyboard.press('ArrowRight');
    } else {
      await expect(width).toHaveAttribute('aria-valuenow', '0.51');
    }
  }
});

test('Ripples exports visible video and preserves mapping and width in the composition file', async ({
  page,
}) => {
  await page.goto('./dev/render/');
  type RenderApi = {
    spRender: {
      ready: boolean;
      renderToBytes(options: {
        visual: string;
        mapping: 'ripples';
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
      visual: 'water',
      mapping: 'ripples',
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
      video.onerror = () => reject(new Error('Could not decode Ripples export'));
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
  expect(saved.visual.mapping).toBe('ripples');
  expect(saved.visual.properties.size).toBe(0.75);
});

test('Honey is disabled only for Ripples and switching from Honey selects Water', async ({
  page,
}) => {
  await page.goto('./#/studio/live');
  const mapping = page.getByRole('radiogroup', { name: 'Visual mapping' });
  await mapping.getByRole('radio', { name: 'Movement', exact: true }).click();
  await page
    .getByRole('radiogroup', { name: 'Movement coverage' })
    .getByRole('radio', { name: 'Sampled', exact: true })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Material source' })
    .getByRole('radio', { name: 'Generated', exact: true })
    .click();
  await page.getByRole('button', { name: /^Visual / }).click();
  await page.getByRole('option', { name: /^Honey/ }).click();
  await expect(page.getByRole('button', { name: /^Visual Honey/ })).toBeVisible();
  await mapping.getByRole('radio', { name: 'Ripples', exact: true }).click();
  const picker = page.getByRole('button', { name: /^Visual Water/ });
  await expect(picker).toBeVisible();
  await picker.click();
  const honey = page.getByRole('option', { name: /^Honey/ });
  await expect(honey).toHaveAttribute('aria-disabled', 'true');
  await expect(honey).toContainText('Unavailable with Ripples');
  await honey.dispatchEvent('click');
  await expect(picker).toBeVisible();
  const list = page.getByRole('listbox', { name: 'Visual material' });
  await list.focus();
  await page.keyboard.press('ArrowDown');
  expect(await list.getAttribute('aria-activedescendant')).not.toBe(await honey.getAttribute('id'));
  await page.keyboard.press('Escape');
  await mapping.getByRole('radio', { name: 'Movement', exact: true }).click();
  await picker.click();
  await expect(honey).not.toHaveAttribute('aria-disabled', 'true');
  await honey.click();
  await expect(page.getByRole('button', { name: /^Visual Honey/ })).toBeVisible();
});
