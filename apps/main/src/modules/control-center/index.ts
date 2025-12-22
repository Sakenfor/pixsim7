import type { Module } from '../types';
import { registerCubeExpansions } from '@/plugins/ui/cube-formation-v1/lib';
import { QuickGenerateModule } from '@features/controlCenter/components/QuickGenerateModule';
import { PresetsModule } from '@features/controlCenter/components/PresetsModule';
import { ProviderOverviewModule } from '@features/providers';
import { PanelLauncherModule } from '@features/controlCenter/components/PanelLauncherModule';

/**
 * Control Center Module
 *
 * Manages the Control Center UI system including cube expansions
 * and control center configurations. The Control Center provides
 * quick access to generation, presets, providers, and other tools.
 */
export const controlCenterModule: Module = {
  id: 'control-center',
  name: 'Control Center Module',
  priority: 50, // Standard UI module

  async initialize() {
    // Register cube expansions for the cube-based control center mode
    registerCubeExpansions();
  },

  // Auto-register Control Center modules
  controlCenterModules: [
    {
      id: 'quickGenerate',
      label: 'Generate',
      icon: '⚡',
      component: QuickGenerateModule,
      category: 'core',
      order: 10,
      enabledByDefault: true,
      builtin: true,
      description: 'Quick asset generation',
      tags: ['generate', 'create', 'ai'],
      // Declare generation scope for automatic per-instance scoping
      scopes: ['generation'],
    },
    {
      id: 'presets',
      label: 'Presets',
      icon: '🎨',
      component: PresetsModule,
      category: 'core',
      order: 20,
      enabledByDefault: true,
      builtin: true,
      description: 'Generation presets and templates',
      tags: ['presets', 'templates'],
    },
    {
      id: 'providers',
      label: 'Providers',
      icon: '🌐',
      component: ProviderOverviewModule,
      category: 'system',
      order: 30,
      enabledByDefault: true,
      builtin: true,
      description: 'API provider overview and status',
      tags: ['providers', 'api', 'services'],
    },
    {
      id: 'panels',
      label: 'Panels',
      icon: '🪟',
      component: PanelLauncherModule,
      category: 'system',
      order: 40,
      enabledByDefault: true,
      builtin: true,
      description: 'Panel launcher and workspace',
      tags: ['panels', 'workspace'],
    },
  ],
};
