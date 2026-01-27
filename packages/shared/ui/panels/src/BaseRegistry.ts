/**
 * BaseRegistry - Generic base class for UI registries
 *
 * Provides common functionality for map-based registries with listeners.
 */

export interface Identifiable {
  id: string;
}

export class BaseRegistry<T extends Identifiable> {
  protected items: Map<string, T> = new Map();
  protected listeners: Set<() => void> = new Set();

  register(item: T): boolean {
    if (this.items.has(item.id)) {
      return false;
    }
    this.items.set(item.id, item);
    this.notifyListeners();
    return true;
  }

  forceRegister(item: T): void {
    this.items.set(item.id, item);
    this.notifyListeners();
  }

  unregister(id: string): boolean {
    const wasDeleted = this.items.delete(id);
    if (wasDeleted) {
      this.notifyListeners();
    }
    return wasDeleted;
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  getAll(): T[] {
    return Array.from(this.items.values());
  }

  getIds(): string[] {
    return Array.from(this.items.keys());
  }

  get size(): number {
    return this.items.size;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  clear(): void {
    this.items.clear();
    this.notifyListeners();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

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
