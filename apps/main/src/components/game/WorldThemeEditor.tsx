/**
 * World Theme Editor Component
 *
 * UI for editing per-world theme and view mode configuration.
 * Allows designers to customize UI appearance and behavior per world.
 */

import {
  getWorldUiConfig,
  setWorldUiConfig,
  getAllThemePresets,
  getThemePresetById,
  saveThemePreset,
  deleteThemePreset,
  createThemePresetFromTheme,
  generateThemeId,
  getMotionPresetNames,
  MOTION_PRESETS,
  isAccessibilityPreset,
  getRecommendedAccessibilityPreset,
  loadUserPreferences,
  type WorldUiThemePreset,
} from '@pixsim7/game.engine';
import { Button, Select, Badge, Modal, FormField, Input } from '@pixsim7/shared.ui';
import { useState, useEffect } from 'react';

import type { GameWorldDetail, WorldUiTheme, ViewMode, MotionPreset } from '@lib/registries';
import { getViewModeOptions } from '@lib/theming';

interface WorldThemeEditorProps {
  worldDetail: GameWorldDetail;
  onSave: (updatedWorld: GameWorldDetail) => void;
  compact?: boolean;
}

/**
 * Helper function to format theme ID into readable name
 */
function formatThemeName(id: string): string {
  return id
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function WorldThemeEditor({ worldDetail, onSave, compact = false }: WorldThemeEditorProps) {
  const [selectedThemeId, setSelectedThemeId] = useState<string>('default');
  const [selectedViewMode, setSelectedViewMode] = useState<ViewMode>('hud-heavy');
  const [selectedMotion, setSelectedMotion] = useState<MotionPreset>('comfortable');
  const [hasChanges, setHasChanges] = useState(false);
  const [showSavePresetDialog, setShowSavePresetDialog] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDescription, setNewPresetDescription] = useState('');
  const [themePresets, setThemePresets] = useState<WorldUiThemePreset[]>([]);

  // Load presets and current configuration
  useEffect(() => {
    const presets = getAllThemePresets();
    setThemePresets(presets);

    const uiConfig = getWorldUiConfig(worldDetail);
    setSelectedThemeId(uiConfig.theme?.id || 'default');
    setSelectedViewMode(uiConfig.viewMode || 'hud-heavy');

    // Get motion preset from theme, default to 'comfortable'
    const currentMotion = uiConfig.theme?.motion;
    if (typeof currentMotion === 'string') {
      setSelectedMotion(currentMotion);
    } else {
      setSelectedMotion('comfortable');
    }

    setHasChanges(false);
  }, [worldDetail]);

  const handleThemeChange = (themeId: string) => {
    setSelectedThemeId(themeId);

    // When changing theme, update motion to match the theme's motion preset
    const theme = getThemePresetById(themeId);
    if (theme?.motion && typeof theme.motion === 'string') {
      setSelectedMotion(theme.motion);
    }

    setHasChanges(true);
  };

  const handleViewModeChange = (viewMode: ViewMode) => {
    setSelectedViewMode(viewMode);
    setHasChanges(true);
  };

  const handleMotionChange = (motion: MotionPreset) => {
    setSelectedMotion(motion);
    setHasChanges(true);
  };

  const handleSave = () => {
    const theme = getThemePresetById(selectedThemeId);
    if (!theme) {
      console.error(`Theme preset '${selectedThemeId}' not found`);
      return;
    }

    // Create a new theme object with the selected motion preset
    const themeWithMotion: WorldUiTheme = {
      ...theme,
      motion: selectedMotion,
    };

    const updatedWorld = setWorldUiConfig(worldDetail, {
      theme: themeWithMotion,
      viewMode: selectedViewMode,
    });

    onSave(updatedWorld);
    setHasChanges(false);
  };

  const handleReset = () => {
    const uiConfig = getWorldUiConfig(worldDetail);
    setSelectedThemeId(uiConfig.theme?.id || 'default');
    setSelectedViewMode(uiConfig.viewMode || 'hud-heavy');

    const currentMotion = uiConfig.theme?.motion;
    if (typeof currentMotion === 'string') {
      setSelectedMotion(currentMotion);
    } else {
      setSelectedMotion('comfortable');
    }

    setHasChanges(false);
  };

  const handleSaveAsPreset = () => {
    if (!newPresetName.trim()) {
      alert('Please enter a name for the preset');
      return;
    }

    const currentTheme = getThemePresetById(selectedThemeId);
    if (!currentTheme) {
      alert('No theme selected');
      return;
    }

    // Create theme with current motion setting
    const themeWithMotion: WorldUiTheme = {
      ...currentTheme,
      motion: selectedMotion,
    };

    const themeId = generateThemeId(newPresetName);
    const preset = createThemePresetFromTheme(
      themeWithMotion,
      newPresetName,
      newPresetDescription || undefined
    );

    const success = saveThemePreset({ ...preset, id: themeId });
    if (success) {
      setThemePresets(getAllThemePresets());
      setSelectedThemeId(themeId);
      setShowSavePresetDialog(false);
      setNewPresetName('');
      setNewPresetDescription('');
      alert('Preset saved successfully!');
    } else {
      alert('Failed to save preset. Name might already exist.');
    }
  };

  const handleDeletePreset = (themeId: string) => {
    if (!confirm(`Delete theme preset '${themeId}'?`)) {
      return;
    }

    const success = deleteThemePreset(themeId);
    if (success) {
      setThemePresets(getAllThemePresets());
      if (selectedThemeId === themeId) {
        setSelectedThemeId('default');
        setHasChanges(true);
      }
    } else {
      alert('Cannot delete built-in presets');
    }
  };

  const viewModeOptions = getViewModeOptions();
  const currentTheme = getThemePresetById(selectedThemeId);

  // Get accessibility recommendation based on user preferences
  const userPrefs = loadUserPreferences();
  const recommendedPreset = getRecommendedAccessibilityPreset(userPrefs);
  const showRecommendation = recommendedPreset && recommendedPreset !== selectedThemeId;

  if (compact) {
    return (
      <div className="space-y-3">
        {/* Accessibility Recommendation */}
        {showRecommendation && (
          <div className="bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-200 dark:border-green-800">
            <div className="text-xs text-green-700 dark:text-green-300 mb-1">
              ♿ Try <strong>{formatThemeName(recommendedPreset)}</strong> for accessibility
            </div>
            <Button
              onClick={() => handleThemeChange(recommendedPreset)}
              variant="secondary"
              size="sm"
            >
              Apply
            </Button>
          </div>
        )}

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
            <optgroup label="♿ Accessibility">
              {themePresets.filter(p => p.isBuiltIn && isAccessibilityPreset(p.id)).map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Standard">
              {themePresets.filter(p => p.isBuiltIn && !isAccessibilityPreset(p.id)).map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
            {themePresets.some(p => !p.isBuiltIn) && (
              <optgroup label="Custom">
                {themePresets.filter(p => !p.isBuiltIn).map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </div>

        {/* Motion Preset Selector */}
        <div>
          <label className="block text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
            Motion
          </label>
          <Select
            value={selectedMotion}
            onChange={(e) => handleMotionChange(e.target.value as MotionPreset)}
            className="w-full"
          >
            {getMotionPresetNames().map((preset) => (
              <option key={preset} value={preset}>
                {preset.charAt(0).toUpperCase() + preset.slice(1)} ({MOTION_PRESETS[preset].duration}ms)
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

      {/* Accessibility Recommendation */}
      {showRecommendation && (
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded border border-green-200 dark:border-green-800">
          <div className="flex items-start gap-2">
            <span className="text-lg">♿</span>
            <div className="flex-1">
              <div className="font-semibold text-sm text-green-800 dark:text-green-200 mb-1">
                Accessibility Recommendation
              </div>
              <div className="text-xs text-green-700 dark:text-green-300 mb-2">
                Based on your accessibility preferences, we recommend the{' '}
                <strong>{formatThemeName(recommendedPreset)}</strong> theme.
              </div>
              <Button
                onClick={() => handleThemeChange(recommendedPreset)}
                variant="secondary"
                size="sm"
              >
                Apply Recommended Theme
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Theme Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            UI Theme
          </label>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowSavePresetDialog(true)}
              variant="secondary"
              size="sm"
            >
              💾 Save as Preset
            </Button>
            {currentTheme && !currentTheme.isBuiltIn && (
              <Button
                onClick={() => handleDeletePreset(selectedThemeId)}
                variant="secondary"
                size="sm"
              >
                🗑️ Delete
              </Button>
            )}
          </div>
        </div>

        <Select
          value={selectedThemeId}
          onChange={(e) => handleThemeChange(e.target.value)}
          className="w-full mb-3"
        >
          <optgroup label="♿ Accessibility Themes">
            {themePresets.filter(p => p.isBuiltIn && isAccessibilityPreset(p.id)).map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Standard Themes">
            {themePresets.filter(p => p.isBuiltIn && !isAccessibilityPreset(p.id)).map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </optgroup>
          {themePresets.some(p => !p.isBuiltIn) && (
            <optgroup label="Custom Themes">
              {themePresets.filter(p => !p.isBuiltIn).map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>

        {/* Theme Preview */}
        {currentTheme && currentTheme.colors && (
          <div className="bg-neutral-50 dark:bg-neutral-900 p-3 rounded border border-neutral-200 dark:border-neutral-700">
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
              Color Preview
              {currentTheme.description && (
                <span className="ml-2 font-normal text-neutral-500">
                  — {currentTheme.description}
                </span>
              )}
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

      {/* Motion Preset Selection */}
      <div>
        <label className="block text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">
          Motion Preset
        </label>
        <Select
          value={selectedMotion}
          onChange={(e) => handleMotionChange(e.target.value as MotionPreset)}
          className="w-full mb-2"
        >
          {getMotionPresetNames().map((preset) => {
            const config = MOTION_PRESETS[preset];
            return (
              <option key={preset} value={preset}>
                {preset.charAt(0).toUpperCase() + preset.slice(1)} — {config.duration}ms
              </option>
            );
          })}
        </Select>

        {/* Motion Preview */}
        <div className="text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-50 dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Duration:</span>
            <span>{MOTION_PRESETS[selectedMotion].duration}ms</span>
            <span className="mx-2">•</span>
            <span className="font-semibold">Easing:</span>
            <span className="font-mono text-[10px]">{MOTION_PRESETS[selectedMotion].easing}</span>
          </div>
          <div className="mt-1 text-neutral-500">
            {selectedMotion === 'none' && '⚡ No animations (accessibility-friendly)'}
            {selectedMotion === 'calm' && '🌊 Slow, gentle animations'}
            {selectedMotion === 'comfortable' && '✨ Balanced animations (recommended)'}
            {selectedMotion === 'snappy' && '🚀 Fast, punchy animations'}
          </div>
        </div>
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

      {/* Save as Preset Dialog */}
      <Modal
        isOpen={showSavePresetDialog}
        onClose={() => {
          setShowSavePresetDialog(false);
          setNewPresetName('');
          setNewPresetDescription('');
        }}
        title="Save Theme as Preset"
        size="sm"
      >
        <div className="space-y-4">
          <FormField label="Preset Name" required size="md">
            <Input
              type="text"
              size="md"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="e.g., My Custom Theme"
            />
          </FormField>

          <FormField label="Description" optional size="md">
            <textarea
              value={newPresetDescription}
              onChange={(e) => setNewPresetDescription(e.target.value)}
              placeholder="Describe this theme..."
              rows={2}
              className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
            />
          </FormField>
        </div>

        <div className="flex gap-2 justify-end mt-4">
          <Button
            onClick={() => {
              setShowSavePresetDialog(false);
              setNewPresetName('');
              setNewPresetDescription('');
            }}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button onClick={handleSaveAsPreset} variant="primary">
            Save Preset
          </Button>
        </div>
      </Modal>
    </div>
  );
}
