/**
 * Local Panel Registry
 *
 * A lightweight, type-safe registry for feature-scoped panels.
 * Each feature (AssetViewer, QuickGenerate, etc.) can have its own
 * registry instance with typed panel IDs.
 *
 * Implements PanelRegistryLike interface for compatibility with SmartDockview.
 *
 * Usage:
 * ```ts
 * type MyPanelIds = 'preview' | 'settings' | 'info';
 * const registry = new LocalPanelRegistry<MyPanelIds>();
 *
 * registry.register({
 *   id: 'preview',
 *   title: 'Preview',
 *   component: PreviewPanel,
 * });
 * ```
 */

import type { LocalPanelDefinition, PanelRegistryLike } from './types';

export class LocalPanelRegistry<TPanelId extends string = string>
  implements PanelRegistryLike<LocalPanelDefinition> {
  private panels = new Map<TPanelId, LocalPanelDefinition>();
  private registrationOrder: TPanelId[] = [];

  /**
   * Register a panel definition
   */
  register(definition: LocalPanelDefinition & { id: TPanelId }): this {
    if (this.panels.has(definition.id)) {
      console.warn(`[LocalPanelRegistry] Panel "${definition.id}" already registered, overwriting`);
    } else {
      this.registrationOrder.push(definition.id);
    }
    this.panels.set(definition.id, definition);
    return this;
  }

  /**
   * Register multiple panels at once
   */
  registerAll(definitions: Array<LocalPanelDefinition & { id: TPanelId }>): this {
    definitions.forEach((def) => this.register(def));
    return this;
  }

  /**
   * Get a panel definition by ID
   */
  get(id: TPanelId): LocalPanelDefinition | undefined {
    return this.panels.get(id);
  }

  /**
   * Check if a panel is registered
   */
  has(id: TPanelId): boolean {
    return this.panels.has(id);
  }

  /**
   * Get all registered panels (in registration order)
   */
  getAll(): LocalPanelDefinition[] {
    return this.registrationOrder.map((id) => this.panels.get(id)!);
  }

  /**
   * Get all panel IDs (in registration order)
   */
  getIds(): TPanelId[] {
    return [...this.registrationOrder];
  }

  /**
   * Get the number of registered panels
   */
  get size(): number {
    return this.panels.size;
  }

  /**
   * Unregister a panel
   */
  unregister(id: TPanelId): boolean {
    if (this.panels.delete(id)) {
      this.registrationOrder = this.registrationOrder.filter((pid) => pid !== id);
      return true;
    }
    return false;
  }

  /**
   * Clear all panels
   */
  clear(): void {
    this.panels.clear();
    this.registrationOrder = [];
  }

  /**
   * Create a components map for dockview
   * Maps panel IDs to their components
   */
  toComponentsMap(): Record<string, LocalPanelDefinition['component']> {
    const map: Record<string, LocalPanelDefinition['component']> = {};
    this.panels.forEach((def, id) => {
      map[id] = def.component;
    });
    return map;
  }
}

/**
 * Factory function to create a typed local panel registry
 */
export function createLocalPanelRegistry<TPanelId extends string>(): LocalPanelRegistry<TPanelId> {
  return new LocalPanelRegistry<TPanelId>();
}
