import { openLibraryDb } from './db';
import { requestPersistenceOnce } from './storage';
import type { StoredMediaAsset } from './types';

export async function saveMediaAsset(asset: StoredMediaAsset): Promise<void> {
  await (await openLibraryDb()).put('mediaAssets', asset);
  void requestPersistenceOnce();
}

export async function getMediaAsset(id: string): Promise<StoredMediaAsset | undefined> {
  return (await openLibraryDb()).get('mediaAssets', id);
}

export async function deleteMediaAssetIfUnreferenced(id: string): Promise<boolean> {
  const db = await openLibraryDb();
  const compositions = await db.getAll('compositions');
  const referenced = compositions.some(
    (c) =>
      c.performance.generatedVideoAssetId === id || c.performance.sourceVideoAssetId === id,
  );
  if (referenced) return false;
  await db.delete('mediaAssets', id);
  return true;
}
