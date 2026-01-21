/**
 * Widget Registry
 *
 * Central registry for all widgets in the unified widget system.
 * Widgets can be filtered by surface, category, domain, etc.
 *
 * Surface availability is determined by:
 * 1. Renderer capability (component → chrome, factory → overlay/hud)
 * 2. Explicit excludeSurfaces opt-out
 * 3. Optional surfaces override for palette visibility
 * 4. showWhen context filter
 */

import { BaseRegistry } from '@lib/core/BaseRegistry';

import type {
  WidgetDefinition,
  WidgetSurface,
  WidgetCategory,
  WidgetDomain,
} from './types';

type AnyWidgetDefinition = WidgetDefinition<any, any>;

/** Chrome surfaces that require a React component */
const CHROME_SURFACES: WidgetSurface[] = ['header', 'statusbar', 'toolbar', 'panel-composer'];

/** Editing-core surfaces that require a factory function */
const EDITING_CORE_SURFACES: WidgetSurface[] = ['overlay', 'hud'];

/**
 * Check if a widget can render on a surface based on capability.
 * This is the core logic for capability-based filtering.
 */
export function canRenderOnSurface(
  widget: AnyWidgetDefinition,
  surface: WidgetSurface,
  context?: { domain?: string }
): boolean {
  // 1. Check explicit exclusion
  if (widget.excludeSurfaces?.includes(surface)) {
    return false;
  }

  // 2. Check explicit surfaces override (if provided)
  if (widget.surfaces && widget.surfaces.length > 0) {
    if (!widget.surfaces.includes(surface)) {
      return false;
    }
  }

  // 3. Check renderer capability
  const hasComponent = widget.component !== undefined;
  const hasFactory = widget.factory !== undefined;

  if (CHROME_SURFACES.includes(surface) && !hasComponent) {
    return false;
  }

  if (EDITING_CORE_SURFACES.includes(surface) && !hasFactory) {
    return false;
  }

  // 4. Check showWhen context filter
  if (widget.showWhen && !widget.showWhen({ domain: context?.domain, surface })) {
    return false;
  }

  return true;
}

/**
 * Get surfaces a widget can render on (based on capability).
 */
export function getWidgetSurfaces(widget: AnyWidgetDefinition): WidgetSurface[] {
  const surfaces: WidgetSurface[] = [];

  // If explicit surfaces provided, use those (filtered by capability)
  if (widget.surfaces && widget.surfaces.length > 0) {
    for (const surface of widget.surfaces) {
      if (canRenderOnSurface(widget, surface)) {
        surfaces.push(surface);
      }
    }
    return surfaces;
  }

  // Otherwise infer from capability
  if (widget.component) {
    for (const surface of CHROME_SURFACES) {
      if (!widget.excludeSurfaces?.includes(surface)) {
        surfaces.push(surface);
      }
    }
  }

  if (widget.factory) {
    for (const surface of EDITING_CORE_SURFACES) {
      if (!widget.excludeSurfaces?.includes(surface)) {
        surfaces.push(surface);
      }
    }
  }

  return surfaces;
}

/**
 * Widget Registry - extends BaseRegistry with widget-specific queries
 */
class WidgetRegistryImpl extends BaseRegistry<AnyWidgetDefinition> {
  /**
   * Get widgets that can render on a specific surface.
   * Uses capability-based filtering (component/factory presence).
   */
  getBySurface(surface: WidgetSurface, context?: { domain?: string }): AnyWidgetDefinition[] {
    return this.getAll().filter((widget) => canRenderOnSurface(widget, surface, context));
  }

  /**
   * Get widgets by category
   */
  getByCategory(category: WidgetCategory): AnyWidgetDefinition[] {
    return this.getAll().filter((widget) => widget.category === category);
  }

  /**
   * Get widgets by domain
   */
  getByDomain(domain: WidgetDomain): AnyWidgetDefinition[] {
    return this.getAll().filter((widget) => widget.domain === domain);
  }

