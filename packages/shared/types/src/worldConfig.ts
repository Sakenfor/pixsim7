/**
 * World Configuration Schemas & Types
 *
 * Zod schemas for world-level configuration stored in GameWorld.meta.
 * Provides validation, type inference, and canonical defaults.
 *
 * This is the SINGLE SOURCE OF TRUTH for:
 * - Stats configuration (relationships, skills, etc.)
 * - World manifest (turns, campaigns, plugins)
 * - Intimacy gating configuration
 * - Turn presets
 *
 * Both frontend and backend should derive their types/defaults from here.
 */

import { z } from 'zod';

// =============================================================================
// Turn Presets (Canonical Definition)
// =============================================================================

/**
 * Turn delta presets - maps preset names to seconds
 */
export const TURN_PRESET_SECONDS = {
  FIFTEEN_MINUTES: 900,
  THIRTY_MINUTES: 1800,
  ONE_HOUR: 3600,
  TWO_HOURS: 7200,
  FOUR_HOURS: 14400,
  SIX_HOURS: 21600,
  HALF_DAY: 43200,
  ONE_DAY: 86400,
  TWO_DAYS: 172800,
  ONE_WEEK: 604800,
} as const;

export type TurnPreset = keyof typeof TURN_PRESET_SECONDS;

export const TurnPresetSchema = z.enum([
  'FIFTEEN_MINUTES',
  'THIRTY_MINUTES',
  'ONE_HOUR',
  'TWO_HOURS',
  'FOUR_HOURS',
  'SIX_HOURS',
  'HALF_DAY',
  'ONE_DAY',
  'TWO_DAYS',
  'ONE_WEEK',
]);

export const DEFAULT_TURN_PRESET: TurnPreset = 'ONE_HOUR';

// =============================================================================
// Stats System Schemas
// =============================================================================

/**
 * A single numeric stat axis (e.g., affinity, strength, health)
 */
export const StatAxisSchema = z.object({
  name: z.string().min(1),
  min_value: z.number().default(0),
  max_value: z.number().default(100),
  default_value: z.number().default(0),
  display_name: z.string().optional(),
  description: z.string().optional(),
  semantic_type: z.string().optional(),
  semantic_weight: z.number().min(0).max(1).default(1.0),
});

export type StatAxis = z.infer<typeof StatAxisSchema>;

/**
 * A tier/band for a single stat axis (e.g., "friend" for affinity 40-69)
 */
export const StatTierSchema = z.object({
  id: z.string().min(1),
  axis_name: z.string().min(1),
  min: z.number(),
  max: z.number().nullable().default(null),
  display_name: z.string().optional(),
  description: z.string().optional(),
});

export type StatTier = z.infer<typeof StatTierSchema>;

/**
 * A condition for multi-axis level matching
 */
export const StatConditionSchema = z.object({
  type: z.enum(['min', 'max', 'range']),
  min_value: z.number().optional(),
  max_value: z.number().optional(),
});

export type StatCondition = z.infer<typeof StatConditionSchema>;

/**
 * A level computed from multiple stat axes (e.g., "intimate" requires high affinity + chemistry + trust)
 */
export const StatLevelSchema = z.object({
  id: z.string().min(1),
  conditions: z.record(StatConditionSchema),
  display_name: z.string().optional(),
  description: z.string().optional(),
  priority: z.number().int().default(0),
});

export type StatLevel = z.infer<typeof StatLevelSchema>;

/**
 * Complete definition of a stat system
 */
export const StatDefinitionSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().optional(),
  description: z.string().optional(),
  axes: z.array(StatAxisSchema).min(1),
  tiers: z.array(StatTierSchema).default([]),
  levels: z.array(StatLevelSchema).default([]),
});

export type StatDefinition = z.infer<typeof StatDefinitionSchema>;

/**
 * World-level stats configuration
 */
export const WorldStatsConfigSchema = z.object({
  version: z.number().int().positive().default(1),
  definitions: z.record(StatDefinitionSchema).default({}),
});

export type WorldStatsConfig = z.infer<typeof WorldStatsConfigSchema>;

// =============================================================================
// Default Relationship Stats Definition
// =============================================================================

/**
 * Default relationship tiers (matches legacy hardcoded values)
 */
export const DEFAULT_RELATIONSHIP_TIERS: StatTier[] = [
  { id: 'stranger', axis_name: 'affinity', min: 0, max: 9.99 },
  { id: 'acquaintance', axis_name: 'affinity', min: 10, max: 29.99 },
  { id: 'friend', axis_name: 'affinity', min: 30, max: 59.99 },
  { id: 'close_friend', axis_name: 'affinity', min: 60, max: 79.99 },
  { id: 'lover', axis_name: 'affinity', min: 80, max: null },
];

