/**
 * SimulationHistoryPanel
 *
 * Renders the history panel showing simulation snapshots.
 */

import { formatWorldTime } from '@pixsim7/game.engine';
import { Panel } from '@pixsim7/shared.ui';

import {
  getHistoryStats,
  type SimulationHistory,
} from '@features/simulation/lib/core/history';

export interface SimulationHistoryPanelProps {
  simulationHistory: SimulationHistory;
}

export function SimulationHistoryPanel({ simulationHistory }: SimulationHistoryPanelProps) {
  return (
    <Panel className="p-4 space-y-3">
      <h2 className="text-sm font-semibold">Simulation History</h2>
      {simulationHistory.snapshots.length === 0 ? (
        <p className="text-xs text-neutral-500">
          No history yet. Advance time to create snapshots.
        </p>
      ) : (
        <>
          <div className="text-xs text-neutral-500 space-y-1">
            <p>Total Snapshots: {simulationHistory.snapshots.length}</p>
            <p>Events: {getHistoryStats(simulationHistory).totalEvents}</p>
            <p>
              Duration: {Math.floor(getHistoryStats(simulationHistory).duration / 1000)}s
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {simulationHistory.snapshots
              .slice()
              .reverse()
              .map((snapshot, idx) => {
                const realIdx = simulationHistory.snapshots.length - 1 - idx;
                return (
                  <div
                    key={snapshot.id}
                    className={`p-2 rounded text-xs border ${
                      realIdx === simulationHistory.currentIndex
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                        : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold">Snapshot #{realIdx + 1}</span>
                        <span className="ml-2 text-neutral-500">
                          {formatWorldTime(snapshot.worldTime, { shortDay: true })}
                        </span>
                      </div>
                      <span className="text-[10px] text-neutral-500">
                        {snapshot.events.length} events
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </Panel>
  );
}
