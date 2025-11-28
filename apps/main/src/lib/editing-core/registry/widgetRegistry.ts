/**
 * Editable UI Core - Widget Registry
 *
 * Lightweight registry mapping widget type identifiers to metadata and
 * factory functions. Overlay and HUD systems can both register their own
 * widget types here over time.
 */

export interface WidgetFactoryContext {
  componentType: string;
}

export interface WidgetDefinition {
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

