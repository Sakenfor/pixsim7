/**
 * SavedRunsPanel
 *
 * Renders the saved simulation runs list and creation UI.
 */

import { Button, Input, Panel } from '@pixsim7/shared.ui';

import type { SimulationHistory } from '@features/simulation/lib/core/history';
import type { SavedSimulationRun } from '@features/simulation/lib/core/multiRunStorage';

export interface SavedRunsPanelProps {
  savedRuns: SavedSimulationRun[];
  simulationHistory: SimulationHistory | null;
  isCreatingRun: boolean;
  setIsCreatingRun: (value: boolean) => void;
  newRunName: string;
  setNewRunName: (value: string) => void;
  newRunDescription: string;
  setNewRunDescription: (value: string) => void;
  onSaveRun: () => void;
  onDeleteRun: (runId: string) => void;
}

export function SavedRunsPanel({
  savedRuns,
  simulationHistory,
  isCreatingRun,
  setIsCreatingRun,
  newRunName,
  setNewRunName,
  newRunDescription,
  setNewRunDescription,
  onSaveRun,
  onDeleteRun,
}: SavedRunsPanelProps) {
  return (
    <Panel className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Saved Simulation Runs</h2>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setIsCreatingRun(true)}
          disabled={!simulationHistory || simulationHistory.snapshots.length === 0}
        >
          Save Current Run
        </Button>
      </div>

      {isCreatingRun && (
        <div className="p-3 border border-neutral-300 dark:border-neutral-700 rounded space-y-2">
          <Input
            placeholder="Run name"
            value={newRunName}
            onChange={(e) => setNewRunName(e.target.value)}
            className="w-full"
          />
          <Input
            placeholder="Description (optional)"
            value={newRunDescription}
            onChange={(e) => setNewRunDescription(e.target.value)}
            className="w-full"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={onSaveRun}>
              Save
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setIsCreatingRun(false);
                setNewRunName('');
                setNewRunDescription('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {savedRuns.length === 0 && !isCreatingRun && (
        <p className="text-xs text-neutral-500">
          No saved runs yet. Run some simulation ticks and save your run for later comparison.
        </p>
      )}

      {savedRuns.length > 0 && (
        <div className="space-y-2">
          {savedRuns.map((run) => (
            <div
              key={run.id}
              className="p-3 rounded border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{run.name}</div>
                  {run.description && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                      {run.description}
                    </div>
                  )}
                  <div className="text-xs text-neutral-500 mt-1">
                    World: {run.worldName || `#${run.worldId}`} •{' '}
                    {run.history.snapshots.length} snapshots •{' '}
                    Saved {new Date(run.savedAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => onDeleteRun(run.id)}
                  className="text-red-500 hover:text-red-700 text-xs"
                  title="Delete run"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
