/**
 * Widget Registry
 *
 * Central registry for all widgets in the unified widget system.
 * Widgets can be filtered by surface, category, domain, etc.
 */

import { BaseRegistry } from '@lib/core/BaseRegistry';
import type {
  WidgetDefinition,
  WidgetSurface,
  WidgetCategory,
  WidgetDomain,
} from './types';

/**
 * Widget Registry - extends BaseRegistry with widget-specific queries
 */
class WidgetRegistryImpl extends BaseRegistry<WidgetDefinition> {
  /**
   * Get widgets that support a specific surface
   */
  getBySurface(surface: WidgetSurface): WidgetDefinition[] {
    return this.getAll().filter((widget) => widget.surfaces.includes(surface));
  }

  /**
   * Get widgets by category
   */
  getByCategory(category: WidgetCategory): WidgetDefinition[] {
    return this.getAll().filter((widget) => widget.category === category);
  }

  /**
   * Get widgets by domain
   */
  getByDomain(domain: WidgetDomain): WidgetDefinition[] {
    return this.getAll().filter((widget) => widget.domain === domain);
  }

  /**
   * Get widgets for a specific surface and category
   */
  getBySurfaceAndCategory(
    surface: WidgetSurface,
    category: WidgetCategory
  ): WidgetDefinition[] {
    return this.getAll().filter(
      (widget) =>
        widget.surfaces.includes(surface) && widget.category === category
    );
  }

  /**
   * Search widgets by query string
   */
  search(query: string): WidgetDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter((widget) => {
      const matchesId = widget.id.toLowerCase().includes(lowerQuery);
      const matchesTitle = widget.title.toLowerCase().includes(lowerQuery);
      const matchesDescription = widget.description
        ?.toLowerCase()
        .includes(lowerQuery);
      const matchesTags = widget.tags?.some((tag) =>
        tag.toLowerCase().includes(lowerQuery)
      );

      return matchesId || matchesTitle || matchesDescription || matchesTags;
    });
  }

  /**
   * Get widgets grouped by category for menu display
   */
  getGroupedByCategory(
    surface?: WidgetSurface
  ): Partial<Record<WidgetCategory, WidgetDefinition[]>> {
    const widgets = surface ? this.getBySurface(surface) : this.getAll();

    const grouped: Partial<Record<WidgetCategory, WidgetDefinition[]>> = {};

    for (const widget of widgets) {
      if (!grouped[widget.category]) {
        grouped[widget.category] = [];
      }
      grouped[widget.category]!.push(widget);
    }

    return grouped;
  }

  /**
   * Check if widget has a component (for React rendering)
   */
  hasComponent(id: string): boolean {
    const widget = this.get(id);
    return widget?.component !== undefined;
  }

  /**
   * Check if widget has a factory (for editing-core rendering)
   */
  hasFactory(id: string): boolean {
    const widget = this.get(id);
    return widget?.factory !== undefined;
  }

  /**
   * Get registry statistics
   */
  getStats() {
    const all = this.getAll();
    return {
      total: all.length,
      bySurface: {
        header: all.filter((w) => w.surfaces.includes('header')).length,
        statusbar: all.filter((w) => w.surfaces.includes('statusbar')).length,
        'panel-composer': all.filter((w) =>
          w.surfaces.includes('panel-composer')
        ).length,
        toolbar: all.filter((w) => w.surfaces.includes('toolbar')).length,
        overlay: all.filter((w) => w.surfaces.includes('overlay')).length,
      },
      byCategory: {
        status: all.filter((w) => w.category === 'status').length,
        actions: all.filter((w) => w.category === 'actions').length,
        info: all.filter((w) => w.category === 'info').length,
        automation: all.filter((w) => w.category === 'automation').length,
        generation: all.filter((w) => w.category === 'generation').length,
        media: all.filter((w) => w.category === 'media').length,
        utilities: all.filter((w) => w.category === 'utilities').length,
      },
    };
  }
}

/**
 * Global widget registry singleton
 */
export const widgetRegistry = new WidgetRegistryImpl();

/**
 * Register a widget definition
 */
export function registerWidget(definition: WidgetDefinition): void {
  // Validate surfaces match surfaceConfig
  if (definition.surfaceConfig) {
    for (const configKey of Object.keys(definition.surfaceConfig)) {
      const surface = configKey === 'panelComposer' ? 'panel-composer' : configKey;
      if (!definition.surfaces.includes(surface as WidgetSurface)) {
        console.warn(
          `Widget "${definition.id}" has surfaceConfig for "${configKey}" but doesn't declare "${surface}" in surfaces array`
        );
      }
    }
  }

  widgetRegistry.register(definition);
}

/**
 * Unregister a widget definition
 */
export function unregisterWidget(id: string): void {
  widgetRegistry.unregister(id);
}

/**
 * Get a widget definition by ID
 */
export function getWidget(id: string): WidgetDefinition | undefined {
  return widgetRegistry.get(id);
}

/**
 * Get all widgets for a surface
 */
export function getWidgetsForSurface(surface: WidgetSurface): WidgetDefinition[] {
  return widgetRegistry.getBySurface(surface);
}

/**
 * Get widgets grouped by category for a surface (for menus)
 */
export function getWidgetMenuItems(
  surface: WidgetSurface
): Partial<Record<WidgetCategory, WidgetDefinition[]>> {
  return widgetRegistry.getGroupedByCategory(surface);
}

/**
 * Check if a widget can render on a given surface
 */
export function canRenderOnSurface(widgetId: string, surface: WidgetSurface): boolean {
  const widget = widgetRegistry.get(widgetId);
  if (!widget) return false;

  if (!widget.surfaces.includes(surface)) return false;

  // Chrome surfaces need component
  if (['header', 'statusbar', 'toolbar', 'panel-composer'].includes(surface)) {
    return widget.component !== undefined;
  }

  // Editing-core surfaces need factory
  if (['overlay', 'hud'].includes(surface)) {
    return widget.factory !== undefined;
  }

  return true;
}
