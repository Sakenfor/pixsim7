/**
 * Browsable Families Registry
 *
 * Defines which plugin families are browsable in the Widget Builder
 * and provides metadata for rendering them in the UI.
 *
 * This allows the Widget Builder to dynamically discover and display
 * all browsable plugin families without manual updates.
 */

import type { ReactNode, ComponentType } from 'react';
import { useSyncExternalStore, useCallback } from 'react';

import type { PluginFamily } from './pluginSystem';

// ============================================================================
// Types
// ============================================================================

/**
 * Column definition for rendering items in a table/list view
 */
export interface BrowsableColumn {
  /** Column identifier */
  id: string;
  /** Display label */
  label: string;
  /** Width (CSS value or number for px) */
  width?: string | number;
  /** Render function for the cell */
  render: (item: any) => ReactNode;
}

/**
 * Configuration for a browsable plugin family
 */
export interface BrowsableFamilyConfig {
  /** Plugin family this config applies to */
  family: PluginFamily;
  /** Display label for the family */
  label: string;
  /** Icon (emoji or icon component) */
  icon: string;
  /** Description of what this family contains */
  description: string;
  /** Category for grouping in the UI */
  category?: 'workspace' | 'generation' | 'widgets' | 'tools' | 'system';
  /** Order within category (lower = first) */
  order?: number;

  /**
   * Columns for table/list rendering.
   * If not provided, uses default columns (id, name, description).
   */
  columns?: BrowsableColumn[];

  /**
   * Custom component for rendering the browse view.
   * If provided, columns are ignored and this component is used instead.
   */
  browseComponent?: ComponentType<{ items: any[]; onSelect: (item: any) => void }>;

  /**
   * Custom component for rendering the inspector/details view.
   * If not provided, uses a default property inspector.
   */
  inspectorComponent?: ComponentType<{ item: any }>;

  /**
   * Function to get items for this family from the catalog.
   * If not provided, uses pluginCatalog.getPluginsByFamily(family).
   */
  getItems?: () => any[];

  /**
   * Function to get display name for an item.
   * Defaults to item.title || item.name || item.label || item.id
   */
  getItemName?: (item: any) => string;

  /**
   * Function to get icon for an item.
   * Defaults to item.icon
   */
  getItemIcon?: (item: any) => string | undefined;
}

// ============================================================================
// Registry
// ============================================================================

class BrowsableFamilyRegistry {
  private configs = new Map<PluginFamily, BrowsableFamilyConfig>();
  private listeners = new Set<() => void>();

  /**
   * Register a browsable family configuration
   */
  register(config: BrowsableFamilyConfig): () => void {
    this.configs.set(config.family, config);
    this.notifyListeners();

    return () => {
      this.configs.delete(config.family);
      this.notifyListeners();
    };
  }

  /**
   * Get config for a specific family
   */
  get(family: PluginFamily): BrowsableFamilyConfig | undefined {
    return this.configs.get(family);
  }

  /**
   * Get all browsable family configs
   */
  getAll(): BrowsableFamilyConfig[] {
    return Array.from(this.configs.values()).sort((a, b) => {
      // Sort by category first, then by order
      const catA = a.category || 'system';
      const catB = b.category || 'system';
      if (catA !== catB) {
        const catOrder = ['workspace', 'generation', 'widgets', 'tools', 'system'];
        return catOrder.indexOf(catA) - catOrder.indexOf(catB);
      }
      return (a.order ?? 100) - (b.order ?? 100);
    });
  }

  /**
   * Get configs by category
   */
  getByCategory(category: BrowsableFamilyConfig['category']): BrowsableFamilyConfig[] {
    return this.getAll().filter((config) => config.category === category);
  }

  /**
   * Check if a family is browsable
   */
  has(family: PluginFamily): boolean {
    return this.configs.has(family);
  }

  /**
   * Subscribe to registry changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('Error in browsable family registry listener:', error);
      }
    }
  }
}

export const browsableFamilyRegistry = new BrowsableFamilyRegistry();

// ============================================================================
// Default Browsable Families
// ============================================================================

import { defaultBrowsableConfigs } from './browsable';

/**
 * Register default browsable families.
 * Call this during app initialization.
 *
 * Configs are co-located in `./browsable/` directory organized by category.
 * To add a new browsable family, add its config to the appropriate file.
 */
export function registerDefaultBrowsableFamilies(): void {
  for (const config of defaultBrowsableConfigs) {
    browsableFamilyRegistry.register(config);
  }
}

// ============================================================================
// React Hooks
// ============================================================================

/**
 * Hook to get all browsable family configs.
 * Re-renders when the registry changes.
 */
export function useBrowsableFamilies(): BrowsableFamilyConfig[] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => browsableFamilyRegistry.subscribe(onStoreChange),
    []
  );

  const getSnapshot = useCallback(() => browsableFamilyRegistry.getAll(), []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Hook to get a specific browsable family config.
 */
export function useBrowsableFamily(family: PluginFamily): BrowsableFamilyConfig | undefined {
  const subscribe = useCallback(
    (onStoreChange: () => void) => browsableFamilyRegistry.subscribe(onStoreChange),
    []
  );

  const getSnapshot = useCallback(() => browsableFamilyRegistry.get(family), [family]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