/**
 * Default intimacy levels (matches legacy hardcoded values)
 */
export const DEFAULT_INTIMACY_LEVELS: StatLevel[] = [
  {
    id: 'light_flirt',
    conditions: {
      affinity: { type: 'min', min_value: 20 },
      chemistry: { type: 'min', min_value: 20 },
    },
    priority: 1,
  },
  {
    id: 'deep_flirt',
    conditions: {
      affinity: { type: 'min', min_value: 40 },
      chemistry: { type: 'min', min_value: 40 },
      trust: { type: 'min', min_value: 20 },
    },
    priority: 2,
  },
  {
    id: 'intimate',
    conditions: {
      affinity: { type: 'min', min_value: 60 },
      chemistry: { type: 'min', min_value: 60 },
      trust: { type: 'min', min_value: 40 },
    },
    priority: 3,
  },
  {
    id: 'very_intimate',
    conditions: {
      affinity: { type: 'min', min_value: 80 },
      chemistry: { type: 'min', min_value: 80 },
      trust: { type: 'min', min_value: 60 },
    },
    priority: 4,
  },
  {
    id: 'soulmates',
    conditions: {
      affinity: { type: 'min', min_value: 95 },
      chemistry: { type: 'min', min_value: 95 },
      trust: { type: 'min', min_value: 90 },
      tension: { type: 'max', max_value: 10 },
    },
    priority: 5,
  },
];

/**
 * Default relationship stat definition
 */
export const DEFAULT_RELATIONSHIP_DEFINITION: StatDefinition = {
  id: 'relationships',
  display_name: 'Relationships',
  description: 'NPC relationship tracking with affinity, trust, chemistry, and tension',
  axes: [
    {
      name: 'affinity',
      min_value: 0,
      max_value: 100,
      default_value: 0,
      display_name: 'Affinity',
      description: 'Overall fondness and attraction',
      semantic_type: 'positive_sentiment',
      semantic_weight: 1.0,
    },
    {
      name: 'trust',
      min_value: 0,
      max_value: 100,
      default_value: 0,
      display_name: 'Trust',
      description: 'Reliability and confidence',
      semantic_type: 'trust_indicator',
      semantic_weight: 1.0,
    },
    {
      name: 'chemistry',
      min_value: 0,
      max_value: 100,
      default_value: 0,
      display_name: 'Chemistry',
      description: 'Physical and emotional compatibility',
      semantic_type: 'arousal_source',
      semantic_weight: 1.0,
    },
    {
      name: 'tension',
      min_value: 0,
      max_value: 100,
      default_value: 0,
      display_name: 'Tension',
      description: 'Unresolved emotional energy',
      semantic_type: 'negative_sentiment',
      semantic_weight: 1.0,
    },
  ],
  tiers: DEFAULT_RELATIONSHIP_TIERS,
  levels: DEFAULT_INTIMACY_LEVELS,
};

/**
 * Default world stats config with relationships
 */
export const DEFAULT_WORLD_STATS_CONFIG: WorldStatsConfig = {
  version: 1,
  definitions: {
    relationships: DEFAULT_RELATIONSHIP_DEFINITION,
  },
};

// =============================================================================
// Intimacy Gating Schemas
// =============================================================================

export type IntimacyBand = 'none' | 'light' | 'deep' | 'intense';

// Re-export ContentRating from narrative.ts (canonical definition)
export type { ContentRating } from './narrative';

export const IntimacyBandSchema = z.enum(['none', 'light', 'deep', 'intense']);
export const ContentRatingSchema = z.enum(['general', 'sfw', 'romantic', 'mature_implied', 'restricted']);

const IntimacyBandThresholdSchema = z.object({
  chemistry: z.number().min(0).max(100).optional(),
  affinity: z.number().min(0).max(100).optional(),
});

const ContentRatingGateSchema = z.object({
  minimumBand: IntimacyBandSchema.optional(),
  minimumChemistry: z.number().min(0).max(100).optional(),
  minimumAffinity: z.number().min(0).max(100).optional(),
  minimumLevel: z.string().optional(),
});

const InteractionGateSchema = z.object({
  minimumAffinity: z.number().min(0).max(100).optional(),
  minimumChemistry: z.number().min(0).max(100).optional(),
  minimumLevel: z.string().optional(),
  appropriateLevels: z.array(z.string()).optional(),
});

export const IntimacyGatingConfigSchema = z.object({
  version: z.number().int().positive().default(1),
  intimacyBands: z.object({
    light: IntimacyBandThresholdSchema.optional(),
    deep: IntimacyBandThresholdSchema.optional(),
    intense: IntimacyBandThresholdSchema.optional(),
  }).optional(),
  contentRatings: z.object({
    romantic: ContentRatingGateSchema.optional(),
    mature_implied: ContentRatingGateSchema.optional(),
    restricted: ContentRatingGateSchema.optional(),
  }).optional(),
  interactions: z.object({
    seduction: InteractionGateSchema.optional(),
    sensualTouch: InteractionGateSchema.optional(),
  }).optional(),
});

