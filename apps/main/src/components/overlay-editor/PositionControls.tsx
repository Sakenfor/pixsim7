/**
 * PositionControls Component
 *
 * Visual controls for widget positioning (anchor + offset)
 */

import React from 'react';
import type { WidgetPosition, OverlayAnchor } from '@lib/ui/overlay';
import { isOverlayPosition } from '@lib/ui/overlay';

export interface PositionControlsProps {
  position: WidgetPosition;
  onChange: (position: WidgetPosition) => void;
}

const ANCHOR_POINTS: OverlayAnchor[] = [
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

const ANCHOR_LABELS: Record<OverlayAnchor, string> = {
  'top-left': '↖',
  'top-center': '↑',
  'top-right': '↗',
  'center-left': '←',
  'center': '●',
  'center-right': '→',
  'bottom-left': '↙',
  'bottom-center': '↓',
  'bottom-right': '↘',
};

export function PositionControls({ position, onChange }: PositionControlsProps) {
  // For now, only support OverlayPosition (anchor-based)
  const overlayPos = isOverlayPosition(position) ? position : {
    anchor: 'top-left' as OverlayAnchor,
    offset: { x: 0, y: 0 },
  };

  const handleAnchorChange = (anchor: OverlayAnchor) => {
    onChange({
      ...overlayPos,
      anchor,
    });
  };

  const handleOffsetChange = (axis: 'x' | 'y', value: number) => {
    onChange({
      ...overlayPos,
      offset: {
        ...overlayPos.offset,
        [axis]: value,
      },
    });
  };

  const offsetX = typeof overlayPos.offset?.x === 'number' ? overlayPos.offset.x : 0;
  const offsetY = typeof overlayPos.offset?.y === 'number' ? overlayPos.offset.y : 0;

  return (
    <div className="space-y-3">
      {/* Anchor selector - 3x3 grid */}
      <div>
        <label className="block text-xs text-neutral-600 dark:text-neutral-400 mb-2">
          Anchor Point
        </label>
        <div className="grid grid-cols-3 gap-1">
          {ANCHOR_POINTS.map((anchor) => (
            <button
              key={anchor}
              onClick={() => handleAnchorChange(anchor)}
              className={`
                aspect-square flex items-center justify-center
                text-lg border-2 rounded transition-all
                ${
                  overlayPos.anchor === anchor
                    ? 'bg-blue-500 text-white border-blue-600 shadow-md'
                    : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }
              `}
              title={anchor}
            >
              {ANCHOR_LABELS[anchor]}
            </button>
          ))}
        </div>
      </div>

      {/* Offset sliders */}
      <div className="space-y-2">
        <label className="block text-xs text-neutral-600 dark:text-neutral-400">
          X Offset: {offsetX}px
        </label>
        <input
          type="range"
          min="-100"
          max="100"
          step="1"
          value={offsetX}
          onChange={(e) => handleOffsetChange('x', parseInt(e.target.value, 10))}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-neutral-600 dark:text-neutral-400">
          Y Offset: {offsetY}px
        </label>
        <input
          type="range"
          min="-100"
          max="100"
          step="1"
          value={offsetY}
          onChange={(e) => handleOffsetChange('y', parseInt(e.target.value, 10))}
          className="w-full"
        />
      </div>
    </div>
  );
}
