/**
 * ViewerToolStrip
 *
 * Vertical icon strip for switching viewer overlay tools.
 * Sits on the left edge of the media panel, similar to a desktop app toolbar.
 */

import { Tooltip } from '@pixsim7/shared.ui';
import { useState } from 'react';


import { Icon, type IconName } from '@lib/icons';

import type { MediaOverlayId, MediaOverlayTone, MediaOverlayTool } from '../overlays';

interface ViewerToolStripProps {
  overlayTools: MediaOverlayTool[];
  overlayMode: string;
  onToggleOverlay: (id: MediaOverlayId) => void;
  onExitOverlay: () => void;
}

const TONE_ACTIVE: Record<MediaOverlayTone, string> = {
  green: 'bg-green-500/20 text-green-400',
  purple: 'bg-purple-500/20 text-purple-400',
  blue: 'bg-blue-500/20 text-blue-400',
  amber: 'bg-amber-500/20 text-amber-400',
};

const TONE_INDICATOR: Record<MediaOverlayTone, string> = {
  green: 'bg-green-400',
  purple: 'bg-purple-400',
  blue: 'bg-blue-400',
  amber: 'bg-amber-400',
};

export function ViewerToolStrip({
  overlayTools,
  overlayMode,
  onToggleOverlay,
  onExitOverlay,
}: ViewerToolStripProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const isNoneActive = overlayMode === 'none' || !overlayMode;

  return (
    <div className="flex-shrink-0 flex flex-col items-center py-2 gap-0.5 w-9 bg-neutral-900/60 border-r border-neutral-700/50">
      {/* Select/pointer mode */}
      <div className="relative">
        <button
          onClick={onExitOverlay}
          onMouseEnter={() => setHoveredId('__select__')}
          onMouseLeave={() => setHoveredId(null)}
          className={`p-1.5 rounded-md transition-colors ${
            isNoneActive
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700/50'
          }`}
        >
          <Icon name="mousePointer" size={16} />
        </button>
        <Tooltip
          content="Select"
          shortcut="Esc"
          position="right"
          show={hoveredId === '__select__'}
          delay={300}
        />
      </div>

      {/* Divider */}
      <div className="w-5 border-t border-neutral-700/50 my-1" />

      {/* Overlay tools */}
      {overlayTools.map((tool) => {
        const isActive = overlayMode === tool.id;
        const tone = tool.tone ?? 'blue';
        const iconName = (tool.icon ?? 'edit') as IconName;

        return (
          <div key={tool.id} className="relative">
            <button
              onClick={() => onToggleOverlay(tool.id)}
              onMouseEnter={() => setHoveredId(tool.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`p-1.5 rounded-md transition-colors ${
                isActive
                  ? TONE_ACTIVE[tone]
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700/50'
              }`}
            >
              <Icon name={iconName} size={16} />
            </button>
            {/* Active indicator bar */}
            {isActive && (
              <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-r ${TONE_INDICATOR[tone]}`} />
            )}
            <Tooltip
              content={tool.label}
              shortcut={tool.shortcut}
              position="right"
              show={hoveredId === tool.id}
              delay={300}
            />
          </div>
        );
      })}
    </div>
  );
}
