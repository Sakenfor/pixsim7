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
 * Data source for a stat definition
 *
 * - session.relationships: NPC relationship state from GameSession
 * - persona.traits: Personality traits from NpcPersonaProvider
 * - session.stats: Generic stats stored in session.stats[defId]
 * - derived: Computed from another stat using derivation config
 */
export const StatSourceSchema = z.enum([
  'session.relationships',
  'persona.traits',
  'session.stats',
  'derived',
]);

export type StatSource = z.infer<typeof StatSourceSchema>;

/**
 * Derivation configuration for derived stats
 */
export const StatDerivationSchema = z.object({
  /** Stat definition ID to derive from (e.g., 'relationships') */
  input: z.string(),
  /** Derivation strategy */
  strategy: z.enum(['semantic']),
});

export type StatDerivation = z.infer<typeof StatDerivationSchema>;

/**
 * Complete definition of a stat system
 */
export const StatDefinitionSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().optional(),
  description: z.string().optional(),
  /** Data source for this stat */
  source: StatSourceSchema.default('session.stats'),
  /** Derivation config (required when source is 'derived') */
  derivation: StatDerivationSchema.optional(),
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
  source: 'session.relationships',
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
 * Default personality stat definition
 */
export const DEFAULT_PERSONALITY_DEFINITION: StatDefinition = {
  id: 'personality',
  display_name: 'Personality',
  description: 'NPC personality traits from persona',
  source: 'persona.traits',
  axes: [
    {
      name: 'extraversion',
      min_value: 0,
      max_value: 100,
      default_value: 50,
      display_name: 'Extraversion',
      description: 'Outgoing vs reserved',
      semantic_type: 'social_energy',
      semantic_weight: 1.0,
    },
    {
      name: 'agreeableness',
      min_value: 0,
      max_value: 100,
      default_value: 50,
      display_name: 'Agreeableness',
      description: 'Cooperative vs competitive',
      semantic_type: 'cooperation',
      semantic_weight: 1.0,
    },
    {
      name: 'openness',
      min_value: 0,
      max_value: 100,
      default_value: 50,
      display_name: 'Openness',
      description: 'Curious vs cautious',
      semantic_type: 'curiosity',
      semantic_weight: 1.0,
    },
  ],
  tiers: [],
  levels: [],
};

/**
 * Default mood stat definition (derived from relationships)
 */
export const DEFAULT_MOOD_DEFINITION: StatDefinition = {
  id: 'mood',
  display_name: 'Mood',
  description: 'NPC emotional state derived from relationship values',
  source: 'derived',
  derivation: {
    input: 'relationships',
    strategy: 'semantic',
  },
  axes: [
    {
      name: 'valence',
      min_value: 0,
      max_value: 100,
      default_value: 50,
      display_name: 'Valence',
      description: 'Positive vs negative emotional state',
      semantic_type: 'positive_sentiment',
      semantic_weight: 1.0,
    },
    {
      name: 'arousal',
      min_value: 0,
      max_value: 100,
      default_value: 50,
      display_name: 'Arousal',
      description: 'High vs low energy emotional state',
      semantic_type: 'arousal_source',
      semantic_weight: 1.0,
    },
  ],
  tiers: [],
  levels: [
    { id: 'excited', conditions: { valence: { type: 'min', min_value: 70 }, arousal: { type: 'min', min_value: 70 } }, priority: 8 },
    { id: 'happy', conditions: { valence: { type: 'min', min_value: 60 }, arousal: { type: 'min', min_value: 50 } }, priority: 7 },
    { id: 'content', conditions: { valence: { type: 'min', min_value: 70 }, arousal: { type: 'max', max_value: 30 } }, priority: 6 },
    { id: 'calm', conditions: { valence: { type: 'min', min_value: 60 }, arousal: { type: 'max', max_value: 40 } }, priority: 5 },
    { id: 'anxious', conditions: { valence: { type: 'max', max_value: 40 }, arousal: { type: 'min', min_value: 70 } }, priority: 4 },
    { id: 'angry', conditions: { valence: { type: 'max', max_value: 30 }, arousal: { type: 'min', min_value: 80 } }, priority: 3 },
    { id: 'sad', conditions: { valence: { type: 'max', max_value: 30 }, arousal: { type: 'max', max_value: 40 } }, priority: 2 },
    { id: 'bored', conditions: { valence: { type: 'max', max_value: 40 }, arousal: { type: 'max', max_value: 30 } }, priority: 1 },
  ],
};

