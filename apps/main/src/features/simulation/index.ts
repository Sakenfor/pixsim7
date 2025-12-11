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
