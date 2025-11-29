/**
 * Gizmo Surface Renderer
 *
 * Renders active gizmo surfaces (overlays, panels, HUD elements) for a given context.
 * Used in Game2D, scene editor, playground, etc.
 */

import { useMemo } from 'react';
import { gizmoSurfaceRegistry, type GizmoSurfaceContext } from '@/lib/gizmos';
import { useGizmoSurfaceStore } from '@/lib/gizmos/gizmoSurfaceStore';

interface GizmoSurfaceRendererProps {
  /** The context in which to render surfaces */
  context: GizmoSurfaceContext;

  /** Type of component to render (overlay, panel, or hud) */
  componentType?: 'overlay' | 'panel' | 'hud';

  /** Additional props to pass to each gizmo component */
  componentProps?: Record<string, any>;

  /** Optional className for the container */
  className?: string;
}

/**
 * Renders all enabled gizmo surfaces for a given context
 */
export function GizmoSurfaceRenderer({
  context,
  componentType = 'overlay',
  componentProps = {},
  className,
}: GizmoSurfaceRendererProps) {
  // Get enabled surface IDs for this context
  const enabledSurfaceIds = useGizmoSurfaceStore((state) =>
    state.getEnabledSurfaces(context)
  );

  // Get the actual surface definitions
  const enabledSurfaces = useMemo(() => {
    return enabledSurfaceIds
      .map((id) => gizmoSurfaceRegistry.get(id))
      .filter((surface) => {
        if (!surface) return false;

        // Check if surface supports this context
        if (!surface.supportsContexts?.includes(context)) {
          console.warn(
            `[GizmoSurfaceRenderer] Surface "${surface.id}" does not support context "${context}"`
          );
          return false;
        }

        // Check if surface has the requested component type
        if (componentType === 'overlay' && !surface.overlayComponent) return false;
        if (componentType === 'panel' && !surface.panelComponent) return false;
        if (componentType === 'hud' && !surface.hudComponent) return false;

        return true;
      });
  }, [enabledSurfaceIds, context, componentType]);

  // No surfaces to render
  if (enabledSurfaces.length === 0) {
    return null;
  }

  return (
    <div className={className} data-gizmo-surface-renderer data-context={context}>
      {enabledSurfaces.map((surface) => {
        // Get the appropriate component based on type
        let Component: React.ComponentType<any> | undefined;

        if (componentType === 'overlay') {
          Component = surface!.overlayComponent;
        } else if (componentType === 'panel') {
          Component = surface!.panelComponent;
        } else if (componentType === 'hud') {
          Component = surface!.hudComponent;
        }

        if (!Component) {
          return null;
        }

        // Render the component
        return (
          <div
            key={surface!.id}
            className="gizmo-surface"
            data-surface-id={surface!.id}
            data-surface-type={componentType}
          >
            <Component {...componentProps} />
          </div>
        );
      })}
    </div>
  );
}

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
