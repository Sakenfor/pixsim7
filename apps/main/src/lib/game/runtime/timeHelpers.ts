/**
 * Time Helpers
 *
 * Re-exports from @pixsim7/game.engine for backward compatibility.
 * New code should import directly from @pixsim7/game.engine.
 *
 * @deprecated Import from '@pixsim7/game.engine' instead
 */

export {
  // Display conversion helpers
  worldTimeDisplayToSeconds as worldTimeToSeconds,
  secondsToWorldTimeDisplay as secondsToWorldTime,
  // Turn-based helpers
  isTurnBasedMode,
  getTurnDelta,
  getCurrentTurnNumber,
  createTurnAdvanceFlags,
  // Types
  type WorldTimeDisplay,
  type TurnHistoryEntry,
} from '@pixsim7/game.engine';
