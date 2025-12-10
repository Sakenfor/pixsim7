/**
 * Generation Integration for Narrative Runtime
 *
 * Bridges the narrative executor with the video generation system.
 * Enables data-driven generation decisions from nodes and edges.
 *
 * Key concepts:
 * - GenerationService: Abstract interface for generation backends
 * - ContentPool: Cached/pre-generated content lookup
 * - GenerationStrategy: Determines when to generate vs use pool
 * - ExecutorHooks: Lifecycle callbacks for generation events
 *
 * The integration is fully data-driven:
 * - Nodes define generation strategy and pool fallbacks
 * - Edges can override/modify generation behavior
 * - World config sets defaults, modder/player can adjust
 *
 * @example
 * ```ts
 * // Create a generation bridge
 * const bridge = createGenerationBridge({
 *   service: myGenerationService,
 *   pool: myContentPool,
 *   worldConfig: world.meta.generation,
 * });
 *
 * // Use with executor
 * const executor = new NarrativeExecutor(provider, registry);
 * executor.addHooks(bridge.getHooks());
 * ```
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
} from '@pixsim7/shared.types';

// =============================================================================
// Generation Strategy Types
// =============================================================================

/**
 * Extended generation strategy for narrative nodes.
 * Controls when to generate new content vs use existing pool.
 */
export type NarrativeGenerationStrategy =
  | 'generate_new'      // Always generate fresh content
  | 'pool_only'         // Only use pre-generated pool content
  | 'pool_fallback'     // Try pool first, generate if not found
  | 'generate_fallback' // Generate first, fallback to pool on error
  | 'dynamic';          // Evaluate at runtime based on conditions

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

// =============================================================================
// Generation Bridge
// =============================================================================

/**
 * Configuration for GenerationBridge.
 */
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
}

/**
 * Bridge between narrative executor and generation system.
 * Handles strategy resolution, pool lookups, and generation requests.
 */
export class GenerationBridge {
  private service?: GenerationService;
  private pool?: ContentPoolProvider;
  private worldConfig: WorldGenerationOverrides;
  private playerPrefs: PlayerGenerationPrefs;
  private strategyEvaluators: Map<string, DynamicStrategyEvaluator>;
  private defaultTimeoutMs: number;

  constructor(config: GenerationBridgeConfig = {}) {
    this.service = config.service;
    this.pool = config.pool;
    this.worldConfig = config.worldConfig || {};
    this.playerPrefs = config.playerPrefs || {};
    this.strategyEvaluators = new Map(Object.entries(config.strategyEvaluators || {}));
    this.defaultTimeoutMs = config.defaultTimeoutMs || 30000;
  }

  /**
   * Update world configuration.
   */
  setWorldConfig(config: WorldGenerationOverrides): void {
    this.worldConfig = config;
  }

  /**
   * Update player preferences.
   */
  setPlayerPrefs(prefs: PlayerGenerationPrefs): void {
    this.playerPrefs = prefs;
  }

  /**
   * Register a custom strategy evaluator.
   */
  registerStrategyEvaluator(name: string, evaluator: DynamicStrategyEvaluator): void {
    this.strategyEvaluators.set(name, evaluator);
  }

  /**
   * Get hooks for executor integration.
   */
  getHooks(): GenerationHooks {
    return {
      beforeGeneration: async (context) => {
        // Check if generation is disabled
        if (this.worldConfig.generationDisabled) {
          return { handled: true, error: 'Generation disabled' };
        }
        return undefined;
      },

      resolveContent: async (context) => {
        return this.resolveContent(context);
      },

      onGenerationError: async (context, error) => {
        console.error('[GenerationBridge] Generation error:', error.message);

        // Try fallback
        const fallback = context.generationConfig.fallback;
        if (fallback) {
          switch (fallback.mode) {
            case 'default_content':
              if (fallback.defaultContentId && this.pool) {
                const content = await this.pool.get(fallback.defaultContentId);
                if (content) {
                  return { content, handled: true };
                }
              }
              break;

            case 'skip':
              return { handled: true };

            case 'placeholder':
              return {
                content: {
                  type: 'video',
                  url: '',
                  metadata: { placeholder: true },
                },
                handled: true,
              };
          }
        }

        return { error: error.message };
      },
    };
  }

