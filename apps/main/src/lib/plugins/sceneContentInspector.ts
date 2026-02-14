import type { SceneViewOffer, SceneViewContentType } from './sceneViewPlugin';

/**
 * Inspect scene data to build a SceneViewOffer describing the content present.
 *
 * Checks:
 * - `scene.comicPanels` → 'comic-panels'
 * - `scene.nodes` with video-type nodes → 'video'
 * - `scene.metadata?.contentTypes` → extensible custom hints
 */
export function inspectSceneContent(
  scene?: { comicPanels?: unknown[]; nodes?: Array<{ type?: string }>; metadata?: Record<string, unknown> },
  session?: Record<string, unknown>,
): SceneViewOffer {
  const contentTypes: SceneViewContentType[] = [];

  if (scene?.comicPanels && scene.comicPanels.length > 0) {
    contentTypes.push('comic-panels');
  }

  if (scene?.nodes) {
    const hasVideo = scene.nodes.some(n => n.type === 'video' || n.type === 'video_playback');
    if (hasVideo) {
      contentTypes.push('video');
    }
  }

  // Allow scenes to declare custom content types via metadata
  if (Array.isArray(scene?.metadata?.contentTypes)) {
    for (const ct of scene.metadata.contentTypes) {
      if (typeof ct === 'string' && !contentTypes.includes(ct)) {
        contentTypes.push(ct);
      }
    }
  }

  return {
    contentTypes,
    panelCount: Array.isArray(scene?.comicPanels) ? scene.comicPanels.length : undefined,
    hasSession: session != null,
  };
}
