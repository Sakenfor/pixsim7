/**
 * Relationship State Editor
 *
 * Interactive editor for simulating relationship states.
 * Allows adjusting tier, intimacy level, metrics, and flags for preview/testing.
 *
 * @see frontend/src/lib/intimacy/gateChecking.ts
 * @see docs/INTIMACY_SCENE_COMPOSER.md
 */

import React from 'react';
import type { SimulatedRelationshipState } from '../lib/gateChecking';
import { createStateFromTier } from '../lib/gateChecking';

interface RelationshipStateEditorProps {
  /** Current simulated state */
  state: SimulatedRelationshipState;

  /** Callback when state changes */
  onChange: (state: SimulatedRelationshipState) => void;

  /** Whether the editor is read-only */
  readOnly?: boolean;

  /** Show preset buttons for quick setup */
  showPresets?: boolean;
}

const TIERS = [
  { id: 'stranger', label: 'Stranger', color: '#9ca3af' },
  { id: 'acquaintance', label: 'Acquaintance', color: '#60a5fa' },
  { id: 'friend', label: 'Friend', color: '#34d399' },
  { id: 'close_friend', label: 'Close Friend', color: '#f59e0b' },
  { id: 'lover', label: 'Lover', color: '#ec4899' },
];

const INTIMACY_LEVELS = [
  { id: 'none', label: 'None' },
  { id: 'light_flirt', label: 'Light Flirt' },
  { id: 'deep_flirt', label: 'Deep Flirt' },
  { id: 'intimate', label: 'Intimate' },
  { id: 'very_intimate', label: 'Very Intimate' },
];

export function RelationshipStateEditor({
  state,
  onChange,
  readOnly = false,
  showPresets = true,
}: RelationshipStateEditorProps) {
  const updateMetric = (metric: keyof SimulatedRelationshipState['metrics'], value: number) => {
    onChange({
      ...state,
      metrics: {
        ...state.metrics,
        [metric]: value,
      },
    });
  };

  const updateTier = (tier: string) => {
    onChange({ ...state, tier });
  };

  const updateIntimacyLevel = (intimacyLevel: string) => {
    onChange({ ...state, intimacyLevel });
  };

  const loadPreset = (tier: string) => {
    onChange(createStateFromTier(tier));
  };

  return (
    <div className="space-y-4">
      {/* Presets */}
      {showPresets && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Quick Presets
          </label>
          <div className="grid grid-cols-2 gap-2">
            {TIERS.map((tier) => (
              <button
                key={tier.id}
                onClick={() => !readOnly && loadPreset(tier.id)}
                disabled={readOnly}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  state.tier === tier.id
                    ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-neutral-900'
                    : ''
                } ${readOnly ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}`}
                style={{
                  backgroundColor: tier.color + '30',
                  color: tier.color,
                }}
              >
                {tier.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tier Selection */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Relationship Tier
        </label>
        <select
          value={state.tier}
          onChange={(e) => !readOnly && updateTier(e.target.value)}
          disabled={readOnly}
          className="w-full px-3 py-2 border rounded-lg dark:bg-neutral-800 dark:border-neutral-600 disabled:opacity-50"
        >
          {TIERS.map((tier) => (
            <option key={tier.id} value={tier.id}>
              {tier.label}
            </option>
          ))}
        </select>
      </div>

      {/* Intimacy Level */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Intimacy Level
        </label>
        <select
          value={state.intimacyLevel || 'none'}
          onChange={(e) => !readOnly && updateIntimacyLevel(e.target.value)}
          disabled={readOnly}
          className="w-full px-3 py-2 border rounded-lg dark:bg-neutral-800 dark:border-neutral-600 disabled:opacity-50"
        >
          {INTIMACY_LEVELS.map((level) => (
            <option key={level.id} value={level.id}>
              {level.label}
            </option>
          ))}
        </select>
      </div>

      {/* Metrics */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-3">
          Relationship Metrics
        </label>
        <div className="space-y-3">
          {(Object.keys(state.metrics) as Array<keyof typeof state.metrics>).map((metric) => {
            const value = state.metrics[metric];
            return (
              <div key={metric}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-neutral-600 dark:text-neutral-400 capitalize">
                    {metric}
                  </span>
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {value}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={value}
                  onChange={(e) => !readOnly && updateMetric(metric, parseInt(e.target.value))}
                  disabled={readOnly}
                  className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                  style={{
                    background: readOnly
                      ? undefined
                      : `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${value}%, #e5e7eb ${value}%, #e5e7eb 100%)`,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Flags */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          Active Flags
        </label>
        {Object.keys(state.flags).length === 0 ? (
          <p className="text-sm text-neutral-500 dark:text-neutral-400 italic">
            No flags set. Flags will be added automatically based on gate requirements.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {Object.entries(state.flags).map(([flag, value]) => (
              <button
                key={flag}
                onClick={() => {
                  if (!readOnly) {
                    const newFlags = { ...state.flags };
                    if (value) {
                      delete newFlags[flag];
                    } else {
                      newFlags[flag] = true;
                    }
                    onChange({ ...state, flags: newFlags });
                  }
                }}
                disabled={readOnly}
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                  value
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
                } ${readOnly ? 'cursor-not-allowed' : 'hover:opacity-80'}`}
              >
                {value ? '✓ ' : '✗ '}
                {flag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
        <div className="text-xs font-medium text-blue-900 dark:text-blue-300 mb-1">
          Current State Summary
        </div>
        <div className="text-xs text-blue-700 dark:text-blue-400 space-y-0.5">
          <div>
            Tier: <span className="font-medium">{state.tier}</span>
          </div>
          <div>
            Intimacy: <span className="font-medium">{state.intimacyLevel || 'none'}</span>
          </div>
          <div>
            Metrics:{' '}
            <span className="font-medium">
              A:{state.metrics.affinity} T:{state.metrics.trust} C:{state.metrics.chemistry} Te:
              {state.metrics.tension}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
