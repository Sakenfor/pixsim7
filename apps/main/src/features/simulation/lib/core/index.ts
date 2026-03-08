/**
 * Simulation Core Library Exports
 */

export {
  HeadlessSimulationRunner,
  runSimulation,
  assertions,
  runRegressionTestSuite,
  formatRegressionResults,
} from './automationAPI';
export type {
  SimulationRunConfig,
  SimulationRunResult,
  AssertionResult,
  RegressionTest,
  RegressionTestSuiteResult,
} from './automationAPI';

export {
  evaluateConstraint,
  createWorldTimeConstraint,
  createFlagConstraint,
  createNpcLocationConstraint,
  createTickCountConstraint,
  createEventConstraint,
  createCompoundConstraint,
} from './constraints';
export type {
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
} from './constraints';

export {
  exportScenario,
  exportRun,
  exportBundle,
  importScenario,
  importRun,
  importBundle,
  downloadFile,
  sanitizeFilename,
} from './exportImport';
export type { ExportBundle, ImportResult } from './exportImport';

export {
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
} from './history';
export type { SimulationSnapshot, SimulationHistory } from './history';

export {
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
} from '../../hooks';
export type {
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
} from '../../hooks';

export {
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
} from './multiRunStorage';
export type { SavedSimulationRun } from './multiRunStorage';

export {
  loadScenarios,
  saveScenarios,
  getScenario,
  createScenario,
  updateScenario,
  deleteScenario,
  createDefaultScenario,
} from './scenarios';
export type { SimulationScenario } from './scenarios';
