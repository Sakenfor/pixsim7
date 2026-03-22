/* Local Folders store using File System Access API (Chromium).
 * Persists directory handles in IndexedDB so each user can add their own folders.
 * Also syncs folder metadata to backend for recovery if IndexedDB is cleared.
 */
import { useAuthStore } from '@pixsim7/shared.auth.core';
import { create } from 'zustand';

import { getHashManifest, putHashManifest, deleteHashManifest } from '@lib/api/localFolderHashes';
import type { HashManifestEntry } from '@lib/api/localFolderHashes';
import { getUserPreferences, updatePreferenceKey } from '@lib/api/userPreferences';
import { createIdbKvStore, getUserNamespace } from '@lib/storage/idbKvCache';

import type { FolderCandidate, FolderSourceMetadata } from '../types/assetCandidate';

// --- Backend sync types ---
type SyncedFolderMeta = {
  id: string;
  name: string;
  addedAt: number;
};

const BACKEND_PREF_KEY = 'localFolders';

type DirHandle = FileSystemDirectoryHandle;
type FileHandle = FileSystemFileHandle;
type DirPermissionDescriptor = { mode?: 'read' | 'readwrite' };
type PermissionAwareDirHandle = DirHandle & {
  queryPermission?: (descriptor?: DirPermissionDescriptor) => Promise<PermissionState> | PermissionState;
  requestPermission?: (descriptor?: DirPermissionDescriptor) => Promise<PermissionState> | PermissionState;
};

declare global {
  interface Window {
    __debugLocalFolders?: () => Promise<void>;
  }
}

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
  loading: boolean; // Prevents concurrent loadPersisted calls
  scanning: ScanningState;  // Progress indicator for folder scanning
  error?: string;
  /** Folder names that exist in backend but are missing locally (IndexedDB was cleared) */
  missingFolderNames: string[];
  addFolder: () => Promise<void>;
  removeFolder: (id: string) => Promise<void>;
  refreshFolder: (id: string, silent?: boolean) => Promise<void>;
  loadPersisted: () => Promise<void>;
  getFileForAsset: (asset: LocalAsset) => Promise<File | undefined>;
  updateAssetHash: (assetKey: string, sha256: string, file: File) => Promise<void>;
  updateAssetHashesBatch: (updates: Array<{ assetKey: string; sha256: string; file: File }>) => Promise<void>;
  getUploadRecordByHash: (sha256: string) => Promise<UploadRecord | undefined>;
  setUploadRecordByHash: (sha256: string, record: UploadRecord) => Promise<void>;
  // Task 104: Update upload history for an asset
  updateAssetUploadStatus: (
    assetKey: string,
    status: 'success' | 'error',
    note?: string,
    metadata?: {
      providerId?: string;
      assetId?: number;
    }
  ) => Promise<void>;
  /** Clear the missing folders warning */
  dismissMissingFolders: () => void;
};

// --- IndexedDB via shared helpers ---
const STORAGE_KEY_PREFIX = 'ps7_local_folders';

const idbStore = createIdbKvStore('ps7_local_folders', 2);
const BACKGROUND_REFRESH_MIN_INTERVAL_MS = 1000 * 60 * 30; // 30 minutes
const BACKGROUND_REFRESH_START_DELAY_MS = 1500;

function getAnonymousNamespace(): string {
  return 'anonymous';
}

/**
 * Check if there are folders stored under the anonymous namespace
 * that should be migrated to the user's namespace.
 */
