/**
 * Type definitions and interfaces for generation system
 * All types from generationIntegration.ts
 */

import type {
  GameSessionDTO,
  NarrativeNode,
  NarrativeProgram,
  NarrativeRuntimeState,
  ActionBlockNode,
  StateEffects,
} from '@pixsim7/shared.types';

import type {
  GenerationStrategy,
  GenerationSocialContext,
  GenerateContentRequest,
  GenerateContentResponse,
  GenerationNodeConfig,
  StyleRules,
  DurationRule,
  ConstraintSet,
  FallbackConfig,
  ImageCompositionRole,
  CompositionAsset,
  AssetRequest,
  Asset,
} from '@pixsim7/shared.types';

// =============================================================================
// Generation Strategy Types
// =============================================================================

// =============================================================================
// Generation Strategy Types
// =============================================================================

/**
 * Extended generation strategy for narrative nodes.
 * Controls when to generate new content vs use existing pool.
 *
 * Core strategies:
 * - generate_new: Always generate fresh content
 * - pool_only: Only use pre-generated pool content
 * - pool_fallback: Try pool first, generate if not found
 * - generate_fallback: Generate first, fallback to pool on error
 * - dynamic: Evaluate at runtime based on conditions
 *
 * Explicit workflow strategies (for specific generation behaviors):
 * - extend_video: Extend existing video with additional content
 * - regen_simple: Simple regeneration with minimal parameters
 * - regen_with_context: Regeneration preserving narrative context
 * - refine_result: Refine/improve previous generation output
 */
export type NarrativeGenerationStrategy =
  | 'generate_new'        // Always generate fresh content
  | 'pool_only'           // Only use pre-generated pool content
  | 'pool_fallback'       // Try pool first, generate if not found
  | 'generate_fallback'   // Generate first, fallback to pool on error
  | 'dynamic'             // Evaluate at runtime based on conditions
  // Explicit workflow strategies
  | 'extend_video'        // Extend existing video with additional frames
  | 'regen_simple'        // Simple regeneration with minimal context
  | 'regen_with_context'  // Regeneration preserving full narrative context
  | 'refine_result';      // Refine/improve previous generation output

/**
 * Pool selection criteria for finding cached content.
 */
export interface PoolSelectionCriteria {
  /** Required tags on pool content */
  tags?: string[];
  /** Excluded tags */
  excludeTags?: string[];
  /** Minimum quality score */
  minQuality?: number;
  /** Location filter */
  location?: string;
  /** Pose/animation filter */
  pose?: string;
  /** Intimacy level filter */
  intimacyLevel?: string;
  /** Mood filter */
  mood?: string;
  /** Maximum duration in seconds */
  maxDuration?: number;
  /** Custom filter function name (for plugins) */
  customFilter?: string;
}

/**
 * Dynamic strategy evaluation context.
 * Used when strategy is 'dynamic' to determine actual behavior.
 */
export interface DynamicStrategyContext {
  /** Session state for condition evaluation */
  session: GameSessionDTO;
  /** Current NPC */
  npcId: number;
  /** Program variables */
  variables: Record<string, any>;
  /** World generation config */
  worldConfig?: WorldGenerationOverrides;
  /** Player preferences */
  playerPrefs?: PlayerGenerationPrefs;
}

/**
 * Dynamic strategy evaluator function signature.
 * Returns the actual strategy to use based on context.
 */
export type DynamicStrategyEvaluator = (
  context: DynamicStrategyContext
) => NarrativeGenerationStrategy;

/**
 * Generation configuration for narrative nodes.
 * Can be attached to ActionBlockNode or edges.
 */
export interface NarrativeGenerationConfig {
  /** Strategy for content sourcing */
  strategy: NarrativeGenerationStrategy;

  /** Condition expression for dynamic strategy (when strategy is 'dynamic') */
  dynamicCondition?: string;

  /** Pool selection criteria */
  poolCriteria?: PoolSelectionCriteria;

  /** Generation request parameters (when generating) */
  generationParams?: Partial<GenerateContentRequest>;

  /** Fallback behavior on generation failure */
  fallback?: FallbackConfig;

  /** Whether modders can override this config */
  modderOverridable?: boolean;

  /** Whether players can adjust (e.g., quality slider) */
  playerAdjustable?: boolean;

  /** Custom metadata for plugins */
  meta?: Record<string, any>;
}
// =============================================================================
// World & Player Configuration
// =============================================================================

