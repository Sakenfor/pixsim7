/**
 * HUD Renderer
 *
 * Part of Task 58 Phase 58.3 - HUD Renderer in Game Frontends
 *
 * Renders HUD layouts in game frontends using widget compositions.
 * Integrates with Task 50 (Panel Builder) and Task 51 (Data Binding).
 */

import { useEffect, useMemo, useState } from 'react';
import { useHudLayoutStore } from '../../stores/hudLayoutStore';
import { ComposedPanel } from '../panels/ComposedPanel';
import { initializeWidgets } from '../../lib/widgets/initializeWidgets';
import type { HudRegionId, WorldHudLayout, HudRegionLayout } from '../../lib/hud/types';
import { DEFAULT_REGION_POSITIONS } from '../../lib/hud/types';

export interface HudRendererProps {
  worldId: number | string;
  layoutId?: string | null; // Optional override for dev/testing (Phase 58.4)
  className?: string;
}

/**
 * Get CSS positioning classes for each region
 */
function getRegionPositionStyle(region: HudRegionId): React.CSSProperties {
  const position = DEFAULT_REGION_POSITIONS[region];

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'auto',
  };

  // Map anchor to CSS positioning
  switch (position.anchor) {
    case 'top-left':
      return { ...baseStyle, top: 0, left: 0, maxWidth: position.maxWidth, maxHeight: position.maxHeight };
    case 'top-center':
      return { ...baseStyle, top: 0, left: '50%', transform: 'translateX(-50%)', maxWidth: position.maxWidth, maxHeight: position.maxHeight };
    case 'top-right':
      return { ...baseStyle, top: 0, right: 0, maxWidth: position.maxWidth, maxHeight: position.maxHeight };
    case 'center-left':
      return { ...baseStyle, top: '50%', left: 0, transform: 'translateY(-50%)', maxWidth: position.maxWidth, maxHeight: position.maxHeight };
    case 'center':
      return { ...baseStyle, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: position.maxWidth, maxHeight: position.maxHeight };
    case 'center-right':
      return { ...baseStyle, top: '50%', right: 0, transform: 'translateY(-50%)', maxWidth: position.maxWidth, maxHeight: position.maxHeight };
    case 'bottom-left':
      return { ...baseStyle, bottom: 0, left: 0, maxWidth: position.maxWidth, maxHeight: position.maxHeight };
    case 'bottom-center':
      return { ...baseStyle, bottom: 0, left: '50%', transform: 'translateX(-50%)', maxWidth: position.maxWidth, maxHeight: position.maxHeight };
    case 'bottom-right':
      return { ...baseStyle, bottom: 0, right: 0, maxWidth: position.maxWidth, maxHeight: position.maxHeight };
    default:
      return baseStyle;
  }
}

/**
 * Render a single HUD region
 */
function HudRegion({ regionLayout }: { regionLayout: HudRegionLayout }) {
  const positionStyle = getRegionPositionStyle(regionLayout.region);
  const zIndex = regionLayout.zIndex || 10;

  if (!regionLayout.enabled) {
    return null;
  }

  return (
    <div
      className="hud-region"
      style={{
        ...positionStyle,
        ...regionLayout.styles,
        zIndex,
      }}
    >
      <ComposedPanel composition={regionLayout.composition} />
    </div>
  );
}

/**
 * Main HUD Renderer component
 *
 * Renders the HUD layout for a given world by reading from hudLayoutStore
 * and rendering each region using ComposedPanel.
 *
 * Phase 58.4: Supports optional layoutId override for dev testing.
 */
export function HudRenderer({ worldId, layoutId, className = '' }: HudRendererProps) {
  const store = useHudLayoutStore();
  const [layout, setLayout] = useState<WorldHudLayout | null>(null);

  // Initialize widgets once on mount
  useEffect(() => {
    initializeWidgets();
  }, []);

  // Load layout: prioritize override layoutId, then default, then first available
  useEffect(() => {
    // If layoutId override is provided, use it (Phase 58.4)
    if (layoutId) {
      const overrideLayout = store.getLayout(layoutId);
      if (overrideLayout) {
        setLayout(overrideLayout);
        return;
      }
    }

    // Otherwise, load default layout
    const defaultLayout = store.getDefaultLayoutForWorld(worldId);
    if (defaultLayout) {
      setLayout(defaultLayout);
    } else {
      // If no default, try to get the first layout
      const layouts = store.getLayoutsForWorld(worldId);
      if (layouts.length > 0) {
        setLayout(layouts[0]);
      } else {
        setLayout(null);
      }
    }
  }, [worldId, layoutId, store]);

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = useHudLayoutStore.subscribe((state) => {
      // Respect layoutId override if present
      if (layoutId) {
        const overrideLayout = store.getLayout(layoutId);
        if (overrideLayout) {
          setLayout(overrideLayout);
          return;
        }
      }

      const defaultLayout = store.getDefaultLayoutForWorld(worldId);
      if (defaultLayout) {
        setLayout(defaultLayout);
      } else {
        const layouts = store.getLayoutsForWorld(worldId);
        if (layouts.length > 0) {
          setLayout(layouts[0]);
        } else {
          setLayout(null);
        }
      }
    });

    return unsubscribe;
  }, [worldId, layoutId, store]);

  // Sort regions by zIndex for proper layering
  const sortedRegions = useMemo(() => {
    if (!layout) return [];
    return [...layout.regions].sort((a, b) => {
      const zIndexA = a.zIndex || 10;
      const zIndexB = b.zIndex || 10;
      return zIndexA - zIndexB;
    });
  }, [layout]);

  if (!layout || layout.regions.length === 0) {
    return null; // No HUD to render
  }

  return (
    <div
      className={`hud-renderer absolute inset-0 pointer-events-none ${className}`}
      style={{ zIndex: 1000 }}
    >
      {sortedRegions.map((regionLayout) => (
        <HudRegion
          key={regionLayout.region}
          regionLayout={regionLayout}
        />
      ))}
    </div>
  );
}

/**
 * HUD Renderer toggle button for debugging/testing
 */
export function HudRendererToggle({ enabled, onToggle }: { enabled: boolean; onToggle: (enabled: boolean) => void }) {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
        enabled
          ? 'bg-green-600 text-white hover:bg-green-700'
          : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-300 dark:hover:bg-neutral-600'
      }`}
      title="Toggle new HUD system"
    >
      {enabled ? '✓ New HUD' : 'Old HUD'}
    </button>
  );
}
