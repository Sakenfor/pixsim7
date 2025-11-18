/**
 * Regional HUD Layout Component
 *
 * Renders world tools organized by regions (top, bottom, left, right, overlay)
 * based on per-world HUD configuration stored in GameWorld.meta.ui.hud
 */

import { useMemo } from 'react';
import type { GameWorldDetail } from '../../lib/api/game';
import type { WorldToolContext, WorldToolPlugin } from '../../lib/worldTools/types';
import { buildHudLayout, getToolsForRegion, type HudLayout } from '../../lib/worldTools/hudLayout';
import { WorldToolsPanel } from './WorldToolsPanel';

interface RegionalHudLayoutProps {
  context: WorldToolContext;
  tools: WorldToolPlugin[];
  worldDetail: GameWorldDetail | null;
}

/**
 * Main regional HUD layout component
 * Organizes tools into regions based on world configuration
 */
export function RegionalHudLayout({ context, tools, worldDetail }: RegionalHudLayoutProps) {
  // Build layout from configuration
  const layout = useMemo(
    () => buildHudLayout(tools, worldDetail, context),
    [tools, worldDetail, context]
  );

  // Get tools for each region
  const topTools = useMemo(() => getToolsForRegion(layout, 'top'), [layout]);
  const bottomTools = useMemo(() => getToolsForRegion(layout, 'bottom'), [layout]);
  const leftTools = useMemo(() => getToolsForRegion(layout, 'left'), [layout]);
  const rightTools = useMemo(() => getToolsForRegion(layout, 'right'), [layout]);
  const overlayTools = useMemo(() => getToolsForRegion(layout, 'overlay'), [layout]);

  return (
    <div className="space-y-4">
      {/* Top Region */}
      {topTools.length > 0 && (
        <div className="hud-region-top">
          <WorldToolsPanel context={context} tools={topTools} />
        </div>
      )}

      {/* Left and Right Regions (side by side) */}
      {(leftTools.length > 0 || rightTools.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Region */}
          {leftTools.length > 0 && (
            <div className="hud-region-left">
              <WorldToolsPanel context={context} tools={leftTools} />
            </div>
          )}

          {/* Right Region */}
          {rightTools.length > 0 && (
            <div className="hud-region-right">
              <WorldToolsPanel context={context} tools={rightTools} />
            </div>
          )}
        </div>
      )}

      {/* Bottom Region */}
      {bottomTools.length > 0 && (
        <div className="hud-region-bottom">
          <WorldToolsPanel context={context} tools={bottomTools} />
        </div>
      )}

      {/* Overlay Region (floating/absolute positioned) */}
      {overlayTools.length > 0 && (
        <div className="hud-region-overlay fixed top-20 right-4 z-30 max-w-sm">
          <WorldToolsPanel context={context} tools={overlayTools} />
        </div>
      )}
    </div>
  );
}

/**
 * Fallback component when no HUD config is present
 * Renders all tools in the default layout (backward compatible)
 */
export function DefaultHudLayout({ context, tools }: Omit<RegionalHudLayoutProps, 'worldDetail'>) {
  return <WorldToolsPanel context={context} tools={tools} />;
}
