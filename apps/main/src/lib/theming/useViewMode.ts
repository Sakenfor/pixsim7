/**
 * useViewMode Hook
 *
 * React hook and utilities for managing per-world view modes.
 * View modes control which world tools and UI elements are visible.
 */

import { useMemo } from 'react';
import type { GameWorldDetail, ViewMode } from '@lib/registries';
import { getWorldViewMode } from '@pixsim7/game.engine';
import type { WorldToolPlugin } from '@features/worldTools';

/**
 * Tool categories that should be visible in each view mode
 */
const VIEW_MODE_TOOL_FILTERS: Record<ViewMode, {
  categories: string[];
  hideDebug: boolean;
  description: string;
}> = {
  cinematic: {
    categories: [], // Minimal - hide all tools by default
    hideDebug: true,
    description: 'Minimal HUD - emphasize immersion and story',
  },
  'hud-heavy': {
    categories: ['character', 'world', 'quest', 'inventory', 'utility'], // Show most tools
    hideDebug: false,
    description: 'Show all available world tools and panels',
  },
  debug: {
    categories: ['character', 'world', 'quest', 'inventory', 'utility', 'debug'], // Show everything including debug
    hideDebug: false,
    description: 'Show debug tools and world info for development',
  },
};

/**
 * Get the current view mode from world detail
 * Returns 'hud-heavy' as default if not set
 */
export function useViewMode(worldDetail: GameWorldDetail | null): ViewMode {
  return useMemo(() => {
    if (!worldDetail) {
      return 'hud-heavy'; // Default when no world selected
    }
    return getWorldViewMode(worldDetail) || 'hud-heavy';
  }, [worldDetail]);
}

/**
 * Filter world tools based on view mode
 * Returns tools that should be visible in the current view mode
 */
export function filterToolsByViewMode(
  tools: WorldToolPlugin[],
  viewMode: ViewMode
): WorldToolPlugin[] {
  const filter = VIEW_MODE_TOOL_FILTERS[viewMode];

  // Cinematic mode: hide everything by default (can be overridden per-tool later)
  if (viewMode === 'cinematic') {
    return tools.filter(tool => {
      // Allow tools to opt-in to cinematic mode with a flag (future enhancement)
      return false; // For now, hide all tools in cinematic mode
    });
  }

  // Filter by category and debug flag
  return tools.filter(tool => {
    // Check if tool's category is allowed in this view mode
    if (tool.category && !filter.categories.includes(tool.category)) {
      return false;
    }

    // In non-debug modes, hide debug tools
    if (filter.hideDebug && tool.category === 'debug') {
      return false;
    }

    // If tool has no category, include it (backwards compatibility)
    if (!tool.category) {
      return true;
    }

    return true;
  });
}

/**
 * Get view mode configuration
 */
export function getViewModeConfig(viewMode: ViewMode) {
  return VIEW_MODE_TOOL_FILTERS[viewMode];
}

/**
 * Get all available view modes with descriptions
 */
export function getViewModeOptions(): Array<{ value: ViewMode; label: string; description: string }> {
  return [
    {
      value: 'cinematic',
      label: 'Cinematic',
      description: VIEW_MODE_TOOL_FILTERS.cinematic.description,
    },
    {
      value: 'hud-heavy',
      label: 'HUD Heavy',
      description: VIEW_MODE_TOOL_FILTERS['hud-heavy'].description,
    },
    {
      value: 'debug',
      label: 'Debug',
      description: VIEW_MODE_TOOL_FILTERS.debug.description,
    },
  ];
}
