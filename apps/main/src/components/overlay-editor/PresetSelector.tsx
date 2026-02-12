/**
 * PresetSelector Component
 *
 * Displays and allows selection of overlay configuration presets
 */

import { Panel } from '@pixsim7/shared.ui';
import React from 'react';

import { Icon } from '@lib/icons';

export interface PresetSelectorProps {
  presets: Array<{
    id: string;
    name: string;
    icon?: string;
  }>;
  currentConfigId?: string;
  onSelect?: (presetId: string) => void;
}

export function PresetSelector({
  presets,
  currentConfigId,
  onSelect,
}: PresetSelectorProps) {
  if (presets.length === 0) {
    return null;
  }

  return (
    <Panel>
      <h3 className="text-sm font-semibold mb-3">Presets</h3>
      <div className="grid grid-cols-2 gap-2">
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onSelect?.(preset.id)}
            className={`
              px-3 py-2 text-xs rounded border transition-all
              ${
                currentConfigId === preset.id
                  ? 'bg-blue-500 text-white border-blue-600 shadow-md'
                  : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700'
              }
            `}
          >
            <div className="font-medium">
              {preset.icon && <Icon name={preset.icon} size={14} className="mr-1" />}
              {preset.name}
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );
}
