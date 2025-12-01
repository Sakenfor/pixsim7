/**
 * Comic Panels - Gameplay UI Glue
 *
 * Helper functions for connecting comic panels to gameplay/transitions
 * without requiring new backend APIs.
 */

import type { SceneMetaComicPanel, ComicSessionFlags } from '@/modules/scene-builder';

/**
 * Session data structure (minimal interface)
 * Replace with actual GameSession type when available
 */
export interface GameSession {
  flags?: {
    comic?: ComicSessionFlags;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Scene metadata structure (minimal interface)
 * Replace with actual SceneMeta type when available
 */
export interface SceneMeta {
  comicPanels?: SceneMetaComicPanel[];
  [key: string]: any;
}

/**
 * Get the currently active comic panels for a session and scene
 *
 * This function determines which panels to display based on:
 * 1. Session flags (comic.current_panel) - for runtime selection
 * 2. Scene metadata (comicPanels) - for static panel lists
 *
 * @param session - Current game session with optional comic flags
 * @param sceneMeta - Scene metadata containing comic panels
 * @returns Array of comic panels to display
 */
export function getActiveComicPanels(
  session: GameSession,
  sceneMeta: SceneMeta
): SceneMetaComicPanel[] {
  const comicPanels = sceneMeta.comicPanels || [];

  // If no panels defined, return empty array
  if (comicPanels.length === 0) {
    return [];
  }

  // Check for runtime panel selection via session flags
  const currentPanelId = session.flags?.comic?.current_panel;

  if (currentPanelId) {
    // Filter to show only the currently selected panel
    const selectedPanel = comicPanels.filter(p => p.id === currentPanelId);
    if (selectedPanel.length > 0) {
      return selectedPanel;
    }
  }

  // Fallback: return all panels for the scene
  return comicPanels;
}

/**
 * Get a single comic panel by ID from scene metadata
 *
 * @param sceneMeta - Scene metadata containing comic panels
 * @param panelId - ID of the panel to retrieve
 * @returns The panel if found, or undefined
 */
export function getComicPanelById(
  sceneMeta: SceneMeta,
  panelId: string
): SceneMetaComicPanel | undefined {
  const comicPanels = sceneMeta.comicPanels || [];
  return comicPanels.find(p => p.id === panelId);
}

/**
 * Get comic panels filtered by tags
 *
 * Useful for selecting panels by mood, location, or other categories
 *
 * @param sceneMeta - Scene metadata containing comic panels
 * @param tags - Tags to filter by (returns panels matching ANY tag)
 * @returns Array of matching comic panels
 */
export function getComicPanelsByTags(
  sceneMeta: SceneMeta,
  tags: string[]
): SceneMetaComicPanel[] {
  const comicPanels = sceneMeta.comicPanels || [];
  return comicPanels.filter(panel =>
    panel.tags?.some(tag => tags.includes(tag))
  );
}

/**
 * Set the current panel in session flags
 *
 * This updates the session to display a specific panel
 *
 * @param session - Game session to update
 * @param panelId - ID of the panel to set as current
 * @returns Updated session with comic flags set
 */
export function setCurrentComicPanel(
  session: GameSession,
  panelId: string
): GameSession {
  return {
    ...session,
    flags: {
      ...session.flags,
      comic: {
        ...session.flags?.comic,
        current_panel: panelId,
      },
    },
  };
}

/**
 * Clear the current panel selection
 *
 * Resets comic panel state, useful for transitions or scene exits
 *
 * @param session - Game session to update
 * @returns Updated session with comic panel state cleared
 */
export function clearCurrentComicPanel(session: GameSession): GameSession {
  const { comic, ...otherFlags } = session.flags || {};
  const { current_panel, ...otherComicFlags } = comic || {};

  return {
    ...session,
    flags: {
      ...otherFlags,
      ...(Object.keys(otherComicFlags).length > 0 ? { comic: otherComicFlags } : {}),
    },
  };
}

/**
 * Get all asset IDs from a panel list
 *
 * Useful for preloading panel images
 *
 * @param panels - Array of comic panels
 * @returns Array of asset IDs
 */
export function getComicPanelAssetIds(panels: SceneMetaComicPanel[]): string[] {
  return panels.map(p => p.assetId);
}
