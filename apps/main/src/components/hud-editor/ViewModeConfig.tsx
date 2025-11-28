/**
 * View Mode Configuration Component
 *
 * Allows selection of view modes for HUD layout editing
 * (all, cinematic, hud-heavy, debug)
 */

import { Select } from '@pixsim7/shared.ui';

export type ViewMode = 'all' | 'cinematic' | 'hud-heavy' | 'debug';

interface ViewModeConfigProps {
  selectedViewMode: ViewMode;
  onViewModeChange: (viewMode: ViewMode) => void;
  disabled?: boolean;
}

const VIEW_MODES: { value: ViewMode; label: string; description: string }[] = [
  { value: 'all', label: 'All (Default)', description: 'Base layout for all modes' },
  { value: 'cinematic', label: 'Cinematic', description: 'Minimal UI for story moments' },
  { value: 'hud-heavy', label: 'HUD Heavy', description: 'Maximum information display' },
  { value: 'debug', label: 'Debug', description: 'Development/debugging tools' },
];

export function ViewModeConfig({
  selectedViewMode,
  onViewModeChange,
  disabled = false,
}: ViewModeConfigProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
        View Mode
      </label>
      <Select
        value={selectedViewMode}
        onChange={(value) => onViewModeChange(value as ViewMode)}
        disabled={disabled}
        options={VIEW_MODES.map((mode) => ({
          value: mode.value,
          label: mode.label,
        }))}
      />
      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        {VIEW_MODES.find((m) => m.value === selectedViewMode)?.description}
      </div>
    </div>
  );
}
