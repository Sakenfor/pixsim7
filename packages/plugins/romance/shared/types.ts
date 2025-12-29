/**
 * @pixsim7/plugin-romance - Shared Types
 *
 * Canonical type definitions for the romance plugin.
 * Used by both frontend and backend (Python models align with these).
 */

// =============================================================================
// Tool Types
// =============================================================================

/**
 * Available touch tool types
 */
export type TouchToolId =
  | 'touch'
  | 'caress'
  | 'feather'
  | 'silk'
  | 'temperature'
  | 'pleasure'
  | 'hand-3d';

/**
 * Touch pattern types
 */
export type TouchPattern =
  | 'circular'
  | 'linear'
  | 'spiral'
  | 'wave'
  | 'pulse'
  | 'zigzag';

/**
 * Romance stage progression
 */
export type RomanceStage =
  | 'none'
  | 'interested'
  | 'flirting'
  | 'dating'
  | 'partner';

// =============================================================================
// Request/Response Types
// =============================================================================

/**
 * Configuration for sensual touch interaction
 */
export interface SensualTouchConfig {
  /** Whether this interaction is enabled */
  enabled: boolean;
  /** Base intensity level (0-1) */
  baseIntensity: number;
  /** Duration in seconds */
  duration: number;
  /** Touch pattern to use */
  pattern: TouchPattern;
}

/**
 * Request to attempt sensual touch interaction
 */
export interface SensualTouchRequest {
  npc_id: number;
  slot_id: string;
  tool_id: TouchToolId;
  pattern: TouchPattern;
  base_intensity: number;
  duration: number;
  world_id: number | null;
  session_id: number;
}

/**
 * Response from sensual touch attempt
 */
export interface SensualTouchResponse {
  success: boolean;
  pleasure_score: number;
  arousal_change: number;
  affinity_change: number;
  tool_unlocked: string | null;
  updated_flags: Record<string, unknown>;
  message: string;
}

// =============================================================================
// NPC Preference Types
// =============================================================================

/**
 * Tool preference weights (0-1)
 */
export interface ToolPreferences {
  touch: number;
  caress: number;
  feather: number;
  silk: number;
  temperature: number;
  pleasure?: number;
}

/**
 * Pattern preference weights (0-1)
 */
export interface PatternPreferences {
  circular: number;
  linear: number;
  spiral: number;
  wave: number;
  pulse: number;
}

/**
 * NPC romance preferences profile
 */
export interface NpcRomancePreferences {
  preferred_tools: ToolPreferences;
  preferred_patterns: PatternPreferences;
  sensitivity: number;
  preferred_intensity: [number, number]; // [min, max]
  arousal_rate: number;
}

// =============================================================================
// Component Types (ECS)
// =============================================================================

/**
 * Romance ECS component data
 */
export interface RomanceComponent {
  arousal: number;
  consentLevel: number;
  stage: RomanceStage;
  unlockedTools: TouchToolId[];
  sensualTouchAttempts: SensualTouchAttempt[];
  lastInteractionAt?: number;
}

/**
 * Record of a sensual touch attempt
 */
export interface SensualTouchAttempt {
  slot_id: string;
  tool_id: TouchToolId;
  pattern: TouchPattern;
  intensity: number;
  success: boolean;
  pleasure_score: number;
  arousal_change: number;
  affinity_change: number;
}

// =============================================================================
// Tool Unlock Thresholds
// =============================================================================

/**
 * Relationship level required to unlock each tool
 */
export const TOOL_UNLOCK_LEVELS: Record<TouchToolId, number> = {
  touch: 0,
  'hand-3d': 0,
  caress: 10,
  feather: 20,
  silk: 40,
  temperature: 60,
  pleasure: 80,
};

/**
 * Check if a tool is unlocked at given affinity level
 */
export function isToolUnlocked(toolId: TouchToolId, affinity: number): boolean {
  return affinity >= (TOOL_UNLOCK_LEVELS[toolId] ?? 0);
}

/**
 * Get all tools unlocked at given affinity level
 */
export function getUnlockedTools(affinity: number): TouchToolId[] {
  const tools: TouchToolId[] = [];
  for (const toolId of Object.keys(TOOL_UNLOCK_LEVELS) as TouchToolId[]) {
    if (affinity >= TOOL_UNLOCK_LEVELS[toolId]) {
      tools.push(toolId);
    }
  }
  return tools;
}
