/**
 * DropZoneOverlay
 *
 * Visual feedback component for drag-to-dock functionality.
 * Shows drop zones when a panel is being dragged over a dockview.
 */

import { createPortal } from 'react-dom';
import type { DropZone } from './useDragToDock';

export interface DropZoneOverlayProps {
  /** Whether a panel is currently being dragged */
  isDragging: boolean;
  /** The currently active drop zone */
  activeZone: DropZone | null;
  /** The workspace element's bounding rect */
  workspaceRect: DOMRect | null;
}

const ZONE_STYLES = {
  base: {
    position: 'absolute' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(59, 130, 246, 0.08)',
    border: '2px dashed transparent',
    transition: 'all 150ms ease',
    pointerEvents: 'none' as const,
  },
  active: {
    background: 'rgba(59, 130, 246, 0.25)',
    borderColor: 'rgba(59, 130, 246, 0.6)',
  },
};

const ZONE_ICONS: Record<DropZone, string> = {
  left: '\u2190',    // ←
  right: '\u2192',   // →
  above: '\u2191',   // ↑
  below: '\u2193',   // ↓
  center: '\u2295',  // ⊕
};

const ZONE_LABELS: Record<DropZone, string> = {
  left: 'Dock Left',
  right: 'Dock Right',
  above: 'Dock Above',
  below: 'Dock Below',
  center: 'Add as Tab',
};

interface ZoneProps {
  zone: DropZone;
  isActive: boolean;
  style: React.CSSProperties;
}

function Zone({ zone, isActive, style }: ZoneProps) {
  return (
    <div
      style={{
        ...ZONE_STYLES.base,
        ...(isActive ? ZONE_STYLES.active : {}),
        ...style,
      }}
      data-zone={zone}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          opacity: isActive ? 1 : 0.5,
          transition: 'opacity 150ms ease',
        }}
      >
        <span style={{ fontSize: '24px' }}>{ZONE_ICONS[zone]}</span>
        <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgb(59, 130, 246)' }}>
          {ZONE_LABELS[zone]}
        </span>
      </div>
    </div>
  );
}

export function DropZoneOverlay({
  isDragging,
  activeZone,
  workspaceRect,
}: DropZoneOverlayProps) {
  if (!isDragging || !workspaceRect) {
    return null;
  }

  const { x, y, width, height } = workspaceRect;
  const edgeSize = 0.2; // 20% for edge zones

  // Calculate zone positions
  const edgeWidth = width * edgeSize;
  const edgeHeight = height * edgeSize;
  const centerWidth = width * (1 - 2 * edgeSize);
  const centerHeight = height * (1 - 2 * edgeSize);

  const overlay = (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        width,
        height,
        pointerEvents: 'none',
        zIndex: 10099, // Below floating panels (10100+)
      }}
      data-drop-zone-overlay
    >
      {/* Left zone */}
      <Zone
        zone="left"
        isActive={activeZone === 'left'}
        style={{
          left: 0,
          top: 0,
          width: edgeWidth,
          height: '100%',
        }}
      />

      {/* Right zone */}
      <Zone
        zone="right"
        isActive={activeZone === 'right'}
        style={{
          right: 0,
          top: 0,
          width: edgeWidth,
          height: '100%',
        }}
      />

      {/* Above zone */}
      <Zone
        zone="above"
        isActive={activeZone === 'above'}
        style={{
          left: edgeWidth,
          top: 0,
          width: centerWidth,
          height: edgeHeight,
        }}
      />

      {/* Below zone */}
      <Zone
        zone="below"
        isActive={activeZone === 'below'}
        style={{
          left: edgeWidth,
          bottom: 0,
          width: centerWidth,
          height: edgeHeight,
        }}
      />

      {/* Center zone */}
      <Zone
        zone="center"
        isActive={activeZone === 'center'}
        style={{
          left: edgeWidth,
          top: edgeHeight,
          width: centerWidth,
          height: centerHeight,
        }}
      />
    </div>
  );

  // Render via portal to ensure it's at the document root
  return createPortal(overlay, document.body);
}
