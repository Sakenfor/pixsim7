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
  generationType: 'transition' | 'variation' | 'dialogue' | 'environment'
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

// Backend Request & Response Contracts
export interface GenerateContentRequest {
  type: 'transition' | 'variation' | 'dialogue' | 'environment'
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
}

export interface GeneratedContentMetadata {
  mood?: string
  tags?: string[]
  quality_score?: number
}

export interface GeneratedContentPayload {
  type: 'video' | 'dialogue' | 'choices' | 'environment'
  url?: string // video or audio asset
  duration?: number // seconds
  dialogue?: string[] // optional for dialogue
  choices?: Array<{ id: string; text: string }>
  metadata?: GeneratedContentMetadata
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

// Utility to compute a cache key (implementation to be provided in a util package later)
export type CacheKeyComputeFn = (node: GenerationNode, ctx?: { playthroughId?: string; playerId?: string }) => string
