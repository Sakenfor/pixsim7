/**
 * Session Theme Override Panel
 *
 * UI for testing and managing temporary session theme overrides.
 * Used for special moments like dream sequences, flashbacks, etc.
 */

import { useState } from 'react';
import type { SessionUiOverride } from '@lib/registries';
import {
  getSessionOverridePresetIds,
  getSessionOverridePreset,
  SESSION_OVERRIDE_PRESETS,
} from '@pixsim7/game.engine';
import { Button, Select, Badge } from '@pixsim7/shared.ui';

interface SessionOverridePanelProps {
  currentOverride?: SessionUiOverride;
  onApplyOverride: (override: SessionUiOverride) => void;
  onClearOverride: () => void;
  compact?: boolean;
}

/**
 * Format preset ID into readable name
 */
function formatPresetName(id: string): string {
  return id
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get description for a preset
 */
function getPresetDescription(id: string): string {
  const descriptions: Record<string, string> = {
    'dream-sequence': '✨ Purple/pink dreamlike atmosphere',
    'flashback': '📷 Sepia-toned memory sequence',
    'nightmare': '💀 Dark red horror atmosphere',
    'tense-moment': '⚡ Orange/red high-tension atmosphere',
    'peaceful': '🌿 Green calming atmosphere',
  };
  return descriptions[id] || '';
}

export function SessionOverridePanel({
  currentOverride,
  onApplyOverride,
  onClearOverride,
  compact = false,
}: SessionOverridePanelProps) {
  const [selectedPreset, setSelectedPreset] = useState<string>('dream-sequence');

  const presetIds = getSessionOverridePresetIds();
  const hasOverride = currentOverride !== undefined;

  const handleApply = () => {
    const preset = getSessionOverridePreset(selectedPreset);
    if (!preset) {
      console.error(`Preset not found: ${selectedPreset}`);
      return;
    }

    const override: SessionUiOverride = {
      id: selectedPreset,
      themeOverride: preset,
      metadata: {
        reason: `Applied preset: ${selectedPreset}`,
        source: 'SessionOverridePanel',
      },
    };

    onApplyOverride(override);
  };

  if (compact) {
    return (
      <div className="space-y-2">
        {hasOverride && (
          <div className="bg-purple-50 dark:bg-purple-900/20 p-2 rounded border border-purple-200 dark:border-purple-800">
            <div className="text-xs font-semibold text-purple-800 dark:text-purple-200 mb-1">
              Active Override: {formatPresetName(currentOverride.id)}
            </div>
            <Button
              onClick={onClearOverride}
              variant="secondary"
              size="sm"
            >
              Clear Override
            </Button>
          </div>
        )}

        {!hasOverride && (
          <>
            <Select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(e.target.value)}
              className="w-full text-sm"
            >
              {presetIds.map((id) => (
                <option key={id} value={id}>
                  {formatPresetName(id)}
                </option>
              ))}
            </Select>
            <Button
              onClick={handleApply}
              variant="primary"
              size="sm"
            >
              Apply Override
            </Button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current Override Status */}
      {hasOverride && (
        <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded border border-purple-200 dark:border-purple-800">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="font-semibold text-sm text-purple-800 dark:text-purple-200 mb-1">
                Active Session Override
              </div>
              <div className="text-sm text-purple-700 dark:text-purple-300">
                {formatPresetName(currentOverride.id)}
              </div>
              {currentOverride.metadata?.reason && (
                <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                  {currentOverride.metadata.reason}
                </div>
              )}
            </div>
            <Badge color="purple">Active</Badge>
          </div>
          <Button
            onClick={onClearOverride}
            variant="secondary"
            size="sm"
          >
            Clear Override
          </Button>
        </div>
      )}

      {/* Apply New Override */}
      <div>
        <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
          Session Override Preset
        </label>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-3">
          Apply temporary theme overrides for special moments without changing the world's base theme.
        </p>

        <Select
          value={selectedPreset}
          onChange={(e) => setSelectedPreset(e.target.value)}
          className="w-full mb-2"
        >
          {presetIds.map((id) => (
            <option key={id} value={id}>
              {formatPresetName(id)}
            </option>
          ))}
        </Select>

        {/* Preset Preview */}
        <div className="bg-neutral-50 dark:bg-neutral-900 p-3 rounded border border-neutral-200 dark:border-neutral-700 mb-3">
          <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
            {getPresetDescription(selectedPreset)}
          </div>
          {SESSION_OVERRIDE_PRESETS[selectedPreset]?.colors && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(SESSION_OVERRIDE_PRESETS[selectedPreset].colors!).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <div
                    className="w-5 h-5 rounded border border-neutral-300 dark:border-neutral-600"
                    style={{ backgroundColor: value }}
                  />
                  <span className="text-xs text-neutral-600 dark:text-neutral-400">
                    {key}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <Button
          onClick={handleApply}
          variant="primary"
          disabled={hasOverride}
        >
          Apply Override
        </Button>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200 dark:border-blue-800">
        <div className="text-xs text-blue-800 dark:text-blue-200">
          <strong>Note:</strong> Session overrides are temporary and don't modify the world's
          permanent theme. They're perfect for dream sequences, flashbacks, or dramatic moments.
        </div>
      </div>
    </div>
  );
}
