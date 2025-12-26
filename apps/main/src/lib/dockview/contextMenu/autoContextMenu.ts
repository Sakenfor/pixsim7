/**
 * Automatic Context Menu Registration System
 *
 * Reduces boilerplate from ~19 lines to 1-2 lines by:
 * - Auto-inferring dependencies from data fields
 * - Providing smart defaults for common types
 * - Supporting type-specific configuration presets
 *
 * Usage Examples:
 *
 * ```tsx
 * // Simplest - uses defaults for known types
 * const ctx = useAutoContextMenu('asset', asset);
 * return <div {...ctx}>...</div>;
 *
 * // With config - customize fields/label
 * const ctx = useAutoContextMenu('asset', asset, {
 *   fields: ['id', 'mediaType', 'provider'], // pick specific fields
 *   computeLabel: (asset) => asset.description || asset.providerAssetId,
 *   includeFullObject: true, // include 'asset' field with full object
 * });
 *
 * // Custom type without preset
 * const ctx = useAutoContextMenu('prompt', prompt, {
 *   idField: 'id',
 *   labelField: 'title',
 *   fields: ['id', 'title', 'text'],
 * });
 * ```
 */

import { useMemo } from 'react';
import { useContextMenuItem, type ContextMenuAttrs } from './contextDataResolver';

// ============================================================================
// Type Configuration System
// ============================================================================

/**
 * Configuration for automatic context menu registration.
 * Defines how to extract ID, label, and data from an object.
 */
export interface AutoContextConfig<T = any> {
  /** Field name for unique ID (default: 'id') */
  idField?: keyof T | ((obj: T) => string | number);

  /** Field name for display label, or function to compute it */
  labelField?: keyof T | ((obj: T) => string);

  /**
   * Fields to include in context data.
   * - 'default': Use type-specific preset
   * - string[]: Explicit field names
   * - (obj: T) => Record<string, unknown>: Custom data extractor
   */
  fields?: 'default' | (keyof T)[] | ((obj: T) => Record<string, unknown>);

  /**
   * Include full object in context data (as type-specific field).
   * E.g., for type='asset', adds { asset: {...} } to data.
   */
  includeFullObject?: boolean;

  /**
   * Additional computed fields to include.
   * Receives the object and returns additional data fields.
   */
  computeFields?: (obj: T) => Record<string, unknown>;

  /**
   * Function to compute display label.
   * Overrides labelField if provided.
   */
  computeLabel?: (obj: T) => string;
}

/**
 * Registry of type-specific configuration presets.
 * Features can register their types here for zero-config usage.
 */
class AutoContextConfigRegistry {
  private configs = new Map<string, AutoContextConfig>();

  /**
   * Register a configuration preset for a type.
   * Used at feature initialization to enable zero-config auto-registration.
   */
  register<T = any>(type: string, config: AutoContextConfig<T>): void {
    this.configs.set(type, config);
  }

  /**
   * Get configuration for a type.
   * Returns undefined if no preset registered.
   */
  get<T = any>(type: string): AutoContextConfig<T> | undefined {
    return this.configs.get(type) as AutoContextConfig<T> | undefined;
  }

  /** Check if a type has a registered config */
  has(type: string): boolean {
    return this.configs.has(type);
  }
}

/** Global registry for type configurations */
export const autoContextConfigRegistry = new AutoContextConfigRegistry();

// ============================================================================
// Auto-Registration Hook
// ============================================================================

/**
 * Automatic context menu registration hook.
 * Reduces boilerplate by auto-inferring fields and dependencies.
 *
 * @param type - Context type (e.g., 'asset', 'prompt')
 * @param obj - Object to register (null/undefined = no registration)
 * @param config - Optional configuration (uses preset if registered for type)
 * @returns Props to spread on element
 *
 * @example
 * ```tsx
 * // Zero-config (if type preset registered)
 * const ctx = useAutoContextMenu('asset', asset);
 *
 * // With custom config
 * const ctx = useAutoContextMenu('prompt', prompt, {
 *   labelField: 'title',
 *   fields: ['id', 'title', 'text'],
 * });
 * ```
 */
