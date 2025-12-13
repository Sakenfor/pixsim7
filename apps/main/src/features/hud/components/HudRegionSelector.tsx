/**
 * HUD Region Selector
 *
 * Part of Task 58 Phase 58.2 - HUD Builder Panel
 *
 * Visual selector for HUD regions (top, bottom, left, right, center)
 */

import type { HudRegionId, WorldHudLayout } from '@features/hud/lib/core/types';

export interface HudRegionSelectorProps {
  selectedRegion: HudRegionId;
  onRegionChange: (region: HudRegionId) => void;
  layout: WorldHudLayout;
}

const REGIONS: Array<{ id: HudRegionId; label: string; description: string }> = [
  { id: 'top', label: 'Top', description: 'Top bar (objectives, quest info)' },
  { id: 'bottom', label: 'Bottom', description: 'Bottom bar (actions, dialogue)' },
  { id: 'left', label: 'Left', description: 'Left sidebar (inventory, stats)' },
  { id: 'right', label: 'Right', description: 'Right sidebar (minimap, notifications)' },
  { id: 'center', label: 'Center', description: 'Center overlay (alerts, prompts)' },
];

export function HudRegionSelector({
  selectedRegion,
  onRegionChange,
  layout,
}: HudRegionSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mr-2">
        Region:
      </span>
      <div className="flex gap-2">
        {REGIONS.map((region) => {
          const hasLayout = layout.regions.some((r) => r.region === region.id);
          const isEnabled = layout.regions.find((r) => r.region === region.id)?.enabled !== false;
          const isSelected = selectedRegion === region.id;

          return (
            <button
              key={region.id}
              onClick={() => onRegionChange(region.id)}
              className={`
                px-3 py-1.5 rounded text-sm font-medium transition-colors
                ${isSelected
                  ? 'bg-blue-600 text-white'
                  : hasLayout && isEnabled
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-900/50'
                  : hasLayout
                  ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                }
              `}
              title={region.description}
            >
              {region.label}
              {hasLayout && (
                <span className="ml-1.5 text-xs opacity-75">
                  ({layout.regions.find((r) => r.region === region.id)?.composition.widgets.length || 0})
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
