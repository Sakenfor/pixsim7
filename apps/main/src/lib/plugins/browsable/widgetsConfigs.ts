/**
 * Browsable Configs - Widgets Category
 *
 * Configs for gallery-surface and gizmo-surface families.
 */

import type { BrowsableFamilyConfig } from '@pixsim7/shared.plugins';

export const gallerySurfaceConfig: BrowsableFamilyConfig = {
  family: 'gallery-surface',
  label: 'Gallery Surfaces',
  icon: '🖼️',
  description: 'Different views/layouts for displaying media assets',
  category: 'widgets',
  order: 10,
  columns: [
    { id: 'label', label: 'Name', render: (item) => item.label || item.id },
    { id: 'category', label: 'Category', render: (item) => item.category || '—' },
  ],
  getItemName: (item) => item.label || item.id,
  getItemIcon: (item) => item.icon,
};

export const gizmoSurfaceConfig: BrowsableFamilyConfig = {
  family: 'gizmo-surface',
  label: 'Gizmo Surfaces',
  icon: '🎯',
  description: 'Interactive overlay surfaces for scene editing',
  category: 'widgets',
  order: 20,
  columns: [
    { id: 'label', label: 'Name', render: (item) => item.label || item.id },
    { id: 'category', label: 'Category', render: (item) => item.category || '—' },
    {
      id: 'contexts',
      label: 'Contexts',
      render: (item) => item.supportsContexts?.join(', ') || '—',
    },
  ],
  getItemName: (item) => item.label || item.id,
  getItemIcon: (item) => item.icon,
};

export const widgetsConfigs: BrowsableFamilyConfig[] = [
  gallerySurfaceConfig,
  gizmoSurfaceConfig,
];
