/**
 * Regional HUD Layout Component
 *
 * Renders world tools organized by regions (top, bottom, left, right, overlay)
 * based on per-world HUD configuration stored in GameWorld.meta.ui.hud
 */

import { useMemo, useState } from 'react';
import type { GameWorldDetail } from '../../lib/api/game';
import type { WorldToolContext, WorldToolPlugin, HudToolPlacement, HudToolSize } from '../../lib/worldTools/types';
import { buildHudLayout, getToolsForRegion, type HudLayout } from '../../lib/worldTools/hudLayout';
import { WorldToolsPanel } from './WorldToolsPanel';
import { Button } from '@pixsim7/ui';

interface RegionalHudLayoutProps {
  context: WorldToolContext;
  tools: WorldToolPlugin[];
  worldDetail: GameWorldDetail | null;
}

/**
 * Get size-based CSS classes for tool sizing
 */
function getSizeClass(size?: HudToolSize): string {
  switch (size) {
    case 'compact':
      return 'text-xs scale-90';
    case 'expanded':
      return 'text-base scale-110';
    default:
      return 'text-sm';
  }
}

/**
 * Enhanced wrapper for tool panel with size, collapse, and z-index support
 */
function EnhancedToolWrapper({
  placement,
  children,
}: {
  placement: HudToolPlacement;
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(placement.defaultCollapsed || false);

  const sizeClass = getSizeClass(placement.size);
  const zIndex = placement.zIndex ?? 0;
  const customClass = placement.customClassName || '';

  if (isCollapsed) {
    return (
      <div
        className={`enhanced-tool-collapsed ${customClass}`}
        style={{ zIndex }}
      >
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIsCollapsed(false)}
          title="Expand tool"
        >
          ▶
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`enhanced-tool-wrapper ${sizeClass} ${customClass}`}
      style={{ zIndex }}
    >
      {placement.defaultCollapsed !== undefined && (
        <div className="flex justify-end mb-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsCollapsed(true)}
            title="Collapse tool"
          >
            ▼
          </Button>
        </div>
      )}
      {children}
    </div>
  );
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

  // Get region data (tools + placements)
  const topRegion = useMemo(() => layout.regions.find(r => r.region === 'top'), [layout]);
  const bottomRegion = useMemo(() => layout.regions.find(r => r.region === 'bottom'), [layout]);
  const leftRegion = useMemo(() => layout.regions.find(r => r.region === 'left'), [layout]);
  const rightRegion = useMemo(() => layout.regions.find(r => r.region === 'right'), [layout]);
  const overlayRegion = useMemo(() => layout.regions.find(r => r.region === 'overlay'), [layout]);

  // Helper to render region with enhanced properties
  const renderRegion = (regionData: typeof topRegion, className: string) => {
    if (!regionData || regionData.tools.length === 0) return null;

    // Get max z-index from placements for the region
    const maxZIndex = Math.max(0, ...regionData.placements.map(p => p.zIndex ?? 0));

    // Combine custom class names
    const customClasses = regionData.placements
      .filter(p => p.customClassName)
      .map(p => p.customClassName)
      .join(' ');

    return (
      <div
        className={`${className} ${customClasses}`.trim()}
        style={{ zIndex: maxZIndex }}
      >
        <WorldToolsPanel context={context} tools={regionData.tools} />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Region */}
      {renderRegion(topRegion, 'hud-region-top')}

      {/* Left and Right Regions (side by side) */}
      {((leftRegion && leftRegion.tools.length > 0) || (rightRegion && rightRegion.tools.length > 0)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Region */}
          {renderRegion(leftRegion, 'hud-region-left')}

          {/* Right Region */}
          {renderRegion(rightRegion, 'hud-region-right')}
        </div>
      )}

      {/* Bottom Region */}
      {renderRegion(bottomRegion, 'hud-region-bottom')}

      {/* Overlay Region (floating/absolute positioned) */}
      {overlayRegion && overlayRegion.tools.length > 0 && (
        <div className="hud-region-overlay fixed top-20 right-4 z-30 max-w-sm">
          {renderRegion(overlayRegion, '')}
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
