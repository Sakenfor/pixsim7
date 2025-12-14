/**
 * Scene View Plugin Bootstrap
 *
 * Loads built-in scene view plugins on application startup.
 * Scene view plugins provide different presentation modes for scene content
 * (e.g., comic panels, visual novel views, etc.).
 *
 * Each plugin self-registers with the sceneViewRegistry on import.
 */
export async function bootstrapSceneViewPlugins(): Promise<void> {
  try {
    console.info('[SceneView] Bootstrapping scene view plugins...');

    // Load comic panel view plugin (default scene view)
    await import('../../plugins/scene/comic-panel-view');
    console.info('[SceneView] Loaded Comic Panel view');

    // Future scene view plugins can be loaded here:
    // await import('../../plugins/scene/visual-novel-view');
    // await import('../../plugins/scene/slideshow-view');
  } catch (error) {
    console.error('[SceneView] Failed to bootstrap scene view plugins', error);
  }
}
