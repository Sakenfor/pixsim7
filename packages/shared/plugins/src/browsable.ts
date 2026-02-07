/**
 * Widget Builder Registry
 *
 * Pure TypeScript registry for plugin family display configurations.
 * Used by the Widget Builder UI to browse and inspect plugin families.
 * React hooks are provided separately in the app.
 */

import type { PluginFamily } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Column definition for rendering items in a table/list view
 */
export interface WidgetBuilderColumn {
  /** Column identifier */
  id: string;
  /** Display label */
  label: string;
  /** Width (CSS value or number for px) */
  width?: string | number;
  /** Render function for the cell - returns any to avoid React dependency */
  render: (item: unknown) => unknown;
}

/**
 * Configuration for displaying a plugin family in the Widget Builder
 */
export interface WidgetBuilderFamilyConfig {
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
  columns?: WidgetBuilderColumn[];

  /**
   * Custom component for rendering the browse view.
   * If provided, columns are ignored and this component is used instead.
   * Type is any to avoid React dependency.
   */
  browseComponent?: unknown;

  /**
   * Custom component for rendering the inspector/details view.
   * If not provided, uses a default property inspector.
   * Type is any to avoid React dependency.
   */
  inspectorComponent?: unknown;

  /**
   * Function to get items for this family from the catalog.
   * If not provided, uses pluginCatalog.getPluginsByFamily(family).
   */
  getItems?: () => unknown[];

  /**
   * Function to get display name for an item.
   * Defaults to item.title || item.name || item.label || item.id
   */
  getItemName?: (item: unknown) => string;

  /**
   * Function to get icon for an item.
   * Defaults to item.icon
   */
  getItemIcon?: (item: unknown) => string | undefined;
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Registry for browsable plugin families.
 * Pure TypeScript class with subscription support.
 */
export class WidgetBuilderRegistry {
  private configs = new Map<PluginFamily, WidgetBuilderFamilyConfig>();
  private listeners = new Set<() => void>();

  /**
   * Register a browsable family configuration
   */
  register(config: WidgetBuilderFamilyConfig): () => void {
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
  get(family: PluginFamily): WidgetBuilderFamilyConfig | undefined {
    return this.configs.get(family);
  }

  /**
   * Get all browsable family configs
   */
  getAll(): WidgetBuilderFamilyConfig[] {
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
  getByCategory(category: WidgetBuilderFamilyConfig['category']): WidgetBuilderFamilyConfig[] {
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

  /**
   * Get snapshot for external store compatibility
   */
  getSnapshot(): WidgetBuilderFamilyConfig[] {
    return this.getAll();
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

/**
 * Create a new browsable family registry
 */
export function createWidgetBuilderRegistry(): WidgetBuilderRegistry {
  return new WidgetBuilderRegistry();
}
