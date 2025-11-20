/**
 * Export/Import System (Phase 9)
 *
 * Provides utilities for exporting and importing scenarios and simulation runs as JSON.
 * Handles ID collision resolution and validation.
 */

import type { SimulationScenario } from './scenarios';
import { loadScenarios, saveScenarios } from './scenarios';
import type { SavedSimulationRun } from './multiRunStorage';
import { loadSavedRuns, saveSavedRuns } from './multiRunStorage';

/**
 * Export format wrapper for better validation
 */
interface ExportedData {
  version: string;
  exportedAt: number;
  type: 'scenario' | 'run' | 'bundle';
  data: SimulationScenario | SavedSimulationRun | ExportBundle;
}

/**
 * Bundle export containing multiple scenarios and runs
 */
export interface ExportBundle {
  scenarios: SimulationScenario[];
  runs: SavedSimulationRun[];
}

/**
 * Import result with collision info
 */
export interface ImportResult {
  success: boolean;
  message: string;
  conflicts?: string[];
  imported?: {
    scenarios?: number;
    runs?: number;
  };
}

/**
 * Export a scenario to JSON
 */
export function exportScenario(scenario: SimulationScenario): string {
  const exported: ExportedData = {
    version: '1.0',
    exportedAt: Date.now(),
    type: 'scenario',
    data: scenario,
  };

  return JSON.stringify(exported, null, 2);
}

/**
 * Export a simulation run to JSON
 */
export function exportRun(run: SavedSimulationRun): string {
  const exported: ExportedData = {
    version: '1.0',
    exportedAt: Date.now(),
    type: 'run',
    data: run,
  };

  return JSON.stringify(exported, null, 2);
}

/**
 * Export multiple scenarios and runs as a bundle
 */
export function exportBundle(
  scenarios: SimulationScenario[],
  runs: SavedSimulationRun[]
): string {
  const bundle: ExportBundle = {
    scenarios,
    runs,
  };

  const exported: ExportedData = {
    version: '1.0',
    exportedAt: Date.now(),
    type: 'bundle',
    data: bundle,
  };

  return JSON.stringify(exported, null, 2);
}

/**
 * Generate a new unique ID for scenarios
 */
function generateScenarioId(): string {
  return `scenario-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a new unique ID for runs
 */
function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Import a scenario from JSON
 */
export function importScenario(
  json: string,
  options?: {
    renameOnConflict?: boolean;
  }
): ImportResult {
  try {
    const parsed = JSON.parse(json);

    // Validate format
    if (!parsed.version || !parsed.type || !parsed.data) {
      return {
        success: false,
        message: 'Invalid export format. Missing required fields.',
      };
    }

    if (parsed.type !== 'scenario') {
      return {
        success: false,
        message: `Expected scenario export, got ${parsed.type}`,
      };
    }

    const scenario = parsed.data as SimulationScenario;

    // Validate scenario structure
    if (!scenario.id || !scenario.name || scenario.worldId === undefined) {
      return {
        success: false,
        message: 'Invalid scenario data. Missing required fields.',
      };
    }

    const existingScenarios = loadScenarios();
    const conflicts: string[] = [];

    // Check for ID conflict
    const existingIndex = existingScenarios.findIndex((s) => s.id === scenario.id);
    if (existingIndex !== -1) {
      if (options?.renameOnConflict) {
        // Generate new ID
        scenario.id = generateScenarioId();
        scenario.name = `${scenario.name} (imported)`;
      } else {
        conflicts.push(scenario.id);
        return {
          success: false,
          message: `Scenario with ID "${scenario.id}" already exists`,
          conflicts,
        };
      }
    }

    // Import scenario
    existingScenarios.push(scenario);
    saveScenarios(existingScenarios);

    return {
      success: true,
      message: `Successfully imported scenario "${scenario.name}"`,
      imported: { scenarios: 1 },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to parse JSON: ${error}`,
    };
  }
}

/**
 * Import a simulation run from JSON
 */
