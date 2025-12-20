/* Local Folders store using File System Access API (Chromium).
 * Persists directory handles in IndexedDB so each user can add their own folders.
 */
import { create } from 'zustand';
import { useAuthStore } from '@/stores/authStore';
import type {
  AssetCandidate,
  FolderCandidate,
  generateCandidateId,
  FolderSourceMetadata,
} from '../types/assetCandidate';

type DirHandle = FileSystemDirectoryHandle;
type FileHandle = FileSystemFileHandle;

/**
 * Local asset representing a file in a user's local folder.
 *
 * @deprecated Use AssetCandidate with source.type === 'folder' instead.
 * Kept for backward compatibility during migration.
 */
export type LocalAsset = FolderCandidate & {
  /** Legacy key field (maps to id) */
  key: string;
  /** Legacy handle field (transient, not persisted) */
  fileHandle?: FileHandle;
  /** Legacy folder ID field (maps to source.folderId) */
  folderId: string;
  /** Legacy relative path field (maps to source.relativePath) */
  relativePath: string;
};

type FolderEntry = {
  id: string; // stable id
  name: string;
  handle: DirHandle;
};

type ScanningState = {
  folderId: string;
  scanned: number;
  found: number;
  currentPath: string;
} | null;

type LocalFoldersState = {
  supported: boolean;
  folders: FolderEntry[];
  assets: Record<string, LocalAsset>; // key -> asset
  adding: boolean;
  scanning: ScanningState;  // Progress indicator for folder scanning
  error?: string;
  addFolder: () => Promise<void>;
  removeFolder: (id: string) => Promise<void>;
  refreshFolder: (id: string) => Promise<void>;
  loadPersisted: () => Promise<void>;
  getFileForAsset: (asset: LocalAsset) => Promise<File | undefined>;
  updateAssetHash: (assetKey: string, sha256: string, file: File) => Promise<void>;
  getUploadRecordByHash: (sha256: string) => Promise<UploadRecord | undefined>;
  setUploadRecordByHash: (sha256: string, record: UploadRecord) => Promise<void>;
  // Task 104: Update upload history for an asset
  updateAssetUploadStatus: (
    assetKey: string,
    status: 'success' | 'error',
    note?: string
  ) => Promise<void>;
};

// --- minimal IndexedDB helpers ---
const DB_VERSION = 2; // Bumped for AssetCandidate migration
const DB_NAME = 'ps7_local_folders';
const STORAGE_KEY_PREFIX = 'ps7_local_folders';

function getUserNamespace(): string {
  const userId = useAuthStore.getState().user?.id;
  return userId ? `user_${userId}` : 'anonymous';
}

function getFoldersKey(): string {
  return `${STORAGE_KEY_PREFIX}_folders_${getUserNamespace()}`;
}

function getAssetsKey(folderId: string): string {
  return `${STORAGE_KEY_PREFIX}_assets_${getUserNamespace()}_${folderId}`;
}

function getThumbnailKey(asset: LocalAsset): string {
  const version = asset.lastModified ?? 0;
  return `${STORAGE_KEY_PREFIX}_thumb_${getUserNamespace()}_${asset.key}_${version}`;
}

function getUploadsKey(): string {
  return `${STORAGE_KEY_PREFIX}_uploads_${getUserNamespace()}`;
}

async function requestStoragePersistence(): Promise<void> {
  try {
    if (navigator.storage?.persist) {
      await navigator.storage.persist();
    }
  } catch {
    // Ignore persistence request failures (best-effort).
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

      // Version 1: Initial schema
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv');
        }
      }

      // Version 2: AssetCandidate migration
      // Data migration happens in code when loading - no schema changes needed
      // (kv store is schema-less, just stores JSON)
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

