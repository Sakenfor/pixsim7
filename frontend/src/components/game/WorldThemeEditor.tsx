/**
 * World Theme Editor Component
 *
 * UI for editing per-world theme and view mode configuration.
 * Allows designers to customize UI appearance and behavior per world.
 */

import { useState, useEffect } from 'react';
import type { GameWorldDetail, WorldUiTheme, ViewMode } from '@pixsim7/types';
import {
  getWorldUiConfig,
  setWorldUiConfig,
  getThemePresetIds,
  getThemePreset,
  THEME_PRESETS,
} from '@pixsim7/game-core';
import { Button, Select, Badge, Panel } from '@pixsim7/ui';
import { getViewModeOptions } from '../../lib/theming/useViewMode';

interface WorldThemeEditorProps {
  worldDetail: GameWorldDetail;
  onSave: (updatedWorld: GameWorldDetail) => void;
  compact?: boolean;
}

export function WorldThemeEditor({ worldDetail, onSave, compact = false }: WorldThemeEditorProps) {
  const [selectedThemeId, setSelectedThemeId] = useState<string>('default');
  const [selectedViewMode, setSelectedViewMode] = useState<ViewMode>('hud-heavy');
  const [hasChanges, setHasChanges] = useState(false);

  // Load current configuration
  useEffect(() => {
    const uiConfig = getWorldUiConfig(worldDetail);
    setSelectedThemeId(uiConfig.theme?.id || 'default');
    setSelectedViewMode(uiConfig.viewMode || 'hud-heavy');
    setHasChanges(false);
  }, [worldDetail]);

  const handleThemeChange = (themeId: string) => {
    setSelectedThemeId(themeId);
    setHasChanges(true);
  };

  const handleViewModeChange = (viewMode: ViewMode) => {
    setSelectedViewMode(viewMode);
    setHasChanges(true);
  };

  const handleSave = () => {
    const theme = getThemePreset(selectedThemeId);
    if (!theme) {
      console.error(`Theme preset '${selectedThemeId}' not found`);
      return;
    }

    const updatedWorld = setWorldUiConfig(worldDetail, {
      theme,
      viewMode: selectedViewMode,
    });

    onSave(updatedWorld);
    setHasChanges(false);
  };

  const handleReset = () => {
    const uiConfig = getWorldUiConfig(worldDetail);
    setSelectedThemeId(uiConfig.theme?.id || 'default');
    setSelectedViewMode(uiConfig.viewMode || 'hud-heavy');
    setHasChanges(false);
  };

  const themePresetIds = getThemePresetIds();
  const viewModeOptions = getViewModeOptions();
  const currentTheme = THEME_PRESETS[selectedThemeId];

  if (compact) {
    return (
      <div className="space-y-3">
        {/* Theme Selector */}
        <div>
          <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
            Theme
          </label>
          <Select
            value={selectedThemeId}
            onChange={(e) => handleThemeChange(e.target.value)}
            className="w-full"
          >
            {themePresetIds.map((id) => (
              <option key={id} value={id}>
                {THEME_PRESETS[id].id}
              </option>
            ))}
          </Select>
        </div>

        {/* View Mode Selector */}
        <div>
          <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
            View Mode
          </label>
          <Select
            value={selectedViewMode}
            onChange={(e) => handleViewModeChange(e.target.value as ViewMode)}
            className="w-full"
          >
            {viewModeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        {/* Actions */}
        {hasChanges && (
          <div className="flex gap-2">
            <Button onClick={handleSave} variant="primary" size="sm">
              Save
            </Button>
            <Button onClick={handleReset} variant="secondary" size="sm">
              Cancel
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* World Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200 dark:border-blue-800">
        <div className="font-semibold text-sm mb-1">{worldDetail.name}</div>
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          Configure UI theme and view mode for this world
        </div>
      </div>

      {/* Theme Selection */}
      <div>
        <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
          UI Theme
        </label>
        <Select
          value={selectedThemeId}
          onChange={(e) => handleThemeChange(e.target.value)}
          className="w-full mb-3"
        >
          {themePresetIds.map((id) => (
            <option key={id} value={id}>
              {THEME_PRESETS[id].id}
            </option>
          ))}
        </Select>

        {/* Theme Preview */}
        {currentTheme && currentTheme.colors && (
          <div className="bg-neutral-50 dark:bg-neutral-900 p-3 rounded border border-neutral-200 dark:border-neutral-700">
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
              Color Preview
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(currentTheme.colors).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded border border-neutral-300 dark:border-neutral-600"
                    style={{ backgroundColor: value }}
                  />
                  <span className="text-xs text-neutral-600 dark:text-neutral-400">
                    {key}
                  </span>
                </div>
              ))}
            </div>
            {currentTheme.density && (
              <div className="mt-2">
                <Badge color="blue">Density: {currentTheme.density}</Badge>
              </div>
            )}
          </div>
        )}
      </div>

      {/* View Mode Selection */}
      <div>
        <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
          View Mode
        </label>
        <Select
          value={selectedViewMode}
          onChange={(e) => handleViewModeChange(e.target.value as ViewMode)}
          className="w-full mb-2"
        >
          {viewModeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        {/* View Mode Description */}
        <div className="text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-700">
          {viewModeOptions.find((opt) => opt.value === selectedViewMode)?.description}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          onClick={handleSave}
          variant="primary"
          disabled={!hasChanges}
        >
          Save Changes
        </Button>
        <Button
          onClick={handleReset}
          variant="secondary"
          disabled={!hasChanges}
        >
          Reset
        </Button>
      </div>

      {hasChanges && (
        <div className="text-xs text-amber-600 dark:text-amber-400">
          You have unsaved changes. Click "Save Changes" to apply them.
        </div>
      )}
    </div>
  );
}
