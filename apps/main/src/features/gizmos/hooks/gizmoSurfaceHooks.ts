import { useMemo } from 'react';

import { useGizmoSurfaceStore } from '@features/gizmos/stores/gizmoSurfaceStore';

import { gizmoSurfaceRegistry, type GizmoSurfaceContext } from '../lib/core/surfaceRegistry';

/**
 * Hook to get enabled surfaces for a context
 */
export function useEnabledGizmoSurfaces(context: GizmoSurfaceContext) {
  const enabledSurfaceIds = useGizmoSurfaceStore((state) =>
    state.getEnabledSurfaces(context)
  );

  return useMemo(() => {
    return enabledSurfaceIds
      .map((id) => gizmoSurfaceRegistry.get(id))
      .filter(Boolean);
  }, [enabledSurfaceIds]);
}

/**
 * Hook to check if a surface is enabled
 */
export function useIsSurfaceEnabled(
  context: GizmoSurfaceContext,
  surfaceId: string
) {
  return useGizmoSurfaceStore((state) =>
    state.isSurfaceEnabled(context, surfaceId)
  );
}

/**
 * Hook to toggle a surface
 */
export function useToggleSurface() {
  return useGizmoSurfaceStore((state) => state.toggleSurface);
}
