
import { registerBuiltInMiniGames } from '@pixsim7/game.components';

import { registerDevTools } from '@lib/dev/devtools/registerDevTools';

import { registerBrainTools } from '@features/brainTools/lib/registerBrainTools';
import { registerGallerySurfaces } from '@features/gallery/lib/core/registerGallerySurfaces';
import { registerGalleryTools } from '@features/gallery/lib/core/registerGalleryTools';
import { registerGenerationScopes } from '@features/generation';
import { registerQuickGenerateComponentSettings } from '@features/generation/lib/registerQuickGenerateComponentSettings';
import { registerGizmoSurfaces } from '@features/gizmos';
import { registerPreviewScopes } from '@features/preview';
import { registerProviderPlugins } from '@features/providers/lib/plugins';
import { registerWorldTools } from '@features/worldTools/lib/registerWorldTools';


import { registerFrontendMiniGames } from '@/components/minigames/registry';
import { registerIconSetsPlugin } from '@/plugins/ui/icon-sets';
import { registerPromptCompanion } from '@/plugins/ui/prompt-companion';
import { getPluginConfig } from '@/stores/pluginConfigStore';

import { bootstrapExamplePlugins } from './bootstrap';
import { discoverControlCenterRegistrations } from './bootstrapControlCenters';
import { discoverSceneViewRegistrations } from './bootstrapSceneViews';
import { discoverBundleRegistrations } from './bundleRegistrar';
import { loadAllPlugins } from './loader';
import { pluginManager } from './PluginManager';
import { registerPluginFamily } from './registration';

export interface PluginKernelOptions {
  verbose?: boolean;
  strict?: boolean;
  preferSource?: boolean;
}

let initialized = false;
let initPromise: Promise<void> | null = null;

export async function initializePluginKernel(options: PluginKernelOptions = {}): Promise<void> {
  if (initPromise) {
    return initPromise;
  }

  initPromise = doInitialize(options);
  return initPromise;
}

async function doInitialize(options: PluginKernelOptions): Promise<void> {
  if (initialized) {
    return;
  }

  const { verbose = true, strict = false } = options;

  try {
    pluginManager.loadPluginRegistry();
    await bootstrapExamplePlugins();

    registerBuiltInMiniGames();
    registerFrontendMiniGames();

    registerGenerationScopes();
    registerPreviewScopes();
    registerQuickGenerateComponentSettings();

    await registerProviderPlugins();

    await registerGallerySurfaces();
    await registerGalleryTools();
    await registerBrainTools();
    await registerWorldTools();
    await registerGizmoSurfaces();
    await registerPromptCompanion();
    await registerIconSetsPlugin();

    const [sourceControlCenters, sourceSceneViews, bundleRegistrations] = await Promise.all([
      discoverControlCenterRegistrations(),
      discoverSceneViewRegistrations(),
      discoverBundleRegistrations({ verbose, strict }),
    ]);

    const registrations = [
      ...sourceControlCenters,
      ...sourceSceneViews,
      ...bundleRegistrations,
    ];

    const preferSource = options.preferSource ?? (import.meta.env.DEV || bundleRegistrations.length === 0);
    const selected = await registerPluginFamily(registrations, {
      preferredSource: preferSource ? 'source' : 'bundle',
      strict,
      verbose,
      logPrefix: 'PluginKernel',
    });

    if (selected.some((registration) => registration.family === 'control-center')) {
      const { controlCenterRegistry } = await import('./controlCenterPlugin');
      controlCenterRegistry.loadPreference();
    }

    await loadAllPlugins({ verbose, strict });
    await registerDevTools();

    // Restore saved activation states from pluginConfigStore
    const { pluginCatalog } = await import('./pluginSystem');
    for (const plugin of pluginCatalog.getAll()) {
      if (!plugin.canDisable) continue;
      const config = getPluginConfig(plugin.id);
      if (config.enabled === false) {
        pluginCatalog.setActivationState(plugin.id, 'inactive');
      }
    }

    initialized = true;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}
