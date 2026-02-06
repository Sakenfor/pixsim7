/**
 * DropZoneOverlay Component
 *
 * Visual feedback overlay showing drop zones when dragging a floating panel
 * over the workspace area.
 */

import type { DropZone } from "@pixsim7/shared.ui.dockview";
import { createPortal } from "react-dom";

interface DropZoneOverlayProps {
  isDragging: boolean;
  activeZone: DropZone | null;
  workspaceRect: DOMRect | null;
}

const zoneStyles = {
  base: "absolute flex items-center justify-center transition-all duration-150 border-2 border-dashed",
  inactive: "bg-blue-500/5 border-transparent",
  active: "bg-blue-500/25 border-blue-500/60",
};

const zoneIcons: Record<DropZone, string> = {
  left: "\u2190", // Left arrow
  right: "\u2192", // Right arrow
  above: "\u2191", // Up arrow
  below: "\u2193", // Down arrow
  center: "\u2295", // Circle plus (tab)
};

const zoneLabels: Record<DropZone, string> = {
  left: "Dock Left",
  right: "Dock Right",
  above: "Dock Above",
  below: "Dock Below",
  center: "Add as Tab",
};

export function DropZoneOverlay({
  isDragging,
  activeZone,
  workspaceRect,
}: DropZoneOverlayProps) {
  if (!isDragging || !workspaceRect) return null;

  const t = 0.2; // 20% threshold for edge zones
  const edgeWidth = workspaceRect.width * t;
  const edgeHeight = workspaceRect.height * t;

  const zones: { zone: DropZone; style: React.CSSProperties }[] = [
    {
      zone: "left",
      style: {
        left: 0,
        top: 0,
        width: edgeWidth,
        height: "100%",
      },
    },
    {
      zone: "right",
      style: {
        right: 0,
        top: 0,
        width: edgeWidth,
        height: "100%",
      },
    },
    {
      zone: "above",
      style: {
        left: edgeWidth,
        top: 0,
        width: workspaceRect.width - edgeWidth * 2,
        height: edgeHeight,
      },
    },
    {
      zone: "below",
      style: {
        left: edgeWidth,
        bottom: 0,
        width: workspaceRect.width - edgeWidth * 2,
        height: edgeHeight,
      },
    },
    {
      zone: "center",
      style: {
        left: edgeWidth,
        top: edgeHeight,
        width: workspaceRect.width - edgeWidth * 2,
        height: workspaceRect.height - edgeHeight * 2,
      },
    },
  ];

  const overlay = (
    <div
      className="fixed pointer-events-none"
      style={{
        left: workspaceRect.x,
        top: workspaceRect.y,
        width: workspaceRect.width,
        height: workspaceRect.height,
        zIndex: 10099, // Below floating panels at 10100+
      }}
    >
      {zones.map(({ zone, style }) => {
        const isActive = activeZone === zone;
        return (
          <div
            key={zone}
            className={`${zoneStyles.base} ${isActive ? zoneStyles.active : zoneStyles.inactive}`}
            style={style}
          >
            <div
              className={`flex flex-col items-center gap-1 transition-opacity duration-150 ${
                isActive ? "opacity-100" : "opacity-30"
              }`}
            >
              <span className="text-2xl text-blue-500">{zoneIcons[zone]}</span>
              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                {zoneLabels[zone]}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );

  // Render via portal to document body to avoid z-index issues
  return createPortal(overlay, document.body);
}
