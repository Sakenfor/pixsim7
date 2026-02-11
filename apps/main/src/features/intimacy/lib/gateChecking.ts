/**
 * Gate Checking Utilities
 *
 * Thin re-export from @pixsim7/game.engine.
 * All pure logic lives in the engine package.
 *
 * @see packages/game/engine/src/intimacy/gateChecking.ts
 */

export {
  checkGate,
  checkAllGates,
  createDefaultState,
  createStateFromTier,
  getTierLevel,
  getIntimacyLevel,
  TIER_HIERARCHY,
  INTIMACY_HIERARCHY,
  type SimulatedRelationshipState,
} from '@pixsim7/game.engine';

// Re-export GateCheckResult type from shared types
export type { GateCheckResult } from '@pixsim7/shared.types';
