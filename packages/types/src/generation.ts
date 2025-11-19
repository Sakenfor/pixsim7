// Dynamic Generation System Types
// These types define configuration and runtime contracts for generation nodes and edges.

export type GenerationStrategy = 'once' | 'per_playthrough' | 'per_player' | 'always'

export interface SceneRef {
  id: string
  mood?: string
  summary?: string
  location?: string
  emotionalState?: string
}

export interface PlayerContextSnapshot {
  playthroughId?: string
  playerId?: string
  choices?: Record<string, string | number | boolean>
  flags?: Record<string, boolean>
  stats?: Record<string, number>
}

export interface DurationRule {
  min?: number // seconds
  max?: number // seconds
  target?: number // seconds
}

export interface ConstraintSet {
  rating?: 'G' | 'PG' | 'PG-13' | 'R'
  requiredElements?: string[]
  avoidElements?: string[]
  contentRules?: string[] // e.g. descriptive instructions, tags, DSL strings
}

export interface StyleRules {
  moodFrom?: string
  moodTo?: string
  pacing?: 'slow' | 'medium' | 'fast'
  transitionType?: 'gradual' | 'abrupt'
}

export interface FallbackConfig {
  mode: 'default_content' | 'skip' | 'retry' | 'placeholder'
  defaultContentId?: string
  maxRetries?: number
  timeoutMs?: number
}

export interface GenerationNodeConfig {
  generationType: 'transition' | 'variation' | 'dialogue' | 'environment' | 'npc_response'
  purpose: 'gap_fill' | 'variation' | 'adaptive' | 'ambient'
  style: StyleRules
  duration: DurationRule
  constraints: ConstraintSet
  strategy: GenerationStrategy
  seedSource?: 'playthrough' | 'player' | 'timestamp' | 'fixed'
  fallback: FallbackConfig
  templateId?: string
  enabled: boolean
  version: number
}

export interface GenerationHealthStatus {
  warnings: string[]
  errors: string[]
  lastTestedAt?: string
  latencyMsEstimate?: number
  costEstimate?: number
}

export interface GenerationNode {
  id: string
  fromScene?: SceneRef
  toScene?: SceneRef
  config: GenerationNodeConfig
  cacheKey?: string // computed from config + strategy + version
  health?: GenerationHealthStatus
}

export interface GenerationEdgeMeta {
  generate: boolean
  rules?: Partial<GenerationNodeConfig>
  fallback?: FallbackConfig
}

// ============================================================================
// Social Context for Generation (Task 09)
// ============================================================================

/**
 * Social and relationship context for generation
 *
 * Captures relationship state, intimacy level, and content rating constraints
 * for generation requests. Allows content generation to adapt to relationship
 * dynamics while respecting world and user content preferences.
 */
export interface GenerationSocialContext {
  /** Intimacy level ID from world schema (e.g., 'light_flirt', 'intimate') */
  intimacyLevelId?: string

  /** Relationship tier ID from world schema (e.g., 'friend', 'lover') */
  relationshipTierId?: string

  /** Intimacy band for content intensity (simplified buckets) */
  intimacyBand?: 'none' | 'light' | 'deep' | 'intense'

  /** Content rating for this generation */
  contentRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'

  /** World's maximum allowed content rating */
  worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'

  /** User's maximum allowed content rating (if set) */
  userMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'

  /** Raw relationship values that drove this context */
  relationshipValues?: {
    affinity?: number
    trust?: number
    chemistry?: number
    tension?: number
  }
}

// Backend Request & Response Contracts
export interface GenerateContentRequest {
  type: 'transition' | 'variation' | 'dialogue' | 'environment' | 'npc_response'
  from_scene?: SceneRef
  to_scene?: SceneRef
  style?: StyleRules
  duration?: DurationRule
  constraints?: ConstraintSet
  strategy: GenerationStrategy
  seed?: string
  fallback?: FallbackConfig
  template_id?: string
  cache_key?: string
  player_context?: PlayerContextSnapshot
  // Social context (Task 09)
  social_context?: GenerationSocialContext
  // NPC response specific params
  npc_params?: NpcResponseParams
}

export interface GeneratedContentMetadata {
  mood?: string
  tags?: string[]
  quality_score?: number
}

export interface GeneratedContentPayload {
  type: 'video' | 'dialogue' | 'choices' | 'environment' | 'npc_response'
  url?: string // video or audio asset
  duration?: number // seconds
  dialogue?: string[] // optional for dialogue
  choices?: Array<{ id: string; text: string }>
  metadata?: GeneratedContentMetadata
  // NPC response specific fields
  expression?: string
  emotion?: string
  intensity?: number
}

export interface GenerateContentResponse {
  status: 'complete' | 'queued' | 'processing' | 'failed'
  content?: GeneratedContentPayload
  cache_key?: string
  cost?: { tokens?: number; time_ms?: number }
  deterministic?: boolean
  job_id?: string // for async workflows
  error?: { code: string; message: string }
}

export interface GenerationValidationResult {
  errors: string[]
  warnings: string[]
  suggestions: string[]
}

// ============================================================================
// NPC Response Video Generation
// ============================================================================

/**
 * Parameters for NPC response video generation
 * Integrates with existing Jobs API for video generation
 */
export interface NpcResponseParams {
  // NPC Context
  npc_id: string
  npc_name: string
  npc_base_image?: string  // Base image for img2vid

  // Response Parameters (from NpcResponseEvaluator)
  expression: string       // e.g., "interested", "aroused", "giggling"
  emotion: string          // e.g., "pleased", "flustered", "excited"
  animation: string        // e.g., "idle", "giggle", "blush"
  intensity: number        // 0.0-1.0

  // Video Style
  art_style?: 'anime' | 'realistic' | 'semi-realistic'
  loras?: string[]

  // Prompt (can use prompt versioning)
  prompt?: string
  negative_prompt?: string

  // Quality preset (maps to generation speed/quality)
  quality_preset?: 'realtime' | 'fast' | 'balanced' | 'quality'

  // Generation settings (override preset defaults)
  width?: number
  height?: number
  fps?: number
  duration?: number        // seconds
  steps?: number
  cfg?: number
  seed?: number
}

/**
 * NPC response content in GeneratedContentPayload
 */
export interface NpcResponseContent {
  type: 'npc_response'
  url: string              // Video URL
  duration: number         // seconds
  expression: string
  emotion: string
  intensity: number
  metadata?: {
    quality_preset?: string
    cache_key?: string
    generation_time_ms?: number
  }
}

// Utility to compute a cache key (implementation to be provided in a util package later)
export type CacheKeyComputeFn = (node: GenerationNode, ctx?: { playthroughId?: string; playerId?: string }) => string
