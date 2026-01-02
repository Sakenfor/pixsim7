/**
 * Block Widgets - Unified Registration
 *
 * Registers panel-composer blocks directly in the unified widget registry.
 * Replaces the legacy composer/blockRegistry registration.
 */

import { registerWidget } from '../widgetRegistry';
import type { WidgetDefinition, WidgetComponentProps } from '../types';

// Block components
import { TextWidget } from '@components/widgets/TextWidget';
import { MetricWidget } from '@components/widgets/MetricWidget';
import { ListWidget } from '@components/widgets/ListWidget';
import { GalleryGridWidget } from '@components/widgets/GalleryGridWidget';

// ============================================================================
// Helper: Wrap block component for unified API
// ============================================================================

function wrapBlockComponent(
  BlockComponent: React.ComponentType<{
    config: Record<string, any>;
    data?: any;
    onDataChange?: (data: any) => void;
  }>
): React.ComponentType<WidgetComponentProps> {
  return function WrappedBlock({ settings, data, onDataChange }: WidgetComponentProps) {
    // Forward resolved binding values both as named props (for components that
    // expect bound values directly) and as `data` (legacy path).
    const bindingProps =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {};

    return (
      <BlockComponent
        config={settings as Record<string, any>}
        {...bindingProps}
        data={data}
        onDataChange={onDataChange}
      />
    );
  };
}

// ============================================================================
// Widget Definitions
// ============================================================================

export const textBlockWidget: WidgetDefinition = {
  id: 'block-text',
  title: 'Text',
  description: 'Display static or dynamic text content',
  icon: 'T',
  category: 'display',
  domain: 'workspace',
  tags: ['text', 'label', 'content', 'block', 'panel-composer'],
  surfaces: ['panel-composer'],
  surfaceConfig: {
    panelComposer: {
      minWidth: 1,
      minHeight: 1,
      defaultWidth: 3,
      defaultHeight: 1,
      resizable: true,
    },
  },
  component: wrapBlockComponent(TextWidget),
  defaultSettings: {
    content: 'Text',
    align: 'left',
    size: 'base',
    weight: 'normal',
  },
  configSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', title: 'Content', default: 'Text' },
      align: { type: 'string', title: 'Alignment', enum: ['left', 'center', 'right'], default: 'left' },
      size: { type: 'string', title: 'Size', enum: ['xs', 'sm', 'base', 'lg', 'xl', '2xl'], default: 'base' },
      weight: { type: 'string', title: 'Weight', enum: ['normal', 'medium', 'semibold', 'bold'], default: 'normal' },
      color: { type: 'string', title: 'Color', default: '' },
    },
  },
};

export const metricBlockWidget: WidgetDefinition = {
  id: 'block-metric',
  title: 'Metric',
  description: 'Display a single metric/KPI',
  icon: '#',
  category: 'display',
  domain: 'workspace',
  tags: ['metric', 'kpi', 'number', 'stat', 'block', 'panel-composer'],
  surfaces: ['panel-composer'],
  surfaceConfig: {
    panelComposer: {
      minWidth: 2,
      minHeight: 2,
      defaultWidth: 3,
      defaultHeight: 2,
      resizable: true,
    },
  },
  component: wrapBlockComponent(MetricWidget),
  defaultSettings: {
    label: 'Metric',
    value: 0,
    format: 'number',
    color: '#3b82f6',
  },
  configSchema: {
    type: 'object',
    properties: {
      label: { type: 'string', title: 'Label', default: 'Metric' },
      value: { type: 'number', title: 'Value', default: 0 },
      format: { type: 'string', title: 'Format', enum: ['number', 'currency', 'percentage', 'text'], default: 'number' },
      trend: { type: 'string', title: 'Trend', enum: ['up', 'down', 'neutral'] },
      trendValue: { type: 'string', title: 'Trend Value' },
      color: { type: 'string', title: 'Color', default: '#3b82f6' },
    },
  },
};

export const listBlockWidget: WidgetDefinition = {
  id: 'block-list',
  title: 'List',
  description: 'Display a list of items',
  icon: 'L',
  category: 'display',
  domain: 'workspace',
  tags: ['list', 'items', 'collection', 'block', 'panel-composer'],
  surfaces: ['panel-composer'],
  surfaceConfig: {
    panelComposer: {
      minWidth: 2,
      minHeight: 3,
      defaultWidth: 4,
      defaultHeight: 4,
      resizable: true,
    },
  },
  component: wrapBlockComponent(ListWidget),
  defaultSettings: {
    title: 'List',
    emptyMessage: 'No items',
    sortable: false,
    searchable: false,
  },
  configSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', title: 'Title', default: 'List' },
      itemKey: { type: 'string', title: 'Item Key' },
      emptyMessage: { type: 'string', title: 'Empty Message', default: 'No items' },
      maxItems: { type: 'number', title: 'Max Items' },
      sortable: { type: 'boolean', title: 'Sortable', default: false },
      searchable: { type: 'boolean', title: 'Searchable', default: false },
    },
  },
};

export const galleryGridBlockWidget: WidgetDefinition = {
  id: 'block-gallery-grid',
  title: 'Gallery Grid',
  description: 'Display images in a grid layout',
  icon: 'grid',
  category: 'display',
  domain: 'workspace',
  tags: ['gallery', 'grid', 'images', 'media', 'block', 'panel-composer'],
  surfaces: ['panel-composer'],
  surfaceConfig: {
    panelComposer: {
      minWidth: 3,
      minHeight: 3,
      defaultWidth: 6,
      defaultHeight: 4,
      resizable: true,
    },
  },
  component: wrapBlockComponent(GalleryGridWidget),
  defaultSettings: {
    columns: 3,
    gap: 8,
    aspectRatio: '1:1',
  },
  configSchema: {
    type: 'object',
    properties: {
      columns: { type: 'number', title: 'Columns', default: 3 },
      gap: { type: 'number', title: 'Gap', default: 8 },
      aspectRatio: { type: 'string', title: 'Aspect Ratio', enum: ['1:1', '4:3', '16:9', 'auto'], default: '1:1' },
    },
  },
};

// ============================================================================
// All Block Widgets
// ============================================================================

export const blockWidgetDefinitions: WidgetDefinition[] = [
  textBlockWidget,
  metricBlockWidget,
  listBlockWidget,
  galleryGridBlockWidget,
];

/**
 * Register all block widgets in the unified registry.
 */
export function registerBlockWidgets(): void {
  for (const widget of blockWidgetDefinitions) {
    registerWidget(widget);
  }
  console.log(`[widgets] Registered ${blockWidgetDefinitions.length} block widgets`);
}
