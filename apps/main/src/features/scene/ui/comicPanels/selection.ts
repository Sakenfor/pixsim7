import type { SceneMetaComicPanel } from './types';
import type { ComicPanelSceneMeta, ComicPanelSession } from './types';
import type { AssetRef } from '@pixsim7/shared.types';
import { ensureAssetRef } from './utils';

/**
 * Determine which comic panels should currently be displayed.
 */
export function getActiveComicPanels(
  session: ComicPanelSession,
  sceneMeta: ComicPanelSceneMeta
): SceneMetaComicPanel[] {
  const comicPanels = sceneMeta.comicPanels || [];

  if (comicPanels.length === 0) {
    return [];
  }

  const currentPanelId = session.flags?.comic?.current_panel;

  if (currentPanelId) {
    const selectedPanel = comicPanels.filter(panel => panel.id === currentPanelId);
    if (selectedPanel.length > 0) {
      return selectedPanel;
    }
  }

  return comicPanels;
}

/**
 * Retrieve a single panel by ID from the provided scene metadata.
 */
export function getComicPanelById(
  sceneMeta: ComicPanelSceneMeta,
  panelId: string
): SceneMetaComicPanel | undefined {
  return (sceneMeta.comicPanels || []).find(panel => panel.id === panelId);
}

/**
 * Retrieve panels that contain any of the provided tags.
 */
export function getComicPanelsByTags(
  sceneMeta: ComicPanelSceneMeta,
  tags: string[]
): SceneMetaComicPanel[] {
  return (sceneMeta.comicPanels || []).filter(panel =>
    panel.tags?.some(tag => tags.includes(tag))
  );
}

/**
 * Extract all asset IDs used by the provided panels.
 */
export function getComicPanelAssetIds(panels: SceneMetaComicPanel[]): AssetRef[] {
  const assetRefs: AssetRef[] = [];

  for (const panel of panels) {
    const ref = ensureAssetRef(panel.assetId);
    if (ref) {
      assetRefs.push(ref);
    }
  }

  return assetRefs;
}
