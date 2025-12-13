/**
 * Panel Composer
 *
 * System for composing custom panels from widgets with data binding.
 * Part of Task 50 Phase 50.4 - Panel Builder/Composer
 *
 * Integrates with Task 51 data binding system for live data.
 */

import type { DataSourceBinding, DataSourceDefinition } from '../../dataBinding';

export interface GridLayout {
  type: 'grid';
  columns: number;
  rows: number;
  gap?: number;
}

export interface WidgetInstance {
  id: string;
  widgetType: string;
  position: {
    x: number; // Grid column
    y: number; // Grid row
    w: number; // Width in grid units
    h: number; // Height in grid units
  };
  config: Record<string, any>;
  dataBindings?: Record<string, DataSourceBinding>; // Using Task 51 registry-based binding
}

export interface PanelComposition {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  layout: GridLayout;
  widgets: WidgetInstance[];
  dataSources?: DataSourceDefinition[]; // Using Task 51 DataSourceDefinition
  styles?: React.CSSProperties;
  version?: string; // Schema version
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Validate a panel composition
 */
export function validateComposition(composition: PanelComposition): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for required fields
  if (!composition.id) {
    errors.push('Composition must have an id');
  }

  if (!composition.name) {
    errors.push('Composition must have a name');
  }

  if (!composition.layout) {
    errors.push('Composition must have a layout');
  }

  // Check for widget overlaps
  const occupied = new Map<string, string>();
  for (const widget of composition.widgets) {
    for (let x = widget.position.x; x < widget.position.x + widget.position.w; x++) {
      for (let y = widget.position.y; y < widget.position.y + widget.position.h; y++) {
        const key = `${x},${y}`;
        if (occupied.has(key)) {
          errors.push(
            `Widget "${widget.id}" overlaps with "${occupied.get(key)}" at position (${x}, ${y})`
          );
        }
        occupied.set(key, widget.id);
      }
    }
  }

  // Check for widgets outside grid bounds
  for (const widget of composition.widgets) {
    if (
      widget.position.x < 0 ||
      widget.position.y < 0 ||
      widget.position.x + widget.position.w > composition.layout.columns ||
      widget.position.y + widget.position.h > composition.layout.rows
    ) {
      errors.push(
        `Widget "${widget.id}" is outside grid bounds (${composition.layout.columns}x${composition.layout.rows})`
      );
    }
  }

  // Check for valid data bindings
  if (composition.dataSources) {
    const dataSourceIds = new Set(composition.dataSources.map((ds) => ds.id));
    for (const widget of composition.widgets) {
      if (widget.dataBindings) {
        for (const [key, binding] of Object.entries(widget.dataBindings)) {
          if (!dataSourceIds.has(binding.sourceId)) {
            errors.push(
              `Widget "${widget.id}" has invalid data binding "${key}": source "${binding.sourceId}" not found`
            );
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a new empty composition
 */
export function createComposition(
  id: string,
  name: string,
  columns: number = 12,
  rows: number = 8
): PanelComposition {
  return {
    id,
    name,
    layout: {
      type: 'grid',
      columns,
      rows,
      gap: 8,
    },
    widgets: [],
    dataSources: [],
    version: '1.0',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Add a widget to a composition
 */
export function addWidget(
  composition: PanelComposition,
  widgetType: string,
  position: WidgetInstance['position'],
  config: Record<string, any> = {}
): PanelComposition {
  const widgetId = `widget-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  const newWidget: WidgetInstance = {
    id: widgetId,
    widgetType,
    position,
    config,
  };

  return {
    ...composition,
    widgets: [...composition.widgets, newWidget],
    updatedAt: Date.now(),
  };
}

/**
 * Remove a widget from a composition
 */
export function removeWidget(
  composition: PanelComposition,
  widgetId: string
): PanelComposition {
  return {
    ...composition,
    widgets: composition.widgets.filter((w) => w.id !== widgetId),
    updatedAt: Date.now(),
  };
}

/**
 * Update a widget in a composition
 */
export function updateWidget(
  composition: PanelComposition,
  widgetId: string,
  updates: Partial<WidgetInstance>
): PanelComposition {
  return {
    ...composition,
    widgets: composition.widgets.map((w) =>
      w.id === widgetId ? { ...w, ...updates } : w
    ),
    updatedAt: Date.now(),
  };
}

/**
 * Add a data source to a composition
 */
export function addDataSource(
  composition: PanelComposition,
  dataSource: DataSourceDefinition
): PanelComposition {
  return {
    ...composition,
    dataSources: [...(composition.dataSources || []), dataSource],
    updatedAt: Date.now(),
  };
}

/**
 * Remove a data source from a composition
 */
export function removeDataSource(
  composition: PanelComposition,
  dataSourceId: string
): PanelComposition {
  // Also remove any data bindings that reference this data source
  const updatedWidgets = composition.widgets.map((widget) => {
    if (widget.dataBindings) {
      const filteredBindings = Object.entries(widget.dataBindings).filter(
        ([, binding]) => binding.sourceId !== dataSourceId // Updated to use sourceId from Task 51
      );
      return {
        ...widget,
        dataBindings: Object.fromEntries(filteredBindings),
      };
    }
    return widget;
  });

  return {
    ...composition,
    widgets: updatedWidgets,
    dataSources: (composition.dataSources || []).filter((ds) => ds.id !== dataSourceId),
    updatedAt: Date.now(),
  };
}

/**
 * Export composition as JSON
 */
export function exportComposition(composition: PanelComposition): string {
  return JSON.stringify(composition, null, 2);
}

/**
 * Import composition from JSON
 */
export function importComposition(json: string): PanelComposition | null {
  try {
    const composition = JSON.parse(json) as PanelComposition;
    const validation = validateComposition(composition);

    if (!validation.valid) {
      console.error('Invalid composition:', validation.errors);
      return null;
    }

    return composition;
  } catch (error) {
    console.error('Failed to parse composition JSON:', error);
    return null;
  }
}
