/**
 * Widget Builder Configs - Tools Category
 *
 * Configs for graph-editor and dev-tool families.
 */

import type { WidgetBuilderFamilyConfig } from '@pixsim7/shared.plugins';

type PluginItem = Record<string, unknown>;

export const graphEditorConfig: WidgetBuilderFamilyConfig = {
  family: 'graph-editor',
  label: 'Graph Editors',
  icon: '🔀',
  description: 'Node graph editors for scenes, arcs, and other graph-based content',
  category: 'tools',
  order: 10,
  columns: [
    { id: 'label', label: 'Name', render: (item) => (item as PluginItem).label || (item as PluginItem).id },
    { id: 'category', label: 'Category', render: (item) => (item as PluginItem).category || '—' },
    { id: 'storeId', label: 'Store', render: (item) => (item as PluginItem).storeId || '—' },
  ],
  getItemName: (item) => String((item as PluginItem).label || (item as PluginItem).id),
};

export const devToolConfig: WidgetBuilderFamilyConfig = {
  family: 'dev-tool',
  label: 'Dev Tools',
  icon: '🛠️',
  description: 'Developer tools and debugging utilities',
  category: 'tools',
  order: 50,
  columns: [
    { id: 'label', label: 'Name', render: (item) => (item as PluginItem).label || (item as PluginItem).id },
    { id: 'category', label: 'Category', render: (item) => (item as PluginItem).category || '—' },
  ],
  getItemName: (item) => String((item as PluginItem).label || (item as PluginItem).id),
  getItemIcon: (item) => (item as PluginItem).icon as string | undefined,
};

export const toolsConfigs: WidgetBuilderFamilyConfig[] = [
  graphEditorConfig,
  devToolConfig,
];
