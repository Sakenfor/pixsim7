/**
 * Active Gizmos Indicator
 *
 * Small indicator shown in Game2D / scene editor when gizmos are active.
 * Shows which gizmo surfaces are currently enabled.
 */

import { Badge } from '@pixsim7/shared.ui';
import { useState } from 'react';

import { gizmoSurfaceSelectors } from '@lib/plugins/catalogSelectors';

import { useGizmoSurfaceStore } from '@features/gizmos/stores/gizmoSurfaceStore';

import type { GizmoSurfaceContext } from '../surfaceRegistry';

interface ActiveGizmosIndicatorProps {
  /** The context to show active gizmos for */
  context: GizmoSurfaceContext;

  /** Position of the indicator */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  /** Optional className */
  className?: string;
}

/**
 * Indicator showing active gizmo surfaces
 */
export function ActiveGizmosIndicator({
  context,
  position = 'top-right',
  className = '',
}: ActiveGizmosIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  const enabledSurfaceIds = useGizmoSurfaceStore((state) =>
    state.getEnabledSurfaces(context)
  );

  // No active gizmos, don't show indicator
  if (enabledSurfaceIds.length === 0) {
    return null;
  }

  // Get surface definitions
  const enabledSurfaces = enabledSurfaceIds
    .map((id) => gizmoSurfaceSelectors.get(id))
    .filter(Boolean);

  // Position classes
  const positionClasses = {
    'top-left': 'top-2 left-2',
    'top-right': 'top-2 right-2',
    'bottom-left': 'bottom-2 left-2',
    'bottom-right': 'bottom-2 right-2',
  };

  return (
    <div
      className={`absolute ${positionClasses[position]} z-50 ${className}`}
      data-gizmo-indicator
    >
      {/* Collapsed indicator */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 px-2 py-1 bg-black/50 hover:bg-black/70 text-white text-xs rounded-lg backdrop-blur-sm transition-colors"
          title={`${enabledSurfaces.length} active gizmo${enabledSurfaces.length === 1 ? '' : 's'}`}
        >
          <span className="text-sm">🎮</span>
          <span className="font-medium">{enabledSurfaces.length}</span>
          <span className="text-neutral-300">active</span>
        </button>
      )}

      {/* Expanded list */}
      {expanded && (
        <div className="bg-black/80 backdrop-blur-md rounded-lg shadow-lg border border-white/10 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-sm">🎮</span>
              <span className="text-xs font-medium text-white">Active Gizmos</span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-neutral-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>

          {/* List */}
          <div className="max-h-64 overflow-y-auto">
            {enabledSurfaces.map((surface) => (
              <div
                key={surface!.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
              >
                {surface!.icon && (
                  <span className="text-sm">{surface!.icon}</span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">
                    {surface!.label}
                  </div>
                  <div className="text-[10px] text-neutral-400 truncate">
                    {surface!.id}
                  </div>
                </div>
                {surface!.category && (
                  <Badge
                    color="gray"
                    className="text-[10px] px-1.5 py-0.5"
                  >
                    {surface!.category}
                  </Badge>
                )}
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-2 border-t border-white/10 bg-black/30">
            <div className="text-[10px] text-neutral-400">
              Manage in Dev Tools → Gizmo Surfaces
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