// Serializable asset metadata for caching
// Version 2: Includes source metadata for AssetCandidate system
type AssetMeta = {
  // AssetCandidate fields
  id: string;
  name: string;
  kind: 'image' | 'video' | 'other';
  size?: number;
  lastModified?: number;
  source: FolderSourceMetadata;

  // Hash metadata
  sha256?: string;
  sha256_computed_at?: number;
  sha256_file_size?: number;
  sha256_last_modified?: number;

  // Upload tracking
  last_upload_status?: 'idle' | 'uploading' | 'success' | 'error';
  last_upload_note?: string;
  last_upload_at?: number;
  last_upload_provider_id?: string;
  last_upload_asset_id?: number;

  // Legacy fields (for v1 compatibility)
  key?: string; // Old ID format
  folderId?: string; // Duplicates source.folderId
  relativePath?: string; // Duplicates source.relativePath
  lastUploadStatus?: 'success' | 'error'; // Old format
  lastUploadNote?: string; // Old format
  lastUploadAt?: number; // Old format
};

type UploadRecord = {
  status: 'success';
  note?: string;
  provider_id?: string;
  uploaded_at?: number;
};

async function getUploadRecords(): Promise<Record<string, UploadRecord>> {
  return (await idbGet<Record<string, UploadRecord>>(getUploadsKey())) || {};
}

async function setUploadRecords(records: Record<string, UploadRecord>): Promise<void> {
  await idbSet(getUploadsKey(), records);
}

// Chunked folder scanning - yields to main thread every N files for responsiveness
const SCAN_CHUNK_SIZE = 50;  // Process this many files before yielding

// Helper to yield to main thread
function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

type ScanProgress = {
  scanned: number;
  found: number;
  currentPath: string;
};

async function scanFolderChunked(
  id: string,
  handle: DirHandle,
  onProgress?: (progress: ScanProgress) => void,
  depth = 5,
  prefix = '',
  stats = { scanned: 0, found: 0 }
): Promise<LocalAsset[]> {
  const out: LocalAsset[] = [];
  try {
    // @ts-expect-error: for-await supported in handles
    for await (const [name, entry] of handle.entries()) {
      const rel = prefix ? `${prefix}/${name}` : name;
      stats.scanned++;

      if (entry.kind === 'directory' && depth > 0) {
        // Recursively scan subdirectory
        const subAssets = await scanFolderChunked(id, entry as DirHandle, onProgress, depth - 1, rel, stats);
        out.push(...subAssets);
      } else if (entry.kind === 'file') {
        const fh = entry as FileHandle;
        const kind = extKind(name);
        if (kind === 'other') continue; // filter to media only

        let size: number | undefined;
        let lastModified: number | undefined;
        try {
          const f = await fh.getFile();
          size = f.size;
          lastModified = f.lastModified;
        } catch {}

        // Create FolderCandidate (with legacy LocalAsset compatibility)
        const candidateId = `${id}:${rel}`;
        const candidate: LocalAsset = {
          // AssetCandidate fields
          id: candidateId,
          name,
          kind,
          size,
          lastModified,
          source: {
            type: 'folder',
            folderId: id,
            relativePath: rel,
            handleKey: candidateId, // Use ID as handle reference
          },

          // Legacy LocalAsset compatibility fields
          key: candidateId,
          folderId: id,
          relativePath: rel,
          fileHandle: fh, // Transient, not persisted
        };

        out.push(candidate);
        stats.found++;
      }

      // Yield to main thread periodically for UI responsiveness
      if (stats.scanned % SCAN_CHUNK_SIZE === 0) {
        if (onProgress) {
          onProgress({ scanned: stats.scanned, found: stats.found, currentPath: rel });
        }
        await yieldToMain();
      }
    }
  } catch (e) {
    console.warn('scanFolder error', e);
  }
  return out;
}

