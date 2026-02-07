/**
 * Widget Builder Configs - Widgets Category
 *
 * Configs for gallery-surface and gizmo-surface families.
 */

import type { WidgetBuilderFamilyConfig } from '@pixsim7/shared.plugins';

type PluginItem = Record<string, unknown>;

export const gallerySurfaceConfig: WidgetBuilderFamilyConfig = {
  family: 'gallery-surface',
  label: 'Gallery Surfaces',
  icon: '🖼️',
  description: 'Different views/layouts for displaying media assets',
  category: 'widgets',
  order: 10,
  columns: [
    { id: 'label', label: 'Name', render: (item) => (item as PluginItem).label || (item as PluginItem).id },
    { id: 'category', label: 'Category', render: (item) => (item as PluginItem).category || '—' },
  ],
  getItemName: (item) => String((item as PluginItem).label || (item as PluginItem).id),
  getItemIcon: (item) => (item as PluginItem).icon as string | undefined,
};

export const gizmoSurfaceConfig: WidgetBuilderFamilyConfig = {
  family: 'gizmo-surface',
  label: 'Gizmo Surfaces',
  icon: '🎯',
  description: 'Interactive overlay surfaces for scene editing',
  category: 'widgets',
  order: 20,
  columns: [
    { id: 'label', label: 'Name', render: (item) => (item as PluginItem).label || (item as PluginItem).id },
    { id: 'category', label: 'Category', render: (item) => (item as PluginItem).category || '—' },
    {
      id: 'contexts',
      label: 'Contexts',
      render: (item) => ((item as PluginItem).supportsContexts as string[])?.join(', ') || '—',
    },
  ],
  getItemName: (item) => String((item as PluginItem).label || (item as PluginItem).id),
  getItemIcon: (item) => (item as PluginItem).icon as string | undefined,
};

export const widgetsConfigs: WidgetBuilderFamilyConfig[] = [
  gallerySurfaceConfig,
  gizmoSurfaceConfig,
];