export function importRun(
  json: string,
  options?: {
    renameOnConflict?: boolean;
  }
): ImportResult {
  try {
    const parsed = JSON.parse(json);

    // Validate format
    if (!parsed.version || !parsed.type || !parsed.data) {
      return {
        success: false,
        message: 'Invalid export format. Missing required fields.',
      };
    }

    if (parsed.type !== 'run') {
      return {
        success: false,
        message: `Expected run export, got ${parsed.type}`,
      };
    }

    const run = parsed.data as SavedSimulationRun;

    // Validate run structure
    if (!run.id || !run.name || run.worldId === undefined || !run.history) {
      return {
        success: false,
        message: 'Invalid run data. Missing required fields.',
      };
    }

    const existingRuns = loadSavedRuns();
    const conflicts: string[] = [];

    // Check for ID conflict
    const existingIndex = existingRuns.findIndex((r) => r.id === run.id);
    if (existingIndex !== -1) {
      if (options?.renameOnConflict) {
        // Generate new ID and update savedAt
        run.id = generateRunId();
        run.name = `${run.name} (imported)`;
        run.savedAt = Date.now();
      } else {
        conflicts.push(run.id);
        return {
          success: false,
          message: `Run with ID "${run.id}" already exists`,
          conflicts,
        };
      }
    }

    // Import run
    existingRuns.push(run);
    saveSavedRuns(existingRuns);

    return {
      success: true,
      message: `Successfully imported run "${run.name}"`,
      imported: { runs: 1 },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to parse JSON: ${error}`,
    };
  }
}

/**
 * Import a bundle of scenarios and runs
 */
export function importBundle(
  json: string,
  options?: {
    renameOnConflict?: boolean;
  }
): ImportResult {
  try {
    const parsed = JSON.parse(json);

    // Validate format
    if (!parsed.version || !parsed.type || !parsed.data) {
      return {
        success: false,
        message: 'Invalid export format. Missing required fields.',
      };
    }

    if (parsed.type !== 'bundle') {
      return {
        success: false,
        message: `Expected bundle export, got ${parsed.type}`,
      };
    }

    const bundle = parsed.data as ExportBundle;

    if (!Array.isArray(bundle.scenarios) || !Array.isArray(bundle.runs)) {
      return {
        success: false,
        message: 'Invalid bundle data. Expected scenarios and runs arrays.',
      };
    }

    const existingScenarios = loadScenarios();
    const existingRuns = loadSavedRuns();
    const conflicts: string[] = [];
    let scenariosImported = 0;
    let runsImported = 0;

    // Import scenarios
    for (const scenario of bundle.scenarios) {
      if (!scenario.id || !scenario.name) {
        continue;
      }

      const existingIndex = existingScenarios.findIndex((s) => s.id === scenario.id);
      if (existingIndex !== -1) {
        if (options?.renameOnConflict) {
          scenario.id = generateScenarioId();
          scenario.name = `${scenario.name} (imported)`;
        } else {
          conflicts.push(scenario.id);
          continue;
        }
      }

      existingScenarios.push(scenario);
      scenariosImported++;
    }

    // Import runs
    for (const run of bundle.runs) {
      if (!run.id || !run.name || !run.history) {
        continue;
      }

      const existingIndex = existingRuns.findIndex((r) => r.id === run.id);
      if (existingIndex !== -1) {
        if (options?.renameOnConflict) {
          run.id = generateRunId();
          run.name = `${run.name} (imported)`;
          run.savedAt = Date.now();
        } else {
          conflicts.push(run.id);
          continue;
        }
      }

      existingRuns.push(run);
      runsImported++;
    }

    // Save all
    saveScenarios(existingScenarios);
    saveSavedRuns(existingRuns);

    const messages: string[] = [];
    if (scenariosImported > 0) {
      messages.push(`${scenariosImported} scenario(s)`);
    }
    if (runsImported > 0) {
      messages.push(`${runsImported} run(s)`);
    }

    if (messages.length === 0) {
      return {
        success: false,
        message: 'No items were imported',
        conflicts,
      };
    }

    return {
      success: true,
      message: `Successfully imported ${messages.join(' and ')}`,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      imported: {
        scenarios: scenariosImported,
        runs: runsImported,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to parse JSON: ${error}`,
    };
  }
}

/**
 * Download a file with the given content
 */
export function downloadFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate a safe filename from a name
 */
export function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