  /**
   * Get widgets for a specific surface and category.
   * Uses capability-based filtering.
   */
  getBySurfaceAndCategory(
    surface: WidgetSurface,
    category: WidgetCategory,
    context?: { domain?: string }
  ): AnyWidgetDefinition[] {
    return this.getAll().filter(
      (widget) =>
        canRenderOnSurface(widget, surface, context) && widget.category === category
    );
  }

  /**
   * Search widgets by query string
   */
  search(query: string): AnyWidgetDefinition[] {
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
  ): Partial<Record<WidgetCategory, AnyWidgetDefinition[]>> {
    const widgets = surface ? this.getBySurface(surface) : this.getAll();

    const grouped: Partial<Record<WidgetCategory, AnyWidgetDefinition[]>> = {};

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
   * Get registry statistics (uses capability-based filtering)
   */
  getStats() {
    const all = this.getAll();
    return {
      total: all.length,
      bySurface: {
        header: this.getBySurface('header').length,
        statusbar: this.getBySurface('statusbar').length,
        toolbar: this.getBySurface('toolbar').length,
        'panel-composer': this.getBySurface('panel-composer').length,
        overlay: this.getBySurface('overlay').length,
        hud: this.getBySurface('hud').length,
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
      byRenderer: {
        component: all.filter((w) => w.component !== undefined).length,
        factory: all.filter((w) => w.factory !== undefined).length,
        both: all.filter((w) => w.component !== undefined && w.factory !== undefined).length,
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
export function registerWidget(definition: AnyWidgetDefinition): void {
  const hasComponent = definition.component !== undefined;
  const hasFactory = definition.factory !== undefined;

  // Warn if no renderer provided
  if (!hasComponent && !hasFactory) {
    console.warn(
      `Widget "${definition.id}" has no component or factory - it cannot render on any surface`
    );
  }

  // Validate explicit surfaces against capability
  if (definition.surfaces && definition.surfaces.length > 0) {
    for (const surface of definition.surfaces) {
      if (CHROME_SURFACES.includes(surface) && !hasComponent) {
        console.warn(
          `Widget "${definition.id}" declares surface "${surface}" but has no component`
        );
      }
      if (EDITING_CORE_SURFACES.includes(surface) && !hasFactory) {
        console.warn(
          `Widget "${definition.id}" declares surface "${surface}" but has no factory`
        );
      }
    }
  }

  // Validate excludeSurfaces doesn't conflict with explicit surfaces
  if (definition.surfaces && definition.excludeSurfaces) {
    for (const surface of definition.excludeSurfaces) {
      if (definition.surfaces.includes(surface)) {
        console.warn(
          `Widget "${definition.id}" has "${surface}" in both surfaces and excludeSurfaces`
        );
      }
    }
  }

  // Validate surfaceConfig matches capability
  if (definition.surfaceConfig) {
    for (const configKey of Object.keys(definition.surfaceConfig)) {
      const surface = configKey === 'panelComposer' ? 'panel-composer' : configKey;
      if (!canRenderOnSurface(definition, surface as WidgetSurface)) {
        console.warn(
          `Widget "${definition.id}" has surfaceConfig for "${configKey}" but cannot render on "${surface}"`
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
export function getWidget(id: string): AnyWidgetDefinition | undefined {
  return widgetRegistry.get(id);
}

/**
 * Get all widgets for a surface
 */
export function getWidgetsForSurface(surface: WidgetSurface): AnyWidgetDefinition[] {
  return widgetRegistry.getBySurface(surface);
}

/**
 * Get widgets grouped by category for a surface (for menus)
 */
export function getWidgetMenuItems(
  surface: WidgetSurface
): Partial<Record<WidgetCategory, AnyWidgetDefinition[]>> {
  return widgetRegistry.getGroupedByCategory(surface);
}

/**
 * Check if a widget can render on a given surface (by ID).
 * Convenience wrapper around canRenderOnSurface.
 */
export function canWidgetRenderOnSurface(
  widgetId: string,
  surface: WidgetSurface,
  context?: { domain?: string }
): boolean {
  const widget = widgetRegistry.get(widgetId);
  if (!widget) return false;
  return canRenderOnSurface(widget, surface, context);
}
