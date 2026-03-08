/**
 * Routine Graph Feature
 *
 * Visual editor for NPC daily routine graphs.
 * Provides time-based scheduling, conditional branching,
 * and activity assignment for NPCs.
 *
 * Uses shared infrastructure:
 * - @pixsim7/shared.graph.utilities for CRUD operations
 * - createTemporalStore for undo/redo
 * - Separate selection store pattern
 */

// Types
export type {
  ConditionSchema,
  PreferredActivity,
  ActivityEffects,
  RelationshipDelta,
  RoutineNodeType,
  TimeRange,
  RoutineNode,
  RoutineEdge,
  RoutineGraph,
  NpcPreferences,
} from './types';
export {
  formatTimeRange,
  getNodeTypeLabel,
  getNodeTypeColor,
  toBackendEdge,
  fromBackendEdge,
} from './types';

// Stores
export {
  useRoutineGraphStore,
  routineGraphSelectors,
  useRoutineGraphUndo,
  useRoutineGraphRedo,
  type RoutineGraphState,
} from './stores/routineGraphStore';

export {
  useRoutineGraphSelectionStore,
  routineGraphSelectionSelectors,
} from './stores/selectionStore';

// Components
export { RoutineGraphPanel } from './components/RoutineGraphPanel';
export { RoutineGraphSurface } from './components/RoutineGraphSurface';

// Node Renderers
export { default as TimeSlotNodeRenderer } from './components/nodes/TimeSlotNodeRenderer';
export { default as DecisionNodeRenderer } from './components/nodes/DecisionNodeRenderer';
export { default as ActivityNodeRenderer } from './components/nodes/ActivityNodeRenderer';

// Module (auto-discovered)
export { routineGraphModule } from './module';

// Page route module
export { routineGraphPageModule } from './routes';

// Service layer (load/save routines via backend)
export {
  loadRoutinesForWorld,
  saveAllRoutines,
  saveRoutine,
  removeRoutine,
  clearRoutineState,
} from './lib/routineGraphService';

// Conversion (frontend ↔ backend shape)
export {
  toBackendGraph,
  fromBackendGraph,
  fromBackendRoutines,
} from './lib/routineGraphConversion';

// Registration
export { registerRoutineGraphEditor } from './lib/registerRoutineGraphEditor';