/**
 * Default world stats config with relationships, personality, and mood
 */
export const DEFAULT_WORLD_STATS_CONFIG: WorldStatsConfig = {
  version: 1,
  definitions: {
    relationships: DEFAULT_RELATIONSHIP_DEFINITION,
    personality: DEFAULT_PERSONALITY_DEFINITION,
    mood: DEFAULT_MOOD_DEFINITION,
  },
};

// =============================================================================
// Intimacy Gating Schemas
// =============================================================================

export type IntimacyBand = 'none' | 'light' | 'deep' | 'intense';

// Re-export ContentRating from narrative.ts (canonical definition)
export type { ContentRating } from './narrative';

export const IntimacyBandSchema = z.enum(['none', 'light', 'deep', 'intense']);
export const ContentRatingSchema = z.enum(['sfw', 'romantic', 'mature_implied', 'restricted']);

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
// World Time Configuration Schemas
// =============================================================================

/**
 * A named time period with hour boundaries.
 * Supports wrapping (night: 21-5 means 21:00 to 05:00 next day).
 *
 * For fantasy worlds, hours can exceed 24 (e.g., 30-hour days).
 * The startHour/endHour values are relative to the world's hoursPerDay.
 */
export const TimePeriodDefinitionSchema = z.object({
  /** Canonical period ID (e.g., "morning", "witching_hour") */
  id: z.string().min(1),
  /** Display name for UI (e.g., "Morning", "The Witching Hour") */
  displayName: z.string().min(1),
  /** Start hour (0 to hoursPerDay-1) */
  startHour: z.number().int().min(0),
  /** End hour - can wrap around (e.g., night: 21-5) */
  endHour: z.number().int().min(0),
  /**
   * Aliases for template portability.
   * Standard templates can use "day" or "night" which map to world-specific periods.
   * Example: witching_hour.aliases = ["night", "nighttime"] means templates
   * using `time.period: "night"` will match during witching_hour.
   */
  aliases: z.array(z.string()).optional(),
  /** UI color hint (hex or CSS color) */
  color: z.string().optional(),
  /** Reference to ambient preset (lighting, audio) */
  ambientPreset: z.string().optional(),
});

export type TimePeriodDefinition = z.infer<typeof TimePeriodDefinitionSchema>;

/**
 * A named day in the world's week.
 * For fantasy worlds, weeks can have any number of days.
 */
export const DayDefinitionSchema = z.object({
  /** Canonical day ID (e.g., "monday", "bloodmoon") */
  id: z.string().min(1),
  /** Display name for UI (e.g., "Monday", "Bloodmoon") */
  displayName: z.string().min(1),
  /** 0-indexed position in week (must be < daysPerWeek) */
  index: z.number().int().min(0),
  /** Whether this is a rest day (affects NPC schedules, shop availability) */
  isRestDay: z.boolean().optional(),
  /** Special flags for this day (e.g., "market_day", "magic_amplified") */
  specialFlags: z.array(z.string()).optional(),
});

export type DayDefinition = z.infer<typeof DayDefinitionSchema>;

/**
 * Configuration for time context paths in link activation.
 * Defines where time values are placed in the context object.
 */
export const TimeContextPathsSchema = z.object({
  /** Path for current period ID (default: "time.period") */
  period: z.string().default('time.period'),
  /** Path for current hour (default: "time.hour") */
  hour: z.string().default('time.hour'),
  /** Path for day of week index (default: "time.dayOfWeek") */
  dayOfWeek: z.string().default('time.dayOfWeek'),
  /** Path for day name/ID (default: "time.dayName") */
  dayName: z.string().default('time.dayName'),
  /** Path for current minute (default: "time.minute") */
  minute: z.string().default('time.minute'),
});

