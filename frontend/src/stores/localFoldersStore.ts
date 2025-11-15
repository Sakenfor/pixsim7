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
  fileHandle: FileHandle;
  folderId: string;
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
        // index in background (deeper scan for tree view)
        for (const f of ok) {
          const items = await scanFolder(f.id, f.handle, 5);
          set(s => ({ assets: { ...s.assets, ...Object.fromEntries(items.map(a => [a.key, a])) } }));
        }
      }
    } catch (e: any) {
      set({ error: e?.message || 'Failed to load persisted folders' });
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
  },

  refreshFolder: async (id: string) => {
    const f = get().folders.find(x => x.id === id);
    if (!f) return;
    const items = await scanFolder(f.id, f.handle, 5);
    // replace entries belonging to this folder
    const others = Object.entries(get().assets).filter(([k]) => !k.startsWith(id + ':'));
    set({ assets: { ...Object.fromEntries(others), ...Object.fromEntries(items.map(a => [a.key, a])) } });
  },
}));