/**
 * World-level generation overrides.
 * Set by world creator, can be modified by modders.
 */
export interface WorldGenerationOverrides {
  /** Default strategy for all nodes */
  defaultStrategy?: NarrativeGenerationStrategy;

  /** Force all generation to use pool (e.g., for demos) */
  forcePoolOnly?: boolean;

  /** Disable generation entirely */
  generationDisabled?: boolean;

  /** Maximum content rating */
  maxContentRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';

  /** Default style rules */
  defaultStyle?: StyleRules;

  /** Default constraints */
  defaultConstraints?: ConstraintSet;

  /** Per-node type overrides */
  nodeTypeOverrides?: Record<string, Partial<NarrativeGenerationConfig>>;
}

/**
 * Player-level generation preferences.
 * Adjusted by player in settings.
 */
export interface PlayerGenerationPrefs {
  /** Prefer pool content (faster) over generation */
  preferPool?: boolean;

  /** Quality preference (affects generation params) */
  qualityLevel?: 'fast' | 'balanced' | 'quality';

  /** Max wait time for generation before fallback (ms) */
  maxWaitMs?: number;

  /** Content rating preference */
  contentRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted';
}
// =============================================================================
// Generation Service Interface
// =============================================================================

/**
 * Content from pool lookup.
 */
export interface PoolContent {
  /** Content identifier */
  id: string;
  /** Content URL */
  url: string;
  /** Content type */
  type: 'video' | 'image' | 'audio';
  /** Duration in seconds (for video/audio) */
  duration?: number;
  /** Tags for filtering */
  tags?: string[];
  /** Quality score (0-1) */
  quality?: number;
  /** Metadata */
  meta?: Record<string, any>;
}

/**
 * Abstract interface for content pool access.
 * Implement to provide cached/pre-generated content.
 */
export interface ContentPoolProvider {
  /**
   * Find content matching criteria.
   *
   * @param criteria - Selection criteria
   * @param limit - Maximum results to return
   * @returns Matching content items
   */
  find(criteria: PoolSelectionCriteria, limit?: number): Promise<PoolContent[]>;

  /**
   * Get specific content by ID.
   *
   * @param id - Content ID
   * @returns Content or undefined if not found
   */
  get(id: string): Promise<PoolContent | undefined>;

  /**
   * Check if pool has content matching criteria.
   *
   * @param criteria - Selection criteria
   * @returns True if matching content exists
   */
  has(criteria: PoolSelectionCriteria): Promise<boolean>;
}

/**
 * Generation job handle for async tracking.
 */
export interface GenerationJob {
  /** Job ID */
  id: string;
  /** Current status */
  status: 'queued' | 'processing' | 'complete' | 'failed';
  /** Progress (0-1) */
  progress?: number;
  /** Result when complete */
  result?: GenerateContentResponse;
  /** Error if failed */
  error?: { code: string; message: string };
}

/**
 * Abstract interface for generation service.
 * Implement to connect to your generation backend.
 */
export interface GenerationService {
  /**
   * Generate content synchronously.
   *
   * @param request - Generation request
   * @returns Generation response
   */
  generate(request: GenerateContentRequest): Promise<GenerateContentResponse>;

  /**
   * Queue generation for async processing.
   *
   * @param request - Generation request
   * @returns Job handle for tracking
   */
  queueGeneration(request: GenerateContentRequest): Promise<GenerationJob>;

  /**
   * Check status of queued job.
   *
   * @param jobId - Job ID from queueGeneration
   * @returns Current job status
   */
  getJobStatus(jobId: string): Promise<GenerationJob>;

  /**
   * Cancel a queued job.
   *
   * @param jobId - Job ID to cancel
   * @returns True if successfully cancelled
   */
  cancelJob(jobId: string): Promise<boolean>;

  /**
   * Check if service is available.
   *
   * @returns True if service can accept requests
   */
  isAvailable(): Promise<boolean>;
}
// =============================================================================
// Executor Hooks
// =============================================================================

/**
 * Context passed to generation hooks.
 */
export interface GenerationHookContext {
  /** Current node */
  node: NarrativeNode;
  /** Full program */
  program: NarrativeProgram;
  /** Session state */
  session: GameSessionDTO;
  /** Runtime state */
  state: NarrativeRuntimeState;
  /** NPC ID */
  npcId: number;
  /** Resolved generation config */
  generationConfig: NarrativeGenerationConfig;
  /** Social context for generation */
  socialContext?: GenerationSocialContext;
}

