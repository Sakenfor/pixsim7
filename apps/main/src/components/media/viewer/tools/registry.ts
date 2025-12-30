/**
 * Region Drawer Registry
 *
 * Central registry for region annotation drawers.
 * Drawers register themselves and the UI dynamically reflects available options.
 *
 * Named "RegionDrawer" to avoid confusion with:
 * - InteractiveTool (scene gizmos)
 * - ToolPlugin (UI tool plugins)
 */

import type {
  RegionDrawer,
  RegionDrawerRegistration,
  IRegionDrawerRegistry,
} from './types';

// ============================================================================
// Registry Implementation
// ============================================================================

class RegionDrawerRegistry implements IRegionDrawerRegistry {
  private drawers = new Map<string, RegionDrawer>();
  private priorities = new Map<string, number>();
  private listeners = new Set<() => void>();

  register(registration: RegionDrawerRegistration): void {
    const { drawer, priority = 100 } = registration;

    if (this.drawers.has(drawer.id)) {
      console.warn(`[RegionDrawerRegistry] Drawer "${drawer.id}" is already registered, overwriting.`);
    }

    this.drawers.set(drawer.id, drawer);
    this.priorities.set(drawer.id, priority);
    this.notify();
  }

  unregister(drawerId: string): void {
    if (this.drawers.delete(drawerId)) {
      this.priorities.delete(drawerId);
      this.notify();
    }
  }

  get(drawerId: string): RegionDrawer | undefined {
    return this.drawers.get(drawerId);
  }

  getAll(): RegionDrawer[] {
    return Array.from(this.drawers.values()).sort((a, b) => {
      const pa = this.priorities.get(a.id) ?? 100;
      const pb = this.priorities.get(b.id) ?? 100;
      return pa - pb;
    });
  }

  getByCategory(category: RegionDrawer['category']): RegionDrawer[] {
    return this.getAll().filter((d) => d.category === category);
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify(): void {
    this.listeners.forEach((cb) => cb());
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Global region drawer registry instance.
 * Drawers register themselves at module load time.
 */
export const regionDrawerRegistry = new RegionDrawerRegistry();

// ============================================================================
// React Hooks
// ============================================================================

import { useSyncExternalStore, useCallback } from 'react';

/**
 * Hook to access registered drawers with automatic re-render on changes.
 */
export function useRegionDrawerRegistry() {
  const subscribe = useCallback(
    (callback: () => void) => regionDrawerRegistry.subscribe(callback),
    []
  );

  const getSnapshot = useCallback(() => regionDrawerRegistry.getAll(), []);

  const drawers = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    drawers,
    getDrawer: (id: string) => regionDrawerRegistry.get(id),
    getByCategory: (category: RegionDrawer['category']) =>
      regionDrawerRegistry.getByCategory(category),
  };
}

/**
 * Hook to get a specific drawer by ID.
 */
export function useRegionDrawer(drawerId: string): RegionDrawer | undefined {
  const subscribe = useCallback(
    (callback: () => void) => regionDrawerRegistry.subscribe(callback),
    []
  );

  const getSnapshot = useCallback(
    () => regionDrawerRegistry.get(drawerId),
    [drawerId]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
