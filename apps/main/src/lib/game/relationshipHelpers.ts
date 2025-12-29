/**
 * Relationship & Arc Helpers
 *
 * Re-exports from @pixsim7/game-engine for frontend use.
 * All canonical implementations are in the game-engine package.
 *
 * Helper functions for building namespaced keys and effects for relationships,
 * arcs, quests, inventory, and events. Follows conventions from
 * docs/RELATIONSHIPS_AND_ARCS.md.
 *
 * Relationships are stored in GameSession.stats.relationships as part of the
 * abstract stat system. All other data is stored in GameSession.flags as JSON,
 * avoiding new backend tables while maintaining clean semantics.
 */

// Re-export all relationship helpers from canonical location
export {
  // Key builders
  relationshipKeys,
  arcKeys,

  // Effect builders
  createRelationshipEffect,
  createRelationshipFlagEffect,
  createNpcPairEffect,
  createArcEffect,
  createQuestEffect,
  createInventoryEffect,
  createEventEffect,

  // Parsers
  parseNpcKey,
  parseNpcPairKey,
  isNpcPairKey,
  parsePlayerKey,
  isPlayerKey,
  parseNetworkKey,
  isNetworkKey,
  getStatsKeyType,
  parseArcKey,
  parseQuestKey,

  // Utilities
  formatEffect,
  validateEffect,
} from '@pixsim7/game-engine';

export type {
  EdgeEffect,
  ParsedNpcPair,
  ParsedNetworkPath,
  StatsKeyType,
} from '@pixsim7/game-engine';
