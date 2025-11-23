/**
 * Built-in Control Center Modules
 *
 * Register all built-in modules that ship with the application.
 */

import { controlCenterModuleRegistry } from './controlCenterModuleRegistry';
import { QuickGenerateModule } from '../../components/control/QuickGenerateModule';
import { PresetsModule } from '../../components/control/PresetsModule';
import { ProviderOverviewModule } from '../../components/control/ProviderOverviewModule';
import { PanelLauncherModule } from '../../components/control/PanelLauncherModule';
import { GalleryModule } from '../../components/control/modules/GalleryModule';
import { WorkspaceModule } from '../../components/control/modules/WorkspaceModule';
import { PluginsModule } from '../../components/control/modules/PluginsModule';

/**
 * Register all built-in Control Center modules
 */
export function registerBuiltInModules() {
  // Core generation modules
  controlCenterModuleRegistry.register({
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
  });

  controlCenterModuleRegistry.register({
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
  });

  // System modules
  controlCenterModuleRegistry.register({
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
  });

  controlCenterModuleRegistry.register({
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
  });

  // New modules
  controlCenterModuleRegistry.register({
    id: 'gallery',
    label: 'Gallery',
    icon: '🖼️',
    component: GalleryModule,
    category: 'tools',
    order: 50,
    enabledByDefault: true,
    builtin: true,
    description: 'Gallery controls and asset management',
    tags: ['gallery', 'assets', 'media'],
  });

  controlCenterModuleRegistry.register({
    id: 'workspace',
    label: 'Workspace',
    icon: '🏗️',
    component: WorkspaceModule,
    category: 'tools',
    order: 60,
    enabledByDefault: true,
    builtin: true,
    description: 'Workspace management and presets',
    tags: ['workspace', 'layout', 'presets'],
  });

  controlCenterModuleRegistry.register({
    id: 'plugins',
    label: 'Plugins',
    icon: '🔌',
    component: PluginsModule,
    category: 'system',
    order: 70,
    enabledByDefault: true,
    builtin: true,
    description: 'Plugin management and browser',
    tags: ['plugins', 'extensions'],
  });

  console.log('[CC Modules] Registered 7 built-in modules');
}
