import { expect, test } from '@playwright/test';
type RenderOpts = {
  materialId: string;
  mapping: 'sampled-displacement';
  kind: string;
  steps: number;
  seed: number;
  width: number;
  height: number;
  quality: string;
};
type Api = {
  spVisual: {
    renderStats: (options: RenderOpts) => Promise<{ hash: string; litFraction: number }>;
  };
};

test('Movement exposes four combinations and preserves them when changing mediums', async ({
  page,
}, testInfo) => {
  await page.goto('./#/studio/live');
  const mapping = page.getByRole('radiogroup', { name: 'Visual mapping' });
  await expect(mapping.getByRole('radio')).toHaveCount(3);
  await expect(mapping.getByRole('radio', { name: 'Signature', exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: /^Visual / })).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Show readout' })).toBeVisible();
  await mapping.getByRole('radio', { name: 'Movement', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('movement-controls.png') });
  for (const coverage of ['Full', 'Sampled'])
    for (const source of ['Existing', 'Generated']) {
      await page
        .getByRole('radiogroup', { name: 'Movement coverage' })
        .getByRole('radio', { name: coverage, exact: true })
        .click();
      await page
        .getByRole('radiogroup', { name: 'Material source' })
        .getByRole('radio', { name: source, exact: true })
        .click();
      await mapping.getByRole('radio', { name: 'Movement', exact: true }).click();
      for (const medium of ['Water', 'Honey', 'Smoke', 'Bubbles']) {
        await page.getByRole('button', { name: /^Visual / }).click();
        await expect(page.getByRole('option', { name: /^Signature/ })).toHaveCount(0);
        await page.getByRole('option', { name: new RegExp(`^${medium}`) }).click();
        await expect(
          page
            .getByRole('radiogroup', { name: 'Movement coverage' })
            .getByRole('radio', { name: coverage, exact: true }),
        ).toBeChecked();
        await expect(
          page
            .getByRole('radiogroup', { name: 'Material source' })
            .getByRole('radio', { name: source, exact: true }),
        ).toBeChecked();
      }
    }
  await mapping.getByRole('radio', { name: 'Signature', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Visual / })).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Show readout' })).toBeVisible();
  await mapping.getByRole('radio', { name: 'Ripples', exact: true }).click();
  await expect(page.getByRole('radiogroup', { name: 'Movement coverage' })).toHaveCount(0);
  await expect(mapping.getByRole('radio', { name: 'Warping', exact: true })).toHaveCount(0);
});

for (const materialId of ['water', 'honey', 'smoke', 'bubbles', 'grass']) {
  test(`sampled existing ${materialId} is visible, responds to movement, and replays`, async ({
    page,
  }) => {
    await page.goto('./dev/materials/?autoplay=0');
    await page.waitForFunction(() => window.spVisual?.ready);
    const opts = {
      materialId,
      mapping: 'sampled-displacement' as const,
      kind: 'sweep',
      steps: 85,
      seed: 7,
      width: 480,
      height: 270,
      quality: 'draft' as const,
    };
    const a = await page.evaluate((o) => (window as unknown as Api).spVisual.renderStats(o), opts);
    const b = await page.evaluate((o) => (window as unknown as Api).spVisual.renderStats(o), opts);
    const still = await page.evaluate(
      (o) => (window as unknown as Api).spVisual.renderStats({ ...o, kind: 'still' }),
      opts,
    );
    expect(a.litFraction).toBeGreaterThan(0.001);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(still.hash);
  });
}

test('full generated bubbles start empty and emit visibly through movement', async ({ page }) => {
  await page.goto('./dev/materials/?autoplay=0');
  await page.waitForFunction(() => window.spVisual?.ready);
  type BubbleApi = {
    spVisual: {
      renderStats: (o: {
        materialId: string;
        mapping: 'wake';
        kind: string;
        steps: number;
        seed: number;
      }) => Promise<{ hash: string; litFraction: number }>;
    };
  };
  const opts = {
    materialId: 'bubbles',
    mapping: 'wake' as const,
    kind: 'sweep',
    steps: 85,
    seed: 7,
  };
  const still = await page.evaluate(
    (o) => (window as unknown as BubbleApi).spVisual.renderStats({ ...o, kind: 'still' }),
    opts,
  );
  const moving = await page.evaluate(
    (o) => (window as unknown as BubbleApi).spVisual.renderStats(o),
    opts,
  );
  const repeat = await page.evaluate(
    (o) => (window as unknown as BubbleApi).spVisual.renderStats(o),
    opts,
  );
  expect(still.litFraction).toBe(0);
  expect(moving.litFraction).toBeGreaterThan(0.001);
  expect(repeat.hash).toBe(moving.hash);
});
