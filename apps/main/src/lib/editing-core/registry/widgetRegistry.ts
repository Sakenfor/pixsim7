/**
 * Editable UI Core - Widget Registry
 *
 * Lightweight registry mapping widget type identifiers to metadata and
 * factory functions. Overlay and HUD systems can both register their own
 * widget types here over time.
 *
 * ## Component Types
 *
 * Widget types are globally namespaced (e.g., 'badge', 'panel'), but different
 * surfaces use `componentType` to differentiate their widget instances:
 *
 * - Overlay system: `componentType: 'overlay'`
 * - HUD system: `componentType: 'hud'`
 * - Interaction editor: `componentType: 'interaction'`
 *
 * ## Widget Reuse Patterns
 *
 * **Pattern 1: Generic widget, specialized by componentType**
 * ```typescript
 * registerWidget({
 *   type: 'badge',
 *   factory: (config, runtimeOptions) => {
 *     if (runtimeOptions?.componentType === 'overlay') {
 *       return createOverlayBadge(config);
 *     } else if (runtimeOptions?.componentType === 'hud') {
 *       return createHudBadge(config);
 *     }
 *     return createGenericBadge(config);
 *   }
 * });
 * ```
 *
 * **Pattern 2: Surface-specific widget types**
 * ```typescript
 * registerWidget({ type: 'overlay-badge', ... });
 * registerWidget({ type: 'hud-badge', ... });
 * ```
 *
 * Use Pattern 1 when widgets share behavior across surfaces.
 * Use Pattern 2 when widgets are surface-specific.
 */

import type { UnifiedWidgetConfig } from '../unifiedConfig';

/**
 * Context passed to widget factories to differentiate surfaces.
 *
 * The `componentType` field indicates which surface is creating the widget:
 * - 'overlay' - Overlay system (media cards, video players)
 * - 'hud' - HUD layout editor (health bars, quest trackers)
 * - 'interaction' - Interaction studio
 * - (custom) - Any other surface that adopts editing-core
 *
 * Widget factories can use this to specialize behavior per surface.
 */
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
 * Factory function that creates a fully functional widget from a unified config.
 *
 * Returns the runtime widget object (e.g., OverlayWidget for overlay types).
 *
 * The factory receives:
 * - `config` - Unified widget configuration (serializable)
 * - `runtimeOptions` - Runtime context including `componentType` and callbacks
 *
 * Factories can inspect `runtimeOptions.componentType` to create surface-specific
 * widget instances from the same widget type definition.
 *
 * @example
 * ```typescript
 * const badgeFactory: WidgetFactory<OverlayWidget> = (config, runtimeOptions) => {
 *   const componentType = runtimeOptions?.componentType || 'generic';
 *   return {
 *     id: config.id,
 *     type: config.type,
 *     render: () => <Badge componentType={componentType} {...config.props} />,
 *   };
 * };
 * ```
 */
export type WidgetFactory<TWidget = any> = (
  config: UnifiedWidgetConfig,
  runtimeOptions?: WidgetRuntimeOptions
) => TWidget;

/**
 * Widget definition registered in the global widget registry.
 *
 * Widget types are identified by a global `type` string (e.g., 'badge', 'panel').
 * Multiple surfaces can register widgets with the same type, differentiated by
 * `componentType` at runtime.
 *
 * @example Overlay registering a badge widget
 * ```typescript
 * registerWidget({
 *   type: 'badge',
 *   displayName: 'Badge',
 *   icon: '🏷️',
 *   factory: (config, runtimeOptions) => createBadgeWidget(config),
 *   defaultConfig: {
 *     id: 'badge-1',
 *     type: 'badge',
 *     props: { variant: 'icon', color: 'gray' },
 *   },
 * });
 * ```
 */
export interface WidgetDefinition<TWidget = any> {
  /**
   * Globally unique widget type identifier (e.g., 'badge', 'panel', 'upload').
   *
   * This is shared across all surfaces. Use `componentType` in runtimeOptions
   * to differentiate overlay badges from HUD badges.
   */
  type: string;

  /**
   * Human-readable display name shown in editor UIs.
   */
  displayName: string;

  /**
   * Optional icon (emoji or icon identifier) for editor palette.
   */
  icon?: string;

  /**
   * Optional opaque configuration schema description; concrete editors can
   * interpret this as needed (e.g. Zod schema, JSON schema).
   */
  schema?: unknown;

  /**
   * Create a widget-specific props object from raw form values.
   *
   * Used by editors to transform form input into widget props.
   */
  createProps?: (values: Record<string, unknown>, ctx: WidgetFactoryContext) => Record<string, unknown>;

  /**
   * Factory function to create a fully functional widget from unified config.
   *
   * The factory receives `componentType` in runtimeOptions to differentiate surfaces.
   */
  factory?: WidgetFactory<TWidget>;

  /**
   * Default configuration for this widget type.
   *
   * Used when creating new widgets in editors (drag-and-drop, palette, etc.).
   */
  defaultConfig?: Partial<UnifiedWidgetConfig>;
}

/**
 * Global widget registry.
 *
 * All surfaces (overlay, HUD, interaction, etc.) register their widgets here.
 * Widget types are globally namespaced, but `componentType` differentiates instances.
 */
const registry = new Map<string, WidgetDefinition>();

/**
 * Register a widget type in the global registry.
 *
 * Multiple surfaces can register widgets with the same `type` if they provide
 * a factory that handles different `componentType` values.
 *
 * @param def - Widget definition including type, displayName, factory, and defaults
 *
 * @example Registering an overlay-specific widget
 * ```typescript
 * registerWidget({
 *   type: 'badge',
 *   displayName: 'Badge',
 *   factory: (config, runtimeOptions) => {
 *     // Only works for overlay componentType
 *     if (runtimeOptions?.componentType !== 'overlay') {
 *       console.warn('Badge widget only supports overlay componentType');
 *       return null;
 *     }
 *     return createOverlayBadge(config);
 *   },
 * });
 * ```
 */
export function registerWidget(def: WidgetDefinition): void {
  registry.set(def.type, def);
}

/**
 * Get a widget definition by type.
 *
 * @param type - Widget type identifier (e.g., 'badge', 'panel')
 * @returns Widget definition if registered, undefined otherwise
 */
export function getWidget(type: string): WidgetDefinition | undefined {
  return registry.get(type);
}

/**
 * List all registered widget definitions.
 *
 * @returns Array of all registered widget definitions
 */
export function listWidgets(): WidgetDefinition[] {
  return Array.from(registry.values());
}

/**
 * Create a widget instance using the registered factory.
 *
 * This is the primary way to instantiate widgets from configs. The factory
 * receives the config and runtimeOptions (including `componentType`) to create
 * the appropriate widget instance.
 *
 * @param type - Widget type identifier
 * @param config - Unified widget configuration
 * @param runtimeOptions - Runtime context (componentType, callbacks, etc.)
 * @returns Widget instance or null if no factory found
 *
 * @example Creating an overlay badge widget
 * ```typescript
 * const widget = createWidget<OverlayWidget>(
 *   'badge',
 *   {
 *     id: 'badge-1',
 *     type: 'badge',
 *     position: { anchor: 'top-left', offset: { x: 10, y: 10 } },
 *     props: { variant: 'icon', color: 'gray' },
 *   },
 *   { componentType: 'overlay', onClick: (data) => console.log(data) }
 * );
 * ```
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

