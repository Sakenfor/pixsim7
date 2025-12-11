/**
 * Relationship Gate Visualizer
 *
 * Visual component for displaying and configuring relationship gates.
 * Shows tier/intimacy thresholds and metric requirements in an intuitive way.
 *
 * @see packages/types/src/intimacy.ts
 * @see docs/INTIMACY_AND_GENERATION.md
 */

import React from 'react';
import type { RelationshipGate, GateCheckResult } from '@/types';

interface RelationshipGateVisualizerProps {
  /** The gate to visualize */
  gate: RelationshipGate;

  /** Optional check result to show current status */
  checkResult?: GateCheckResult;

  /** Whether the gate is being edited */
  readOnly?: boolean;

  /** Callback when gate is modified */
  onChange?: (gate: RelationshipGate) => void;

  /** Show expanded details */
  expanded?: boolean;

  /** Callback when expansion state changes */
  onToggleExpanded?: () => void;
}

/**
 * Get color for gate status
 */
function getGateStatusColor(satisfied: boolean): string {
  return satisfied ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
}

/**
 * Get background color for gate status
 */
function getGateStatusBgColor(satisfied: boolean): string {
  return satisfied
    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
    : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
}

/**
 * Relationship tiers (ordered by progression)
 */
const RELATIONSHIP_TIERS = [
  { id: 'stranger', label: 'Stranger', color: '#9ca3af' },
  { id: 'acquaintance', label: 'Acquaintance', color: '#60a5fa' },
  { id: 'friend', label: 'Friend', color: '#34d399' },
  { id: 'close_friend', label: 'Close Friend', color: '#f59e0b' },
  { id: 'lover', label: 'Lover', color: '#ec4899' },
];

/**
 * Intimacy levels (ordered by intensity)
 */
const INTIMACY_LEVELS = [
  { id: 'none', label: 'None', color: '#9ca3af' },
  { id: 'light_flirt', label: 'Light Flirt', color: '#f9a8d4' },
  { id: 'deep_flirt', label: 'Deep Flirt', color: '#f472b6' },
  { id: 'intimate', label: 'Intimate', color: '#ec4899' },
  { id: 'very_intimate', label: 'Very Intimate', color: '#be185d' },
];

