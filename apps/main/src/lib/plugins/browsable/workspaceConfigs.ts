/**
 * Browsable Configs - Workspace Category
 *
 * Configs for dock-widget, workspace-panel, and panel-group families.
 */

import type { BrowsableFamilyConfig } from '@pixsim7/shared.plugins';

export const dockWidgetConfig: BrowsableFamilyConfig = {
  family: 'dock-widget',
  label: 'Dock Zones',
  icon: '🗂️',
  description: 'Dockview containers that host panels (workspace, control center, etc.)',
  category: 'workspace',
  order: 10,
  columns: [
    { id: 'label', label: 'Name', render: (item) => item.label || item.id },
    { id: 'dockviewId', label: 'Dockview ID', render: (item) => item.dockviewId },
    { id: 'panelScope', label: 'Panel Scope', render: (item) => item.panelScope || '—' },
  ],
  getItemName: (item) => item.label || item.id,
};

export const workspacePanelConfig: BrowsableFamilyConfig = {
  family: 'workspace-panel',
  label: 'Panels',
  icon: '📄',
  description: 'Individual panels that can be added to dockview containers',
  category: 'workspace',
  order: 20,
  columns: [
    { id: 'title', label: 'Title', render: (item) => item.title || item.id },
    { id: 'category', label: 'Category', render: (item) => item.category || '—' },
    { id: 'availableIn', label: 'Available In', render: (item) => item.availableIn?.join(', ') || 'all' },
  ],
  getItemName: (item) => item.title || item.id,
  getItemIcon: (item) => item.icon,
};

export const panelGroupConfig: BrowsableFamilyConfig = {
  family: 'panel-group',
  label: 'Panel Groups',
  icon: '📦',
  description: 'Reusable collections of panels with predefined layouts and presets',
  category: 'workspace',
  order: 30,
  columns: [
    { id: 'title', label: 'Title', render: (item) => item.title || item.id },
    { id: 'category', label: 'Category', render: (item) => item.category || '—' },
    {
      id: 'slots',
      label: 'Slots',
      render: (item) => Object.keys(item.panels || {}).length.toString(),
    },
    {
      id: 'presets',
      label: 'Presets',
      render: (item) => Object.keys(item.presets || {}).length.toString(),
    },
  ],
  getItemName: (item) => item.title || item.id,
  getItemIcon: (item) => item.icon,
};

export const workspaceConfigs: BrowsableFamilyConfig[] = [
  dockWidgetConfig,
  workspacePanelConfig,
  panelGroupConfig,
];