export type TimeContextPaths = z.infer<typeof TimeContextPathsSchema>;

/**
 * Complete world time configuration.
 *
 * Allows full customization of time structure for fantasy/sci-fi settings:
 * - Custom hours per day (24, 30, 20, etc.)
 * - Custom days per week (7, 10, 5, etc.)
 * - Custom period definitions with aliases
 * - Custom day names and special flags
 *
 * Template portability is maintained through period aliases:
 * - Templates use standard terms ("day", "night", "morning")
 * - Worlds define which of their periods match these aliases
 */
export const WorldTimeConfigSchema = z.object({
  /** Schema version for migrations */
  version: z.number().int().positive().default(1),

  // === Time Structure ===
  /** Seconds per minute (default: 60, rarely changed) */
  secondsPerMinute: z.number().int().positive().default(60),
  /** Minutes per hour (default: 60, rarely changed) */
  minutesPerHour: z.number().int().positive().default(60),
  /** Hours per day (default: 24, fantasy: 30, 20, etc.) */
  hoursPerDay: z.number().int().positive().default(24),
  /** Days per week (default: 7, fantasy: 10, 5, etc.) */
  daysPerWeek: z.number().int().positive().default(7),

  // === Period Definitions ===
  /** Time period definitions (morning, afternoon, etc.) */
  periods: z.array(TimePeriodDefinitionSchema).default([]),

  // === Day Definitions ===
  /** Day definitions (Monday, Tuesday, etc.) */
  days: z.array(DayDefinitionSchema).default([]),

  // === Display Preferences ===
  /** Use 24-hour format (true) or 12-hour with AM/PM (false) */
  use24HourFormat: z.boolean().default(true),
  /**
   * Date/time format string.
   * Placeholders: {dayName}, {dayDisplayName}, {hour}, {minute}, {periodName}, {periodDisplayName}
   */
  dateFormat: z.string().default('{dayName}, {hour}:{minute}'),

  // === Semantic Aliases (Template Portability) ===
  /**
   * Maps standard period terms to world-specific period IDs.
   * Format: aliasName -> "periodId1|periodId2|..."
   * Example: { "day": "morning|afternoon", "night": "evening|night" }
   *
   * When a template uses `time.period: "day"`, it matches any period
   * listed in the "day" alias.
   */
  periodAliases: z.record(z.string()).default({}),

  // === Link System Integration ===
  /** Paths where time values are placed in context for link activation */
  timeContextPaths: TimeContextPathsSchema.default({}),
});

export type WorldTimeConfig = z.infer<typeof WorldTimeConfigSchema>;

// =============================================================================
// Default Time Period Definitions
// =============================================================================

/**
 * Default time periods (matches common expectations)
 * Note: These boundaries are now configurable per-world
 */
export const DEFAULT_TIME_PERIODS: TimePeriodDefinition[] = [
  {
    id: 'dawn',
    displayName: 'Dawn',
    startHour: 5,
    endHour: 7,
    aliases: ['early_morning'],
    color: '#FFE4B5',
  },
  {
    id: 'morning',
    displayName: 'Morning',
    startHour: 7,
    endHour: 12,
    aliases: ['day', 'daytime'],
    color: '#87CEEB',
  },
  {
    id: 'afternoon',
    displayName: 'Afternoon',
    startHour: 12,
    endHour: 17,
    aliases: ['day', 'daytime'],
    color: '#F0E68C',
  },
  {
    id: 'evening',
    displayName: 'Evening',
    startHour: 17,
    endHour: 21,
    aliases: ['dusk'],
    color: '#DDA0DD',
  },
  {
    id: 'night',
    displayName: 'Night',
    startHour: 21,
    endHour: 5, // Wraps to next day
    aliases: ['nighttime'],
    color: '#191970',
  },
];

/**
 * Default day definitions (standard week)
 */
