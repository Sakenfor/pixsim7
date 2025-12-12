/**
 * Export/Import Panel (Phase 9)
 *
 * UI for exporting and importing scenarios and simulation runs.
 * Supports single exports, bundle exports, and collision resolution.
 */

import { useState, useRef } from 'react';
import { Panel, Button, Input } from '@pixsim7/shared.ui';
import type { SimulationScenario } from '@features/simulation/scenarios';
import type { SavedSimulationRun } from '@features/simulation/multiRunStorage';
import {
  exportScenario,
  exportRun,
  exportBundle,
  importScenario,
  importRun,
  importBundle,
  downloadFile,
  sanitizeFilename,
  type ImportResult,
} from '@features/simulation/exportImport';

interface ExportImportPanelProps {
  scenarios: SimulationScenario[];
  runs: SavedSimulationRun[];
  onImportComplete: () => void;
}

export function ExportImportPanel({
  scenarios,
  runs,
  onImportComplete,
}: ExportImportPanelProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [renameOnConflict, setRenameOnConflict] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export handlers
  const handleExportScenario = (scenarioId: string) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;

    const json = exportScenario(scenario);
    const filename = `scenario-${sanitizeFilename(scenario.name)}.json`;
    downloadFile(filename, json);
  };

  const handleExportRun = (runId: string) => {
    const run = runs.find((r) => r.id === runId);
    if (!run) return;

    const json = exportRun(run);
    const filename = `run-${sanitizeFilename(run.name)}.json`;
    downloadFile(filename, json);
  };

  const handleExportBundle = () => {
    const selectedScenarioObjs = scenarios.filter((s) => selectedScenarios.includes(s.id));
    const selectedRunObjs = runs.filter((r) => selectedRuns.includes(r.id));

    if (selectedScenarioObjs.length === 0 && selectedRunObjs.length === 0) {
      setImportResult({
        success: false,
        message: 'No items selected for export',
      });
      return;
    }

    const json = exportBundle(selectedScenarioObjs, selectedRunObjs);
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `pixsim7-bundle-${timestamp}.json`;
    downloadFile(filename, json);

    setImportResult({
      success: true,
      message: `Exported ${selectedScenarioObjs.length} scenario(s) and ${selectedRunObjs.length} run(s)`,
    });
  };

  const handleExportAll = () => {
    const json = exportBundle(scenarios, runs);
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `pixsim7-all-${timestamp}.json`;
    downloadFile(filename, json);

    setImportResult({
      success: true,
      message: `Exported all ${scenarios.length} scenario(s) and ${runs.length} run(s)`,
    });
  };

  // Import handlers
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      let result: ImportResult;

      switch (parsed.type) {
        case 'scenario':
          result = importScenario(text, { renameOnConflict });
          break;
        case 'run':
          result = importRun(text, { renameOnConflict });
          break;
        case 'bundle':
          result = importBundle(text, { renameOnConflict });
          break;
        default:
          result = {
            success: false,
            message: `Unknown export type: ${parsed.type}`,
          };
      }

      setImportResult(result);

      if (result.success) {
        onImportComplete();
      }
    } catch (error) {
      setImportResult({
        success: false,
        message: `Failed to read file: ${error}`,
      });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleScenarioSelection = (scenarioId: string) => {
    setSelectedScenarios((prev) =>
      prev.includes(scenarioId)
        ? prev.filter((id) => id !== scenarioId)
        : [...prev, scenarioId]
    );
  };

  const toggleRunSelection = (runId: string) => {
    setSelectedRuns((prev) =>
      prev.includes(runId) ? prev.filter((id) => id !== runId) : [...prev, runId]
    );
  };

  const selectAllScenarios = () => {
    setSelectedScenarios(scenarios.map((s) => s.id));
  };

  const deselectAllScenarios = () => {
    setSelectedScenarios([]);
  };

  const selectAllRuns = () => {
    setSelectedRuns(runs.map((r) => r.id));
  };

  const deselectAllRuns = () => {
    setSelectedRuns([]);
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <Panel className="p-4">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={activeTab === 'export' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('export')}
          >
            Export
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'import' ? 'primary' : 'secondary'}
            onClick={() => setActiveTab('import')}
          >
            Import
          </Button>
        </div>
      </Panel>

      {/* Result Message */}
      {importResult && (
        <Panel
          className={`p-4 ${
            importResult.success
              ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
              : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="text-sm font-semibold">
                {importResult.success ? 'Success' : 'Error'}
              </div>
              <p className="text-xs mt-1">{importResult.message}</p>
              {importResult.conflicts && importResult.conflicts.length > 0 && (
                <div className="text-xs mt-2">
                  <div className="font-semibold">Conflicts:</div>
                  <ul className="list-disc list-inside">
                    {importResult.conflicts.map((id) => (
                      <li key={id}>{id}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <button
              onClick={() => setImportResult(null)}
              className="text-sm opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </Panel>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && (
        <>
          {/* Export All */}
          <Panel className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold">Export All</h3>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                  Export all scenarios and runs as a single bundle
                </p>
              </div>
              <Button
                size="sm"
                variant="primary"
                onClick={handleExportAll}
                disabled={scenarios.length === 0 && runs.length === 0}
              >
                Download All
              </Button>
            </div>
          </Panel>

          {/* Export Scenarios */}
          <Panel className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Scenarios ({scenarios.length})</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={selectAllScenarios}>
                  Select All
                </Button>
                <Button size="sm" variant="secondary" onClick={deselectAllScenarios}>
                  Deselect All
                </Button>
              </div>
            </div>

            {scenarios.length === 0 && (
              <p className="text-xs text-neutral-500">No scenarios to export</p>
            )}

            <div className="space-y-2">
              {scenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  className="flex items-center justify-between gap-2 p-2 rounded bg-neutral-50 dark:bg-neutral-800"
                >
                  <label className="flex items-center gap-2 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedScenarios.includes(scenario.id)}
                      onChange={() => toggleScenarioSelection(scenario.id)}
                      className="rounded"
                    />
                    <span className="text-sm">{scenario.name}</span>
                  </label>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleExportScenario(scenario.id)}
                  >
                    Export
                  </Button>
                </div>
              ))}
            </div>
          </Panel>

          {/* Export Runs */}
          <Panel className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Simulation Runs ({runs.length})</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={selectAllRuns}>
                  Select All
                </Button>
                <Button size="sm" variant="secondary" onClick={deselectAllRuns}>
                  Deselect All
                </Button>
              </div>
            </div>

            {runs.length === 0 && (
              <p className="text-xs text-neutral-500">No runs to export</p>
            )}

            <div className="space-y-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between gap-2 p-2 rounded bg-neutral-50 dark:bg-neutral-800"
                >
                  <label className="flex items-center gap-2 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRuns.includes(run.id)}
                      onChange={() => toggleRunSelection(run.id)}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{run.name}</div>
                      <div className="text-xs text-neutral-500">
                        {run.history.snapshots.length} snapshots
                      </div>
                    </div>
                  </label>
                  <Button size="sm" variant="secondary" onClick={() => handleExportRun(run.id)}>
                    Export
                  </Button>
                </div>
              ))}
            </div>
          </Panel>

          {/* Export Selected Bundle */}
          {(selectedScenarios.length > 0 || selectedRuns.length > 0) && (
            <Panel className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Export Selected</h3>
                  <p className="text-xs mt-1">
                    {selectedScenarios.length} scenario(s), {selectedRuns.length} run(s) selected
                  </p>
                </div>
                <Button size="sm" variant="primary" onClick={handleExportBundle}>
                  Export Bundle
                </Button>
              </div>
            </Panel>
          )}
        </>
      )}

      {/* Import Tab */}
      {activeTab === 'import' && (
        <>
          <Panel className="p-4">
            <h3 className="text-sm font-semibold mb-3">Import Settings</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={renameOnConflict}
                onChange={(e) => setRenameOnConflict(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Automatically rename on ID conflict</span>
            </label>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-2">
              When enabled, imported items with conflicting IDs will be automatically renamed.
              Otherwise, imports will fail if IDs conflict.
            </p>
          </Panel>

          <Panel className="p-4">
            <h3 className="text-sm font-semibold mb-3">Import from File</h3>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-3">
              Select a JSON file exported from PixSim7 Simulation Playground. Supports scenarios,
              runs, and bundles.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />

            <Button
              size="sm"
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose File
            </Button>
          </Panel>

          <Panel className="p-4">
            <h3 className="text-sm font-semibold mb-2">Supported File Types</h3>
            <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-1 list-disc list-inside">
              <li>
                <strong>Scenario</strong> - Single simulation scenario with initial state
              </li>
              <li>
                <strong>Run</strong> - Complete simulation run with history
              </li>
              <li>
                <strong>Bundle</strong> - Multiple scenarios and runs
              </li>
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
}