  /**
   * Resolve content based on strategy.
   */
  async resolveContent(context: GenerationHookContext): Promise<GenerationHookResult> {
    const config = context.generationConfig;
    const strategy = this.resolveStrategy(config, context);

    switch (strategy) {
      case 'pool_only':
        return this.resolveFromPool(context);

      case 'generate_new':
        return this.resolveFromGeneration(context);

      case 'pool_fallback':
        const poolResult = await this.resolveFromPool(context);
        if (poolResult.content) {
          return poolResult;
        }
        return this.resolveFromGeneration(context);

      case 'generate_fallback':
        try {
          const genResult = await this.resolveFromGeneration(context);
          if (genResult.content) {
            return genResult;
          }
        } catch (e) {
          // Fall through to pool
        }
        return this.resolveFromPool(context);

      default:
        // Default to pool_fallback
        const defaultPool = await this.resolveFromPool(context);
        if (defaultPool.content) {
          return defaultPool;
        }
        return this.resolveFromGeneration(context);
    }
  }

  /**
   * Resolve actual strategy from config and context.
   */
  private resolveStrategy(
    config: NarrativeGenerationConfig,
    context: GenerationHookContext
  ): NarrativeGenerationStrategy {
    // World-level force
    if (this.worldConfig.forcePoolOnly) {
      return 'pool_only';
    }

    // Player preference
    if (this.playerPrefs.preferPool) {
      return 'pool_fallback';
    }

    // Dynamic strategy
    if (config.strategy === 'dynamic') {
      if (config.dynamicCondition) {
        // Could integrate with condition evaluator here
        // For now, use registered evaluator if present
        const evaluator = this.strategyEvaluators.get(config.dynamicCondition);
        if (evaluator) {
          return evaluator({
            session: context.session,
            npcId: context.npcId,
            variables: context.state.variables,
            worldConfig: this.worldConfig,
            playerPrefs: this.playerPrefs,
          });
        }
      }
      // Default dynamic behavior
      return 'pool_fallback';
    }

    return config.strategy;
  }

  /**
   * Resolve content from pool.
   */
  private async resolveFromPool(context: GenerationHookContext): Promise<GenerationHookResult> {
    if (!this.pool) {
      return { error: 'No pool provider configured' };
    }

    const criteria = context.generationConfig.poolCriteria || {};

    // Extract criteria from ActionBlockNode if applicable
    if (context.node.type === 'action_block') {
      const actionBlock = context.node as ActionBlockNode;
      if (actionBlock.query) {
        Object.assign(criteria, {
          location: actionBlock.query.location,
          pose: actionBlock.query.pose,
          intimacyLevel: actionBlock.query.intimacy_level,
          mood: actionBlock.query.mood,
          tags: actionBlock.query.requiredTags,
          excludeTags: actionBlock.query.excludeTags,
          maxDuration: actionBlock.query.maxDuration,
        });
      }
    }

    const results = await this.pool.find(criteria, 1);
    if (results.length > 0) {
      return { content: results[0], handled: true };
    }

    return { error: 'No matching content in pool' };
  }

  /**
   * Resolve content from generation service.
   */
  private async resolveFromGeneration(context: GenerationHookContext): Promise<GenerationHookResult> {
    if (!this.service) {
      return { error: 'No generation service configured' };
    }

    const available = await this.service.isAvailable();
    if (!available) {
      return { error: 'Generation service unavailable' };
    }

    // Build generation request
    const request = this.buildGenerationRequest(context);

    try {
      const response = await this.service.generate(request);

      if (response.status === 'complete' && response.content) {
        return { content: response.content, handled: true };
      }

      if (response.status === 'queued' || response.status === 'processing') {
        return { jobId: response.job_id, handled: false };
      }

      return { error: response.error?.message || 'Generation failed' };
    } catch (e) {
      const err = e as Error;
      return { error: err.message };
    }
  }

