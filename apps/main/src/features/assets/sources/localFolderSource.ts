/**
 * LocalFolderSource — `AssetSource` adapter over the local-folders stack.
 *
 * Wraps the `useLocalFolders` zustand store plus the pure hashing primitives
 * behind the data-layer `AssetSource` seam. It is an *imperative* core (no React)
 * so that:
 *   - the gallery can consume it via useSyncExternalStore (`getAll`/`subscribe`),
 *   - `useLocalFoldersController` can be reduced to a thin React/UI wrapper that
 *     delegates here (the `retire-duplicated-view-logic` checkpoint),
 *   - the same shape is what MinIO/remote-root browsing plugs into later.
 *
 * Upload/ingest is intentionally NOT implemented here yet: it still lives in
 * `useLocalFoldersController` (`uploadOneInternal`). An earlier `ingest` impl was
 * a verbatim fork of that controller path and drifted, so it was removed; re-add
 * it only when uploads genuinely migrate onto the adapter.
 *
 * Scope note (source-adapter-boundary): this defines the seam and the imperative
 * data operations. UI-only concerns that still live in the controller — preview
 * blob-URL caching, hashing progress/pause/resume, the on-screen "active scope"
 * prioritisation — are intentionally NOT moved here; they layer on top of these
 * primitives and migrate with the surface collapse.
 */

import { setHashWorkerPoolSize } from '../lib/hashWorkerManager';
import {
  checkHashesAgainstBackend,
  ensureLocalAssetSha256,
  hasValidStoredHash,
  scheduleAssetsForHashing,
} from '../lib/localHashing';
import { useLocalFolderSettingsStore } from '../stores/localFolderSettingsStore';
import { useLocalFolders } from '../stores/localFoldersStore';
import type { LocalAssetModel } from '../types/localFolderMeta';

import type {
  AssetLibraryStatus,
  AssetSource,
  AssetSourceLifecycle,
} from './assetSource';

const LOCAL_TYPE_ID = 'local-fs';

// ---------------------------------------------------------------------------
// Cached client-loaded snapshot.
// getAll() must return a stable reference until `assets` mutates, or
// useSyncExternalStore loops (see memory useSyncExternalStore-snapshot-cache).
// ---------------------------------------------------------------------------
let cachedAssetsRecord: Record<string, LocalAssetModel> | null = null;
let cachedSortedList: LocalAssetModel[] = [];

function snapshotAll(): LocalAssetModel[] {
  const assets = useLocalFolders.getState().assets;
  if (assets !== cachedAssetsRecord) {
    cachedAssetsRecord = assets;
    cachedSortedList = Object.values(assets).sort(
      (a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0),
    );
  }
  return cachedSortedList;
}

function assetForKey(key: string): LocalAssetModel | undefined {
  return useLocalFolders.getState().assets[key];
}

// ---------------------------------------------------------------------------
// hash — imperative concurrent hasher over the keys that still need it.
// Simpler than the controller's run loop (no progress UI / pause); reuses the
// same scheduling + digest primitives so results are identical.
// ---------------------------------------------------------------------------
async function hashKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const state = useLocalFolders.getState();
  const wanted = new Set(keys);

  const toHash = scheduleAssetsForHashing(
    Object.values(state.assets).filter((asset) => {
      if (!wanted.has(asset.key)) return false;
      if (hasValidStoredHash(asset)) return false;
      if (asset.last_upload_status === 'success') return false;
      return true;
    }),
  );
  if (toHash.length === 0) return;

  const concurrency = Math.max(1, Math.trunc(useLocalFolderSettingsStore.getState().hashChunkSize));
  setHashWorkerPoolSize(concurrency);

  const pending: Array<{ assetKey: string; sha256: string; file: File }> = [];
  const flush = async () => {
    if (pending.length === 0) return;
    const batch = pending.splice(0, pending.length);
    await useLocalFolders.getState().updateAssetHashesBatch(batch);
  };

  let cursor = 0;
  const runWorker = async () => {
    while (cursor < toHash.length) {
      const asset = toHash[cursor++];
      try {
        const file = await state.getFileForAsset(asset);
        if (file) {
          await ensureLocalAssetSha256(asset, file, async (assetKey, sha256, fileForHash) => {
            pending.push({ assetKey, sha256, file: fileForHash });
          });
        }
      } catch (e) {
        console.warn('[LocalFolderSource] failed to hash asset:', asset.name, e);
      }
      if (pending.length >= Math.max(8, concurrency * 4)) {
        await flush();
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, toHash.length) }, () => runWorker()),
  );
  await flush();
}

