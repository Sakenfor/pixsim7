/**
 * Built-in Blocks
 *
 * Register all built-in composable panel blocks.
 * Blocks are building pieces for composed panels (grid layouts).
 */

import { TextWidget } from '../../../components/widgets/TextWidget';
import { MetricWidget } from '../../../components/widgets/MetricWidget';
import { ListWidget } from '../../../components/widgets/ListWidget';
import { galleryGridWidgetDefinition } from '../../../components/widgets/GalleryGridWidget';
import type { BlockDefinition } from './blockRegistry';

export const builtInBlocks: BlockDefinition[] = [
  {
    id: 'text',
    type: 'text',
    title: 'Text',
    component: TextWidget,
    category: 'display',
    icon: 'T',
    description: 'Display static or dynamic text content',
    tags: ['text', 'label', 'content'],
    configSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          title: 'Content',
          description: 'Text content to display',
          default: 'Text',
        },
        align: {
          type: 'string',
          title: 'Alignment',
          description: 'Text alignment',
          enum: ['left', 'center', 'right'],
          default: 'left',
        },
        size: {
          type: 'string',
          title: 'Size',
          description: 'Text size',
          enum: ['xs', 'sm', 'base', 'lg', 'xl', '2xl'],
          default: 'base',
        },
        weight: {
          type: 'string',
          title: 'Weight',
          description: 'Font weight',
          enum: ['normal', 'medium', 'semibold', 'bold'],
          default: 'normal',
        },
        color: {
          type: 'string',
          title: 'Color',
          description: 'Text color (CSS color)',
          default: '',
        },
      },
    },
    defaultConfig: {
      content: 'Text',
      align: 'left',
      size: 'base',
      weight: 'normal',
    },
    minWidth: 1,
    minHeight: 1,
    defaultWidth: 3,
    defaultHeight: 1,
    resizable: true,
    requiresData: false,
  },
  {
    id: 'metric',
    type: 'metric',
    title: 'Metric',
    component: MetricWidget,
    category: 'display',
    icon: '#',
    description: 'Display a single metric/KPI',
    tags: ['metric', 'kpi', 'number', 'stat'],
    configSchema: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          title: 'Label',
          description: 'Metric label',
          default: 'Metric',
        },
        value: {
          type: 'number',
          title: 'Value',
          description: 'Metric value (if not using data binding)',
          default: 0,
        },
        format: {
          type: 'string',
          title: 'Format',
          description: 'Value format',
          enum: ['number', 'currency', 'percentage', 'text'],
          default: 'number',
        },
        trend: {
          type: 'string',
          title: 'Trend',
          description: 'Trend indicator',
          enum: ['up', 'down', 'neutral'],
        },
        trendValue: {
          type: 'string',
          title: 'Trend Value',
          description: 'Trend value text',
        },
        color: {
          type: 'string',
          title: 'Color',
          description: 'Value color (CSS color)',
          default: '#3b82f6',
        },
      },
    },
    defaultConfig: {
      label: 'Metric',
      value: 0,
      format: 'number',
      color: '#3b82f6',
    },
    minWidth: 2,
    minHeight: 2,
    defaultWidth: 3,
    defaultHeight: 2,
    resizable: true,
    requiresData: false,
  },
  {
    id: 'list',
    type: 'list',
    title: 'List',
    component: ListWidget,
    category: 'display',
    icon: 'L',
    description: 'Display a list of items',
    tags: ['list', 'items', 'collection'],
    configSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          title: 'Title',
          description: 'List title',
          default: 'List',
        },
        itemKey: {
          type: 'string',
          title: 'Item Key',
          description: 'Property key if items are objects',
        },
        emptyMessage: {
          type: 'string',
          title: 'Empty Message',
          description: 'Message when list is empty',
          default: 'No items',
        },
        maxItems: {
          type: 'number',
          title: 'Max Items',
          description: 'Maximum number of items to display',
        },
        sortable: {
          type: 'boolean',
          title: 'Sortable',
          description: 'Allow sorting',
          default: false,
        },
        searchable: {
          type: 'boolean',
          title: 'Searchable',
          description: 'Show search box',
          default: false,
        },
      },
    },
    defaultConfig: {
      title: 'List',
      emptyMessage: 'No items',
      sortable: false,
      searchable: false,
    },
    minWidth: 2,
    minHeight: 3,
    defaultWidth: 4,
    defaultHeight: 4,
    resizable: true,
    requiresData: true,
  },
  // Gallery Grid Block
  galleryGridWidgetDefinition,
];

/**
 * Register all built-in blocks
 */
export function registerBuiltInBlocks(registry: any) {
  builtInBlocks.forEach((block) => {
    registry.register(block);
  });
}

// ============================================================================
// Backward Compatibility Aliases (deprecated)
// ============================================================================

/** @deprecated Use builtInBlocks instead */
export const builtInWidgets = builtInBlocks;

/** @deprecated Use registerBuiltInBlocks instead */
export const registerBuiltInWidgets = registerBuiltInBlocks;
