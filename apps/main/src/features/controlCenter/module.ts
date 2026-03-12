import { createLazyPanelComponent } from '@app/modules/lazyPanelComponent';
import { defineModule } from '@app/modules/types';

const quickGeneratePanel = createLazyPanelComponent('cc-generate', async () => {
  const moduleValue = await import('@features/controlCenter/components/QuickGenerateModule');
  return moduleValue.QuickGenerateModule;
}, {
  initializeModuleId: 'generation',
});

const providersPanel = createLazyPanelComponent('cc-providers', async () => {
  const moduleValue = await import('@features/providers/components/ProviderOverviewModule');
  return moduleValue.ProviderOverviewModule;
}, {
  initializeModuleId: 'workspace',
});

const panelsLauncherPanel = createLazyPanelComponent('cc-panels', async () => {
  const moduleValue = await import('@features/controlCenter/components/PanelLauncherModule');
  return moduleValue.PanelLauncherModule;
}, {
  initializeModuleId: 'workspace',
});

/**
 * Control Center Module
 *
 * Manages the Control Center UI system including the dock-based interface.
 * The Control Center provides quick access to generation, presets, providers,
 * and other tools.
 *
 * Note: Cubes are now a separate feature (@features/cubes) with their own module.
 */
export const controlCenterModule = defineModule({
  id: 'control-center',
  name: 'Control Center Module',
  updatedAt: '2026-03-10T00:00:00Z',
  changeNote: 'Added module metadata baseline for control center registration.',
  featureHighlights: ['Control Center module now participates in shared latest-update metadata.'],
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
      component: quickGeneratePanel,
      category: 'core',
      order: 10,
      enabledByDefault: true,
      description: 'Quick asset generation',
      tags: ['generate', 'create', 'ai'],
      scopes: ['generation'],
      availableIn: ['control-center'],
    },
    {
      id: 'cc-providers',
      title: 'Providers',
      icon: '🌐',
      component: providersPanel,
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
      component: panelsLauncherPanel,
      category: 'system',
      order: 40,
      enabledByDefault: true,
      description: 'Panel launcher and workspace',
      tags: ['panels', 'workspace'],
    },
  ],
});
