/**
 * @pixsim7/shared.logic-core
 *
 * Shared runtime logic (content rating, prompts, character graphs, links).
 *
 * Note: Core game logic has been moved to packages/core/*:
 * - @pixsim7/core.brain - NPC cognitive modeling
 * - @pixsim7/core.stats - Statistics engine
 * - @pixsim7/core.world - World configuration
 * - @pixsim7/core.game - Game helpers
 * - @pixsim7/core.scene-composition - Scene composition
 */

export * from './contentRating';
export * from './prompt';
export * from './characterGraph';
export * from './links';
