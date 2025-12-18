/**
 * Panel Interaction Settings Component
 *
 * UI for configuring panel interaction rules and behaviors.
 * Allows users to customize how panels interact with each other.
 */

import { useMemo } from 'react';
import { usePanelInteractionSettingsStore } from '../stores/panelInteractionSettingsStore';
import { ALL_PANEL_METADATA, type PanelAction } from '@features/panels';

const PANEL_ACTIONS: Array<{ value: PanelAction; label: string; description: string }> = [
  { value: 'nothing', label: 'Do Nothing', description: 'Panel stays as-is' },
  { value: 'retract', label: 'Retract', description: 'Collapse to icon/thin bar' },
  { value: 'expand', label: 'Expand', description: 'Restore to full size' },
  { value: 'hide', label: 'Hide', description: 'Completely hidden' },
  { value: 'show', label: 'Show', description: 'Make visible' },
  { value: 'minimize', label: 'Minimize', description: 'Minimize to tab' },
  { value: 'restore', label: 'Restore', description: 'Restore previous state' },
];

export function PanelInteractionSettings() {
  const {
    panelSettings,
    enableAutomaticInteractions,
    globalAnimationDuration,
    setInteractionOverride,
    removeInteractionOverride,
    setEnableAutomaticInteractions,
    setGlobalAnimationDuration,
    resetAllSettings,
  } = usePanelInteractionSettingsStore();

  // Get all panels that have interaction rules
  const panelsWithRules = useMemo(() => {
    return ALL_PANEL_METADATA.filter(
      panel => panel.interactionRules?.whenOpens || panel.interactionRules?.whenCloses
    );
  }, []);

  // Get all panels that can be targets
  const targetPanels = useMemo(() => {
    return ALL_PANEL_METADATA.map(panel => ({
      id: panel.id,
      title: panel.title,
    }));
  }, []);

  const getEffectiveAction = (
    panelId: string,
    targetPanelId: string,
    direction: 'whenOpens' | 'whenCloses'
  ): PanelAction => {
    // Check user override first
    const override = panelSettings[panelId]?.interactionOverrides?.[targetPanelId];
    if (override?.[direction]) {
      return override[direction];
    }

    // Fall back to default from metadata
    const metadata = ALL_PANEL_METADATA.find(p => p.id === panelId);
    return metadata?.interactionRules?.[direction]?.[targetPanelId] || 'nothing';
  };

  const isOverridden = (panelId: string, targetPanelId: string): boolean => {
    return !!panelSettings[panelId]?.interactionOverrides?.[targetPanelId];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Panel Interactions
        </h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Configure how panels interact when others open or close
        </p>
      </div>

      {/* Global Settings */}
      <div className="space-y-4 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Global Settings
        </h3>

        {/* Enable/Disable Automatic Interactions */}
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={enableAutomaticInteractions}
            onChange={e => setEnableAutomaticInteractions(e.target.checked)}
            className="h-4 w-4 rounded"
          />
          <div>
            <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Enable Automatic Interactions
            </div>
            <div className="text-xs text-neutral-600 dark:text-neutral-400">
              Panels will automatically respond to other panels opening/closing
            </div>
          </div>
        </label>

        {/* Animation Duration */}
        <div>
          <label className="flex items-center justify-between text-sm">
            <span className="font-medium text-neutral-900 dark:text-neutral-100">
              Animation Duration
            </span>
            <span className="text-neutral-600 dark:text-neutral-400">
              {globalAnimationDuration}ms
            </span>
          </label>
          <input
            type="range"
            min="0"
            max="500"
            step="50"
            value={globalAnimationDuration}
            onChange={e => setGlobalAnimationDuration(Number(e.target.value))}
            className="mt-2 w-full"
          />
        </div>

        {/* Reset Button */}
        <button
          onClick={resetAllSettings}
          className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
          Reset All to Defaults
        </button>
      </div>

      {/* Panel Interaction Rules */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Interaction Rules
        </h3>

        {panelsWithRules.length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            No panels have interaction rules configured.
          </p>
        ) : (
          <div className="space-y-4">
            {panelsWithRules.map(panel => {
              const metadata = ALL_PANEL_METADATA.find(p => p.id === panel.id);
              const hasOpenRules = !!metadata?.interactionRules?.whenOpens;
              const hasCloseRules = !!metadata?.interactionRules?.whenCloses;

              return (
                <div
                  key={panel.id}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4"
                >
                  <h4 className="font-medium text-neutral-900 dark:text-neutral-100 mb-3">
                    {panel.title}
                  </h4>

                  <div className="space-y-3">
                    {/* When Opens Rules */}
                    {hasOpenRules && (
                      <div>
                        <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                          When another panel opens:
                        </div>
                        {Object.keys(metadata.interactionRules!.whenOpens!).map(targetId => {
                          const targetPanel = targetPanels.find(p => p.id === targetId);
                          if (!targetPanel) return null;

                          const currentAction = getEffectiveAction(panel.id, targetId, 'whenOpens');
                          const overridden = isOverridden(panel.id, targetId);

                          return (
                            <div
                              key={targetId}
                              className="flex items-center gap-3 text-sm"
                            >
                              <span className="text-neutral-600 dark:text-neutral-400 w-32">
                                {targetPanel.title} opens →
                              </span>
                              <select
                                value={currentAction}
                                onChange={e => {
                                  const newAction = e.target.value as PanelAction;
                                  const defaultAction =
                                    metadata.interactionRules!.whenOpens![targetId];

                                  if (newAction === defaultAction) {
                                    removeInteractionOverride(panel.id, targetId);
                                  } else {
                                    setInteractionOverride(panel.id, targetId, {
                                      whenOpens: newAction,
                                    });
                                  }
                                }}
                                className={`rounded border px-2 py-1 text-xs ${
                                  overridden
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-neutral-300 dark:border-neutral-600'
                                }`}
                              >
                                {PANEL_ACTIONS.map(action => (
                                  <option key={action.value} value={action.value}>
                                    {action.label}
                                  </option>
                                ))}
                              </select>
                              {overridden && (
                                <span className="text-xs text-blue-600 dark:text-blue-400">
                                  (custom)
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* When Closes Rules */}
                    {hasCloseRules && (
                      <div>
                        <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                          When another panel closes:
                        </div>
                        {Object.keys(metadata.interactionRules!.whenCloses!).map(targetId => {
                          const targetPanel = targetPanels.find(p => p.id === targetId);
                          if (!targetPanel) return null;

                          const currentAction = getEffectiveAction(
                            panel.id,
                            targetId,
                            'whenCloses'
                          );
                          const overridden = isOverridden(panel.id, targetId);

                          return (
                            <div
                              key={targetId}
                              className="flex items-center gap-3 text-sm"
                            >
                              <span className="text-neutral-600 dark:text-neutral-400 w-32">
                                {targetPanel.title} closes →
                              </span>
                              <select
                                value={currentAction}
                                onChange={e => {
                                  const newAction = e.target.value as PanelAction;
                                  const defaultAction =
                                    metadata.interactionRules!.whenCloses![targetId];

                                  if (newAction === defaultAction) {
                                    removeInteractionOverride(panel.id, targetId);
                                  } else {
                                    setInteractionOverride(panel.id, targetId, {
                                      whenCloses: newAction,
                                    });
                                  }
                                }}
                                className={`rounded border px-2 py-1 text-xs ${
                                  overridden
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-neutral-300 dark:border-neutral-600'
                                }`}
                              >
                                {PANEL_ACTIONS.map(action => (
                                  <option key={action.value} value={action.value}>
                                    {action.label}
                                  </option>
                                ))}
                              </select>
                              {overridden && (
                                <span className="text-xs text-blue-600 dark:text-blue-400">
                                  (custom)
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Help Text */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-4 text-sm">
        <p className="text-blue-900 dark:text-blue-100">
          <strong>Tip:</strong> Changes marked as <span className="text-blue-600 dark:text-blue-400">(custom)</span> override the default behavior. Set them back to the default value to remove the override.
        </p>
      </div>
    </div>
  );
}