// ---------------------------------------------------------------------------
// libraryStatus — resolve backend membership for the given keys and persist the
// "Already in library" status back to the store (durable bookkeeping). Returns a
// per-key status map. Keys without a stored hash resolve to { inLibrary: false }.
// ---------------------------------------------------------------------------
async function resolveLibraryStatus(keys: string[]): Promise<Record<string, AssetLibraryStatus>> {
  const state = useLocalFolders.getState();
  const result: Record<string, AssetLibraryStatus> = {};

  // hash -> the asset keys that carry it (a hash can repeat across folders)
  const hashToKeys = new Map<string, string[]>();
  for (const key of keys) {
    const asset = state.assets[key];
    if (!asset || !asset.sha256 || !hasValidStoredHash(asset)) {
      result[key] = { inLibrary: false };
      continue;
    }
    // Already known to be in the library — short-circuit.
    if (asset.last_upload_status === 'success' && asset.last_upload_asset_id) {
      result[key] = { inLibrary: true, assetId: asset.last_upload_asset_id };
      continue;
    }
    const list = hashToKeys.get(asset.sha256) ?? [];
    list.push(key);
    hashToKeys.set(asset.sha256, list);
    result[key] = { inLibrary: false };
  }

  const hashes = Array.from(hashToKeys.keys());
  if (hashes.length === 0) return result;

  const matches = await checkHashesAgainstBackend(hashes);
  for (const { sha256, assetId } of matches) {
    const matchedKeys = hashToKeys.get(sha256);
    if (!matchedKeys) continue;
    for (const key of matchedKeys) {
      result[key] = { inLibrary: true, assetId };
      await state.updateAssetUploadStatus(key, 'success', 'Already in library', { assetId });
    }
  }
  return result;
}

const lifecycle: AssetSourceLifecycle = {
  load: () => useLocalFolders.getState().loadPersisted(),
  refresh: async () => {
    const { folders, refreshFolder } = useLocalFolders.getState();
    for (const folder of folders) {
      try {
        await refreshFolder(folder.id);
      } catch (e) {
        console.warn('[LocalFolderSource] folder refresh failed', folder.id, e);
      }
    }
  },
  folders: {
    list: () => useLocalFolders.getState().folders.map((f) => ({ id: f.id, name: f.name })),
    add: () => useLocalFolders.getState().addFolder(),
    remove: (id) => useLocalFolders.getState().removeFolder(id),
    refresh: (id) => useLocalFolders.getState().refreshFolder(id),
  },
};

/**
 * Build a LocalFolderSource adapter. A factory (rather than a bare singleton) to
 * match the registry's per-instance model and keep tests isolated; for now there
 * is one local-fs instance backed by the shared `useLocalFolders` store.
 */
export function createLocalFolderSource(instanceId: string = LOCAL_TYPE_ID): AssetSource {
  return {
    identity: {
      typeId: LOCAL_TYPE_ID,
      instanceId,
      label: 'Local Folders',
      kind: 'local',
      icon: 'folder',
    },
    capabilities: {
      fetchMode: 'client-loaded',
      // Ingest (upload) stays in `useLocalFoldersController`; the source seam is
      // read-only here. Re-add an `ingest` impl when uploads actually migrate
      // onto the adapter (see retire-duplicated-view-logic) rather than shadowing
      // the controller's evolving upload path.
      canIngest: false,
      canHash: true,
      hasLibraryStatus: true,
      hasFolders: true,
    },
    getAll: snapshotAll,
    subscribe: (listener) => useLocalFolders.subscribe(() => listener()),
    get: (key) => assetForKey(key),
    file: (key) => useLocalFolders.getState().getFileForAsset(key),
    hash: hashKeys,
    libraryStatus: resolveLibraryStatus,
    lifecycle,
  };
}

/** Default local-folders source instance. */
export const localFolderSource: AssetSource = createLocalFolderSource();
