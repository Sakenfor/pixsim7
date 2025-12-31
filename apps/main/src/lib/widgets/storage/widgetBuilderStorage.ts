/**
 * Widget Builder Storage
 *
 * Unified storage abstraction for widget configurations across all surfaces.
 * Supports localStorage, IndexedDB, and API backends.
 */

import type { WidgetInstance } from '../types';

// ============================================================================
// Types
// ============================================================================

export type WidgetSurfaceType = 'overlay' | 'blocks' | 'chrome';

export interface WidgetBuilderConfig {
  id: string;
  surface: WidgetSurfaceType;
  name: string;
  description?: string;
  instances: WidgetInstance[];
  createdAt: string;
  updatedAt: string;
  isUserCreated?: boolean;
}

export interface WidgetBuilderStorage {
  save(config: WidgetBuilderConfig): Promise<void>;
  load(id: string): Promise<WidgetBuilderConfig | null>;
  loadAll(surface?: WidgetSurfaceType): Promise<WidgetBuilderConfig[]>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
}

// ============================================================================
// LocalStorage Implementation
// ============================================================================

const STORAGE_KEY = 'widget_builder_configs';

export class LocalStorageWidgetBuilderStorage implements WidgetBuilderStorage {
  async save(config: WidgetBuilderConfig): Promise<void> {
    const configs = await this.loadAll();
    const existingIndex = configs.findIndex((c) => c.id === config.id);

    const updated: WidgetBuilderConfig = {
      ...config,
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex !== -1) {
      configs[existingIndex] = updated;
    } else {
      configs.push({
        ...updated,
        createdAt: updated.createdAt || new Date().toISOString(),
      });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  }

  async load(id: string): Promise<WidgetBuilderConfig | null> {
    const configs = await this.loadAll();
    return configs.find((c) => c.id === id) ?? null;
  }

  async loadAll(surface?: WidgetSurfaceType): Promise<WidgetBuilderConfig[]> {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    try {
      const configs: WidgetBuilderConfig[] = JSON.parse(data);
      if (surface) {
        return configs.filter((c) => c.surface === surface);
      }
      return configs;
    } catch (error) {
      console.error('[WidgetBuilderStorage] Failed to parse configs:', error);
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    const configs = await this.loadAll();
    const filtered = configs.filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  }

  async exists(id: string): Promise<boolean> {
    const config = await this.load(id);
    return config !== null;
  }
}

// ============================================================================
// IndexedDB Implementation
// ============================================================================

const DB_NAME = 'widget_builder_db';
const DB_VERSION = 1;
const STORE_NAME = 'configs';

export class IndexedDBWidgetBuilderStorage implements WidgetBuilderStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('surface', 'surface', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  async save(config: WidgetBuilderConfig): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const updated: WidgetBuilderConfig = {
        ...config,
        updatedAt: new Date().toISOString(),
        createdAt: config.createdAt || new Date().toISOString(),
      };

      const request = store.put(updated);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async load(id: string): Promise<WidgetBuilderConfig | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
    });
  }

  async loadAll(surface?: WidgetSurfaceType): Promise<WidgetBuilderConfig[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      let request: IDBRequest;
      if (surface) {
        const index = store.index('surface');
        request = index.getAll(surface);
      } else {
        request = store.getAll();
      }

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? []);
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async exists(id: string): Promise<boolean> {
    const config = await this.load(id);
    return config !== null;
  }
}

// ============================================================================
// API Implementation (uses existing pixsimClient)
// ============================================================================

import { pixsimClient } from '@lib/api';

/**
 * API-based storage using the existing pixsimClient.
 * Automatically uses the app's auth token and handles 401 redirects.
 */
export class APIWidgetBuilderStorage implements WidgetBuilderStorage {
  private basePath: string;

  constructor(basePath = '/widget-configs') {
    this.basePath = basePath;
  }

  async save(config: WidgetBuilderConfig): Promise<void> {
    const updated: WidgetBuilderConfig = {
      ...config,
      updatedAt: new Date().toISOString(),
      createdAt: config.createdAt || new Date().toISOString(),
    };

    await pixsimClient.put(`${this.basePath}/${config.id}`, updated);
  }

  async load(id: string): Promise<WidgetBuilderConfig | null> {
    try {
      return await pixsimClient.get<WidgetBuilderConfig>(`${this.basePath}/${id}`);
    } catch {
      return null;
    }
  }

  async loadAll(surface?: WidgetSurfaceType): Promise<WidgetBuilderConfig[]> {
    const query = surface ? `?surface=${surface}` : '';
    return pixsimClient.get<WidgetBuilderConfig[]>(`${this.basePath}${query}`);
  }

  async delete(id: string): Promise<void> {
    await pixsimClient.delete(`${this.basePath}/${id}`);
  }

  async exists(id: string): Promise<boolean> {
    const config = await this.load(id);
    return config !== null;
  }
}

// ============================================================================
// Factory & Global Instance
// ============================================================================

export type StorageType = 'localStorage' | 'indexedDB' | 'api';

/**
 * Create a widget builder storage instance.
 *
 * @param type - Storage backend type
 * @param apiBasePath - Base path for API storage (default: '/widget-configs')
 */
export function createWidgetBuilderStorage(
  type: StorageType,
  apiBasePath?: string
): WidgetBuilderStorage {
  switch (type) {
    case 'indexedDB':
      return new IndexedDBWidgetBuilderStorage();
    case 'api':
      return new APIWidgetBuilderStorage(apiBasePath);
    case 'localStorage':
    default:
      return new LocalStorageWidgetBuilderStorage();
  }
}

/** Default storage instance (localStorage) */
export const widgetBuilderStorage = new LocalStorageWidgetBuilderStorage();