/**
 * Result from generation hook.
 */
export interface GenerationHookResult {
  /** Content to use (if resolved) */
  content?: PoolContent | GenerateContentResponse['content'];
  /** Updated session (if modified) */
  session?: GameSessionDTO;
  /** Job ID if async generation started */
  jobId?: string;
  /** Whether to skip default handling */
  handled?: boolean;
  /** Error if generation failed */
  error?: string;
}

/**
 * Hooks for generation lifecycle events.
 * Register with executor to intercept generation.
 */
export interface GenerationHooks {
  /**
   * Called before generation starts.
   * Can modify config or skip generation.
   */
  beforeGeneration?: (context: GenerationHookContext) => Promise<GenerationHookResult | void>;

  /**
   * Called to resolve content (pool or generate).
   * Default implementation uses bridge logic.
   */
  resolveContent?: (context: GenerationHookContext) => Promise<GenerationHookResult>;

  /**
   * Called after content is resolved.
   * Can transform or validate content.
   */
  afterGeneration?: (
    context: GenerationHookContext,
    result: GenerationHookResult
  ) => Promise<GenerationHookResult>;

  /**
   * Called when generation fails.
   * Can provide fallback content.
   */
  onGenerationError?: (
    context: GenerationHookContext,
    error: Error
  ) => Promise<GenerationHookResult | void>;
}
export interface GenerationBridgeConfig {
  /** Generation service implementation */
  service?: GenerationService;

  /** Content pool provider */
  pool?: ContentPoolProvider;

  /** World-level overrides */
  worldConfig?: WorldGenerationOverrides;

  /** Player preferences */
  playerPrefs?: PlayerGenerationPrefs;

  /** Custom dynamic strategy evaluators */
  strategyEvaluators?: Record<string, DynamicStrategyEvaluator>;

  /** Default generation timeout (ms) */
  defaultTimeoutMs?: number;

  /** Enable debug logging */
  debug?: boolean;
}

// =============================================================================
// Block System Types
// =============================================================================

// =============================================================================
// Backend Enum Reference Types
// =============================================================================
// These reference canonical enums defined in:
// - pixsim7/backend/main/domain/narrative/action_blocks/types_v2.py

/**
 * Camera movement type from backend CameraMovementType enum.
 * Values: 'static', 'rotation', 'dolly', 'tracking', 'handheld'
 * @see types_v2.py CameraMovementType
 */
export type CameraMovementType = string;

/**
 * Camera speed from backend CameraSpeed enum.
 * Values: 'slow', 'medium', 'fast'
 * @see types_v2.py CameraSpeed
 */
export type CameraSpeed = string;

/**
 * Camera path from backend CameraPath enum.
 * Values: 'circular', 'arc', 'linear'
 * @see types_v2.py CameraPath
 */
export type CameraPath = string;

/**
 * Content rating from backend ContentRating enum.
 * Values: 'general', 'suggestive', 'intimate', 'explicit'
 * @see types_v2.py ContentRating
 */
export type ContentRating = string;

/**
 * Intensity pattern from backend IntensityPattern enum.
 * Values: 'steady', 'building', 'pulsing', 'declining'
 * @see types_v2.py IntensityPattern
 */
export type IntensityPattern = string;

/**
 * Block kind - structural distinction between single-state and transition blocks.
 * This is a structural type (system behavior), not semantic content.
 */
export type BlockKind = 'single_state' | 'transition';

/**
 * Camera movement specification matching backend CameraMovement model.
 * @see types_v2.py CameraMovement
 */
export interface CameraMovement {
  type: CameraMovementType;
  speed?: CameraSpeed;
  path?: CameraPath;
  focus?: string;
}

/**
 * Consistency flags matching backend ConsistencyFlags model.
 * @see types_v2.py ConsistencyFlags
 */
export interface ConsistencyFlags {
  maintainPose?: boolean;
  preserveLighting?: boolean;
  preserveClothing?: boolean;
  preservePosition?: boolean;
}

/**
 * Resolved action block sequence from the backend.
 * This is the output of the ActionBlockResolver.
 */
