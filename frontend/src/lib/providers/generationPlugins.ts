/**
 * Generation UI Plugin System
 *
 * Provides a plugin layer for per-provider or per-operation UI components.
 * Allows providers to declare custom fields, validation, and controls without
 * hardcoding provider-specific conditionals in editor components.
 *
 * Features:
 * - Register provider-specific UI components
 * - Support operation-specific overrides
 * - Priority-based plugin ordering
 * - Type-safe plugin props
 */

import type { ComponentType, ReactNode } from 'react';

/**
 * Props passed to generation UI plugin components
 */
export interface GenerationUIPluginProps {
  /** Provider ID */
  providerId: string;
  /** Operation type (e.g., "text_to_video", "image_to_video") */
  operationType: string;
  /** Current parameter values */
  values: Record<string, any>;
  /** Callback to update a parameter value */
  onChange: (name: string, value: any) => void;
  /** Whether the form is disabled (e.g., during generation) */
  disabled?: boolean;
  /** Additional context (e.g., capabilities, specs) */
  context?: Record<string, any>;
}

/**
 * Validation result from a plugin
 */
export interface ValidationResult {
  valid: boolean;
  errors?: Record<string, string>;
  warnings?: Record<string, string>;
}

/**
 * Generation UI plugin definition
 */
export interface GenerationUIPlugin {
  /** Unique plugin ID */
  id: string;
  /** Provider ID this plugin applies to */
  providerId: string;
  /** Optional: specific operations this plugin applies to (if omitted, applies to all) */
  operations?: string[];
  /** React component to render */
  component: ComponentType<GenerationUIPluginProps>;
  /** Priority (higher = rendered first, default = 0) */
  priority?: number;
  /** Optional: Custom validation function */
  validate?: (values: Record<string, any>, context?: Record<string, any>) => ValidationResult;
  /** Optional: Plugin metadata */
  metadata?: {
    name?: string;
    description?: string;
    version?: string;
  };
}

/**
 * Plugin match criteria
 */
interface PluginMatcher {
  providerId: string;
  operation?: string;
}

/**
 * Generation UI Plugin Registry
 */
export class GenerationUIPluginRegistry {
  private plugins = new Map<string, GenerationUIPlugin>();

  /**
   * Register a new plugin
   */
  register(plugin: GenerationUIPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin with id "${plugin.id}" already registered, replacing...`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * Unregister a plugin
   */
  unregister(pluginId: string): boolean {
    return this.plugins.delete(pluginId);
  }

  /**
   * Get all plugins for a provider and optional operation
   */
  getPlugins(matcher: PluginMatcher): GenerationUIPlugin[] {
    const matches: GenerationUIPlugin[] = [];

    for (const plugin of this.plugins.values()) {
      // Check provider match
      if (plugin.providerId !== matcher.providerId) {
        continue;
      }

      // Check operation match (if plugin specifies operations)
      if (plugin.operations && plugin.operations.length > 0) {
        if (!matcher.operation || !plugin.operations.includes(matcher.operation)) {
          continue;
        }
      }

      matches.push(plugin);
    }

    // Sort by priority (higher first)
    matches.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    return matches;
  }

  /**
   * Get a specific plugin by ID
   */
  getPlugin(pluginId: string): GenerationUIPlugin | null {
    return this.plugins.get(pluginId) || null;
  }

  /**
   * Get all registered plugin IDs
   */
  getPluginIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Clear all plugins
   */
  clear(): void {
    this.plugins.clear();
  }

  /**
   * Validate values using all matching plugins
   */
  validate(
    matcher: PluginMatcher,
    values: Record<string, any>,
    context?: Record<string, any>
  ): ValidationResult {
    const plugins = this.getPlugins(matcher);
    const errors: Record<string, string> = {};
    const warnings: Record<string, string> = {};
    let valid = true;

    for (const plugin of plugins) {
      if (!plugin.validate) continue;

      const result = plugin.validate(values, context);
      if (!result.valid) {
        valid = false;
      }

      if (result.errors) {
        Object.assign(errors, result.errors);
      }

      if (result.warnings) {
        Object.assign(warnings, result.warnings);
      }
    }

    return {
      valid,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      warnings: Object.keys(warnings).length > 0 ? warnings : undefined,
    };
  }
}

/**
 * Global plugin registry instance
 */
export const generationUIPluginRegistry = new GenerationUIPluginRegistry();

/**
 * Helper to create a plugin definition with type safety
 */
export function defineGenerationUIPlugin(plugin: GenerationUIPlugin): GenerationUIPlugin {
  return plugin;
}
