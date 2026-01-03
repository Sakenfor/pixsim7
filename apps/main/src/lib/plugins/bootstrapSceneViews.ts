import type { PluginRegistration } from './registration';

/**
 * Scene View Plugin Bootstrap
 *
 * Loads built-in scene view plugins on application startup.
 * Scene view plugins provide different presentation modes for scene content
 * (e.g., comic panels, visual novel views, etc.).
 */
export async function discoverSceneViewRegistrations(): Promise<PluginRegistration[]> {
  const registrations: PluginRegistration[] = [];

  try {
    const module = await import('../../plugins/scene/comic-panel-view');
    const manifest = module.manifest;
    const register = module.registerComicPanelView;

    if (manifest && typeof register === 'function') {
      registrations.push({
        id: manifest.id,
        family: 'scene-view',
        origin: 'builtin',
        source: 'source',
        label: manifest.name,
        register,
      });
    } else {
      console.warn('[SceneView] Comic panel view plugin missing manifest or register function');
    }
  } catch (error) {
    console.error('[SceneView] Failed to discover Comic Panel view plugin', error);
  }

  return registrations;
}

export async function bootstrapSceneViewPlugins(): Promise<void> {
  console.info('[SceneView] Bootstrapping scene view plugins...');

  const registrations = await discoverSceneViewRegistrations();
  for (const registration of registrations) {
    await registration.register();
  }

  console.info(`[SceneView] Loaded ${registrations.length} scene view plugin(s)`);
}