export interface ResolvedBlockSequence {
  /** Individual block data */
  blocks: Array<{
    blockId: string;
    kind: BlockKind;
    prompt: string;
    durationSec: number;
    tags?: string[];
    camera?: CameraMovement;
    consistency?: ConsistencyFlags;
  }>;

  /** Combined prompts ready for generation */
  prompts: string[];

  /** Generation segments (one per block) */
  segments: Array<{
    blockId: string;
    duration: number;
    prompt: string;
  }>;

  /** Total duration in seconds */
  totalDuration: number;

  /** Compatibility score (0-1) */
  compatibilityScore: number;

  /** Composition strategy used */
  composition: 'sequential' | 'layered' | 'merged';

  /** Fallback reason if fallback was used */
  fallbackReason?: string;
}

/**
 * Block resolver service interface.
 * Implement this to connect to the backend ActionBlockResolver.
 *
 * The resolver takes ActionBlockNode data and returns composed prompts
 * from the prompt fragment/block library.
 */
export interface BlockResolverService {
  /**
   * Resolve an ActionBlockNode into block sequence.
   *
   * For mode='direct': Fetches blocks by ID and composes them
   * For mode='query': Queries blocks by criteria (pose, mood, etc.)
   *
   * @param node - ActionBlockNode to resolve
   * @param context - Runtime context (relationships, world state)
   * @returns Resolved block sequence with prompts
   */
  resolve(
    node: ActionBlockNode,
    context: {
      npcId: number;
      session: GameSessionDTO;
      socialContext?: GenerationSocialContext;
    }
  ): Promise<ResolvedBlockSequence>;

  /**
   * Get a specific block by ID.
   *
   * @param blockId - Block identifier
   * @returns Block data or undefined
   */
  getBlock(blockId: string): Promise<ResolvedBlockSequence['blocks'][0] | undefined>;

  /**
   * Query blocks by criteria.
   *
   * @param criteria - Selection criteria
   * @param limit - Maximum results
   * @returns Matching blocks
   */
  queryBlocks(
    criteria: PoolSelectionCriteria,
    limit?: number
  ): Promise<ResolvedBlockSequence['blocks']>;
}

/**
 * Extended generation bridge config with block resolver.
 */
export interface GenerationBridgeWithBlocksConfig extends GenerationBridgeConfig {
  /** Block resolver service for prompt fragments */
  blockResolver?: BlockResolverService;
}

/**
 * Create executor hooks that integrate block resolution with generation.
 *
 * This is the key integration point:
 * 1. ActionBlockNode is encountered in narrative
 * 2. Hook intercepts via afterNodeExecute
 * 3. BlockResolver composes prompts from fragments
 * 4. Prompts are sent to GenerationService
 *
 * @example
 * ```ts
 * const hooks = createBlockGenerationHooks({
 *   blockResolver: myBlockResolver,
 *   generationService: myGenerationService,
 *   pool: myContentPool,
 * });
 *
 * executor.addHooks(hooks);
 * ```

// =============================================================================
// Fusion System Types
// =============================================================================

// =============================================================================
// Image Pool System for Fusion Generation
// =============================================================================

/**
 * Image variation categories for pool organization.
 */
export type ImageVariationCategory =
  | 'character_pose'      // Character in different poses (sitting, standing, etc.)
  | 'character_expression' // Same pose, different expressions
  | 'character_angle'      // Same pose, different camera angles
  | 'environment'          // Environment/background variations
  | 'prop'                 // Props and objects (bench, table, etc.)
  | 'composite';           // Pre-composed character + environment

// =============================================================================
// Ontology Reference Types
// =============================================================================
// These types reference the canonical ontology defined in:
// - pixsim7/backend/main/shared/ontology.yaml
// - pixsim7/backend/main/domain/narrative/action_blocks/pose_taxonomy.py
// - pixsim7/backend/main/domain/npc_surfaces/core_surfaces.py
//
// Instead of hardcoding values, implementations should load these from the
// backend ontology service or use OntologyProvider interface.

/**
 * Pose ID from PoseTaxonomy.
 * Examples: 'standing_neutral', 'sitting_close', 'lying_embrace'
 * @see pose_taxonomy.py for full list
 */
export type PoseId = string;

/**
 * Pose category from PoseTaxonomy.
 * Values loaded from backend pose_taxonomy.py, not hardcoded here.
 * Common categories: 'standing', 'sitting', 'lying', 'kneeling', 'action'
 * @see pose_taxonomy.py for canonical list
 */
