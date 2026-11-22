import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixturePath = resolve(import.meta.dirname, '../fixtures/sample.sig.json');
const signature = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  id: string;
  name: string;
  contentHash: string;
};

async function seedLibrary(page: Page, version: number, incompatible = false) {
  await page.route('**/db-setup', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Library setup</title>',
    }),
  );
  await page.goto('./db-setup');
  await page.evaluate(
    ({ version, incompatible }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('synesthesia', version);
        request.onupgradeneeded = () => {
          const db = request.result;
          db.createObjectStore('signatures', { keyPath: incompatible ? 'otherId' : 'id' });
          const meta = db.createObjectStore('signatureMeta', { keyPath: 'id' });
          meta.createIndex('byContentHash', 'contentHash');
          const compositions = db.createObjectStore('compositions', { keyPath: 'id' });
          compositions.createIndex('bySignatureId', 'signature.id');
          compositions.createIndex('bySignatureHash', 'signature.contentHash');
          db.createObjectStore('albums', { keyPath: 'id' });
          db.createObjectStore('clips', { keyPath: 'id' });
          db.createObjectStore('settings');
          db.createObjectStore('workingState');
          db.createObjectStore('mediaAssets', { keyPath: 'id' });
        };
        request.onerror = () =>
          reject(request.error ?? new Error('Could not open the test library'));
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['mediaAssets', 'settings'], 'readwrite');
          tx.objectStore('mediaAssets').put({ id: 'preserve-me', bytes: [1, 2, 3] });
          tx.objectStore('settings').put('existing-value', 'compatibility-sentinel');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error ?? new Error('Test library transaction failed'));
          };
        };
      }),
    { version, incompatible },
  );
}

async function inspectLibrary(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ version: number; asset: unknown; setting: unknown }>((resolve, reject) => {
        const request = indexedDB.open('synesthesia');
        request.onerror = () =>
          reject(request.error ?? new Error('Could not open the test library'));
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['mediaAssets', 'settings'], 'readonly');
          const asset = tx.objectStore('mediaAssets').get('preserve-me');
          const setting = tx.objectStore('settings').get('compatibility-sentinel');
          tx.oncomplete = () => {
            const version = db.version;
            db.close();
            resolve({ version, asset: asset.result, setting: setting.result });
          };
        };
      }),
  );
}

test('opens the additive version-2 library, imports data, and preserves newer stores', async ({
  page,
}) => {
  await seedLibrary(page, 2);
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Import file', exact: true })).toBeEnabled();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import file', exact: true }).click();
  await (await chooser).setFiles(fixturePath);
  await expect(page.getByText('Added the signature “Sample wink”.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('list', { name: 'Signatures' })).toContainText(signature.name);
  expect(await inspectLibrary(page)).toEqual({
    version: 2,
    asset: { id: 'preserve-me', bytes: [1, 2, 3] },
    setting: 'existing-value',
  });
});

for (const { version, incompatible } of [
  { version: 3, incompatible: false },
  { version: 2, incompatible: true },
]) {
  test(`rejects ${incompatible ? 'incompatible' : 'unknown'} schema ${version} without changing saved data`, async ({
    page,
  }) => {
    await seedLibrary(page, version, incompatible);
    await page.goto('./');
    await expect(page.getByText(/This library uses a newer or incompatible format/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import file', exact: true })).toBeDisabled();
    expect(await inspectLibrary(page)).toEqual({
      version,
      asset: { id: 'preserve-me', bytes: [1, 2, 3] },
      setting: 'existing-value',
    });
  });
}
