/**
 * BaseRegistry - Generic base class for UI registries
 *
 * Provides common functionality for map-based registries with listeners.
 * Part of Task 91 - UI Registry Base & Feature Normalization
 *
 * ## ARCHITECTURAL REQUIREMENT
 *
 * **All new frontend registries MUST extend this class.**
 *
 * If you're creating a registry that doesn't extend BaseRegistry, you need:
 *   1. A documented justification in the file header
 *   2. Code review approval from architecture owner
 *
 * ### Existing Non-Compliant Registries (tracked for migration)
 *
 * | Registry | Status | Justification |
 * |----------|--------|---------------|
 * | SettingsRegistry | Migrated | Extends BaseRegistry |
 * | NodeTypeRegistry | Justified | Needs LRU cache + lazy loading |
 * | GalleryToolRegistry | TODO: migrate | No blocking reason |
 * | BrainToolRegistry | TODO: migrate | No blocking reason |
 * | WorldToolRegistry | TODO: migrate | No blocking reason |
 * | CapabilityRegistry | Justified | Factory pattern for multi-provider |
 * | GatingRegistry | TODO: migrate | No blocking reason |
 *
 * @see docs/guides/registry-patterns.md - Frontend registry checklist
 */

/**
 * Interface for items that can be stored in a registry
 */
export interface Identifiable {
  id: string;
}

/**
 * BaseRegistry<T> - Generic registry for identifiable items
 *
 * Provides:
 * - CRUD operations (register, unregister, get, getAll, has, clear)
 * - Listener/subscription support (subscribe, notifyListeners)
 * - Duplicate ID warning on registration
 *
 * Subclasses can extend this to add domain-specific features like:
 * - Search functionality
 * - Category filtering
 * - Statistics
 * - Lifecycle hooks
 */
export class BaseRegistry<T extends Identifiable> {
  /**
   * Internal storage for registered items
   */
  protected items: Map<string, T> = new Map();

  /**
   * Listeners that are notified when the registry changes
   */
  protected listeners: Set<() => void> = new Set();

  /**
   * Register an item in the registry
   * If an item with the same ID already exists, it will be skipped.
   * Use forceRegister() to overwrite existing items.
   *
   * @param item - The item to register
   * @returns true if registered, false if already existed
   */
  register(item: T): boolean {
    if (this.items.has(item.id)) {
      return false;
    }
    this.items.set(item.id, item);
    this.notifyListeners();
    return true;
  }

  /**
   * Register an item, overwriting if it already exists.
   * Use this for intentional updates/reloads.
   *
   * @param item - The item to register
   */
  forceRegister(item: T): void {
    this.items.set(item.id, item);
    this.notifyListeners();
  }

  /**
   * Unregister an item from the registry
   *
   * @param id - The ID of the item to unregister
   * @returns true if the item was found and removed, false otherwise
   */
  unregister(id: string): boolean {
    const wasDeleted = this.items.delete(id);
    if (wasDeleted) {
      this.notifyListeners();
    }
    return wasDeleted;
  }

  /**
   * Get an item by ID
   *
   * @param id - The ID of the item to retrieve
   * @returns The item if found, undefined otherwise
   */
  get(id: string): T | undefined {
    return this.items.get(id);
  }

  /**
   * Get all registered items
   *
   * @returns Array of all registered items
   */
  getAll(): T[] {
    return Array.from(this.items.values());
  }

  /**
   * Get all registered item IDs
   *
   * @returns Array of all registered IDs
   */
  getIds(): string[] {
    return Array.from(this.items.keys());
  }

  /**
   * Get the number of registered items
   */
  get size(): number {
    return this.items.size;
  }

  /**
   * Check if an item with the given ID is registered
   *
   * @param id - The ID to check
   * @returns true if an item with this ID exists, false otherwise
   */
  has(id: string): boolean {
    return this.items.has(id);
  }

  /**
   * Clear all items from the registry
   * Notifies listeners exactly once after all items are removed.
   */
  clear(): void {
    this.items.clear();
    this.notifyListeners();
  }

  /**
   * Subscribe to registry changes
   * The listener will be called whenever items are added, removed, or the registry is cleared.
   *
   * @param listener - Function to call when the registry changes
   * @returns Unsubscribe function
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners that the registry has changed
   * Errors in individual listeners are caught and logged to prevent one bad listener
   * from breaking all notifications.
   */
  protected notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error(`[${this.constructor.name}] Error in registry listener:`, error);
      }
    });
  }
}
