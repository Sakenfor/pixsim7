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
  getAllThemePresets,
  getThemePresetById,
  saveThemePreset,
  deleteThemePreset,
  createThemePresetFromTheme,
  generateThemeId,
  type WorldUiThemePreset,
} from '@pixsim7/game-core';
import { Button, Select, Badge, Panel, Modal, FormField, Input } from '@pixsim7/ui';
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
    const theme = getThemePresetById(selectedThemeId);
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

    const themeId = generateThemeId(newPresetName);
    const preset = createThemePresetFromTheme(
      currentTheme,
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
            {themePresets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} {preset.isBuiltIn ? '' : '(Custom)'}
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
          <optgroup label="Built-in Themes">
            {themePresets.filter(p => p.isBuiltIn).map((preset) => (
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
