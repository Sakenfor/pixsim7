/**
 * IndexedDB-based Preset Storage
 *
 * Stores overlay presets in browser's IndexedDB for offline support and larger storage capacity
 */

import type { OverlayPreset } from '../../types';
import type { PresetStorage } from '../presetManager';

const DB_NAME = 'overlay_presets';
const DB_VERSION = 1;
const STORE_NAME = 'presets';

/**
 * IndexedDB-based preset storage implementation
 *
 * Benefits over LocalStorage:
 * - Larger storage capacity (typically 50MB+)
 * - Better performance for large datasets
 * - Asynchronous operations don't block UI
 * - Structured data storage with indexing
 * - Offline-first support
 */
export class IndexedDBPresetStorage implements PresetStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initialize and open database
   */
  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      // Check if IndexedDB is available
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this environment'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error}`));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

          // Create indexes for faster queries
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('isUserCreated', 'isUserCreated', { unique: false });
          store.createIndex('name', 'name', { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Perform a transaction operation
   */
  private async transaction<T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.getDB();
    const transaction = db.transaction([STORE_NAME], mode);
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = operation(store);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error(`Transaction failed: ${request.error}`));
      };

      transaction.onerror = () => {
        reject(new Error(`Transaction error: ${transaction.error}`));
      };
    });
  }

  async save(preset: OverlayPreset): Promise<void> {
    try {
      await this.transaction('readwrite', (store) => store.put(preset));
    } catch (error) {
      console.error('Failed to save preset to IndexedDB:', error);
      throw new Error(`Failed to save preset: ${error}`);
    }
  }

  async load(id: string): Promise<OverlayPreset | null> {
    try {
      const result = await this.transaction('readonly', (store) => store.get(id));
      return result ?? null;
    } catch (error) {
      console.error('Failed to load preset from IndexedDB:', error);
      throw new Error(`Failed to load preset: ${error}`);
    }
  }

  async loadAll(): Promise<OverlayPreset[]> {
    try {
      const result = await this.transaction('readonly', (store) => store.getAll());
      return result ?? [];
    } catch (error) {
      console.error('Failed to load presets from IndexedDB:', error);
      throw new Error(`Failed to load presets: ${error}`);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.transaction('readwrite', (store) => store.delete(id));
    } catch (error) {
      console.error('Failed to delete preset from IndexedDB:', error);
      throw new Error(`Failed to delete preset: ${error}`);
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const result = await this.transaction('readonly', (store) => store.getKey(id));
      return result !== undefined;
    } catch (error) {
      console.error('Failed to check preset existence in IndexedDB:', error);
      return false;
    }
  }

  /**
   * Load presets by category
   */
  async loadByCategory(category: string): Promise<OverlayPreset[]> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('category');

      return new Promise((resolve, reject) => {
        const request = index.getAll(category);

        request.onsuccess = () => {
          resolve(request.result ?? []);
        };

        request.onerror = () => {
          reject(new Error(`Failed to load by category: ${request.error}`));
        };
      });
    } catch (error) {
      console.error('Failed to load presets by category:', error);
      throw new Error(`Failed to load by category: ${error}`);
    }
  }

  /**
   * Load only user-created presets
   */
  async loadUserPresets(): Promise<OverlayPreset[]> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('isUserCreated');

      return new Promise((resolve, reject) => {
        const request = index.getAll(true);

        request.onsuccess = () => {
          resolve(request.result ?? []);
        };

        request.onerror = () => {
          reject(new Error(`Failed to load user presets: ${request.error}`));
        };
      });
    } catch (error) {
      console.error('Failed to load user presets:', error);
      throw new Error(`Failed to load user presets: ${error}`);
    }
  }

  /**
   * Clear all presets (dangerous!)
   */
  async clear(): Promise<void> {
    try {
      await this.transaction('readwrite', (store) => store.clear());
    } catch (error) {
      console.error('Failed to clear IndexedDB:', error);
      throw new Error(`Failed to clear storage: ${error}`);
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStats(): Promise<{
    totalPresets: number;
    userPresets: number;
    systemPresets: number;
  }> {
    try {
      const allPresets = await this.loadAll();
      const userPresets = allPresets.filter((p) => p.isUserCreated);

      return {
        totalPresets: allPresets.length,
        userPresets: userPresets.length,
        systemPresets: allPresets.length - userPresets.length,
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return { totalPresets: 0, userPresets: 0, systemPresets: 0 };
    }
  }

  /**
   * Export all presets as JSON
   */
  async exportAll(): Promise<string> {
    const presets = await this.loadAll();
    return JSON.stringify(presets, null, 2);
  }

  /**
   * Import presets from JSON (merges with existing)
   */
  async importAll(json: string): Promise<number> {
    try {
      const presets = JSON.parse(json) as OverlayPreset[];

      if (!Array.isArray(presets)) {
        throw new Error('Invalid import data: expected array of presets');
      }

      let imported = 0;
      for (const preset of presets) {
        if (preset.id && preset.name && preset.configuration) {
          await this.save(preset);
          imported++;
        }
      }

      return imported;
    } catch (error) {
      console.error('Failed to import presets:', error);
      throw new Error(`Failed to import presets: ${error}`);
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise;
      db.close();
      this.dbPromise = null;
    }
  }
}
