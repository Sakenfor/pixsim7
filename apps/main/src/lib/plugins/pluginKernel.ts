
import { registerBuiltInMiniGames } from '@pixsim7/game.components';

import { registerDevTools } from '@lib/dev/devtools/registerDevTools';

import { registerBrainTools } from '@features/brainTools/lib/registerBrainTools';
import { registerProviderPlugins } from '@features/providers/lib/plugins';


import { registerFrontendMiniGames } from '@/components/minigames/registry';
import { registerIconSetsPlugin } from '@/plugins/ui/icon-sets';
import { registerPromptCompanion } from '@/plugins/ui/prompt-companion';

import { bootstrapExamplePlugins } from './bootstrap';
import { discoverControlCenterRegistrations } from './bootstrapControlCenters';
import { discoverOverlayWidgetRegistrations } from './bootstrapOverlayWidgets';
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

    await registerProviderPlugins();

    await registerBrainTools();
    await registerPromptCompanion();
    await registerIconSetsPlugin();

    const [sourceControlCenters, sourceSceneViews, sourceOverlayWidgets, bundleRegistrations] = await Promise.all([
      discoverControlCenterRegistrations(),
      discoverSceneViewRegistrations(),
      discoverOverlayWidgetRegistrations(),
      discoverBundleRegistrations({ verbose, strict }),
    ]);

    const registrations = [
      ...sourceControlCenters,
      ...sourceSceneViews,
      ...sourceOverlayWidgets,
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

    initialized = true;
  } catch (error) {
    initPromise = null;
    throw error;
  }
}