export type PoseCategory = string;

/**
 * Expression/mood ID from NPC surfaces or ontology.
 * Core moods: 'mood_happy', 'mood_sad', 'mood_angry', 'mood_surprised', 'mood_thinking', 'mood_bored'
 * Domain moods: 'mood:confident', 'mood:nervous', 'mood:intimidated', 'mood:eager', 'mood:playful'
 * @see core_surfaces.py, ontology.yaml
 */
export type ExpressionId = string;

/**
 * Camera view ID from ontology.
 * Examples: 'cam:pov', 'cam:from_behind', 'cam:upper_body_focus'
 * @see ontology.yaml camera_views
 */
export type CameraViewId = string;

/**
 * Camera framing ID from ontology.
 * Examples: 'cam:centered', 'cam:bottom_of_frame', 'cam:entering_frame'
 * @see ontology.yaml camera_framing
 */
export type CameraFramingId = string;

/**
 * NPC surface type ID.
 * Examples: 'portrait', 'dialogue', 'reaction_clip'
 * @see core_surfaces.py
 */
export type SurfaceTypeId = string;

/**
 * Provider interface for loading ontology data.
 * Implement to connect to backend ontology service.
 */
export interface OntologyProvider {
  /** Get all valid pose IDs */
  getPoseIds(): Promise<PoseId[]>;

  /** Get poses by category */
  getPosesByCategory(category: PoseCategory): Promise<PoseId[]>;

  /** Get all valid expression IDs */
  getExpressionIds(): Promise<ExpressionId[]>;

  /** Get all valid camera view IDs */
  getCameraViewIds(): Promise<CameraViewId[]>;

  /** Check if a pose ID is valid */
  isValidPose(poseId: PoseId): Promise<boolean>;

  /** Check if an expression ID is valid */
  isValidExpression(expressionId: ExpressionId): Promise<boolean>;

  /** Get pose definition with metadata */
  getPoseDefinition(poseId: PoseId): Promise<{
    id: PoseId;
    label: string;
    category: PoseCategory;
    intimacyMin?: number;
    parentPose?: PoseId;
    tags?: string[];
  } | undefined>;
}

/**
 * Single image asset in the pool.
 * Uses ontology reference types for pose, expression, and camera fields.
 */
export interface ImagePoolAsset {
  /** Unique asset ID */
  id: string;

  /** URL to the image */
  url: string;

  /** Thumbnail URL (optional) */
  thumbnailUrl?: string;

  /** Image dimensions */
  width?: number;
  height?: number;

  /** Variation category */
  category: ImageVariationCategory;

  /** Associated character ID (e.g., 'npc:alex', 'char:protagonist') */
  characterId?: string;

  /** Associated location ID (e.g., 'loc:city_bench', 'loc:park') */
  locationId?: string;

  /**
   * Pose ID from PoseTaxonomy.
   * @example 'sitting_neutral', 'standing_embrace', 'lying_side'
   * @see PoseTaxonomy in pose_taxonomy.py
   */
  poseId?: PoseId;

  /**
   * Pose category for broader matching.
   * @example 'sitting', 'standing', 'lying'
   */
  poseCategory?: PoseCategory;

  /**
   * Expression/mood ID from NPC surfaces or ontology.
   * @example 'mood_happy', 'mood:confident', 'portrait'
   * @see NpcSurfacePackage in core_surfaces.py
   */
  expressionId?: ExpressionId;

  /**
   * Camera view ID from ontology.
   * @example 'cam:pov', 'cam:from_behind', 'cam:upper_body_focus'
   */
  cameraViewId?: CameraViewId;

  /**
   * Camera framing ID from ontology.
   * @example 'cam:centered', 'cam:bottom_of_frame'
   */
  cameraFramingId?: CameraFramingId;

  /**
   * NPC surface type this asset is suitable for.
   * @example 'portrait', 'dialogue', 'reaction_clip'
   */
  surfaceType?: SurfaceTypeId;

  /** Prop identifier for prop category */
  propId?: string;

  /** Tags for additional filtering (can include ontology IDs) */
  tags?: string[];

  /** Quality score (0-1) */
  quality?: number;

  /**
   * Minimum intimacy level required (from pose taxonomy).
   * 1-10 scale matching PoseDefinition.intimacy_min
   */
  intimacyMin?: number;

