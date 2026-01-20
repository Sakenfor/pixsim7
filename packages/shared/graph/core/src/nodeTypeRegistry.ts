/**
 * Node Type Registry
 * Allows dynamic registration of custom node types without modifying core types
 *
 * Performance optimizations:
 * - LRU cache for frequently accessed types (max 50 entries)
 * - Lazy loading support for plugin-based types
 * - Category indexing for fast lookups
 */

import type { NodeTypeDefinition, NodeTypeRegistryOptions } from '@pixsim7/shared.types';

export type {
  NodeTypeDefinition,
  NodeTypeRegistryOptions,
  PortConfig,
  PortDefinition,
} from '@pixsim7/shared.types';

/**
 * LRU Cache for frequently accessed node types
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Remove if already exists (to update position)
    this.cache.delete(key);

    // Add to end
    this.cache.set(key, value);

    // Evict oldest if over capacity
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value as K;
      this.cache.delete(firstKey);
    }
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export class NodeTypeRegistry {
  private types = new Map<string, NodeTypeDefinition>();
  private categoryIndex = new Map<string, Set<string>>(); // category -> type IDs
  private scopeIndex = new Map<string, Set<string>>(); // scope -> type IDs
  private cache = new LRUCache<string, NodeTypeDefinition>(50);
  private loadingPromises = new Map<string, Promise<NodeTypeDefinition>>();
  private preloadedIds = new Set<string>();
  private duplicatePolicy: 'warn' | 'error';

  constructor(options: NodeTypeRegistryOptions = {}) {
    this.duplicatePolicy = options.duplicatePolicy ?? 'warn';
  }

  /** Register a node type */
  register<TData = any>(def: NodeTypeDefinition<TData>) {
    if (this.types.has(def.id)) {
      const message = `Node type ${def.id} already registered`;
      if (this.duplicatePolicy === 'error') {
        throw new Error(message);
      }
      console.warn(`${message}, overwriting`);
      // Remove from old indexes
      this.removeFromCategoryIndex(def.id);
      this.removeFromScopeIndex(def.id);
    }

    this.types.set(def.id, def);

    // Update category index
    if (def.category) {
      if (!this.categoryIndex.has(def.category)) {
        this.categoryIndex.set(def.category, new Set());
      }
      this.categoryIndex.get(def.category)!.add(def.id);
    }

    // Update scope index
    if (def.scope) {
      if (!this.scopeIndex.has(def.scope)) {
        this.scopeIndex.set(def.scope, new Set());
      }
      this.scopeIndex.get(def.scope)!.add(def.id);
    }

    // Clear cache for this ID (will be repopulated on next access)
    if (this.cache.has(def.id)) {
      this.cache.set(def.id, def);
    }
  }

  /** Configure how duplicate registrations are handled */
  setDuplicatePolicy(policy: 'warn' | 'error'): void {
    this.duplicatePolicy = policy;
  }

  /** Get node type definition (with caching and lazy loading) */
  async get(id: string): Promise<NodeTypeDefinition | undefined> {
    // Check cache first
    const cached = this.cache.get(id);
    if (cached) {
      return cached;
    }

    // Check if type is registered
    const type = this.types.get(id);
    if (!type) {
      return undefined;
    }

    // If has loader and not loaded yet, load it
    if (type.loader && !this.preloadedIds.has(id)) {
      return this.loadType(id);
    }

    // Cache and return
    this.cache.set(id, type);
    return type;
  }

  /** Synchronous get (use when you know the type is loaded) */
  getSync(id: string): NodeTypeDefinition | undefined {
    // Check cache first
    const cached = this.cache.get(id);
    if (cached) {
      return cached;
    }

    const type = this.types.get(id);
    if (type && !type.loader) {
      this.cache.set(id, type);
    }
    return type;
  }

  /** Load a lazy-loaded type */
  private async loadType(id: string): Promise<NodeTypeDefinition | undefined> {
    // Check if already loading
    if (this.loadingPromises.has(id)) {
      return this.loadingPromises.get(id);
    }

    const type = this.types.get(id);
    if (!type || !type.loader) {
      return type;
    }

    // Start loading
    const loadPromise = type.loader()
      .then(loadedType => {
        // Replace the stub with the loaded definition
        this.types.set(id, loadedType);
        this.cache.set(id, loadedType);
        this.preloadedIds.add(id);
        this.loadingPromises.delete(id);
        return loadedType;
      })
      .catch(error => {
        console.error(`Failed to load node type ${id}:`, error);
        this.loadingPromises.delete(id);
        return type; // Return stub on error
      });

    this.loadingPromises.set(id, loadPromise);
    return loadPromise;
  }

  /** Preload types by priority or IDs */
  async preload(ids?: string[]): Promise<void> {
    const toPreload = ids || this.getPreloadCandidates();

    await Promise.all(
      toPreload.map(id => this.loadType(id))
    );
  }

  /** Get types that should be preloaded */
  private getPreloadCandidates(): string[] {
    const types = Array.from(this.types.values());
    return types
      .filter(t => t.loader && !this.preloadedIds.has(t.id))
      .sort((a, b) => (b.preloadPriority || 0) - (a.preloadPriority || 0))
      .map(t => t.id)
      .slice(0, 10); // Preload top 10
  }

  /** Get all registered types (synchronous, may include lazy stubs) */
  getAll(): NodeTypeDefinition[] {
    return Array.from(this.types.values());
  }

  /** Get types by category (optimized with index) */
  getByCategory(category: string): NodeTypeDefinition[] {
    const ids = this.categoryIndex.get(category);
    if (!ids) {
      return [];
    }

    return Array.from(ids)
      .map(id => this.types.get(id))
      .filter((t): t is NodeTypeDefinition => t !== undefined);
  }

  /** Get types by scope (optimized with index) */
  getByScope(scope: string): NodeTypeDefinition[] {
    const ids = this.scopeIndex.get(scope);
    if (!ids) {
      return [];
    }

    return Array.from(ids)
      .map(id => this.types.get(id))
      .filter((t): t is NodeTypeDefinition => t !== undefined);
  }

  /** Get types by multiple scopes */
  getByScopes(scopes: string[]): NodeTypeDefinition[] {
    const allIds = new Set<string>();

    for (const scope of scopes) {
      const ids = this.scopeIndex.get(scope);
      if (ids) {
        ids.forEach(id => allIds.add(id));
      }
    }

    return Array.from(allIds)
      .map(id => this.types.get(id))
      .filter((t): t is NodeTypeDefinition => t !== undefined);
  }

  /** Get user-creatable types */
  getUserCreatable(): NodeTypeDefinition[] {
    return this.getAll().filter(t => t.userCreatable !== false);
  }

  /** Check if type exists */
  has(id: string): boolean {
    return this.types.has(id);
  }

  /** Remove a node type and clean indexes */
  unregister(id: string): boolean {
    if (!this.types.has(id)) {
      return false;
    }

    this.types.delete(id);
    this.removeFromCategoryIndex(id);
    this.removeFromScopeIndex(id);
    this.cache.clear();
    this.preloadedIds.delete(id);
    this.loadingPromises.delete(id);
    return true;
  }

  /** Remove type from category index */
  private removeFromCategoryIndex(id: string): void {
    for (const [category, ids] of this.categoryIndex.entries()) {
      if (ids.has(id)) {
        ids.delete(id);
        if (ids.size === 0) {
          this.categoryIndex.delete(category);
        }
      }
    }
  }

  /** Remove type from scope index */
  private removeFromScopeIndex(id: string): void {
    for (const [scope, ids] of this.scopeIndex.entries()) {
      if (ids.has(id)) {
        ids.delete(id);
        if (ids.size === 0) {
          this.scopeIndex.delete(scope);
        }
      }
    }
  }

  /** Clear cache (useful for testing/debugging) */
  clearCache(): void {
    this.cache.clear();
  }

  /** Get cache statistics */
  getCacheStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: 50,
    };
  }
}

/** Global registry instance */
export const nodeTypeRegistry = new NodeTypeRegistry({ duplicatePolicy: 'error' });