  /**
   * Build generation request from context.
   */
  private buildGenerationRequest(context: GenerationHookContext): GenerateContentRequest {
    const config = context.generationConfig;
    const node = context.node as ActionBlockNode;

    // Start with defaults from world config
    const request: GenerateContentRequest = {
      type: 'transition',
      strategy: this.mapStrategy(config.strategy),
      social_context: context.socialContext,
    };

    // Apply world defaults
    if (this.worldConfig.defaultStyle) {
      request.style = this.worldConfig.defaultStyle;
    }
    if (this.worldConfig.defaultConstraints) {
      request.constraints = this.worldConfig.defaultConstraints;
    }

    // Apply node-specific params
    if (node.generationConfig) {
      if (node.generationConfig.provider) {
        // Provider hint (backend resolves)
      }
      if (node.generationConfig.socialContext) {
        request.social_context = {
          ...request.social_context,
          ...node.generationConfig.socialContext,
        };
      }
    }

    // Apply config overrides
    if (config.generationParams) {
      Object.assign(request, config.generationParams);
    }

    // Apply player quality preference
    if (this.playerPrefs.qualityLevel) {
      // Map to generation params (implementation-specific)
    }

    return request;
  }

  /**
   * Map narrative strategy to generation strategy.
   */
  private mapStrategy(strategy: NarrativeGenerationStrategy): GenerationStrategy {
    switch (strategy) {
      case 'generate_new':
        return 'always';
      case 'pool_only':
        return 'once'; // Pool content is generated once
      default:
        return 'per_playthrough';
    }
  }
}

/**
 * Create a generation bridge with default configuration.
 */
export function createGenerationBridge(config?: GenerationBridgeConfig): GenerationBridge {
  return new GenerationBridge(config);
}

// =============================================================================
// Node Config Extraction
// =============================================================================

/**
 * Extract generation config from a node.
 * Merges node config with world defaults.
 */
export function extractGenerationConfig(
  node: NarrativeNode,
  worldConfig?: WorldGenerationOverrides
): NarrativeGenerationConfig | undefined {
  if (node.type !== 'action_block') {
    return undefined;
  }

  const actionBlock = node as ActionBlockNode;
  const nodeType = actionBlock.type;

  // Start with defaults
  let config: NarrativeGenerationConfig = {
    strategy: worldConfig?.defaultStrategy || 'pool_fallback',
    modderOverridable: true,
    playerAdjustable: true,
  };

  // Apply node type overrides from world config
  if (worldConfig?.nodeTypeOverrides?.[nodeType]) {
    config = { ...config, ...worldConfig.nodeTypeOverrides[nodeType] };
  }

  // Extract from node's generationConfig if present
  if (actionBlock.generationConfig) {
    // The ActionBlockNode has a generationConfig field
    // We can extend it to include our NarrativeGenerationConfig
    const nodeGenConfig = (actionBlock as any).narrativeGeneration as NarrativeGenerationConfig | undefined;
    if (nodeGenConfig) {
      config = { ...config, ...nodeGenConfig };
    }
  }

  return config;
}

/**
 * Build social context from session state.
 */
export function buildSocialContext(
  session: GameSessionDTO,
  npcId: number,
  worldMaxRating?: 'sfw' | 'romantic' | 'mature_implied' | 'restricted'
): GenerationSocialContext {
  // Access NPC relationship state from session
  const npcKey = `npc:${npcId}`;
  const flags = session.flags as Record<string, any>;
  const npcData = flags.npcs?.[npcKey];
  const relationship = npcData?.relationship;

  return {
    npcIds: [npcId],
    worldMaxRating,
    relationshipValues: relationship ? {
      affinity: relationship.affinity,
      trust: relationship.trust,
      chemistry: relationship.chemistry,
      tension: relationship.tension,
    } : undefined,
    relationshipTierId: relationship?.tierId,
    intimacyLevelId: relationship?.intimacyLevelId,
  };
}

