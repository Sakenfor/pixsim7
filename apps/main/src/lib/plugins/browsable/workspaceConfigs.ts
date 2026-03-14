/**
 * Workspace-related browsable family configs.
 * Configs for dock-widget and workspace-panel families.
 */

import type { WidgetBuilderFamilyConfig } from '../browsableFamilies';

type PluginItem = Record<string, unknown>;

export const dockWidgetConfig: WidgetBuilderFamilyConfig = {
  family: 'dock-widget',
  label: 'Dock Widgets',
  icon: '🗂️',
  description: 'Dockview containers that host panels',
  category: 'workspace',
  order: 10,
  columns: [
    { id: 'label', label: 'Label', render: (item) => (item as PluginItem).label || (item as PluginItem).id },
    { id: 'dockviewId', label: 'Dockview ID', render: (item) => (item as PluginItem).dockviewId || '—' },
    { id: 'panelScope', label: 'Panel Scope', render: (item) => (item as PluginItem).panelScope || '—' },
  ],
  getItemName: (item) => String((item as PluginItem).label || (item as PluginItem).id),
  getItemIcon: () => undefined,
};

export const workspacePanelConfig: WidgetBuilderFamilyConfig = {
  family: 'workspace-panel',
  label: 'Workspace Panels',
  icon: '📋',
  description: 'Individual panels available in dockview containers',
  category: 'workspace',
  order: 20,
  columns: [
    { id: 'title', label: 'Title', render: (item) => (item as PluginItem).title || (item as PluginItem).id },
    { id: 'category', label: 'Category', render: (item) => (item as PluginItem).category || '—' },
  ],
  getItemName: (item) => String((item as PluginItem).title || (item as PluginItem).id),
  getItemIcon: (item) => (item as PluginItem).icon as string | undefined,
};

export const workspaceConfigs: WidgetBuilderFamilyConfig[] = [
  dockWidgetConfig,
  workspacePanelConfig,
];