export const DEFAULT_DAYS: DayDefinition[] = [
  { id: 'monday', displayName: 'Monday', index: 0 },
  { id: 'tuesday', displayName: 'Tuesday', index: 1 },
  { id: 'wednesday', displayName: 'Wednesday', index: 2 },
  { id: 'thursday', displayName: 'Thursday', index: 3 },
  { id: 'friday', displayName: 'Friday', index: 4 },
  { id: 'saturday', displayName: 'Saturday', index: 5, isRestDay: true },
  { id: 'sunday', displayName: 'Sunday', index: 6, isRestDay: true },
];

/**
 * Default period aliases for template portability.
 * Templates using these standard terms will work across worlds.
 */
export const DEFAULT_PERIOD_ALIASES: Record<string, string> = {
  day: 'dawn|morning|afternoon',
  night: 'evening|night',
  daytime: 'morning|afternoon',
  nighttime: 'evening|night',
  early_morning: 'dawn',
  dusk: 'evening',
};

/**
 * Default world time configuration (24-hour day, 7-day week)
 */
export const DEFAULT_WORLD_TIME_CONFIG: WorldTimeConfig = {
  version: 1,
  secondsPerMinute: 60,
  minutesPerHour: 60,
  hoursPerDay: 24,
  daysPerWeek: 7,
  periods: DEFAULT_TIME_PERIODS,
  days: DEFAULT_DAYS,
  use24HourFormat: true,
  dateFormat: '{dayName}, {hour}:{minute}',
  periodAliases: DEFAULT_PERIOD_ALIASES,
  timeContextPaths: {
    period: 'time.period',
    hour: 'time.hour',
    dayOfWeek: 'time.dayOfWeek',
    dayName: 'time.dayName',
    minute: 'time.minute',
  },
};

// =============================================================================
// Time Utility Functions
// =============================================================================

/**
 * Check if an hour falls within a period range, handling wrap-around.
 * @param hour - Current hour (0 to hoursPerDay-1)
 * @param startHour - Period start hour
 * @param endHour - Period end hour (can wrap)
 * @param hoursPerDay - Total hours in a day
 * @returns True if hour is within the period
 */
export function isHourInPeriod(
  hour: number,
  startHour: number,
  endHour: number,
  hoursPerDay: number
): boolean {
  // Normalize hour to valid range
  const normalizedHour = ((hour % hoursPerDay) + hoursPerDay) % hoursPerDay;

  if (startHour <= endHour) {
    // Simple range (e.g., morning: 7-12)
    return normalizedHour >= startHour && normalizedHour < endHour;
  } else {
    // Wrapping range (e.g., night: 21-5)
    return normalizedHour >= startHour || normalizedHour < endHour;
  }
}

/**
 * Find the current period for a given hour.
 * @param hour - Current hour (0 to hoursPerDay-1)
 * @param periods - Period definitions
 * @param hoursPerDay - Total hours in a day
 * @returns Matching period or undefined
 */
export function findPeriodForHour(
  hour: number,
  periods: TimePeriodDefinition[],
  hoursPerDay: number
): TimePeriodDefinition | undefined {
  return periods.find((period) =>
    isHourInPeriod(hour, period.startHour, period.endHour, hoursPerDay)
  );
}

/**
 * Find a day definition by index.
 * @param dayOfWeek - Day index (0 to daysPerWeek-1)
 * @param days - Day definitions
 * @returns Matching day or undefined
 */
export function findDayForIndex(
  dayOfWeek: number,
  days: DayDefinition[]
): DayDefinition | undefined {
  return days.find((day) => day.index === dayOfWeek);
}

/**
 * Check if a period ID matches a target (including aliases).
 * @param actualPeriodId - Current period ID
 * @param targetPeriodOrAlias - Target period ID or alias
 * @param config - World time config (for aliases)
 * @returns True if matches
 */
export function periodMatchesTarget(
  actualPeriodId: string,
  targetPeriodOrAlias: string,
  config: WorldTimeConfig
): boolean {
  // Direct match
  if (actualPeriodId === targetPeriodOrAlias) {
    return true;
  }

  // Check if target is an alias
  const aliasedPeriods = config.periodAliases[targetPeriodOrAlias];
  if (aliasedPeriods) {
    const periodIds = aliasedPeriods.split('|');
    if (periodIds.includes(actualPeriodId)) {
      return true;
    }
  }

  // Check if actual period has target as an alias
  const actualPeriod = config.periods.find((p) => p.id === actualPeriodId);
  if (actualPeriod?.aliases?.includes(targetPeriodOrAlias)) {
    return true;
  }

  return false;
}

