/**
 * Widget Registry Views
 *
 * Domain-specific views into the unified widget registry.
 * These replace separate registries - no adapters needed.
 *
 * Instead of:
 *   - editing-core/widgetRegistry (separate)
 *   - composer/blockRegistry (separate)
 *   - widgets/widgetRegistry (unified)
 *   + adapters to sync them
 *
 * We have:
 *   - widgets/widgetRegistry (canonical)
 *   - views that filter by surface/domain
 */

import type { UnifiedWidgetConfig } from '@lib/editing-core';

import type { WidgetDefinition, WidgetSurface } from './types';
import { widgetRegistry, canRenderOnSurface } from './widgetRegistry';

// ============================================================================
// Overlay/HUD View (replaces editing-core registry)
// ============================================================================

/**
 * View for overlay widgets.
 * Provides editing-core compatible API over unified registry.
 */
export const overlayWidgets = {
  /**
   * Get all overlay-capable widgets.
   */
  getAll(): WidgetDefinition[] {
    return widgetRegistry.getBySurface('overlay');
  },

  /**
   * Get widget by ID (editing-core used 'type' as ID).
   * Uses capability-based filtering.
   */
  get(id: string): WidgetDefinition | undefined {
    const widget = widgetRegistry.get(id);
    if (widget && canRenderOnSurface(widget, 'overlay')) {
      return widget;
    }
    return undefined;
  },

  /**
   * Create widget instance using factory.
   * Compatible with editing-core's createWidget().
   */
  createWidget<T = unknown>(
    id: string,
    config: UnifiedWidgetConfig,
    runtimeOptions?: { componentType?: string; [key: string]: unknown }
  ): T | null {
    const widget = this.get(id);
    if (!widget?.factory) {
      console.warn(`No factory for widget: ${id}`);
      return null;
    }
    return widget.factory(config, runtimeOptions) as T;
  },

  /**
   * List all widget types (IDs).
   */
  listTypes(): string[] {
    return this.getAll().map(w => w.id);
  },
};

/**
 * View for HUD widgets.
 */
export const hudWidgets = {
  getAll(): WidgetDefinition[] {
    return widgetRegistry.getBySurface('hud');
  },

  get(id: string): WidgetDefinition | undefined {
    const widget = widgetRegistry.get(id);
    if (widget && canRenderOnSurface(widget, 'hud')) {
      return widget;
    }
    return undefined;
  },

  createWidget<T = unknown>(
    id: string,
    config: UnifiedWidgetConfig,
    runtimeOptions?: { componentType?: string; [key: string]: unknown }
  ): T | null {
    const widget = this.get(id);
    if (!widget?.factory) {
      return null;
    }
    return widget.factory(config, { ...runtimeOptions, componentType: 'hud' }) as T;
  },
};

// ============================================================================
// Blocks View (replaces blockRegistry)
// ============================================================================

/**
 * View for panel-composer blocks.
 * Provides block-registry compatible API over unified registry.
 */
export const blockWidgets = {
  /**
   * Get all composer-capable widgets (blocks).
   */
  getAll(): WidgetDefinition[] {
    return widgetRegistry.getBySurface('panel-composer');
  },

  /**
   * Get block by ID.
   * Uses capability-based filtering.
   */
  get(id: string): WidgetDefinition | undefined {
    const widget = widgetRegistry.get(id);
    if (widget && canRenderOnSurface(widget, 'panel-composer')) {
      return widget;
    }
    return undefined;
  },

  /**
   * Get blocks by category.
   */
  getByCategory(category: string): WidgetDefinition[] {
    return this.getAll().filter(w => w.category === category);
  },

  /**
   * Search blocks.
   */
  search(query: string): WidgetDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(w =>
      w.id.toLowerCase().includes(lowerQuery) ||
      w.title.toLowerCase().includes(lowerQuery) ||
      w.tags?.some(t => t.toLowerCase().includes(lowerQuery))
    );
  },
};

// ============================================================================
// Chrome View (header, statusbar, toolbar)
// ============================================================================

/**
 * View for chrome widgets (header, statusbar, toolbar).
 * Uses capability-based filtering.
 */
export const chromeWidgets = {
  getAll(): WidgetDefinition[] {
    return widgetRegistry.getAll().filter(w =>
      canRenderOnSurface(w, 'header') ||
      canRenderOnSurface(w, 'statusbar') ||
      canRenderOnSurface(w, 'toolbar')
    );
  },

  getForSurface(surface: 'header' | 'statusbar' | 'toolbar'): WidgetDefinition[] {
    return widgetRegistry.getBySurface(surface);
  },

  get(id: string): WidgetDefinition | undefined {
    const widget = widgetRegistry.get(id);
    if (widget && (
      canRenderOnSurface(widget, 'header') ||
      canRenderOnSurface(widget, 'statusbar') ||
      canRenderOnSurface(widget, 'toolbar')
    )) {
      return widget;
    }
    return undefined;
  },
};

// ============================================================================
// Generic Surface View Factory
// ============================================================================

/**
 * Create a view for any surface.
 * Uses capability-based filtering.
 */
export function createSurfaceView(surface: WidgetSurface, context?: { domain?: string }) {
  return {
    getAll: () => widgetRegistry.getBySurface(surface, context),
    get: (id: string) => {
      const w = widgetRegistry.get(id);
      return w && canRenderOnSurface(w, surface, context) ? w : undefined;
    },
    getByCategory: (category: string) =>
      widgetRegistry.getBySurfaceAndCategory(surface, category as any, context),
  };
}
