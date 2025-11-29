/**
 * Dynamic Theme Rules Panel
 *
 * UI for managing automatic theme changes based on world state
 * (time of day, relationships, story progression, etc.)
 */

import { useState, useEffect } from 'react';
import type { DynamicThemeRule } from '@pixsim7/game.engine';
import {
  loadDynamicThemeRules,
  saveDynamicThemeRules,
  toggleRuleEnabled,
  deleteRule,
  resetToDefaultRules,
  DYNAMIC_THEME_RULE_PRESETS,
} from '@pixsim7/game.engine';
import { Button, Badge } from '@pixsim7/shared.ui';

export function DynamicThemeRulesPanel() {
  const [rules, setRules] = useState<DynamicThemeRule[]>([]);
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null);

  const refreshRules = () => {
    setRules(loadDynamicThemeRules());
  };

  useEffect(() => {
    refreshRules();
  }, []);

  const handleToggleEnabled = (ruleId: string) => {
    toggleRuleEnabled(ruleId);
    refreshRules();
  };

  const handleDeleteRule = (ruleId: string) => {
    if (!confirm(`Delete rule "${ruleId}"?`)) {
      return;
    }

    const success = deleteRule(ruleId);
    if (success) {
      refreshRules();
      if (expandedRuleId === ruleId) {
        setExpandedRuleId(null);
      }
    }
  };

  const handleReset = () => {
    if (!confirm('Reset to default theme rules? This will remove all custom rules.')) {
      return;
    }

    resetToDefaultRules();
    refreshRules();
  };

  const toggleExpand = (ruleId: string) => {
    setExpandedRuleId(expandedRuleId === ruleId ? null : ruleId);
  };

  const formatCondition = (condition: any): string => {
    switch (condition.type) {
      case 'timeRange':
        return `Time: ${condition.startHour}:00 - ${condition.endHour}:00`;
      case 'worldTime':
        return `World Time: ${condition.minTime} - ${condition.maxTime}`;
      case 'relationshipLevel':
        return `Relationship (NPC ${condition.npcId}): ≥${condition.minLevel}`;
      case 'flag':
        return `Flag "${condition.flagKey}" = ${condition.value}`;
      case 'arcActive':
        return `Arc "${condition.arcId}" active`;
      case 'turnNumber':
        return `Turn ${condition.minTurn}${condition.maxTurn ? `-${condition.maxTurn}` : '+'}`;
      case 'always':
        return 'Always active';
      default:
        return JSON.stringify(condition);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded border border-blue-200 dark:border-blue-800">
        <div className="font-semibold text-sm mb-1">Dynamic Theme Rules</div>
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          Automatically change themes based on world state (time of day, relationships, story progression).
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={handleReset} variant="secondary" size="sm">
          🔄 Reset to Defaults
        </Button>
      </div>

      {/* Rules List */}
      <div className="space-y-2">
        {rules.map((rule) => {
          const isExpanded = expandedRuleId === rule.id;
          const isPreset = DYNAMIC_THEME_RULE_PRESETS.some(p => p.id === rule.id);

          return (
            <div
              key={rule.id}
              className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden"
            >
              {/* Rule Header */}
              <div
                className="p-3 bg-neutral-50 dark:bg-neutral-900 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                onClick={() => toggleExpand(rule.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{rule.name}</span>
                      {rule.enabled ? (
                        <Badge color="green">Enabled</Badge>
                      ) : (
                        <Badge color="gray">Disabled</Badge>
                      )}
                      {isPreset && <Badge color="blue">Preset</Badge>}
                      <span className="text-xs text-neutral-500">
                        Priority: {rule.priority}
                      </span>
                    </div>
                    {rule.description && (
                      <div className="text-xs text-neutral-600 dark:text-neutral-400">
                        {rule.description}
                      </div>
                    )}
                  </div>
                  <span className="text-neutral-400">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>
              </div>

              {/* Rule Details (when expanded) */}
              {isExpanded && (
                <div className="p-3 bg-white dark:bg-neutral-950 border-t border-neutral-200 dark:border-neutral-700">
                  {/* Conditions */}
                  <div className="mb-3">
                    <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                      Conditions ({rule.conditions.length}):
                    </div>
                    <div className="space-y-1">
                      {rule.conditions.map((condition, idx) => (
                        <div
                          key={idx}
                          className="text-xs px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800"
                        >
                          {formatCondition(condition)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Theme Override Preview */}
                  {rule.themeOverride && (
                    <div className="mb-3">
                      <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                        Theme Override:
                      </div>
                      <div className="text-xs p-2 rounded bg-neutral-100 dark:bg-neutral-800">
                        {rule.themeOverride.colors && Object.keys(rule.themeOverride.colors).length > 0 && (
                          <div className="mb-2">
                            <div className="font-medium mb-1">Colors:</div>
                            <div className="flex gap-1 flex-wrap">
                              {Object.entries(rule.themeOverride.colors).map(([key, value]) => (
                                <div key={key} className="flex items-center gap-1">
                                  <div
                                    className="w-4 h-4 rounded border border-neutral-300 dark:border-neutral-600"
                                    style={{ backgroundColor: value }}
                                  />
                                  <span className="text-[10px]">{key}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {rule.themeOverride.motion && (
                          <div className="text-[10px]">Motion: {String(rule.themeOverride.motion)}</div>
                        )}
                        {rule.themeOverride.density && (
                          <div className="text-[10px]">Density: {rule.themeOverride.density}</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleToggleEnabled(rule.id)}
                      variant={rule.enabled ? 'secondary' : 'primary'}
                      size="sm"
                    >
                      {rule.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    {!isPreset && (
                      <Button
                        onClick={() => handleDeleteRule(rule.id)}
                        variant="secondary"
                        size="sm"
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {rules.length === 0 && (
        <div className="text-center text-neutral-500 text-sm py-8">
          No dynamic theme rules configured.
        </div>
      )}

      {/* Info Box */}
      <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded border border-amber-200 dark:border-amber-800">
        <div className="text-xs text-amber-800 dark:text-amber-200">
          <strong>How it works:</strong> Rules are evaluated in priority order (highest first).
          The first matching rule's theme override is applied. Session overrides always take precedence over dynamic rules.
        </div>
      </div>
    </div>
  );
}
