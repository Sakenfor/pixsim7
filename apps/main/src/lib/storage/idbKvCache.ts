/**
 * Shared IndexedDB key-value cache helpers.
 *
 * Extracted from localFoldersStore.ts so multiple features can persist data
 * in IndexedDB without duplicating the low-level plumbing.
 *
 * Usage:
 *   import { createIdbKvStore, getUserNamespace } from '@lib/storage/idbKvCache';
 *   const store = createIdbKvStore('ps7_my_feature');
 *   await store.set(`data_${getUserNamespace()}`, payload);
 */
import { useAuthStore } from '@pixsim7/shared.auth.core';

// ---------------------------------------------------------------------------
// User namespace
// ---------------------------------------------------------------------------

/** Returns a user-scoped namespace string for keying cached data. */
export function getUserNamespace(): string {
  const userId = useAuthStore.getState().user?.id;
  return userId ? `user_${userId}` : 'anonymous';
}

// ---------------------------------------------------------------------------
// Low-level IndexedDB helpers
// ---------------------------------------------------------------------------

function openDB(dbName: string, dbVersion: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, dbVersion);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const store = tx.objectStore('kv');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet<T>(db: IDBDatabase, key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbRemove(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    const store = tx.objectStore('kv');
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

export interface IdbKvStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** Expose the underlying DB for advanced use (e.g. migrations). */
  openDB(): Promise<IDBDatabase>;
}

/**
 * Create a namespaced IndexedDB key-value store.
 *
 * Each call with a distinct `dbName` produces an isolated IndexedDB database
 * so different features don't collide.
 */
export function createIdbKvStore(dbName: string, dbVersion = 1): IdbKvStore {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function getDb(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = openDB(dbName, dbVersion);
    }
    return dbPromise;
  }

  return {
    async get<T>(key: string): Promise<T | undefined> {
      const db = await getDb();
      return idbGet<T>(db, key);
    },
    async set<T>(key: string, value: T): Promise<void> {
      const db = await getDb();
      return idbSet<T>(db, key, value);
    },
    async remove(key: string): Promise<void> {
      const db = await getDb();
      return idbRemove(db, key);
    },
    openDB: getDb,
  };
}