/**
 * Parse raw seconds into time components using world time config.
 * @param worldTimeSeconds - Raw world time in seconds
 * @param config - World time config
 * @returns Parsed time components
 */
export function parseWorldTimeWithConfig(
  worldTimeSeconds: number,
  config: WorldTimeConfig = DEFAULT_WORLD_TIME_CONFIG
): {
  dayOfWeek: number;
  hour: number;
  minute: number;
  second: number;
  period: TimePeriodDefinition | undefined;
  day: DayDefinition | undefined;
} {
  const secondsPerMinute = config.secondsPerMinute;
  const secondsPerHour = secondsPerMinute * config.minutesPerHour;
  const secondsPerDay = secondsPerHour * config.hoursPerDay;
  const secondsPerWeek = secondsPerDay * config.daysPerWeek;

  // Normalize to week cycle
  const weekSeconds = ((worldTimeSeconds % secondsPerWeek) + secondsPerWeek) % secondsPerWeek;

  const dayOfWeek = Math.floor(weekSeconds / secondsPerDay);
  const daySeconds = weekSeconds % secondsPerDay;
  const hour = Math.floor(daySeconds / secondsPerHour);
  const hourSeconds = daySeconds % secondsPerHour;
  const minute = Math.floor(hourSeconds / secondsPerMinute);
  const second = hourSeconds % secondsPerMinute;

  const period = findPeriodForHour(hour, config.periods, config.hoursPerDay);
  const day = findDayForIndex(dayOfWeek, config.days);

  return { dayOfWeek, hour, minute, second, period, day };
}

/**
 * Build time context object for link activation.
 * @param worldTimeSeconds - Raw world time in seconds
 * @param config - World time config
 * @returns Context object with time values at configured paths
 */
export function buildTimeContext(
  worldTimeSeconds: number,
  config: WorldTimeConfig = DEFAULT_WORLD_TIME_CONFIG
): Record<string, unknown> {
  const parsed = parseWorldTimeWithConfig(worldTimeSeconds, config);

  return {
    time: {
      period: parsed.period?.id ?? 'unknown',
      periodDisplayName: parsed.period?.displayName ?? 'Unknown',
      hour: parsed.hour,
      minute: parsed.minute,
      second: parsed.second,
      dayOfWeek: parsed.dayOfWeek,
      dayName: parsed.day?.id ?? `day_${parsed.dayOfWeek}`,
      dayDisplayName: parsed.day?.displayName ?? `Day ${parsed.dayOfWeek}`,
      dayFlags: parsed.day?.specialFlags ?? [],
      isRestDay: parsed.day?.isRestDay ?? false,
      rawSeconds: worldTimeSeconds,
    },
  };
}

/**
 * Calculate derived time constants from config.
 * @param config - World time config
 * @returns Time constants
 */
export function getTimeConstants(config: WorldTimeConfig = DEFAULT_WORLD_TIME_CONFIG) {
  const secondsPerMinute = config.secondsPerMinute;
  const secondsPerHour = secondsPerMinute * config.minutesPerHour;
  const secondsPerDay = secondsPerHour * config.hoursPerDay;
  const secondsPerWeek = secondsPerDay * config.daysPerWeek;

  return {
    secondsPerMinute,
    secondsPerHour,
    secondsPerDay,
    secondsPerWeek,
    hoursPerDay: config.hoursPerDay,
    daysPerWeek: config.daysPerWeek,
    minutesPerHour: config.minutesPerHour,
  };
}

// =============================================================================
// API Response Types
// =============================================================================

export interface WorldConfigResponse {
  schema_version: number;
  stats_config: WorldStatsConfig;
  manifest: WorldManifestParsed;
  intimacy_gating: IntimacyGatingConfig;
  time_config: WorldTimeConfig;
  tier_order: string[];
  level_order: string[];
  merge_warnings: string[];
}