export function useAutoContextMenu<T extends Record<string, any>>(
  type: string,
  obj: T | null | undefined,
  config?: AutoContextConfig<T>,
): ContextMenuAttrs | Record<string, never> {
  // Merge config with preset
  const mergedConfig = useMemo(() => {
    const preset = autoContextConfigRegistry.get<T>(type);
    return { ...preset, ...config };
  }, [type, config]);

  // Extract configuration
  const {
    idField = 'id',
    labelField,
    fields = 'default',
    includeFullObject = false,
    computeFields,
    computeLabel,
  } = mergedConfig;

  // Compute ID
  const id = useMemo(() => {
    if (!obj) return undefined;
    if (typeof idField === 'function') {
      return idField(obj);
    }
    return obj[idField as string] as string | number | undefined;
  }, [obj, idField]);

  // Compute label
  const label = useMemo(() => {
    if (!obj) return undefined;

    // Priority: computeLabel > labelField
    if (computeLabel) {
      return computeLabel(obj);
    }

    if (labelField) {
      if (typeof labelField === 'function') {
        return labelField(obj);
      }
      return String(obj[labelField as string] || '');
    }

    // Fallback to common field names
    const fallbacks = ['name', 'title', 'label', 'description'] as const;
    for (const field of fallbacks) {
      if (obj[field]) return String(obj[field]);
    }

    return `${type} ${id}`;
  }, [obj, labelField, computeLabel, type, id]);

  // Build context data
  const contextData = useMemo(() => {
    if (!obj) return { name: undefined };

    let data: Record<string, unknown> = { id, name: label };

    // Add fields
    if (typeof fields === 'function') {
      // Custom data extractor
      data = { ...data, ...fields(obj) };
    } else if (Array.isArray(fields)) {
      // Explicit field list
      fields.forEach(field => {
        data[field as string] = obj[field as string];
      });
    }
    // 'default' handled by type presets via computeFields

    // Add full object if requested
    if (includeFullObject) {
      data[type] = obj;
    }

    // Add computed fields
    if (computeFields) {
      data = { ...data, ...computeFields(obj) };
    }

    return data;
  }, [obj, id, label, fields, includeFullObject, computeFields, type]);

  // Auto-compute dependencies from context data
  const deps = useMemo(() => {
    if (!obj) return [];

    // Extract primitive values from context data for dependency tracking
    const values: unknown[] = [];

    const extractValues = (data: Record<string, unknown>) => {
      Object.values(data).forEach(value => {
        if (value === null || value === undefined) {
          values.push(value);
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          // For objects, track their identity (reference)
          values.push(value);
        } else {
          // Primitives, arrays
          values.push(value);
        }
      });
    };

    extractValues(contextData);
    return values;
  }, [contextData, obj]);

  return useContextMenuItem(type, id, contextData, deps);
}

// ============================================================================
// Type-Specific Convenience Hooks (Optional)
// ============================================================================

/**
 * Type-safe hook for asset context menus.
 * Uses registered preset configuration.
 *
 * @example
 * ```tsx
 * const ctx = useAssetContextMenu(asset);
 * return <div {...ctx}>...</div>;
 * ```
 */
export function useAssetAutoContextMenu<T extends { id: number | string }>(
  asset: T | null | undefined,
  config?: AutoContextConfig<T>,
): ContextMenuAttrs | Record<string, never> {
  return useAutoContextMenu('asset', asset, config);
}

/**
 * Type-safe hook for prompt context menus.
 * Uses registered preset configuration.
 */
export function usePromptAutoContextMenu<T extends { id: number | string }>(
  prompt: T | null | undefined,
  config?: AutoContextConfig<T>,
): ContextMenuAttrs | Record<string, never> {
  return useAutoContextMenu('prompt', prompt, config);
}