// =============================================================================
// Prompt Fragment / Block System Integration
// =============================================================================

/**
 * Resolved action block sequence from the backend.
 * This is the output of the ActionBlockResolver.
 */
export interface ResolvedBlockSequence {
  /** Individual block data */
  blocks: Array<{
    blockId: string;
    kind: 'single_state' | 'transition';
    prompt: string;
    durationSec: number;
    tags?: string[];
    camera?: {
      type: 'static' | 'rotation' | 'dolly' | 'tracking' | 'handheld';
      speed?: 'slow' | 'medium' | 'fast';
      focus?: string;
    };
    consistency?: {
      maintainPose?: boolean;
      preserveLighting?: boolean;
      preserveClothing?: boolean;
      preservePosition?: boolean;
    };
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
 */
export function createBlockGenerationHooks(config: {
  blockResolver: BlockResolverService;
  generationService?: GenerationService;
  pool?: ContentPoolProvider;
  worldConfig?: WorldGenerationOverrides;
  playerPrefs?: PlayerGenerationPrefs;
}): GenerationHooks {
  const { blockResolver, generationService, pool, worldConfig, playerPrefs } = config;

  return {
    /**
     * After an ActionBlockNode executes, resolve blocks and optionally generate.
     */
    resolveContent: async (context) => {
      if (context.node.type !== 'action_block') {
        return { handled: false };
      }

      const actionBlock = context.node as ActionBlockNode;

      // Resolve blocks into prompts
      const resolved = await blockResolver.resolve(actionBlock, {
        npcId: context.npcId,
        session: context.session,
        socialContext: context.socialContext,
      });

      // Check generation strategy
      const strategy = context.generationConfig.strategy;

      // Pool-only: just return block data (assume pre-generated)
      if (strategy === 'pool_only' && pool) {
        const criteria: PoolSelectionCriteria = {
          tags: resolved.blocks.flatMap(b => b.tags || []),
        };
        const poolResults = await pool.find(criteria, 1);
        if (poolResults.length > 0) {
          return {
            content: poolResults[0],
            handled: true,
          };
        }
      }

      // Generate new content from resolved prompts
      if (generationService && strategy !== 'pool_only') {
        const available = await generationService.isAvailable();
        if (available && resolved.prompts.length > 0) {
          // Build generation request from resolved blocks
          const request: GenerateContentRequest = {
            type: 'transition',
            strategy: 'per_playthrough',
            social_context: context.socialContext,
            duration: {
              target: resolved.totalDuration,
            },
            style: worldConfig?.defaultStyle,
            constraints: worldConfig?.defaultConstraints,
            // Include the composed prompt
            template_id: resolved.blocks[0]?.blockId,
          };

          // If we have player quality preference
          if (playerPrefs?.qualityLevel === 'fast') {
            request.duration = { max: resolved.totalDuration * 0.8 };
          }

          try {
            const response = await generationService.generate(request);
            if (response.status === 'complete' && response.content) {
              return {
                content: response.content,
                handled: true,
              };
            }
            if (response.job_id) {
              return {
                jobId: response.job_id,
                handled: false,
              };
            }
          } catch (e) {
            // Fall through to return block data
          }
        }
      }

      // Return resolved block data for client-side handling
      return {
        content: {
          type: 'video',
          metadata: {
            blocks: resolved.blocks,
            prompts: resolved.prompts,
            totalDuration: resolved.totalDuration,
            composition: resolved.composition,
            needsGeneration: true,
          },
        },
        handled: true,
      };
    },
  };
}