async function migrateAnonymousFolders(userId: string): Promise<FolderEntry[]> {
  const anonymousKey = `${STORAGE_KEY_PREFIX}_folders_${getAnonymousNamespace()}`;
  const userKey = `${STORAGE_KEY_PREFIX}_folders_user_${userId}`;

  try {
    const anonymousFolders = await idbGet<FolderEntry[]>(anonymousKey);
    if (!anonymousFolders || anonymousFolders.length === 0) {
      return [];
    }

    // Get existing user folders
    const userFolders = await idbGet<FolderEntry[]>(userKey) || [];
    const existingIds = new Set(userFolders.map(f => f.id));

    // Find folders to migrate (not already in user's list)
    const toMigrate = anonymousFolders.filter(f => !existingIds.has(f.id));

    if (toMigrate.length > 0) {
      // Merge and save to user namespace
      const merged = [...userFolders, ...toMigrate];
      await idbSet(userKey, merged);

      // Also migrate assets for each folder
      for (const folder of toMigrate) {
        const anonAssetsKey = `${STORAGE_KEY_PREFIX}_assets_${getAnonymousNamespace()}_${folder.id}`;
        const userAssetsKey = `${STORAGE_KEY_PREFIX}_assets_user_${userId}_${folder.id}`;
        const assets = await idbGet<AssetMeta[]>(anonAssetsKey);
        if (assets && assets.length > 0) {
          await idbSet(userAssetsKey, assets);
        }
      }

      // Clear anonymous folders after successful migration
      await idbSet(anonymousKey, []);

      console.info(`[LocalFolders] Migrated ${toMigrate.length} folders from anonymous to user namespace`);
      return toMigrate;
    }

    return [];
  } catch (e) {
    console.warn('[LocalFolders] Failed to migrate anonymous folders:', e);
    return [];
  }
}

function getFoldersKey(): string {
  return `${STORAGE_KEY_PREFIX}_folders_${getUserNamespace()}`;
}

function getAssetsKey(folderId: string): string {
  return `${STORAGE_KEY_PREFIX}_assets_${getUserNamespace()}_${folderId}`;
}

function getAssetsMetaKey(folderId: string): string {
  return `${STORAGE_KEY_PREFIX}_assets_meta_${getUserNamespace()}_${folderId}`;
}

function getThumbnailKey(asset: LocalAsset): string {
  // Use asset key + file size as cache key.  Avoid lastModified because
  // refreshFolder re-scans from disk and can report a different timestamp,
  // orphaning the cached thumbnail and forcing a slow re-generate.
  // Size is a cheap proxy: if the file content actually changed the size
  // almost certainly differs, and a re-add / folder refresh clears state anyway.
  const version = asset.size ?? 0;
  return `${STORAGE_KEY_PREFIX}_thumb_${getUserNamespace()}_${asset.key}_${version}`;
}

function getUploadsKey(): string {
  return `${STORAGE_KEY_PREFIX}_uploads_${getUserNamespace()}`;
}

async function requestStoragePersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      // Check if already persisted
      const alreadyPersisted = await navigator.storage.persisted?.();
      if (alreadyPersisted) {
        return true;
      }

      const granted = await navigator.storage.persist();
      if (!granted) {
        console.warn('[LocalFolders] Storage persistence not granted - folders may be lost under storage pressure');
      }
      return granted;
    }
    return false;
  } catch (e) {
    console.warn('[LocalFolders] Failed to request storage persistence:', e);
    return false;
  }
}

/**
 * Check if storage is persisted
 */
export async function isStoragePersisted(): Promise<boolean> {
  try {
    return await navigator.storage?.persisted?.() ?? false;
  } catch {
    return false;
  }
}

// --- Backend sync functions ---

/**
 * Sync folder metadata to backend user preferences.
 * This allows recovery of folder names if IndexedDB is cleared.
 */
async function syncFoldersToBackend(folders: FolderEntry[]): Promise<void> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return;

  try {
    const syncedFolders: SyncedFolderMeta[] = folders.map(f => ({
      id: f.id,
      name: f.name,
      addedAt: Date.now(),
    }));
    await updatePreferenceKey(BACKEND_PREF_KEY, syncedFolders);
    console.debug('[LocalFolders] Synced to backend:', syncedFolders.length, 'folders');
  } catch (e) {
    console.warn('[LocalFolders] Failed to sync to backend:', e);
  }
}

/**
 * Get folder metadata from backend.
 * Returns folder names that were previously added but may be missing from IndexedDB.
 */
async function getFoldersFromBackend(): Promise<SyncedFolderMeta[]> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return [];

  try {
    const prefs = await getUserPreferences();
    const synced = prefs?.[BACKEND_PREF_KEY] as SyncedFolderMeta[] | undefined;
    return synced ?? [];
  } catch (e) {
    console.warn('[LocalFolders] Failed to get folders from backend:', e);
    return [];
  }
}

/**
 * Get list of folder names that exist in backend but are missing locally.
 */
export async function getMissingFolderNames(): Promise<string[]> {
  const backendFolders = await getFoldersFromBackend();
  const localFolders = useLocalFolders.getState().folders;
  const localIds = new Set(localFolders.map(f => f.id));

  return backendFolders
    .filter(f => !localIds.has(f.id))
    .map(f => f.name);
}

