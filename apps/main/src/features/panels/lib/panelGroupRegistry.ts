/**
 * Panel Group Registry
 *
 * Central registry for panel group definitions.
 * Supports manual registration and auto-discovery.
 *
 * Panel groups are reusable collections of panels with predefined
 * layouts and presets. They can be hosted in any container.
 */

import type { PanelGroupDefinition } from './definePanelGroup';

type Listener = () => void;

class PanelGroupRegistry {
  private groups = new Map<string, PanelGroupDefinition>();
  private listeners = new Set<Listener>();

  /**
   * Register a panel group definition.
   */
  register<TSlots extends string, TPresets extends string>(
    group: PanelGroupDefinition<TSlots, TPresets>
  ): () => void {
    if (this.groups.has(group.id)) {
      console.warn(`[PanelGroupRegistry] Overwriting existing group: ${group.id}`);
    }

    this.groups.set(group.id, group as PanelGroupDefinition);
    this.notify();

    // Return unregister function
    return () => {
      if (this.groups.get(group.id) === group) {
        this.groups.delete(group.id);
        this.notify();
      }
    };
  }

  /**
   * Unregister a panel group by ID.
   */
  unregister(groupId: string): boolean {
    const deleted = this.groups.delete(groupId);
    if (deleted) {
      this.notify();
    }
    return deleted;
  }

  /**
   * Get a panel group by ID.
   */
  get<TSlots extends string = string, TPresets extends string = string>(
    groupId: string
  ): PanelGroupDefinition<TSlots, TPresets> | undefined {
    return this.groups.get(groupId) as PanelGroupDefinition<TSlots, TPresets> | undefined;
  }

  /**
   * Get all registered panel groups.
   */
  getAll(): PanelGroupDefinition[] {
    return Array.from(this.groups.values());
  }

  /**
   * Get panel groups by category.
   */
  getByCategory(category: string): PanelGroupDefinition[] {
    return this.getAll().filter((g) => g.category === category);
  }

  /**
   * Check if a panel group exists.
   */
  has(groupId: string): boolean {
    return this.groups.has(groupId);
  }

  /**
   * Subscribe to registry changes.
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear all registered groups.
   */
  clear(): void {
    this.groups.clear();
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

/**
 * Global panel group registry instance.
 */
export const panelGroupRegistry = new PanelGroupRegistry();

/**
 * Auto-discover and register panel groups from a glob pattern.
 * Uses Vite's import.meta.glob for build-time discovery.
 *
 * @example
 * ```typescript
 * // In features/panels/lib/initializePanelGroups.ts
 * const modules = import.meta.glob('../domain/groups/*\/index.ts', { eager: true });
 * await autoRegisterPanelGroups(modules);
 * ```
 */
export async function autoRegisterPanelGroups(
  modules: Record<string, unknown>,
  options: { verbose?: boolean } = {}
): Promise<{ registered: string[]; failed: string[] }> {
  const registered: string[] = [];
  const failed: string[] = [];

  for (const [path, module] of Object.entries(modules)) {
    try {
      const mod = module as { default?: PanelGroupDefinition };
      if (mod.default?.id) {
        panelGroupRegistry.register(mod.default);
        registered.push(mod.default.id);
        if (options.verbose) {
          console.log(`[PanelGroupRegistry] Registered: ${mod.default.id}`);
        }
      } else {
        failed.push(path);
        console.warn(`[PanelGroupRegistry] No default export with id in: ${path}`);
      }
    } catch (err) {
      failed.push(path);
      console.error(`[PanelGroupRegistry] Failed to register from: ${path}`, err);
    }
  }

  return { registered, failed };
}
