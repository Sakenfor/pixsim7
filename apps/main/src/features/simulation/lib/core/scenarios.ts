/**
 * Simulation Scenario Management
 *
 * Provides types and utilities for managing simulation scenarios in the Simulation Playground.
 * Scenarios are stored in localStorage for quick iteration during development.
 */

export interface SimulationScenario {
  id: string;
  name: string;
  worldId: number;
  initialWorldTime: number;
  initialSessionFlags: Record<string, unknown>;
  initialRelationships: Record<string, unknown>;
  npcIds: number[];
}

const STORAGE_KEY = 'pixsim7:simulation:scenarios';

/**
 * Load all scenarios from localStorage
 */
export function loadScenarios(): SimulationScenario[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load scenarios from localStorage', e);
    return [];
  }
}

/**
 * Save scenarios to localStorage
 */
export function saveScenarios(scenarios: SimulationScenario[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  } catch (e) {
    console.error('Failed to save scenarios to localStorage', e);
  }
}

/**
 * Get a single scenario by ID
 */
export function getScenario(id: string): SimulationScenario | null {
  const scenarios = loadScenarios();
  return scenarios.find((s) => s.id === id) ?? null;
}

/**
 * Create a new scenario
 */
export function createScenario(
  scenario: Omit<SimulationScenario, 'id'>
): SimulationScenario {
  const newScenario: SimulationScenario = {
    ...scenario,
    id: `scenario-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };

  const scenarios = loadScenarios();
  scenarios.push(newScenario);
  saveScenarios(scenarios);

  return newScenario;
}

/**
 * Update an existing scenario
 */
export function updateScenario(
  id: string,
  updates: Partial<Omit<SimulationScenario, 'id'>>
): SimulationScenario | null {
  const scenarios = loadScenarios();
  const index = scenarios.findIndex((s) => s.id === id);

  if (index === -1) {
    return null;
  }

  const updated = { ...scenarios[index], ...updates };
  scenarios[index] = updated;
  saveScenarios(scenarios);

  return updated;
}

/**
 * Delete a scenario
 */
export function deleteScenario(id: string): boolean {
  const scenarios = loadScenarios();
  const filtered = scenarios.filter((s) => s.id !== id);

  if (filtered.length === scenarios.length) {
    return false; // Scenario not found
  }

  saveScenarios(filtered);
  return true;
}

/**
 * Create a default scenario from a world
 */
export function createDefaultScenario(
  worldId: number,
  worldTime: number,
  worldName?: string
): Omit<SimulationScenario, 'id'> {
  return {
    name: `${worldName || 'World'} Scenario ${new Date().toLocaleString()}`,
    worldId,
    initialWorldTime: worldTime,
    initialSessionFlags: {},
    initialRelationships: {},
    npcIds: [],
  };
}