// Thin wrappers so call-sites stay unchanged
async function idbGet<T>(key: string): Promise<T | undefined> {
  return idbStore.get<T>(key);
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  return idbStore.set<T>(key, value);
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
  kind: 'image' | 'video' | 'audio' | 'other';
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
  asset_id?: number;
  uploaded_at?: number;
};

type FolderAssetCacheMeta = {
  cachedAt: number;
  assetCount: number;
};

async function getUploadRecords(): Promise<Record<string, UploadRecord>> {
  return (await idbGet<Record<string, UploadRecord>>(getUploadsKey())) || {};
}

async function setUploadRecords(records: Record<string, UploadRecord>): Promise<void> {
  await idbSet(getUploadsKey(), records);
}

// Chunked folder scanning - yields to main thread every N files for responsiveness
const SCAN_CHUNK_SIZE = 50;  // Process this many files before yielding
const SCAN_REUSE_METADATA_VERIFY_EVERY = 250; // sample reused entries for drift detection

// Helper to yield to main thread
function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

type ScanProgress = {
  scanned: number;
  found: number;
  currentPath: string;
};

type ScanMetadataMode = 'full' | 'reuse';

type ScanOptions = {
  /**
   * - full: read each media file to collect fresh size/mtime metadata
   * - reuse: reuse cached metadata for known keys; read from disk only for new keys
   */
  metadataMode?: ScanMetadataMode;
  existingMetadataByKey?: Map<string, { size?: number; lastModified?: number }>;
};

async function scanFolderChunked(
  id: string,
  handle: DirHandle,
  onProgress?: (progress: ScanProgress) => void,
  depth = 5,
  prefix = '',
  stats = { scanned: 0, found: 0 },
  options?: ScanOptions,
): Promise<LocalAsset[]> {
  const out: LocalAsset[] = [];
  const metadataMode = options?.metadataMode ?? 'full';
  try {
    // @ts-expect-error: for-await supported in handles
    for await (const [name, entry] of handle.entries()) {
      const rel = prefix ? `${prefix}/${name}` : name;
      stats.scanned++;

      if (entry.kind === 'directory' && depth > 0) {
        // Recursively scan subdirectory
        const subAssets = await scanFolderChunked(
          id,
          entry as DirHandle,
          onProgress,
          depth - 1,
          rel,
          stats,
          options,
        );
        out.push(...subAssets);
      } else if (entry.kind === 'file') {
        const fh = entry as FileHandle;
        const kind = extKind(name);
        if (kind === 'other') continue; // filter to media only

        const candidateId = `${id}:${rel}`;
        let size: number | undefined;
        let lastModified: number | undefined;

        // Reuse metadata for known keys during silent/background refreshes to
        // avoid opening every file. New files still get metadata from disk.
        const existingMeta = options?.existingMetadataByKey?.get(candidateId);
        const canReuseExistingMeta = (
          metadataMode === 'reuse' &&
          typeof existingMeta?.size === 'number' &&
          typeof existingMeta?.lastModified === 'number'
        );
        const shouldVerifyReusedMetadata = (
          canReuseExistingMeta &&
          stats.scanned % SCAN_REUSE_METADATA_VERIFY_EVERY === 0
        );

        if (canReuseExistingMeta && !shouldVerifyReusedMetadata) {
          size = existingMeta?.size;
          lastModified = existingMeta?.lastModified;
        } else {
          try {
            const f = await fh.getFile();
            size = f.size;
            lastModified = f.lastModified;
          } catch (error) {
            console.warn('scanFolderChunked: unable to read file metadata', error);
          }
        }

        // Create FolderCandidate (with legacy LocalAsset compatibility)
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
async function loadCachedAssets(id: string): Promise<LocalAsset[]> {
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
    const now = Date.now();
    await Promise.all([
      idbSet(getAssetsKey(id), meta),
      idbSet<FolderAssetCacheMeta>(getAssetsMetaKey(id), {
        cachedAt: now,
        assetCount: meta.length,
      }),
    ]);
  } catch (e) {
    console.warn('cacheAssets error', e);
  }
}

// Hash metadata updates can happen in large bursts; persist them in short batches
// to avoid rewriting full folder metadata on every single hashed file.
const HASH_CACHE_FLUSH_DELAY_MS = 1200;
const HASH_BACKEND_SYNC_DELAY_MS = 5000; // longer debounce for backend sync
const pendingHashCacheFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingHashBackendSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Sync hash manifest for a folder to the backend so hashes survive browser data clears.
 */
function scheduleHashBackendSync(folderId: string): void {
  const existing = pendingHashBackendSyncTimers.get(folderId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    pendingHashBackendSyncTimers.delete(folderId);
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return; // only sync for logged-in users

    void (async () => {
      try {
        const folderAssets = Object.values(useLocalFolders.getState().assets)
          .filter((a) => a.folderId === folderId && a.sha256);
        const manifest: HashManifestEntry[] = folderAssets.map((a) => ({
          relativePath: a.relativePath,
          sha256: a.sha256!,
          fileSize: a.sha256_file_size ?? undefined,
          lastModified: a.sha256_last_modified ?? undefined,
        }));
        await putHashManifest(folderId, manifest);
        console.debug('[LocalFolders] Synced hash manifest to backend:', folderId, manifest.length, 'entries');
      } catch (e) {
        console.warn('[LocalFolders] Failed to sync hash manifest to backend:', folderId, e);
      }
    })();
  }, HASH_BACKEND_SYNC_DELAY_MS);

  pendingHashBackendSyncTimers.set(folderId, timer);
}

function scheduleHashCacheFlush(folderId: string): void {
  const existing = pendingHashCacheFlushTimers.get(folderId);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    pendingHashCacheFlushTimers.delete(folderId);
    void (async () => {
      try {
        const folderAssets = Object.values(useLocalFolders.getState().assets)
          .filter((asset) => asset.folderId === folderId);
        await cacheAssets(folderId, folderAssets);
      } catch (e) {
        console.warn('Failed to flush hash cache for folder', folderId, e);
      }
    })();
  }, HASH_CACHE_FLUSH_DELAY_MS);

  pendingHashCacheFlushTimers.set(folderId, timer);
  // Also schedule a backend sync (with a longer debounce)
  scheduleHashBackendSync(folderId);
}

