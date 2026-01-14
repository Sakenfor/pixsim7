/**
 * Panel Interaction Settings Component
 *
 * UI for configuring panel interaction rules and behaviors.
 * Allows users to customize how panels interact with each other.
 */

import { useMemo, useState } from 'react';

import { getAllPanelMetadata } from '@features/panels/lib/panelMetadataRegistry';
import type { PanelAction } from '@features/panels/lib/types';

import { usePanelInteractionSettingsStore } from '../stores/panelInteractionSettingsStore';

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
    removeInteractionOverrideDirection,
    setEnableAutomaticInteractions,
    setGlobalAnimationDuration,
    resetAllSettings,
  } = usePanelInteractionSettingsStore();

  const allPanels = useMemo(() => getAllPanelMetadata(), []);
  const [ruleSourceId, setRuleSourceId] = useState(allPanels[0]?.id || '');
  const [ruleTargetId, setRuleTargetId] = useState(allPanels[0]?.id || '');
  const [ruleDirection, setRuleDirection] = useState<'whenOpens' | 'whenCloses'>('whenOpens');
  const [ruleAction, setRuleAction] = useState<PanelAction>('nothing');

  // Get all panels that have interaction rules
  const panelsWithRules = useMemo(() => {
    return allPanels.filter(
      panel => panel.interactionRules?.whenOpens || panel.interactionRules?.whenCloses
    );
  }, [allPanels]);

  // Get all panels that can be targets
  const targetPanels = useMemo(() => {
    return allPanels.map(panel => ({
      id: panel.id,
      title: panel.title,
    }));
  }, [allPanels]);

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
    const metadata = allPanels.find(p => p.id === panelId);
    return metadata?.interactionRules?.[direction]?.[targetPanelId] || 'nothing';
  };

  const isOverridden = (panelId: string, targetPanelId: string): boolean => {
    return !!panelSettings[panelId]?.interactionOverrides?.[targetPanelId];
  };

  const ruleCatalog = useMemo(() => {
    const catalog = new Map<string, {
      sourceId: string;
      targetId: string;
      direction: 'whenOpens' | 'whenCloses';
      action: PanelAction;
      overridden: boolean;
    }>();

    const addRule = (
      sourceId: string,
      targetId: string,
      direction: 'whenOpens' | 'whenCloses',
      action: PanelAction,
      overridden: boolean,
    ) => {
      if (action === 'nothing') return;
      const key = `${sourceId}:${direction}:${targetId}`;
      catalog.set(key, { sourceId, targetId, direction, action, overridden });
    };

    allPanels.forEach(panel => {
      const defaults = panel.interactionRules;
      if (!defaults) return;
      Object.entries(defaults.whenOpens || {}).forEach(([targetId, action]) => {
        addRule(panel.id, targetId, 'whenOpens', action, false);
      });
      Object.entries(defaults.whenCloses || {}).forEach(([targetId, action]) => {
        addRule(panel.id, targetId, 'whenCloses', action, false);
      });
    });

    Object.entries(panelSettings).forEach(([panelId, settings]) => {
      const overrides = settings.interactionOverrides || {};
      Object.entries(overrides).forEach(([targetId, override]) => {
        if (override.whenOpens) {
          addRule(panelId, targetId, 'whenOpens', override.whenOpens, true);
        }
        if (override.whenCloses) {
          addRule(panelId, targetId, 'whenCloses', override.whenCloses, true);
        }
      });
    });

    return Array.from(catalog.values());
  }, [allPanels, panelSettings]);

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

      {/* Rule Editor */}
      <div className="space-y-4 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
        <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Rule Editor
        </h3>
        <div className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Source Panel
            </label>
            <select
              value={ruleSourceId}
              onChange={(e) => setRuleSourceId(e.target.value)}
              className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1 text-xs"
            >
              {allPanels.map(panel => (
                <option key={panel.id} value={panel.id}>
                  {panel.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Trigger
            </label>
            <select
              value={ruleDirection}
              onChange={(e) => setRuleDirection(e.target.value as 'whenOpens' | 'whenCloses')}
              className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1 text-xs"
            >
              <option value="whenOpens">When target opens</option>
              <option value="whenCloses">When target closes</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Target Panel
            </label>
            <select
              value={ruleTargetId}
              onChange={(e) => setRuleTargetId(e.target.value)}
              className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1 text-xs"
            >
              {allPanels.map(panel => (
                <option key={panel.id} value={panel.id}>
                  {panel.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Action
            </label>
            <select
              value={ruleAction}
              onChange={(e) => setRuleAction(e.target.value as PanelAction)}
              className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-2 py-1 text-xs"
            >
              {PANEL_ACTIONS.map(action => (
                <option key={action.value} value={action.value}>
                  {action.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <button
            onClick={() => {
              if (!ruleSourceId || !ruleTargetId || ruleSourceId === ruleTargetId) return;
              if (ruleAction === 'nothing') {
                removeInteractionOverrideDirection(
                  ruleSourceId,
                  ruleTargetId,
                  ruleDirection
                );
                return;
              }
              setInteractionOverride(ruleSourceId, ruleTargetId, {
                [ruleDirection]: ruleAction,
              });
            }}
            disabled={!ruleSourceId || !ruleTargetId || ruleSourceId === ruleTargetId}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save Rule
          </button>
          <span>
            Setting action to “Do Nothing” removes the custom rule.
          </span>
        </div>
      </div>

      {/* Rule Catalog */}
      <div className="space-y-3 rounded-lg border border-neutral-200 dark:border-neutral-700 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Rule Catalog
          </h3>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {ruleCatalog.length} active rule{ruleCatalog.length === 1 ? '' : 's'}
          </span>
        </div>
        {ruleCatalog.length === 0 ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            No active rules. Use the editor above to add one.
          </p>
        ) : (
          <div className="space-y-2 text-xs">
            {ruleCatalog.map((rule) => {
              const sourcePanel = allPanels.find(p => p.id === rule.sourceId);
              const targetPanel = allPanels.find(p => p.id === rule.targetId);
              return (
                <div
                  key={`${rule.sourceId}:${rule.direction}:${rule.targetId}`}
                  className="flex items-center justify-between rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-neutral-800 dark:text-neutral-100">
                      {sourcePanel?.title || rule.sourceId}
                    </span>
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {rule.direction === 'whenOpens' ? '← opens' : '← closes'}
                    </span>
                    <span className="font-medium text-neutral-800 dark:text-neutral-100">
                      {targetPanel?.title || rule.targetId}
                    </span>
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                      {rule.action}
                    </span>
                  </div>
                  {rule.overridden && (
                    <span className="text-[10px] text-blue-600 dark:text-blue-400">
                      custom
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
              const metadata = allPanels.find(p => p.id === panel.id);
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
                                    removeInteractionOverrideDirection(panel.id, targetId, 'whenOpens');
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
                                    removeInteractionOverrideDirection(panel.id, targetId, 'whenCloses');
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