  /** Source information */
  source?: {
    type: 'generated' | 'uploaded' | 'extracted';
    generationJobId?: string;
    uploadedAt?: string;
  };

  /** Custom metadata */
  meta?: Record<string, any>;
}

/**
 * Query criteria for image pool.
 * Uses ontology reference types for type-safe filtering.
 */
export interface ImagePoolQuery {
  /** Filter by category */
  category?: ImageVariationCategory | ImageVariationCategory[];

  /** Filter by character */
  characterId?: string;

  /** Filter by location */
  locationId?: string;

  /**
   * Filter by pose ID(s) from PoseTaxonomy.
   * @example 'sitting_close' or ['sitting_neutral', 'sitting_close']
   */
  poseId?: PoseId | PoseId[];

  /**
   * Filter by pose category (broader than specific pose).
   * @example 'sitting' matches all sitting poses
   */
  poseCategory?: PoseCategory;

  /**
   * Filter by expression/mood ID(s).
   * @example 'mood_happy' or ['mood_happy', 'mood:eager']
   */
  expressionId?: ExpressionId | ExpressionId[];

  /**
   * Filter by camera view ID(s).
   * @example 'cam:pov' or ['cam:pov', 'cam:from_behind']
   */
  cameraViewId?: CameraViewId | CameraViewId[];

  /**
   * Filter by camera framing ID.
   */
  cameraFramingId?: CameraFramingId;

  /**
   * Filter by NPC surface type.
   * @example 'portrait' or 'dialogue'
   */
  surfaceType?: SurfaceTypeId;

  /** Filter by prop */
  propId?: string;

  /** Required tags (can include ontology IDs) */
  tags?: string[];

  /** Excluded tags */
  excludeTags?: string[];

  /** Minimum quality */
  minQuality?: number;

  /**
   * Maximum intimacy level to include.
   * Filters out assets with intimacyMin > this value.
   */
  maxIntimacy?: number;

  /** Maximum results */
  limit?: number;

  /** Random selection from matches */
  randomize?: boolean;
}

/**
 * Image pool provider interface.
 * Implement this to provide character/environment image variations.
 */
export interface ImagePoolProvider {
  /**
   * Find images matching query criteria.
   */
  find(query: ImagePoolQuery): Promise<ImagePoolAsset[]>;

  /**
   * Get a specific image by ID.
   */
  get(id: string): Promise<ImagePoolAsset | undefined>;

  /**
   * Get all variations for a character.
   */
  getCharacterVariations(
    characterId: string,
    options?: {
      pose?: string;
      limit?: number;
    }
  ): Promise<ImagePoolAsset[]>;

  /**
   * Get all variations for a location/environment.
   */
  getEnvironmentVariations(
    locationId: string,
    options?: {
      limit?: number;
    }
  ): Promise<ImagePoolAsset[]>;

  /**
   * Get prop variations.
   */
  getPropVariations(
    propId: string,
    options?: {
      limit?: number;
    }
  ): Promise<ImagePoolAsset[]>;

  /**
   * Check if pool has images for given character + pose.
   */
  hasCharacterPose(characterId: string, pose: string): Promise<boolean>;
}

// =============================================================================
// Fusion Asset Resolution
// =============================================================================

/**
 * Dynamic fusion asset slot - reuses existing AssetRequest with role-based composition.
 * Replaces hard-coded character/environment/props fields with a flexible slot system.
 */
export interface FusionAssetSlot {
  /**
   * Slot role/name - fully dynamic!
   * Examples: 'main_character', 'companion', 'environment', 'prop_bench', 'lighting', 'effect_particles'
   */
  role: ImageCompositionRole | string;

  /**
   * Intent hint for how this slot should be applied.
   */
  intent?: 'generate' | 'preserve' | 'modify' | 'add' | 'remove';

  /**
   * Asset request for this slot - reuses existing AssetRequest!
   *
   * Use AssetRequest's built-in fields:
   * - characterId, locationId (for context)
   * - tags (for filtering)
   * - providerParams (for fusion-specific data)
   *
   * Example providerParams for character slot:
   * {
   *   poseId: 'sitting_close',
   *   expressionId: 'mood_happy',
   *   cameraViewId: 'cam:front',
   *   surfaceType: 'dialogue',
   *   maxIntimacy: 5
   * }
   */
  request: AssetRequest;

  /**
   * Priority for conflict resolution (higher = more important)
   * Used when multiple slots compete for resources or influence composition
   */
  priority?: number;

