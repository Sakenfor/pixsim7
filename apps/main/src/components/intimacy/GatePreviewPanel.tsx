/**
 * Gate Preview Panel
 *
 * Shows live gate checking results based on simulated relationship state.
 * Provides "what-if" analysis for relationship gates.
 *
 * @see frontend/src/lib/intimacy/gateChecking.ts
 * @see docs/INTIMACY_SCENE_COMPOSER.md
 */

import React, { useMemo } from 'react';
import type { RelationshipGate } from '@/types';
import type { SimulatedRelationshipState } from '@/lib/intimacy/gateChecking';
import { checkAllGates } from '@/lib/intimacy/gateChecking';
import { RelationshipGateVisualizer } from './RelationshipGateVisualizer';

interface GatePreviewPanelProps {
  /** Gates to preview */
  gates: RelationshipGate[];

  /** Simulated relationship state */
  simulatedState: SimulatedRelationshipState;

  /** Show expanded details by default */
  expandByDefault?: boolean;

  /** Callback when a gate is clicked */
  onGateClick?: (gateId: string) => void;
}

export function GatePreviewPanel({
  gates,
  simulatedState,
  expandByDefault = false,
  onGateClick,
}: GatePreviewPanelProps) {
  const [expandedGateId, setExpandedGateId] = React.useState<string | null>(
    expandByDefault && gates.length > 0 ? gates[0].id : null
  );

  // Check all gates with current state
  const gateResults = useMemo(
    () => checkAllGates(gates, simulatedState),
    [gates, simulatedState]
  );

  // Count satisfied vs unsatisfied
  const stats = useMemo(() => {
    const satisfied = Object.values(gateResults).filter((r) => r.satisfied).length;
    const total = gates.length;
    return { satisfied, unsatisfied: total - satisfied, total };
  }, [gateResults, gates.length]);

  if (gates.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500 dark:text-neutral-400">
        <div className="text-4xl mb-2">🚪</div>
        <p>No gates to preview</p>
        <p className="text-sm mt-1">Configure gates in the Gates tab</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex items-center gap-4 p-3 bg-neutral-50 dark:bg-neutral-800 rounded-lg border dark:border-neutral-700">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm text-neutral-700 dark:text-neutral-300">
            {stats.satisfied} Passed
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-sm text-neutral-700 dark:text-neutral-300">
            {stats.unsatisfied} Failed
          </span>
        </div>
        <div className="flex-1" />
        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {stats.total} Total
        </div>
      </div>

      {/* Overall Status */}
      {stats.total > 0 && (
        <div
          className={`p-3 rounded-lg border ${
            stats.satisfied === stats.total
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : stats.satisfied > 0
              ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}
        >
          <div
            className={`text-sm font-medium ${
              stats.satisfied === stats.total
                ? 'text-green-900 dark:text-green-300'
                : stats.satisfied > 0
                ? 'text-amber-900 dark:text-amber-300'
                : 'text-red-900 dark:text-red-300'
            }`}
          >
            {stats.satisfied === stats.total
              ? '✓ All gates passed - Content unlocked!'
              : stats.satisfied > 0
              ? `⚠️ ${stats.unsatisfied} gate(s) still locked`
              : '✗ All gates locked - Content not accessible'}
          </div>
        </div>
      )}

      {/* Gate List */}
      <div className="space-y-3">
        {gates.map((gate) => {
          const result = gateResults[gate.id];
          const isExpanded = expandedGateId === gate.id;

          return (
            <div
              key={gate.id}
              onClick={() => {
                setExpandedGateId(isExpanded ? null : gate.id);
                onGateClick?.(gate.id);
              }}
              className="cursor-pointer"
            >
              <RelationshipGateVisualizer
                gate={gate}
                checkResult={result}
                readOnly={true}
                expanded={isExpanded}
                onToggleExpanded={() => setExpandedGateId(isExpanded ? null : gate.id)}
              />
            </div>
          );
        })}
      </div>

      {/* Tips */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
        <div className="text-xs font-medium text-blue-900 dark:text-blue-300 mb-1">
          💡 Preview Tips
        </div>
        <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
          <li>Adjust metrics in the state editor to see how gates respond</li>
          <li>Try different tier presets to test progression</li>
          <li>Green indicators show which gates are unlocked</li>
          <li>Expand gates to see detailed requirements and progress</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Compact preview for showing gate status in other contexts
 */
export function GatePreviewSummary({
  gates,
  simulatedState,
  onClick,
}: {
  gates: RelationshipGate[];
  simulatedState: SimulatedRelationshipState;
  onClick?: () => void;
}) {
  const gateResults = useMemo(
    () => checkAllGates(gates, simulatedState),
    [gates, simulatedState]
  );

  const satisfied = Object.values(gateResults).filter((r) => r.satisfied).length;
  const total = gates.length;

  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        satisfied === total
          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
          : satisfied > 0
          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
      } hover:opacity-80`}
    >
      {satisfied === total ? '✓' : satisfied > 0 ? '⚠️' : '✗'} {satisfied}/{total} Gates Passed
    </button>
  );
}
