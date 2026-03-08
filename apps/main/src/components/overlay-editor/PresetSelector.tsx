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
    description?: string;
    metadata?: string[];
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
      <div className="grid grid-cols-1 gap-2">
        {presets.map((preset) => (
          <button
            key={preset.id}
            onClick={() => onSelect?.(preset.id)}
            className={`
              px-3 py-2 text-left rounded border transition-all
              ${
                currentConfigId === preset.id
                  ? 'bg-blue-500 text-white border-blue-600 shadow-md'
                  : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-700'
              }
            `}
            title={[
              preset.description,
              ...(preset.metadata ?? []),
            ].filter(Boolean).join('\n')}
          >
            <div className="font-medium text-xs">
              {preset.icon && <Icon name={preset.icon} size={14} className="mr-1" />}
              {preset.name}
            </div>
            {preset.description && (
              <div className="mt-0.5 text-[10px] opacity-80">{preset.description}</div>
            )}
            {preset.metadata && preset.metadata.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {preset.metadata.slice(0, 4).map((item) => (
                  <span
                    key={`${preset.id}-${item}`}
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      currentConfigId === preset.id
                        ? 'bg-white/20 text-white'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>
    </Panel>
  );
}