  /**
   * Whether this slot is optional (can be omitted if asset not found)
   */
  optional?: boolean;

  /**
   * Layer index for composition (0 = background, higher = foreground)
   * If not specified, inferred from role name or priority
   */
  layer?: number;
}

/**
 * Dynamic fusion request - slot-based composition using AssetRequest.
 * Fully extensible - add any asset slots you need without code changes.
 *
 * @example
 * ```typescript
 * const request: FusionAssetRequest = {
 *   slots: [
 *     {
 *       role: 'environment',
 *       request: {
 *         locationId: 'loc:park_bench',
 *         tags: ['outdoor', 'daytime']
 *       },
 *       layer: 0
 *     },
 *     {
 *       role: 'main_character',
 *       request: {
 *         characterId: 'npc:alex',
 *         providerParams: {
 *           poseId: 'sitting_close',
 *           expressionId: 'mood_happy'
 *         }
 *       },
 *       layer: 1,
 *       priority: 10
 *     },
 *     {
 *       role: 'lighting_effect',
 *       request: { providerParams: { effect: 'golden_hour' } },
 *       optional: true
 *     }
 *   ],
 *   strategy: 'best_match',
 *   assetOrder: ['environment', 'main_character', 'lighting_effect']
 * };
 * ```
 */
export interface FusionAssetRequest {
  /**
   * Asset slots - FULLY DYNAMIC!
   * Define any slots you need: characters, environments, props, lighting, effects, overlays, etc.
   */
  slots: FusionAssetSlot[];

  /** Selection strategy for resolving each slot */
  strategy?: 'best_match' | 'random' | 'weighted_random';

  /** Fallback behavior if exact match not found */
  fallback?: 'similar' | 'any' | 'none';

  /**
   * Asset ordering for fusion (order in composition_assets array sent to backend).
   * If not specified, uses layer values from slots, then priority, then insertion order.
   * Example: ['environment', 'prop_bench', 'main_character']
   */
  assetOrder?: string[];

  /**
   * Use parent poses/categories as fallback hierarchy.
   * If true and specific pose not found, tries broader categories.
   * Example: 'sitting_close' → 'sitting_neutral' → 'sitting'
   */
  useFallbackHierarchy?: boolean;
}

/**
 * Resolved fusion assets - slot-based result matching the dynamic request structure.
 */
export interface ResolvedFusionAssets {
  /**
   * Resolved assets per slot - DYNAMIC!
   * Maps role name → resolved asset(s)
   */
  slots: Record<string, {
    /** Role name from the request */
    role: string;
    /** Resolved asset (or assets if multiple were requested) */
    assets: Asset[];
    /** Whether exact match was found (vs fallback) */
    exactMatch: boolean;
    /** Fallback info if used */
    fallbackInfo?: {
      reason: string;
      originalRequest: AssetRequest;
    };
  }>;

  /** Composition assets in layer order (for backend composition_assets param) */
  compositionAssets: CompositionAsset[];

  /** Overall resolution metadata */
  metadata: {
    /** Total number of slots resolved */
    totalSlots: number;
    /** Number of exact matches */
    exactMatches: number;
    /** Number of fallback matches */
    fallbackMatches: number;
    /** Number of failed/missing slots */
    missingSlots: number;
    /** List of roles that failed to resolve (and weren't optional) */
    failedRoles: string[];
  };
}

/**
 * Fusion asset resolver service.
 * Bridges narrative action blocks with image pools for fusion generation.
 */
export interface FusionAssetResolver {
  /**
   * Resolve fusion assets from a request.
   */
  resolve(request: FusionAssetRequest): Promise<ResolvedFusionAssets>;

  /**
   * Resolve fusion assets from an ActionBlockNode.
   * Extracts character/location from node query and resolves images.
   */
  resolveFromActionBlock(
    node: ActionBlockNode,
    context: {
      npcId: number;
      session: GameSessionDTO;
    }
  ): Promise<ResolvedFusionAssets>;
}

/**
 * Extended generation config for fusion operations.
 */
export interface FusionGenerationConfig extends NarrativeGenerationConfig {
  /** Use fusion generation (multi-image input) */
  useFusion?: boolean;

  fusionRequest?: FusionAssetRequest;

  /** Whether to cache fusion results */
  cacheFusionResult?: boolean;
}