// Legacy sync version for backward compatibility
async function scanFolder(id: string, handle: DirHandle, depth = 5, prefix = ''): Promise<LocalAsset[]> {
  return scanFolderChunked(id, handle, undefined, depth, prefix);
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
    const cached = await idbGet<AssetMeta[]>(getAssetsKey(id));
    if (!cached) return [];

    // For large folders, reconstructing FileSystemFileHandle for every asset on
    // startup is very expensive. Instead, return lightweight assets without
    // fileHandle and let callers resolve handles lazily when needed.
    return cached.map((meta) => {
      // Migrate v1 format to v2 (AssetCandidate format)
      if (!meta.source) {
        // Legacy v1 format - create source metadata
        const candidateId = meta.key || `${meta.folderId}:${meta.relativePath}`;
        return {
          id: candidateId,
          name: meta.name,
          kind: meta.kind,
          size: meta.size,
          lastModified: meta.lastModified,
          source: {
            type: 'folder' as const,
            folderId: meta.folderId || id,
            relativePath: meta.relativePath || '',
            handleKey: candidateId,
          },
          // Hash metadata (v2 fields)
          sha256: meta.sha256,
          sha256_computed_at: meta.sha256_computed_at,
          sha256_file_size: meta.sha256_file_size,
          sha256_last_modified: meta.sha256_last_modified,
          // Upload tracking (migrate old field names)
          last_upload_status: meta.last_upload_status || meta.lastUploadStatus,
          last_upload_note: meta.last_upload_note || meta.lastUploadNote,
          last_upload_at: meta.last_upload_at || meta.lastUploadAt,
          last_upload_provider_id: meta.last_upload_provider_id,
          last_upload_asset_id: meta.last_upload_asset_id,
          // Legacy compatibility
          key: candidateId,
          folderId: meta.folderId || id,
          relativePath: meta.relativePath || '',
          fileHandle: undefined,
        } as LocalAsset;
      }

      // V2 format - just add legacy fields
      return {
        ...meta,
        key: meta.id,
        folderId: meta.source.folderId,
        relativePath: meta.source.relativePath,
        fileHandle: undefined,
      } as LocalAsset;
    });
  } catch (e) {
    console.warn('loadCachedAssets error', e);
    return [];
  }
}

// Save assets to cache (v2: AssetCandidate format with backward compatibility)
async function cacheAssets(id: string, assets: LocalAsset[]): Promise<void> {
  try {
    const meta: AssetMeta[] = assets.map(a => ({
      // V2 AssetCandidate fields
      id: a.id,
      name: a.name,
      kind: a.kind,
      size: a.size,
      lastModified: a.lastModified,
      source: a.source,

      // Hash metadata
      sha256: a.sha256,
      sha256_computed_at: a.sha256_computed_at,
      sha256_file_size: a.sha256_file_size,
      sha256_last_modified: a.sha256_last_modified,

      // Upload tracking
      last_upload_status: a.last_upload_status,
      last_upload_note: a.last_upload_note,
      last_upload_at: a.last_upload_at,
      last_upload_provider_id: a.last_upload_provider_id,
      last_upload_asset_id: a.last_upload_asset_id,

      // Legacy compatibility (for rollback)
      key: a.key,
      folderId: a.folderId,
      relativePath: a.relativePath,
      lastUploadStatus: a.last_upload_status as 'success' | 'error' | undefined,
      lastUploadNote: a.last_upload_note,
      lastUploadAt: a.last_upload_at,
    }));
    await idbSet(getAssetsKey(id), meta);
  } catch (e) {
    console.warn('cacheAssets error', e);
  }
}