export function RelationshipGateVisualizer({
  gate,
  checkResult,
  readOnly = true,
  onChange,
  expanded = false,
  onToggleExpanded,
}: RelationshipGateVisualizerProps) {
  const isSatisfied = checkResult?.satisfied ?? undefined;

  return (
    <div className="border rounded-lg p-4 dark:border-neutral-700">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚪</span>
            {readOnly ? (
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-100">
                {gate.name}
              </h4>
            ) : (
              <input
                type="text"
                value={gate.name}
                onChange={(e) => onChange?.({ ...gate, name: e.target.value })}
                className="font-semibold bg-transparent border-b border-neutral-300 dark:border-neutral-600 focus:outline-none focus:border-blue-500"
                placeholder="Gate Name"
              />
            )}
          </div>
          {gate.description && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
              {gate.description}
            </p>
          )}
        </div>

        {/* Status indicator */}
        {isSatisfied !== undefined && (
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${getGateStatusBgColor(isSatisfied)}`}>
            <span className={getGateStatusColor(isSatisfied)}>
              {isSatisfied ? '✓ Unlocked' : '✗ Locked'}
            </span>
          </div>
        )}

        {/* Expand toggle */}
        {onToggleExpanded && (
          <button
            onClick={onToggleExpanded}
            className="ml-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            {expanded ? '▼' : '▶'}
          </button>
        )}
      </div>

      {/* Requirements summary */}
      <div className="space-y-2">
        {/* Required tier */}
        {gate.requiredTier && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">Tier:</span>
            <div className="flex items-center gap-1">
              {RELATIONSHIP_TIERS.map((tier) => {
                const isRequired = tier.id === gate.requiredTier;
                const isCurrent = checkResult?.details?.currentTier === tier.id;
                const isUnlocked = !isRequired || (checkResult?.details?.currentTier &&
                  RELATIONSHIP_TIERS.findIndex(t => t.id === checkResult.details!.currentTier!) >=
                  RELATIONSHIP_TIERS.findIndex(t => t.id === gate.requiredTier!));

                return (
                  <div
                    key={tier.id}
                    className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                      isRequired
                        ? 'ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-neutral-800'
                        : ''
                    } ${
                      isCurrent
                        ? 'ring-2 ring-offset-1 ring-green-500 dark:ring-offset-neutral-800'
                        : ''
                    } ${
                      isUnlocked
                        ? 'opacity-100'
                        : 'opacity-40'
                    }`}
                    style={{
                      backgroundColor: tier.color + '30',
                      color: tier.color,
                    }}
                    title={`${tier.label}${isRequired ? ' (Required)' : ''}${isCurrent ? ' (Current)' : ''}`}
                  >
                    {tier.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Required intimacy level */}
        {gate.requiredIntimacyLevel && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">Intimacy:</span>
            <div className="flex items-center gap-1">
              {INTIMACY_LEVELS.map((level) => {
                const isRequired = level.id === gate.requiredIntimacyLevel;
                const isCurrent = checkResult?.details?.currentIntimacy === level.id;

                return (
                  <div
                    key={level.id}
                    className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                      isRequired
                        ? 'ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-neutral-800'
                        : ''
                    } ${
                      isCurrent
                        ? 'ring-2 ring-offset-1 ring-green-500 dark:ring-offset-neutral-800'
                        : ''
                    }`}
                    style={{
                      backgroundColor: level.color + '30',
                      color: level.color,
                    }}
                    title={`${level.label}${isRequired ? ' (Required)' : ''}${isCurrent ? ' (Current)' : ''}`}
                  >
                    {level.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Metric requirements */}
        {gate.metricRequirements && expanded && (
          <div className="mt-3 space-y-2 pl-2 border-l-2 border-neutral-200 dark:border-neutral-700">
            <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Metric Requirements:
            </div>
            {Object.entries(gate.metricRequirements).map(([metric, value]) => {
              if (!value) return null;

              const currentValue = checkResult?.details?.metricValues?.[metric];
              const isMet = currentValue !== undefined && currentValue >= value;

              return (
                <div key={metric} className="flex items-center gap-2">
                  <span className="text-sm text-neutral-600 dark:text-neutral-400 capitalize w-24">
                    {metric.replace(/^min/, '')}:
                  </span>
                  <div className="flex-1">
                    <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          isMet ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min((currentValue || 0), 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${isMet ? getGateStatusColor(true) : ''}`}>
                    {currentValue !== undefined ? currentValue : '-'} / {value}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Required flags */}
        {gate.requiredFlags && gate.requiredFlags.length > 0 && expanded && (
          <div className="mt-3 space-y-1 pl-2 border-l-2 border-neutral-200 dark:border-neutral-700">
            <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Required Flags:
            </div>
            <div className="flex flex-wrap gap-1">
              {gate.requiredFlags.map((flag) => (
                <span
                  key={flag}
                  className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs rounded"
                >
                  {flag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Blocked flags */}
        {gate.blockedFlags && gate.blockedFlags.length > 0 && expanded && (
          <div className="mt-3 space-y-1 pl-2 border-l-2 border-neutral-200 dark:border-neutral-700">
            <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Blocked Flags:
            </div>
            <div className="flex flex-wrap gap-1">
              {gate.blockedFlags.map((flag) => (
                <span
                  key={flag}
                  className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs rounded"
                >
                  {flag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Missing requirements */}
      {checkResult && !checkResult.satisfied && checkResult.missingRequirements && expanded && (
        <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
          <div className="text-sm font-medium text-amber-900 dark:text-amber-300 mb-1">
            Missing Requirements:
          </div>
          <ul className="text-sm text-amber-800 dark:text-amber-400 list-disc list-inside">
            {checkResult.missingRequirements.map((req, idx) => (
              <li key={idx}>{req}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Compact badge version for showing gate status in node views
 */
export function RelationshipGateBadge({
  gate,
  checkResult,
  onClick,
}: {
  gate: RelationshipGate;
  checkResult?: GateCheckResult;
  onClick?: () => void;
}) {
  const isSatisfied = checkResult?.satisfied ?? undefined;

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
        isSatisfied !== undefined
          ? getGateStatusBgColor(isSatisfied)
          : 'bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600'
      }`}
      title={gate.name}
    >
      <span>🚪</span>
      <span className={isSatisfied !== undefined ? getGateStatusColor(isSatisfied) : ''}>
        {gate.name}
      </span>
      {isSatisfied !== undefined && (
        <span className={getGateStatusColor(isSatisfied)}>
          {isSatisfied ? '✓' : '✗'}
        </span>
      )}
    </button>
  );
}
