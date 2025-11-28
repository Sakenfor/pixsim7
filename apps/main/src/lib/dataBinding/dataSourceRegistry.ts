/**
 * Data Source Registry
 *
 * Registry for data sources and transforms used by the Panel Builder.
 * Part of Task 51 Phase 51.1 - Core Types & Registry
 */

import { BaseRegistry } from '../core/BaseRegistry';

/**
 * Core data source types
 */
export type DataSourceType = 'store' | 'static' | 'computed';

/**
 * Data source definition (serializable)
 */
export interface DataSourceDefinition {
  id: string;
  type: DataSourceType;

  // Human-friendly metadata
  label: string;
  description?: string;
  tags?: string[];

  // For 'store' sources
  storeId?: string; // e.g. 'workspace', 'scene-builder', 'game-session'
  path?: string; // e.g. 'scenes.length', 'currentScene.meta.stats'

  // For 'static' sources
  value?: unknown;

  // For 'computed' sources
  dependencies?: string[]; // IDs of other data sources
  transformId?: string; // ID of a registered transform to apply

  // Caching hints (optional, can be ignored initially)
  cache?: boolean;
  refreshIntervalMs?: number;
}

/**
 * Data binding - how widgets refer to data sources
 */
export interface DataBinding {
  id: string; // unique per widget binding
  sourceId: string; // DataSourceDefinition.id
  targetProp: string; // Widget prop name, e.g. 'value', 'data'
  transformId?: string; // Optional transform applied on top
  fallbackValue?: unknown; // Used when resolution fails
}

/**
 * Data transform function (pure, deterministic)
 */
export interface DataTransform {
  id: string;
  label: string;
  description?: string;
  apply: (input: unknown) => unknown;
}

/**
 * DataSourceRegistry - Centralized registry for data sources and transforms
 *
 * Note: Extends BaseRegistry for data sources. Transforms are managed separately
 * as they are a different type with different semantics.
 */
export class DataSourceRegistry extends BaseRegistry<DataSourceDefinition> {
  private transforms = new Map<string, DataTransform>();

  /**
   * Register a data source definition
   */
  registerSource(def: DataSourceDefinition): void {
    // Validate source definition
    this.validateSource(def);

    // Use inherited register method
    this.register(def);
  }

  /**
   * Unregister a data source
   */
  unregisterSource(sourceId: string): boolean {
    return this.unregister(sourceId);
  }

  /**
   * Get a data source definition by ID
   */
  getSource(id: string): DataSourceDefinition | undefined {
    return this.get(id);
  }

  /**
   * Get all registered data sources
   */
  getAllSources(): DataSourceDefinition[] {
    return this.getAll();
  }

  /**
   * Get sources by type
   */
  getSourcesByType(type: DataSourceType): DataSourceDefinition[] {
    return this.getAllSources().filter((source) => source.type === type);
  }

  /**
   * Search sources by query (searches id, label, description, tags)
   */
  searchSources(query: string): DataSourceDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllSources().filter((source) => {
      const matchesId = source.id.toLowerCase().includes(lowerQuery);
      const matchesLabel = source.label.toLowerCase().includes(lowerQuery);
      const matchesDescription = source.description?.toLowerCase().includes(lowerQuery);
      const matchesTags = source.tags?.some((tag) => tag.toLowerCase().includes(lowerQuery));

      return matchesId || matchesLabel || matchesDescription || matchesTags;
    });
  }

  /**
   * Check if a source is registered
   */
  hasSource(id: string): boolean {
    return this.has(id);
  }

  /**
   * Register a transform function
   */
  registerTransform(transform: DataTransform): void {
    if (this.transforms.has(transform.id)) {
      console.warn(`Transform "${transform.id}" is already registered. Overwriting.`);
    }

    // Validate transform
    if (typeof transform.apply !== 'function') {
      throw new Error(`Transform "${transform.id}" must have an 'apply' function`);
    }

    this.transforms.set(transform.id, transform);
    this.notifyListeners();
  }

  /**
   * Unregister a transform
   */
  unregisterTransform(transformId: string): boolean {
    const wasDeleted = this.transforms.delete(transformId);
    if (wasDeleted) {
      this.notifyListeners();
    }
    return wasDeleted;
  }

  /**
   * Get a transform by ID
   */
  getTransform(id: string): DataTransform | undefined {
    return this.transforms.get(id);
  }

  /**
   * Get all registered transforms
   */
  getAllTransforms(): DataTransform[] {
    return Array.from(this.transforms.values());
  }

  /**
   * Search transforms by query
   */
  searchTransforms(query: string): DataTransform[] {
    const lowerQuery = query.toLowerCase();
    return this.getAllTransforms().filter((transform) => {
      const matchesId = transform.id.toLowerCase().includes(lowerQuery);
      const matchesLabel = transform.label.toLowerCase().includes(lowerQuery);
      const matchesDescription = transform.description?.toLowerCase().includes(lowerQuery);

      return matchesId || matchesLabel || matchesDescription;
    });
  }

  /**
   * Check if a transform is registered
   */
  hasTransform(id: string): boolean {
    return this.transforms.has(id);
  }

  /**
   * Validate a data source definition
   */
  private validateSource(def: DataSourceDefinition): void {
    if (!def.id || !def.label || !def.type) {
      throw new Error('Data source must have id, label, and type');
    }

    switch (def.type) {
      case 'store':
        if (!def.storeId) {
          throw new Error(`Store source "${def.id}" must have a storeId`);
        }
        break;

      case 'static':
        if (def.value === undefined) {
          console.warn(`Static source "${def.id}" has undefined value`);
        }
        break;

      case 'computed':
        if (!def.dependencies || def.dependencies.length === 0) {
          throw new Error(`Computed source "${def.id}" must have dependencies`);
        }
        if (!def.transformId) {
          throw new Error(`Computed source "${def.id}" must have a transformId`);
        }
        break;

      default:
        throw new Error(`Unknown data source type: ${def.type}`);
    }
  }

  /**
   * Clear all sources and transforms (useful for testing)
   */
  clear(): void {
    this.transforms.clear();
    super.clear();
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const sources = this.getAllSources();
    return {
      sources: {
        total: sources.length,
        byType: {
          store: sources.filter((s) => s.type === 'store').length,
          static: sources.filter((s) => s.type === 'static').length,
          computed: sources.filter((s) => s.type === 'computed').length,
        },
      },
      transforms: {
        total: this.transforms.size,
      },
    };
  }
}

/**
 * Global data source registry singleton
 */
export const dataSourceRegistry = new DataSourceRegistry();

/**
 * Helper to create a store data source
 */
export function createStoreSource(
  id: string,
  label: string,
  storeId: string,
  path: string,
  options?: Partial<DataSourceDefinition>
): DataSourceDefinition {
  return {
    id,
    label,
    type: 'store',
    storeId,
    path,
    ...options,
  };
}

/**
 * Helper to create a static data source
 */
export function createStaticSource(
  id: string,
  label: string,
  value: unknown,
  options?: Partial<DataSourceDefinition>
): DataSourceDefinition {
  return {
    id,
    label,
    type: 'static',
    value,
    ...options,
  };
}

/**
 * Helper to create a computed data source
 */
export function createComputedSource(
  id: string,
  label: string,
  dependencies: string[],
  transformId: string,
  options?: Partial<DataSourceDefinition>
): DataSourceDefinition {
  return {
    id,
    label,
    type: 'computed',
    dependencies,
    transformId,
    ...options,
  };
}
