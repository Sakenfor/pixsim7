/**
 * Browsable Configs - Tools Category
 *
 * Configs for graph-editor and dev-tool families.
 */

import type { BrowsableFamilyConfig } from '@pixsim7/shared.plugins';

export const graphEditorConfig: BrowsableFamilyConfig = {
  family: 'graph-editor',
  label: 'Graph Editors',
  icon: '🔀',
  description: 'Node graph editors for scenes, arcs, and other graph-based content',
  category: 'tools',
  order: 10,
  columns: [
    { id: 'label', label: 'Name', render: (item) => item.label || item.id },
    { id: 'category', label: 'Category', render: (item) => item.category || '—' },
    { id: 'storeId', label: 'Store', render: (item) => item.storeId || '—' },
  ],
  getItemName: (item) => item.label || item.id,
};

export const devToolConfig: BrowsableFamilyConfig = {
  family: 'dev-tool',
  label: 'Dev Tools',
  icon: '🛠️',
  description: 'Developer tools and debugging utilities',
  category: 'tools',
  order: 50,
  columns: [
    { id: 'label', label: 'Name', render: (item) => item.label || item.id },
    { id: 'category', label: 'Category', render: (item) => item.category || '—' },
  ],
  getItemName: (item) => item.label || item.id,
  getItemIcon: (item) => item.icon,
};

export const toolsConfigs: BrowsableFamilyConfig[] = [
  graphEditorConfig,
  devToolConfig,
];
