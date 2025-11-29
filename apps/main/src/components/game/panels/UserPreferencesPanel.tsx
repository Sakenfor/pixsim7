/**
 * User Preferences Panel
 *
 * UI for managing user-level accessibility and UI preferences.
 * These preferences are stored in localStorage and override world themes.
 */

import { useState, useEffect } from 'react';
import type { UserUiPreferences } from '@pixsim7/shared.types';
import {
  loadUserPreferences,
  updateUserPreferences,
  resetUserPreferences,
} from '@pixsim7/game.engine';
import { Button, Panel, Badge } from '@pixsim7/shared.ui';

interface UserPreferencesPanelProps {
  onClose?: () => void;
  onPreferencesChange?: (preferences: UserUiPreferences) => void;
}

export function UserPreferencesPanel({ onClose, onPreferencesChange }: UserPreferencesPanelProps) {
  const [preferences, setPreferences] = useState<UserUiPreferences>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Load current preferences
  useEffect(() => {
    const prefs = loadUserPreferences();
    setPreferences(prefs);
    setHasChanges(false);
  }, []);

  const handleToggle = (key: keyof UserUiPreferences) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setHasChanges(true);
  };

  const handleDensityChange = (density: 'compact' | 'comfortable' | 'spacious' | undefined) => {
    setPreferences((prev) => ({
      ...prev,
      preferredDensity: density,
    }));
    setHasChanges(true);
  };

  const handleColorSchemeChange = (colorScheme: 'light' | 'dark' | 'auto') => {
    setPreferences((prev) => ({
      ...prev,
      colorScheme,
    }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const updated = updateUserPreferences(preferences);
    setHasChanges(false);
    onPreferencesChange?.(updated);

    // Reload the page to apply changes
    if (confirm('Preferences saved! Reload the page to apply changes?')) {
      window.location.reload();
    }
  };

  const handleReset = () => {
    if (!confirm('Reset all preferences to defaults?')) {
      return;
    }

    resetUserPreferences();
    const defaults = loadUserPreferences();
    setPreferences(defaults);
    setHasChanges(false);
    onPreferencesChange?.(defaults);

    if (confirm('Preferences reset! Reload the page to apply changes?')) {
      window.location.reload();
    }
  };

  const handleCancel = () => {
    const prefs = loadUserPreferences();
    setPreferences(prefs);
    setHasChanges(false);
    onClose?.();
  };

  return (
    <Panel className="p-4 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">UI Preferences</h2>
        {onClose && (
          <Button onClick={onClose} variant="secondary" size="sm">
            ✕
          </Button>
        )}
      </div>

      <div className="text-sm text-neutral-600 dark:text-neutral-400">
        These preferences apply to all worlds and override theme settings for better accessibility.
      </div>

      {/* Accessibility Preferences */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Accessibility
        </h3>

        {/* High Contrast */}
        <label className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700">
          <div>
            <div className="font-medium text-sm">High Contrast Mode</div>
            <div className="text-xs text-neutral-600 dark:text-neutral-400">
              Use pure black/white backgrounds for better readability
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.prefersHighContrast || false}
            onChange={() => handleToggle('prefersHighContrast')}
            className="w-5 h-5"
          />
        </label>

        {/* Reduced Motion */}
        <label className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700">
          <div>
            <div className="font-medium text-sm">Reduced Motion</div>
            <div className="text-xs text-neutral-600 dark:text-neutral-400">
              Minimize animations and transitions
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.prefersReducedMotion || false}
            onChange={() => handleToggle('prefersReducedMotion')}
            className="w-5 h-5"
          />
        </label>
      </div>

      {/* Display Preferences */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Display
        </h3>

        {/* UI Density */}
        <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
          <div className="font-medium text-sm mb-2">UI Density Override</div>
          <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">
            Override theme density for all worlds
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { value: undefined, label: 'Use Theme Default' },
              { value: 'compact' as const, label: 'Compact' },
              { value: 'comfortable' as const, label: 'Comfortable' },
              { value: 'spacious' as const, label: 'Spacious' },
            ].map((option) => (
              <button
                key={option.label}
                onClick={() => handleDensityChange(option.value)}
                className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                  preferences.preferredDensity === option.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Color Scheme */}
        <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700">
          <div className="font-medium text-sm mb-2">Color Scheme</div>
          <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">
            Override system color scheme preference
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { value: 'auto' as const, label: 'Auto (System)' },
              { value: 'light' as const, label: 'Light' },
              { value: 'dark' as const, label: 'Dark' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => handleColorSchemeChange(option.value)}
                className={`px-3 py-1.5 rounded text-sm border transition-colors ${
                  preferences.colorScheme === option.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-700">
        <Button onClick={handleSave} variant="primary" disabled={!hasChanges}>
          Save & Apply
        </Button>
        <Button onClick={handleCancel} variant="secondary">
          Cancel
        </Button>
        <Button onClick={handleReset} variant="secondary">
          Reset to Defaults
        </Button>
      </div>

      {hasChanges && (
        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded border border-amber-200 dark:border-amber-800">
          You have unsaved changes. Click "Save & Apply" and reload to see changes.
        </div>
      )}
    </Panel>
  );
}
