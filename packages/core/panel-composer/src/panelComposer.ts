/**
 * Panel Composer
 *
 * Framework-agnostic composition model for panels built from blocks.
 * Includes serialization helpers and validation utilities.
 */

// ============================================================================
// Data Binding Types (framework-agnostic)
// ============================================================================

/**
 * Core data source types.
 */
export type DataSourceType = "store" | "static" | "computed";

/**
 * Data source definition (serializable).
 */
export interface DataSourceDefinition {
  id: string;
  type: DataSourceType;

  // Human-friendly metadata
  label: string;
  description?: string;
  tags?: string[];

  // For 'store' sources
  storeId?: string;
  path?: string;

  // For 'static' sources
  value?: unknown;

  // For 'computed' sources
  dependencies?: string[];
  transformId?: string;

  // Caching hints
  cache?: boolean;
  refreshIntervalMs?: number;
}

/**
 * Data source binding - how widgets refer to registered data sources.
 */
export interface DataSourceBinding {
  id: string;
  sourceId: string;
  targetProp: string;
  transformId?: string;
  fallbackValue?: unknown;
}

// ============================================================================
// Composition Model
// ============================================================================

export interface GridLayout {
  type: "grid";
  columns: number;
  rows: number;
  gap?: number;
}

export interface BlockInstance {
  id: string;
  widgetType: string; // Keep 'widgetType' for backward compatibility in serialized data
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  config: Record<string, any>;
  dataBindings?: Record<string, DataSourceBinding>;
}

export type PanelCompositionStyles = Record<string, string | number>;

export interface PanelComposition {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  layout: GridLayout;
  widgets: BlockInstance[]; // Keep 'widgets' for backward compatibility in serialized data
  dataSources?: DataSourceDefinition[];
  styles?: PanelCompositionStyles;
  version?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Validate a panel composition.
 */
export function validateComposition(composition: PanelComposition): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!composition.id) {
    errors.push("Composition must have an id");
  }

  if (!composition.name) {
    errors.push("Composition must have a name");
  }

  if (!composition.layout) {
    errors.push("Composition must have a layout");
  }

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
 * Create a new empty composition.
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
      type: "grid",
      columns,
      rows,
      gap: 8,
    },
    widgets: [],
    dataSources: [],
    version: "1.0",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Add a block to a composition.
 */
export function addBlock(
  composition: PanelComposition,
  blockType: string,
  position: BlockInstance["position"],
  config: Record<string, any> = {}
): PanelComposition {
  const blockId = `block-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  const newBlock: BlockInstance = {
    id: blockId,
    widgetType: blockType,
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
 * Remove a block from a composition.
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
 * Update a block in a composition.
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
 * Add a data source to a composition.
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
 * Remove a data source from a composition.
 */
export function removeDataSource(
  composition: PanelComposition,
  dataSourceId: string
): PanelComposition {
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
 * Export composition as JSON.
 */
export function exportComposition(composition: PanelComposition): string {
  return JSON.stringify(composition, null, 2);
}

/**
 * Import composition from JSON.
 */
export function importComposition(json: string): PanelComposition | null {
  try {
    const composition = JSON.parse(json) as PanelComposition;
    const validation = validateComposition(composition);

    if (!validation.valid) {
      console.error("Invalid composition:", validation.errors);
      return null;
    }

    return composition;
  } catch (error) {
    console.error("Failed to parse composition JSON:", error);
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
