import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
type Options = {
  materialId: string;
  mapping: 'wake';
  kind: string;
  steps: number;
  seed: number;
  width: number;
  height: number;
  quality: 'standard';
  props?: Record<string, number>;
};
type Api = {
  spVisual: {
    ready: boolean;
    renderStats(o: Options): Promise<{ hash: string; litFraction: number; meanLuma: number }>;
    renderImage(o: Options): Promise<string>;
  };
};
for (const materialId of ['water', 'honey', 'smoke', 'bubbles']) {
  test(`${materialId} Wake uses the natural medium appearance repeatably`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./dev/materials/?autoplay=0');
    await page.waitForFunction(() => (window as unknown as Api).spVisual?.ready);
    const base: Options = {
      materialId,
      mapping: 'wake',
      kind: 'sweep',
      steps: 85,
      seed: 7,
      width: 640,
      height: 360,
      quality: 'standard',
    };
    const stats = (o: Options) =>
      page.evaluate((o) => (window as unknown as Api).spVisual.renderStats(o), o);
    const a = await stats(base);
    expect(a.litFraction).toBeGreaterThan(0.0001);
    expect((await stats(base)).hash).toBe(a.hash);
    expect((await stats({ ...base, kind: 'still' })).hash).not.toBe(a.hash);
    expect((await stats({ ...base, props: { brightness: 0.85 } })).meanLuma).toBeGreaterThan(
      a.meanLuma,
    );
    const image = await page.evaluate(
      (o) => (window as unknown as Api).spVisual.renderImage(o),
      base,
    );
    await writeFile(
      info.outputPath(`${materialId}-wake.png`),
      Buffer.from(image.split(',')[1], 'base64'),
    );
    expect(errors).toEqual([]);
  });
}
