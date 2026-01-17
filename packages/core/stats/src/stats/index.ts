/**
 * @pixsim7/core.stats
 *
 * Consolidated stat system utilities.
 * Backend preview API is the single source of truth for stat computations.
 *
 * This package provides:
 * - Typed preview API client for stat computations
 * - Ordering and comparison helpers for tiers/levels
 */

// Preview API client
export {
  previewRelationshipTier,
  previewIntimacyLevel,
  previewDerivedStat,
  configurePreviewApi,
  resetPreviewApiConfig,
  getPreviewApiConfig,
  type PreviewApiConfig,
  type DerivedStatPreviewRequest,
  type DerivedStatPreviewResponse,
} from './previewClient';

// Ordering and comparison helpers
export {
  getRelationshipTierOrder,
  getIntimacyLevelOrder,
  compareTiers,
  compareLevels,
  levelMeetsMinimum,
  tierMeetsMinimum,
  DEFAULT_RELATIONSHIP_TIERS,
  DEFAULT_INTIMACY_LEVELS,
  DEFAULT_RELATIONSHIP_DEFINITION,
  DEFAULT_WORLD_STATS_CONFIG,
  // Relationship value helpers
  getRelationshipValue,
  normalizeRelationshipValues,
  createRelationshipValues,
} from './helpers';

// Re-export types
export type {
  StatAxis,
  StatTier,
  StatCondition,
  StatLevel,
  StatDefinition,
  WorldStatsConfig,
  RelationshipValues,
} from './helpers';

// Re-export preview request/response types from shared.types
export type {
  RelationshipTierPreviewRequest,
  RelationshipTierPreviewResponse,
  RelationshipIntimacyPreviewRequest,
  RelationshipIntimacyPreviewResponse,
} from '@pixsim7/shared.types';
