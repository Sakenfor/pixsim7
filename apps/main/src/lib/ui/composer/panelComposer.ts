/**
 * Panel Composer
 *
 * System for composing custom panels from blocks with data binding.
 * Blocks are the building pieces placed in a grid layout.
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

export interface BlockInstance {
  id: string;
  widgetType: string; // Keep 'widgetType' for backward compatibility in serialized data
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
  widgets: BlockInstance[]; // Keep 'widgets' for backward compatibility in serialized data
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

  // Check for block overlaps
  const occupied = new Map<string, string>();
  for (const block of composition.widgets) {
    for (let x = block.position.x; x < block.position.x + block.position.w; x++) {
      for (let y = block.position.y; y < block.position.y + block.position.h; y++) {
        const key = `${x},${y}`;
        if (occupied.has(key)) {
          errors.push(
            `Block "${block.id}" overlaps with "${occupied.get(key)}" at position (${x}, ${y})`
          );
        }
        occupied.set(key, block.id);
      }
    }
  }

  // Check for blocks outside grid bounds
  for (const block of composition.widgets) {
    if (
      block.position.x < 0 ||
      block.position.y < 0 ||
      block.position.x + block.position.w > composition.layout.columns ||
      block.position.y + block.position.h > composition.layout.rows
    ) {
      errors.push(
        `Block "${block.id}" is outside grid bounds (${composition.layout.columns}x${composition.layout.rows})`
      );
    }
  }

  // Check for valid data bindings
  if (composition.dataSources) {
    const dataSourceIds = new Set(composition.dataSources.map((ds) => ds.id));
    for (const block of composition.widgets) {
      if (block.dataBindings) {
        for (const [key, binding] of Object.entries(block.dataBindings)) {
          if (!dataSourceIds.has(binding.sourceId)) {
            errors.push(
              `Block "${block.id}" has invalid data binding "${key}": source "${binding.sourceId}" not found`
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
 * Add a block to a composition
 */
export function addBlock(
  composition: PanelComposition,
  blockType: string,
  position: BlockInstance['position'],
  config: Record<string, any> = {}
): PanelComposition {
  const blockId = `block-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  const newBlock: BlockInstance = {
    id: blockId,
    widgetType: blockType, // Keep 'widgetType' for backward compatibility
    position,
    config,
  };

  return {
    ...composition,
    widgets: [...composition.widgets, newBlock],
    updatedAt: Date.now(),
  };
}

/**
 * Remove a block from a composition
 */
export function removeBlock(
  composition: PanelComposition,
  blockId: string
): PanelComposition {
  return {
    ...composition,
    widgets: composition.widgets.filter((b) => b.id !== blockId),
    updatedAt: Date.now(),
  };
}

/**
 * Update a block in a composition
 */
export function updateBlock(
  composition: PanelComposition,
  blockId: string,
  updates: Partial<BlockInstance>
): PanelComposition {
  return {
    ...composition,
    widgets: composition.widgets.map((b) =>
      b.id === blockId ? { ...b, ...updates } : b
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
  const updatedBlocks = composition.widgets.map((block) => {
    if (block.dataBindings) {
      const filteredBindings = Object.entries(block.dataBindings).filter(
        ([, binding]) => binding.sourceId !== dataSourceId
      );
      return {
        ...block,
        dataBindings: Object.fromEntries(filteredBindings),
      };
    }
    return block;
  });

  return {
    ...composition,
    widgets: updatedBlocks,
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

// ============================================================================
// Backward Compatibility Aliases (deprecated)
// ============================================================================

/** @deprecated Use BlockInstance instead */
export type WidgetInstance = BlockInstance;

/** @deprecated Use addBlock instead */
export const addWidget = addBlock;

/** @deprecated Use removeBlock instead */
export const removeWidget = removeBlock;

/** @deprecated Use updateBlock instead */
export const updateWidget = updateBlock;
