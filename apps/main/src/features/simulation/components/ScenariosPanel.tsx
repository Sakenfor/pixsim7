/**
 * ScenariosPanel
 *
 * Renders the scenario list and creation UI.
 */

import { Button, Input, Panel } from '@pixsim7/shared.ui';

import type { SimulationScenario } from '@features/simulation/lib/core/scenarios';

export interface ScenariosPanelProps {
  scenarios: SimulationScenario[];
  selectedScenarioId: string | null;
  selectedWorldId: number | null;
  isCreatingScenario: boolean;
  setIsCreatingScenario: (value: boolean) => void;
  newScenarioName: string;
  setNewScenarioName: (value: string) => void;
  onCreateScenario: () => void;
  onLoadScenario: (scenarioId: string) => void;
  onDeleteScenario: (scenarioId: string) => void;
}

export function ScenariosPanel({
  scenarios,
  selectedScenarioId,
  selectedWorldId,
  isCreatingScenario,
  setIsCreatingScenario,
  newScenarioName,
  setNewScenarioName,
  onCreateScenario,
  onLoadScenario,
  onDeleteScenario,
}: ScenariosPanelProps) {
  return (
    <Panel className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Scenarios</h2>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setIsCreatingScenario(true)}
          disabled={!selectedWorldId}
        >
          Create Scenario
        </Button>
      </div>

      {isCreatingScenario && (
        <div className="p-3 border border-neutral-300 dark:border-neutral-700 rounded space-y-2">
          <Input
            placeholder="Scenario name"
            value={newScenarioName}
            onChange={(e) => setNewScenarioName(e.target.value)}
            className="w-full"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={onCreateScenario}>
              Save
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setIsCreatingScenario(false);
                setNewScenarioName('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {scenarios.length === 0 && !isCreatingScenario && (
        <p className="text-xs text-neutral-500">
          No scenarios yet. Create one to save your simulation state.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {scenarios.map((scenario) => (
          <div
            key={scenario.id}
            className={`px-3 py-2 rounded border text-xs flex items-center gap-2 ${
              selectedScenarioId === scenario.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700'
            }`}
          >
            <button onClick={() => onLoadScenario(scenario.id)} className="hover:underline">
              {scenario.name}
            </button>
            <button
              onClick={() => onDeleteScenario(scenario.id)}
              className="text-red-500 hover:text-red-700"
              title="Delete scenario"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