export type IntimacyGatingConfig = z.infer<typeof IntimacyGatingConfigSchema>;

/**
 * Default intimacy gating configuration
 */
export const DEFAULT_INTIMACY_GATING: IntimacyGatingConfig = {
  version: 1,
  intimacyBands: {
    light: { chemistry: 25, affinity: 60 },
    deep: { chemistry: 50 },
    intense: { chemistry: 70, affinity: 70 },
  },
  contentRatings: {
    romantic: {
      minimumBand: 'light',
      minimumChemistry: 25,
    },
    mature_implied: {
      minimumBand: 'deep',
      minimumChemistry: 50,
      minimumLevel: 'deep_flirt',
    },
    restricted: {
      minimumBand: 'intense',
      minimumChemistry: 70,
      minimumAffinity: 60,
      minimumLevel: 'intimate',
    },
  },
  interactions: {
    seduction: {
      minimumAffinity: 40,
      minimumChemistry: 30,
      appropriateLevels: ['light_flirt', 'deep_flirt', 'intimate', 'very_intimate'],
    },
    sensualTouch: {
      minimumAffinity: 50,
      minimumLevel: 'deep_flirt',
    },
  },
};

// =============================================================================
// World Manifest Schema
// =============================================================================

const CampaignProgressionSchema = z.object({
  campaignId: z.string(),
  status: z.enum(['not_started', 'in_progress', 'completed']),
  currentArcId: z.string().optional(),
  completedArcIds: z.array(z.string()),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export const WorldManifestSchema = z.object({
  turn_preset: TurnPresetSchema.optional(),
  enabled_arc_graphs: z.array(z.string()).optional(),
  enabled_campaigns: z.array(z.string()).optional(),
  campaign_progression: z.record(CampaignProgressionSchema).optional(),
  enabled_plugins: z.array(z.string()).optional(),
  /** ID of the gating plugin to use (e.g., 'intimacy.default') */
  gating_plugin: z.string().default('intimacy.default'),
}).passthrough(); // Allow additional custom fields

export type WorldManifestParsed = z.infer<typeof WorldManifestSchema>;

/**
 * Default world manifest
 */
export const DEFAULT_WORLD_MANIFEST: WorldManifestParsed = {
  turn_preset: 'ONE_HOUR',
  enabled_arc_graphs: [],
  enabled_campaigns: [],
  enabled_plugins: [],
  gating_plugin: 'intimacy.default',
};

// =============================================================================
// Safe Parse Utilities
// =============================================================================

/**
 * Safely parse stats config with fallback to defaults
 */
export function parseStatsConfig(raw: unknown): WorldStatsConfig {
  const result = WorldStatsConfigSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  console.warn('[WorldConfig] Invalid stats_config, using defaults:', result.error.issues);
  return DEFAULT_WORLD_STATS_CONFIG;
}

/**
 * Safely parse manifest with fallback to defaults
 */
export function parseManifest(raw: unknown): WorldManifestParsed {
  const result = WorldManifestSchema.safeParse(raw ?? {});
  if (result.success) {
    return result.data;
  }
  console.warn('[WorldConfig] Invalid manifest, using defaults:', result.error.issues);
  return DEFAULT_WORLD_MANIFEST;
}

/**
 * Safely parse intimacy gating config with fallback to defaults
 */
export function parseIntimacyGating(raw: unknown): IntimacyGatingConfig {
  if (!raw) return DEFAULT_INTIMACY_GATING;

  const result = IntimacyGatingConfigSchema.safeParse(raw);
  if (result.success) {
    // Deep merge with defaults to fill in missing fields
    return deepMergeGating(DEFAULT_INTIMACY_GATING, result.data);
  }
  console.warn('[WorldConfig] Invalid intimacy_gating, using defaults:', result.error.issues);
  return DEFAULT_INTIMACY_GATING;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface WorldConfigResponse {
  schema_version: number;
  stats_config: WorldStatsConfig;
  manifest: WorldManifestParsed;
  intimacy_gating: IntimacyGatingConfig;
  tier_order: string[];
  level_order: string[];
  merge_warnings: string[];
}

/**
 * Get turn delta seconds from preset
 */
export function getTurnDeltaFromPreset(preset: string | undefined): number {
  if (!preset) return TURN_PRESET_SECONDS[DEFAULT_TURN_PRESET];
  if (preset in TURN_PRESET_SECONDS) {
    return TURN_PRESET_SECONDS[preset as TurnPreset];
  }
  return TURN_PRESET_SECONDS[DEFAULT_TURN_PRESET];
}

// =============================================================================
// Level/Tier Ordering Utilities
// =============================================================================

/**
 * Get ordered list of relationship tier IDs (lowest to highest affinity)
 *
 * Used for comparing tiers in gating checks.
 *
 * @param statsConfig - World stats config (or use defaults)
 * @returns Array of tier IDs ordered by min affinity value
 */
export function getRelationshipTierOrder(statsConfig?: WorldStatsConfig): string[] {
  const config = statsConfig ?? DEFAULT_WORLD_STATS_CONFIG;
  const tiers = config.definitions.relationships?.tiers ?? DEFAULT_RELATIONSHIP_TIERS;

  // Sort by min value (ascending)
  return [...tiers]
    .sort((a, b) => a.min - b.min)
    .map(t => t.id);
}

/**
 * Get ordered list of intimacy level IDs (lowest to highest priority)
 *
 * Used for comparing levels in gating checks.
 * Priority field determines order (higher = more intimate).
 *
 * @param statsConfig - World stats config (or use defaults)
 * @returns Array of level IDs ordered by priority (ascending)
 */
export function getIntimacyLevelOrder(statsConfig?: WorldStatsConfig): string[] {
  const config = statsConfig ?? DEFAULT_WORLD_STATS_CONFIG;
  const levels = config.definitions.relationships?.levels ?? DEFAULT_INTIMACY_LEVELS;

  // Sort by priority (ascending)
  return [...levels]
    .sort((a, b) => a.priority - b.priority)
    .map(l => l.id);
}

/**
 * Compare two tier IDs
 *
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareTiers(
  tierA: string | undefined,
  tierB: string | undefined,
  statsConfig?: WorldStatsConfig
): number {
  if (!tierA && !tierB) return 0;
  if (!tierA) return -1;
  if (!tierB) return 1;

  const order = getRelationshipTierOrder(statsConfig);
  const indexA = order.indexOf(tierA);
  const indexB = order.indexOf(tierB);

  // Unknown tiers sort to the end
  if (indexA === -1 && indexB === -1) return 0;
  if (indexA === -1) return 1;
  if (indexB === -1) return -1;

  return indexA - indexB;
}

/**
 * Compare two intimacy level IDs
 *
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareLevels(
  levelA: string | undefined | null,
  levelB: string | undefined | null,
  statsConfig?: WorldStatsConfig
): number {
  if (!levelA && !levelB) return 0;
  if (!levelA) return -1;
  if (!levelB) return 1;

  const order = getIntimacyLevelOrder(statsConfig);
  const indexA = order.indexOf(levelA);
  const indexB = order.indexOf(levelB);

  // Unknown levels sort to the end
  if (indexA === -1 && indexB === -1) return 0;
  if (indexA === -1) return 1;
  if (indexB === -1) return -1;

  return indexA - indexB;
}

/**
 * Check if a level meets a minimum requirement
 */
export function levelMeetsMinimum(
  currentLevel: string | undefined | null,
  minimumLevel: string,
  statsConfig?: WorldStatsConfig
): boolean {
  if (!currentLevel) return false;
  return compareLevels(currentLevel, minimumLevel, statsConfig) >= 0;
}

/**
 * Check if a tier meets a minimum requirement
 */
export function tierMeetsMinimum(
  currentTier: string | undefined,
  minimumTier: string,
  statsConfig?: WorldStatsConfig
): boolean {
  if (!currentTier) return false;
  return compareTiers(currentTier, minimumTier, statsConfig) >= 0;
}

// =============================================================================
// Utility: Deep Merge for Gating Config
// =============================================================================

function deepMergeGating(
  defaults: IntimacyGatingConfig,
  overrides: Partial<IntimacyGatingConfig>
): IntimacyGatingConfig {
  return {
    version: overrides.version ?? defaults.version,
    intimacyBands: {
      light: { ...defaults.intimacyBands?.light, ...overrides.intimacyBands?.light },
      deep: { ...defaults.intimacyBands?.deep, ...overrides.intimacyBands?.deep },
      intense: { ...defaults.intimacyBands?.intense, ...overrides.intimacyBands?.intense },
    },
    contentRatings: {
      romantic: { ...defaults.contentRatings?.romantic, ...overrides.contentRatings?.romantic },
      mature_implied: { ...defaults.contentRatings?.mature_implied, ...overrides.contentRatings?.mature_implied },
      restricted: { ...defaults.contentRatings?.restricted, ...overrides.contentRatings?.restricted },
    },
    interactions: {
      seduction: { ...defaults.interactions?.seduction, ...overrides.interactions?.seduction },
      sensualTouch: { ...defaults.interactions?.sensualTouch, ...overrides.interactions?.sensualTouch },
    },
  };
}
