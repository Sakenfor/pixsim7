/**
 * In-Game HUD Customization Panel
 *
 * Allows players to quickly adjust HUD settings without opening the full editor.
 * Shows view mode switcher and per-tool visibility toggles.
 */

import { useState, useEffect } from 'react';
import { Panel, Button, Select, Modal } from '@pixsim7/shared.ui';
import type { GameWorldDetail } from '@/lib/api/game';
import type { WorldToolPlugin } from '@features/worldTools/lib/types';
import {
  getPlayerPreferences,
  toggleToolVisibility,
  setViewModeOverride,
  clearPlayerPreferences,
} from '@features/worldTools/lib/playerHudPreferences';
import { getLayoutVariantNames, switchLayoutVariant } from '@features/worldTools/lib/hudLayoutVariants';

interface HudCustomizationPanelProps {
  worldDetail: GameWorldDetail;
  availableTools: WorldToolPlugin[];
  currentViewMode: 'cinematic' | 'hud-heavy' | 'debug';
  onUpdate?: () => void;
  onClose?: () => void;
}

/**
 * Quick HUD customization panel for in-game use
 */
export function HudCustomizationPanel({
  worldDetail,
  availableTools,
  currentViewMode,
  onUpdate,
  onClose,
}: HudCustomizationPanelProps) {
  const [preferences, setPreferences] = useState(() => getPlayerPreferences(worldDetail.id));
  const [selectedViewMode, setSelectedViewMode] = useState<'cinematic' | 'hud-heavy' | 'debug' | 'default'>(
    preferences?.viewModeOverride || 'default'
  );
  const [layoutVariants, setLayoutVariants] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load layout variants
  useEffect(() => {
    const variants = getLayoutVariantNames(worldDetail);
    setLayoutVariants(variants);
  }, [worldDetail]);

  // Reload preferences when world changes
  useEffect(() => {
    const prefs = getPlayerPreferences(worldDetail.id);
    setPreferences(prefs);
    setSelectedViewMode(prefs?.viewModeOverride || 'default');
  }, [worldDetail.id]);

  const handleToggleTool = (toolId: string) => {
    const updated = toggleToolVisibility(worldDetail.id, toolId);
    setPreferences(updated);
    onUpdate?.();
  };

  const handleViewModeChange = (mode: string) => {
    const newMode = mode === 'default' ? null : (mode as 'cinematic' | 'hud-heavy' | 'debug');
    setViewModeOverride(worldDetail.id, newMode);
    setSelectedViewMode(mode as any);
    onUpdate?.();

    showSuccess(`View mode ${newMode ? `set to ${newMode}` : 'reset to default'}`);
  };

  const handleResetPreferences = () => {
    if (!confirm('Reset all your HUD customizations to default?')) return;

    clearPlayerPreferences(worldDetail.id);
    setPreferences(null);
    setSelectedViewMode('default');
    onUpdate?.();

    showSuccess('HUD preferences reset to default');
  };

  const handleSwitchLayoutVariant = (variantName: string) => {
    switchLayoutVariant(worldDetail, variantName, () => {
      onUpdate?.();
      showSuccess(`Switched to layout: ${variantName}`);
    });
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 2000);
  };

  const hiddenTools = preferences?.hiddenTools || [];

  return (
    <Panel className="space-y-4 max-w-md">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
          HUD Customization
        </h3>
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            ✕
          </Button>
        )}
      </div>

      {successMessage && (
        <div className="p-2 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded text-sm text-green-800 dark:text-green-200">
          {successMessage}
        </div>
      )}

      {/* View Mode Switcher */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          View Mode
        </label>
        <Select
          value={selectedViewMode}
          onChange={(e) => handleViewModeChange(e.target.value)}
          className="w-full"
        >
          <option value="default">Default ({currentViewMode})</option>
          <option value="cinematic">Cinematic (minimal)</option>
          <option value="hud-heavy">HUD Heavy (all tools)</option>
          <option value="debug">Debug (everything)</option>
        </Select>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Overrides the world's default view mode
        </p>
      </div>

      {/* Layout Variants (if available) */}
      {layoutVariants.length > 0 && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Layout Variant
          </label>
          <div className="flex flex-wrap gap-2">
            {layoutVariants.map((variant) => (
              <Button
                key={variant}
                size="sm"
                variant="secondary"
                onClick={() => handleSwitchLayoutVariant(variant)}
              >
                {variant}
              </Button>
            ))}
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Quick switch between predefined layouts
          </p>
        </div>
      )}

      {/* Tool Visibility Toggles */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Tool Visibility
        </label>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {availableTools.map((tool) => {
            const isHidden = hiddenTools.includes(tool.id);
            return (
              <div
                key={tool.id}
                className="flex items-center justify-between p-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
              >
                <div className="flex items-center gap-2">
                  {tool.icon && <span className="text-lg">{tool.icon}</span>}
                  <div>
                    <div className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      {tool.name}
                    </div>
                    <div className="text-xs text-neutral-500 dark:text-neutral-400">
                      {tool.description}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isHidden ? 'secondary' : 'primary'}
                  onClick={() => handleToggleTool(tool.id)}
                  title={isHidden ? 'Show tool' : 'Hide tool'}
                >
                  {isHidden ? 'Show' : 'Hide'}
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Hide or show individual tools
        </p>
      </div>

      {/* Reset Button */}
      <div className="pt-2 border-t border-neutral-300 dark:border-neutral-700">
        <Button size="sm" variant="ghost" onClick={handleResetPreferences}>
          Reset to Default
        </Button>
      </div>
    </Panel>
  );
}

/**
 * Compact floating HUD customization button
 * Shows a small button that opens the full panel
 */
export function HudCustomizationButton({
  worldDetail,
  availableTools,
  currentViewMode,
  onUpdate,
}: Omit<HudCustomizationPanelProps, 'onClose'>) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setIsOpen(!isOpen)}
        title="Customize HUD"
        className="fixed bottom-4 right-4 z-40"
      >
        🎨 HUD
      </Button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="HUD Customization" size="md">
        <HudCustomizationPanel
          worldDetail={worldDetail}
          availableTools={availableTools}
          currentViewMode={currentViewMode}
          onUpdate={onUpdate}
          onClose={() => setIsOpen(false)}
        />
      </Modal>
    </>
  );
}
