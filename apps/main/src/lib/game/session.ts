/**
 * Session Storage
 *
 * Re-exports from @pixsim7/game.engine for backward compatibility.
 * New code should import directly from @pixsim7/game.engine.
 *
 * @deprecated Import from '@pixsim7/game.engine' instead
 */

export {
  loadWorldSession,
  saveWorldSession,
  clearWorldSession,
  createTurnBasedSessionFlags,
  createRealTimeSessionFlags,
  type WorldSessionState,
} from '@pixsim7/game.engine';
