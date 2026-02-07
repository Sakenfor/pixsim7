/**
 * Widget Builder Configs - Workspace Category
 *
 * Configs for dock-widget, workspace-panel, and panel-group families.
 */

import type { WidgetBuilderFamilyConfig } from '@pixsim7/shared.plugins';

type PluginItem = Record<string, unknown>;

export const dockWidgetConfig: WidgetBuilderFamilyConfig = {
  family: 'dock-widget',
  label: 'Dock Zones',
  icon: '🗂️',
  description: 'Dockview containers that host panels (workspace, control center, etc.)',
  category: 'workspace',
  order: 10,
  columns: [
    { id: 'label', label: 'Name', render: (item) => (item as PluginItem).label || (item as PluginItem).id },
    { id: 'dockviewId', label: 'Dockview ID', render: (item) => (item as PluginItem).dockviewId },
    { id: 'panelScope', label: 'Panel Scope', render: (item) => (item as PluginItem).panelScope || '—' },
  ],
  getItemName: (item) => String((item as PluginItem).label || (item as PluginItem).id),
};

export const workspacePanelConfig: WidgetBuilderFamilyConfig = {
  family: 'workspace-panel',
  label: 'Panels',
  icon: '📄',
  description: 'Individual panels that can be added to dockview containers',
  category: 'workspace',
  order: 20,
  columns: [
    { id: 'title', label: 'Title', render: (item) => (item as PluginItem).title || (item as PluginItem).id },
    { id: 'category', label: 'Category', render: (item) => (item as PluginItem).category || '—' },
    { id: 'availableIn', label: 'Available In', render: (item) => ((item as PluginItem).availableIn as string[])?.join(', ') || 'all' },
  ],
  getItemName: (item) => String((item as PluginItem).title || (item as PluginItem).id),
  getItemIcon: (item) => (item as PluginItem).icon as string | undefined,
};

export const panelGroupConfig: WidgetBuilderFamilyConfig = {
  family: 'panel-group',
  label: 'Panel Groups',
  icon: '📦',
  description: 'Reusable collections of panels with predefined layouts and presets',
  category: 'workspace',
  order: 30,
  columns: [
    { id: 'title', label: 'Title', render: (item) => (item as PluginItem).title || (item as PluginItem).id },
    { id: 'category', label: 'Category', render: (item) => (item as PluginItem).category || '—' },
    {
      id: 'slots',
      label: 'Slots',
      render: (item) => Object.keys((item as PluginItem).panels as object || {}).length.toString(),
    },
    {
      id: 'presets',
      label: 'Presets',
      render: (item) => Object.keys((item as PluginItem).presets as object || {}).length.toString(),
    },
  ],
  getItemName: (item) => String((item as PluginItem).title || (item as PluginItem).id),
  getItemIcon: (item) => (item as PluginItem).icon as string | undefined,
};

export const workspaceConfigs: WidgetBuilderFamilyConfig[] = [
  dockWidgetConfig,
  workspacePanelConfig,
  panelGroupConfig,
];
