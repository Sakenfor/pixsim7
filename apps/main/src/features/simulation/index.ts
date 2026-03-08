/**
 * Simulation Feature Module
 *
 * Simulation Playground for designers to simulate world/brain evolutions over time.
 * Defines scenarios, advances time, and observes world & brain state changes.
 *
 * Note: Low-level simulation libs remain at `@/lib/simulation/` for now.
 * This feature focuses on the UI layer (components and route).
 *
 * @example
 * ```typescript
 * // Import the main component from barrel
 * import { SimulationPlayground } from '@features/simulation';
 *
 * // Or import specific components
 * import { WorldStateOverview } from '@features/simulation/components/WorldStateOverview';
 * import { ConstraintRunner } from '@features/simulation/components/ConstraintRunner';
 * ```
 */

// ============================================================================
// Main Entry Point
// ============================================================================

export { SimulationPlayground } from './components/SimulationPlayground';

// ============================================================================
// Visualization Components
// ============================================================================

export { WorldStateOverview } from './components/WorldStateOverview';
export { LocationPresenceMap } from './components/LocationPresenceMap';
export { TimelineScrubber } from './components/TimelineScrubber';
export { ScenarioComparison } from './components/ScenarioComparison';
export { MultiRunComparison } from './components/MultiRunComparison';

// ============================================================================
// Tool Components
// ============================================================================

export { ConstraintRunner } from './components/ConstraintRunner';
export { SimulationPluginsPanel } from './components/SimulationPluginsPanel';
// Lib - Simulation Core
export type {
  SimulationRunConfig,
  SimulationRunResult,
  AssertionResult,
  RegressionTest,
  RegressionTestSuiteResult,
  SimulationConstraint,
  WorldTimeConstraint,
  FlagConstraint,
  NpcLocationConstraint,
  TickCountConstraint,
  EventConstraint,
  CompoundConstraint,
  AnyConstraint,
  ConstraintEvaluationContext,
  ConstraintEvaluationResult,
  ExportBundle,
  ImportResult,
  SimulationSnapshot,
  SimulationHistory,
  SimulationTickContext,
  SimulationEvent,
  SimulationHook,
  BeforeTickHook,
  AfterTickHook,
  ScenarioLoadedContext,
  ScenarioLoadedHook,
  SimulationStartedContext,
  SimulationStartedHook,
  SimulationStoppedContext,
  SimulationStoppedHook,
  SimulationPlugin,
  SavedSimulationRun,
  SimulationScenario,
} from './lib/core';
export {
  HeadlessSimulationRunner,
  runSimulation,
  assertions,
  runRegressionTestSuite,
  formatRegressionResults,
  evaluateConstraint,
  createWorldTimeConstraint,
  createFlagConstraint,
  createNpcLocationConstraint,
  createTickCountConstraint,
  createEventConstraint,
  createCompoundConstraint,
  exportScenario,
  exportRun,
  exportBundle,
  importScenario,
  importRun,
  importBundle,
  downloadFile,
  sanitizeFilename,
  createHistory,
  addSnapshot,
  goToSnapshot,
  getCurrentSnapshot,
  clearHistory,
  saveHistory,
  loadHistory,
  exportHistory,
  importHistory,
  getHistoryStats,
  simulationHooksRegistry,
  timeAdvancementHook,
  npcRoutineHook,
  relationshipDriftHook,
  worldStateHook,
  registerBuiltinHooks,
  unregisterBuiltinHooks,
  eventLoggerPlugin,
  performanceMonitorPlugin,
  stateValidatorPlugin,
  scenarioTrackerPlugin,
  registerExamplePlugins,
  unregisterExamplePlugins,
  loadSavedRuns,
  saveSavedRuns,
  getSavedRun,
  saveSimulationRun,
  deleteSavedRun,
  updateSavedRun,
  alignSnapshotsByWorldTime,
  alignSnapshotsByIndex,
  calculateSnapshotDeltas,
  getRunSummary,
  loadScenarios,
  saveScenarios,
  getScenario,
  createScenario,
  updateScenario,
  deleteScenario,
  createDefaultScenario,
} from './lib/core';
