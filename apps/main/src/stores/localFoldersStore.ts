/* Local Folders store using File System Access API (Chromium). 
 * Persists directory handles in IndexedDB so each user can add their own folders.
 */
import { create } from 'zustand';

type DirHandle = FileSystemDirectoryHandle;
type FileHandle = FileSystemFileHandle;

export type LocalAsset = {
  key: string; // unique key (folderId + relativePath)
  name: string;
  relativePath: string;
  kind: 'image' | 'video' | 'other';
  size?: number;
  lastModified?: number;
  fileHandle?: FileHandle;
  folderId: string;
  // Upload history tracking (Task 104)
  lastUploadStatus?: 'success' | 'error';
  lastUploadNote?: string;
  lastUploadAt?: number;
};

type FolderEntry = {
  id: string; // stable id
  name: string;
  handle: DirHandle;
};

type LocalFoldersState = {
  supported: boolean;
  folders: FolderEntry[];
  assets: Record<string, LocalAsset>; // key -> asset
  adding: boolean;
  error?: string;
  addFolder: () => Promise<void>;
  removeFolder: (id: string) => Promise<void>;
  refreshFolder: (id: string) => Promise<void>;
  loadPersisted: () => Promise<void>;
  getFileForAsset: (asset: LocalAsset) => Promise<File | undefined>;
  // Task 104: Update upload history for an asset
  updateAssetUploadStatus: (
    assetKey: string,
    status: 'success' | 'error',
    note?: string
  ) => Promise<void>;
};

// --- minimal IndexedDB helpers ---
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('ps7_local_folders', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const store = tx.objectStore('kv');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    store.put(value as any, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function isFSASupported() {
  return 'showDirectoryPicker' in window;
}

function extKind(name: string): LocalAsset['kind'] {
  const n = name.toLowerCase();
  if (/(\.png|\.jpg|\.jpeg|\.webp|\.gif)$/.test(n)) return 'image';
  if (/(\.mp4|\.webm|\.mov|\.m4v)$/.test(n)) return 'video';
  return 'other';
}

// Serializable asset metadata for caching (Task 104)
type AssetMeta = {
  key: string;
  name: string;
  relativePath: string;
  kind: 'image' | 'video' | 'other';
  size?: number;
  lastModified?: number;
  folderId: string;
  // Upload history tracking (Task 104)
  lastUploadStatus?: 'success' | 'error';
  lastUploadNote?: string;
  lastUploadAt?: number;
};

async function scanFolder(id: string, handle: DirHandle, depth = 5, prefix = ''): Promise<LocalAsset[]> {
  const out: LocalAsset[] = [];
  try {
    // @ts-expect-error: for-await supported in handles
    for await (const [name, entry] of handle.entries()) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'directory' && depth > 0) {
        out.push(...await scanFolder(id, entry as DirHandle, depth - 1, rel));
      } else if (entry.kind === 'file') {
        const fh = entry as FileHandle;
        const kind = extKind(name);
        if (kind === 'other') continue; // filter to media only
        let size: number | undefined; let lastModified: number | undefined;
        try { const f = await fh.getFile(); size = f.size; lastModified = f.lastModified; } catch {}
        out.push({
          key: `${id}:${rel}`,
          name,
          relativePath: rel,
          kind,
          size,
          lastModified,
          fileHandle: fh,
          folderId: id,
        });
      }
    }
  } catch (e) {
    console.warn('scanFolder error', e);
  }
  return out;
}

// Get file handle by walking the path from root
async function getFileHandle(root: DirHandle, relativePath: string): Promise<FileHandle | undefined> {
  try {
    const parts = relativePath.split('/');
    let current: DirHandle | FileHandle = root;

    for (let i = 0; i < parts.length; i++) {
      if (i === parts.length - 1) {
        // Last part is the file
        current = await (current as DirHandle).getFileHandle(parts[i]);
      } else {
        // Navigate to directory
        current = await (current as DirHandle).getDirectoryHandle(parts[i]);
      }
    }

    return current as FileHandle;
  } catch (e) {
    console.warn('getFileHandle error for', relativePath, e);
    return undefined;
  }
}

// Load assets from cache and reconstruct file handles
async function loadCachedAssets(id: string, _handle: DirHandle): Promise<LocalAsset[]> {
  try {
    const cached = await idbGet<AssetMeta[]>(`assets_${id}`);
    if (!cached) return [];

    // For large folders, reconstructing FileSystemFileHandle for every asset on
    // startup is very expensive. Instead, return lightweight assets without
    // fileHandle and let callers resolve handles lazily when needed.
    return cached.map((meta) => ({
      ...meta,
      fileHandle: undefined,
    }));
  } catch (e) {
    console.warn('loadCachedAssets error', e);
    return [];
  }
}

// Save assets to cache (Task 104: includes upload history)
async function cacheAssets(id: string, assets: LocalAsset[]): Promise<void> {
  try {
    const meta: AssetMeta[] = assets.map(a => ({
      key: a.key,
      name: a.name,
      relativePath: a.relativePath,
      kind: a.kind,
      size: a.size,
      lastModified: a.lastModified,
      folderId: a.folderId,
      // Task 104: persist upload history
      lastUploadStatus: a.lastUploadStatus,
      lastUploadNote: a.lastUploadNote,
      lastUploadAt: a.lastUploadAt,
    }));
    await idbSet(`assets_${id}`, meta);
  } catch (e) {
    console.warn('cacheAssets error', e);
  }
}

