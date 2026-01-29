/**
 * GenerationBridge - Main orchestrator for content generation
 *
 * Handles strategy resolution, pool lookups, and generation requests.
 * Bridges the narrative executor with the video generation system.
 */

import type {
  NarrativeGenerationStrategy,
  GenerationHooks,
  GenerationHookContext,
  GenerationHookResult,
  GenerationBridgeConfig,
  WorldGenerationOverrides,
  PlayerGenerationPrefs,
  DynamicStrategyEvaluator,
  GenerationService,
  ContentPoolProvider,
  NarrativeGenerationConfig,
} from './types';

import type {
  GenerateContentRequest,
  GenerationStrategy,
  ActionBlockNode,
} from '@pixsim7/shared.types';

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
  private debug: boolean;

  constructor(config: GenerationBridgeConfig = {}) {
    this.service = config.service;
    this.pool = config.pool;
    this.worldConfig = config.worldConfig || {};
    this.playerPrefs = config.playerPrefs || {};
    this.strategyEvaluators = new Map(Object.entries(config.strategyEvaluators || {}));
    this.defaultTimeoutMs = config.defaultTimeoutMs || 30000;
    this.debug = config.debug ?? false;
  }

  /**
   * Log with structured context.
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, unknown>
  ): void {
    if (!this.debug && level === 'debug') return;

    const prefix = `[GenerationBridge]`;
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';

    switch (level) {
      case 'debug':
        console.debug(`${prefix} ${message}${contextStr}`);
        break;
      case 'info':
        console.info(`${prefix} ${message}${contextStr}`);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}${contextStr}`);
        break;
      case 'error':
        console.error(`${prefix} ${message}${contextStr}`);
        break;
    }
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
                  metadata: { placeholder: true } as any,
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
    const startTime = Date.now();

    // Log context for diagnostics
    this.log('debug', 'Resolving content', {
      programId: context.state.activeProgramId,
      npcId: context.npcId,
      nodeId: context.node.id,
      nodeType: context.node.type,
      strategy,
    });

    let result: GenerationHookResult;

    switch (strategy) {
      case 'pool_only':
        result = await this.resolveFromPool(context);
        break;

      case 'generate_new':
        result = await this.resolveFromGeneration(context);
        break;

      case 'pool_fallback':
        const poolResult = await this.resolveFromPool(context);
        if (poolResult.content) {
          result = poolResult;
        } else {
          this.log('debug', 'Pool miss, falling back to generation', {
            programId: context.state.activeProgramId,
            npcId: context.npcId,
          });
          result = await this.resolveFromGeneration(context);
        }
        break;

      case 'generate_fallback':
        try {
          const genResult = await this.resolveFromGeneration(context);
          if (genResult.content) {
            result = genResult;
          } else {
            throw new Error('Generation returned no content');
          }
        } catch (e) {
          this.log('debug', 'Generation failed, falling back to pool', {
            programId: context.state.activeProgramId,
            error: (e as Error).message,
          });
          result = await this.resolveFromPool(context);
        }
        break;

      // Explicit workflow strategies
      case 'extend_video':
        result = await this.resolveFromExplicitStrategy(context, 'extend_video');
        break;

      case 'regen_simple':
        result = await this.resolveFromExplicitStrategy(context, 'regen_simple');
        break;

      case 'regen_with_context':
        result = await this.resolveFromExplicitStrategy(context, 'regen_with_context');
        break;

      case 'refine_result':
        result = await this.resolveFromExplicitStrategy(context, 'refine_result');
        break;

      default:
        // Default to pool_fallback
        const defaultPool = await this.resolveFromPool(context);
        if (defaultPool.content) {
          result = defaultPool;
        } else {
          result = await this.resolveFromGeneration(context);
        }
    }

    // Log outcome
    const durationMs = Date.now() - startTime;
    if (result.content) {
      this.log('debug', 'Content resolved', {
        programId: context.state.activeProgramId,
        npcId: context.npcId,
        strategy,
        durationMs,
        contentType: (result.content as any).type,
      });
    } else if (result.error) {
      this.log('warn', 'Content resolution failed', {
        programId: context.state.activeProgramId,
        npcId: context.npcId,
        strategy,
        durationMs,
        error: result.error,
      });
    }

    return result;
  }

  /**
   * Resolve content using explicit workflow strategies.
   * These strategies map directly to specific GenerationService methods.
   */
  private async resolveFromExplicitStrategy(
    context: GenerationHookContext,
    explicitStrategy: 'extend_video' | 'regen_simple' | 'regen_with_context' | 'refine_result'
  ): Promise<GenerationHookResult> {
    if (!this.service) {
      return { error: 'No generation service configured for explicit strategy' };
    }

    const available = await this.service.isAvailable();
    if (!available) {
      this.log('warn', 'Generation service unavailable for explicit strategy', {
        strategy: explicitStrategy,
        programId: context.state.activeProgramId,
      });
      return { error: 'Generation service unavailable' };
    }

    // Build request with explicit workflow type
    const request = this.buildGenerationRequest(context);

    // Set workflow-specific parameters
    (request as any).workflow = explicitStrategy;

    // Workflow-specific configuration
    switch (explicitStrategy) {
      case 'extend_video':
        // Extend existing content - requires previous content reference
        (request as any).extendFrom = (context.generationConfig.generationParams as any)?.previousContentId;
        (request as any).extensionDuration = (context.generationConfig.generationParams as any)?.extensionDuration || 5;
        break;

      case 'regen_simple':
        // Simple regeneration - minimal context
        (request as any).preserveContext = false;
        (request as any).lightweight = true;
        break;

      case 'regen_with_context':
        // Full context regeneration
        (request as any).preserveContext = true;
        (request as any).narrativeHistory = context.state.history?.slice(-5);
        break;

      case 'refine_result':
        // Refine previous output
        (request as any).refineFrom = (context.generationConfig.generationParams as any)?.previousContentId;
        (request as any).refinementInstructions = (context.generationConfig.generationParams as any)?.refinementInstructions;
        break;
    }

    this.log('debug', 'Executing explicit strategy', {
      strategy: explicitStrategy,
      programId: context.state.activeProgramId,
      npcId: context.npcId,
    });

    try {
      const response = await this.service.generate(request);

      if (response.status === 'complete' && response.content) {
        return { content: response.content, handled: true };
      }

      if (response.status === 'queued' || response.status === 'processing') {
        return { jobId: response.job_id, handled: false };
      }

      return { error: response.error?.message || `${explicitStrategy} failed` };
    } catch (e) {
      const err = e as Error;
      this.log('error', 'Explicit strategy failed', {
        strategy: explicitStrategy,
        error: err.message,
      });
      return { error: err.message };
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
          mood: actionBlock.query.intimacy_level,
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
      type: 'text_to_video',
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