export const useLocalFolders = create<LocalFoldersState>((set, get) => ({
  supported: isFSASupported(),
  folders: [],
  assets: {},
  adding: false,
  scanning: null,
  error: undefined,

  loadPersisted: async () => {
    if (!isFSASupported()) return;
    try {
      void requestStoragePersistence();
      set({ folders: [], assets: {}, error: undefined });
      const stored = await idbGet<FolderEntry[]>(getFoldersKey());
      if (stored && stored.length) {
        // Request permission again if needed
        // IMPORTANT: Keep all folders even if permission fails - prevents data loss
        const ok: FolderEntry[] = [];
        const needsPermission: FolderEntry[] = [];
        for (const f of stored) {
          try {
            // @ts-ignore permission API
            const perm = await (f.handle as any).queryPermission?.({ mode: 'read' });
            if (perm === 'granted') {
              ok.push(f);
            } else {
              // Try to request permission
              try {
                const requested = await (f.handle as any).requestPermission?.({ mode: 'read' });
                if (requested === 'granted') {
                  ok.push(f);
                } else {
                  // Keep folder but mark as needing permission - don't lose it!
                  needsPermission.push(f);
                  console.warn(`[LocalFolders] Folder "${f.name}" needs permission re-grant`);
                }
              } catch (reqErr) {
                // Keep folder even if request fails
                needsPermission.push(f);
                console.warn(`[LocalFolders] Folder "${f.name}" permission request failed:`, reqErr);
              }
            }
          } catch (e) {
            // Keep folder even on error - don't silently lose it!
            needsPermission.push(f);
            console.warn(`[LocalFolders] Folder "${f.name}" permission check failed:`, e);
          }
        }
        // Include ALL folders in state - those needing permission just won't load assets yet
        const allFolders = [...ok, ...needsPermission];
        set({ folders: allFolders });
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
            // Background refresh to pick up any changes since last cache write (silent - no progress indicator)
            void get().refreshFolder(f.id, true);
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
      void requestStoragePersistence();
      // @ts-ignore
      const dir: DirHandle = await (window as any).showDirectoryPicker();
      const id = `${dir.name}-${Date.now()}-${getUserNamespace()}`;
      const entry: FolderEntry = { id, name: dir.name, handle: dir };
      const folders = [...get().folders, entry];
      set({ folders });
      await idbSet(getFoldersKey(), folders);

      // Use chunked scanner with progress reporting
      set({ scanning: { folderId: id, scanned: 0, found: 0, currentPath: '' } });
      const items = await scanFolderChunked(id, dir, (progress) => {
        set({ scanning: { folderId: id, ...progress } });
      }, 5);

      set(s => ({ assets: { ...s.assets, ...Object.fromEntries(items.map(a => [a.key, a])) } }));
      await cacheAssets(id, items);
    } catch (e: any) {
      if (e?.name !== 'AbortError') set({ error: e?.message || 'Failed to add folder' });
    } finally {
      set({ adding: false, scanning: null });
    }
  },

  removeFolder: async (id: string) => {
    const remain = get().folders.filter(f => f.id !== id);
    set({ folders: remain, assets: Object.fromEntries(Object.entries(get().assets).filter(([k]) => !k.startsWith(id + ':'))) });
    await idbSet(getFoldersKey(), remain);
    // Remove cached assets for this folder
    try {
      const db = await openDB();
      const tx = db.transaction('kv', 'readwrite');
      const store = tx.objectStore('kv');
      store.delete(getAssetsKey(id));
    } catch (e) {
      console.warn('Failed to remove cached assets', e);
    }
  },

  refreshFolder: async (id: string, silent = false) => {
    const f = get().folders.find(x => x.id === id);
    if (!f) return;

    // Use chunked scanner - only show progress if not silent (background refresh)
    if (!silent) {
      set({ scanning: { folderId: id, scanned: 0, found: 0, currentPath: '' } });
    }
    const items = await scanFolderChunked(f.id, f.handle, silent ? undefined : (progress) => {
      set({ scanning: { folderId: id, ...progress } });
    }, 5);
    if (!silent) {
      set({ scanning: null });
    }

    // Preserve upload history for any assets that already exist in state
    const currentAssets = get().assets;
    const merged = items.map((item) => {
      const existing = currentAssets[item.key];
      if (!existing) return item;
      return {
        ...item,
        lastUploadStatus: existing.lastUploadStatus,
        lastUploadNote: existing.lastUploadNote,
        lastUploadAt: existing.lastUploadAt,
      };
    });

    // replace entries belonging to this folder
    const others = Object.entries(currentAssets).filter(([k]) => !k.startsWith(id + ':'));
    set({
      assets: {
        ...Object.fromEntries(others),
        ...Object.fromEntries(merged.map(a => [a.key, a])),
      },
    });
    await cacheAssets(f.id, merged);
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

  updateAssetHash: async (assetKey: string, sha256: string, file: File) => {
    const asset = get().assets[assetKey];
    if (!asset) return;

    const updated = {
      ...asset,
      sha256,
      sha256_computed_at: Date.now(),
      sha256_file_size: file.size,
      sha256_last_modified: file.lastModified,
    };

    set(s => ({
      assets: { ...s.assets, [assetKey]: updated },
    }));

    const folderAssets = Object.values(get().assets).filter(a => a.folderId === updated.folderId);
    await cacheAssets(updated.folderId, folderAssets);
  },

  getUploadRecordByHash: async (sha256: string) => {
    const records = await getUploadRecords();
    return records[sha256];
  },

  setUploadRecordByHash: async (sha256: string, record: UploadRecord) => {
    const records = await getUploadRecords();
    records[sha256] = record;
    await setUploadRecords(records);
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
  const key = getThumbnailKey(asset);
  try {
    return await idbGet<Blob>(key);
  } catch {
    return undefined;
  }
}

export async function setLocalThumbnailBlob(asset: LocalAsset, blob: Blob): Promise<void> {
  const key = getThumbnailKey(asset);
  try {
    await idbSet<Blob>(key, blob);
  } catch (e) {
    console.warn('Failed to cache local thumbnail', e);
  }
}

/**
 * Generate a thumbnail from a file.
 * For images: resize to max 400px on longest side
 * For videos: extract first frame at 400px max
 */
const THUMBNAIL_MAX_SIZE = 400;

/**
 * Generate a video thumbnail by extracting a frame from the video.
 */
async function generateVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(video.src);
      video.remove();
    };

    video.onloadedmetadata = () => {
      // Seek to 0.5 seconds or 10% of duration, whichever is smaller
      const seekTime = Math.min(0.5, video.duration * 0.1);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      try {
        // Calculate thumbnail dimensions
        let width = video.videoWidth;
        let height = video.videoHeight;

        if (width > THUMBNAIL_MAX_SIZE || height > THUMBNAIL_MAX_SIZE) {
          if (width > height) {
            height = Math.round((height / width) * THUMBNAIL_MAX_SIZE);
            width = THUMBNAIL_MAX_SIZE;
          } else {
            width = Math.round((width / height) * THUMBNAIL_MAX_SIZE);
            height = THUMBNAIL_MAX_SIZE;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }

        ctx.drawImage(video, 0, 0, width, height);
        cleanup();

        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
      } catch (e) {
        console.warn('Failed to extract video frame', e);
        cleanup();
        resolve(null);
      }
    };

    video.onerror = () => {
      console.warn('Failed to load video for thumbnail');
      cleanup();
      resolve(null);
    };

    // Set a timeout to prevent hanging
    setTimeout(() => {
      cleanup();
      resolve(null);
    }, 5000);

    video.src = URL.createObjectURL(file);
  });
}

export async function generateThumbnail(file: File): Promise<Blob | null> {
  // Handle videos
  if (file.type.startsWith('video/')) {
    return generateVideoThumbnail(file);
  }

  // Handle images
  if (!file.type.startsWith('image/')) {
    return null;
  }

  try {
    // Create an image bitmap for efficient processing
    const bitmap = await createImageBitmap(file);

    // Calculate new dimensions maintaining aspect ratio
    let width = bitmap.width;
    let height = bitmap.height;

    if (width > THUMBNAIL_MAX_SIZE || height > THUMBNAIL_MAX_SIZE) {
      if (width > height) {
        height = Math.round((height / width) * THUMBNAIL_MAX_SIZE);
        width = THUMBNAIL_MAX_SIZE;
      } else {
        width = Math.round((width / height) * THUMBNAIL_MAX_SIZE);
        height = THUMBNAIL_MAX_SIZE;
      }
    }

    // Use OffscreenCanvas if available (better performance), otherwise fallback
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    } else {
      // Fallback for browsers without OffscreenCanvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
      });
    }
  } catch (e) {
    console.warn('Failed to generate thumbnail', e);
    return null;
  }
}
