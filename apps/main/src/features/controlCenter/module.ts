
import { PanelLauncherModule } from '@features/controlCenter/components/PanelLauncherModule';
import { QuickGenerateModule } from '@features/controlCenter/components/QuickGenerateModule';
import { ProviderOverviewModule } from '@features/providers';

import type { Module } from '@app/modules/types';

/**
 * Control Center Module
 *
 * Manages the Control Center UI system including the dock-based interface.
 * The Control Center provides quick access to generation, presets, providers,
 * and other tools.
 *
 * Note: Cubes are now a separate feature (@features/cubes) with their own module.
 */
export const controlCenterModule: Module = {
  id: 'control-center',
  name: 'Control Center Module',
  priority: 50, // Standard UI module

  async initialize() {
    // Control center initialization (dock mode is default)
  },

  // Auto-register Control Center panels to the panel catalog
  controlCenterPanels: [
    {
      id: 'cc-generate',
      title: 'Generate',
      icon: '⚡',
      component: QuickGenerateModule,
      category: 'core',
      order: 10,
      enabledByDefault: true,
      description: 'Quick asset generation',
      tags: ['generate', 'create', 'ai'],
      scopes: ['generation'],
    },
    {
      id: 'cc-providers',
      title: 'Providers',
      icon: '🌐',
      component: ProviderOverviewModule,
      category: 'system',
      order: 30,
      enabledByDefault: true,
      description: 'API provider overview and status',
      tags: ['providers', 'api', 'services'],
    },
    {
      id: 'cc-panels',
      title: 'Panels',
      icon: '🪟',
      component: PanelLauncherModule,
      category: 'system',
      order: 40,
      enabledByDefault: true,
      description: 'Panel launcher and workspace',
      tags: ['panels', 'workspace'],
    },
  ],
};
