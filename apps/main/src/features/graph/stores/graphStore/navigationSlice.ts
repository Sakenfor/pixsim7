import type { StateCreator } from './types';
import type { NodeGroupData } from '@/modules/scene-builder';
import { logEvent } from '@/lib/logging';

/**
 * Navigation Slice
 *
 * Handles zoom navigation into node groups:
 * - Track navigation stack (breadcrumb trail)
 * - Zoom into groups to focus on their contents
 * - Zoom out to parent level
 * - Get current view context
 */

export interface NavigationState {
  // Current scene being edited
  currentSceneId: string | null;

  // Navigation stack for zoom navigation
  // Each entry is a group ID we've zoomed into
  // Empty array = root level (viewing all top-level nodes)
  navigationStack: string[];

  // Navigation actions
  zoomIntoGroup: (groupId: string) => void;
  zoomOut: () => void;
  zoomToRoot: () => void;
  getCurrentZoomLevel: () => string | null; // Returns current group ID or null if at root
  getNavigationBreadcrumbs: () => Array<{ id: string; label: string }>;
}

export const createNavigationSlice: StateCreator<NavigationState> = (set, get, _api) => ({
  currentSceneId: null,
  navigationStack: [],

  zoomIntoGroup: (groupId) => {
    const state = get();
    if (!state.currentSceneId) {
      console.warn('[navigationSlice] No current scene');
      return;
    }

    const scene = state.scenes[state.currentSceneId];
    if (!scene) return;

    // Verify group exists
    const groupNode = scene.nodes.find((n) => n.id === groupId && n.type === 'node_group');
    if (!groupNode) {
      console.warn(`[navigationSlice] Group not found: ${groupId}`);
      return;
    }

    set(
      (state) => ({
        navigationStack: [...state.navigationStack, groupId],
      }),
      false,
      'zoomIntoGroup'
    );
    logEvent('DEBUG', 'navigation_zoom_in', { groupId });
  },

  zoomOut: () => {
    set(
      (state) => {
        if (state.navigationStack.length === 0) {
          console.info('[navigationSlice] Already at root level');
          return state;
        }

        return {
          navigationStack: state.navigationStack.slice(0, -1),
        };
      },
      false,
      'zoomOut'
    );
  },

  zoomToRoot: () => {
    set(
      {
        navigationStack: [],
      },
      false,
      'zoomToRoot'
    );
  },

  getCurrentZoomLevel: () => {
    const state = get();
    if (state.navigationStack.length === 0) return null;
    return state.navigationStack[state.navigationStack.length - 1];
  },

  getNavigationBreadcrumbs: () => {
    const state = get();
    if (!state.currentSceneId) return [];

    const scene = state.scenes[state.currentSceneId];
    if (!scene) return [];

    const breadcrumbs: Array<{ id: string; label: string }> = [];

    // Root level
    breadcrumbs.push({
      id: 'root',
      label: scene.title || 'Scene',
    });

    // Add each group in the navigation stack
    state.navigationStack.forEach((groupId) => {
      const groupNode = scene.nodes.find((n) => n.id === groupId) as NodeGroupData | undefined;
      if (groupNode) {
        breadcrumbs.push({
          id: groupId,
          label: groupNode.metadata?.label || groupId,
        });
      }
    });

    return breadcrumbs;
  },
});