export const useLocalFolders = create<LocalFoldersState>((set, get) => ({
  supported: isFSASupported(),
  folders: [],
  assets: {},
  adding: false,
  error: undefined,

  loadPersisted: async () => {
    if (!isFSASupported()) return;
    try {
      const stored = await idbGet<FolderEntry[]>('folders');
      if (stored && stored.length) {
        // Request permission again if needed
        const ok: FolderEntry[] = [];
        for (const f of stored) {
          try {
            // @ts-ignore permission API
            const perm = await (f.handle as any).requestPermission?.({ mode: 'read' })
              ?? (await (f.handle as any).queryPermission?.({ mode: 'read' }));
            if (perm === 'granted' || perm === 'prompt' || perm === true) ok.push(f);
          } catch {
            // drop silently
          }
        }
        set({ folders: ok });
        // Load from cache first for instant display, then always kick off a fresh
        // scan in the background so newly added files appear without manual refresh.
        for (const f of ok) {
          const cachedItems = await loadCachedAssets(f.id, f.handle);
          if (cachedItems.length > 0) {
            set(s => ({
              assets: {
                ...s.assets,
                ...Object.fromEntries(cachedItems.map(a => [a.key, a])),
              },
            }));
            // Background refresh to pick up any changes since last cache write
            void get().refreshFolder(f.id);
          } else {
            // No cache, do full scan now (also writes cache)
            const items = await scanFolder(f.id, f.handle, 5);
            set(s => ({
              assets: {
                ...s.assets,
                ...Object.fromEntries(items.map(a => [a.key, a])),
              },
            }));
            await cacheAssets(f.id, items);
          }
        }
      }
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : 'Failed to load persisted folders' });
    }
  },

  addFolder: async () => {
    if (!isFSASupported()) {
      set({ error: 'Your browser does not support local folder access. Use Chrome/Edge.' });
      return;
    }
    set({ adding: true, error: undefined });
    try {
      // @ts-ignore
      const dir: DirHandle = await (window as any).showDirectoryPicker();
      const id = `${dir.name}-${Date.now()}`;
      const entry: FolderEntry = { id, name: dir.name, handle: dir };
      const folders = [...get().folders, entry];
      set({ folders });
      await idbSet('folders', folders);
      const items = await scanFolder(id, dir, 5);
      set(s => ({ assets: { ...s.assets, ...Object.fromEntries(items.map(a => [a.key, a])) } }));
      await cacheAssets(id, items);
    } catch (e: any) {
      if (e?.name !== 'AbortError') set({ error: e?.message || 'Failed to add folder' });
    } finally {
      set({ adding: false });
    }
  },

  removeFolder: async (id: string) => {
    const remain = get().folders.filter(f => f.id !== id);
    set({ folders: remain, assets: Object.fromEntries(Object.entries(get().assets).filter(([k]) => !k.startsWith(id + ':'))) });
    await idbSet('folders', remain);
    // Remove cached assets for this folder
    try {
      const db = await openDB();
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      store.delete(`assets_${id}`);
    } catch (e) {
      console.warn('Failed to remove cached assets', e);
    }
  },

  refreshFolder: async (id: string) => {
    const f = get().folders.find(x => x.id === id);
    if (!f) return;
    const items = await scanFolder(f.id, f.handle, 5);
    // replace entries belonging to this folder
    const others = Object.entries(get().assets).filter(([k]) => !k.startsWith(id + ':'));
    set({ assets: { ...Object.fromEntries(others), ...Object.fromEntries(items.map(a => [a.key, a])) } });
    await cacheAssets(f.id, items);
  },

  getFileForAsset: async (asset: LocalAsset) => {
    try {
      if (asset.fileHandle) {
        return await asset.fileHandle.getFile();
      }
      const folder = get().folders.find(f => f.id === asset.folderId);
      if (!folder) return undefined;
      const handle = await getFileHandle(folder.handle, asset.relativePath);
      if (!handle) return undefined;
      return await handle.getFile();
    } catch {
      return undefined;
    }
  },

  // Task 104: Update upload history for an asset and persist to cache
  updateAssetUploadStatus: async (assetKey, status, note) => {
    const asset = get().assets[assetKey];
    if (!asset) return;

    // Update in-memory asset
    const updated = {
      ...asset,
      lastUploadStatus: status,
      lastUploadNote: note,
      lastUploadAt: Date.now(),
    };

    set(s => ({
      assets: { ...s.assets, [assetKey]: updated },
    }));

    // Persist to cache so it survives page reload
    const folderId = asset.folderId;
    const folderAssets = Object.values(get().assets).filter(a => a.folderId === folderId);
    await cacheAssets(folderId, folderAssets);
  },
}));

/**
 * Thumbnail cache helpers for local assets.
 *
 * Thumbnails are stored as Blobs in the same IndexedDB "kv" store, keyed by
 * asset key and lastModified timestamp so updated files naturally invalidate
 * old thumbnails.
 */
export async function getLocalThumbnailBlob(asset: LocalAsset): Promise<Blob | undefined> {
  const version = asset.lastModified ?? 0;
  const key = `thumb_${asset.key}_${version}`;
  try {
    return await idbGet<Blob>(key);
  } catch {
    return undefined;
  }
}

export async function setLocalThumbnailBlob(asset: LocalAsset, blob: Blob): Promise<void> {
  const version = asset.lastModified ?? 0;
  const key = `thumb_${asset.key}_${version}`;
  try {
    await idbSet<Blob>(key, blob);
  } catch (e) {
    console.warn('Failed to cache local thumbnail', e);
  }
}
