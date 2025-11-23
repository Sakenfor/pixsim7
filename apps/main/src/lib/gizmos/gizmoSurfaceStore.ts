/**
 * Gizmo Surface State Store
 *
 * Manages which gizmo surfaces are enabled in different contexts (scene-editor, game-2d, etc.)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GizmoSurfaceId, GizmoSurfaceContext } from './surfaceRegistry';

/**
 * State for gizmo surface enablement
 */
interface GizmoSurfaceState {
  /**
   * Map of context -> enabled surface IDs
   * Example: { 'game-2d': ['rings-gizmo', 'world-time-overlay'] }
   */
  enabledSurfaces: Record<GizmoSurfaceContext, GizmoSurfaceId[]>;

  /**
   * Enable a gizmo surface for a specific context
   */
  enableSurface: (context: GizmoSurfaceContext, surfaceId: GizmoSurfaceId) => void;

  /**
   * Disable a gizmo surface for a specific context
   */
  disableSurface: (context: GizmoSurfaceContext, surfaceId: GizmoSurfaceId) => void;

  /**
   * Toggle a gizmo surface for a specific context
   */
  toggleSurface: (context: GizmoSurfaceContext, surfaceId: GizmoSurfaceId) => void;

  /**
   * Check if a surface is enabled for a context
   */
  isSurfaceEnabled: (context: GizmoSurfaceContext, surfaceId: GizmoSurfaceId) => boolean;

  /**
   * Get all enabled surfaces for a context
   */
  getEnabledSurfaces: (context: GizmoSurfaceContext) => GizmoSurfaceId[];

  /**
   * Clear all enabled surfaces for a context
   */
  clearContext: (context: GizmoSurfaceContext) => void;

  /**
   * Clear all enabled surfaces across all contexts
   */
  clearAll: () => void;
}

/**
 * Zustand store for gizmo surface state
 */
export const useGizmoSurfaceStore = create<GizmoSurfaceState>()(
  persist(
    (set, get) => ({
      enabledSurfaces: {
        'scene-editor': [],
        'game-2d': [],
        'game-3d': [],
        'playground': [],
        'workspace': [],
        'hud': [],
      },

      enableSurface: (context, surfaceId) => {
        set((state) => {
          const contextSurfaces = state.enabledSurfaces[context] || [];
          if (!contextSurfaces.includes(surfaceId)) {
            return {
              enabledSurfaces: {
                ...state.enabledSurfaces,
                [context]: [...contextSurfaces, surfaceId],
              },
            };
          }
          return state;
        });
      },

      disableSurface: (context, surfaceId) => {
        set((state) => {
          const contextSurfaces = state.enabledSurfaces[context] || [];
          return {
            enabledSurfaces: {
              ...state.enabledSurfaces,
              [context]: contextSurfaces.filter((id) => id !== surfaceId),
            },
          };
        });
      },

      toggleSurface: (context, surfaceId) => {
        const state = get();
        if (state.isSurfaceEnabled(context, surfaceId)) {
          state.disableSurface(context, surfaceId);
        } else {
          state.enableSurface(context, surfaceId);
        }
      },

      isSurfaceEnabled: (context, surfaceId) => {
        const state = get();
        const contextSurfaces = state.enabledSurfaces[context] || [];
        return contextSurfaces.includes(surfaceId);
      },

      getEnabledSurfaces: (context) => {
        const state = get();
        return state.enabledSurfaces[context] || [];
      },

      clearContext: (context) => {
        set((state) => ({
          enabledSurfaces: {
            ...state.enabledSurfaces,
            [context]: [],
          },
        }));
      },

      clearAll: () => {
        set({
          enabledSurfaces: {
            'scene-editor': [],
            'game-2d': [],
            'game-3d': [],
            'playground': [],
            'workspace': [],
            'hud': [],
          },
        });
      },
    }),
    {
      name: 'gizmo-surface-state', // LocalStorage key
      version: 1,
    }
  )
);
