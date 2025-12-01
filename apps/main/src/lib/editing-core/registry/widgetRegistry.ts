/**
 * Editable UI Core - Widget Registry
 *
 * Lightweight registry mapping widget type identifiers to metadata and
 * factory functions. Overlay and HUD systems can both register their own
 * widget types here over time.
 */

import type { UnifiedWidgetConfig } from '../unifiedConfig';

export interface WidgetFactoryContext {
  componentType: string;
}

/**
 * Runtime options for widget factory, e.g., callbacks for onClick
 */
export interface WidgetRuntimeOptions {
  onClick?: (data: any) => void;
  onUpload?: (data: any) => void | Promise<void>;
  onRetry?: (data: any) => void | Promise<void>;
  [key: string]: any;
}

/**
 * Factory function that creates a fully functional widget from a unified config
 * Returns the runtime widget object (e.g., OverlayWidget for overlay types)
 */
export type WidgetFactory<TWidget = any> = (
  config: UnifiedWidgetConfig,
  runtimeOptions?: WidgetRuntimeOptions
) => TWidget;

export interface WidgetDefinition<TWidget = any> {
  type: string;
  displayName: string;
  icon?: string;
  /**
   * Optional opaque configuration schema description; concrete editors can
   * interpret this as needed (e.g. Zod schema, JSON schema).
   */
  schema?: unknown;
  /**
   * Create a widget-specific props object from raw form values.
   */
  createProps?: (values: Record<string, unknown>, ctx: WidgetFactoryContext) => Record<string, unknown>;
  /**
   * Factory function to create a fully functional widget from unified config
   */
  factory?: WidgetFactory<TWidget>;
  /**
   * Default configuration for this widget type
   */
  defaultConfig?: Partial<UnifiedWidgetConfig>;
}

const registry = new Map<string, WidgetDefinition>();

export function registerWidget(def: WidgetDefinition): void {
  registry.set(def.type, def);
}

export function getWidget(type: string): WidgetDefinition | undefined {
  return registry.get(type);
}

export function listWidgets(): WidgetDefinition[] {
  return Array.from(registry.values());
}

/**
 * Create a widget using the registered factory
 */
export function createWidget<TWidget = any>(
  type: string,
  config: UnifiedWidgetConfig,
  runtimeOptions?: WidgetRuntimeOptions
): TWidget | null {
  const def = registry.get(type);
  if (!def?.factory) {
    console.warn(`No factory found for widget type: ${type}`);
    return null;
  }
  return def.factory(config, runtimeOptions) as TWidget;
}

