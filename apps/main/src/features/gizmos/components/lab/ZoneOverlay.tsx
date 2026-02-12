/**
 * Zone Overlay
 *
 * Renders detected NpcBodyZone[] as translucent shapes overlaid on the asset image.
 * Supports rect, circle, and polygon shapes.
 * Hover highlights zones and shows a tooltip with the zone label.
 */

import { getZoneShapeCSS } from '@pixsim7/scene.gizmos';
import type { NpcBodyZone } from '@pixsim7/shared.types';
import { useCallback, useState } from 'react';

interface ZoneOverlayProps {
  zones: NpcBodyZone[];
  className?: string;
}

export function ZoneOverlay({ zones, className }: ZoneOverlayProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleMouseEnter = useCallback((id: string) => setHoveredId(id), []);
  const handleMouseLeave = useCallback(() => setHoveredId(null), []);

  return (
    <div className={`absolute inset-0 ${className ?? ''}`}>
      {/* SVG layer for polygon zones */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ pointerEvents: 'none' }}
      >
        {zones
          .filter((z) => z.coords.type === 'polygon')
          .map((zone) => {
            const isHovered = hoveredId === zone.id;
            const coords = zone.coords as { type: 'polygon'; points: Array<{ x: number; y: number }> };
            const color = zone.highlightColor || '#4dabf7';
            const points = coords.points.map((p) => `${p.x},${p.y}`).join(' ');

            return (
              <polygon
                key={zone.id}
                points={points}
                fill={color}
                fillOpacity={isHovered ? 0.4 : 0.2}
                stroke={isHovered ? color : 'none'}
                strokeWidth={isHovered ? 0.5 : 0}
                style={{ pointerEvents: 'all', transition: 'fill-opacity 0.2s, stroke 0.2s', cursor: 'pointer' }}
                onMouseEnter={() => handleMouseEnter(zone.id)}
                onMouseLeave={handleMouseLeave}
              />
            );
          })}
      </svg>

      {/* Div layer for rect and circle zones */}
      {zones
        .filter((z) => z.coords.type !== 'polygon')
        .map((zone) => {
          const isHovered = hoveredId === zone.id;
          const css = getZoneShapeCSS(zone, isHovered, 0.2);

          return (
            <div
              key={zone.id}
              style={{ ...css, pointerEvents: 'all', cursor: 'pointer' } as React.CSSProperties}
              onMouseEnter={() => handleMouseEnter(zone.id)}
              onMouseLeave={handleMouseLeave}
            />
          );
        })}

      {/* Tooltip for hovered zone */}
      {hoveredId && (
        <ZoneTooltip zone={zones.find((z) => z.id === hoveredId)} />
      )}
    </div>
  );
}

function ZoneTooltip({ zone }: { zone: NpcBodyZone | undefined }) {
  if (!zone) return null;

  // Position tooltip near the zone center
  let cx: number, cy: number;
  if (zone.coords.type === 'rect') {
    cx = zone.coords.x + zone.coords.width / 2;
    cy = zone.coords.y;
  } else if (zone.coords.type === 'circle') {
    cx = zone.coords.cx;
    cy = zone.coords.cy - zone.coords.radius;
  } else {
    const pts = zone.coords.points;
    cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    cy = Math.min(...pts.map((p) => p.y));
  }

  return (
    <div
      className="absolute pointer-events-none z-10 -translate-x-1/2 -translate-y-full"
      style={{ left: `${cx}%`, top: `${cy}%` }}
    >
      <div className="bg-neutral-900/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap mb-1">
        {zone.label}
        <span className="ml-1.5 text-neutral-400">
          s:{zone.sensitivity.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
