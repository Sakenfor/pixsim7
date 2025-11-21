/**
 * Client-side relationship computation helpers.
 *
 * This module is a thin re-export of the canonical implementation in
 * `@pixsim7/game.engine
 * frontend code and docs can continue to import from
 * `frontend/src/lib/game/relationshipComputation` while all logic
 * lives in the shared game-core package.
 *
 * At runtime, the backend remains authoritative for persisted
 * relationship tiers and intimacy levels; these helpers are intended
 * for previews, editor tools, and offline calculations only.
 */
export {
  compute_relationship_tier,
  compute_intimacy_level,
  extract_relationship_values,
} from '@pixsim7/game.engine';
