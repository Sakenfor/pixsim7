/**
 * Client-side relationship computation helpers.
 *
 * This module re-exports from the consolidated stat system packages:
 * - Preview API from @pixsim7/shared.logic-core/stats (backend is source of truth)
 * - Value extraction from @pixsim7/game.engine
 *
 * At runtime, the backend remains authoritative for persisted
 * relationship tiers and intimacy levels; these helpers are intended
 * for previews, editor tools, and offline calculations only.
 */

// Preview API (use this for computing tiers/levels)
export {
  previewRelationshipTier,
  previewIntimacyLevel,
  configurePreviewApi,
} from '@pixsim7/shared.logic-core/stats';

// Value extraction from session state
export { extract_relationship_values } from '@pixsim7/game.engine';

// Helpers for ordering/comparison
export {
  compareTiers,
  compareLevels,
  levelMeetsMinimum,
  tierMeetsMinimum,
} from '@pixsim7/shared.logic-core/stats';