/**
 * Debug helper - call from browser console: window.__debugLocalFolders()
 * Shows all IndexedDB entries for local folders across all namespaces.
 */
async function debugLocalFolders(): Promise<void> {
  try {
    const db = await idbStore.openDB();
    const tx = db.transaction('kv', 'readonly');
    const store = tx.objectStore('kv');

    const allKeys = await new Promise<string[]>((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => reject(req.error);
    });

    const folderKeys = allKeys.filter(k => k.includes('_folders_'));
    console.group('[LocalFolders Debug] IndexedDB Contents');
    console.info('Current namespace:', getUserNamespace());
    console.info('Current userId:', useAuthStore.getState().user?.id ?? 'none');

    for (const key of folderKeys) {
      const value = await idbGet<FolderEntry[]>(key);
      console.info(`${key}:`, value?.map(f => ({ id: f.id, name: f.name })) ?? 'empty');
    }
    console.groupEnd();
  } catch (e) {
    console.error('[LocalFolders Debug] Error:', e);
  }
}

// Expose to window for debugging
if (typeof window !== 'undefined') {
  window.__debugLocalFolders = debugLocalFolders;
}

export const useLocalFolders = create<LocalFoldersState>((set, get) => ({
  supported: isFSASupported(),
  folders: [],
  assets: {},
  adding: false,
  loading: false,
  scanning: null,
  error: undefined,
  missingFolderNames: [], // Folders in backend but missing locally (IndexedDB cleared)

  loadPersisted: async () => {
    if (!isFSASupported()) return;
    // Prevent concurrent loads - this was causing race conditions where
    // state was cleared before IndexedDB load completed
    if (get().loading) return;
    try {
      set({ loading: true, error: undefined });
      // Best-effort persistence request - don't block on result
      requestStoragePersistence().catch(() => {});

      // Migrate any folders from anonymous namespace to user namespace
      const userId = useAuthStore.getState().user?.id;
      if (userId) {
        await migrateAnonymousFolders(userId);
      }

      const foldersKey = getFoldersKey();
      const namespace = getUserNamespace();
      console.info('[LocalFolders] loadPersisted called:', {
        key: foldersKey,
        namespace,
        userId: useAuthStore.getState().user?.id ?? 'none',
        isAnonymous: namespace === 'anonymous',
      });
      const stored = await idbGet<FolderEntry[]>(foldersKey);
      console.info('[LocalFolders] Loaded from IndexedDB:', {
        count: stored?.length ?? 0,
        folders: stored?.map(f => ({ id: f.id, name: f.name })) ?? [],
      });

      if (stored && stored.length) {
        // Show folder names in the UI immediately — permission checks come next
        set({ folders: stored });

        // Check permissions in parallel instead of one-by-one
        const permResults = await Promise.all(
          stored.map(async (f): Promise<{ folder: FolderEntry; granted: boolean }> => {
            try {
              const permissionHandle = f.handle as PermissionAwareDirHandle;
              const perm = await permissionHandle.queryPermission?.({ mode: 'read' });
              if (perm === 'granted') return { folder: f, granted: true };
              try {
                const requested = await permissionHandle.requestPermission?.({ mode: 'read' });
                if (requested === 'granted') return { folder: f, granted: true };
              } catch (reqErr) {
                console.warn(`[LocalFolders] Folder "${f.name}" permission request failed:`, reqErr);
              }
              console.warn(`[LocalFolders] Folder "${f.name}" needs permission re-grant`);
              return { folder: f, granted: false };
            } catch (e) {
              console.warn(`[LocalFolders] Folder "${f.name}" permission check failed:`, e);
              return { folder: f, granted: false };
            }
          }),
        );

        const ok = permResults.filter((r) => r.granted).map((r) => r.folder);
        // Load all folder caches in parallel, then batch-set assets in one update
        // so the UI doesn't stagger folder-by-folder.
        const now = Date.now();
        const cacheResults = await Promise.all(
          ok.map(async (f) => {
            const [items, cacheMeta] = await Promise.all([
              loadCachedAssets(f.id),
              idbGet<FolderAssetCacheMeta>(getAssetsMetaKey(f.id)),
            ]);
            return { folder: f, items, cacheMeta };
          }),
        );

        const allCachedAssets: Record<string, LocalAsset> = {};
        const foldersNeedingScan: FolderEntry[] = [];
        const staleCachedFolderIds: string[] = [];
        for (const { folder, items, cacheMeta } of cacheResults) {
          if (items.length > 0) {
            for (const a of items) allCachedAssets[a.key] = a;
            const cachedAt = cacheMeta?.cachedAt ?? 0;
            const isStale = !cachedAt || (now - cachedAt) >= BACKGROUND_REFRESH_MIN_INTERVAL_MS;
            if (isStale) {
              staleCachedFolderIds.push(folder.id);
            }
          } else {
            foldersNeedingScan.push(folder);
          }
        }

        // Single state update for all cached assets
        if (Object.keys(allCachedAssets).length > 0) {
          set(s => ({ assets: { ...s.assets, ...allCachedAssets } }));
        }

        // Refresh stale cached folders in the background, sequentially.
        // Avoid kicking a full disk walk for every cached folder on startup.
        if (staleCachedFolderIds.length > 0) {
          window.setTimeout(() => {
            void (async () => {
              for (const folderId of staleCachedFolderIds) {
                try {
                  await get().refreshFolder(folderId, true);
                } catch (e) {
                  console.warn('Background local folder refresh failed', folderId, e);
                }
                await yieldToMain();
              }
            })();
          }, BACKGROUND_REFRESH_START_DELAY_MS);
        }

        // Folders without cache need a full scan (parallel, then single merge).
        // Also try to restore hashes from backend so we skip re-hashing.
        if (foldersNeedingScan.length > 0) {
          const scanResults = await Promise.all(
            foldersNeedingScan.map(async (f) => {
              const [items, backendManifest] = await Promise.all([
                scanFolder(f.id, f.handle, 5),
                getHashManifest(f.id).catch(() => null),
              ]);

              // Apply backend hashes to scanned items by matching relativePath + size + lastModified
              if (backendManifest?.manifest?.length) {
                const hashLookup = new Map(
                  backendManifest.manifest.map((e) => [e.relativePath, e]),
                );
                for (const item of items) {
                  const entry = hashLookup.get(item.relativePath);
                  if (
                    entry &&
                    typeof item.size === 'number' &&
                    typeof item.lastModified === 'number' &&
                    entry.fileSize === item.size &&
                    entry.lastModified === item.lastModified
                  ) {
                    item.sha256 = entry.sha256;
                    item.sha256_file_size = entry.fileSize ?? undefined;
                    item.sha256_last_modified = entry.lastModified ?? undefined;
                    item.sha256_computed_at = Date.now(); // mark as restored
                  }
                }
                const restored = items.filter((a) => a.sha256).length;
                if (restored > 0) {
                  console.debug(`[LocalFolders] Restored ${restored} hashes from backend for folder "${f.name}"`);
                }
              }

              void cacheAssets(f.id, items);
              return items;
            }),
          );
          const scannedAssets: Record<string, LocalAsset> = {};
          for (const items of scanResults) {
            for (const a of items) scannedAssets[a.key] = a;
          }
          if (Object.keys(scannedAssets).length > 0) {
            set(s => ({ assets: { ...s.assets, ...scannedAssets } }));
          }
        }
      }
      // Check for folders in backend that are missing locally
      const backendFolders = await getFoldersFromBackend();
      const localIds = new Set(get().folders.map(f => f.id));
      const missing = backendFolders
        .filter(f => !localIds.has(f.id))
        .map(f => f.name);

      if (missing.length > 0) {
        console.warn('[LocalFolders] Folders missing locally but exist in backend:', missing);
        set({ missingFolderNames: missing });
      }

      set({ loading: false });
    } catch (e: unknown) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load persisted folders' });
    }
  },

  addFolder: async () => {
    if (!isFSASupported()) {
      set({ error: 'Your browser does not support local folder access. Use Chrome/Edge.' });
      return;
    }
    // Warn if adding folder without being logged in - data will be in anonymous namespace
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      console.warn('[LocalFolders] Adding folder without logged-in user - will be stored in anonymous namespace');
    }
    set({ adding: true, error: undefined });
    try {
      const persistenceGranted = await requestStoragePersistence();
      const pickerWindow = window as Window & { showDirectoryPicker: () => Promise<DirHandle> };
      const dir: DirHandle = await pickerWindow.showDirectoryPicker();
      const namespace = getUserNamespace();
      const id = `${dir.name}-${Date.now()}-${namespace}`;
      const entry: FolderEntry = { id, name: dir.name, handle: dir };
      const folders = [...get().folders, entry];
      set({ folders });
      const foldersKey = getFoldersKey();
      console.info('[LocalFolders] Adding folder:', {
        name: dir.name,
        id,
        namespace,
        key: foldersKey,
        totalFolders: folders.length,
        storagePersisted: persistenceGranted,
      });
      await idbSet(foldersKey, folders);

      // Use chunked scanner with progress reporting
      set({ scanning: { folderId: id, scanned: 0, found: 0, currentPath: '' } });
      const items = await scanFolderChunked(id, dir, (progress) => {
        set({ scanning: { folderId: id, ...progress } });
      }, 5);

      set(s => ({ assets: { ...s.assets, ...Object.fromEntries(items.map(a => [a.key, a])) } }));
      await cacheAssets(id, items);

      // Sync folder list to backend for recovery
      void syncFoldersToBackend(folders);
    } catch (e: unknown) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        const errorMessage = e instanceof Error ? e.message : 'Failed to add folder';
        set({ error: errorMessage });
      }
    } finally {
      set({ adding: false, scanning: null });
    }
  },

  removeFolder: async (id: string) => {
    const remain = get().folders.filter(f => f.id !== id);
    set({ folders: remain, assets: Object.fromEntries(Object.entries(get().assets).filter(([k]) => !k.startsWith(id + ':'))) });
    await idbSet(getFoldersKey(), remain);
    const pendingHashFlush = pendingHashCacheFlushTimers.get(id);
    if (pendingHashFlush) {
      clearTimeout(pendingHashFlush);
      pendingHashCacheFlushTimers.delete(id);
    }
    const pendingBackendSync = pendingHashBackendSyncTimers.get(id);
    if (pendingBackendSync) {
      clearTimeout(pendingBackendSync);
      pendingHashBackendSyncTimers.delete(id);
    }
    // Remove cached assets for this folder
    try {
      await Promise.all([
        idbStore.remove(getAssetsKey(id)),
        idbStore.remove(getAssetsMetaKey(id)),
      ]);
    } catch (e) {
      console.warn('Failed to remove cached assets', e);
    }
    // Sync updated folder list to backend & remove hash manifest
    void syncFoldersToBackend(remain);
    void deleteHashManifest(id).catch((e) =>
      console.warn('[LocalFolders] Failed to delete backend hash manifest:', id, e),
    );
  },

  refreshFolder: async (id: string, silent = false) => {
    const f = get().folders.find(x => x.id === id);
    if (!f) return;

    const currentAssets = get().assets;
    let existingMetadataByKey: Map<string, { size?: number; lastModified?: number }> | undefined;
    if (silent) {
      // Silent refresh runs on startup/background. Reuse cached metadata for
      // unchanged keys to avoid costly getFile() per file.
      existingMetadataByKey = new Map();
      const folderPrefix = `${id}:`;
      for (const [key, asset] of Object.entries(currentAssets)) {
        if (!key.startsWith(folderPrefix)) continue;
        existingMetadataByKey.set(key, {
          size: asset.size,
          lastModified: asset.lastModified,
        });
      }
    }

    // Use chunked scanner - only show progress if not silent (background refresh)
    if (!silent) {
      set({ scanning: { folderId: id, scanned: 0, found: 0, currentPath: '' } });
    }
    const items = await scanFolderChunked(
      f.id,
      f.handle,
      silent
        ? undefined
        : (progress) => {
            set({ scanning: { folderId: id, ...progress } });
          },
      5,
      '',
      { scanned: 0, found: 0 },
      {
        metadataMode: silent ? 'reuse' : 'full',
        existingMetadataByKey,
      },
    );
    if (!silent) {
      set({ scanning: null });
    }

    // Preserve upload history for any assets that already exist in state
    const merged = items.map((item) => {
      const existing = currentAssets[item.key];
      if (!existing) return item;

      // Preserve hash metadata only when file metadata still matches.
      // This prevents dropping hashes on every refresh while avoiding stale hashes.
      const canReuseHash = (
        typeof item.size === 'number' &&
        typeof item.lastModified === 'number' &&
        !!existing.sha256 &&
        existing.sha256_file_size === item.size &&
        existing.sha256_last_modified === item.lastModified
      );

      return {
        ...item,
        ...(canReuseHash ? {
          sha256: existing.sha256,
          sha256_computed_at: existing.sha256_computed_at,
          sha256_file_size: existing.sha256_file_size,
          sha256_last_modified: existing.sha256_last_modified,
        } : {}),
        last_upload_status: existing.last_upload_status,
        last_upload_note: existing.last_upload_note,
        last_upload_at: existing.last_upload_at,
        last_upload_provider_id: existing.last_upload_provider_id,
        last_upload_asset_id: existing.last_upload_asset_id,
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
    await get().updateAssetHashesBatch([{ assetKey, sha256, file }]);
  },

  updateAssetHashesBatch: async (updates) => {
    if (!updates.length) return;

    const currentAssets = get().assets;
    const nextAssets = { ...currentAssets };
    const touchedFolders = new Set<string>();

    for (const update of updates) {
      const asset = nextAssets[update.assetKey];
      if (!asset) continue;

      nextAssets[update.assetKey] = {
        ...asset,
        sha256: update.sha256,
        sha256_computed_at: Date.now(),
        sha256_file_size: update.file.size,
        sha256_last_modified: update.file.lastModified,
      };
      touchedFolders.add(asset.folderId);
    }

    set({ assets: nextAssets });

    for (const folderId of touchedFolders) {
      scheduleHashCacheFlush(folderId);
    }
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
  updateAssetUploadStatus: async (assetKey, status, note, metadata) => {
    const asset = get().assets[assetKey];
    if (!asset) return;

    // Update in-memory asset
    const updated = {
      ...asset,
      last_upload_status: status,
      last_upload_note: note,
      last_upload_at: Date.now(),
      last_upload_provider_id: metadata?.providerId ?? asset.last_upload_provider_id,
      last_upload_asset_id: metadata?.assetId ?? asset.last_upload_asset_id,
    };

    set(s => ({
      assets: { ...s.assets, [assetKey]: updated },
    }));

    // Persist to cache so it survives page reload
    const folderId = asset.folderId;
    const folderAssets = Object.values(get().assets).filter(a => a.folderId === folderId);
    await cacheAssets(folderId, folderAssets);
  },

  dismissMissingFolders: () => {
    set({ missingFolderNames: [] });
  },
}));

// Debug: expose store on window for console inspection
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__localFolders = useLocalFolders;

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
